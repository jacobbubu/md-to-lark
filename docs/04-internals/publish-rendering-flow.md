# 发布与渲染流程

## 这篇文档解决什么问题

这篇文档回答一个问题：从一条 `publish:md` 命令开始，到飞书文档真正被创建、清空、写入、上传媒体，中间到底发生了什么。

如果你要调试“为什么 dry-run 正常但真实发布失败”，或者要改发布顺序和写入策略，先看这篇。

## 一句话结论

这条链路可以概括成：

```text
resolve input
-> preset
-> prepare
-> markdownToHast
-> title policy
-> hastToLAST
-> pipeline transform
-> LAST to BTT
-> patch BTT
-> dry-run or render to Feishu
```

## 编排入口

当前命令入口和执行入口是：

1. `src/commands/publish-md/command.ts`
2. `src/publish/runtime.ts`
3. `src/publish/process-file.ts`
4. `src/publish/stage-cache.ts`

`command.ts` 只保留高层编排，不负责 stage 细节；真正的单文件执行和 artifact 写入已经收进 `src/publish/`。

## 第一步：解析输入集合

命令开始后，先做输入解析。

这一段负责决定：

1. 是单文件模式还是目录模式
2. 最终一共要处理多少个 Markdown 文件
3. `--doc` 是否和输入模式冲突

这一层的问题通常会表现成：

1. 输入文件数不对
2. 目录模式误用了 `--doc`
3. 标题模式和输入模式不匹配

## 第二步：装配运行时配置

运行时构建层会从 `options + env` 里解析出运行参数，例如：

1. 限流间隔
2. 预处理开关
3. 标题日期前缀
4. `yt-dlp` 路径
5. Mermaid 目标模式
6. pipeline cache 根目录

这一步很关键，因为它决定的是“本次运行的真实默认值”，而不是文档里的抽象默认值。

## 第三步：为每个输入建立阶段目录

`process-file.ts` 会为每个 Markdown 文件分配一套独立的 stage cache 路径，而路径计算和文件写入由 `stage-cache.ts` 统一处理。

这一步会先写：

1. `00-source/original.md`

然后随着后续阶段继续补：

1. `preset.md`
2. `prepared.md`
3. `hast.json`
4. `last.json`
5. `btt.json`
6. `result.json`

所以即使是多文件目录模式，排查也始终能落到单文件维度，而且每一类 artifact 都由同一个 stage-cache 层写出。

## 第四步：执行 preset

如果用户传了 `--preset`，命令层会先加载 preset，再对当前 Markdown 执行 transform。

这一步发生得非常早，所以它会影响：

1. 预处理输入
2. 标题推导
3. 后续结构转换

执行完之后，会把结果写到：

1. `00-source/preset.md`

## 第五步：执行预处理

然后单文件执行器调用：

1. `prepareMarkdownBeforePublish`

这一层负责：

1. 下载远程 Markdown 图片
2. 根据 frontmatter 规则做 `yt-dlp` URL 提取
3. 返回结构化下载日志
4. 由 stage-cache 回写 `download.log.json` 和 `prepared.md`

执行完之后，执行器会打印一行 prepare 摘要，并把元数据写进：

1. `01-prepare/result.json`

## 第六步：Markdown 进入结构转换

预处理后的 Markdown 继续进入：

1. `markdownToHast`
2. `applySingleH1TitleRule`
3. `buildTitleForMarkdown`
4. `hastToLAST`

这一步完成后，命令层已经拿到：

1. 最终标题
2. `LAST` 模型

并把 `LAST` 写到：

1. `03-last/last.json`

## 第七步：发布前语义补丁

这一步非常关键，主要在：

1. `src/publish/last-normalize.ts`
2. `src/publish/asset-adapter.ts`
3. `src/publish/btt-patch.ts`

当前会做的事情包括：

1. 给 `LAST` block 补 BTT id
2. 识别独立本地附件与图片
3. 对表格应用列宽启发式
4. 对数字列应用右对齐
5. 收集 Mermaid patch

这里还是在“发布前准备”，还没有真正触发飞书 API。

## 第八步：把 `LAST` 转成 `BTT`

接着命令层会调用：

1. `convertLASTToBTT`

得到 `BTT` 后，再把 Mermaid 和本地资源 patch 真正打到 `BTT` 上。

产物会写到：

1. `04-btt/btt.json`
2. `04-btt/meta.json`

## 第九步：dry-run 分叉

如果命令带了 `--dry-run`，这时就不会继续往飞书 API 写。

dry-run 分支会：

1. 写 `05-publish/result.json`
2. 打印标题、块数、Mermaid patch 数和本地资源数
3. 结束本次输入处理

所以 dry-run 已经共享了绝大多数主流程，只跳过最后的飞书写入。

## 第十步：真实发布前准备文档目标

如果不是 dry-run，就进入真实写入分支。

这里先解决的是“写到哪里”：

1. 如果传了 `--doc`，直接用现有文档
2. 如果没传 `--doc`，先在目标文件夹里查同名文档
3. 如果有同名文档，就复用
4. 如果没有，就创建新文档

然后统一会做：

1. 清空目标文档内容

## 第十一步：真正渲染 `BTT`

真实写入的核心入口是：

1. `renderBTTToDocument`

它负责：

1. 从根节点开始递归渲染
2. 批量创建普通文本块
3. 对表格、board、图片、文件等特殊块走专门路径
4. 收集失败块和媒体 token 映射

这一层不负责“决定应该是什么语义”，只负责“按既定语义写进去”。

## 第十二步：底层飞书操作

更靠近 API 的行为在：

1. `src/lark/docx/ops.ts`

这里封装了：

1. 创建文档
2. 列 block
3. 清空子块
4. 创建 children
5. 表格扩容
6. 上传二进制
7. 替换图片和文件块
8. 创建 board 节点

这一层是供应商边界，不应该塞入太多更高层语义判断。

## 发布失败时会记录什么

真实发布分支无论成功还是失败，都会把结果写进：

1. `05-publish/result.json`

成功时会记录：

1. `documentId`
2. `rootBlockId`
3. `mediaTokenMappings`
4. `retryLogs`

失败时还会额外记录：

1. `error`
2. `failedBlocks`

所以发布排障时，不要只看控制台，要优先看这个文件。

## 为什么 dry-run 和真实发布差异小很重要

当前架构刻意让 dry-run 和真实发布共享大部分主链路。

这样做的价值是：

1. dry-run 能尽早暴露输入和结构问题
2. 真实发布失败时，通常可以用同一输入先复现到 dry-run
3. 大多数排障不需要一开始就打飞书 API

## 发生问题时怎么定位

如果问题表现为：

1. 标题不对
   看标题策略和 `03-last/last.json`
2. 资源 patch 不对
   看 `04-btt/btt.json`
3. dry-run 正常，真实发布失败
   看 `05-publish/result.json`、`render-btt.ts`、`render-post-process.ts`、`ops.ts`
4. 创建文档或清空文档异常
   看 `ops.ts`
5. 某一类块写入失败
   先看 `failedBlocks`，再回到对应 patch 或 render 分支

## 源码入口

最值得顺着读的是：

1. `src/commands/publish-md/command.ts`
2. `src/publish/runtime.ts`
3. `src/publish/process-file.ts`
4. `src/publish/last-normalize.ts`
5. `src/interop/last-to-btt.ts`
6. `src/lark/docx/render-payload.ts`
7. `src/lark/docx/render-btt.ts`
8. `src/lark/docx/render-post-process.ts`
9. `src/lark/docx/ops.ts`

## 下一步阅读

理解了真实发布链路后，下一步通常看：

1. `docs/04-internals/testing-and-debugging.md`
2. `docs/04-internals/last-btt-lark-models.md`
3. `docs/02-guides/pipeline-cache-and-dry-run.md`
