import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testsDir, '..');
const distCliPath = path.join(projectRoot, 'dist/cli/publish-md-to-lark.js');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

interface CliRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

let buildPromise: Promise<void> | undefined;

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function ensureDistBuilt(): Promise<void> {
  if (buildPromise) {
    await buildPromise;
    return;
  }

  buildPromise = new Promise<void>((resolve, reject) => {
    const child = spawn(npmCmd, ['run', 'build'], {
      cwd: projectRoot,
      env: process.env,
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
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm run build failed with code ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });

  await buildPromise;
}

test('dist CLI keeps shebang and executable bit after build', async () => {
  await ensureDistBuilt();

  const code = await readFile(distCliPath, 'utf8');
  assert.ok(code.startsWith('#!/usr/bin/env node\n'));

  const mode = (await stat(distCliPath)).mode & 0o777;
  assert.ok((mode & 0o111) !== 0, `Expected executable mode on ${distCliPath}, got ${mode.toString(8)}`);
});

test('dist CLI can be invoked directly', {
  skip: process.platform === 'win32',
}, async () => {
  await ensureDistBuilt();

  const result = await runCommand(distCliPath, ['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Usage:/m);
  assert.match(result.stdout, /--help, -h/);
  assert.equal(result.stderr.trim(), '');
});

test('dist CLI dry-run can load a local preset module', async (t) => {
  await ensureDistBuilt();

  const dir = await mkdtemp(path.join(tmpdir(), 'md-to-lark-dist-cli-'));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const markdownPath = path.join(dir, 'sample.md');
  const presetPath = path.join(dir, 'preset.mjs');
  await writeFile(markdownPath, '# Before\n\ncontent\n', 'utf8');
  await writeFile(
    presetPath,
    [
      'export default function transformMarkdown(markdown) {',
      "  return markdown.replace('# Before', '# After');",
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  const result = await runCommand(
    'node',
    [distCliPath, '--input', markdownPath, '--preset', presetPath, '--dry-run'],
    {
      LARK_APP_ID: 'dist_test_app_id',
      LARK_APP_SECRET: 'dist_test_app_secret',
      LARK_FOLDER_TOKEN: 'fld_dist_test',
    },
  );

  assert.equal(result.code, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stdout, /Preset:/);
  assert.match(result.stdout, /\[dry-run 1\/1\] title: \d{8}-After/);
  assert.equal(result.stderr.trim(), '');
});
