import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { publishMdToLark } from '../src/commands/publish-md/command.js';

const baseEnv: NodeJS.ProcessEnv = {
  LARK_APP_ID: 'cli_test_app_id',
  LARK_APP_SECRET: 'cli_test_app_secret',
  LARK_TOKEN_TYPE: 'tenant',
};

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'md-to-lark-publish-'));
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

async function withCapturedConsole<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    logs.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  };
  try {
    const result = await fn();
    return { result, logs };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

test('publishMdToLark dry-run succeeds for single markdown file', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'single.md');
  const cacheRoot = path.join(dir, 'cache');
  await writeFile(file, '# Dry Run Title\n\ncontent', 'utf8');

  await withSilencedConsole(async () => {
    await publishMdToLark(
      {
        inputPath: file,
        folderToken: 'fld_dry_run',
        pipelineCacheDir: cacheRoot,
        dryRun: true,
      },
      baseEnv,
    );
  });

  const cacheEntries = await readdir(cacheRoot, { withFileTypes: true });
  const perFileCache = cacheEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(cacheRoot, entry.name));
  assert.equal(perFileCache.length, 1);
  const stageRoot = perFileCache[0]!;

  const stageNames = await readdir(stageRoot);
  assert.deepEqual(stageNames.sort(), ['00-source', '01-prepare', '02-hast', '03-last', '04-btt', '05-publish']);

  const sourceOriginal = await readFile(path.join(stageRoot, '00-source', 'original.md'), 'utf8');
  const sourcePreset = await readFile(path.join(stageRoot, '00-source', 'preset.md'), 'utf8');
  const prepared = await readFile(path.join(stageRoot, '01-prepare', 'prepared.md'), 'utf8');
  assert.equal(sourceOriginal, '# Dry Run Title\n\ncontent');
  assert.equal(sourcePreset, '# Dry Run Title\n\ncontent');
  assert.equal(prepared, '# Dry Run Title\n\ncontent');

  const publishResultText = await readFile(path.join(stageRoot, '05-publish', 'result.json'), 'utf8');
  const publishResult = JSON.parse(publishResultText) as { status: string; title: string; documentId: string | null };
  assert.equal(publishResult.status, 'dry-run');
  assert.equal(publishResult.documentId, null);
  assert.match(publishResult.title, /^\d{8}-Dry Run Title$/);
});

test('publishMdToLark dry-run succeeds for directory input with multiple markdown files', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const nested = path.join(dir, 'nested');
  await mkdir(nested, { recursive: true });
  await Promise.all([
    writeFile(path.join(dir, 'a.md'), '# A\n\nalpha', 'utf8'),
    writeFile(path.join(nested, 'b.md'), '# B\n\nbeta', 'utf8'),
    writeFile(path.join(nested, 'skip.txt'), 'skip', 'utf8'),
  ]);

  await withSilencedConsole(async () => {
    await publishMdToLark(
      {
        inputPath: dir,
        folderToken: 'fld_dry_run',
        title: 'Batch',
        pipelineCacheDir: path.join(dir, 'cache'),
        dryRun: true,
      },
      {
        ...baseEnv,
        LARK_DOCX_MIN_INTERVAL_MS: '100',
        LARK_MEDIA_MIN_INTERVAL_MS: '120',
        LARK_PUBLISH_COOLDOWN_MS: '50',
      },
    );
  });
});

test('publishMdToLark rejects documentId when input resolves to directory mode', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  await writeFile(path.join(dir, 'a.md'), '# A', 'utf8');
  await writeFile(path.join(dir, 'b.md'), '# B', 'utf8');

  await assert.rejects(
    () =>
      withSilencedConsole(async () => {
        await publishMdToLark(
          {
            inputPath: dir,
            folderToken: 'fld_x',
            documentId: 'doccn_x',
            pipelineCacheDir: path.join(dir, 'cache'),
            dryRun: true,
          },
          baseEnv,
        );
      }),
    /--doc only supports single markdown input file\./,
  );
});

test('publishMdToLark dry-run applies preset transform before deriving title', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'single.md');
  const preset = path.join(dir, 'preset.mjs');
  await writeFile(file, '# Before\n\ncontent', 'utf8');
  await writeFile(
    preset,
    [
      'export default function transformMarkdown(markdown) {',
      "  return markdown.replace('# Before', '# After');",
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  const { logs } = await withCapturedConsole(async () => {
    await publishMdToLark(
      {
        inputPath: file,
        folderToken: 'fld_dry_run',
        pipelineCacheDir: path.join(dir, 'cache'),
        dryRun: true,
        presetPath: preset,
      },
      baseEnv,
    );
  });

  assert.ok(logs.some((line) => line.includes('Preset:')));
  assert.ok(logs.some((line) => /\[dry-run 1\/1\] title: \d{8}-After/.test(line)));
});

test('publishMdToLark dry-run accepts built-in preset name', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'single.md');
  await writeFile(file, '# Builtin Preset\n\n[Part 2](/@firattekiner/article)', 'utf8');

  const { logs } = await withCapturedConsole(async () => {
    await publishMdToLark(
      {
        inputPath: file,
        folderToken: 'fld_dry_run',
        pipelineCacheDir: path.join(dir, 'cache'),
        dryRun: true,
        presetPath: 'medium',
      },
      baseEnv,
    );
  });

  assert.ok(logs.some((line) => line.includes('Preset: builtin:medium')));
  assert.ok(logs.some((line) => /\[dry-run 1\/1\] title: \d{8}-Builtin Preset/.test(line)));
});

test('publishMdToLark dry-run applies built-in zh-smart-quotes preset', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'single.md');
  const cacheRoot = path.join(dir, 'cache');
  await writeFile(file, '# 中文引号\n\nHarness 将成为解决"模型漂移"的主要工具。', 'utf8');

  const { logs } = await withCapturedConsole(async () => {
    await publishMdToLark(
      {
        inputPath: file,
        folderToken: 'fld_dry_run',
        pipelineCacheDir: cacheRoot,
        dryRun: true,
        presetPath: 'zh-smart-quotes',
      },
      baseEnv,
    );
  });

  const cacheEntries = await readdir(cacheRoot, { withFileTypes: true });
  const perFileCache = cacheEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(cacheRoot, entry.name));
  assert.equal(perFileCache.length, 1);
  const stageRoot = perFileCache[0]!;
  const sourcePreset = await readFile(path.join(stageRoot, '00-source', 'preset.md'), 'utf8');

  assert.ok(logs.some((line) => line.includes('Preset: builtin:zh-smart-quotes')));
  assert.match(sourcePreset, /Harness 将成为解决“模型漂移”的主要工具。/);
});
