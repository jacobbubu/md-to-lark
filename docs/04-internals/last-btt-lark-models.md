# LAST、BTT 与 Lark 模型

## 这篇文档解决什么问题

这篇文档回答一个问题：为什么这套工具内部同时存在 `LAST`、`BTT` 和 `Lark` 原始类型三层模型，它们各自承载什么职责。

如果你已经看过架构总览，但还不清楚“到底该在哪一层改东西”，先看这篇。

## 一句话结论

这三层不是重复建模，而是故意分开的：

1. `LAST` 负责文档语义
2. `BTT` 负责发布前树结构
3. `Lark` 类型负责飞书原始 payload 与客户端边界

## `LAST` 是什么

`LAST` 的全名可以理解成：

1. Lark AST

它不是 HTML AST，也不是飞书原始 API 响应。

它的目标是：

1. 把 Markdown 转换成面向飞书语义的内部表示
2. 保持结构清晰、可查询、可修改
3. 为后续 roundtrip 和结构化编辑保留空间

### `LAST` 最重要的特点

1. block 和 inline 都有稳定 id
2. block 类型已经是飞书语义类型名，例如 `text`、`heading1`、`table`
3. 维护了索引，方便后续按类型和文本作用域查找
4. 能被进一步结构化修改，而不只是一次性序列化

### `LAST` 更适合干什么

1. 语义层转换
2. 标题、列表、表格等结构理解
3. 结构化查找和替换
4. 回写 Markdown

## `BTT` 是什么

`BTT` 是另一层内部中间表示，位置比 `LAST` 更靠近飞书写入。

它的核心特点是：

1. 它是树
2. 每个节点都带着 `rawBlock`
3. 同时保留 flat block 映射，方便按 id 直接找块

### `BTT` 最重要的字段

从结构上看，`BTTDocument` 里最关键的是：

1. `root`
2. `flatBlocks`
3. `rootBlockId`
4. `missingChildren`

而 `BTTNode` 里最关键的是：

1. `blockId`
2. `blockType`
3. `rawBlock`
4. `children`

### `BTT` 更适合干什么

1. 发布前 patch
2. 递归渲染
3. 在树结构上对某一类块做目标态改写

## `Lark` 类型是什么

`src/lark/types.ts` 承载的是飞书边界类型。

这里的对象更贴近飞书开放接口原始返回值或提交 payload，例如：

1. `LarkDocxBlock`
2. `LarkDriveFile`
3. `LarkApiEnvelope`
4. `LarkClientConfig`

这些类型的职责不是提供高级语义，而是：

1. 对齐飞书接口形状
2. 承担 SDK / API 边界的最小约束

## 为什么不能只保留一种模型

如果只有 `Lark` 原始类型：

1. 语义会过于贴近 API
2. 后续结构化修改会很痛苦
3. 很多发布前决策会混进供应商边界

如果只有 `LAST`：

1. 渲染器需要在写飞书前做太多临时转换
2. 树结构渲染和局部 patch 会更别扭

如果只有 `BTT`：

1. 又会丢掉 `LAST` 那种更适合编辑和语义操作的层

所以当前三层分工是有必要的。

## 它们之间的关系

主关系可以这样理解：

```text
Markdown
-> LAST
-> BTT
-> Lark raw block payload
-> Feishu API
```

其中：

1. `LAST -> BTT` 是内部模型转换
2. `BTT -> Lark raw block` 更像发布前组织
3. 真正进入 API 写入，则发生在 `lark/docx` 层

## `LAST -> BTT` 在做什么

这一层主要负责：

1. 把 `fragment` 形式的 `LAST` 规范成可构树的文档模型
2. 建立 `LAST block id -> BTT block id` 映射
3. 把语义块转换成更贴近飞书 block 的 `rawBlock`
4. 再交给 `buildBTT` 构成完整树

所以 `BTT` 不是凭空生成的，它是从 `LAST` 规范化后推出来的。

## `BTT -> LAST` 为什么也存在

当前项目不是只有单向发布链路，还保留了反向转换能力。

`convertBTTToLAST` 的存在说明：

1. `LAST` 被当成核心内部语义层，而不是一次性临时格式
2. 项目已经在为 roundtrip、结构化编辑和调试保留接口

## 最关键的设计区别

可以用一个更直观的方式理解：

### `LAST`

回答的是：

1. 这段内容“是什么”

### `BTT`

回答的是：

1. 这组块“怎么组织成树去发布”

### `Lark raw`

回答的是：

1. 这次具体要给飞书接口发什么字段

## 什么时候该改哪一层

如果你要改的是：

1. Markdown 语义理解
   改 `LAST`
2. 发布前目标态 patch
   改 `BTT` 相关流程
3. 飞书字段写法、请求顺序、上传替换
   改 `Lark docx` 层

一个常见误区是把“发布目标决策”直接塞进 `LAST`，这通常会让语义层被供应商细节污染。

## 源码入口

最值得先读的是：

1. `src/last/types.ts`
2. `src/btt/types.ts`
3. `src/lark/types.ts`
4. `src/interop/last-to-btt.ts`
5. `src/interop/btt-to-last.ts`

## 下一步阅读

理解三层模型之后，下一步通常看：

1. `docs/04-internals/publish-rendering-flow.md`
2. `docs/04-internals/markdown-to-last.md`
3. `docs/04-internals/testing-and-debugging.md`
