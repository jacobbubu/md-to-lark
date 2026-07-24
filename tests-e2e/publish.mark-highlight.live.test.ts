import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { publishMdToLark } from '../src/commands/publish-md/command.js';
import { buildE2ETitle, getLiveE2ESkipReason, loadLiveE2EConfig } from './helpers/live-env.js';
import { createLiveLarkContext, fetchLiveDocumentBlocks, waitForDocumentIdByTitle } from './helpers/live-lark.js';
import { createTempDir, withSilencedConsole } from './helpers/test-support.js';

interface LiveTextRun {
  text: string;
  style: Record<string, unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectLiveTextRuns(value: unknown): LiveTextRun[] {
  const runs: LiveTextRun[] = [];
  const seen = new WeakSet<object>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    const record = node as {
      text_run?: {
        content?: unknown;
        text_element_style?: unknown;
      };
    };
    if (typeof record.text_run?.content === 'string') {
      const style =
        record.text_run.text_element_style && typeof record.text_run.text_element_style === 'object'
          ? (record.text_run.text_element_style as Record<string, unknown>)
          : {};
      runs.push({
        text: record.text_run.content,
        style,
      });
    }

    for (const child of Object.values(record)) {
      visit(child);
    }
  };

  visit(value);
  return runs;
}

async function waitForLiveTextRuns(
  ctx: ReturnType<typeof createLiveLarkContext>,
  documentId: string,
): Promise<LiveTextRun[]> {
  let lastRuns: LiveTextRun[] = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const blocks = await fetchLiveDocumentBlocks(ctx, documentId);
    lastRuns = collectLiveTextRuns(blocks);
    const highlighted = lastRuns.filter((run) => run.style.background_color === 3);
    if (
      highlighted.some((run) => run.text === '重点内容') &&
      highlighted.some((run) => run.text === '加粗重点' && run.style.bold === true) &&
      highlighted.some((run) => run.text === '链接重点' && typeof run.style.link === 'object')
    ) {
      return lastRuns;
    }
    if (attempt < 7) {
      await sleep(1_000);
    }
  }

  throw new Error(`Unable to read back highlighted text runs. Last runs=${JSON.stringify(lastRuns)}`);
}

test('live publish maps markdown mark tags to Feishu yellow text background', async (t) => {
  const live = await loadLiveE2EConfig();
  if (!live) {
    return t.skip(getLiveE2ESkipReason());
  }

  const dir = await createTempDir('mark-highlight');
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const markdownPath = path.join(dir, 'mark-highlight.md');
  const title = buildE2ETitle(live, 'mark-highlight');
  await writeFile(
    markdownPath,
    [
      '# Mark Highlight',
      '',
      'Before <mark>重点内容</mark> after.',
      '',
      '<mark>**加粗重点** [链接重点](https://example.com)</mark>',
      '',
      'Use `<mark>literal</mark>` literally.',
      '',
      '```md',
      '<mark>code</mark>',
      '```',
      '',
    ].join('\n'),
    'utf8',
  );

  const results = await withSilencedConsole(async () => {
    return publishMdToLark(
      {
        inputPath: markdownPath,
        title,
        titleDatePrefix: false,
        folderToken: live.folderToken,
        pipelineCacheDir: path.join(dir, 'cache'),
        dryRun: false,
      },
      live.env,
    );
  });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, 'published');

  const ctx = createLiveLarkContext(live);
  const documentId = results[0]?.documentId ?? (await waitForDocumentIdByTitle(ctx, title));
  const runs = await waitForLiveTextRuns(ctx, documentId);

  assert.ok(runs.some((run) => run.text === '<mark>literal</mark>' && run.style.background_color !== 3));
  assert.ok(runs.some((run) => run.text.includes('<mark>code</mark>') && run.style.background_color !== 3));
});
