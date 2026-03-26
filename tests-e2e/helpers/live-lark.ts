import * as lark from '@larksuiteoapi/node-sdk';
import { buildBTT } from '../../src/btt/index.js';
import { convertBTTToLAST } from '../../src/interop/index.js';
import { createLarkClientConfigFromEnv, getLarkBlockTypeName } from '../../src/lark/index.js';
import {
  createDocument,
  getRawDocumentBlockById,
  listAllDocumentBlocks,
  listFolderChildren,
  type LarkRequestOptions,
} from '../../src/lark/docx/ops.js';
import type { LarkDocxBlock } from '../../src/lark/types.js';
import { serializeLASTToMarkdown } from '../../src/last/index.js';
import { RateLimiter } from '../../src/shared/rate-limiter.js';
import type { LiveE2EConfig } from './live-env.js';

export interface LiveLarkContext {
  client: lark.Client;
  authOptions: LarkRequestOptions;
  docxLimiter: RateLimiter;
  mediaLimiter: RateLimiter;
  folderToken: string;
}

export interface LiveDocumentSnapshot {
  documentId: string;
  totalBlocks: number;
  blockTypes: Record<string, number>;
  markdown: string;
  markdownAvailable: boolean;
}

function getSdkDomain(baseUrl: string): lark.Domain | string {
  const lower = baseUrl.toLowerCase();
  if (lower.includes('open.larksuite.com')) return lark.Domain.Lark;
  if (lower.includes('open.feishu.cn')) return lark.Domain.Feishu;
  return baseUrl;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt((raw ?? '').trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createLiveLarkContext(config: LiveE2EConfig): LiveLarkContext {
  const clientConfig = createLarkClientConfigFromEnv(config.env);
  const client = new lark.Client({
    appId: clientConfig.appId,
    appSecret: clientConfig.appSecret,
    domain: getSdkDomain(clientConfig.baseUrl),
    loggerLevel: lark.LoggerLevel.warn,
    disableTokenCache: false,
  });

  return {
    client,
    authOptions:
      clientConfig.tokenType === 'user' ? lark.withUserAccessToken(clientConfig.userAccessToken) : undefined,
    docxLimiter: new RateLimiter(parsePositiveInt(config.env.LARK_DOCX_MIN_INTERVAL_MS, 260)),
    mediaLimiter: new RateLimiter(parsePositiveInt(config.env.LARK_MEDIA_MIN_INTERVAL_MS, 450)),
    folderToken: config.folderToken,
  };
}

export async function createEmptyDocumentForE2E(ctx: LiveLarkContext, title: string): Promise<string> {
  return createDocument(ctx.client, ctx.folderToken, title, ctx.authOptions, ctx.docxLimiter);
}

export async function findDocumentIdByTitle(ctx: LiveLarkContext, title: string): Promise<string | null> {
  const entries = await listFolderChildren(ctx.client, ctx.folderToken, ctx.authOptions, ctx.docxLimiter);
  const matched = entries.find((entry) => entry.type === 'docx' && entry.name === title);
  return matched?.token ?? null;
}

export async function waitForDocumentIdByTitle(
  ctx: LiveLarkContext,
  title: string,
  maxAttempts = 8,
  intervalMs = 1_000,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const documentId = await findDocumentIdByTitle(ctx, title);
    if (documentId) {
      return documentId;
    }
    if (attempt < maxAttempts - 1) {
      await sleep(intervalMs);
    }
  }
  throw new Error(`Unable to find published document by title "${title}" in folder "${ctx.folderToken}".`);
}

export async function fetchLiveDocumentBlocks(ctx: LiveLarkContext, documentId: string): Promise<LarkDocxBlock[]> {
  const listed = await listAllDocumentBlocks(ctx.client, documentId, ctx.authOptions, ctx.docxLimiter);
  const hydrated: LarkDocxBlock[] = [];
  for (const block of listed) {
    const rawBlock = await getRawDocumentBlockById(
      ctx.client,
      documentId,
      block.block_id,
      ctx.authOptions,
      ctx.docxLimiter,
    );
    if (rawBlock) {
      hydrated.push(rawBlock as LarkDocxBlock);
    } else {
      hydrated.push(block);
    }
  }
  return hydrated;
}

export function buildLiveDocumentSnapshot(documentId: string, blocks: LarkDocxBlock[]): LiveDocumentSnapshot {
  const blockTypes: Record<string, number> = {};
  for (const block of blocks) {
    const name = getLarkBlockTypeName(block.block_type);
    blockTypes[name] = (blockTypes[name] ?? 0) + 1;
  }

  let markdown = '';
  let markdownAvailable = false;
  try {
    const btt = buildBTT(documentId, blocks);
    const last = convertBTTToLAST(btt);
    markdown = serializeLASTToMarkdown(last, {
      includeUnsupportedComment: false,
    });
    markdownAvailable = true;
  } catch {
    markdown = '';
    markdownAvailable = false;
  }

  return {
    documentId,
    totalBlocks: blocks.length,
    blockTypes,
    markdown,
    markdownAvailable,
  };
}

export async function fetchLiveDocumentSnapshot(
  ctx: LiveLarkContext,
  documentId: string,
): Promise<LiveDocumentSnapshot> {
  const blocks = await fetchLiveDocumentBlocks(ctx, documentId);
  return buildLiveDocumentSnapshot(documentId, blocks);
}

export async function waitForLiveDocumentSnapshot(
  ctx: LiveLarkContext,
  documentId: string,
  predicate: (snapshot: LiveDocumentSnapshot) => boolean,
  description: string,
  maxAttempts = 8,
  intervalMs = 1_000,
): Promise<LiveDocumentSnapshot> {
  let lastSnapshot: LiveDocumentSnapshot | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    lastSnapshot = await fetchLiveDocumentSnapshot(ctx, documentId);
    if (predicate(lastSnapshot)) {
      return lastSnapshot;
    }
    if (attempt < maxAttempts - 1) {
      await sleep(intervalMs);
    }
  }

  const lastMarkdown = lastSnapshot?.markdown.trim() ?? '';
  throw new Error(
    `Document "${documentId}" did not satisfy condition "${description}". Last block types=${JSON.stringify(
      lastSnapshot?.blockTypes ?? {},
    )} lastMarkdown=${JSON.stringify(lastMarkdown.slice(0, 300))}`,
  );
}
