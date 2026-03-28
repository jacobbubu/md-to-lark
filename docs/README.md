# md-to-lark 文档导航

`docs/` 用来承载这套工具的正式使用文档。

这里的文档不是按源码目录来写，而是按使用者的学习路径来写：

1. 先让第一次接触的人知道这是什么、解决什么问题、怎么成功跑一次。
2. 再让实际使用的人知道复杂输入、配置项、preset 链、资源处理和排障怎么做。
3. 最后让需要扩展、调试或二次集成的人知道内部实现和模块边界。

## 阅读顺序

如果你是第一次接触这个项目，建议按下面顺序阅读：

1. 仓库根目录的 `README.md`
2. `docs/01-getting-started/`
3. `docs/02-guides/`
4. `docs/03-reference/`
5. `docs/04-internals/`

## 当前目录

```text
docs/
  README.md
  rules/
    documentation-writing-principles.md

  01-getting-started/
    overview.md
    quickstart.md

  02-guides/
    title-and-heading-policy.md
    assets-and-attachments.md
    remote-resource-preparation.md
    mermaid-and-board.md
    presets.md
    pipeline-cache-and-dry-run.md

  03-reference/
    cli-reference.md
    environment-variables.md
    fetch-board-data.md
    preset-api.md
    programmatic-usage.md

  04-internals/
    architecture-overview.md
    markdown-to-last.md
    last-btt-lark-models.md
    publish-rendering-flow.md
    selector-and-last-api.md
    testing-and-debugging.md
```

## 各层文档负责什么

### 01 Getting Started

只回答“怎么成功用起来”。

这一层不展开内部实现，不罗列全部参数，只保留完成第一次成功运行所必需的信息。

### 02 Guides

只回答“某一类问题应该怎么正确处理”。

例如标题策略、附件与远程资源、Mermaid、preset 链、dry-run 和 pipeline cache。
每篇 guide 只围绕一个问题展开，不把多个主题揉成一篇。

### 03 Reference

只做查询，不负责教学。

这一层适合放参数表、环境变量、模块 API、输入输出约束和边界条件。
读者通常是在已经知道自己要找什么时来到这里。

### 04 Internals

只回答“这套工具内部是怎么工作的”。

这一层讲清楚主链路、数据模型、模块边界和调试入口，但不把它们塞进入门文档里。

## 写作要求

`docs/` 下的所有文档都应遵守：

- `docs/rules/documentation-writing-principles.md`

## 文档入口
已经完成的主干文档入口如下：

- `docs/01-getting-started/overview.md`
- `docs/01-getting-started/quickstart.md`
- `docs/02-guides/title-and-heading-policy.md`
- `docs/02-guides/assets-and-attachments.md`
- `docs/02-guides/remote-resource-preparation.md`
- `docs/02-guides/mermaid-and-board.md`
- `docs/02-guides/presets.md`
- `docs/02-guides/pipeline-cache-and-dry-run.md`
- `docs/03-reference/cli-reference.md`
- `docs/03-reference/environment-variables.md`
- `docs/03-reference/fetch-board-data.md`
- `docs/03-reference/preset-api.md`
- `docs/03-reference/programmatic-usage.md`
- `docs/04-internals/architecture-overview.md`
- `docs/04-internals/markdown-to-last.md`
- `docs/04-internals/last-btt-lark-models.md`
- `docs/04-internals/publish-rendering-flow.md`
- `docs/04-internals/selector-and-last-api.md`
- `docs/04-internals/testing-and-debugging.md`
