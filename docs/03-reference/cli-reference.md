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
  [--preset <preset_name_or_module_path>] \
  [--folder <folder_token>] \
  [--doc <document_id>] \
  [--download-remote-images|--no-download-remote-images] \
  [--yt-dlp-path <path>] \
  [--yt-dlp-cookies-path <path>] \
  [--pipeline-cache-dir <dir>] \
  [--mermaid-target <text-drawing|board>] \
  [--mermaid-board-syntax-type <int>] \
  [--mermaid-board-style-type <int>] \
  [--mermaid-board-diagram-type <int>] \
  [--dry-run] \
  [--help|-h]
```

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

1. 如果没有传 `--doc`，那就必须能拿到 folder token

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

推荐文档：

1. `docs/02-guides/presets.md`

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
2. `--dry-run` 仍然会先校验飞书环境变量

推荐文档：

1. `docs/02-guides/pipeline-cache-and-dry-run.md`

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
2. 如果没有 `--doc`，必须提供 folder token
3. dry-run 也需要通过飞书配置校验
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
