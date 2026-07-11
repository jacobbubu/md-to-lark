# CLI 参考

## 这份参考覆盖什么范围

这份文档只覆盖主发布命令：

```bash
npm run publish:md -- --input <file.md|dir>
```

它的目标是帮助你快速查询：

1. 参数名
2. 默认值
3. 生效范围
4. 限制条件

当前 CLI 的 I/O 契约也固定了：

1. 成功结果写到 stdout
2. 进度日志和异常写到 stderr

它不是一篇入门教程。第一次使用建议先看：

1. `docs/01-getting-started/quickstart.md`

## 用法概览

```bash
npm run publish:md -- --input <file.md|dir> \
  [--title <doc_title_or_prefix>] \
  [--date-prefix|--no-date-prefix] \
  [--preset <preset_name_or_module_path>]... \
  [--document-base-url <base_url>] \
  [--resource-base-dir <dir>] \
  [--renderer lark] \
  [--renderer-contract <path>] \
  [--renderer-default-contract <path>] \
  [--strict] \
  [--render-report <path>] \
  [--image-size-manifest <path>] \
  [--folder <folder_token>] \
  [--doc <document_id>] \
  [--download-remote-images|--no-download-remote-images] \
  [--yt-dlp-path <path>] \
  [--yt-dlp-cookies-path <path>] \
  [--pipeline-cache-dir <dir>] \
  [--single-dollar-text-math] \
  [--mermaid-target <text-drawing|board>] \
  [--mermaid-board-syntax-type <int>] \
  [--mermaid-board-style-type <int>] \
  [--mermaid-board-diagram-type <int>] \
  [--dry-run] \
  [--help|-h]
```

不需要发布凭据的协议检查命令：

```bash
publish-md-to-lark --print-capabilities
publish-md-to-lark --validate-contract ./index-zh.lark.yml
```

## Renderer contract

`--renderer-contract` 显式选择 `article-render/v1` 合同，优先级高于 frontmatter 和同目录自动发现。`--strict` 要求合同存在，并把未知 directive、重复 ID、footnote 不匹配、缺图、非法表格、KaTeX 错误、会被丢弃的可见 raw HTML 和不允许的飞书父子关系作为发布前错误。

`--render-report` 把 source semantic、LAST、BTT、图片尺寸匹配和远端 block count 写入 JSON。协议模式的 pipeline cache 根目录也会生成 `render-report.json`。

协议模式的 `currency_policy: protect` 会把 `$45,000`、`$50k/year`、`$2.4T`、`$20-$30` 等金额保留为普通文本，同时继续解析 `$P(y \mid x)$` 等明确公式。纯 HTML 注释允许存在；其他 raw HTML 在严格模式报错、非严格模式给出 warning，避免内容被静默丢弃。

## 标准输出与标准错误

成功时，stdout 会输出一个 JSON 数组。

数组每一项都包含：

1. `documentId`
2. `title`
3. `status`
4. `documentUrl`

说明：

1. 单文件模式也是数组，只是长度为 `1`
2. `dry-run` 时 `documentId` 和 `documentUrl` 都是 `null`
3. 目录模式下会按处理顺序输出多项结果

stderr 负责：

1. 输入解析摘要
2. preset 日志
3. 预处理统计
4. dry-run 观察信息
5. 发布进度和错误信息

## 必需项

### `--input <file.md|dir>`

输入一个 Markdown 文件路径，或者一个目录路径。

行为：

1. 单文件模式：发布一个 Markdown 文件
2. 目录模式：递归处理目录下所有 `*.md`

如果缺少 `--input`，命令会直接报错。

## 标题相关

### `--title <doc_title_or_prefix>`

含义取决于输入模式：

1. 单文件模式：直接作为标题来源
2. 目录模式：作为标题前缀，再拼接相对路径标题

### `--date-prefix`

显式开启标题日期前缀。

### `--no-date-prefix`

显式关闭标题日期前缀。

默认值：

1. 开启

等价环境变量：

1. `LARK_TITLE_DATE_PREFIX`

## 目标位置相关

### `--folder <folder_token>`

指定飞书文件夹 token。

默认来源：

1. `LARK_FOLDER_TOKEN`

限制：

1. 正式发布时，如果没有传 `--doc`，那就必须能拿到 folder token
2. 纯本地 `--dry-run` 不需要 folder token

### `--doc <document_id>`

指定一个已有飞书文档 id，直接写入这个文档。

限制：

1. 只支持单文件模式
2. 如果设置了 `--doc`，发布前会先清空该文档内容

## 输入改写相关

### `--preset <preset_name_or_module_path>`

在正式进入发布流水线之前，先对 Markdown 做预设转换。

支持：

1. 内置 preset 名称，例如 `medium`
2. 本地模块路径，例如 `./my-preset.mjs`

行为：

1. 这个参数可以重复传入
2. 多个 preset 会按给定顺序执行
3. 任一 preset 失败，整次命令直接失败

例子：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run --preset zh-format --preset ./my-preset.mjs
```

推荐文档：

1. `docs/02-guides/presets.md`

## 结果链接相关

### `--document-base-url <base_url>`

显式指定结果里 `documentUrl` 使用的文档访问 base URL。

常见例子：

1. `https://li.feishu.cn`
2. `https://feishu.cn`

优先级：

1. 高于 `LARK_DOCUMENT_BASE_URL`
2. 如果命令行和环境变量都没配，才会回退到当前兼容推导逻辑

注意：

1. 这个参数只影响结果里的 `documentUrl`
2. 它不影响 Open API 请求地址

### `--resource-base-dir <dir>`

显式指定本地相对图片和附件的解析基目录。

默认值：

1. 当前 Markdown 文件所在目录

适用场景：

1. 调用方会先生成临时 Markdown 文件
2. 临时文件不在原始资源目录里
3. Markdown 里仍然保留相对路径，例如 `./img-001.png`

注意：

1. 这个参数只影响本地相对资源解析
2. 它不影响远程图片预处理
3. 它不影响 `documentUrl`

## 远程资源预处理相关

### `--download-remote-images`

显式开启远程 Markdown 图片下载和改写。

### `--no-download-remote-images`

显式关闭远程 Markdown 图片下载和改写。

默认值：

1. 来自 `DOWNLOAD_REMOTE_IMAGES`
2. 默认启用

### `--yt-dlp-path <path>`

指定 `yt-dlp` 可执行文件路径。

只有在 frontmatter 同时配置了 `url_handlers.yt_dlp.prefixes` 时，这个参数才会真正参与独立 URL 提取。

### `--yt-dlp-cookies-path <path>`

把 cookie 文件路径传给 `yt-dlp --cookies`。

推荐文档：

1. `docs/02-guides/remote-resource-preparation.md`

## 调试与产物相关

### `--pipeline-cache-dir <dir>`

指定阶段缓存根目录。

默认值：

```text
./out/pipeline-cache
```

### `--dry-run`

完整执行输入解析、preset、预处理、AST 转换和 patch，但不真正写飞书。

注意：

1. `--dry-run` 仍然会写阶段缓存
2. `--dry-run` 不要求飞书应用凭据、folder token 或 document id
3. 如果启用远程图片预处理，dry-run 仍可能访问图片源站

推荐文档：

1. `docs/02-guides/pipeline-cache-and-dry-run.md`

## Markdown 解析相关

### `--single-dollar-text-math`

显式开启单美元行内公式解析，也就是把 `$...$` 解析成 inline equation。

默认值：

1. 关闭

适用场景：

1. arXiv 论文
2. LaTeX 密集的技术文档
3. 调用方已经确认正文里的美元金额不会被误判为公式

注意：

1. 默认关闭是为了避免 `$20.47`、`$1.6T` 这类金额被误解析成公式
2. 反引号 inline code 和 fenced code block 内的 `$...$` 仍按代码处理
3. GFM table cell 内的 `$...$` 会在开启后解析为 inline equation

别名：

1. `--single-dollar-math`

## Mermaid 相关

### `--mermaid-target <text-drawing|board>`

指定 Mermaid 最终目标形态。

推荐使用的规范值：

1. `text-drawing`
2. `board`

当前实现也接受若干别名，但参考文档不推荐依赖别名写法。

默认值：

1. `text-drawing`
2. 也可由 `LARK_MERMAID_TARGET` 覆盖

### `--mermaid-board-syntax-type <int>`

白板模式下传给 board createPlantuml 的 `syntax_type`。

默认值：

1. `2`

### `--mermaid-board-style-type <int>`

白板模式下的可选 `style_type`。

### `--mermaid-board-diagram-type <int>`

白板模式下的可选 `diagram_type`。

推荐文档：

1. `docs/02-guides/mermaid-and-board.md`

## 帮助相关

### `--help`

打印帮助并退出。

### `-h`

`--help` 的短参数。

## 默认值与环境变量

主命令最常用的默认来源如下：

1. `LARK_FOLDER_TOKEN`
2. `LARK_TITLE_DATE_PREFIX`
3. `DOWNLOAD_REMOTE_IMAGES`
4. `YT_DLP_PATH`
5. `YT_DLP_COOKIES_PATH`
6. `PIPELINE_CACHE_DIR`
7. `LARK_MERMAID_TARGET`
8. `LARK_MERMAID_BOARD_SYNTAX_TYPE`
9. `LARK_MERMAID_BOARD_STYLE_TYPE`
10. `LARK_MERMAID_BOARD_DIAGRAM_TYPE`

完整变量说明建议看：

1. `docs/03-reference/environment-variables.md`

## 常见限制

最重要的限制有这些：

1. `--doc` 只支持单文件模式
2. 正式发布时如果没有 `--doc`，必须提供 folder token
3. 纯本地 dry-run 不需要飞书配置
4. 缺失本地资源通常会退化，而不是直接终止
5. `yt-dlp` 只处理满足 frontmatter 规则的独立 URL 行

## 常见查询示例

单文件 dry-run：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run
```

目录模式：

```bash
npm run publish:md -- --input ./docs --title Weekly
```

论文 Markdown dry-run：

```bash
npm run publish:md -- --input ./paper.md --single-dollar-text-math --dry-run
```

写入已有文档：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --doc <document_id>
```

使用内置 preset：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run --preset medium
```

## 相关文档

如果你不是来查参数，而是来理解行为，建议继续看：

1. `docs/01-getting-started/quickstart.md`
2. `docs/02-guides/presets.md`
3. `docs/02-guides/remote-resource-preparation.md`
4. `docs/02-guides/mermaid-and-board.md`
