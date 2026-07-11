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
  const payload = JSON.parse(result.stdout) as Array<{
    documentId: string | null;
    documentUrl: string | null;
    status: string;
    title: string;
  }>;
  assert.equal(payload.length, 1);
  assert.equal(payload[0]?.documentId, null);
  assert.equal(payload[0]?.documentUrl, null);
  assert.equal(payload[0]?.status, 'dry-run');
  assert.match(payload[0]?.title ?? '', /^\d{8}-CLI Dry Run$/);
  assert.match(result.stderr, /Resolved markdown files: 1 \(single\)/);
  assert.match(result.stderr, /\[dry-run 1\/1\] input:/);
});

test('CLI pure local dry-run does not require destination or Lark credentials', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'md-to-lark-cli-local-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'local.md');
  await writeFile(file, '# Local\n\ncontent', 'utf8');
  const result = await runCli(['--input', file, '--dry-run'], {
    LARK_APP_ID: '',
    LARK_APP_SECRET: '',
    LARK_FOLDER_TOKEN: '',
    FEISHU_FOLDER_TOKEN: '',
  });
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout) as Array<{ status?: string; documentId?: string | null }>;
  assert.equal(payload[0]?.status, 'dry-run');
  assert.equal(payload[0]?.documentId, null);
});

test('CLI --help exits with code 0 and prints usage', async () => {
  const result = await runCli(['--help'], baseEnv);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Usage:/m);
  assert.match(result.stdout, /--help, -h/);
  assert.equal(result.stderr.trim(), '');
});

test('CLI --print-capabilities does not require publish credentials', async () => {
  const result = await runCli(['--print-capabilities'], {});
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout) as { protocols?: string[]; capabilities?: Record<string, number> };
  assert.deepEqual(payload.protocols, ['article-render/v1']);
  assert.equal(payload.capabilities?.['semantic-directives'], 1);
  assert.equal(result.stderr, '');
});

test('CLI --validate-contract validates a standalone contract without publish credentials', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'md-to-lark-cli-contract-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const contractPath = path.join(dir, 'index.lark.yml');
  await writeFile(
    contractPath,
    `protocol: article-render/v1\nrenderer: lark\ndocument: { source: index.md }\nrequirements: [semantic-directives]\ntargets: { lark: {} }\n`,
  );
  const result = await runCli(['--validate-contract', contractPath], {});
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout) as { contract?: { protocol?: string }; strict?: boolean };
  assert.equal(payload.contract?.protocol, 'article-render/v1');
  assert.equal(result.stderr, '');
});
