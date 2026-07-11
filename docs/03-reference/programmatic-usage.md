# 程序化调用参考

## 这份参考覆盖什么范围

这份文档只覆盖当前仓库对外暴露的程序化调用面。

如果你想从脚本或代码里调用发布流水线，而不是走 CLI，先看这篇。

## 当前导出面

根导出除发布入口外，也包含 renderer contract 的发现和校验 API：

1. `publishMdToLark`
2. `PublishMdCliOptions`
3. `PublishMdResult`
4. `PublishMdToLarkOptions`
5. `resolveRendererContract`
6. `validateRendererContract`
7. `getRendererCapabilities`

也就是说，当前对外程序化调用的主入口就是：

1. `publishMdToLark(options, env)`

## 函数签名

可以把它理解成：

```ts
const results = await publishMdToLark(options, env);
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

`documentUrl` 的来源优先级是：

1. `options.documentBaseUrl`
2. `env.LARK_DOCUMENT_BASE_URL`
3. 未配置时回退到当前兼容推导逻辑

## `options` 主要字段

当前最常用字段有：

1. `inputPath`
2. `folderToken`
3. `documentId`
4. `documentBaseUrl`
5. `resourceBaseDir`
6. `title`
7. `titleDatePrefix`
8. `presetPath`
9. `presetPaths`
10. `downloadRemoteImages`
11. `ytDlpPath`
12. `ytDlpCookiesPath`
13. `pipelineCacheDir`
14. `singleDollarTextMath`
15. `imageSizeResolver`
16. `mermaidTarget`
17. `mermaidBoardSyntaxType`
18. `mermaidBoardStyleType`
19. `mermaidBoardDiagramType`
20. `dryRun`
21. `renderer`
22. `rendererContractPath`
23. `rendererDefaultContractPath`
24. `strict`
25. `renderReportPath`
26. `imageSizeManifestPath`

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
    documentBaseUrl: process.env.LARK_DOCUMENT_BASE_URL,
    resourceBaseDir: './test-md/comp',
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

## 论文或 LaTeX 密集 Markdown

默认情况下，程序化调用和 CLI 一样不会把 `$...$` 当作行内公式解析。

如果调用方正在发布论文、arXiv 提取内容，或者其他明确使用单美元行内公式的 Markdown，可以显式传：

```ts
const results = await publishMdToLark(
  {
    inputPath: './paper.md',
    folderToken: process.env.LARK_FOLDER_TOKEN ?? '',
    singleDollarTextMath: true,
    dryRun: true,
  },
  process.env,
);
```

这个选项只影响 Markdown parser：

1. 开启后 `$x_t$` 会进入 inline equation
2. 默认关闭可以避免 `$20.47`、`$1.6T` 这类金额被误判为公式
3. inline code 和 fenced code block 里的 `$...$` 仍会按代码处理

## 图片显示宽度

默认情况下，图片块仍使用当前默认显示宽度。

如果调用方在抓取阶段已经保存了图片相对正文容器的展示比例，可以通过 `imageSizeResolver` 按 Markdown 原始 `src` 提供尺寸信息：

```ts
const manifest = {
  images: {
    'assets/full.webp': { display_ratio: 1 },
    'assets/half.webp': { display_ratio: 0.5 },
    'assets/small.webp': { display_ratio: 0.3 },
  },
};

const results = await publishMdToLark(
  {
    inputPath: './article.md',
    folderToken: process.env.LARK_FOLDER_TOKEN ?? '',
    imageSizeResolver(src, context) {
      return {
        widthRatio: manifest.images[src]?.display_ratio,
      };
    },
    dryRun: true,
  },
  process.env,
);
```

规则：

1. `src` 是 Markdown 原始图片路径，例如 `assets/image-1.webp`
2. 普通图片和 linked image `[![](src)](href)` 都会调用 resolver
3. `widthRatio` 要满足 `0 < widthRatio <= 1`
4. `widthRatio` 非法时会被忽略并打印 warning
5. 如果没有返回尺寸信息，图片保持旧行为
6. `context` 会提供 `inputPath`、`resourceBaseDir`、`alt`、`title`

当前实现把 `widthRatio` 映射到飞书 image block 的 `width` 字段，也就是默认正文宽度乘以该比例；`widthPx` 也可作为低优先级的绝对宽度备用值。

也可以直接传 `assets/manifest.yml`：

```ts
await publishMdToLark(
  {
    inputPath: './article/index-zh.md',
    resourceBaseDir: './article',
    folderToken: process.env.LARK_FOLDER_TOKEN ?? '',
    imageSizeManifestPath: './article/assets/manifest.yml',
    dryRun: true,
  },
  process.env,
);
```

manifest 支持 Markdown 相对路径、`./` 路径、绝对路径、原始 `source_url` 和远程图片下载后的临时路径别名。比例优先于像素宽度，最终宽度不会超过飞书正文默认宽度；有 `aspect_ratio` 时会同步写入高度。

## article-render/v1

有 renderer contract 时，发布器进入协议模式；没有合同时继续使用 legacy 行为。

```ts
await publishMdToLark(
  {
    inputPath: './article/index-zh.md',
    resourceBaseDir: './article',
    folderToken: process.env.LARK_FOLDER_TOKEN ?? '',
    renderer: 'lark',
    rendererContractPath: './article/index-zh.lark.yml',
    strict: true,
    renderReportPath: './article/reports/index-zh.lark-report.json',
    dryRun: true,
  },
  process.env,
);
```

合同选择优先级是：显式 `rendererContractPath`、frontmatter 声明、同目录 `<basename>.lark.yml`、`rendererDefaultContractPath`。协议模式会移除 frontmatter，并在远端文档创建或清空前完成 capability、directive、footnote、KaTeX、资源和 Lark parent-child 校验。

如果调用方把 Markdown 复制到临时目录，应该把原文章合同解析成绝对路径后传入 `rendererContractPath`；`resourceBaseDir` 仍指向原文章目录。

## 一个真实发布例子

```ts
import { publishMdToLark } from '../src/index.ts';

const results = await publishMdToLark(
  {
    inputPath: './test-md/comp/comp.md',
    folderToken: process.env.LARK_FOLDER_TOKEN ?? '',
    documentBaseUrl: process.env.LARK_DOCUMENT_BASE_URL,
    resourceBaseDir: './test-md/comp',
    presetPaths: ['zh-format', './my-preset.mjs'],
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
2. `presetPaths`

推荐优先使用：

1. `presetPaths`

执行规则：

1. `presetPaths` 里的多个 preset 会按顺序执行
2. 如果同时传了 `presetPaths` 和 `presetPath`，优先使用 `presetPaths`

`resourceBaseDir` 的规则是：

1. 只影响本地相对图片和附件解析
2. 默认不传时，仍然相对当前 Markdown 文件所在目录解析
3. 如果你的调用方先生成临时 Markdown，再交给发布器处理，应该显式传原始资源目录

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
