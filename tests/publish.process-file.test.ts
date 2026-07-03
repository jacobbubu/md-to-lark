import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

test('processSingleMarkdownFile applies single-dollar math parse config in dry-run stages', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'single.md');
  await writeFile(file, '# Math Title\n\nInline formula: $x_t = y_t + 1$.\n', 'utf8');

  const options = {
    inputPath: file,
    folderToken: 'fld_test',
    dryRun: true,
    pipelineCacheDir: path.join(dir, 'cache'),
    singleDollarTextMath: true,
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

  const lastStage = JSON.parse(await readFile(path.join(result.stagePaths.lastDir, 'last.json'), 'utf8')) as {
    blocks?: Record<string, { payload?: { inlines?: Array<{ kind?: string; latex?: string }> } }>;
  };
  const equations = Object.values(lastStage.blocks ?? {}).flatMap((block) =>
    (block.payload?.inlines ?? []).filter((inline) => inline.kind === 'equation').map((inline) => inline.latex ?? ''),
  );

  assert.deepEqual(equations, ['x_t = y_t + 1']);
});

test('processSingleMarkdownFile keeps linked markdown images through dry-run BTT stages', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const assetsDir = path.join(dir, 'assets');
  await mkdir(assetsDir, { recursive: true });
  await writeFile(path.join(assetsDir, 'image-1.webp'), 'webp', 'utf8');
  await writeFile(path.join(assetsDir, 'image-2.jpg'), 'jpg', 'utf8');
  await writeFile(path.join(assetsDir, 'image-3.png'), 'png', 'utf8');

  const file = path.join(dir, 'linked.md');
  await writeFile(
    file,
    [
      '# Linked Images',
      '',
      '[![](assets/image-1.webp)](https://substackcdn.com/image/fetch/$s_!Sudo!,f_auto,q_auto/foo.jpeg)_Caption after image_',
      '',
      '[![Alt text](assets/image-2.jpg)](https://example.com/original)',
      '',
      'Before [![Inline alt](assets/image-3.png)](https://example.com/full) after.',
      '',
    ].join('\n'),
    'utf8',
  );

  const options = {
    inputPath: file,
    folderToken: 'fld_test',
    dryRun: true,
    pipelineCacheDir: path.join(dir, 'cache'),
    imageSizeResolver: (src: string) =>
      (
        ({
          'assets/image-1.webp': { widthRatio: 1 },
          'assets/image-2.jpg': { widthRatio: 0.5 },
          'assets/image-3.png': { widthRatio: 0.3 },
        }) as Record<string, { widthRatio: number } | undefined>
      )[src],
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

  const lastStage = JSON.parse(await readFile(path.join(result.stagePaths.lastDir, 'last.json'), 'utf8')) as {
    indexes?: { byType?: { image?: string[] } };
    blocks?: Record<
      string,
      { selector?: { attrs?: { sourceUrl?: string } }; payload?: { width?: number; inlines?: unknown[] } }
    >;
  };
  const imageIds = lastStage.indexes?.byType?.image ?? [];
  assert.equal(imageIds.length, 3);
  assert.deepEqual(
    imageIds.map((imageId) => lastStage.blocks?.[imageId]?.selector?.attrs?.sourceUrl ?? null),
    ['assets/image-1.webp', 'assets/image-2.jpg', 'assets/image-3.png'],
  );
  assert.deepEqual(
    imageIds.map((imageId) => lastStage.blocks?.[imageId]?.payload?.width ?? null),
    [1000, 500, 300],
  );

  const bttStage = JSON.parse(await readFile(path.join(result.stagePaths.bttDir, 'btt.json'), 'utf8')) as {
    flatBlocks?: Record<string, { block_type?: number; image?: { width?: number } }>;
  };
  const bttImageCount = Object.values(bttStage.flatBlocks ?? {}).filter((block) => block.block_type === 27).length;
  assert.equal(bttImageCount, 3);
  assert.deepEqual(
    imageIds.map((imageId) => bttStage.flatBlocks?.[imageId]?.image?.width ?? null),
    [1000, 500, 300],
  );

  const bttMeta = JSON.parse(await readFile(path.join(result.stagePaths.bttDir, 'meta.json'), 'utf8')) as {
    localAssetCount?: number;
  };
  assert.equal(bttMeta.localAssetCount, 3);
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

test('processSingleMarkdownFile resolves relative local assets from resourceBaseDir override', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const generatedDir = path.join(dir, 'generated');
  const assetsDir = path.join(dir, 'assets');
  const file = path.join(generatedDir, 'single.md');
  const asset = path.join(assetsDir, 'img-001.png');
  await mkdir(generatedDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });
  await writeFile(file, '# Asset Base Override\n\n![sample](./img-001.png)\n', 'utf8');
  await writeFile(asset, 'fake-png', 'utf8');

  const options = {
    inputPath: file,
    folderToken: 'fld_test',
    dryRun: true,
    pipelineCacheDir: path.join(dir, 'cache'),
    resourceBaseDir: assetsDir,
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

  const sourceMeta = JSON.parse(await readFile(path.join(result.stagePaths.sourceDir, 'meta.json'), 'utf8')) as {
    resourceBaseDir: string;
  };
  const bttMeta = JSON.parse(await readFile(path.join(result.stagePaths.bttDir, 'meta.json'), 'utf8')) as {
    localAssetCount: number;
  };

  assert.equal(sourceMeta.resourceBaseDir, assetsDir);
  assert.equal(bttMeta.localAssetCount, 1);
});
