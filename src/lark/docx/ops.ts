import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import * as lark from '@larksuiteoapi/node-sdk';
import { RateLimiter } from '../../shared/rate-limiter.js';
import { withRetry } from '../../shared/retry.js';

export interface DriveFileEntry {
  token: string;
  name: string;
  type: string;
}

export interface DocxBlockEntry {
  block_id: string;
  block_type: number;
  parent_id?: string;
  children?: string[];
}

export type LarkRequestOptions = ReturnType<typeof lark.withUserAccessToken> | undefined;

export interface CreateBoardPlantumlOptions {
  syntaxType?: number;
  styleType?: number;
  diagramType?: number;
}

const TABLE_CREATE_MAX_ROW_SIZE = 9;
const TABLE_CREATE_MAX_COLUMN_SIZE = 9;
const DOCX_CREATE_CHILDREN_BATCH_SIZE = 50;
// Feishu table expansion requests are sensitive: 9x10 / 10x9 direct-like batch expansion
// can return invalid param. Keep expansion as single-step insert per request.
const TABLE_EXPAND_BATCH_REQUEST_SIZE = 1;

interface TableCreatePlan {
  createPayload: Record<string, unknown>;
  targetRowSize: number;
  targetColumnSize: number;
  initialRowSize: number;
  initialColumnSize: number;
}

function toObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function getArray<T>(record: Record<string, unknown>, key: string): T[] {
  const value = record[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function assertSuccessEnvelope(response: unknown, label: string): void {
  if (!response || typeof response !== 'object') return;
  const envelope = response as Record<string, unknown>;
  const codeValue = envelope.code;
  if (typeof codeValue === 'number' && codeValue !== 0) {
    const msg = typeof envelope.msg === 'string' ? envelope.msg : '';
    throw new Error(`${label} failed: code=${codeValue} msg=${msg}`);
  }
}

function getResponseData(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== 'object') return {};
  const envelope = response as Record<string, unknown>;
  const data = envelope.data;
  if (!data || typeof data !== 'object') return {};
  return data as Record<string, unknown>;
}

function toDriveFile(value: unknown): DriveFileEntry | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.token !== 'string') return null;
  if (typeof row.name !== 'string') return null;
  if (typeof row.type !== 'string') return null;
  return {
    token: row.token,
    name: row.name,
    type: row.type,
  };
}

function toDocxBlock(value: unknown): DocxBlockEntry | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.block_id !== 'string') return null;
  if (typeof row.block_type !== 'number') return null;
  const children = Array.isArray(row.children)
    ? row.children.filter((item): item is string => typeof item === 'string')
    : undefined;
  return {
    block_id: row.block_id,
    block_type: row.block_type,
    ...(typeof row.parent_id === 'string' ? { parent_id: row.parent_id } : {}),
    ...(children ? { children } : {}),
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value);
}

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

function buildTableCreatePlan(block: Record<string, unknown>): TableCreatePlan | null {
  if (block.block_type !== 31) return null;

  const table = toObjectRecord(block.table);
  const property = toObjectRecord(table?.property);
  if (!table || !property) return null;

  const targetRowSize = Math.max(1, toPositiveInt(property.row_size) ?? 1);
  const targetColumnSize = Math.max(1, toPositiveInt(property.column_size) ?? 1);
  const initialRowSize = Math.min(targetRowSize, TABLE_CREATE_MAX_ROW_SIZE);
  const initialColumnSize = Math.min(targetColumnSize, TABLE_CREATE_MAX_COLUMN_SIZE);

  if (initialRowSize === targetRowSize && initialColumnSize === targetColumnSize) {
    return {
      createPayload: block,
      targetRowSize,
      targetColumnSize,
      initialRowSize,
      initialColumnSize,
    };
  }

  const createPayload = deepClone(block);
  const nextTable = createPayload.table as Record<string, unknown>;
  const nextProperty = (nextTable.property ?? {}) as Record<string, unknown>;
  nextProperty.row_size = initialRowSize;
  nextProperty.column_size = initialColumnSize;
  if (Array.isArray(nextProperty.column_width)) {
    nextProperty.column_width = nextProperty.column_width.slice(0, initialColumnSize);
  }
  nextTable.property = nextProperty;

  return {
    createPayload,
    targetRowSize,
    targetColumnSize,
    initialRowSize,
    initialColumnSize,
  };
}

function findRootBlockId(documentId: string, blocks: DocxBlockEntry[]): string {
  const byPageType = blocks.find((item) => item.block_type === 1);
  if (byPageType) return byPageType.block_id;

  const normalized = normalizeDocumentId(documentId);
  const byDocumentId = blocks.find((item) => item.block_id === normalized || item.block_id === documentId);
  if (byDocumentId) return byDocumentId.block_id;

  throw new Error(`Unable to locate root page block for document "${documentId}"`);
}

function isBatchDeleteOutOfRangeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /1770001|invalid param|start_index|end_index|out of range|no child/i.test(error.message);
}

function isInvalidParamError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /1770001|invalid param/i.test(error.message);
}

function isCreateInvalidParamError(error: unknown): boolean {
  return isInvalidParamError(error);
}

export function normalizeDocumentId(documentId: string): string {
  const trimmed = documentId.trim();
  return trimmed.startsWith('doc_') ? trimmed.slice('doc_'.length) : trimmed;
}

export async function listFolderChildren(
  client: lark.Client,
  folderToken: string,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<DriveFileEntry[]> {
  const files: DriveFileEntry[] = [];
  let pageToken = '';
  let hasMore = true;

  while (hasMore) {
    const params: {
      folder_token: string;
      page_size: number;
      page_token?: string;
    } = {
      folder_token: folderToken,
      page_size: 200,
    };
    if (pageToken) {
      params.page_token = pageToken;
    }

    await limiter.wait();
    const response = await withRetry('drive.file.list', async () =>
      client.drive.file.list(
        {
          params,
        },
        authOptions,
      ),
    );
    assertSuccessEnvelope(response, 'drive.file.list');
    const data = getResponseData(response);
    const entries = getArray<unknown>(data, 'files');
    for (const item of entries) {
      const parsed = toDriveFile(item);
      if (parsed) files.push(parsed);
    }
    hasMore = Boolean(data.has_more);
    pageToken = getString(data, 'next_page_token');
  }

  return files;
}

export async function createDocument(
  client: lark.Client,
  folderToken: string,
  title: string,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<string> {
  await limiter.wait();
  const response = await withRetry('docx.document.create', async () =>
    client.docx.document.create(
      {
        data: {
          folder_token: folderToken,
          title,
        },
      },
      authOptions,
    ),
  );
  assertSuccessEnvelope(response, 'docx.document.create');
  const data = getResponseData(response);
  const document = toObjectRecord(data.document);
  if (!document) {
    throw new Error(`docx.document.create returned no document for title="${title}"`);
  }
  const documentId = getString(document, 'document_id');
  if (!documentId) {
    throw new Error(`docx.document.create returned empty document_id for title="${title}"`);
  }
  return documentId;
}

export async function listAllDocumentBlocks(
  client: lark.Client,
  documentId: string,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<DocxBlockEntry[]> {
  const blocks: DocxBlockEntry[] = [];
  let pageToken = '';
  let hasMore = true;

  while (hasMore) {
    const params: {
      page_size: number;
      page_token?: string;
      document_revision_id: number;
    } = {
      page_size: 500,
      document_revision_id: -1,
    };
    if (pageToken) {
      params.page_token = pageToken;
    }

    await limiter.wait();
    const response = await withRetry('docx.documentBlock.list', async () =>
      client.docx.documentBlock.list(
        {
          path: {
            document_id: documentId,
          },
          params,
        },
        authOptions,
      ),
    );

    assertSuccessEnvelope(response, 'docx.documentBlock.list');
    const data = getResponseData(response);
    const items = getArray<unknown>(data, 'items');
    for (const item of items) {
      const parsed = toDocxBlock(item);
      if (parsed) blocks.push(parsed);
    }
    hasMore = Boolean(data.has_more);
    pageToken = getString(data, 'page_token');
  }

  return blocks;
}

export async function clearDocumentContent(
  client: lark.Client,
  documentId: string,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<string> {
  const blocks = await listAllDocumentBlocks(client, documentId, authOptions, limiter);
  const rootId = findRootBlockId(documentId, blocks);
  const rootBlock = blocks.find((item) => item.block_id === rootId);
  let remaining = rootBlock?.children?.length ?? 0;
  if (remaining <= 0) {
    return rootId;
  }

  let loopGuard = 0;
  while (remaining > 0) {
    if (loopGuard > 2000) {
      throw new Error(`clearDocumentContent exceeded safety loop count for document "${documentId}"`);
    }
    loopGuard += 1;

    const deleteCount = Math.min(remaining, 50);
    await limiter.wait();
    let response: unknown;
    try {
      response = await withRetry('docx.documentBlockChildren.batchDelete', async () =>
        client.docx.documentBlockChildren.batchDelete(
          {
            path: {
              document_id: documentId,
              block_id: rootId,
            },
            data: {
              start_index: 0,
              end_index: deleteCount,
            },
          },
          authOptions,
        ),
      );
    } catch (error) {
      if (isBatchDeleteOutOfRangeError(error)) {
        break;
      }
      throw error;
    }
    assertSuccessEnvelope(response, 'docx.documentBlockChildren.batchDelete');
    remaining -= deleteCount;
  }
  return rootId;
}

export async function clearBlockChildrenByKnownCount(
  client: lark.Client,
  documentId: string,
  blockId: string,
  childCount: number,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<void> {
  let remaining = Math.max(0, Math.trunc(childCount));
  while (remaining > 0) {
    const deleteCount = Math.min(remaining, 50);
    await limiter.wait();
    const response = await withRetry('docx.documentBlockChildren.batchDelete(cell)', async () =>
      client.docx.documentBlockChildren.batchDelete(
        {
          path: {
            document_id: documentId,
            block_id: blockId,
          },
          data: {
            start_index: 0,
            end_index: deleteCount,
          },
        },
        authOptions,
      ),
    );
    assertSuccessEnvelope(response, 'docx.documentBlockChildren.batchDelete(cell)');
    remaining -= deleteCount;
  }
}

async function batchUpdateDocumentBlocks(
  client: lark.Client,
  documentId: string,
  requests: Array<Record<string, unknown>>,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<void> {
  if (requests.length === 0) return;
  await limiter.wait();
  let response: unknown;
  try {
    response = await withRetry('docx.documentBlock.batchUpdate', async () =>
      client.docx.documentBlock.batchUpdate(
        {
          path: {
            document_id: documentId,
          },
          data: {
            requests: requests as any,
          },
        },
        authOptions,
      ),
    );
  } catch (error) {
    if (requests.length > 1 && isInvalidParamError(error)) {
      const mid = Math.floor(requests.length / 2);
      const left = requests.slice(0, mid);
      const right = requests.slice(mid);
      await batchUpdateDocumentBlocks(client, documentId, left, authOptions, limiter);
      await batchUpdateDocumentBlocks(client, documentId, right, authOptions, limiter);
      return;
    }
    throw error;
  }
  assertSuccessEnvelope(response, 'docx.documentBlock.batchUpdate');
}

async function expandTableToTargetSize(
  client: lark.Client,
  documentId: string,
  tableBlockId: string,
  initialRowSize: number,
  initialColumnSize: number,
  targetRowSize: number,
  targetColumnSize: number,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<void> {
  const rowRequests: Array<Record<string, unknown>> = [];
  for (let rowIndex = initialRowSize; rowIndex < targetRowSize; rowIndex += 1) {
    rowRequests.push({
      block_id: tableBlockId,
      insert_table_row: {
        row_index: rowIndex,
      },
    });
  }

  for (let start = 0; start < rowRequests.length; start += TABLE_EXPAND_BATCH_REQUEST_SIZE) {
    const requests = rowRequests.slice(start, start + TABLE_EXPAND_BATCH_REQUEST_SIZE);
    await batchUpdateDocumentBlocks(client, documentId, requests, authOptions, limiter);
  }

  const columnRequests: Array<Record<string, unknown>> = [];
  for (let columnIndex = initialColumnSize; columnIndex < targetColumnSize; columnIndex += 1) {
    columnRequests.push({
      block_id: tableBlockId,
      insert_table_column: {
        column_index: columnIndex,
      },
    });
  }

  for (let start = 0; start < columnRequests.length; start += TABLE_EXPAND_BATCH_REQUEST_SIZE) {
    const requests = columnRequests.slice(start, start + TABLE_EXPAND_BATCH_REQUEST_SIZE);
    await batchUpdateDocumentBlocks(client, documentId, requests, authOptions, limiter);
  }
}

export async function createDocumentChildren(
  client: lark.Client,
  documentId: string,
  parentBlockId: string,
  children: Record<string, unknown>[],
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<DocxBlockEntry[]> {
  const created: DocxBlockEntry[] = [];

  const createAndCollect = async (createPayloads: Record<string, unknown>[]): Promise<DocxBlockEntry[]> => {
    if (createPayloads.length === 0) return [];
    const payloads = [...createPayloads];
    const payloadTypes = createPayloads.map((payload) =>
      typeof payload.block_type === 'number' ? payload.block_type : Number.NaN,
    );
    await limiter.wait();
    let response: unknown;
    try {
      response = await withRetry('docx.documentBlockChildren.create', async () =>
        client.docx.documentBlockChildren.create(
          {
            path: {
              document_id: documentId,
              block_id: parentBlockId,
            },
            data: {
              children: payloads as any,
            },
          },
          authOptions,
        ),
      );
    } catch (error) {
      if (payloads.length > 1 && isCreateInvalidParamError(error)) {
        const mid = Math.floor(payloads.length / 2);
        const left = await createAndCollect(payloads.slice(0, mid));
        const right = await createAndCollect(payloads.slice(mid));
        return [...left, ...right];
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `docx.documentBlockChildren.create failed for block_types=${JSON.stringify(payloadTypes)} parent=${parentBlockId}: ${message}`,
      );
    }
    assertSuccessEnvelope(response, 'docx.documentBlockChildren.create');

    const data = getResponseData(response);
    const createdRaw = getArray<unknown>(data, 'children');
    const parsed: DocxBlockEntry[] = [];
    for (const item of createdRaw) {
      const block = toDocxBlock(item);
      if (block) {
        parsed.push(block);
      }
    }
    return parsed;
  };

  const flushNonTableBatch = async (batch: Record<string, unknown>[]): Promise<void> => {
    if (batch.length === 0) return;
    const parsed = await createAndCollect(batch);
    for (const block of parsed) {
      created.push(block);
    }
    batch.length = 0;
  };

  const nonTableBatch: Record<string, unknown>[] = [];
  for (const child of children) {
    const tablePlan = buildTableCreatePlan(child);
    if (!tablePlan) {
      nonTableBatch.push(child);
      if (nonTableBatch.length >= DOCX_CREATE_CHILDREN_BATCH_SIZE) {
        await flushNonTableBatch(nonTableBatch);
      }
      continue;
    }

    await flushNonTableBatch(nonTableBatch);

    const createPayload = tablePlan.createPayload;
    const payloadBlockType = typeof createPayload.block_type === 'number' ? createPayload.block_type : Number.NaN;
    const parsed = await createAndCollect([createPayload]);
    for (const block of parsed) {
      created.push(block);
    }

    const createdTable = parsed.find((item) => item.block_type === 31);
    const createdTableBlockId = createdTable?.block_id ?? '';
    if (!createdTableBlockId) {
      const tableProperty =
        payloadBlockType === 31 ? (toObjectRecord(toObjectRecord(createPayload.table)?.property) ?? null) : null;
      throw new Error(
        `Failed to resolve table block id after create for table expansion. block_type=${String(payloadBlockType)} table.property=${JSON.stringify(tableProperty)}`,
      );
    }

    await expandTableToTargetSize(
      client,
      documentId,
      createdTableBlockId,
      tablePlan.initialRowSize,
      tablePlan.initialColumnSize,
      tablePlan.targetRowSize,
      tablePlan.targetColumnSize,
      authOptions,
      limiter,
    );
  }
  await flushNonTableBatch(nonTableBatch);

  return created;
}

export async function resolveCreatedTableCellIds(
  client: lark.Client,
  documentId: string,
  tableBlockId: string,
  createdTableBlock: DocxBlockEntry | undefined,
  expectedCellCount: number,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<string[]> {
  const fromCreate = (createdTableBlock?.children ?? []).filter((item): item is string => typeof item === 'string');
  if (fromCreate.length >= expectedCellCount) {
    return fromCreate;
  }

  const fetchedTableBlock = await getDocumentBlockById(client, documentId, tableBlockId, authOptions, limiter);
  const fromGet = (fetchedTableBlock?.children ?? []).filter((item): item is string => typeof item === 'string');
  if (fromGet.length >= expectedCellCount) {
    return fromGet;
  }

  const blocks = await listAllDocumentBlocks(client, documentId, authOptions, limiter);
  const tableBlockFromList = blocks.find((item) => item.block_id === tableBlockId);
  const resolved = (tableBlockFromList?.children ?? []).filter((item): item is string => typeof item === 'string');
  if (resolved.length < expectedCellCount) {
    throw new Error(
      `Table "${tableBlockId}" created ${resolved.length} cells but expected at least ${expectedCellCount}.`,
    );
  }
  return resolved;
}

export async function patchTextBlockElements(
  client: lark.Client,
  documentId: string,
  textBlockId: string,
  elements: unknown[],
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
  align?: number,
): Promise<void> {
  await limiter.wait();
  let response: unknown;
  const operationName = align === undefined ? 'docx.documentBlock.patch(update_text_elements)' : 'docx.documentBlock.patch(update_text)';
  const data =
    align === undefined
      ? {
          update_text_elements: {
            elements: elements as any,
          },
        }
      : {
          update_text: {
            elements: elements as any,
            style: {
              align,
            },
            fields: [1],
          },
        };
  try {
    response = await withRetry(operationName, async () =>
      client.docx.documentBlock.patch(
        {
          path: {
            document_id: documentId,
            block_id: textBlockId,
          },
          data,
        },
        authOptions,
      ),
    );
  } catch (error) {
    const sample = JSON.stringify(elements).slice(0, 600);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${operationName} failed for block=${textBlockId} align=${align ?? 'default'} sample=${sample}: ${message}`,
    );
  }
  assertSuccessEnvelope(response, operationName);
}

export async function uploadBinaryToNode(
  client: lark.Client,
  parentType: 'docx_image' | 'docx_file',
  parentNode: string,
  filePath: string,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<string> {
  const absolutePath = path.resolve(filePath);
  try {
    await access(absolutePath);
  } catch {
    throw new Error(`Asset file does not exist: ${absolutePath}`);
  }

  const fileBuffer = await readFile(absolutePath);
  const fileName = path.basename(absolutePath);

  await limiter.wait();
  const response = await withRetry('drive.media.uploadAll', async () =>
    client.drive.media.uploadAll(
      {
        data: {
          file_name: fileName,
          parent_type: parentType,
          parent_node: parentNode,
          size: fileBuffer.byteLength,
          file: fileBuffer,
        },
      },
      authOptions,
    ),
  );

  if (!response || typeof response !== 'object') {
    throw new Error(`drive.media.uploadAll returned empty response for "${absolutePath}"`);
  }
  const row = response as Record<string, unknown>;
  const fileToken = getString(row, 'file_token');
  if (!fileToken) {
    throw new Error(`drive.media.uploadAll returned empty file_token for "${absolutePath}"`);
  }
  return fileToken;
}

export function isRelationMismatchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /1770013|relation mismatch/i.test(error.message);
}

export async function replaceImageBlock(
  client: lark.Client,
  documentId: string,
  blockId: string,
  imageToken: string,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<void> {
  await limiter.wait();
  const response = await withRetry('docx.documentBlock.batchUpdate(replace_image)', async () =>
    client.docx.documentBlock.batchUpdate(
      {
        path: {
          document_id: documentId,
        },
        data: {
          requests: [
            {
              block_id: blockId,
              replace_image: {
                token: imageToken,
              },
            },
          ],
        },
      },
      authOptions,
    ),
  );
  assertSuccessEnvelope(response, 'docx.documentBlock.batchUpdate(replace_image)');
}

export async function replaceFileBlock(
  client: lark.Client,
  documentId: string,
  blockId: string,
  fileToken: string,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<void> {
  await limiter.wait();
  const response = await withRetry('docx.documentBlock.batchUpdate(replace_file)', async () =>
    client.docx.documentBlock.batchUpdate(
      {
        path: {
          document_id: documentId,
        },
        data: {
          requests: [
            {
              block_id: blockId,
              replace_file: {
                token: fileToken,
              },
            },
          ],
        },
      },
      authOptions,
    ),
  );
  assertSuccessEnvelope(response, 'docx.documentBlock.batchUpdate(replace_file)');
}

export async function createBoardPlantumlNode(
  client: lark.Client,
  whiteboardId: string,
  plantUmlCode: string,
  options: CreateBoardPlantumlOptions | undefined,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<void> {
  const trimmedWhiteboardId = whiteboardId.trim();
  if (!trimmedWhiteboardId) {
    throw new Error('createBoardPlantumlNode requires non-empty whiteboard id.');
  }

  const data: Record<string, unknown> = {
    plant_uml_code: plantUmlCode,
  };
  const syntaxType = toNonNegativeInt(options?.syntaxType);
  const styleType = toNonNegativeInt(options?.styleType);
  const diagramType = toNonNegativeInt(options?.diagramType);
  if (syntaxType !== undefined) {
    data.syntax_type = syntaxType;
  }
  if (styleType !== undefined) {
    data.style_type = styleType;
  }
  if (diagramType !== undefined) {
    data.diagram_type = diagramType;
  }

  await limiter.wait();
  const response = await withRetry('board.v1.whiteboardNode.createPlantuml', async () =>
    client.board.v1.whiteboardNode.createPlantuml(
      {
        path: {
          whiteboard_id: trimmedWhiteboardId,
        },
        data: data as any,
      },
      authOptions,
    ),
  );
  assertSuccessEnvelope(response, 'board.v1.whiteboardNode.createPlantuml');
}

export async function getRawDocumentBlockById(
  client: lark.Client,
  documentId: string,
  blockId: string,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<Record<string, unknown> | null> {
  await limiter.wait();
  const response = await withRetry('docx.documentBlock.get', async () =>
    client.docx.documentBlock.get(
      {
        path: {
          document_id: documentId,
          block_id: blockId,
        },
      },
      authOptions,
    ),
  );
  assertSuccessEnvelope(response, 'docx.documentBlock.get');
  const data = getResponseData(response);
  return toObjectRecord(data.block);
}

export async function getDocumentBlockById(
  client: lark.Client,
  documentId: string,
  blockId: string,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<DocxBlockEntry | null> {
  const rawBlock = await getRawDocumentBlockById(client, documentId, blockId, authOptions, limiter);
  return toDocxBlock(rawBlock);
}
