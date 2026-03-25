import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishMdToLark } from '../src/index.ts';

async function main(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
  const folderToken = process.env.LARK_FOLDER_TOKEN ?? 'fldrcn_demo_for_dry_run';

  const env = {
    ...process.env,
    LARK_APP_ID: process.env.LARK_APP_ID ?? 'demo_app_id',
    LARK_APP_SECRET: process.env.LARK_APP_SECRET ?? 'demo_app_secret',
  };

  console.log('[module-usage] input:', inputPath);
  console.log('[module-usage] mode: dry-run publish to lark');

  await publishMdToLark(
    {
      inputPath,
      folderToken,
      dryRun: true,
    },
    env,
  );
}

void main();
