import 'dotenv/config';
import * as lark from '@larksuiteoapi/node-sdk';
import { createLarkClientConfigFromEnv } from '../src/lark/index.js';
import { normalizeDocumentId } from '../src/lark/docx/ops.js';

type RequestOptions = ReturnType<typeof lark.withUserAccessToken> | undefined;

interface CliOptions {
  documentId: string;
  boardIndex: number;
}

function usage(): string {
  return [
    'Usage: npm run fetch:board-data -- --doc <document_id> [--index <n>]',
    '',
    'Options:',
    '  --doc, -d   Feishu document id (doc_xxx or xxx).',
    '  --index, -n 1-based board index in document order. Default: 1.',
    '  --help, -h  Show this help message.',
    '',
    'Example:',
    '  npm run fetch:board-data -- --doc doxcabc123 --index 2',
  ].join('\n');
}

function parsePositiveInt(raw: string, flag: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer, received: ${raw}`);
  }
  return value;
}

function parseArgs(argv: string[]): CliOptions {
  let documentId = '';
  let boardIndex = 1;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }

    if (arg === '--doc' || arg === '-d') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --doc.');
      documentId = value.trim();
      i += 1;
      continue;
    }

    if (arg === '--index' || arg === '-n') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --index.');
      boardIndex = parsePositiveInt(value, '--index');
      i += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!documentId) {
      documentId = arg.trim();
      continue;
    }

    if (boardIndex === 1) {
      boardIndex = parsePositiveInt(arg, 'board index');
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!documentId) {
    throw new Error('Missing --doc <document_id>.');
  }

  return {
    documentId,
    boardIndex,
  };
}

function getSdkDomain(baseUrl: string): lark.Domain | string {
  const lower = baseUrl.toLowerCase();
  if (lower.includes('open.larksuite.com')) return lark.Domain.Lark;
  if (lower.includes('open.feishu.cn')) return lark.Domain.Feishu;
  return baseUrl;
}

function toObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getResponseData(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== 'object') return {};
  const envelope = response as Record<string, unknown>;
  const data = envelope.data;
  if (!data || typeof data !== 'object') return {};
  return data as Record<string, unknown>;
}

function assertSuccessEnvelope(response: unknown, label: string): void {
  if (!response || typeof response !== 'object') return;
  const envelope = response as Record<string, unknown>;
  const code = envelope.code;
  if (typeof code === 'number' && code !== 0) {
    const msg = typeof envelope.msg === 'string' ? envelope.msg : '';
    throw new Error(`${label} failed: code=${code} msg=${msg}`);
  }
}

function pickWhiteboardId(rawBlock: Record<string, unknown>): string {
  const board = toObjectRecord(rawBlock.board);
  if (!board) return '';
  const candidates = [board.token, board.whiteboard_id, board.board_token, board.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return '';
}

async function listRawDocBlocks(
  client: lark.Client,
  documentId: string,
  authOptions: RequestOptions,
): Promise<Record<string, unknown>[]> {
  const blocks: Record<string, unknown>[] = [];
  let pageToken = '';
  let hasMore = true;

  while (hasMore) {
    const response = await client.docx.documentBlock.list(
      {
        path: {
          document_id: documentId,
        },
        params: {
          page_size: 500,
          document_revision_id: -1,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      },
      authOptions,
    );
    assertSuccessEnvelope(response, 'docx.documentBlock.list');
    const data = getResponseData(response);
    const items = Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      const row = toObjectRecord(item);
      if (row) blocks.push(row);
    }
    hasMore = Boolean(data.has_more);
    pageToken = typeof data.page_token === 'string' ? data.page_token : '';
  }

  return blocks;
}

async function getRawBlockById(
  client: lark.Client,
  documentId: string,
  blockId: string,
  authOptions: RequestOptions,
): Promise<Record<string, unknown> | null> {
  const response = await client.docx.documentBlock.get(
    {
      path: {
        document_id: documentId,
        block_id: blockId,
      },
    },
    authOptions,
  );
  assertSuccessEnvelope(response, 'docx.documentBlock.get');
  const data = getResponseData(response);
  return toObjectRecord(data.block);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const normalizedDocumentId = normalizeDocumentId(options.documentId);

  const config = createLarkClientConfigFromEnv(process.env);
  const client = new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: getSdkDomain(config.baseUrl),
    loggerLevel: lark.LoggerLevel.warn,
    disableTokenCache: false,
  });
  const authOptions: RequestOptions =
    config.tokenType === 'user' ? lark.withUserAccessToken(config.userAccessToken) : undefined;

  const allBlocks = await listRawDocBlocks(client, normalizedDocumentId, authOptions);
  const boardBlocks = allBlocks.filter((block) => block.block_type === 43);
  if (boardBlocks.length === 0) {
    throw new Error(`No board block (block_type=43) found in document ${normalizedDocumentId}.`);
  }

  const boardArrayIndex = options.boardIndex - 1;
  const boardBlock = boardBlocks[boardArrayIndex];
  if (!boardBlock) {
    throw new Error(
      `Board index out of range: requested #${options.boardIndex}, total boards=${boardBlocks.length} in document ${normalizedDocumentId}.`,
    );
  }

  const boardBlockId = typeof boardBlock.block_id === 'string' ? boardBlock.block_id : '';
  if (!boardBlockId) {
    throw new Error(`Invalid board block: missing block_id at index #${options.boardIndex}.`);
  }

  let resolvedBoardBlock = boardBlock;
  let whiteboardId = pickWhiteboardId(resolvedBoardBlock);
  if (!whiteboardId) {
    const fetched = await getRawBlockById(client, normalizedDocumentId, boardBlockId, authOptions);
    if (fetched) {
      resolvedBoardBlock = fetched;
      whiteboardId = pickWhiteboardId(fetched);
    }
  }
  if (!whiteboardId) {
    throw new Error(
      `Unable to resolve whiteboard_id/token from board block ${boardBlockId} (document ${normalizedDocumentId}).`,
    );
  }

  const whiteboardThemeResponse = await client.board.v1.whiteboard.theme(
    {
      path: {
        whiteboard_id: whiteboardId,
      },
    },
    authOptions,
  );
  assertSuccessEnvelope(whiteboardThemeResponse, 'board.v1.whiteboard.theme');

  const whiteboardNodeListResponse = await client.board.v1.whiteboardNode.list(
    {
      path: {
        whiteboard_id: whiteboardId,
      },
    },
    authOptions,
  );
  assertSuccessEnvelope(whiteboardNodeListResponse, 'board.v1.whiteboardNode.list');

  const output = {
    schema: 'DOCX_BOARD_DATA',
    version: '1.0.0',
    documentId: normalizedDocumentId,
    requestedBoardIndex: options.boardIndex,
    totalBoardBlocks: boardBlocks.length,
    selectedBoardBlockId: boardBlockId,
    whiteboardId,
    boardBlock: resolvedBoardBlock,
    whiteboardTheme: getResponseData(whiteboardThemeResponse),
    whiteboardNodes: getResponseData(whiteboardNodeListResponse),
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  console.error('');
  console.error(usage());
  process.exitCode = 1;
});
