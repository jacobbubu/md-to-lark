import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { publishMdToLark } from '../src/commands/publish-md/command.js';
import { buildE2ETitle, getLiveE2ESkipReason, loadLiveE2EConfig } from './helpers/live-env.js';
import {
  createLiveLarkContext,
  waitForDocumentIdByTitle,
  waitForLiveDocumentSnapshot,
} from './helpers/live-lark.js';
import { createTempDir, withSilencedConsole } from './helpers/test-support.js';

test('live publish renders mermaid as text-drawing when configured', async (t) => {
  const live = await loadLiveE2EConfig();
  if (!live) {
    return t.skip(getLiveE2ESkipReason());
  }

  const dir = await createTempDir('mermaid');
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const markdownPath = path.join(dir, 'mermaid.md');
  const title = buildE2ETitle(live, 'mermaid-text-drawing');
  await writeFile(
    markdownPath,
    '# Mermaid Example\n\n```mermaid\nflowchart TD\nA-->B\n```\n',
    'utf8',
  );

  await withSilencedConsole(async () => {
    await publishMdToLark(
      {
        inputPath: markdownPath,
        title,
        titleDatePrefix: false,
        folderToken: live.folderToken,
        pipelineCacheDir: path.join(dir, 'cache'),
        mermaidTarget: 'text-drawing',
        dryRun: false,
      },
      live.env,
    );
  });

  const ctx = createLiveLarkContext(live);
  const documentId = await waitForDocumentIdByTitle(ctx, title);
  const snapshot = await waitForLiveDocumentSnapshot(
    ctx,
    documentId,
    (current) => (current.blockTypes.AddOns ?? 0) >= 1,
    'mermaid rendered as add-ons block',
  );

  assert.ok((snapshot.blockTypes.AddOns ?? 0) >= 1);
  assert.equal(snapshot.blockTypes.Board ?? 0, 0);
});
