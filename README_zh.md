# md-to-lark

[English README](./README.md)

`md-to-lark` 用来把 Markdown（GFM）内容稳定发布到飞书文档。

它不是只做一次性渲染的脚本，而是一条可重复执行的发布链路：输入预处理、标题策略、资源识别与上传、Mermaid、表格增强、dry-run、以及可追溯的阶段产物都在同一条流水线里完成。

## 仓库与包名

- GitHub 仓库：[jacobbubu/md-to-lark](https://github.com/jacobbubu/md-to-lark)
- 当前 npm 包元信息已配置为 `@jacobbubu/md-to-lark`
- 依赖 `@jacobbubu/md-zh-format` 保持不变

说明：

- README 里的命令仍以仓库内开发和验证为主。
- 等正式发布到 npm 之后，再按 `@jacobbubu/md-to-lark` 对外安装。

## 适合什么场景

- 把单个 Markdown 文件发布到飞书文档
- 递归发布一个目录里的多篇 `.md`
- 处理本地资源、远程图片和独立 URL 的发布前预处理
- 在不真正写飞书的情况下先跑一次 dry-run，观察中间产物
- 用一个或多个有顺序的 preset 在发布前统一改写 Markdown

## 快速开始

先安装依赖：

```bash
npm install
```

然后准备 `.env`：

```bash
cp .env.sample .env
```

首次跑通最少要保证下面几项有效：

```env
LARK_APP_ID="xxx"
LARK_APP_SECRET="xxx"
LARK_TOKEN_TYPE=tenant
LARK_FOLDER_TOKEN="xxx"
```

如果你希望结果里的 `documentUrl` 使用指定的文档访问域，也可以同时配置：

```env
LARK_DOCUMENT_BASE_URL="https://li.feishu.cn"
```

注意：

- `--dry-run` 也会先校验飞书配置，不是零配置模式。
- 只要没有传 `--doc`，就必须提供 `LARK_FOLDER_TOKEN`，无论是单文件、目录、dry-run 还是正式发布。

第一次建议直接跑仓库内置样例：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run
```

这条命令会完整走一遍发布流水线，但不会真正写飞书。确认结果正常后，再去掉 `--dry-run`：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md
```

CLI 成功执行后会在 stdout 打印一个 JSON 数组，每项都包含：

- `documentId`
- `title`
- `status`
- `documentUrl`

进度日志和异常信息统一写到 stderr。

`documentUrl` 的生成规则是：

- 优先使用 `--document-base-url`
- 否则使用 `LARK_DOCUMENT_BASE_URL`
- 仍未配置时，再回退到当前基于 `LARK_BASE_URL` 的兼容推导

本地相对资源，例如 `./img-001.png`，默认还是相对 Markdown 文件所在目录解析。如果调用方会把临时 Markdown 写到别的目录，再交给 CLI 发布，就应该显式传 `--resource-base-dir`，把资源解析基目录固定回原始内容目录。

## 常用命令

基础发布：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run
npm run publish:md -- --input ./test-md
```

目标文档与标题：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --doc <document_id>
npm run publish:md -- --input ./test-md --title "Team Notes"
npm run publish:md -- --input ./test-md/comp/comp.md --no-date-prefix
```

preset、Mermaid 和阶段产物：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --preset medium --dry-run
npm run publish:md -- --input ./test-md/comp/comp.md --preset zh-format --dry-run
npm run publish:md -- --input ./test-md/comp/comp.md --preset zh-format --preset ./my-preset.mjs --dry-run
npm run publish:md -- --input ./tmp/generated/article.md --resource-base-dir ./source-assets --dry-run
npm run publish:md -- --input ./test-md/mermaid.md --mermaid-target board --dry-run
npm run publish:md -- --input ./test-md/comp/comp.md --pipeline-cache-dir ./out/debug-cache --dry-run
```

调试与辅助脚本：

```bash
npm run dev:playground
npm run example:module
npm run fetch:board-data -- --doc <document_id> --index 1
```

## 测试与验证

本地默认回归：

```bash
npm run check
npm test
```

真实飞书 live E2E：

```bash
npm run test:e2e
npm run test:e2e:watch
```

说明：

- `npm test` 只跑本地测试，不会真的写飞书。
- `npm run test:e2e` 会跑真实飞书端到端测试，要求本地存在 `.env-test`。
- `.env-test` 已加入 `.gitignore`，可从 `.env-test.example` 开始准备。

## 发布方式

当前发布流程已经改成 `semantic-release`。

- 只有向 `main` 的推送才会触发正式发布
- 版本号会根据提交信息自动计算
- GitHub Release 和 npm 发布都会自动处理
- `CHANGELOG.md` 由 CI 自动维护

仓库还需要的发布条件：

- GitHub Actions 处于启用状态
- 仓库配置 `NPM_TOKEN` secret，且它对 `@jacobbubu/md-to-lark` 具备发布权限
- 合并到 `main` 的提交继续遵守 Conventional Commit 风格，例如 `feat:`、`fix:`

收口规则：

- 非 `main` 分支不会触发 release workflow
- 非 `main` 分支仍然可以做本地检查、测试和构建验证
- npm 发布只应通过 `main` 分支上的 CI 自动执行

## 关键能力

- 单文件和目录递归发布
- 标题推导、标题前缀和单 H1 标题提升
- 本地附件/图片识别与真实上传
- 远程图片下载与独立 URL 预处理
- Mermaid `text-drawing` 和 `board` 两条输出路径
- 表格列宽启发式与数字列右对齐
- 中文 Markdown 格式化 preset（`zh-format`）
- CLI 和程序化调用都支持按顺序组合多个 preset
- `00-source` 到 `05-publish` 的阶段缓存输出
- `publishMdToLark` 的程序化调用入口

## 文档阅读路径

README 只负责入口，不展开全量参数和内部实现。继续看：

1. [docs/README.md](./docs/README.md)
2. [overview.md](./docs/01-getting-started/overview.md)
3. [quickstart.md](./docs/01-getting-started/quickstart.md)
4. [presets.md](./docs/02-guides/presets.md)
5. [cli-reference.md](./docs/03-reference/cli-reference.md)
6. [architecture-overview.md](./docs/04-internals/architecture-overview.md)

如果你是第一次接触这个项目，建议先按 `01-getting-started -> 02-guides -> 03-reference -> 04-internals` 的顺序读。
