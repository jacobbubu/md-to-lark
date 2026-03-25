import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareMarkdownBeforePublish } from '../src/pipeline/index.js';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'md-to-lark-prepare-'));
}

test('prepareMarkdownBeforePublish keeps content unchanged when remote image download is disabled', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const markdown = 'before\n\n![img](https://example.com/a.png)\n\nafter\n';
  const result = await prepareMarkdownBeforePublish('/tmp/a.md', markdown, {
    enabled: false,
    prepareDir: path.join(dir, 'prepare-a'),
  });

  assert.equal(result.changed, false);
  assert.equal(result.preparedContent, markdown);
  assert.equal(result.remoteImageCount, 1);
  assert.equal(result.downloadedCount, 0);
  assert.equal(result.failedCount, 0);
  assert.equal(result.logEntries.length, 1);
  assert.equal(result.logEntries[0]?.status, 'skipped-disabled');
  assert.equal(result.logEntries[0]?.sourceType, 'image');

  const logText = await readFile(result.logFilePath, 'utf8');
  assert.match(logText, /"remoteImageCount": 1/);
});

test('prepareMarkdownBeforePublish collects yt-dlp line matches and skips when yt-dlp path is missing', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const markdown = [
    '---',
    'url_handlers:',
    '  yt_dlp:',
    '    prefixes:',
    '      - "youtube.com"',
    '---',
    '',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '',
  ].join('\n');

  const result = await prepareMarkdownBeforePublish('/tmp/b.md', markdown, {
    enabled: true,
    prepareDir: path.join(dir, 'prepare-b'),
  });

  assert.equal(result.changed, false);
  assert.equal(result.remoteYtDlpCount, 1);
  assert.equal(result.ytDlpDownloadedCount, 0);
  assert.equal(result.ytDlpFailedCount, 0);
  assert.equal(result.logEntries.length, 1);
  assert.equal(result.logEntries[0]?.status, 'skipped-disabled');
  assert.equal(result.logEntries[0]?.sourceType, 'yt_dlp');
});

test('prepareMarkdownBeforePublish replaces standalone yt-dlp URL with local media link only', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const fakeYtDlpPath = path.join(dir, 'fake-yt-dlp.js');
  const fakeYtDlpScript = [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    'const args = process.argv.slice(2);',
    "const dirIndex = args.indexOf('--paths');",
    "const downloadDir = dirIndex >= 0 ? args[dirIndex + 1] : process.cwd();",
    "const sourceUrl = args[args.length - 1] || 'https://example.com/video';",
    "fs.mkdirSync(downloadDir, { recursive: true });",
    "const filePath = path.join(downloadDir, 'sample-video.mp4');",
    "fs.writeFileSync(filePath, 'video-bytes');",
    "process.stdout.write(`__M2L__${filePath}\\t${sourceUrl}\\t1\\n`);",
  ].join('\n');
  await writeFile(fakeYtDlpPath, fakeYtDlpScript, { encoding: 'utf8', mode: 0o755 });
  await chmod(fakeYtDlpPath, 0o755);

  const markdown = [
    '---',
    'url_handlers:',
    '  yt_dlp:',
    '    prefixes:',
    '      - "youtube.com"',
    '---',
    '',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '',
  ].join('\n');

  const result = await prepareMarkdownBeforePublish('/tmp/c.md', markdown, {
    enabled: true,
    prepareDir: path.join(dir, 'prepare-c'),
    ytDlpPath: fakeYtDlpPath,
  });

  assert.equal(result.changed, true);
  assert.equal(result.remoteYtDlpCount, 1);
  assert.equal(result.ytDlpDownloadedCount, 1);
  assert.equal(result.ytDlpFailedCount, 0);
  assert.match(result.preparedContent, /\[sample-video\.mp4\]\(<.*sample-video\.mp4>\)/);
  assert.doesNotMatch(result.preparedContent, /https:\/\/www\.youtube\.com\/watch/);
  assert.doesNotMatch(result.preparedContent, /playlist:/);
  assert.doesNotMatch(result.preparedContent, /video:/);
});

test('prepareMarkdownBeforePublish escapes markdown special chars in yt-dlp link label', async (t) => {
  const dir = await createTempDir();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const fakeYtDlpPath = path.join(dir, 'fake-yt-dlp-escape.js');
  const fakeYtDlpScript = [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    'const args = process.argv.slice(2);',
    "const dirIndex = args.indexOf('--paths');",
    "const downloadDir = dirIndex >= 0 ? args[dirIndex + 1] : process.cwd();",
    "const sourceUrl = args[args.length - 1] || 'https://example.com/video';",
    "fs.mkdirSync(downloadDir, { recursive: true });",
    "const filePath = path.join(downloadDir, 'nash_su_-_e_acc_-_Claude_+_Figma-2024.mp4');",
    "fs.writeFileSync(filePath, 'video-bytes');",
    "process.stdout.write(`__M2L__${filePath}\\t${sourceUrl}\\t1\\n`);",
  ].join('\n');
  await writeFile(fakeYtDlpPath, fakeYtDlpScript, { encoding: 'utf8', mode: 0o755 });
  await chmod(fakeYtDlpPath, 0o755);

  const markdown = [
    '---',
    'url_handlers:',
    '  yt_dlp:',
    '    prefixes:',
    '      - "x.com"',
    '---',
    '',
    'https://x.com/i/status/123',
    '',
  ].join('\n');

  const result = await prepareMarkdownBeforePublish('/tmp/d.md', markdown, {
    enabled: true,
    prepareDir: path.join(dir, 'prepare-d'),
    ytDlpPath: fakeYtDlpPath,
  });

  assert.equal(result.changed, true);
  assert.equal(result.ytDlpDownloadedCount, 1);
  assert.match(
    result.preparedContent,
    /\[nash\\_su\\_-\\_e\\_acc\\_-\\_Claude\\_\+\\_Figma-2024\.mp4\]\(<.*nash_su_-_e_acc_-_Claude_\+_Figma-2024\.mp4>\)/,
  );
});
