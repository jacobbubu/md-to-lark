import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { isMarkdownFilePath, resolvePublishInputSet } from '../src/commands/publish-md/input-resolver.js';

async function createTempDir() {
  return mkdtemp(path.join(tmpdir(), 'md-to-lark-input-'));
}

test('isMarkdownFilePath supports case-insensitive .md', () => {
  assert.equal(isMarkdownFilePath('a.md'), true);
  assert.equal(isMarkdownFilePath('a.MD'), true);
  assert.equal(isMarkdownFilePath('a.mdx'), false);
  assert.equal(isMarkdownFilePath('a.txt'), false);
});

test('resolvePublishInputSet handles single markdown file', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const mdFile = path.join(dir, 'single.md');
  await writeFile(mdFile, '# test\n', 'utf8');

  const resolved = await resolvePublishInputSet(mdFile);
  assert.equal(resolved.mode, 'single');
  assert.equal(resolved.rootPath, dir);
  assert.deepEqual(resolved.markdownFiles, [mdFile]);
});

test('resolvePublishInputSet rejects non-markdown file input', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const txtFile = path.join(dir, 'not-md.txt');
  await writeFile(txtFile, 'plain text', 'utf8');

  await assert.rejects(() => resolvePublishInputSet(txtFile), /Input file is not \.md:/);
});

test('resolvePublishInputSet resolves markdown files recursively and sorted', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const nestedDir = path.join(dir, 'nested');
  await mkdir(nestedDir, { recursive: true });

  const fileA = path.join(dir, 'b.md');
  const fileB = path.join(dir, 'a.md');
  const fileC = path.join(nestedDir, 'c.md');
  const ignored = path.join(nestedDir, 'ignore.txt');

  await Promise.all([
    writeFile(fileA, '# b\n', 'utf8'),
    writeFile(fileB, '# a\n', 'utf8'),
    writeFile(fileC, '# c\n', 'utf8'),
    writeFile(ignored, 'skip me', 'utf8'),
  ]);

  const resolved = await resolvePublishInputSet(dir);
  const expected = [fileA, fileB, fileC].sort((left, right) => left.localeCompare(right, 'en'));

  assert.equal(resolved.mode, 'directory');
  assert.equal(resolved.rootPath, dir);
  assert.deepEqual(resolved.markdownFiles, expected);
});

test('resolvePublishInputSet rejects directory without markdown files', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  await writeFile(path.join(dir, 'notes.txt'), 'no md', 'utf8');
  await assert.rejects(() => resolvePublishInputSet(dir), /No \.md files found under directory:/);
});
