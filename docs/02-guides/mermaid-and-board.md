# Mermaid 与白板模式

## 这篇文档解决什么问题

这篇文档回答一个问题：Markdown 里的 Mermaid 代码块在发布时会被渲染成什么，以及什么时候应该选择 `text-drawing`，什么时候应该选择 `board`。

如果你已经在输入里写了 Mermaid，但不确定最终会落成哪种飞书块、哪些参数会影响结果，先看这篇。

## 默认行为

默认情况下，Mermaid 会被渲染成：

```text
text-drawing
```

也就是文本绘图块，而不是飞书白板块。

当前主模式有两个：

1. `text-drawing`
2. `board`

这两个模式共用同一份 Mermaid 源码，但最终落到飞书的块类型不同：

1. `text-drawing` -> `block_type=40`
2. `board` -> `block_type=43`

## 什么时候应该选 `text-drawing`

适合下面几类情况：

1. 你只想稳定展示 Mermaid 图，不需要白板能力。
2. 你希望输出更直接、更接近普通文档块。
3. 你不想额外关心 board 的语法类型和后续白板节点行为。

这也是当前默认值。

## 什么时候应该选 `board`

适合下面几类情况：

1. 你明确希望 Mermaid 落成飞书白板块。
2. 你后续要检查白板节点、主题或 Whiteboard 数据。
3. 你想用 `fetch:board-data` 这类调试脚本去读取 board 内容。

注意，`board` 模式并不是“更高级的默认值”，而是另一种目标形态。

## 一个真实例子

直接看 Mermaid 样例：

```bash
npm run publish:md -- --input ./test-md/mermaid.md --dry-run
```

这时默认是 `text-drawing`。

如果你想切到白板模式：

```bash
npm run publish:md -- --input ./test-md/mermaid.md --dry-run --mermaid-target board
```

## 支持哪些目标值

CLI 推荐使用的规范值是：

1. `text-drawing`
2. `board`

当前实现也接受一些别名：

1. `text_drawing`
2. `textdrawing`
3. `text`
4. `whiteboard`
5. `canvas`

但文档和脚本里建议统一写规范值，避免混乱。

## board 模式有哪些可调参数

如果你选择 `board` 模式，还可以调下面几项：

1. `--mermaid-board-syntax-type`
2. `--mermaid-board-style-type`
3. `--mermaid-board-diagram-type`

其中最重要的是：

1. `syntax_type`

当前默认值是：

```text
2
```

这也是当前实现里默认写入白板 PlantUML 创建接口的值。

## 一个带参数的例子

```bash
npm run publish:md -- --input ./test-md/mermaid.md \
  --dry-run \
  --mermaid-target board \
  --mermaid-board-syntax-type 2 \
  --mermaid-board-style-type 1 \
  --mermaid-board-diagram-type 0
```

如果你不传后两项，当前实现会把它们留空，用默认行为处理。

## Mermaid 是在哪个阶段被改写的

Mermaid 不是在最早的 Markdown 解析阶段就被直接变成飞书块。

它的大致路径是：

1. 先把 Mermaid 代码块识别成普通代码块
2. 在发布期 patch 阶段收集 Mermaid block
3. 再根据目标模式，把对应 BTT block 改成 `text-drawing` 或 `board`

这也是为什么 Mermaid 更像“发布目标选择”，而不是单纯的 Markdown 语义转换。

## 怎么验证 Mermaid 最终走了哪条路径

推荐用 dry-run 看两处：

1. 控制台输出
2. `04-btt/meta.json`

重点字段通常是：

1. `mermaidPatchCount`
2. `mermaidTarget`
3. `mermaidBoard`

如果你要更细地确认具体块形态，再看：

1. `04-btt/btt.json`

常见判断方法：

1. 如果块被改成 `block_type=40`，说明走的是 `text-drawing`
2. 如果块被改成 `block_type=43`，说明走的是 `board`

## dry-run 与真实发布的区别

dry-run 会完成 Mermaid block 的识别和 patch，但不会真正调用飞书写入。

这意味着：

1. dry-run 可以确认目标块类型是否正确
2. 真实发布才会真正创建对应的飞书块
3. `board` 模式下，真实发布时还会进一步创建白板节点

所以如果你只想确认“逻辑分支对不对”，dry-run 就够了；如果你要确认飞书侧白板行为，必须跑真实发布。

## 常见误解

### 以为 Mermaid 默认就是白板

不是。当前默认目标是 `text-drawing`。

### 以为 `board` 只是视觉差异

不是。`board` 和 `text-drawing` 最终会落成不同的飞书块类型，后续的 API 行为也不同。

### 以为所有代码块都会走 Mermaid patch

不是。只有语言被识别成 Mermaid 的代码块才会进入这条路径。

## 下一步阅读

和这篇最相关的下一步通常是：

1. `docs/02-guides/pipeline-cache-and-dry-run.md`
2. `docs/02-guides/remote-resource-preparation.md`
3. `docs/04-internals/architecture-overview.md`
