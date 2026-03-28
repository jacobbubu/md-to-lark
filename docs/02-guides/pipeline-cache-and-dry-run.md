# dry-run 与 pipeline cache

## 这篇文档解决什么问题

这篇文档回答一个问题：怎样在不真正写入飞书的情况下，完整观察一次 Markdown 发布流水线，并利用 pipeline cache 排查问题。

如果你已经能跑通 quickstart，但还不知道每一步产物写到哪里、出了问题该先看哪个阶段，先看这篇。

## 默认行为

`publish:md` 在每次处理 Markdown 输入时，默认都会生成一套阶段缓存。

默认根目录是：

```text
./out/pipeline-cache
```

每个输入文件都会有一个独立的阶段目录，里面依次保存：

1. `00-source`
2. `01-prepare`
3. `02-hast`
4. `03-last`
5. `04-btt`
6. `05-publish`

`--dry-run` 的作用不是“跳过流水线”，而是：

1. 仍然完整执行输入解析、preset、预处理、AST 转换和 BTT patch。
2. 不真正调用飞书写入接口。
3. 仍然把阶段产物和最终结果写进 cache。

## 什么时候应该先用 dry-run

建议在下面这些情况下先跑 dry-run：

1. 你第一次接触某个输入文件，想先看标题和中间结果是否合理。
2. 你刚加了 preset，想确认它到底改了什么。
3. 你开启了远程图片下载、`yt-dlp` 或 Mermaid 白板模式，想先看预处理和 patch 结果。
4. 你怀疑问题出在 Markdown 输入本身，而不是飞书 API。

## 一个真实例子

先跑一次真实样例的 dry-run：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run
```

如果你想单独观察 Mermaid 路径：

```bash
npm run publish:md -- --input ./test-md/mermaid.md --dry-run --mermaid-target board
```

如果你想把 cache 写到自定义目录：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run --pipeline-cache-dir ./out/debug-cache
```

## 每个阶段里有什么

### 00-source

这一阶段用来回答“原始输入是什么，preset 改了什么”。

常见文件：

1. `original.md`
2. `preset.md`
3. `meta.json`

如果你怀疑 preset 改坏了内容，先对比 `original.md` 和 `preset.md`。

如果这次用了多个 preset，再看 `meta.json` 里的 `presets` 数组，确认实际执行顺序。

### 01-prepare

这一阶段用来回答“预处理改了什么，远程资源是否成功落地”。

常见文件：

1. `prepared.md`
2. `result.json`
3. `download.log.json`
4. `assets/`

这里最适合看下面几类问题：

1. 远程图片有没有被成功下载并改写。
2. 独立 URL 是否被 `yt-dlp` 替换成本地媒体链接。
3. 失败是“跳过了”、还是“尝试过但失败了”。

### 02-hast

这一阶段保存 Markdown 解析后的 HAST。

常见文件：

1. `hast.json`

如果你怀疑 Markdown 结构在进入内部模型前就已经不对，这里是最早的结构化检查点。

### 03-last

这一阶段保存内部中间表示 `LAST`。

常见文件：

1. `last.json`

如果你要确认标题、块结构、表格、附件、iframe 和文本块最终变成了什么内部语义，这里最关键。

### 04-btt

这一阶段保存更接近飞书块树的 `BTT` 结果，以及发布期补丁信息。

常见文件：

1. `btt.json`
2. `meta.json`

这里适合检查：

1. Mermaid patch 数量。
2. Mermaid 最终目标是 `text-drawing` 还是 `board`。
3. 本地附件和图片被识别了多少。

### 05-publish

这一阶段保存最终的发布结果。

常见文件：

1. `result.json`

这个文件里的 `status` 可能是：

1. `dry-run`
2. `published`
3. `failed`

即使你跑的是 dry-run，这里也会留下最终结果摘要。

## 怎么用这些阶段排查问题

推荐按下面顺序排查：

1. 先看 `05-publish/result.json`，确认最终状态和标题。
2. 再看 `01-prepare/prepared.md`，确认输入在进入解析前是否已经被改写。
3. 再看 `03-last/last.json`，确认语义结构是否已经偏了。
4. 最后看 `04-btt/btt.json`，确认发布前 patch 是否符合预期。

一个简单判断方法是：

1. `original.md` 正常，但 `preset.md` 不正常，问题通常在 preset。
2. `preset.md` 正常，但 `prepared.md` 不正常，问题通常在预处理。
3. `prepared.md` 正常，但 `last.json` 不正常，问题通常在 Markdown 解析或 LAST 转换。
4. `last.json` 正常，但 `btt.json` 不正常，问题通常在发布期 patch。
5. `btt.json` 正常，但真实发布失败，问题通常在飞书写入阶段。

## 你会在控制台看到什么

运行时控制台会打印一些直接可用的诊断信息，例如：

1. 解析到多少个 Markdown 文件。
2. 当前的限流配置。
3. 预处理是否启用了远程图片和 `yt-dlp`。
4. Mermaid 目标模式。
5. 每个输入的 `prepare` 统计。
6. dry-run 模式下的标题、块数、Mermaid patch 数量和本地资源数量。

这些信息适合快速看趋势，cache 目录适合做精确定位。

## 边界和常见误解

### dry-run 不是零配置模式

当前实现里，CLI 在进入 dry-run 之前也会先校验飞书相关环境变量。

所以如果你缺少 `LARK_APP_ID`、`LARK_APP_SECRET` 或 `LARK_TOKEN_TYPE`，dry-run 也不会开始执行。

### dry-run 仍然会写磁盘

dry-run 不写飞书，但会写：

1. 阶段目录
2. 中间 JSON
3. 预处理结果
4. 可选的下载资源

如果你开启了远程资源预处理，`01-prepare/assets/` 里会出现实际下载下来的文件。

### 目录模式会生成多套阶段目录

当输入是一个目录时，每个 Markdown 文件都会生成一套独立 cache。

不要只看根目录，应该进入对应输入文件的阶段目录再排查。

## 什么时候该继续看别的文档

如果你已经知道如何利用 cache 排查输入链路，下一步通常是：

1. 看 `docs/02-guides/presets.md`，理解 `00-source` 阶段里 preset 的角色。
2. 看 `docs/02-guides/assets-and-attachments.md`，理解 `01-prepare` 和本地资源 patch。
3. 看 `docs/04-internals/architecture-overview.md`，理解这些阶段分别对应哪段实现。
