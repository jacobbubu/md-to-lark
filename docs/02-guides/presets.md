# Preset 怎么用

## 这篇文档解决什么问题

这篇文档回答一个问题：怎样在正式进入发布流水线之前，先对 Markdown 做一层可编程改写。

如果你想批量修正文档格式、补链接、改标题、做内容归一化，或者把某类平台特有语法改成更适合发布的写法，先看这篇。

## 默认行为

默认情况下，`publish:md` 不会对输入 Markdown 做额外改写。

只有当你显式传入 `--preset <preset_ref>` 时，工具才会在进入预处理和解析之前，先执行一次预设转换（Preset Transform）。

这一步发生在发布链路的最前面，顺序是：

1. 读取原始 Markdown。
2. 执行 preset。
3. 执行预处理。
4. 再进入 HAST、LAST、BTT 和发布阶段。

这意味着 preset 的输出会影响后面几乎所有事情，包括：

1. 标题推导。
2. 预处理输入。
3. 最终块结构。
4. dry-run 里看到的中间产物。

## 什么时候应该用 preset

适合下面几类情况：

1. 你的 Markdown 来源很多，需要先做统一清洗。
2. 某个平台导出的链接、路径或语法不适合直接发布。
3. 你想在发布前批量补标题、改链接或改写某些段落。
4. 你不想把这些“输入修正逻辑”硬编码进主发布链路。

## 一个真实例子

仓库内置了一个 `medium` preset，用来把 Medium 作者页的相对链接改写成完整链接。

使用方式：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run --preset medium
```

当前支持的内置别名是：

1. `medium`
2. `builtin:medium`
3. `preset:medium`

## 本地 preset 模块怎么写

本地 preset 建议使用 `.mjs` 文件，这样 built CLI 可以直接加载，不依赖 TypeScript loader。

一个最小可用例子：

```js
export default function transformMarkdown(markdown, context) {
  context.log('patch title for', context.inputPath);
  return markdown.replace('# Before', '# After');
}
```

然后这样调用：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run --preset ./my-preset.mjs
```

## 支持哪些导出形式

当前 preset 模块支持下面几种导出形式：

1. 默认导出函数 `default`
2. 命名导出 `transformMarkdown`
3. 命名导出 `transform`
4. 导出 `preset` 对象，且对象上有 `transformMarkdown` 或 `transform`

不管你用哪一种形式，最终都必须返回一个 Markdown 字符串。

## transform 函数能拿到什么上下文

transform 函数签名是：

```ts
(markdown, context) => string | Promise<string>
```

`context` 里可用的信息包括：

1. `inputPath`
2. `index`
3. `total`
4. `env`
5. `log()`

这些字段适合做下面几类事：

1. 根据输入文件路径做条件改写。
2. 在目录模式下区分当前是第几个文件。
3. 读取环境变量决定某些改写策略。
4. 把关键调试信息打印到控制台。

## preset 会影响哪些后续结果

最值得注意的一点是：标题推导发生在 preset 之后。

这意味着如果你的 preset 改了 Markdown 里的 H1，那么最终标题也会跟着变。

例如，假设原始输入是：

```md
# Before

content
```

preset 改写后变成：

```md
# After

content
```

那后续 dry-run 看到的标题，也会基于 `After` 推导。

## 怎么确认 preset 到底改了什么

最直接的方式是配合 dry-run 看 `00-source` 阶段：

1. `original.md` 是原始输入。
2. `preset.md` 是 preset 执行后的结果。
3. `meta.json` 会记录当前用了哪个 preset。

推荐命令：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run --preset ./my-preset.mjs
```

如果你怀疑 preset 影响了后续标题、链接或块结构，先比较 `original.md` 和 `preset.md`，再看后面的 `prepared.md`、`last.json` 和 `btt.json`。

## 常见用途

### 改写平台特有链接

例如把某个平台导出的相对链接，统一改成完整绝对链接。

### 批量修正文档标题

例如把一批输入里不规范的一级标题统一替换掉。

### 预先清洗内容

例如在进入预处理之前，就先删除无意义的前缀、补空行、改某类非标准写法。

## 边界和常见失败

### preset 文件不存在

如果传入的 preset 路径不存在，命令会直接报错，并列出当前可用的内置 preset。

### preset 不是一个文件

如果你传入的是目录而不是文件，也会直接报错。

### preset 导出形式不对

如果模块里没有导出受支持的 transform 形式，也会直接报错。

### transform 返回的不是字符串

如果 transform 返回对象、数组或其他非字符串值，命令会直接失败。

### 不建议把 preset 当成实现所有逻辑的兜底层

preset 适合做“输入改写”。

如果你想做的是：

1. 调整表格列宽策略。
2. 改附件识别方式。
3. 改 Mermaid 渲染策略。
4. 改飞书写入逻辑。

这些都不属于 preset 的职责，应该去 guide 或 internals 的对应部分处理。

## 下一步阅读

如果你已经知道怎么写 preset，下一步通常看：

1. `docs/02-guides/pipeline-cache-and-dry-run.md`
2. `docs/02-guides/title-and-heading-policy.md`
3. `docs/04-internals/architecture-overview.md`
