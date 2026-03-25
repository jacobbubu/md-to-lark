# 环境变量参考

## 这份参考覆盖什么范围

这份文档列出 `publish:md` 当前依赖的主要环境变量，以及它们的默认值、必填条件和作用范围。

如果你是在查：

1. 哪些变量是必填
2. dry-run 为什么也要先配飞书变量
3. Mermaid、预处理、限流和重试分别由哪些变量控制

那就看这篇。

## 必填变量

### `LARK_APP_ID`

飞书应用 `app_id`。

是否必填：

1. 是

### `LARK_APP_SECRET`

飞书应用 `app_secret`。

是否必填：

1. 是

### `LARK_TOKEN_TYPE`

当前支持的取值：

1. `tenant`
2. `user`

默认值：

1. `tenant`

注意：

1. 如果填了其他值，配置解析会直接失败

### `LARK_USER_ACCESS_TOKEN`

只有在 `LARK_TOKEN_TYPE=user` 时才是必填。

如果 token 类型是 `tenant`，这个变量可以留空。

## 常用目标位置变量

### `LARK_FOLDER_TOKEN`

默认的目标文件夹 token。

作用：

1. 当命令没有传 `--folder`
2. 且没有传 `--doc`
3. 就会回退到这个变量

注意：

1. 如果既没有 `--doc`，也没有可用的 folder token，命令不会开始执行

### `LARK_BASE_URL`

飞书 Open API 基础地址。

默认值：

1. `https://open.feishu.cn`

通常你不需要改它，除非你明确要切到别的 Open API 域。

## 标题相关变量

### `LARK_TITLE_DATE_PREFIX`

控制标题是否默认加日期前缀。

默认值：

1. `true`

命令行覆盖：

1. `--date-prefix`
2. `--no-date-prefix`

## Mermaid 相关变量

### `LARK_MERMAID_TARGET`

控制 Mermaid 默认目标形态。

常用值：

1. `text-drawing`
2. `board`

默认值：

1. `text-drawing`

### `LARK_MERMAID_BOARD_SYNTAX_TYPE`

白板模式下的默认 `syntax_type`。

默认值：

1. `2`

### `LARK_MERMAID_BOARD_STYLE_TYPE`

白板模式下可选的默认 `style_type`。

默认值：

1. 空

### `LARK_MERMAID_BOARD_DIAGRAM_TYPE`

白板模式下可选的默认 `diagram_type`。

默认值：

1. 空

## 预处理相关变量

### `DOWNLOAD_REMOTE_IMAGES`

控制远程 Markdown 图片下载是否默认开启。

默认值：

1. `true`

命令行覆盖：

1. `--download-remote-images`
2. `--no-download-remote-images`

### `YT_DLP_PATH`

`yt-dlp` 可执行文件路径。

默认值：

1. 空

注意：

1. 只有 frontmatter 同时配置了 `url_handlers.yt_dlp.prefixes`，并命中独立 URL 行时，这个变量才会真正参与预处理

### `YT_DLP_COOKIES_PATH`

传给 `yt-dlp --cookies` 的 cookie 文件路径。

默认值：

1. 空

### `PIPELINE_CACHE_DIR`

阶段缓存根目录。

默认值：

1. `./out/pipeline-cache`

命令行覆盖：

1. `--pipeline-cache-dir`

## 预处理超时与重试变量

### `PREPARE_TIMEOUT_MS`

单次远程资源处理的默认超时。

默认值：

1. `15000`

### `PREPARE_MAX_RETRIES`

预处理阶段的最大重试次数。

默认值：

1. `3`

### `PREPARE_BACKOFF_BASE_MS`

预处理重试退避的基础毫秒数。

默认值：

1. `500`

### `PREPARE_BACKOFF_MAX_MS`

预处理重试退避的最大毫秒数。

默认值：

1. `5000`

### `PREPARE_BACKOFF_JITTER_RATIO`

预处理退避抖动比例。

默认值：

1. `0.2`

### `YT_DLP_TIMEOUT_MS`

`yt-dlp` 调用超时。

默认值：

1. `600000`

## 发布限流变量

### `LARK_DOCX_MIN_INTERVAL_MS`

Docx 相关请求的最小间隔。

默认值：

1. `260`

### `LARK_MEDIA_MIN_INTERVAL_MS`

媒体上传相关请求的最小间隔。

默认值：

1. `450`

### `LARK_PUBLISH_COOLDOWN_MS`

多文件发布时，单个文档发布完成后的冷却时间。

默认值：

1. `600`

## 一组最小可用配置

如果你只是想先跑通 dry-run，最小配置通常至少要有：

```env
LARK_APP_ID="xxx"
LARK_APP_SECRET="xxx"
LARK_FOLDER_TOKEN="xxx"
LARK_TOKEN_TYPE=tenant
```

注意：

1. 当前 dry-run 也会先校验飞书配置
2. 所以不是“完全不配变量也能运行”

## 什么时候变量会被命令行覆盖

最常见的覆盖关系是：

1. `--folder` 覆盖 `LARK_FOLDER_TOKEN`
2. `--no-date-prefix` / `--date-prefix` 覆盖 `LARK_TITLE_DATE_PREFIX`
3. `--pipeline-cache-dir` 覆盖 `PIPELINE_CACHE_DIR`
4. `--mermaid-target` 覆盖 `LARK_MERMAID_TARGET`
5. `--yt-dlp-path` 覆盖 `YT_DLP_PATH`
6. `--yt-dlp-cookies-path` 覆盖 `YT_DLP_COOKIES_PATH`

## 相关文档

如果你查完变量，下一步通常看：

1. `docs/03-reference/cli-reference.md`
2. `docs/02-guides/remote-resource-preparation.md`
3. `docs/02-guides/mermaid-and-board.md`
