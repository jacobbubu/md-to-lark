# 本地资源与附件

## 这篇文档解决什么问题

这篇文档回答一个问题：Markdown 里的本地图片、视频、音频和附件，进入发布流水线后会怎样被识别、改写和上传。

如果你关心“本地路径到底会不会被上传到飞书”、“为什么有些链接变成附件块，有些没有”，先看这篇。

## 默认行为

这套工具对资源处理分成两类：

1. 本地资源
2. 远程资源

本篇先讲本地资源，也就是 Markdown 里指向本地路径的图片和链接。

默认情况下，工具会尽量把可识别的本地资源转成飞书可上传的块，并在真实发布时上传。

这条链路不是在最开始就完成的，而是分两步：

1. 先在 `LAST` 阶段把某些块识别成 `image` 或 `file`
2. 再在 `BTT` 阶段给这些块打上本地路径补丁，最后在真实发布时上传

## 路径是相对谁解析的

本地路径是相对当前 Markdown 文件所在目录解析的，不是相对仓库根目录。

例如，如果当前输入文件是：

```text
./test-md/comp/comp.md
```

那下面这类路径会相对 `./test-md/comp/` 来解析：

```md
![tiny](./assets/tiny.png)

[Sample DOCX](./assets/sample.docx)
```

如果调用方会先生成一份临时 Markdown，再把它交给 CLI 或程序化接口发布，这个默认规则就可能不够用。

这时可以显式覆盖解析基目录：

```bash
npm run publish:md -- --input ./tmp/generated/article.md --resource-base-dir ./original-assets
```

程序化调用则传：

```ts
await publishMdToLark(
  {
    inputPath: './tmp/generated/article.md',
    resourceBaseDir: './original-assets',
    folderToken: process.env.LARK_FOLDER_TOKEN ?? '',
    dryRun: true,
  },
  process.env,
)
```

这不会改变 Markdown 文件本身的位置，只会改变本地相对资源的解析基目录。

## 什么样的本地链接会被提升成附件块

最稳定、最容易被识别的情况是：

1. 一个独立文本块
2. 这个文本块里的所有文本 run 都指向同一个本地链接
3. 链接目标真实存在

例如：

```md
[Sample DOCX](./assets/sample.docx)
```

如果目标文件存在，这类输入会被提升成一个 `file` 块，而不是继续保留成普通文本链接。

## 什么样的本地图片会被提升成图片块

常见的本地图片输入有两种来源：

1. Markdown 图片语法本身生成的图片块
2. 指向图片文件的独立本地链接，被提升成图片块

例如：

```md
![tiny](./assets/tiny.png)
```

或：

```md
[tiny](./assets/tiny.png)
```

只要目标文件存在，并且扩展名被识别成图片类型，后续都会按图片处理。

## 常见资源类型会怎么处理

当前实现大体按扩展名区分：

1. 图片，例如 `png`、`jpg`、`gif`、`webp`、`bmp`、`svg`
2. 视频，例如 `mp4`、`mov`、`avi`、`mkv`
3. 音频，例如 `mp3`、`wav`、`m4a`、`ogg`
4. 其他附件，例如 `docx`、`xlsx`、`pptx`、`pdf`

其中：

1. 图片会走图片上传路径
2. 其他附件会走文件上传路径
3. 视频和音频虽然是文件块，但会带媒体类型信息，尽量用可预览方式展示

## 一个真实例子

仓库里已经有一套本地资源样例，可以直接跑 dry-run：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run
```

这个样例目录里包含：

1. [`test-md/comp/assets/sample.docx`](/Users/rongshen/vibe-coding/new/md-to-lark/test-md/comp/assets/sample.docx)
2. [`test-md/comp/assets/sample.mp3`](/Users/rongshen/vibe-coding/new/md-to-lark/test-md/comp/assets/sample.mp3)
3. [`test-md/comp/assets/sample.mp4`](/Users/rongshen/vibe-coding/new/md-to-lark/test-md/comp/assets/sample.mp4)
4. [`test-md/comp/assets/sample.pptx`](/Users/rongshen/vibe-coding/new/md-to-lark/test-md/comp/assets/sample.pptx)
5. [`test-md/comp/assets/sample.xlsx`](/Users/rongshen/vibe-coding/new/md-to-lark/test-md/comp/assets/sample.xlsx)
6. [`test-md/comp/assets/tiny.png`](/Users/rongshen/vibe-coding/new/md-to-lark/test-md/comp/assets/tiny.png)

dry-run 不会真的上传这些文件，但会把资源识别、块替换和 patch 结果都走一遍。

## 缺失本地资源时会发生什么

当前实现的一个重要特点是：本地资源缺失不会直接让整次发布失败。

但不同资源类型的退化方式不完全一样。

### 缺失的本地文件链接

如果一个独立本地文件链接指向的文件不存在，工具不会把它提升成附件块。

这时它通常会继续保留成普通文本块或普通链接，而不是中断整个流程。

### 缺失的本地图片

如果一个本地图片路径不存在，工具会把这个图片退化成文本块，文本内容里保留原始 `sourceUrl`，而不是继续保留成失效图片块。

这能避免真实发布阶段因为找不到本地图片而直接失败。

## 什么时候真正发生上传

真正的二进制上传只发生在真实发布阶段，不发生在 dry-run 阶段。

也就是说：

1. dry-run 会完成识别和 patch
2. 真实发布才会真正调用飞书上传接口
3. 上传成功后，再把占位块替换成带 token 的最终资源块

所以 dry-run 适合验证“识别逻辑对不对”，真实发布才会验证“飞书上传是否成功”。

## 怎么检查本地资源有没有被正确识别

推荐按下面顺序检查：

1. 先跑 dry-run
2. 看 `04-btt/meta.json` 里的 `localAssetCount`
3. 再看 `04-btt/btt.json` 里对应块是否已经变成 `image` 或 `file`
4. 如果是真实发布，再看 `05-publish/result.json` 里的媒体映射和失败块

如果 `localAssetCount` 是 `0`，通常说明下面几件事之一：

1. 路径没解析到真实文件
2. 链接不是独立块，没满足附件提升条件
3. 输入不是本地资源，而是远程 URL
4. Markdown 是临时生成的，需要补 `--resource-base-dir`

## 常见误解

### 以为任何本地链接都会变成附件块

不是。当前实现更偏向处理“独立成段、指向单一链接目标”的本地链接。

如果本地链接只是嵌在一段长文本里，它不一定会被提升成独立附件块。

### 以为 dry-run 会真的上传附件

不会。dry-run 只会把资源识别和 patch 路径走通，不会真的调用飞书写入和上传接口。

### 以为缺失一个本地资源会让整次发布中止

当前实现默认更保守：优先退化，而不是因为单个缺失资源直接中断整条链路。

## 和远程资源有什么区别

远程图片和独立 URL 媒体不走这条“本地资源直接识别”路径。

它们会先进入预处理阶段，可能被下载、改写，再进入后续解析和 patch 流程。

所以如果你的问题是：

1. 远程图片为什么没下载
2. `yt-dlp` 为什么没生效
3. `download.log.json` 里为什么有失败记录

那应该优先去看预处理相关文档，而不是只看本地附件逻辑。

## 下一步阅读

和本篇最相关的下一步通常是：

1. `docs/02-guides/pipeline-cache-and-dry-run.md`
2. `docs/02-guides/mermaid-and-board.md`
3. `docs/04-internals/architecture-overview.md`
