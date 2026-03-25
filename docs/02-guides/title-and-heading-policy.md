# 标题与标题层级策略

## 这篇文档解决什么问题

这篇文档回答一个问题：一篇 Markdown 最终会用什么文档标题，以及 Markdown 里的 H1、H2 等标题在发布时会发生什么变化。

如果你发现最终标题和文件名不一样，或者正文里的标题层级被提升了，先看这篇。

## 默认行为

默认情况下，最终标题会带日期前缀：

```text
YYYYMMDD-<title>
```

标题来源的优先级，不同模式下略有不同，但总原则都是：

1. 先看你是否显式传了 `--title`
2. 再看 Markdown 是否满足“单个 H1 提升为文档标题”的条件
3. 最后才退回文件名或相对路径

## 单文件模式的标题优先级

当输入是单个 Markdown 文件时，标题按下面顺序决定：

1. `--title`
2. 唯一一个 H1 推导出的标题
3. Markdown 文件名

例如：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run --title "Weekly Notes"
```

这时最终标题会优先来自 `Weekly Notes`，而不是文件里的 H1 或文件名。

## 目录模式的标题优先级

当输入是一个目录时，标题规则有一个额外点：如果传了 `--title`，它会作为“批量前缀”使用。

优先级是：

1. `--title` 作为前缀，再拼上相对路径标题
2. 唯一一个 H1 推导出的标题
3. 输入文件相对于根目录的路径

例如，假设输入根目录是 `./docs`，当前文件是 `./docs/sales/q1.md`：

1. 如果传 `--title Batch`，最终标题会类似 `YYYYMMDD-Batch / sales / q1`
2. 如果没传 `--title`，但正文里恰好只有一个 H1，那么优先使用那个 H1
3. 如果两者都没有，就回退成 `YYYYMMDD-sales / q1`

## “单个 H1 提升为文档标题”到底会做什么

这条规则只有在整个文档里恰好有一个 H1 时才会触发。

触发后会发生三件事：

1. 这个 H1 的文本会被拿来当文档标题。
2. 这个 H1 会从正文里删掉。
3. 剩余标题整体提升一级，也就是 `H2 -> H1`、`H3 -> H2`，依次类推。

这条规则的目标是让“Markdown 顶层标题”变成飞书文档标题，同时避免正文里再重复出现一个同名 H1。

## 一个真实例子

假设输入是：

```md
# Main Title

## Child Section

Paragraph
```

应用默认标题规则后：

1. 文档标题会使用 `Main Title`
2. 正文里的 `# Main Title` 会被删除
3. `## Child Section` 会提升为 `# Child Section`

## 什么时候不会触发单 H1 规则

最重要的情况是：文档里不止一个 H1。

例如：

```md
# A

# B

## C
```

这时工具会认为这不是一个可以安全提升标题的文档，因此：

1. 不会删除任何 H1
2. 不会提升剩余标题层级
3. 不会从这个规则里推导文档标题

后续标题会回到前面的优先级规则，例如 `--title` 或文件名。

## 日期前缀怎么控制

默认启用日期前缀。

你可以用下面两种方式关闭：

1. 命令行加 `--no-date-prefix`
2. 环境变量设为 `LARK_TITLE_DATE_PREFIX=false`

例如：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run --no-date-prefix
```

关闭后，最终标题不再自动加 `YYYYMMDD-`。

## 什么时候不会重复加日期前缀

如果你显式传入的标题已经以当天日期前缀开头，当前实现不会再重复加一次。

也就是说，它会避免出现这种结果：

```text
YYYYMMDD-YYYYMMDD-My Doc
```

## 怎么验证标题规则是否符合预期

最直接的方法是配合 dry-run 看控制台输出和阶段产物：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run
```

重点看两处：

1. 控制台里的 `title: ...`
2. `03-last/last.json` 里的标题相关块结构是否已经被提升

如果你怀疑是 preset 先改了 H1，再影响了标题，先回去看：

1. `00-source/original.md`
2. `00-source/preset.md`

## 常见误解

### 以为 `--title` 只改飞书标题，不影响别的

`--title` 不会改正文内容，但它会直接覆盖文档标题来源优先级。

所以只要传了 `--title`，单文件模式下就不会再使用 H1 或文件名作为标题来源。

### 以为目录模式下 `--title` 会覆盖所有文件标题

目录模式里，`--title` 不是简单覆盖，而是作为一个前缀，后面仍然会拼相对路径标题。

### 以为任何 H1 都会自动被移除

不是。只有在整个文档里恰好一个 H1 时，这条规则才会触发。

## 下一步阅读

如果你已经知道标题是怎么推导的，下一步通常看：

1. `docs/02-guides/presets.md`
2. `docs/02-guides/pipeline-cache-and-dry-run.md`
3. `docs/04-internals/architecture-overview.md`
