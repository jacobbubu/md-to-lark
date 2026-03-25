# Selector 与 LAST API

## 这篇文档解决什么问题

这篇文档回答一个常见问题：我想在不走整条发布链路的情况下，做“按块查询、替换、回滚、再反序列化”这类结构化修改，应该动哪一层代码、调用哪个接口、怎么验证。

## 一句话结论

`LAST API` 是围绕 `LAST` 模型提供的可编程结构化编辑层，`createLASTApi` 是它的主入口，`createLASTDollar` 是可链式修改的核心对象，`serializeLASTToMarkdown` 是“改完以后能不能回读成可读 Markdown”的快速验证器，playground 是把这套能力暴露给交互式实验和排障的入口。

## 这五个对象的关系

从数据流看是这样的：

1. `hastToLAST` 产出 `LASTModel`（见 `src/pipeline/hast-to-last.ts`）
2. `createLASTApi(model)` 创建：
   1. `model`（当前快照）
   2. `$.`（`createLASTDollar` 返回的可选块对象）
   3. `compile()/commit()`（执行前/执行后控制）
3. 通过 `$.selector/mutation` 改变模型
4. `serializeLASTToMarkdown(api.model 或 commit.next)` 做结果可视化比对

换句话说：

1. `createLASTApi` 决定 API 形状；
2. `createLASTDollar` 决定语义行为；
3. `serializeLASTToMarkdown` 决定可读输出；
4. playground 决定交互入口。

## `createLASTApi` 做什么

`createLASTApi` 在 `src/last/api.ts` 里是一个轻量封装：

1. 调用 `createLASTDollar(model)`。
2. 返回一个对象，关键字段是：
   1. `model`：当前模型。
   2. `$`：可选块对象（`LASTDollar`）。
   3. `compile()`：返回变更计划（mutation plan）。
   4. `commit()`：提交变更并返回结果（`MutationResult`）。

它适合“工具外壳”场景，譬如 playground、测试、临时脚本；真正的大量 DOM-like 查询能力还是 `$` 里。

## `createLASTDollar` 做什么

`createLASTDollar` 是可操作核心：

1. 对传入 `model` 做深拷贝并重建索引。
2. 返回一个可调用对象 `$`，调用时可按 selector 选块：`$('<type>')`。
3. 通过链式方法实现查询与修改，例如 `text/replaceText/children/inlines/attr/style/append/remove`。
4. 支持事务性行为：
   1. `begin()` 开始事务快照
   2. `commit()` 提交
   3. `rollback()` 恢复到快照
5. `plan()` 可在不提交时看预计变更。

典型价值不是“渲染”，而是“查询-改写-验证”。

## `serializeLASTToMarkdown` 在什么阶段用

`serializeLASTToMarkdown` 在 `src/last/to-markdown.ts`，输入仍是 `LASTModel`，输出 Markdown 字符串。它是：

1. 变更前后一致性检查的快速工具；
2. playground 的“before/after”对照入口；
3. publish 发布前的语义可读性验证辅助。

它不修改模型，也不负责 API 写入，故不适合作为唯一事实源。

## playground 的角色

playground 在 `devserver/jquery-playground.ts` 负责把这条链路挂到交互页面：

1. 把示例/上传的 Markdown 转成 HAST。
2. 再转 `LAST`。
3. 用 `createLASTApi(last)` 构建 `$` 与 `api`。
4. 执行用户脚本（内置 `$`、`api`、`model`、`print`）。
5. 自动 `api.compile()` + `api.commit()`，然后用 `serializeLASTToMarkdown` 和 `markdownToHtml` 输出 `before/after`。

所以它不是生产入口，它是“在真实数据模型上快速试验 selector、改写行为、观察输出差异”的调试面。

## 适合的修改路径

如果你要改的是：

1. 选择器语法（`type`, `#id`, `attrs`, `hasText`, `bttIds` 等）或匹配行为 -> 改 `src/last/api.ts` 的 `matcherFromSelector`。
2. 新增/调整链式 API（如新增 replace 或树操作） -> 改 `src/last/api.ts` 的接口与 `LASTJQSelectionImpl`/`LASTJQScopeSelectionImpl` 实现。
3. 修改索引策略（`textScopes/byType`） -> 改 `rebuildLASTIndexes` 与 `selector`/`scope` 相关路径。
4. 改变 Markdown 回写格式 -> 改 `src/last/to-markdown.ts`。
5. 改 playground 运行变量、返回面板、日志行为 -> 改 `devserver/jquery-playground.ts` 与 `devserver/public/app.js`。

## 源码入口

按阅读顺序建议：

1. `src/last/api.ts`
2. `src/last/to-markdown.ts`
3. `src/pipeline/hast-to-last.ts`
4. `src/last/index.ts`
5. `devserver/jquery-playground.ts`
6. `devserver/public/app.js`

## 下一步阅读

1. `docs/04-internals/markdown-to-last.md`
2. `docs/04-internals/last-btt-lark-models.md`
3. `docs/04-internals/testing-and-debugging.md`
