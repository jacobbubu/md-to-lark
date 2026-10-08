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

interface RichTextRun {
  text: string;
  link: string | null;
}

function collectLastTextRuns(value: unknown): RichTextRun[] {
  if (value === null || typeof value !== 'object') return [];
  const blocks = (value as { blocks?: unknown }).blocks;
  if (blocks === null || typeof blocks !== 'object') return [];

  const runs: RichTextRun[] = [];
  for (const block of Object.values(blocks as Record<string, unknown>)) {
    if (block === null || typeof block !== 'object') continue;
    const inlines = (block as { payload?: { inlines?: unknown } }).payload?.inlines;
    if (!Array.isArray(inlines)) continue;

    for (const inline of inlines) {
      if (inline === null || typeof inline !== 'object') continue;
      const textRun = inline as {
        kind?: unknown;
        text?: unknown;
        marks?: { link?: { url?: unknown } | null };
      };
      if (textRun.kind !== 'text_run' || typeof textRun.text !== 'string') continue;
      runs.push({
        text: textRun.text,
        link: typeof textRun.marks?.link?.url === 'string' ? textRun.marks.link.url : null,
      });
    }
  }
  return runs;
}

function collectBttTextRuns(value: unknown, seen = new WeakSet<object>()): RichTextRun[] {
  if (value === null || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);

  const record = value as Record<string, unknown>;
  const rawTextRun = record.text_run;
  if (rawTextRun !== null && typeof rawTextRun === 'object') {
    const textRun = rawTextRun as {
      content?: unknown;
      text_element_style?: { link?: { url?: unknown } | null };
    };
    if (typeof textRun.content === 'string') {
      return [
        {
          text: textRun.content,
          link: typeof textRun.text_element_style?.link?.url === 'string' ? textRun.text_element_style.link.url : null,
        },
      ];
    }
  }

  const runs: RichTextRun[] = [];
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) runs.push(...collectBttTextRuns(item, seen));
      continue;
    }
    runs.push(...collectBttTextRuns(child, seen));
  }
  return runs;
}

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'md-to-lark-publish-'));
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

async function withCapturedConsole<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const logs: string[] = [];
  const capture = (...args: unknown[]) => {
    logs.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  };
  console.log = capture;
  console.error = capture;
  console.warn = (...args: unknown[]) => {
    logs.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  };
  try {
    const result = await fn();
    return { result, logs };
  } finally {
    console.log = originalLog;
    console.error = originalError;
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

  const results = await withSilencedConsole(async () => {
    return publishMdToLark(
      {
        inputPath: file,
        folderToken: 'fld_dry_run',
        pipelineCacheDir: cacheRoot,
        dryRun: true,
      },
      baseEnv,
    );
  });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.documentId, null);
  assert.equal(results[0]?.documentUrl, null);
  assert.equal(results[0]?.status, 'dry-run');
  assert.match(results[0]?.title ?? '', /^\d{8}-Dry Run Title$/);

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
  const downloadLog = await readFile(path.join(stageRoot, '01-prepare', 'download.log.json'), 'utf8');
  assert.equal(sourceOriginal, '# Dry Run Title\n\ncontent');
  assert.equal(sourcePreset, '# Dry Run Title\n\ncontent');
  assert.equal(prepared, '# Dry Run Title\n\ncontent');
  assert.match(downloadLog, /"generatedAt":/);

  const publishResultText = await readFile(path.join(stageRoot, '05-publish', 'result.json'), 'utf8');
  const publishResult = JSON.parse(publishResultText) as {
    status: string;
    title: string;
    documentId: string | null;
    documentUrl: string | null;
  };
  assert.equal(publishResult.status, 'dry-run');
  assert.equal(publishResult.documentId, null);
  assert.equal(publishResult.documentUrl, null);
  assert.match(publishResult.title, /^\d{8}-Dry Run Title$/);
});

test('publishMdToLark pure local dry-run needs no destination or Lark credentials', async (t) => {
  const dir = await createTempDir();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'local.md');
  await writeFile(file, '# Local Only\n\ncontent', 'utf8');
  const results = await withSilencedConsole(() =>
    publishMdToLark(
      {
        inputPath: file,
        pipelineCacheDir: path.join(dir, 'cache'),
        dryRun: true,
      },
      {},
    ),
  );
  assert.equal(results[0]?.status, 'dry-run');
  assert.equal(results[0]?.documentId, null);
});

test('publishMdToLark programmatic options resolve folderToken from env', async (t) => {
  const dir = await createTempDir();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'env-folder.md');
  await writeFile(file, '# Env Folder\n', 'utf8');
  const results = await withSilencedConsole(() =>
    publishMdToLark(
      {
        inputPath: file,
        pipelineCacheDir: path.join(dir, 'cache'),
        dryRun: true,
      },
      { ...baseEnv, LARK_FOLDER_TOKEN: 'fld_from_env' },
    ),
  );
  assert.equal(results[0]?.status, 'dry-run');
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

  const results = await withSilencedConsole(async () => {
    return publishMdToLark(
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
  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((result) => result.status),
    ['dry-run', 'dry-run'],
  );
  assert.deepEqual(
    results.map((result) => result.documentUrl),
    [null, null],
  );
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

test('publishMdToLark dry-run applies multiple presets in order', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'single.md');
  const firstPreset = path.join(dir, 'first-preset.mjs');
  const secondPreset = path.join(dir, 'second-preset.mjs');
  await writeFile(file, '# Before\n\ncontent', 'utf8');
  await writeFile(
    firstPreset,
    [
      'export default function transformMarkdown(markdown) {',
      "  return markdown.replace('# Before', '# Middle');",
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    secondPreset,
    [
      'export default function transformMarkdown(markdown) {',
      "  return markdown.replace('# Middle', '# After');",
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
        presetPaths: [firstPreset, secondPreset],
      },
      baseEnv,
    );
  });

  const cacheEntries = await readdir(path.join(dir, 'cache'), { withFileTypes: true });
  const stageRoot = path.join(path.join(dir, 'cache'), cacheEntries.find((entry) => entry.isDirectory())?.name ?? '');
  const sourcePreset = await readFile(path.join(stageRoot, '00-source', 'preset.md'), 'utf8');
  const sourceMeta = JSON.parse(await readFile(path.join(stageRoot, '00-source', 'meta.json'), 'utf8')) as {
    preset: string | null;
    presets: string[];
  };

  assert.equal(sourcePreset, '# After\n\ncontent');
  assert.equal(sourceMeta.preset, null);
  assert.equal(sourceMeta.presets.length, 2);
  assert.ok(logs.some((line) => line.includes('Presets:')));
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

test('publishMdToLark dry-run applies built-in zh-format preset', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'single.md');
  const cacheRoot = path.join(dir, 'cache');
  await writeFile(file, '# 中文格式化\n\nHarness将成为解决"模型漂移"的主要工具。在Azure中部署3台VM。', 'utf8');

  const { logs } = await withCapturedConsole(async () => {
    await publishMdToLark(
      {
        inputPath: file,
        folderToken: 'fld_dry_run',
        pipelineCacheDir: cacheRoot,
        dryRun: true,
        presetPath: 'zh-format',
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

  assert.ok(logs.some((line) => line.includes('Preset: builtin:zh-format')));
  assert.match(sourcePreset, /Harness 将成为解决“模型漂移”的主要工具。/);
  assert.match(sourcePreset, /在 Azure 中部署 3 台 VM。/);
});

test('publishMdToLark zh-format preset preserves link spacing and clickable rich text', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'linked-text.md');
  const cacheRoot = path.join(dir, 'cache');
  await writeFile(
    file,
    [
      '# 中文链接空格',
      '',
      '> [ChrisFirst](https://example.com/chris)在 Twitter 上分享',
      '>',
      '> 收到了[Bethesda](https://example.com/bethesda)的通知',
      '>',
      '> 项目来自[Maurice Heumann](https://example.com/maurice)，',
    ].join('\n'),
    'utf8',
  );

  await withSilencedConsole(() =>
    publishMdToLark(
      {
        inputPath: file,
        folderToken: 'fld_dry_run',
        pipelineCacheDir: cacheRoot,
        dryRun: true,
        presetPath: 'zh-format',
      },
      baseEnv,
    ),
  );

  const cacheEntries = await readdir(cacheRoot, { withFileTypes: true });
  const stageName = cacheEntries.find((entry) => entry.isDirectory())?.name;
  assert.ok(stageName);
  const stageRoot = path.join(cacheRoot, stageName);
  const sourcePreset = await readFile(path.join(stageRoot, '00-source', 'preset.md'), 'utf8');
  const last = JSON.parse(await readFile(path.join(stageRoot, '03-last', 'last.json'), 'utf8')) as unknown;
  const btt = JSON.parse(await readFile(path.join(stageRoot, '04-btt', 'btt.json'), 'utf8')) as unknown;

  assert.match(sourcePreset, /\[ChrisFirst\]\(https:\/\/example\.com\/chris\) 在 Twitter 上分享/);
  assert.match(sourcePreset, /收到了 \[Bethesda\]\(https:\/\/example\.com\/bethesda\) 的通知/);
  assert.match(sourcePreset, /来自 \[Maurice Heumann\]\(https:\/\/example\.com\/maurice\)，/);

  const expectedLinks = new Map([
    ['ChrisFirst', 'https://example.com/chris'],
    ['Bethesda', 'https://example.com/bethesda'],
    ['Maurice Heumann', 'https://example.com/maurice'],
  ]);
  const bttFlatBlocks = (btt as { flatBlocks?: unknown }).flatBlocks;
  for (const runs of [collectLastTextRuns(last), collectBttTextRuns(bttFlatBlocks)]) {
    const visibleText = runs.map((run) => run.text).join('');
    assert.match(visibleText, /ChrisFirst 在 Twitter 上分享/);
    assert.match(visibleText, /收到了 Bethesda 的通知/);
    assert.match(visibleText, /来自 Maurice Heumann，/);
    for (const [label, url] of expectedLinks) {
      assert.ok(runs.some((run) => run.text === label && run.link === url));
    }
  }
});
