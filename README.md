# md-to-lark

`md-to-lark` 把 Markdown（GFM）内容发布到飞书文档。它不是“只做单次渲染”的脚本，而是把真实发布里常见的高频问题纳入同一条可重复执行链路里：标题策略、资源上传、Mermaid、表格增强、预处理、批量发布、dry-run、以及可追溯的中间产物。

## 解决什么问题

适合你正在做的是：

1. 把一篇 Markdown 文件变成飞书文档。
2. 把一个目录里的多篇 `.md` 按规则批量发布。
3. 处理本地资源（图片/音频/视频/附件）和远程资源（图片、独立 URL）上传前的替换、降级与日志。
4. 在不调用写入接口的情况下先验证整条流水线。

## 快速开始（最短路径）

```bash
npm install
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run
```

先用仓库里的样例跑一次 `--dry-run`，确认命令能完整走完“读取 → 预处理 → 转换 → 产物写入”。  
再执行同样命令去掉 `--dry-run` 即可尝试真实发布。

```bash
npm run publish:md -- --input ./test-md/comp/comp.md
```

`--dry-run` 和正式发布都要求飞书配置，因此需先准备 `.env`（至少包含 `LARK_APP_ID`、`LARK_APP_SECRET`、`LARK_TOKEN_TYPE`；目录模式通常还需要 `LARK_FOLDER_TOKEN`）。

```bash
cp .env.sample .env
```

配置好后建议按顺序看：

1. `docs/01-getting-started/overview.md`
2. `docs/01-getting-started/quickstart.md`

## 常用命令与入口

```bash
# 最常见：发布单文件（或目录）
npm run publish:md -- --input ./test-md/comp/comp.md
npm run publish:md -- --input ./docs

# 覆盖写入目标和标题策略
npm run publish:md -- --input ./test-md/comp/comp.md --doc <document_id>
npm run publish:md -- --input ./docs --title "Team Notes"
npm run publish:md -- --input ./test-md/comp/comp.md --no-date-prefix

# 预处理 / 渲染控制
npm run publish:md -- --input ./test-md/comp/comp.md --preset medium --dry-run
npm run publish:md -- --input ./test-md/mermaid.md --mermaid-target board --dry-run
npm run publish:md -- --input ./test-md/comp/comp.md --pipeline-cache-dir ./out/debug-cache --dry-run

# 维护与调试
npm run check
npm test
npm run example:module
npm run dev:playground
npm run fetch:board-data -- --doc <document_id> --index 1
```

## 文档阅读路径（建议）

先看 `docs/` 的层级再看内容：

1. `docs/01-getting-started/`：第一次用用户路线（是什么、怎么成功跑第一次）。
2. `docs/02-guides/`：常见问题的处理方法（标题、资源、preset、Mermaid、远程资源、dry-run 与 pipeline cache）。
3. `docs/03-reference/`：参数和接口查询表，不是教学向，适合查某个开关时用。
4. `docs/04-internals/`：要调试、扩展、或者想看架构边界时查这一层。

对应入口如下：

- `docs/01-getting-started/overview.md`
- `docs/01-getting-started/quickstart.md`
- `docs/02-guides/title-and-heading-policy.md`
- `docs/02-guides/assets-and-attachments.md`
- `docs/02-guides/remote-resource-preparation.md`
- `docs/02-guides/presets.md`
- `docs/02-guides/mermaid-and-board.md`
- `docs/02-guides/pipeline-cache-and-dry-run.md`
- `docs/03-reference/cli-reference.md`
- `docs/03-reference/environment-variables.md`
- `docs/03-reference/fetch-board-data.md`
- `docs/03-reference/preset-api.md`
- `docs/03-reference/programmatic-usage.md`
- `docs/04-internals/architecture-overview.md`
- `docs/04-internals/markdown-to-last.md`
- `docs/04-internals/last-btt-lark-models.md`
- `docs/04-internals/publish-rendering-flow.md`
- `docs/04-internals/selector-and-last-api.md`
- `docs/04-internals/testing-and-debugging.md`

## 关键能力概览

- 单文件和目录递归发布（`*.md`）
- 目录模式可复用标题前缀，单文件模式支持直接覆盖标题
- 标题默认加日期前缀；支持禁用
- Markdown 富文本、表格、KaTeX、iframe 类链接等常见内容结构的发布映射
- Mermaid 支持文本图与白板两条输出路径
- 本地资源识别与上传补丁（dry-run 下仅完成识别与写入检查）
- 远程图片下载、独立 URL 提取（可选）以及下载日志落盘
- preset 可插拔改写，发布前先对 Markdown 做一次可控变换
- 每个输入都会写 `pipeline cache`（`00-source` 到 `05-publish`），用于问题定位
- 支持直接通过 `publishMdToLark` 进行程序化调用
