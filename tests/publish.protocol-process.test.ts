import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { publishMdToLark } from '../src/index.js';

const env = {
  LARK_APP_ID: 'test-app',
  LARK_APP_SECRET: 'test-secret',
  LARK_BASE_URL: 'https://open.feishu.cn',
};

async function setupProtocolArticle(
  t: test.TestContext,
  body: string,
): Promise<{ dir: string; inputPath: string; reportPath: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'md-to-lark-protocol-process-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const inputPath = path.join(dir, 'index.md');
  const reportPath = path.join(dir, 'reports', 'index.lark-report.json');
  await writeFile(
    inputPath,
    `---\narticle_render:\n  protocol: article-render/v1\n  contracts:\n    lark: ./index.lark.yml\n---\n${body}`,
  );
  await writeFile(
    path.join(dir, 'index.lark.yml'),
    `protocol: article-render/v1\nrenderer: lark\ndocument:\n  source: index.md\nrequirements:\n  - semantic-directives\n  - lark-callout\n  - local-images\n  - image-display-size\n  - katex\n  - native-tables\nstrict: true\ntargets:\n  lark:\n    footnotes:\n      render: callout\n      image_policy: sibling-after\n    figures:\n      default_width_ratio: 1\n      preserve_source_ratio: true\n    tables:\n      invalid_table: error\n    math:\n      renderer: katex\n      currency_policy: protect\n      unsupported_command: error\n`,
  );
  return { dir, inputPath, reportPath };
}

test('protocol dry-run writes contract, semantic, LAST, BTT and render report artifacts', async (t) => {
  const article = await setupProtocolArticle(
    t,
    `# Protocol\n\n:::figure{#fig-a}\n![](assets/a.png)\n\n::caption[Caption]\n:::\n`,
  );
  await writeFile(path.join(article.dir, 'assets-placeholder'), '');
  const assetsDir = path.join(article.dir, 'assets');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(assetsDir);
  await writeFile(path.join(assetsDir, 'a.png'), 'not-a-real-png');
  await writeFile(
    path.join(assetsDir, 'manifest.yml'),
    `version: 1\nimages:\n  "assets/a.png":\n    display_ratio: 0.5\n    aspect_ratio: 2\n`,
  );
  const cacheDir = path.join(article.dir, 'cache');
  const results = await publishMdToLark(
    {
      inputPath: article.inputPath,
      folderToken: 'folder-token',
      resourceBaseDir: article.dir,
      pipelineCacheDir: cacheDir,
      renderReportPath: article.reportPath,
      downloadRemoteImages: false,
      titleDatePrefix: false,
      dryRun: true,
    },
    env,
  );
  assert.equal(results[0]?.status, 'dry-run');
  const report = JSON.parse(await readFile(article.reportPath, 'utf8')) as {
    protocol?: string;
    counts?: {
      source?: { figures?: number };
      emitted?: { lastByType?: Record<string, number>; bttByBlockType?: Record<string, number> };
    };
    imageSizing?: Array<{ matchedManifestKey?: string; widthRatio?: number }>;
  };
  assert.equal(report.protocol, 'article-render/v1');
  assert.equal(report.counts?.source?.figures, 1);
  assert.equal(report.counts?.emitted?.lastByType?.image, 1);
  assert.equal(report.counts?.emitted?.bttByBlockType?.['27'], 1);
  assert.deepEqual(report.imageSizing?.[0], {
    imageSrc: 'assets/a.png',
    matchedManifestKey: 'assets/a.png',
    matchedBy: 'path',
    widthRatio: 0.5,
    aspectRatio: 2,
  });
  const cacheEntries = (await import('node:fs/promises')).readdir(cacheDir);
  const [stageName] = await cacheEntries;
  assert.ok(stageName);
  for (const stage of [
    '00-source',
    '01-contract',
    '02-prepare',
    '03-hast',
    '04-semantic',
    '05-last',
    '06-btt',
    '07-publish',
  ]) {
    await readFile(
      path.join(
        cacheDir,
        stageName!,
        stage,
        stage === '01-contract'
          ? 'selected.json'
          : stage === '04-semantic'
            ? 'semantic.json'
            : stage === '07-publish'
              ? 'result.json'
              : stage === '00-source'
                ? 'meta.json'
                : stage === '02-prepare'
                  ? 'result.json'
                  : stage === '03-hast'
                    ? 'hast.json'
                    : stage === '05-last'
                      ? 'last.json'
                      : 'btt.json',
      ),
    );
  }
});

test('strict semantic errors stop before any remote document mutation', async (t) => {
  const article = await setupProtocolArticle(t, `# Invalid\n\n:::unknown{#bad}\ntext\n:::\n`);
  await assert.rejects(
    () =>
      publishMdToLark(
        {
          inputPath: article.inputPath,
          folderToken: '',
          documentId: 'doc_never-mutated',
          resourceBaseDir: article.dir,
          pipelineCacheDir: path.join(article.dir, 'cache'),
          renderReportPath: article.reportPath,
          downloadRemoteImages: false,
          titleDatePrefix: false,
          dryRun: false,
        },
        env,
      ),
    /semantic validation failed/,
  );
  const report = JSON.parse(await readFile(article.reportPath, 'utf8')) as { errors?: Array<{ code?: string }> };
  assert.ok(report.errors?.some((error) => error.code === 'unknown-directive'));
});

test('strict raw HTML stops before LAST and BTT generation with a render report diagnostic', async (t) => {
  const article = await setupProtocolArticle(
    t,
    [
      '# Raw HTML',
      '',
      'Before.[^1]',
      '',
      '<table>',
      '  <tr><td>Plan A[^2]</td></tr>',
      '</table>',
      '',
      '[^1]: Before.',
      '[^2]: Inside.',
    ].join('\n'),
  );
  const cacheDir = path.join(article.dir, 'cache');
  await assert.rejects(
    () =>
      publishMdToLark(
        {
          inputPath: article.inputPath,
          pipelineCacheDir: cacheDir,
          renderReportPath: article.reportPath,
          downloadRemoteImages: false,
          titleDatePrefix: false,
          dryRun: true,
        },
        {},
      ),
    /semantic validation failed.*Raw HTML <table>/,
  );
  const report = JSON.parse(await readFile(article.reportPath, 'utf8')) as {
    errors?: Array<{ code?: string; line?: number; column?: number }>;
    warnings?: Array<{ code?: string; message?: string }>;
  };
  assert.ok(
    report.errors?.some((error) => error.code === 'unsupported-raw-html' && error.line === 5 && error.column === 1),
  );
  assert.equal(
    report.warnings?.some((warning) => warning.code === 'unreferenced-footnote' && warning.message?.includes('2')),
    false,
  );
  const [stageName] = await (await import('node:fs/promises')).readdir(cacheDir);
  await assert.rejects(() => readFile(path.join(cacheDir, stageName!, '05-last', 'last.json')));
});

test('protocol dry-run reports one real equation when prose contains multiple currency amounts', async (t) => {
  const article = await setupProtocolArticle(
    t,
    [
      '# Currency',
      '',
      'Revenue rises from $45,000 per person to $1M per person.',
      '',
      'The median is $50k/year, the floor is $1M, and later becomes $10M.',
      '',
      'Aid rises from $1,200 to $10k per person.',
      '',
      'Real math must remain math: $P(y \\mid x)$.',
    ].join('\n'),
  );
  await publishMdToLark(
    {
      inputPath: article.inputPath,
      pipelineCacheDir: path.join(article.dir, 'cache'),
      renderReportPath: article.reportPath,
      downloadRemoteImages: false,
      singleDollarTextMath: true,
      titleDatePrefix: false,
      dryRun: true,
    },
    {},
  );
  const report = JSON.parse(await readFile(article.reportPath, 'utf8')) as {
    counts?: { source?: { equations?: number } };
    warnings?: unknown[];
    errors?: unknown[];
  };
  assert.equal(report.counts?.source?.equations, 1);
  assert.deepEqual(report.warnings, []);
  assert.deepEqual(report.errors, []);
});
