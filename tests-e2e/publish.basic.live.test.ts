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

test('live publish creates a new Feishu doc and readback matches basic structure', async (t) => {
  const live = await loadLiveE2EConfig();
  if (!live) {
    return t.skip(getLiveE2ESkipReason());
  }

  const dir = await createTempDir('basic');
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const markdownPath = path.join(dir, 'basic.md');
  const title = buildE2ETitle(live, 'basic');
  await writeFile(markdownPath, '# Visible Heading\n\nAlpha paragraph.\n\n- one\n- two\n', 'utf8');

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
  assert.ok(results[0]?.documentId);
  assert.match(results[0]?.documentUrl ?? '', new RegExp(`/docx/${results[0]?.documentId}$`));

  const ctx = createLiveLarkContext(live);
  const documentId = results[0]?.documentId ?? (await waitForDocumentIdByTitle(ctx, title));
  const snapshot = await waitForLiveDocumentSnapshot(
    ctx,
    documentId,
    (current) =>
      /# Visible Heading/.test(current.markdown) &&
      /Alpha paragraph\./.test(current.markdown) &&
      /- one/.test(current.markdown) &&
      /- two/.test(current.markdown),
    'basic heading and bullet content',
  );

  assert.ok(snapshot.totalBlocks >= 4);
  assert.ok((snapshot.blockTypes.Page ?? 0) >= 1);
  assert.ok((snapshot.blockTypes.Heading1 ?? 0) >= 1);
  assert.ok((snapshot.blockTypes.Text ?? 0) >= 1);
  assert.ok((snapshot.blockTypes.Bullet ?? 0) >= 2);
});
