#!/usr/bin/env node
import 'dotenv/config';
import { getPublishMdUsage, runPublishMdToLarkCli } from '../commands/publish-md/index.js';

async function main(): Promise<void> {
  try {
    await runPublishMdToLarkCli(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('');
    console.error(getPublishMdUsage());
    process.exitCode = 1;
  }
}

void main();
