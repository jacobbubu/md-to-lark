import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { processSingleMarkdownFile } from '../src/publish/process-file.js';
import { buildPublishRuntime } from '../src/publish/runtime.js';

const baseEnv: NodeJS.ProcessEnv = {
  LARK_APP_ID: 'process_file_app_id',
  LARK_APP_SECRET: 'process_file_app_secret',
  LARK_TOKEN_TYPE: 'tenant',
};

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'md-to-lark-process-file-'));
}

async function withSilencedConsole<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

test('processSingleMarkdownFile builds dry-run stage artifacts directly', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'single.md');
  await writeFile(file, '# Process File Title\n\ncontent', 'utf8');

  const options = {
    inputPath: file,
    folderToken: 'fld_test',
    dryRun: true,
    pipelineCacheDir: path.join(dir, 'cache'),
  } as const;

  const runtime = buildPublishRuntime(options, baseEnv, null);
  const result = await withSilencedConsole(async () =>
    processSingleMarkdownFile({
      runtime,
      inputSet: {
        mode: 'single',
        rootPath: dir,
        markdownFiles: [file],
      },
      options,
      markdownPath: file,
      index: 0,
    }),
  );

  assert.equal(result.status, 'dry-run');
  assert.equal(result.documentId, null);
  assert.match(result.title, /^\d{8}-Process File Title$/);

  const publishResultText = await readFile(path.join(result.stagePaths.publishDir, 'result.json'), 'utf8');
  const prepareLogText = await readFile(path.join(result.stagePaths.prepareDir, 'download.log.json'), 'utf8');

  assert.match(publishResultText, /"status": "dry-run"/);
  assert.match(prepareLogText, /"generatedAt":/);
});
