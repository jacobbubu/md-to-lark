# 测试与调试入口

## 这篇文档解决什么问题

这篇文档回答一个问题：当你修改这套工具时，应该先跑哪些检查、从哪些调试入口开始，以及不同类型的问题最适合用什么手段定位。

如果你已经开始动代码，或者要确认一处行为变更有没有带回归，先看这篇。

## 一句话结论

当前最有效的调试顺序通常是：

1. 先跑 `npm run check`
2. 再跑 `npm test`
3. 再用 `--dry-run` 看阶段产物
4. 必要时再打真实飞书 API

如果问题集中在 `LAST` 结构化编辑，再用 playground。

## 基础命令

最常用的几个命令是：

```bash
npm run check
npm test
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run
npm run dev:playground
npm run fetch:board-data -- --doc <document_id> --index 1
```

## 类型检查

```bash
npm run check
```

这个命令适合先拦住：

1. 错误 import
2. 类型签名变化
3. 目录重构后的路径残留

如果你刚移动过文件或改过导出面，先跑它最省时间。

## 自动化测试

```bash
npm test
```

当前测试大致覆盖下面几层：

1. 命令参数和主编排
2. Markdown -> HAST -> LAST
3. 预处理
4. 标题策略
5. 发布前 patch
6. 飞书 docx ops
7. BTT 渲染
8. CLI 行为

如果你只改了一小块逻辑，也建议至少跑全量测试，因为很多行为是跨阶段耦合的。

## 值得优先关注的测试文件

### 主链路

1. `tests/commands.publish-md.command.test.ts`
2. `tests/cli.publish-md-to-lark.test.ts`
3. `tests/cli.dist.publish-md-to-lark.test.ts`

### 解析与中间表示

1. `tests/pipeline.md-hast-last.test.ts`
2. `tests/last.api-basics.test.ts`

### 预处理与 patch

1. `tests/pipeline.prepare-markdown.test.ts`
2. `tests/commands.publish-md.pipeline-transform.test.ts`
3. `tests/commands.publish-md.title-policy.test.ts`
4. `tests/commands.publish-md.preset-loader.test.ts`

### 飞书写入边界

1. `tests/lark.docx.ops.test.ts`
2. `tests/lark.docx.render-btt.test.ts`

## dry-run 是最重要的调试入口

对这套工具来说，dry-run 不是“展示模式”，而是主调试入口。

推荐命令：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run
```

它适合定位：

1. preset 是否改错了输入
2. 预处理是否改对了内容
3. 标题是否按预期推导
4. `LAST`、`BTT` 是否符合预期
5. Mermaid、表格和本地资源 patch 是否生效

## 阶段产物怎么用

dry-run 后，优先看：

1. `00-source`
2. `01-prepare`
3. `03-last`
4. `04-btt`
5. `05-publish`

排查时一个简单顺序是：

1. `05-publish/result.json`
2. `01-prepare/prepared.md`
3. `03-last/last.json`
4. `04-btt/btt.json`

不要一上来就盯着飞书 API 报错，先确认内部阶段是不是已经偏了。

## `LAST` 相关调试

如果你改的是：

1. 结构化编辑
2. selector
3. 查找替换
4. Markdown roundtrip

那除了测试，还建议用 playground：

```bash
npm run dev:playground
```

当前 playground 主要围绕：

1. Markdown -> LAST
2. `createLASTApi`
3. 变更计划
4. commit 后回写 Markdown

它更适合调“语义和结构操作”，而不是飞书发布。

## 飞书写入问题怎么调

如果 dry-run 正常，但真实发布异常，优先看：

1. `05-publish/result.json`
2. `failedBlocks`
3. `retryLogs`
4. `mediaTokenMappings`

然后根据问题类型回到：

1. `src/lark/docx/render-btt.ts`
2. `src/lark/docx/ops.ts`

## board 相关调试

如果你用的是 Mermaid `board` 模式，或者要检查已有文档里的白板块，可以用：

```bash
npm run fetch:board-data -- --doc <document_id> --index 1
```

这个脚本会：

1. 找到文档里的第 N 个 board block
2. 解析 whiteboard id
3. 拉取 theme 和 whiteboard nodes
4. 输出 JSON

它适合调：

1. board block 是否真的创建了
2. 白板节点是不是按预期落下去了

## 什么时候应该先看哪类入口

如果你遇到的是：

1. 参数或模式问题
   先看 CLI 测试和 command 测试
2. 结构转换问题
   先看 pipeline 测试和 dry-run 产物
3. 结构化编辑问题
   先看 LAST API 测试和 playground
4. 飞书写入问题
   先看 render/ops 测试，再看真实发布结果

## 一条实用的最小排查路径

当你刚改完一段代码，不确定哪里会炸，最省时间的顺序通常是：

1. `npm run check`
2. `npm test`
3. `npm run publish:md -- --input ./test-md/comp/comp.md --dry-run`
4. 如果问题只在真实写入时出现，再跑一次真实发布

## 相关文档

调试最常配合下面几篇一起看：

1. `docs/04-internals/publish-rendering-flow.md`
2. `docs/04-internals/markdown-to-last.md`
3. `docs/02-guides/pipeline-cache-and-dry-run.md`
