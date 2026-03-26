import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');

async function collectTsFiles(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectTsFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.ts')) {
      out.push(fullPath);
    }
  }
  return out;
}

test('src/lark does not depend on commands layer imports', async () => {
  const files = await collectTsFiles(path.join(repoRoot, 'src', 'lark'));
  const offenders: string[] = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (/from ['"][^'"]*commands\//.test(content)) {
      offenders.push(path.relative(repoRoot, file));
    }
  }

  assert.deepEqual(offenders, []);
});
