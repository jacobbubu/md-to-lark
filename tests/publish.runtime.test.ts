import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { buildPublishRuntime, logPublishRuntimeSummary } from '../src/publish/runtime.js';
import type { PublishMdCliOptions } from '../src/commands/publish-md/args.js';
import type { LoadedMarkdownPreset } from '../src/commands/publish-md/preset-loader.js';

const baseOptions: PublishMdCliOptions = {
  inputPath: '/tmp/example.md',
  folderToken: 'fld_test',
  dryRun: true,
};

const baseEnv: NodeJS.ProcessEnv = {
  LARK_APP_ID: 'runtime_app_id',
  LARK_APP_SECRET: 'runtime_app_secret',
  LARK_TOKEN_TYPE: 'tenant',
};

async function withCapturedConsole<T>(fn: () => Promise<T> | T): Promise<{ result: T; logs: string[] }> {
  const originalLog = console.log;
  const originalError = console.error;
  const logs: string[] = [];
  const capture = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(' '));
  };
  console.log = capture;
  console.error = capture;
  try {
    const result = await fn();
    return { result, logs };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test('buildPublishRuntime derives env and option defaults into normalized runtime config', () => {
  const runtime = buildPublishRuntime(
    {
      ...baseOptions,
      titleDatePrefix: true,
      downloadRemoteImages: false,
      mermaidTarget: 'board',
      mermaidBoardStyleType: 7,
      pipelineCacheDir: './tmp-cache',
      ytDlpPath: '/tmp/bin/yt-dlp',
    },
    {
      ...baseEnv,
      LARK_DOCX_MIN_INTERVAL_MS: '123',
      LARK_MEDIA_MIN_INTERVAL_MS: '456',
      LARK_PUBLISH_COOLDOWN_MS: '789',
      PREPARE_TIMEOUT_MS: '999',
      PREPARE_MAX_RETRIES: '4',
      PREPARE_BACKOFF_BASE_MS: '600',
      PREPARE_BACKOFF_MAX_MS: '5000',
      PREPARE_BACKOFF_JITTER_RATIO: '0.4',
      YT_DLP_TIMEOUT_MS: '1000',
      LARK_MERMAID_BOARD_SYNTAX_TYPE: '9',
      LARK_MERMAID_BOARD_DIAGRAM_TYPE: '11',
    },
    null,
  );

  assert.equal(runtime.docxLimiterIntervalMs, 123);
  assert.equal(runtime.mediaLimiterIntervalMs, 456);
  assert.equal(runtime.publishCooldownMs, 789);
  assert.equal(runtime.downloadRemoteImages, false);
  assert.equal(runtime.titleDatePrefix, true);
  assert.equal(runtime.pipelineCacheRootDir, path.resolve('./tmp-cache'));
  assert.equal(runtime.ytDlpPath, '/tmp/bin/yt-dlp');
  assert.equal(runtime.mermaidRenderConfig.target, 'board');
  assert.equal(runtime.mermaidRenderConfig.board.syntaxType, 9);
  assert.equal(runtime.mermaidRenderConfig.board.styleType, 7);
  assert.equal(runtime.mermaidRenderConfig.board.diagramType, 11);
  assert.equal(runtime.prepareConfig.enabled, false);
  assert.equal(runtime.prepareConfig.timeoutMs, 999);
  assert.equal(runtime.prepareConfig.maxRetries, 4);
  assert.equal(runtime.prepareConfig.backoffBaseMs, 600);
  assert.equal(runtime.prepareConfig.backoffMaxMs, 5000);
  assert.equal(runtime.prepareConfig.backoffJitterRatio, 0.4);
  assert.equal(runtime.prepareConfig.ytDlpTimeoutMs, 1000);
  assert.equal(runtime.prepareConfig.ytDlpPath, '/tmp/bin/yt-dlp');
  assert.equal(runtime.documentUrlFor('doccn_demo'), 'https://feishu.cn/docx/doccn_demo');
});

test('buildPublishRuntime prefers explicit document base url, then env, then derived fallback', () => {
  const fromOption = buildPublishRuntime(
    {
      ...baseOptions,
      documentBaseUrl: 'https://li.feishu.cn/docx/',
    },
    {
      ...baseEnv,
      LARK_DOCUMENT_BASE_URL: 'https://env.feishu.cn',
    },
    null,
  );
  assert.equal(fromOption.documentBaseUrl, 'https://li.feishu.cn');
  assert.equal(fromOption.documentUrlFor('doccn_demo'), 'https://li.feishu.cn/docx/doccn_demo');

  const fromEnv = buildPublishRuntime(
    baseOptions,
    {
      ...baseEnv,
      LARK_DOCUMENT_BASE_URL: 'https://li.feishu.cn/',
    },
    null,
  );
  assert.equal(fromEnv.documentUrlFor('doccn_demo'), 'https://li.feishu.cn/docx/doccn_demo');
});

test('logPublishRuntimeSummary prints resolved runtime and preset lines', async () => {
  const preset: LoadedMarkdownPreset = {
    sourcePath: '/tmp/preset.mjs',
    displayPath: 'builtin:test-preset',
    transform: (markdown) => markdown,
  };
  const runtime = buildPublishRuntime(baseOptions, baseEnv, preset);

  const { logs } = await withCapturedConsole(async () => {
    logPublishRuntimeSummary(runtime, 2, 'directory');
  });

  assert.ok(logs.some((line) => line.includes('Resolved markdown files: 2 (directory)')));
  assert.ok(logs.some((line) => line.includes('Rate limits: docx=')));
  assert.ok(logs.some((line) => line.includes('Prepare: download_remote_images=')));
  assert.ok(logs.some((line) => line.includes('Mermaid: target=text-drawing')));
  assert.ok(logs.some((line) => line.includes('Preset: builtin:test-preset')));
});
