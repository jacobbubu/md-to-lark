# 远程资源预处理

## 这篇文档解决什么问题

这篇文档回答一个问题：Markdown 里的远程图片和独立 URL，进入发布前会怎样被下载、改写和记录。

如果你关心“远程图片为什么变成本地路径了”、“为什么某个 URL 没有触发 `yt-dlp`”，先看这篇。

## 默认行为

当前预处理阶段主要处理两类远程资源：

1. 远程 Markdown 图片链接
2. 满足规则的独立 URL 行

默认情况下：

1. 远程 Markdown 图片下载是开启的
2. `yt-dlp` 提取不是默认全局开启，而是要同时满足额外条件

远程图片的默认开关来自：

1. `DOWNLOAD_REMOTE_IMAGES=true`

也可以用命令行显式控制：

1. `--download-remote-images`
2. `--no-download-remote-images`

## 远程图片会处理哪些输入

当前实现只会扫描 Markdown 图片语法里的 `http/https` 图片地址。

例如：

```md
![img](https://example.com/a.png)
```

如果预处理开启，这类 URL 会被下载到预处理目录下的 `assets/`，并把 Markdown 里的链接改写成本地路径。

## `yt-dlp` 会处理哪些输入

`yt-dlp` 不是扫描全文所有链接，而是同时要求下面几件事成立：

1. Markdown 顶部 frontmatter 里声明了 `url_handlers.yt_dlp.prefixes`
2. 当前命中的是一整行独立 URL
3. 这行 URL 不在 fenced code block 里
4. 你提供了可执行的 `yt-dlp` 路径

也就是说，如果只是正文里夹着一个普通超链接，它通常不会触发 `yt-dlp`。

## 一个最小 frontmatter 例子

```yaml
---
url_handlers:
  yt_dlp:
    prefixes:
      - "youtube.com"
---
```

然后正文里写一行独立 URL：

```text
https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

再配上 `yt-dlp` 可执行路径：

```bash
npm run publish:md -- --input ./your-file.md --dry-run --yt-dlp-path /path/to/yt-dlp
```

这样才会进入 `yt-dlp` 提取路径。

## prefix 是怎么匹配的

frontmatter 里的 `prefixes` 可以是：

1. 纯 host，例如 `youtube.com`
2. 带路径前缀的 URL，例如 `https://x.com/i/status`

当前实现会做 host 和 path 前缀匹配，而不是简单的字符串包含。

所以这类配置通常更稳定：

1. `youtube.com`
2. `x.com`
3. `https://www.youtube.com/watch`

## 一个真实例子

如果你只想先看远程图片路径，可以直接构造一个最小输入，或基于样例文件做扩展。

如果你要观察 `yt-dlp` 的行为，建议先用 dry-run，并确认这四件事：

1. frontmatter 已配置 `url_handlers.yt_dlp.prefixes`
2. URL 是单独一行
3. `--yt-dlp-path` 已提供
4. 控制台里 `Prepare: ... yt_dlp=enabled`

## 预处理结果会写到哪里

预处理阶段的主要输出都在：

1. `01-prepare/prepared.md`
2. `01-prepare/result.json`
3. `01-prepare/download.log.json`
4. `01-prepare/assets/`

推荐先看：

1. `prepared.md`
2. `download.log.json`

## 你会在 `prepared.md` 里看到什么

### 远程图片成功时

原始 Markdown 图片链接会被改写成指向本地下载文件的路径。

### `yt-dlp` 成功时

那一整行独立 URL 会被替换成一个或多个本地 Markdown 链接。

每个生成文件都会变成类似下面这样的形式：

```md
[sample-video.mp4](<...local-path...>)
```

如果有多个文件，会按多行 Markdown 链接写回去。

## `download.log.json` 里会记录什么

这个文件会记录预处理摘要和逐项条目。

最有用的字段通常有：

1. `remoteImageCount`
2. `remoteYtDlpCount`
3. `downloadedCount`
4. `failedCount`
5. `entries`

`entries` 里的每一项通常会标出：

1. `sourceType`
2. `status`
3. `originalUrl`
4. `localPath`
5. `attempts`
6. `retries`
7. `error`

## 禁用预处理时会发生什么

如果你显式传了：

```bash
--no-download-remote-images
```

那远程图片不会被下载，也不会改写。

日志里通常会把对应项记成：

1. `skipped-disabled`

但这只影响远程图片下载开关。

`yt-dlp` 是否运行，还要看 frontmatter 是否配置，以及 `yt-dlp` 路径是否存在。

## `yt-dlp` 为什么经常看起来“没生效”

最常见的原因是下面几种：

1. 没配 frontmatter 里的 `url_handlers.yt_dlp.prefixes`
2. URL 不是独立一整行
3. URL 在代码块里
4. 没传 `--yt-dlp-path`
5. URL host 或 path 没命中配置的 prefix

这也是为什么排查时不要只看最终结果，先看：

1. `download.log.json`
2. 控制台里的 `Prepare: ...`

## 失败时会怎样

预处理阶段失败并不总是让整次流程直接中断。

当前实现更偏向：

1. 尽量保留原始内容
2. 把失败写进日志
3. 继续让后续流水线跑下去

这让你更容易在 dry-run 里同时看到“哪些资源成功了，哪些失败了”。

## 下一步阅读

和这篇最相关的下一步通常是：

1. `docs/02-guides/pipeline-cache-and-dry-run.md`
2. `docs/02-guides/assets-and-attachments.md`
3. `docs/03-reference/cli-reference.md`
