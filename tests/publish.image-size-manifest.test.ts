import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createImageSizeManifestResolver } from '../src/publish/image-size-manifest.js';

test('image manifest resolver matches path, absolute path, source URL and prepared alias', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'md-to-lark-image-manifest-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const manifestPath = path.join(dir, 'manifest.yml');
  await writeFile(
    manifestPath,
    `version: 1\nimages:\n  "assets/a.png":\n    source_url: https://example.com/a.png#fragment\n    display_ratio: 0.5\n    aspect_ratio: 2\n  "assets/b.png":\n    rendered_width: 300\n    container_width: 600\n`,
  );
  const preparedPath = path.join(dir, 'prepared-a.png');
  const result = await createImageSizeManifestResolver(manifestPath, {
    resourceBaseDir: dir,
    preparedAliases: new Map([[preparedPath, 'https://example.com/a.png']]),
  });
  assert.deepEqual(result.resolver('assets/a.png', {}), { widthRatio: 0.5, aspectRatio: 2 });
  assert.deepEqual(result.resolver(path.join(dir, 'assets/a.png'), {}), { widthRatio: 0.5, aspectRatio: 2 });
  assert.deepEqual(result.resolver('https://example.com/a.png#other', {}), { widthRatio: 0.5, aspectRatio: 2 });
  assert.deepEqual(result.resolver(preparedPath, {}), { widthRatio: 0.5, aspectRatio: 2 });
  assert.deepEqual(result.resolver('assets/b.png', {}), { widthRatio: 0.5 });
  assert.equal(result.resolutions[3]?.matchedBy, 'prepared-alias');
});

test('image manifest resolver rejects invalid display ratios', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'md-to-lark-image-manifest-invalid-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const manifestPath = path.join(dir, 'manifest.yml');
  await writeFile(manifestPath, `version: 1\nimages:\n  "assets/a.png":\n    display_ratio: 1.2\n`);
  await assert.rejects(() => createImageSizeManifestResolver(manifestPath, { resourceBaseDir: dir }), /display_ratio/);
});
