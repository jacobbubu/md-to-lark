import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { processSingleMarkdownFile } from '../src/publish/process-file.js';
import { buildPublishRuntime } from '../src/publish/runtime.js';
import type { LoadedMarkdownPreset } from '../src/commands/publish-md/preset-loader.js';

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
  const originalError = console.error;
  const originalWarn = console.warn;
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
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

  const runtime = buildPublishRuntime(options, baseEnv, []);
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
  assert.equal(result.documentUrl, null);
  assert.match(result.title, /^\d{8}-Process File Title$/);

  const publishResultText = await readFile(path.join(result.stagePaths.publishDir, 'result.json'), 'utf8');
  const prepareLogText = await readFile(path.join(result.stagePaths.prepareDir, 'download.log.json'), 'utf8');

  assert.match(publishResultText, /"status": "dry-run"/);
  assert.match(publishResultText, /"documentUrl": null/);
  assert.match(prepareLogText, /"generatedAt":/);
});

test('processSingleMarkdownFile applies multiple presets in order and records preset chain', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'single.md');
  await writeFile(file, '# Before\n\ncontent', 'utf8');

  const presets: LoadedMarkdownPreset[] = [
    {
      sourcePath: 'builtin:first',
      displayPath: 'builtin:first',
      transform: (markdown) => markdown.replace('# Before', '# Middle'),
    },
    {
      sourcePath: 'builtin:second',
      displayPath: 'builtin:second',
      transform: (markdown) => markdown.replace('# Middle', '# After'),
    },
  ];

  const options = {
    inputPath: file,
    folderToken: 'fld_test',
    dryRun: true,
    pipelineCacheDir: path.join(dir, 'cache'),
  } as const;

  const runtime = buildPublishRuntime(options, baseEnv, presets);
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

  assert.match(result.title, /^\d{8}-After$/);
  const sourcePreset = await readFile(path.join(result.stagePaths.sourceDir, 'preset.md'), 'utf8');
  const sourceMeta = JSON.parse(await readFile(path.join(result.stagePaths.sourceDir, 'meta.json'), 'utf8')) as {
    preset: string | null;
    presets: string[];
  };

  assert.equal(sourcePreset, '# After\n\ncontent');
  assert.equal(sourceMeta.preset, null);
  assert.deepEqual(sourceMeta.presets, ['builtin:first', 'builtin:second']);
});

test('processSingleMarkdownFile stops when a later preset throws', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'single.md');
  await writeFile(file, '# Before\n\ncontent', 'utf8');

  const presets: LoadedMarkdownPreset[] = [
    {
      sourcePath: 'builtin:first',
      displayPath: 'builtin:first',
      transform: (markdown) => markdown.replace('content', 'patched'),
    },
    {
      sourcePath: 'builtin:boom',
      displayPath: 'builtin:boom',
      transform: () => {
        throw new Error('preset boom');
      },
    },
  ];

  const options = {
    inputPath: file,
    folderToken: 'fld_test',
    dryRun: true,
    pipelineCacheDir: path.join(dir, 'cache'),
  } as const;

  const runtime = buildPublishRuntime(options, baseEnv, presets);

  await assert.rejects(
    () =>
      withSilencedConsole(async () =>
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
      ),
    /preset boom/,
  );
});
