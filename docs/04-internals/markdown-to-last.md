# 从 Markdown 到 LAST

## 这篇文档解决什么问题

这篇文档回答一个问题：一份 Markdown 是怎样一步步被解析、规范化并转换成内部语义模型 `LAST` 的。

如果你在调试“为什么这段 Markdown 最后变成了这样的块结构”，或者你打算扩展解析规则，先看这篇。

## 一句话结论

这一段主链路可以概括成：

```text
Markdown -> HAST -> LAST
```

其中：

1. `Markdown -> HAST` 负责把文本解析成通用结构
2. `HAST -> LAST` 负责把通用结构映射成项目内部、面向飞书语义的模型

## 第一步：Markdown 先变成 HAST

当前入口是：

1. `src/pipeline/markdown/md-to-hast.ts`

这里使用的是标准统一生态：

1. `remark-parse`
2. `remark-gfm`
3. `remark-math`
4. `remark-rehype`

这意味着在进入项目自定义逻辑之前，Markdown 已经具备：

1. GFM 支持
2. 数学公式支持
3. 通用的 HAST 树结构

## frontmatter 为什么会先改写成代码块

这是这一层里最重要的特殊处理之一。

当前实现不会直接把开头的 YAML/TOML frontmatter 留给普通 Markdown 解析，而是会先把它重写成 fenced code block。

这样做的原因是：

1. 保证 frontmatter 在后续渲染里仍然可见
2. 避免它被误解析成正文标题、段落或其他结构

简单理解就是：

1. frontmatter 不是被“吃掉”
2. 而是被显式保留成一段代码块

## 第二步：HAST 再变成 LAST

当前入口是：

1. `src/pipeline/hast-to-last.ts`

这一段的目标不是生成 HTML，也不是生成飞书原始 payload，而是生成 `LAST`。

你可以把 `LAST` 理解成：

1. 已经带有飞书块语义
2. 但还没有完全绑定飞书 API 写入细节

这也是为什么它既保留了语义信息，又保留了后续可编辑性。

## `LAST` 在这一步做了哪些事情

从行为上看，`hastToLAST` 主要做下面几类转换：

1. 把标题、正文、列表、引用、代码块等变成对应的块类型
2. 把行内文本、样式、链接和公式变成 inline 结构
3. 把表格拆成 table 和 table_cell 相关块
4. 识别某些可嵌入链接并转换成 `iframe` 块
5. 建立索引，方便后续查询和修改

这一步已经不是“保留 HTML 标签名”，而是开始进入项目自己的文档语义世界。

## `fragment` 和 `document` 两种模式

`hastToLAST` 当前支持两种输出模式：

1. `fragment`
2. `document`

### `fragment`

这是发布链路里更常用的模式。

特点是：

1. 没有页面根块
2. 用 `topLevel` 表示顶层块顺序
3. 更适合先做后续 patch 和转换

### `document`

这种模式会构造完整文档模型。

特点是：

1. 有 `rootId`
2. `id` 会被规范化成 `doc_<...>`
3. 更像一个完整的内部文档对象

## 为什么这一层就要建立索引

`LAST` 不只是一次性中间产物，它还承担后续结构化修改能力。

所以在构造 `LAST` 时，会同时建立索引，例如：

1. `byType`
2. `textScopes`
3. `textScopeByBlockId`

这些索引的意义是：

1. 让后续能快速按块类型检索
2. 让文本作用域上的查找替换更容易实现
3. 让 `LAST API` 这种结构化修改能力有基础设施可用

## 几个关键转换行为

### 标题和正文块

常规标题会被映射成：

1. `heading1`
2. `heading2`
3. ...

普通段落会被映射成：

1. `text`

### 数学公式

数学公式不会被当成普通代码块。

当前实现会把 KaTeX 行内和块级公式映射成：

1. `equation` inline

### 表格

表格不会只保留成一坨 HTML，而是会拆成：

1. `table`
2. `table_cell`
3. cell 下的文本或富内容块

### 可嵌入链接

某些“单独成段、且命中支持列表”的链接，会被直接提升成：

1. `iframe`

这意味着它们后面不再走普通文本链接路径。

## 这一步刻意不做什么

虽然这一步已经很重，但它仍然没有负责一些发布期能力。

例如：

1. Mermaid 最终落成 `text-drawing` 还是 `board`
2. 表格列宽启发式和数字列右对齐
3. 本地附件和图片的发布期 patch
4. 真实飞书媒体上传

这些能力被放到了更后面的阶段，因为它们更偏“发布目标决策”，而不是纯 Markdown 语义。

## 为什么 `Markdown -> LAST` 要保持确定性

这条链路是后续调试和测试的基础，所以当前实现非常强调确定性。

从测试可以看出，同一份 Markdown 输入，多次转换应得到相同的 `LAST` 结果。

这能保证：

1. dry-run 结果稳定
2. fixture 测试稳定
3. 后续 patch 行为更容易定位

## 发生问题时怎么排

如果你怀疑问题出在这一层，推荐按下面顺序看：

1. `02-hast/hast.json`
2. `03-last/last.json`
3. `tests/pipeline.md-hast-last.test.ts`

一个简单判断方法是：

1. `hast.json` 已经不对，问题更可能在 `md-to-hast`
2. `hast.json` 正常，但 `last.json` 不对，问题更可能在 `hast-to-last`

## 源码入口

最值得先读的源码入口是：

1. `src/pipeline/markdown/md-to-hast.ts`
2. `src/pipeline/hast-to-last.ts`
3. `tests/pipeline.md-hast-last.test.ts`

## 下一步阅读

理解这条链路后，下一步通常看：

1. `docs/04-internals/last-btt-lark-models.md`
2. `docs/04-internals/publish-rendering-flow.md`
3. `docs/02-guides/title-and-heading-policy.md`
