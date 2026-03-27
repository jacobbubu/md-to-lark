# 程序化调用参考

## 这份参考覆盖什么范围

这份文档只覆盖当前仓库对外暴露的程序化调用面。

如果你想从脚本或代码里调用发布流水线，而不是走 CLI，先看这篇。

## 当前导出面

当前根导出非常小，只暴露两项：

1. `publishMdToLark`
2. `PublishMdCliOptions`
3. `PublishMdResult`

也就是说，当前对外程序化调用的主入口就是：

1. `publishMdToLark(options, env)`

## 函数签名

可以把它理解成：

```ts
const results = await publishMdToLark(options, env)
```

其中：

1. `options` 描述一次发布任务
2. `env` 描述这次调用可见的环境变量

返回值是一个数组，每一项都对应一篇 Markdown 的处理结果。

每项当前包含：

1. `documentId`
2. `title`
3. `status`
4. `documentUrl`

## `options` 主要字段

当前最常用字段有：

1. `inputPath`
2. `folderToken`
3. `documentId`
4. `title`
5. `titleDatePrefix`
6. `presetPath`
7. `downloadRemoteImages`
8. `ytDlpPath`
9. `ytDlpCookiesPath`
10. `pipelineCacheDir`
11. `mermaidTarget`
12. `mermaidBoardSyntaxType`
13. `mermaidBoardStyleType`
14. `mermaidBoardDiagramType`
15. `dryRun`

这些字段和 CLI 参数大体对应。

## `env` 参数是干什么的

`env` 不是可选装饰，而是当前调用要使用的环境变量来源。

内部会用它来解析：

1. 飞书应用配置
2. 标题日期前缀默认值
3. Mermaid 默认目标
4. 预处理默认开关
5. 限流和超时参数

如果你传的 `env` 不完整，程序化调用也会像 CLI 一样失败。

## 一个最小 dry-run 例子

在仓库里用 `tsx` 运行时，可以参考：

```ts
import { publishMdToLark } from '../src/index.ts';

const results = await publishMdToLark(
  {
    inputPath: './test-md/comp/comp.md',
    folderToken: process.env.LARK_FOLDER_TOKEN ?? 'fld_demo',
    dryRun: true,
  },
  {
    ...process.env,
    LARK_APP_ID: process.env.LARK_APP_ID ?? 'demo_app_id',
    LARK_APP_SECRET: process.env.LARK_APP_SECRET ?? 'demo_app_secret',
    LARK_TOKEN_TYPE: process.env.LARK_TOKEN_TYPE ?? 'tenant',
  },
);

console.log(results);
```

当前仓库里现成的示例文件是：

1. `examples/module-usage.ts`

## 一个真实发布例子

```ts
import { publishMdToLark } from '../src/index.ts';

const results = await publishMdToLark(
  {
    inputPath: './test-md/comp/comp.md',
    folderToken: process.env.LARK_FOLDER_TOKEN ?? '',
    dryRun: false,
  },
  process.env,
);

console.log(results[0]?.documentUrl);
```

如果你要写入已有文档，可以传：

1. `documentId`

如果你要用 preset，可以传：

1. `presetPath`

## 程序化调用和 CLI 的关系

CLI 本质上也是在调用这层函数。

也就是说：

1. CLI 做的是参数解析和错误展示
2. 核心发布流水线仍然在 `publishMdToLark`

这也是为什么程序化调用和 CLI 会共享相同的主行为：

1. 同样的标题策略
2. 同样的预处理
3. 同样的 dry-run
4. 同样的 pipeline cache
5. 同样的飞书写入路径

区别在于：

1. 程序化调用直接拿返回数组
2. CLI 会把同样的结果数组打印到 stdout

## 当前程序化调用更适合做什么

适合：

1. 在仓库内部写脚本调用
2. 批量任务编排
3. 用 dry-run 做自动化检查
4. 在已有 Node.js 工具链里复用发布能力

当前不适合期待太多稳定外部 API 的场景，因为：

1. npm 包元信息虽然已经按 `@jacobbubu/md-to-lark` 配好，但对外发布流程还没扩成完整 SDK 生命周期
2. 对外导出面目前很小
3. 更多内部能力还没有整理成稳定 SDK

## 常见限制

1. `publishMdToLark` 不会替你补齐必需环境变量
2. dry-run 也会先校验飞书应用配置
3. `documentId` 只支持单文件模式
4. `folderToken` 在没有 `documentId` 时仍然必须可用

## 相关文档

如果你已经知道怎么从代码里调用，下一步通常看：

1. `docs/03-reference/cli-reference.md`
2. `docs/03-reference/environment-variables.md`
3. `docs/04-internals/architecture-overview.md`
