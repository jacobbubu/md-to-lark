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

async function expectNoImports(rootDir: string, disallowedPattern: RegExp): Promise<string[]> {
  const files = await collectTsFiles(rootDir);
  const offenders: string[] = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (disallowedPattern.test(content)) {
      offenders.push(path.relative(repoRoot, file));
    }
  }

  return offenders;
}

test('src/lark does not depend on commands layer imports', async () => {
  const offenders = await expectNoImports(path.join(repoRoot, 'src', 'lark'), /from ['"][^'"]*commands\//);
  assert.deepEqual(offenders, []);
});

test('src/pipeline does not depend on lark docx renderer imports', async () => {
  const offenders = await expectNoImports(path.join(repoRoot, 'src', 'pipeline'), /from ['"][^'"]*lark\/docx\//);
  assert.deepEqual(offenders, []);
});

test('publish command does not import legacy pipeline-transform bridge', async () => {
  const commandFile = path.join(repoRoot, 'src', 'commands', 'publish-md', 'command.ts');
  const content = await readFile(commandFile, 'utf8');
  assert.equal(/from ['"]\.\/pipeline-transform\.js['"]/.test(content), false);
});
