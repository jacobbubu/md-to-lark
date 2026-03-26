import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildPipelineStagePaths,
  writePrepareStage,
  writePublishStageArtifact,
  writeSourceStage,
} from '../src/publish/stage-cache.js';
import type { PrepareMarkdownResult } from '../src/pipeline/markdown/prepare-markdown.js';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'md-to-lark-stage-cache-'));
}

test('stage-cache writes source, prepare, and publish artifacts into stable stage directories', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const stagePaths = buildPipelineStagePaths(dir, '/tmp/input/demo.md');
  assert.equal(path.basename(stagePaths.sourceDir), '00-source');
  assert.equal(path.basename(stagePaths.prepareDir), '01-prepare');
  assert.equal(path.basename(stagePaths.publishDir), '05-publish');

  await writeSourceStage(stagePaths, '# Original', '# Preset', { sourcePath: '/tmp/input/demo.md' });

  const prepareResult: PrepareMarkdownResult = {
    sourcePath: '/tmp/input/demo.md',
    preparedContent: '# Prepared',
    changed: true,
    remoteImageCount: 1,
    remoteYtDlpCount: 0,
    remoteFetchTotal: 1,
    rewrittenCount: 1,
    downloadedCount: 1,
    failedCount: 0,
    remoteFetchFailed: 0,
    ytDlpDownloadedCount: 0,
    ytDlpFailedCount: 0,
    prepareDir: stagePaths.prepareDir,
    assetsDir: path.join(stagePaths.prepareDir, 'assets'),
    logFilePath: path.join(stagePaths.prepareDir, 'download.log.json'),
    logEntries: [],
    logFileContent: {
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourcePath: '/tmp/input/demo.md',
      enabled: true,
      ytDlp: {
        enabled: false,
        configuredInFrontmatter: false,
        prefixes: [],
        executable: null,
        cookiesPath: null,
        timeoutMs: 1000,
      },
      remoteImageCount: 1,
      remoteYtDlpCount: 0,
      remoteFetchTotal: 1,
      rewrittenCount: 1,
      downloadedCount: 1,
      failedCount: 0,
      remoteFetchFailed: 0,
      ytDlpDownloadedCount: 0,
      ytDlpFailedCount: 0,
      entries: [],
    },
  };

  await writePrepareStage(stagePaths, '# Prepared', prepareResult);
  await writePublishStageArtifact(stagePaths, {
    status: 'dry-run',
    sourcePath: '/tmp/input/demo.md',
    title: 'Demo',
    documentId: null,
    rootBlockId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    failedBlocks: [],
    retryLogs: [],
    mediaTokenMappings: [],
  });

  const sourceOriginal = await readFile(path.join(stagePaths.sourceDir, 'original.md'), 'utf8');
  const prepareResultText = await readFile(path.join(stagePaths.prepareDir, 'result.json'), 'utf8');
  const prepareLogText = await readFile(path.join(stagePaths.prepareDir, 'download.log.json'), 'utf8');
  const publishResultText = await readFile(path.join(stagePaths.publishDir, 'result.json'), 'utf8');

  assert.equal(sourceOriginal, '# Original');
  assert.match(prepareResultText, /"rewrittenCount": 1/);
  assert.doesNotMatch(prepareResultText, /preparedContent/);
  assert.match(prepareLogText, /"generatedAt": "2026-01-01T00:00:00.000Z"/);
  assert.match(publishResultText, /"status": "dry-run"/);
});
