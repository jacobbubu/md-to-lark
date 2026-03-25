import assert from 'node:assert/strict';
import test from 'node:test';
import { createLarkClientConfigFromEnv } from '../src/lark/client.js';

test('createLarkClientConfigFromEnv parses tenant config and trims values', () => {
  const config = createLarkClientConfigFromEnv({
    LARK_BASE_URL: ' https://open.feishu.cn/ ',
    LARK_APP_ID: ' app_id ',
    LARK_APP_SECRET: ' app_secret ',
    LARK_TOKEN_TYPE: 'tenant',
  });

  assert.deepEqual(config, {
    baseUrl: 'https://open.feishu.cn',
    appId: 'app_id',
    appSecret: 'app_secret',
    tokenType: 'tenant',
    userAccessToken: '',
  });
});

test('createLarkClientConfigFromEnv requires user access token for user token type', () => {
  assert.throws(
    () =>
      createLarkClientConfigFromEnv({
        LARK_APP_ID: 'id',
        LARK_APP_SECRET: 'secret',
        LARK_TOKEN_TYPE: 'user',
      }),
    /LARK_USER_ACCESS_TOKEN is required\./,
  );
});

test('createLarkClientConfigFromEnv rejects unsupported token type', () => {
  assert.throws(
    () =>
      createLarkClientConfigFromEnv({
        LARK_APP_ID: 'id',
        LARK_APP_SECRET: 'secret',
        LARK_TOKEN_TYPE: 'bot',
      }),
    /Unsupported LARK_TOKEN_TYPE "bot"/,
  );
});

test('createLarkClientConfigFromEnv requires app id and secret', () => {
  assert.throws(() => createLarkClientConfigFromEnv({}), /LARK_APP_ID is required\./);
  assert.throws(
    () =>
      createLarkClientConfigFromEnv({
        LARK_APP_ID: 'id',
      }),
    /LARK_APP_SECRET is required\./,
  );
});
