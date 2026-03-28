import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  listBuiltinMarkdownPresetNames,
  loadMarkdownPreset,
  loadMarkdownPresets,
} from '../src/commands/publish-md/preset-loader.js';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'md-to-lark-preset-'));
}

test('loadMarkdownPreset returns null for empty preset path', async () => {
  const preset = await loadMarkdownPreset('');
  assert.equal(preset, null);
});

test('loadMarkdownPresets returns empty list for empty preset list', async () => {
  const presets = await loadMarkdownPresets([]);
  assert.deepEqual(presets, []);
});

test('listBuiltinMarkdownPresetNames contains current built-ins', () => {
  assert.deepEqual(listBuiltinMarkdownPresetNames(), ['medium', 'zh-format']);
});

test('loadMarkdownPreset resolves built-in medium preset name', async () => {
  const preset = await loadMarkdownPreset('medium');
  assert.ok(preset);
  assert.equal(preset.sourcePath, 'builtin:medium');
  assert.equal(preset.displayPath, 'builtin:medium');
  const next = await preset.transform('[Part 2](/@firattekiner/article)', {
    inputPath: '/tmp/a.md',
    index: 0,
    total: 1,
    env: {},
    log: () => {},
  });
  assert.equal(next, '[Part 2](https://medium.com/@firattekiner/article)');
});

test('loadMarkdownPreset resolves built-in medium preset aliases', async () => {
  const a = await loadMarkdownPreset('builtin:medium');
  const b = await loadMarkdownPreset('preset:medium');
  assert.ok(a);
  assert.ok(b);
  assert.equal(a.sourcePath, 'builtin:medium');
  assert.equal(b.sourcePath, 'builtin:medium');
});

test('loadMarkdownPreset resolves built-in zh-format preset name', async () => {
  const preset = await loadMarkdownPreset('zh-format');
  assert.ok(preset);
  assert.equal(preset.sourcePath, 'builtin:zh-format');
  assert.equal(preset.displayPath, 'builtin:zh-format');
  const next = await preset.transform(
    [
      '---',
      'title: "The importance of Agent Harness in 2026"',
      'title_cn: "2026 年，Agent Harness 为什么重要"',
      '---',
      '',
      'Harness将成为解决"模型漂移"的主要工具。',
      '',
      '在Azure中部署3台VM。',
      '',
      '`const label = "模型漂移"`',
      '',
      '[示例](https://example.com "中文标题")',
      '',
      '```js',
      'const title = "模型漂移";',
      '```',
      '',
    ].join('\n'),
    {
      inputPath: '/tmp/a.md',
      index: 0,
      total: 1,
      env: {},
      log: () => {},
    },
  );
  assert.match(next, /title_cn: "2026 年，Agent Harness 为什么重要"/);
  assert.match(next, /Harness 将成为解决“模型漂移”的主要工具。/);
  assert.match(next, /在 Azure 中部署 3 台 VM。/);
  assert.match(next, /`const label = "模型漂移"`/);
  assert.match(next, /\[示例\]\(https:\/\/example\.com "中文标题"\)/);
  assert.match(next, /const title = "模型漂移";/);
});

test('loadMarkdownPreset resolves built-in zh-format aliases', async () => {
  const a = await loadMarkdownPreset('builtin:zh-format');
  const b = await loadMarkdownPreset('preset:zh-format');
  const c = await loadMarkdownPreset('cn-smart-quotes');
  const d = await loadMarkdownPreset('zh-smart-quotes');
  assert.ok(a);
  assert.ok(b);
  assert.ok(c);
  assert.ok(d);
  assert.equal(a.sourcePath, 'builtin:zh-format');
  assert.equal(b.sourcePath, 'builtin:zh-format');
  assert.equal(c.sourcePath, 'builtin:zh-format');
  assert.equal(d.sourcePath, 'builtin:zh-format');
});

test('loadMarkdownPresets resolves built-ins and local modules in order', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'suffix-preset.mjs');
  await writeFile(
    file,
    ['export default function transform(markdown) {', "  return markdown + '\\nsecond';", '}', ''].join('\n'),
    'utf8',
  );

  const presets = await loadMarkdownPresets(['zh-format', file]);
  assert.equal(presets.length, 2);
  assert.equal(presets[0]?.sourcePath, 'builtin:zh-format');
  assert.equal(presets[1]?.sourcePath, file);
});

test('loadMarkdownPreset loads default function export', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'default-preset.mjs');
  await writeFile(
    file,
    ['export default function transform(markdown) {', "  return markdown.replace(/foo/g, 'bar');", '}', ''].join('\n'),
    'utf8',
  );

  const preset = await loadMarkdownPreset(file);
  assert.ok(preset);
  const next = await preset.transform('foo foo', {
    inputPath: '/tmp/a.md',
    index: 0,
    total: 1,
    env: {},
    log: () => {},
  });
  assert.equal(next, 'bar bar');
});

test('loadMarkdownPreset loads named transformMarkdown export', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'named-preset.mjs');
  await writeFile(
    file,
    ['export function transformMarkdown(markdown) {', "  return markdown + '\\n# patched';", '}', ''].join('\n'),
    'utf8',
  );

  const preset = await loadMarkdownPreset(file);
  assert.ok(preset);
  const next = await preset.transform('# title', {
    inputPath: '/tmp/a.md',
    index: 0,
    total: 1,
    env: {},
    log: () => {},
  });
  assert.match(next, /# patched/);
});

test('loadMarkdownPreset throws for invalid module exports', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'invalid-preset.mjs');
  await writeFile(file, 'export const nope = 1;\n', 'utf8');

  await assert.rejects(() => loadMarkdownPreset(file), /Invalid preset module/);
});

test('loadMarkdownPreset throws when transform returns non-string', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'non-string-preset.mjs');
  await writeFile(
    file,
    ['export default function transform() {', '  return { bad: true };', '}', ''].join('\n'),
    'utf8',
  );

  const preset = await loadMarkdownPreset(file);
  assert.ok(preset);
  await assert.rejects(
    () =>
      preset.transform('# x', {
        inputPath: '/tmp/a.md',
        index: 0,
        total: 1,
        env: {},
        log: () => {},
      }),
    /must return a markdown string/,
  );
});
