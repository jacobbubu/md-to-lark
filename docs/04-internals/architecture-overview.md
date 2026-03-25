# 架构总览

## 这篇文档解决什么问题

这篇文档回答一个问题：`md-to-lark` 这套工具内部是如何分层的，主调用链从哪里开始，到哪里结束。

如果你需要调试、扩展、做二次集成，或者只是想知道“某个行为应该去哪个目录找”，先看这篇。

## 一句话结论

当前主结构可以概括成这条线：

```text
CLI -> commands -> pipeline -> LAST -> interop/BTT -> lark/docx -> shared
```

它的核心思想不是“直接把 Markdown 渲染成飞书”，而是先做分阶段转换，再在最后一段把结果写进飞书。

## 总体调用链

从主命令看，调用链大致是：

1. CLI 入口接收参数和环境变量
2. 发布命令层做编排
3. Markdown 进入解析与预处理链路
4. 通用结构被转成内部语义模型 `LAST`
5. `LAST` 再转成更接近飞书块树的 `BTT`
6. 发布期补丁处理 Mermaid、表格和本地资源
7. 飞书 Docx 适配层真正调用 API 创建块、上传媒体、替换 token

可以把它理解成一条“文档编译 + 发布”流水线。

## 模块边界

### `src/cli/`

这里只放命令行入口。

当前主入口是：

1. `src/cli/publish-md-to-lark.ts`

它的职责很薄，主要是：

1. 加载环境变量
2. 调用发布命令
3. 处理错误和 usage 输出

### `src/commands/publish-md/`

这是“发布 Markdown 到飞书”这个用例的编排层。

当前最重要的文件是：

1. `src/commands/publish-md/command.ts`
2. `src/commands/publish-md/args.ts`
3. `src/commands/publish-md/input-resolver.ts`
4. `src/commands/publish-md/title-policy.ts`
5. `src/commands/publish-md/pipeline-transform.ts`
6. `src/commands/publish-md/preset-loader.ts`

这一层负责：

1. 解析输入集合
2. 决定标题策略
3. 装配 pipeline cache 路径
4. 调用 preset、prepare、AST 转换、BTT 转换和最终发布
5. 根据 `dry-run` 与真实发布分叉

### `src/pipeline/`

这是 Markdown 输入处理链。

当前主文件是：

1. `src/pipeline/markdown/md-to-hast.ts`
2. `src/pipeline/markdown/prepare-markdown.ts`
3. `src/pipeline/hast-to-last.ts`

这里负责：

1. 把 Markdown 解析成 HAST
2. 在解析前做远程资源预处理
3. 把 HAST 转成项目内部语义模型 `LAST`

这层仍然是“内容理解与结构转换”，还没有进入飞书 API 语义。

### `src/last/`

这是项目内部最重要的语义层之一。

`LAST` 可以理解成“面向飞书文档语义的中间表示”，它不直接等于 HTML，也不直接等于飞书原始 API payload。

当前这里承载：

1. 类型定义
2. 结构化查询与修改 API
3. 序列化回 Markdown 的能力
4. LAST 终端预览

这一层的价值是把“文档语义”从具体 API 里抽出来，便于后续做修改、补丁和可逆转换。

### `src/interop/`

这是模型之间的转换层。

当前主要负责：

1. `LAST -> BTT`
2. `BTT -> LAST`

它不直接做发布，也不直接做 Markdown 解析，而是专门处理内部模型之间的桥接。

### `src/btt/`

`BTT` 是另一层内部中间表示，位置比 `LAST` 更靠近飞书块树。

你可以把它理解成“带树形结构、又保留原始块数据”的发布前模型。

这一层的主要用途是：

1. 让发布前 patch 更自然
2. 让渲染器更容易按树结构递归写入飞书

### `src/lark/` 与 `src/lark/docx/`

这一层是真正的飞书边界。

主要分成两部分：

1. `src/lark/*.ts`
2. `src/lark/docx/*.ts`

其中：

1. `src/lark/client.ts` 负责环境变量到客户端配置的转换
2. `src/lark/docx/ops.ts` 负责飞书 Docx/Drive 的底层操作
3. `src/lark/docx/render-btt.ts` 负责把 `BTT` 真正渲染到飞书文档

这一层关注的是：

1. 怎么创建和清空文档
2. 怎么批量创建 blocks
3. 怎么上传图片和文件
4. 怎么补表格 cell、patch 文本元素、处理 board block

### `src/shared/`

这一层放跨模块通用基础设施。

当前主要是：

1. `src/shared/rate-limiter.ts`
2. `src/shared/retry.ts`

它们不属于“发布命令专有逻辑”，而是所有飞书请求都可能用到的横切能力。

## 为什么要分成 `LAST` 和 `BTT` 两层

这是当前架构里最关键的设计点之一。

简单理解：

1. `LAST` 更偏“文档语义”
2. `BTT` 更偏“发布树形结构”

这样拆开的好处是：

1. 语义转换和 API 发布不必耦合在一起
2. 表格、Mermaid、附件这类发布期 patch 不必污染更高层语义
3. 以后如果要做双向转换、结构化编辑或增量更新，`LAST` 这层仍然有独立价值

## Mermaid、表格和附件为什么不在最早阶段一次做完

因为这三类能力和“原始 Markdown 语义”并不完全等价。

例如：

1. Mermaid 要根据目标模式决定最终是 `text-drawing` 还是 `board`
2. 表格列宽和数字列对齐更像发布期启发式，而不是原始 Markdown 语义
3. 本地附件既涉及语义替换，也涉及真实发布时的媒体上传

所以当前实现把它们放在 `pipeline-transform` 和 `render-btt` 这两段里处理，而不是强行挤进最前面的 Markdown 解析。

## dry-run 为什么能作为调试主入口

因为当前 dry-run 不是“伪执行”，而是共享主流水线。

它和真实发布共用：

1. 输入解析
2. preset
3. 预处理
4. HAST / LAST / BTT 转换
5. 发布期 patch

真正被跳过的只有飞书写入和媒体上传。

这也是为什么它可以稳定产出 `00-source` 到 `05-publish` 的阶段结果。

## 发生问题时应该去哪里找

如果问题表现为：

1. 参数、输入路径、标题模式不对
   去 `src/commands/publish-md/`
2. 远程资源下载、`yt-dlp`、预处理结果不对
   去 `src/pipeline/markdown/prepare-markdown.ts`
3. Markdown 被解析成了错误结构
   去 `src/pipeline/markdown/md-to-hast.ts` 和 `src/pipeline/hast-to-last.ts`
4. 内部语义结构不符合预期
   去 `src/last/` 和 `src/interop/`
5. Mermaid、附件、表格 patch 不对
   去 `src/commands/publish-md/pipeline-transform.ts`
6. 飞书创建块、上传媒体或替换 token 失败
   去 `src/lark/docx/ops.ts` 和 `src/lark/docx/render-btt.ts`

## 源码入口

第一次读源码，建议按下面顺序：

1. `src/cli/publish-md-to-lark.ts`
2. `src/commands/publish-md/command.ts`
3. `src/pipeline/markdown/md-to-hast.ts`
4. `src/pipeline/hast-to-last.ts`
5. `src/commands/publish-md/pipeline-transform.ts`
6. `src/interop/last-to-btt.ts`
7. `src/lark/docx/render-btt.ts`
8. `src/lark/docx/ops.ts`

## 下一步阅读

和这篇最相关的后续文档通常是：

1. `docs/02-guides/title-and-heading-policy.md`
2. `docs/02-guides/assets-and-attachments.md`
3. `docs/02-guides/mermaid-and-board.md`
