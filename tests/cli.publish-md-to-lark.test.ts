import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testsDir, '..');

interface CliRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], env: NodeJS.ProcessEnv = {}): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli/publish-md-to-lark.ts', ...args], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

const baseEnv: NodeJS.ProcessEnv = {
  LARK_APP_ID: 'cli_test_app_id',
  LARK_APP_SECRET: 'cli_test_app_secret',
  LARK_TOKEN_TYPE: 'tenant',
};

test('CLI exits with code 1 and prints usage when input is missing', async () => {
  const result = await runCli([], baseEnv);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Input path is required\. Use --input <file\.md\|dir>\./);
  assert.match(result.stderr, /^Usage:/m);
});

test('CLI dry-run exits with code 0 for a valid markdown input', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'md-to-lark-cli-'));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const file = path.join(dir, 'example with space.md');
  await writeFile(file, '# CLI Dry Run\n\ncontent', 'utf8');

  const result = await runCli(['--input', file, '--dry-run', '--folder', 'fld_cli'], baseEnv);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Resolved markdown files: 1 \(single\)/);
  assert.match(result.stdout, /\[dry-run 1\/1\] input:/);
  assert.equal(result.stderr.trim(), '');
});

test('CLI --help exits with code 0 and prints usage', async () => {
  const result = await runCli(['--help'], baseEnv);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Usage:/m);
  assert.match(result.stdout, /--help, -h/);
  assert.equal(result.stderr.trim(), '');
});
