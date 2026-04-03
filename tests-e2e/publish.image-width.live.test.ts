import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { copyFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_IMAGE_WIDTH } from '../src/last/image-defaults.js';
import { publishMdToLark } from '../src/commands/publish-md/command.js';
import { buildE2ETitle, getLiveE2ESkipReason, loadLiveE2EConfig } from './helpers/live-env.js';
import {
  createLiveLarkContext,
  fetchLiveDocumentBlocks,
  waitForDocumentIdByTitle,
  waitForLiveDocumentSnapshot,
} from './helpers/live-lark.js';
import { createTempDir, withSilencedConsole } from './helpers/test-support.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sampleImagePath = path.resolve(currentDir, '../test-md/comp/assets/medium.png');
const execFile = promisify(execFileCallback);

test('live publish keeps proportional size on top-level image blocks', async (t) => {
  const live = await loadLiveE2EConfig();
  if (!live) {
    return t.skip(getLiveE2ESkipReason());
  }
  if (process.platform !== 'darwin') {
    return t.skip('This live image width case currently depends on macOS sips.');
  }

  const dir = await createTempDir('image-width');
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const localImagePath = path.join(dir, 'medium.png');
  const markdownPath = path.join(dir, 'image-width.md');
  const title = buildE2ETitle(live, 'image-width');

  await copyFile(sampleImagePath, localImagePath);
  await execFile('sips', ['-z', '1200', '1600', localImagePath]);
  await writeFile(markdownPath, '# Image Width\n\n![architecture](./medium.png)\n', 'utf8');

  const results = await withSilencedConsole(async () =>
    publishMdToLark(
      {
        inputPath: markdownPath,
        title,
        titleDatePrefix: false,
        folderToken: live.folderToken,
        pipelineCacheDir: path.join(dir, 'cache'),
        dryRun: false,
      },
      live.env,
    ),
  );

  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, 'published');
  assert.ok(results[0]?.documentId);

  const ctx = createLiveLarkContext(live);
  const documentId = results[0]?.documentId ?? (await waitForDocumentIdByTitle(ctx, title));
  await waitForLiveDocumentSnapshot(
    ctx,
    documentId,
    (snapshot) => (snapshot.blockTypes.Image ?? 0) >= 1,
    'at least one image block',
  );

  const blocks = await fetchLiveDocumentBlocks(ctx, documentId);
  const imageBlocks = blocks.filter((block) => block.block_type === 27);
  assert.equal(imageBlocks.length, 1);

  const imagePayload = imageBlocks[0]?.image as { width?: unknown; height?: unknown } | undefined;
  assert.equal(imagePayload?.width, DEFAULT_IMAGE_WIDTH);
  assert.equal(imagePayload?.height, 750);
});
