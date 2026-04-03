import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getScaledHeightForLocalImage,
  readLocalImageDimensions,
} from '../src/shared/image-metadata.js';

test('readLocalImageDimensions reads svg width and height attributes', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'md-to-lark-image-metadata-'));
  try {
    const imagePath = path.join(tempDir, 'diagram.svg');
    await writeFile(
      imagePath,
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200"></svg>',
      'utf8',
    );

    assert.deepEqual(readLocalImageDimensions(imagePath), { width: 1600, height: 1200 });
    assert.equal(getScaledHeightForLocalImage(imagePath, 1000), 750);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
