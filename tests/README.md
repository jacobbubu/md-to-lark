# Tests

本目录是 `md-to-lark` 的当前测试体系。其目标是覆盖 CLI 入参、输入分发、pipeline 核心转换、preset、LAST API、Lark 发布链路和共享工具的关键行为。

## 测试文件与分层

`commands.*.test.ts`：命令层（参数解析、输入分辨、标题策略、发布编排、preset 与 pipeline 变换）
- `commands.publish-md.args.test.ts`
- `commands.publish-md.input-resolver.test.ts`
- `commands.publish-md.title-policy.test.ts`
- `commands.publish-md.preset-loader.test.ts`
- `commands.publish-md.pipeline-transform.test.ts`
- `commands.publish-md.command.test.ts`

`pipeline.*.test.ts`：pipeline 与 markdown 转换层
- `pipeline.prepare-markdown.test.ts`
- `pipeline.md-hast-last.test.ts`

`cli.*.test.ts`：CLI 启动与打包输出层
- `cli.publish-md-to-lark.test.ts`
- `cli.dist.publish-md-to-lark.test.ts`

`lark.*.test.ts`：Lark 适配与写入层
- `lark.client-config.test.ts`
- `lark.docx.ops.test.ts`
- `lark.docx.render-btt.test.ts`

`shared.*.test.ts`：共享基础能力
- `shared.retry.test.ts`
- `shared.rate-limiter.test.ts`

模型层测试
- `last.api-basics.test.ts`

## 常用命令

- `npm run check`：类型检查与导出/重构层面的最小安全门控。
- `npm test`：全量测试（`tests/**/*.test.ts`）。
- `npm run test:watch`：监听模式，便于本地迭代。
- `npm run build`：更新 dist（如需覆盖 `cli.dist.*` 场景）。

## Fixture 约定

- 公共 markdown fixture 目前仅有 `tests/fixtures/md/rich-gfm.md`，用于转换链路的确定性回归。
- 默认优先使用内联字符串构造输入；不稳定外部输入应在临时目录（`mkdtemp`）内创建并清理。
- 与发布顺序相关的文件名约定由断言驱动，不要求固定文件名，但推荐语义化文件名（如 `single.md`、`sample.md`）以便定位。

## 故障定位优先级

优先查看主入口：
- 参数或用法异常：`tests/commands.publish-md.args.test.ts`、`tests/cli.publish-md-to-lark.test.ts`
- 输入识别错误（单文件/目录/大小写 `.MD`）：`tests/commands.publish-md.input-resolver.test.ts`
- 标题、preset、预处理行为异常：`tests/commands.publish-md.title-policy.test.ts`、`tests/commands.publish-md.preset-loader.test.ts`、`tests/pipeline.prepare-markdown.test.ts`
- Markdown→HAST→LAST 与 patch 行为异常：`tests/pipeline.md-hast-last.test.ts`、`tests/commands.publish-md.pipeline-transform.test.ts`
- 全链路编排与 dry-run 缓存结构异常：`tests/commands.publish-md.command.test.ts`
- Lark 配置、API 协议、写入行为异常：`tests/lark.client-config.test.ts`、`tests/lark.docx.ops.test.ts`、`tests/lark.docx.render-btt.test.ts`
- 只影响可靠性与限流策略：`tests/shared.retry.test.ts`、`tests/shared.rate-limiter.test.ts`
