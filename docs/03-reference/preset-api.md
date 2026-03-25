# Preset API 参考

## 这份参考覆盖什么范围

这份文档只回答 preset 模块契约本身，也就是：

1. 模块怎么导出
2. transform 函数签名是什么
3. context 里有哪些字段
4. 返回值有什么约束

如果你是在查“preset 到底适合拿来做什么”，先看：

1. `docs/02-guides/presets.md`

## transform 函数签名

当前约定是：

```ts
(markdown, context) => string | Promise<string>
```

其中：

1. `markdown` 是当前输入文件的 Markdown 文本
2. `context` 是当前文件的 preset 执行上下文

## `context` 字段

当前可用字段有：

### `inputPath`

当前输入文件路径。

适合用来：

1. 按文件路径做条件改写

### `index`

当前文件在本次发布输入集合中的序号，从 `0` 开始。

适合用来：

1. 目录模式下做顺序相关日志

### `total`

本次发布输入集合的总文件数。

### `env`

当前运行时可见的环境变量对象。

适合用来：

1. 让 preset 读取额外开关

### `log(...args)`

preset 专用日志函数。

作用：

1. 把调试信息输出到控制台
2. 输出时会自动带上当前 preset 执行上下文前缀

## 支持哪些模块导出形式

当前支持下面几种形式，按解析顺序尝试：

1. `default`
2. `transformMarkdown`
3. `transform`
4. `preset`

其中：

1. 如果 `default` 是函数，直接拿来当 transform
2. 如果 `transformMarkdown` 是函数，直接使用
3. 如果 `transform` 是函数，直接使用
4. 如果 `preset` 是对象，且对象上有 `transformMarkdown` 或 `transform`，也可使用

## 返回值约束

transform 最终必须返回：

1. 字符串

允许：

1. 同步返回字符串
2. 异步返回 `Promise<string>`

不允许：

1. 返回对象
2. 返回数组
3. 返回 `null`
4. 返回 `undefined`

如果返回的不是字符串，当前实现会直接报错。

## 一个最小模块示例

默认导出函数：

```js
export default function transformMarkdown(markdown, context) {
  context.log('rewrite title for', context.inputPath);
  return markdown.replace('# Before', '# After');
}
```

命名导出函数：

```js
export function transformMarkdown(markdown) {
  return markdown + '\n# patched';
}
```

对象形式：

```js
export const preset = {
  transform(markdown) {
    return markdown.replace(/foo/g, 'bar');
  },
};
```

## 内置 preset

当前内置 preset 有：

1. `medium`
2. `zh-smart-quotes`

可用别名：

1. `medium`
2. `builtin:medium`
3. `preset:medium`
4. `zh-smart-quotes`
5. `cn-smart-quotes`
6. `builtin:zh-smart-quotes`
7. `preset:zh-smart-quotes`

它们的作用分别是：

1. `medium`：把 Medium 作者页相对链接改写成绝对链接。
2. `zh-smart-quotes`：把中文语境正文中的半角双引号改写成 `“”`，同时避免误改 frontmatter、代码块、行内代码和链接目标。

## 加载行为

preset 加载顺序是：

1. 先尝试解析成内置 preset 名称
2. 如果不是内置名称，再按文件路径解析本地模块

本地模块路径会被解析成绝对路径后再导入。

## 错误行为

当前最常见的错误有：

1. preset 模块路径不存在
2. preset 路径不是文件
3. 模块导出形式不符合约定
4. transform 返回了非字符串值
5. 模块导入本身失败

这些错误会直接终止本次命令，而不是静默跳过。

## 建议

如果你在写本地 preset，当前最稳妥的做法是：

1. 用 `.mjs`
2. 导出一个清晰的 `default` 或 `transformMarkdown`
3. 只做输入改写，不把发布逻辑塞进去

## 相关文档

和这份参考最相关的文档是：

1. `docs/02-guides/presets.md`
2. `docs/02-guides/pipeline-cache-and-dry-run.md`
3. `docs/03-reference/programmatic-usage.md`
