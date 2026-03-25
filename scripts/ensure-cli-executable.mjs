import { chmod, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const cliPath = path.join(projectRoot, 'dist/cli/publish-md-to-lark.js');

try {
  await stat(cliPath);
  await chmod(cliPath, 0o755);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[build] failed to set executable mode for ${cliPath}: ${message}`);
  process.exitCode = 1;
}
