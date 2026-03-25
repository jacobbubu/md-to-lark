import type { LarkClientConfig, LarkTokenType } from './types.js';

function trimSlashSuffix(input: string): string {
  return input.endsWith('/') ? input.slice(0, -1) : input;
}

function assertNonEmpty(value: string, name: string): void {
  if (!value) {
    throw new Error(`${name} is required.`);
  }
}

function parseTokenType(raw: string): LarkTokenType {
  if (raw === 'tenant' || raw === 'user') {
    return raw;
  }
  throw new Error(`Unsupported LARK_TOKEN_TYPE "${raw}". Expected "tenant" or "user".`);
}

function pickEnv(env: NodeJS.ProcessEnv, key: string, fallback = ''): string {
  return (env[key] ?? fallback).trim();
}

export function createLarkClientConfigFromEnv(env: NodeJS.ProcessEnv): LarkClientConfig {
  const baseUrl = trimSlashSuffix(pickEnv(env, 'LARK_BASE_URL', 'https://open.feishu.cn'));
  const appId = pickEnv(env, 'LARK_APP_ID');
  const appSecret = pickEnv(env, 'LARK_APP_SECRET');
  const tokenType = parseTokenType(pickEnv(env, 'LARK_TOKEN_TYPE', 'tenant'));
  const userAccessToken = pickEnv(env, 'LARK_USER_ACCESS_TOKEN');

  assertNonEmpty(appId, 'LARK_APP_ID');
  assertNonEmpty(appSecret, 'LARK_APP_SECRET');

  if (tokenType === 'user') {
    assertNonEmpty(userAccessToken, 'LARK_USER_ACCESS_TOKEN');
  }

  return {
    baseUrl,
    appId,
    appSecret,
    tokenType,
    userAccessToken,
  };
}
