import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { publishMdToLark } from '../src/commands/publish-md/command.js';
import { buildE2ETitle, getLiveE2ESkipReason, loadLiveE2EConfig } from './helpers/live-env.js';
import {
  createEmptyDocumentForE2E,
  createLiveLarkContext,
  waitForLiveDocumentSnapshot,
} from './helpers/live-lark.js';
import { createTempDir, withSilencedConsole } from './helpers/test-support.js';

test('live publish rewrites an existing Feishu doc when --doc is used', async (t) => {
  const live = await loadLiveE2EConfig();
  if (!live) {
    return t.skip(getLiveE2ESkipReason());
  }

  const dir = await createTempDir('existing-doc');
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const firstMarkdownPath = path.join(dir, 'first.md');
  const secondMarkdownPath = path.join(dir, 'second.md');
  await writeFile(firstMarkdownPath, 'Before paragraph.\n', 'utf8');
  await writeFile(secondMarkdownPath, '# After Heading\n\nAfter paragraph.\n', 'utf8');

  const ctx = createLiveLarkContext(live);
  const documentId = await createEmptyDocumentForE2E(ctx, buildE2ETitle(live, 'existing-doc'));

  await withSilencedConsole(async () => {
    await publishMdToLark(
      {
        inputPath: firstMarkdownPath,
        documentId,
        folderToken: live.folderToken,
        titleDatePrefix: false,
        pipelineCacheDir: path.join(dir, 'cache-first'),
        dryRun: false,
      },
      live.env,
    );
  });

  await withSilencedConsole(async () => {
    await publishMdToLark(
      {
        inputPath: secondMarkdownPath,
        documentId,
        folderToken: live.folderToken,
        titleDatePrefix: false,
        pipelineCacheDir: path.join(dir, 'cache-second'),
        dryRun: false,
      },
      live.env,
    );
  });

  const snapshot = await waitForLiveDocumentSnapshot(
    ctx,
    documentId,
    (current) => /After paragraph\./.test(current.markdown),
    'existing doc rewritten with second markdown paragraph',
  );

  assert.doesNotMatch(snapshot.markdown, /Before paragraph\./);
  assert.ok((snapshot.blockTypes.Text ?? 0) >= 1);
});
