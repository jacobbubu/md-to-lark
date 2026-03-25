# 快速开始

## 这篇文档解决什么问题

这篇文档回答一个问题：怎样用仓库里现成的样例，在本地完成第一次 dry-run，并在准备好环境变量后执行第一次真实发布。

## 什么时候看这篇

适合下面几类情况：

1. 你已经知道这工具是干什么的，现在要亲手跑起来。
2. 你想验证本地环境、命令入口和样例输入是否都正常。
3. 你想知道第一次成功运行时，应该看到哪些输出。

## 先说结论

第一次跑通，建议按下面顺序：

1. 安装依赖。
2. 准备 `.env`。
3. 跑类型检查和测试。
4. 对样例文件执行一次 dry-run。
5. 看 `out/pipeline-cache` 里的中间产物。
6. 确认无误后，再执行真实发布。

## 前置条件

开始之前，至少准备好下面这些条件：

1. 本地可用的 Node.js 环境。
2. 仓库依赖已安装。
3. 一个可用的飞书应用配置。
4. 一个可写入的飞书文件夹 token，或者一个已有的文档 id。

最小的环境变量可以基于 [`.env.sample`](/Users/rongshen/vibe-coding/new/md-to-lark/.env.sample) 来准备，首次使用至少要保证下面几项有效：

```env
LARK_APP_ID="xxx"
LARK_APP_SECRET="xxx"
LARK_FOLDER_TOKEN="xxx"
LARK_TOKEN_TYPE=tenant
```

注意两点：

1. 当前 CLI 在 `--dry-run` 模式下也会先校验飞书应用配置，所以不是“零配置即可运行”。
2. 如果你不提供 `--doc`，那就必须提供 `LARK_FOLDER_TOKEN`，否则命令不会开始执行。

## 第一步：安装依赖并检查仓库

```bash
npm install
npm run check
npm test
```

执行成功后，说明当前代码、类型和测试都已经可用。

## 第二步：先跑一次 dry-run

第一次建议直接用仓库内置样例：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run
```

这条命令的特点是：

1. 会完整走一遍 Markdown 发布流水线。
2. 不会调用飞书写入接口。
3. 会把中间结果写入默认的 pipeline cache 目录。

如果你只想先看 Mermaid 相关输入，可以用另一个样例：

```bash
npm run publish:md -- --input ./test-md/mermaid.md --dry-run
```

## 第三步：你会看到什么

dry-run 成功后，控制台通常会出现下面这类信息：

1. 解析到了多少个 Markdown 文件。
2. 当前处理的是第几个输入。
3. 最终会使用什么标题。
4. `dry-run` 已完成，没有真正写入飞书。

同时，默认会在 [`out/`](/Users/rongshen/vibe-coding/new/md-to-lark/out) 下生成 pipeline cache 目录，按单个输入分出阶段：

1. `00-source`
2. `01-prepare`
3. `02-hast`
4. `03-last`
5. `04-btt`
6. `05-publish`

如果你想快速确认 dry-run 是否真的走通了，先看这几个文件：

1. `00-source/original.md`
2. `01-prepare/prepared.md`
3. `03-last/last.json`
4. `04-btt/btt.json`
5. `05-publish/result.json`

## 第四步：执行第一次真实发布

确认 dry-run 结果正常后，可以去掉 `--dry-run`：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md
```

如果你的 `.env` 里已经有 `LARK_FOLDER_TOKEN`，这条命令会在对应文件夹下创建新文档并写入内容。

如果你要写入一个已经存在的飞书文档，可以使用：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --doc <document_id>
```

这里要注意：

1. `--doc` 只适用于单文件模式。
2. 写入已有文档前，命令会先清空原有内容，再重新渲染。

## 第五步：几个高频变体

关闭标题日期前缀：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run --no-date-prefix
```

使用内置 preset：

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run --preset medium
```

把 Mermaid 渲染成飞书白板：

```bash
npm run publish:md -- --input ./test-md/mermaid.md --dry-run --mermaid-target board
```

## 常见失败

### 缺少 folder token

如果没有提供 `--doc`，也没有在环境变量里提供 `LARK_FOLDER_TOKEN`，命令会直接报错，不会进入发布链路。

### 以为 dry-run 不需要飞书配置

当前实现里，CLI 会先校验飞书应用配置，再进入 dry-run，所以 `LARK_APP_ID`、`LARK_APP_SECRET` 和 `LARK_TOKEN_TYPE` 仍然需要先配好。

### 目录模式下误用 `--doc`

`--doc` 只支持单个 Markdown 文件。

如果输入路径解析出来是目录模式，命令会直接拒绝执行。

### 本地附件路径丢失

本地附件或图片路径缺失时，当前实现会尽量退化为文本，而不是只因为一个本地资源缺失就让整次发布失败。

这能降低中断概率，但也意味着你需要在 dry-run 或发布结果里主动检查退化情况。

## 下一步阅读

跑通 quickstart 之后，建议按下面顺序继续：

1. `docs/02-guides/pipeline-cache-and-dry-run.md`
2. `docs/02-guides/presets.md`
3. `docs/04-internals/architecture-overview.md`
