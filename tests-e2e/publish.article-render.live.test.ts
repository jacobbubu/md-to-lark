import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { publishMdToLark } from '../src/commands/publish-md/command.js';
import { buildE2ETitle, getLiveE2ESkipReason, loadLiveE2EConfig } from './helpers/live-env.js';
import { createLiveLarkContext, fetchLiveDocumentBlocks, waitForDocumentIdByTitle } from './helpers/live-lark.js';
import { createTempDir, withSilencedConsole } from './helpers/test-support.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sampleImagePath = path.resolve(currentDir, '../test-md/comp/assets/medium.png');

test('live article-render/v1 publish verifies native image, table and callout blocks', async (t) => {
  const live = await loadLiveE2EConfig();
  if (!live) return t.skip(getLiveE2ESkipReason());

  const dir = await createTempDir('article-render');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const assetsDir = path.join(dir, 'assets');
  await mkdir(assetsDir);
  await copyFile(sampleImagePath, path.join(assetsDir, 'figure.png'));
  const markdownPath = path.join(dir, 'article.md');
  const contractPath = path.join(dir, 'article.lark.yml');
  const reportPath = path.join(dir, 'reports', 'article.lark-report.json');
  const title = buildE2ETitle(live, 'article-render-v1');
  await writeFile(
    markdownPath,
    `---\narticle_render:\n  protocol: article-render/v1\n  contracts:\n    lark: ./article.lark.yml\n---\n# Article Renderer\n\n:::figure{#fig-live}\n[![Live figure](assets/figure.png)](https://example.com/original)\n\n::caption[Live caption]\n:::\n\n:::table{#tbl-live}\n| Name | Value |\n| --- | ---: |\n| Alpha | 42 |\n\n::caption[Live table]\n:::\n\nStatement[^1].\n\n[^1]: Footnote with **bold** and a [link](https://example.com).\n`,
  );
  await writeFile(
    contractPath,
    `protocol: article-render/v1\nrenderer: lark\ndocument: { source: article.md }\nrequirements: [gfm-footnotes, semantic-directives, lark-callout, local-images, image-display-size, katex, native-tables]\nstrict: true\ntargets:\n  lark:\n    footnotes:\n      render: callout\n      image_policy: sibling-after\n    figures:\n      default_width_ratio: 1\n      preserve_source_ratio: true\n    tables:\n      invalid_table: error\n    math:\n      renderer: katex\n      currency_policy: protect\n      unsupported_command: error\n`,
  );
  await writeFile(
    path.join(assetsDir, 'manifest.yml'),
    `version: 1\nimages:\n  "assets/figure.png":\n    display_ratio: 0.5\n`,
  );

  const results = await withSilencedConsole(() =>
    publishMdToLark(
      {
        inputPath: markdownPath,
        title,
        titleDatePrefix: false,
        folderToken: live.folderToken,
        resourceBaseDir: dir,
        rendererContractPath: contractPath,
        strict: true,
        renderReportPath: reportPath,
        pipelineCacheDir: path.join(dir, 'cache'),
        dryRun: false,
      },
      live.env,
    ),
  );
  assert.equal(results[0]?.status, 'published');
  const ctx = createLiveLarkContext(live);
  const documentId = results[0]?.documentId ?? (await waitForDocumentIdByTitle(ctx, title));
  const blocks = await fetchLiveDocumentBlocks(ctx, documentId);
  assert.equal(blocks.filter((block) => block.block_type === 27).length, 1);
  assert.equal(blocks.filter((block) => block.block_type === 31).length, 1);
  assert.equal(blocks.filter((block) => block.block_type === 19).length, 1);
  const image = blocks.find((block) => block.block_type === 27)?.image as { width?: number } | undefined;
  assert.equal(image?.width, 500);
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
    counts?: { remote?: { byBlockType?: Record<string, number> } };
  };
  assert.equal(report.counts?.remote?.byBlockType?.['27'], 1);
  assert.equal(report.counts?.remote?.byBlockType?.['31'], 1);
  assert.equal(report.counts?.remote?.byBlockType?.['19'], 1);
});
