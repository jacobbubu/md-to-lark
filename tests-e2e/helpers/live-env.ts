import { access } from 'node:fs/promises';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { createLarkClientConfigFromEnv } from '../../src/lark/index.js';

export interface LiveE2EConfig {
  env: NodeJS.ProcessEnv;
  envPath: string;
  folderToken: string;
  titlePrefix: string;
}

let cachedConfig: LiveE2EConfig | null | undefined;

export async function loadLiveE2EConfig(): Promise<LiveE2EConfig | null> {
  if (cachedConfig !== undefined) {
    return cachedConfig;
  }

  const envPath = path.resolve(process.cwd(), '.env-test');
  try {
    await access(envPath);
  } catch {
    cachedConfig = null;
    return cachedConfig;
  }

  loadDotenv({ path: envPath, override: true });
  const env = { ...process.env };
  createLarkClientConfigFromEnv(env);

  const folderToken = (env.LARK_FOLDER_TOKEN ?? '').trim();
  if (!folderToken) {
    throw new Error('LARK_FOLDER_TOKEN is required in .env-test.');
  }

  const titlePrefix = (env.E2E_TITLE_PREFIX ?? 'MD-TO-LARK-E2E').trim() || 'MD-TO-LARK-E2E';
  cachedConfig = {
    env,
    envPath,
    folderToken,
    titlePrefix,
  };
  return cachedConfig;
}

export function getLiveE2ESkipReason(): string {
  return 'Missing .env-test. Copy .env-test.example or extract the required keys from .env.';
}

export function buildE2ETitle(config: LiveE2EConfig, slug: string): string {
  const normalizedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'case';
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const nonce = Math.random().toString(36).slice(2, 8);
  return `${config.titlePrefix}-${timestamp}-${normalizedSlug}-${nonce}`;
}
