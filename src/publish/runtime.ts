import path from 'node:path';
import * as lark from '@larksuiteoapi/node-sdk';
import type { PublishMdCliOptions } from '../commands/publish-md/args.js';
import {
  DEFAULT_MERMAID_BOARD_SYNTAX_TYPE,
  normalizeMermaidRenderTarget,
} from '../commands/publish-md/mermaid-render.js';
import type { LoadedMarkdownPreset } from '../commands/publish-md/preset-loader.js';
import {
  buildLarkDocumentUrl,
  createLarkClientConfigFromEnv,
  deriveLarkDocumentBaseUrl,
  normalizeLarkDocumentBaseUrl,
} from '../lark/index.js';
import type { LarkRequestOptions } from '../lark/docx/ops.js';
import type { MermaidRenderConfig } from '../lark/docx/render-types.js';
import type { PrepareMarkdownOptions } from '../pipeline/markdown/prepare-markdown.js';
import { RateLimiter } from '../shared/rate-limiter.js';

function getSdkDomain(baseUrl: string): lark.Domain | string {
  const lower = baseUrl.toLowerCase();
  if (lower.includes('open.larksuite.com')) return lark.Domain.Lark;
  if (lower.includes('open.feishu.cn')) return lark.Domain.Feishu;
  return baseUrl;
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value);
}

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

function parseOptionalEnvNonNegativeInt(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return toNonNegativeInt(Number(trimmed));
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim().length === 0) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeOptionalPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed === '~') return process.env.HOME;
  if (trimmed.startsWith('~/')) {
    const home = process.env.HOME;
    return home ? path.join(home, trimmed.slice(2)) : trimmed;
  }
  return trimmed;
}

export interface PublishPrepareRuntimeConfig extends Omit<PrepareMarkdownOptions, 'prepareDir'> {}

export interface PublishRuntime {
  env: NodeJS.ProcessEnv;
  markdownPreset: LoadedMarkdownPreset | null;
  documentBaseUrl: string;
  documentUrlFor: (documentId: string) => string;
  authOptions: LarkRequestOptions;
  sdkClient: lark.Client;
  docxLimiter: RateLimiter;
  mediaLimiter: RateLimiter;
  docxLimiterIntervalMs: number;
  mediaLimiterIntervalMs: number;
  publishCooldownMs: number;
  pipelineCacheRootDir: string;
  titleDatePrefix: boolean;
  downloadRemoteImages: boolean;
  ytDlpPath?: string;
  mermaidRenderConfig: MermaidRenderConfig;
  prepareConfig: PublishPrepareRuntimeConfig;
}

export function buildPublishRuntime(
  options: PublishMdCliOptions,
  env: NodeJS.ProcessEnv,
  markdownPreset: LoadedMarkdownPreset | null,
): PublishRuntime {
  const config = createLarkClientConfigFromEnv(env);
  const sdkClient = new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: getSdkDomain(config.baseUrl),
    loggerLevel: lark.LoggerLevel.warn,
    disableTokenCache: false,
  });

  const authOptions: LarkRequestOptions =
    config.tokenType === 'user' ? lark.withUserAccessToken(config.userAccessToken) : undefined;

  const docxLimiterIntervalMs = toPositiveInt(Number((env.LARK_DOCX_MIN_INTERVAL_MS ?? '').trim())) ?? 260;
  const mediaLimiterIntervalMs = toPositiveInt(Number((env.LARK_MEDIA_MIN_INTERVAL_MS ?? '').trim())) ?? 450;
  const publishCooldownMs = toPositiveInt(Number((env.LARK_PUBLISH_COOLDOWN_MS ?? '').trim())) ?? 600;
  const downloadRemoteImages = options.downloadRemoteImages ?? parseBoolean(env.DOWNLOAD_REMOTE_IMAGES, true);
  const titleDatePrefix = options.titleDatePrefix ?? parseBoolean(env.LARK_TITLE_DATE_PREFIX, true);
  const ytDlpPath = normalizeOptionalPath(options.ytDlpPath ?? env.YT_DLP_PATH);
  const ytDlpCookiesPath = normalizeOptionalPath(options.ytDlpCookiesPath ?? env.YT_DLP_COOKIES_PATH);
  const pipelineCacheRootDir = path.resolve(
    options.pipelineCacheDir ?? env.PIPELINE_CACHE_DIR ?? './out/pipeline-cache',
  );
  const documentBaseUrlCandidate = options.documentBaseUrl?.trim()
    ? options.documentBaseUrl.trim()
    : env.LARK_DOCUMENT_BASE_URL?.trim()
      ? env.LARK_DOCUMENT_BASE_URL.trim()
      : deriveLarkDocumentBaseUrl(config.baseUrl);
  const documentBaseUrl = normalizeLarkDocumentBaseUrl(documentBaseUrlCandidate);
  const prepareTimeoutMs = toPositiveInt(Number((env.PREPARE_TIMEOUT_MS ?? '').trim())) ?? 15_000;
  const prepareMaxRetries = toNonNegativeInt(Number((env.PREPARE_MAX_RETRIES ?? '').trim())) ?? 3;
  const prepareBackoffBaseMs = toPositiveInt(Number((env.PREPARE_BACKOFF_BASE_MS ?? '').trim())) ?? 500;
  const prepareBackoffMaxMs = toPositiveInt(Number((env.PREPARE_BACKOFF_MAX_MS ?? '').trim())) ?? 5_000;
  const prepareBackoffJitterRatio = Number((env.PREPARE_BACKOFF_JITTER_RATIO ?? '').trim());
  const prepareJitter =
    Number.isFinite(prepareBackoffJitterRatio) && prepareBackoffJitterRatio >= 0 ? prepareBackoffJitterRatio : 0.2;
  const ytDlpTimeoutMs = toPositiveInt(Number((env.YT_DLP_TIMEOUT_MS ?? '').trim())) ?? 600_000;
  const mermaidTarget = normalizeMermaidRenderTarget(options.mermaidTarget ?? env.LARK_MERMAID_TARGET);
  const mermaidBoardSyntaxType =
    options.mermaidBoardSyntaxType ??
    parseOptionalEnvNonNegativeInt(env.LARK_MERMAID_BOARD_SYNTAX_TYPE) ??
    DEFAULT_MERMAID_BOARD_SYNTAX_TYPE;
  const mermaidBoardStyleType =
    options.mermaidBoardStyleType ?? parseOptionalEnvNonNegativeInt(env.LARK_MERMAID_BOARD_STYLE_TYPE);
  const mermaidBoardDiagramType =
    options.mermaidBoardDiagramType ?? parseOptionalEnvNonNegativeInt(env.LARK_MERMAID_BOARD_DIAGRAM_TYPE);
  const mermaidRenderConfig: MermaidRenderConfig = {
    target: mermaidTarget,
    board: {
      syntaxType: mermaidBoardSyntaxType,
      ...(mermaidBoardStyleType === undefined ? {} : { styleType: mermaidBoardStyleType }),
      ...(mermaidBoardDiagramType === undefined ? {} : { diagramType: mermaidBoardDiagramType }),
    },
  };

  return {
    env,
    markdownPreset,
    documentBaseUrl,
    documentUrlFor: (documentId: string) => buildLarkDocumentUrl(documentBaseUrl, documentId),
    authOptions,
    sdkClient,
    docxLimiter: new RateLimiter(docxLimiterIntervalMs),
    mediaLimiter: new RateLimiter(mediaLimiterIntervalMs),
    docxLimiterIntervalMs,
    mediaLimiterIntervalMs,
    publishCooldownMs,
    pipelineCacheRootDir,
    titleDatePrefix,
    downloadRemoteImages,
    ...(ytDlpPath ? { ytDlpPath } : {}),
    mermaidRenderConfig,
    prepareConfig: {
      enabled: downloadRemoteImages,
      timeoutMs: prepareTimeoutMs,
      maxRetries: prepareMaxRetries,
      backoffBaseMs: prepareBackoffBaseMs,
      backoffMaxMs: prepareBackoffMaxMs,
      backoffJitterRatio: prepareJitter,
      ytDlpTimeoutMs,
      ...(ytDlpPath ? { ytDlpPath } : {}),
      ...(ytDlpCookiesPath ? { ytDlpCookiesPath } : {}),
    },
  };
}

export function logPublishRuntimeSummary(
  runtime: PublishRuntime,
  inputCount: number,
  inputMode: 'single' | 'directory',
): void {
  console.error(`Resolved markdown files: ${inputCount} (${inputMode === 'single' ? 'single' : 'directory'})`);
  console.error(
    `Rate limits: docx=${runtime.docxLimiterIntervalMs}ms media=${runtime.mediaLimiterIntervalMs}ms cooldown=${runtime.publishCooldownMs}ms`,
  );
  console.error(
    `Prepare: download_remote_images=${String(runtime.downloadRemoteImages)} yt_dlp=${runtime.ytDlpPath ? 'enabled' : 'disabled'}`,
  );
  console.error(
    runtime.mermaidRenderConfig.target === 'board'
      ? `Mermaid: target=board syntax_type=${String(runtime.mermaidRenderConfig.board.syntaxType)} style_type=${String(
          runtime.mermaidRenderConfig.board.styleType ?? '(default)',
        )} diagram_type=${String(runtime.mermaidRenderConfig.board.diagramType ?? '(default)')}`
      : 'Mermaid: target=text-drawing',
  );
  console.error(`Document URL base: ${runtime.documentBaseUrl}`);
  if (runtime.markdownPreset) {
    console.error(`Preset: ${runtime.markdownPreset.displayPath}`);
  }
}
