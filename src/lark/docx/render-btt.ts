import * as lark from '@larksuiteoapi/node-sdk';
import { RateLimiter } from '../../shared/rate-limiter.js';
import {
  clearBlockChildrenByKnownCount,
  createBoardPlantumlNode,
  createDocumentChildren,
  getDocumentBlockById,
  getRawDocumentBlockById,
  isRelationMismatchError,
  listAllDocumentBlocks,
  patchTextBlockElements,
  replaceFileBlock,
  replaceImageBlock,
  resolveCreatedTableCellIds,
  uploadBinaryToNode,
  type DocxBlockEntry,
  type LarkRequestOptions,
} from './ops.js';
import type { BTTNode } from '../../btt/types.js';
import {
  DEFAULT_MERMAID_RENDER_CONFIG,
  type MermaidPatch,
  type MermaidRenderConfig,
} from './render-types.js';

type TextualBlockTypeCode = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 17;
type TextualPayloadKey =
  | 'text'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'heading7'
  | 'heading8'
  | 'heading9'
  | 'bullet'
  | 'ordered'
  | 'code'
  | 'quote'
  | 'todo';

export interface RenderMediaTokenMapping {
  kind: 'image' | 'file';
  sourceBlockId: string;
  createdBlockId: string;
  localPath: string;
  token: string;
}

export interface RenderFailedNode {
  sourceBlockId: string;
  blockType: number;
  parentBlockId: string;
  error: string;
}

export interface RenderBTTReport {
  createdBlockCount: number;
  mediaTokenMappings: RenderMediaTokenMapping[];
  failedNodes: RenderFailedNode[];
}

interface RenderBatchEntry {
  node: BTTNode;
  createPayload: Record<string, unknown>;
  sourceBlockId: string;
}

const RENDER_LEAF_BATCH_SIZE = 50;

const TEXTUAL_BLOCK_PAYLOAD_KEY_BY_TYPE = {
  2: 'text',
  3: 'heading1',
  4: 'heading2',
  5: 'heading3',
  6: 'heading4',
  7: 'heading5',
  8: 'heading6',
  9: 'heading7',
  10: 'heading8',
  11: 'heading9',
  12: 'bullet',
  13: 'ordered',
  14: 'code',
  15: 'quote',
  17: 'todo',
} as const satisfies Readonly<Record<TextualBlockTypeCode, TextualPayloadKey>>;

function getTextualPayloadKey(blockType: number): TextualPayloadKey | undefined {
  if (!Object.prototype.hasOwnProperty.call(TEXTUAL_BLOCK_PAYLOAD_KEY_BY_TYPE, blockType)) {
    return undefined;
  }
  return TEXTUAL_BLOCK_PAYLOAD_KEY_BY_TYPE[blockType as TextualBlockTypeCode];
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value);
}

function extractWhiteboardId(rawBlock: Record<string, unknown> | null): string {
  const board = toObjectRecord(rawBlock?.board);
  if (!board) return '';
  const candidates = [board.token, board.whiteboard_id, board.board_token, board.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return '';
}

function isAllowedLinkUrl(value: string): boolean {
  return /^(https?:\/\/|mailto:|tel:)/i.test(value.trim());
}

function sanitizeTextElementStyle(style: Record<string, unknown>): void {
  for (const key of Object.keys(style)) {
    const value = style[key];
    if (value === false || value === null || value === undefined) {
      delete style[key];
    }
  }

  const link = toObjectRecord(style.link);
  if (link) {
    const url = typeof link.url === 'string' ? link.url.trim() : '';
    if (!isAllowedLinkUrl(url)) {
      delete style.link;
    } else {
      link.url = url;
      style.link = link;
    }
  }
}

function sanitizeTextElementsForCreate(elementsRaw: unknown): void {
  if (!Array.isArray(elementsRaw)) return;
  for (const element of elementsRaw) {
    if (!element || typeof element !== 'object') continue;
    const record = element as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const inline = toObjectRecord(record[key]);
      if (!inline) continue;
      const style = toObjectRecord(inline.text_element_style);
      if (!style) continue;
      sanitizeTextElementStyle(style);
      if (Object.keys(style).length === 0) {
        delete inline.text_element_style;
      }
    }
  }
}

function sanitizeTextualStyleForCreate(blockType: number, payload: Record<string, unknown>): void {
  const payloadKey = getTextualPayloadKey(blockType);
  if (!payloadKey) return;

  const textPayload = toObjectRecord(payload[payloadKey]);
  if (!textPayload) return;

  sanitizeTextElementsForCreate(textPayload.elements);
  const style = toObjectRecord(textPayload.style);
  if (!style) return;

  if (blockType === 14) {
    const language = typeof style.language === 'number' ? style.language : undefined;
    textPayload.style = language === undefined ? {} : { language };
  } else if (blockType === 17) {
    textPayload.style = Object.prototype.hasOwnProperty.call(style, 'done') ? { done: Boolean(style.done) } : {};
  } else if (blockType >= 3 && blockType <= 11) {
    textPayload.style = typeof style.sequence === 'string' ? { sequence: style.sequence } : {};
  } else if (blockType === 2) {
    const align = typeof style.align === 'number' ? style.align : undefined;
    textPayload.style = align === undefined ? {} : { align };
  } else {
    delete textPayload.style;
  }

  if (toObjectRecord(textPayload.style) && Object.keys(textPayload.style as Record<string, unknown>).length === 0) {
    delete textPayload.style;
  }
}

function canUseElementsOnlyPatch(rawBlock: Record<string, unknown>): boolean {
  const blockType = typeof rawBlock.block_type === 'number' ? rawBlock.block_type : Number.NaN;
  if (!Number.isFinite(blockType)) return true;
  const payloadKey = getTextualPayloadKey(blockType);
  if (!payloadKey) return true;
  const textPayload = toObjectRecord(rawBlock[payloadKey]);
  if (!textPayload) return true;
  const style = toObjectRecord(textPayload.style);
  if (!style) return true;

  const effectiveEntries = Object.entries(style).filter(([, value]) => value !== undefined && value !== null);
  if (effectiveEntries.length === 0) return true;

  for (const [key, value] of effectiveEntries) {
    // Patch path can apply text elements + align. Other style fields still fallback to recreate.
    if (key === 'align' && (value === 1 || value === 2 || value === 3 || value === 'left' || value === 'center' || value === 'right')) {
      continue;
    }
    return false;
  }
  return true;
}

function extractTextAlignForPatchFromRawBlock(rawBlock: Record<string, unknown>): number | undefined {
  const blockType = typeof rawBlock.block_type === 'number' ? rawBlock.block_type : Number.NaN;
  if (!Number.isFinite(blockType)) return undefined;
  const payloadKey = getTextualPayloadKey(blockType);
  if (!payloadKey) return undefined;
  const textPayload = toObjectRecord(rawBlock[payloadKey]);
  if (!textPayload) return undefined;
  const style = toObjectRecord(textPayload.style);
  if (!style || !Object.prototype.hasOwnProperty.call(style, 'align')) return undefined;
  const rawAlign = style.align;
  if (rawAlign === 1 || rawAlign === 2 || rawAlign === 3) return rawAlign;
  if (rawAlign === 'left') return 1;
  if (rawAlign === 'center') return 2;
  if (rawAlign === 'right') return 3;
  return undefined;
}

function sanitizeImagePayload(payload: Record<string, unknown>, key: 'image' | 'board'): void {
  const imageLike = toObjectRecord(payload[key]);
  if (!imageLike) return;

  if (typeof imageLike.token === 'string' && imageLike.token.trim().length === 0) {
    delete imageLike.token;
  }
  if (typeof imageLike.width === 'number' && imageLike.width <= 0) {
    delete imageLike.width;
  }
  if (typeof imageLike.height === 'number' && imageLike.height <= 0) {
    delete imageLike.height;
  }
}

function sanitizeTablePayloadForCreate(payload: Record<string, unknown>): void {
  const table = toObjectRecord(payload.table);
  if (!table) return;

  const property = toObjectRecord(table.property);
  if (!property) return;

  const rowSize = toPositiveInt(property.row_size);
  const columnSize = toPositiveInt(property.column_size);
  if (rowSize !== undefined) {
    property.row_size = rowSize;
  }
  if (columnSize !== undefined) {
    property.column_size = columnSize;
  }

  if (Array.isArray(property.merge_info) && property.merge_info.length === 0) {
    delete property.merge_info;
  }

  if (Array.isArray(property.column_width)) {
    const normalized = property.column_width
      .filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item > 0)
      .map((item) => Math.round(item));
    const truncated = columnSize !== undefined ? normalized.slice(0, columnSize) : normalized;
    if (truncated.length === 0) {
      delete property.column_width;
    } else {
      property.column_width = truncated;
    }
  }

  if (property.header_row === false) {
    delete property.header_row;
  }
  if (property.header_column === false) {
    delete property.header_column;
  }
}

function ensureTextElementsPayload(blockType: number, payload: Record<string, unknown>): void {
  const payloadKey = getTextualPayloadKey(blockType);
  if (!payloadKey) return;

  const textPayload = toObjectRecord(payload[payloadKey]);
  if (!textPayload) {
    payload[payloadKey] = {
      elements: [{ text_run: { content: ' ' } }],
    };
    return;
  }

  const elements = Array.isArray(textPayload.elements) ? textPayload.elements : [];
  if (elements.length === 0) {
    textPayload.elements = [{ text_run: { content: ' ' } }];
  }
}

function buildCreatePayloadFromRawBlock(rawBlock: Record<string, unknown>): Record<string, unknown> | null {
  const blockType = typeof rawBlock.block_type === 'number' ? rawBlock.block_type : NaN;
  if (!Number.isFinite(blockType)) {
    throw new Error(`Invalid raw block_type: ${String(rawBlock.block_type)}`);
  }
  if (blockType === 1) {
    return null;
  }

  const payload: Record<string, unknown> = {
    block_type: blockType,
  };

  for (const [key, value] of Object.entries(rawBlock)) {
    if (key === 'block_id' || key === 'parent_id' || key === 'children' || key === 'block_type') {
      continue;
    }
    payload[key] = deepClone(value);
  }

  if (blockType === 31) {
    const table = toObjectRecord(payload.table);
    if (table) {
      delete table.cells;
    }
    sanitizeTablePayloadForCreate(payload);
  }

  if (blockType === 27) {
    const image = toObjectRecord(payload.image);
    if (image) {
      delete image.local_path;
    }
  }

  if (blockType === 23) {
    const file = toObjectRecord(payload.file);
    if (file) {
      delete file.local_path;
      delete file.media_kind;
      delete file.token;
      delete file.file_token;
      delete file.name;

      const viewType = toPositiveInt(file.view_type);
      if (viewType === undefined) {
        delete file.view_type;
      } else {
        file.view_type = viewType;
      }
    }
  }

  sanitizeTextualStyleForCreate(blockType, payload);
  if (blockType === 27) sanitizeImagePayload(payload, 'image');
  if (blockType === 43) sanitizeImagePayload(payload, 'board');

  ensureTextElementsPayload(blockType, payload);
  return payload;
}

function getExpectedTableCellCount(tableNode: BTTNode): number {
  const raw = toObjectRecord(tableNode.rawBlock);
  const table = toObjectRecord(raw?.table);
  const property = toObjectRecord(table?.property);
  const rowSize = Math.max(1, toPositiveInt(property?.row_size) ?? 0);
  const columnSize = Math.max(1, toPositiveInt(property?.column_size) ?? 0);
  const expectedByProperty = rowSize > 0 && columnSize > 0 ? rowSize * columnSize : 0;
  const expectedByChildren = tableNode.children.filter((item) => item.blockType === 32).length;
  return Math.max(expectedByProperty, expectedByChildren);
}

function isNoChildrenDeleteError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /1770001|invalid param|start_index|end_index|out of range|no child/i.test(error.message);
}

async function deleteFirstChildIfPresent(
  client: lark.Client,
  documentId: string,
  blockId: string,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<void> {
  try {
    await clearBlockChildrenByKnownCount(client, documentId, blockId, 1, authOptions, limiter);
  } catch (error) {
    if (isNoChildrenDeleteError(error)) {
      return;
    }
    throw error;
  }
}

function extractTextElementsForPatchFromRawBlock(rawBlock: Record<string, unknown>): unknown[] | null {
  const blockType = typeof rawBlock.block_type === 'number' ? rawBlock.block_type : Number.NaN;
  if (!Number.isFinite(blockType)) return null;
  const payloadKey = getTextualPayloadKey(blockType);
  if (!payloadKey) return null;
  const textPayload = toObjectRecord(rawBlock[payloadKey]);
  if (!textPayload) return null;
  const rawElements = Array.isArray(textPayload.elements) ? deepClone(textPayload.elements) : [];
  sanitizeTextElementsForCreate(rawElements);
  if (rawElements.length > 0) {
    return rawElements;
  }
  return [{ text_run: { content: ' ' } }];
}

function getSourceBlockId(node: BTTNode, rawBlockRecord: Record<string, unknown> | null): string {
  return typeof rawBlockRecord?.block_id === 'string' && rawBlockRecord.block_id.trim().length > 0
    ? rawBlockRecord.block_id
    : node.blockId;
}

function isBatchSafeBlockType(blockType: number): boolean {
  // These block types need post-create mutation or cell/table special handling.
  if (blockType === 1 || blockType === 23 || blockType === 27 || blockType === 31 || blockType === 32 || blockType === 43) {
    return false;
  }
  return true;
}

function createRenderBatchEntry(node: BTTNode): RenderBatchEntry | null {
  if (!isBatchSafeBlockType(node.blockType)) return null;
  const rawBlockRecord = toObjectRecord(node.rawBlock);
  if (!rawBlockRecord) return null;
  let createPayload: Record<string, unknown> | null = null;
  try {
    createPayload = buildCreatePayloadFromRawBlock(rawBlockRecord);
  } catch {
    return null;
  }
  if (!createPayload) return null;
  return {
    node,
    createPayload,
    sourceBlockId: getSourceBlockId(node, rawBlockRecord),
  };
}

async function renderBTTNodesToDocument(
  client: lark.Client,
  documentId: string,
  parentBlockId: string,
  nodes: BTTNode[],
  authOptions: LarkRequestOptions,
  docxLimiter: RateLimiter,
  mediaLimiter: RateLimiter,
  mermaidByBlockId: ReadonlyMap<string, MermaidPatch>,
  mermaidRenderConfig: MermaidRenderConfig,
  report: RenderBTTReport,
  continueOnError: boolean,
): Promise<void> {
  const batch: RenderBatchEntry[] = [];

  const flushBatch = async (): Promise<void> => {
    if (batch.length === 0) return;
    const entries = [...batch];
    batch.length = 0;

    let created: DocxBlockEntry[] = [];
    try {
      created = await createDocumentChildren(
        client,
        documentId,
        parentBlockId,
        entries.map((entry) => entry.createPayload),
        authOptions,
        docxLimiter,
      );
    } catch (error) {
      if (!continueOnError) {
        throw error;
      }
      for (const entry of entries) {
        await renderBTTNodeToDocument(
          client,
          documentId,
          parentBlockId,
          entry.node,
          authOptions,
          docxLimiter,
          mediaLimiter,
          mermaidByBlockId,
          mermaidRenderConfig,
          report,
          continueOnError,
        );
      }
      return;
    }

    if (created.length !== entries.length) {
      const errorText = `Batch create count mismatch under parent=${parentBlockId}: expected=${entries.length} actual=${created.length}`;
      if (!continueOnError) {
        throw new Error(errorText);
      }
      for (const entry of entries) {
        report.failedNodes.push({
          sourceBlockId: entry.sourceBlockId,
          blockType: entry.node.blockType,
          parentBlockId,
          error: errorText,
        });
      }
      return;
    }

    report.createdBlockCount += created.length;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const createdBlock = created[index];
      if (!entry || !createdBlock) continue;
      const createdBlockId = createdBlock.block_id;
      if (!createdBlockId) continue;
      if (entry.node.children.length === 0) continue;
      await renderBTTNodesToDocument(
        client,
        documentId,
        createdBlockId,
        entry.node.children,
        authOptions,
        docxLimiter,
        mediaLimiter,
        mermaidByBlockId,
        mermaidRenderConfig,
        report,
        continueOnError,
      );
    }
  };

  for (const node of nodes) {
    const entry = createRenderBatchEntry(node);
    if (entry) {
      batch.push(entry);
      if (batch.length >= RENDER_LEAF_BATCH_SIZE) {
        await flushBatch();
      }
      continue;
    }

    await flushBatch();
    await renderBTTNodeToDocument(
      client,
      documentId,
      parentBlockId,
      node,
      authOptions,
      docxLimiter,
      mediaLimiter,
      mermaidByBlockId,
      mermaidRenderConfig,
      report,
      continueOnError,
    );
  }

  await flushBatch();
}

async function renderBTTNodeToDocument(
  client: lark.Client,
  documentId: string,
  parentBlockId: string,
  node: BTTNode,
  authOptions: LarkRequestOptions,
  docxLimiter: RateLimiter,
  mediaLimiter: RateLimiter,
  mermaidByBlockId: ReadonlyMap<string, MermaidPatch>,
  mermaidRenderConfig: MermaidRenderConfig,
  report: RenderBTTReport,
  continueOnError: boolean,
): Promise<void> {
  const rawBlockRecord = toObjectRecord(node.rawBlock);
  if (!rawBlockRecord) return;
  const sourceBlockId = getSourceBlockId(node, rawBlockRecord);

  try {
    const createPayload = buildCreatePayloadFromRawBlock(rawBlockRecord);
    if (!createPayload) {
      await renderBTTNodesToDocument(
        client,
        documentId,
        parentBlockId,
        node.children,
        authOptions,
        docxLimiter,
        mediaLimiter,
        mermaidByBlockId,
        mermaidRenderConfig,
        report,
        continueOnError,
      );
      return;
    }

    let createdBlocks: DocxBlockEntry[];
    try {
      createdBlocks = await createDocumentChildren(
        client,
        documentId,
        parentBlockId,
        [createPayload],
        authOptions,
        docxLimiter,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to render BTT node source=${String(rawBlockRecord.block_id ?? node.blockId)} type=${String(
          createPayload.block_type,
        )}: ${message}`,
      );
    }

    report.createdBlockCount += createdBlocks.length;

    const createdBlock = createdBlocks[0];
    const createdBlockId = createdBlock?.block_id;
    if (!createdBlockId) {
      throw new Error(`Failed to create block for source "${String(rawBlockRecord.block_id ?? node.blockId)}".`);
    }

    const mermaidPatch =
      mermaidRenderConfig.target === 'board'
        ? (mermaidByBlockId.get(node.blockId) ?? mermaidByBlockId.get(sourceBlockId))
        : undefined;
    if (node.blockType === 43 && mermaidPatch) {
      const createdRawBlock = await getRawDocumentBlockById(
        client,
        documentId,
        createdBlockId,
        authOptions,
        docxLimiter,
      );
      const whiteboardId = extractWhiteboardId(createdRawBlock);
      if (!whiteboardId) {
        throw new Error(`Unable to resolve whiteboard id from created board block "${createdBlockId}".`);
      }
      await createBoardPlantumlNode(
        client,
        whiteboardId,
        mermaidPatch.code,
        mermaidRenderConfig.board,
        authOptions,
        docxLimiter,
      );
    }

    if (node.blockType === 27) {
      const image = toObjectRecord(rawBlockRecord.image);
      const localPath = image && typeof image.local_path === 'string' ? image.local_path : '';
      if (localPath) {
        let imageToken = await uploadBinaryToNode(
          client,
          'docx_image',
          createdBlockId,
          localPath,
          authOptions,
          mediaLimiter,
        );
        try {
          await replaceImageBlock(client, documentId, createdBlockId, imageToken, authOptions, docxLimiter);
        } catch (error) {
          if (!isRelationMismatchError(error)) {
            throw error;
          }
          imageToken = await uploadBinaryToNode(
            client,
            'docx_image',
            createdBlockId,
            localPath,
            authOptions,
            mediaLimiter,
          );
          await replaceImageBlock(client, documentId, createdBlockId, imageToken, authOptions, docxLimiter);
        }
        report.mediaTokenMappings.push({
          kind: 'image',
          sourceBlockId,
          createdBlockId,
          localPath,
          token: imageToken,
        });
      }
    }

    if (node.blockType === 23) {
      const file = toObjectRecord(rawBlockRecord.file);
      const localPath = file && typeof file.local_path === 'string' ? file.local_path : '';
      const existingToken =
        file && typeof file.file_token === 'string' && file.file_token.trim().length > 0
          ? file.file_token.trim()
          : file && typeof file.token === 'string' && file.token.trim().length > 0
            ? file.token.trim()
            : '';
      let fileTargetBlockId =
        Array.isArray(createdBlock?.children) &&
        typeof createdBlock.children[0] === 'string' &&
        createdBlock.children[0].trim()
          ? createdBlock.children[0].trim()
          : '';
      if (!fileTargetBlockId) {
        const fetchedCreatedBlock = await getDocumentBlockById(
          client,
          documentId,
          createdBlockId,
          authOptions,
          docxLimiter,
        );
        fileTargetBlockId =
          fetchedCreatedBlock &&
          Array.isArray(fetchedCreatedBlock.children) &&
          typeof fetchedCreatedBlock.children[0] === 'string' &&
          fetchedCreatedBlock.children[0].trim()
            ? fetchedCreatedBlock.children[0].trim()
            : createdBlockId;
      }

      if (localPath) {
        let fileToken = await uploadBinaryToNode(
          client,
          'docx_file',
          fileTargetBlockId,
          localPath,
          authOptions,
          mediaLimiter,
        );
        try {
          await replaceFileBlock(client, documentId, fileTargetBlockId, fileToken, authOptions, docxLimiter);
        } catch (error) {
          if (!isRelationMismatchError(error)) {
            throw error;
          }
          fileToken = await uploadBinaryToNode(
            client,
            'docx_file',
            fileTargetBlockId,
            localPath,
            authOptions,
            mediaLimiter,
          );
          await replaceFileBlock(client, documentId, fileTargetBlockId, fileToken, authOptions, docxLimiter);
        }
        report.mediaTokenMappings.push({
          kind: 'file',
          sourceBlockId,
          createdBlockId: fileTargetBlockId,
          localPath,
          token: fileToken,
        });
      } else if (existingToken) {
        await replaceFileBlock(client, documentId, fileTargetBlockId, existingToken, authOptions, docxLimiter);
      }
    }

    if (node.blockType !== 31) {
      await renderBTTNodesToDocument(
        client,
        documentId,
        createdBlockId,
        node.children,
        authOptions,
        docxLimiter,
        mediaLimiter,
        mermaidByBlockId,
        mermaidRenderConfig,
        report,
        continueOnError,
      );
      return;
    }

    const sourceCellNodes = node.children.filter((item) => item.blockType === 32);
    const nonCellNodes = node.children.filter((item) => item.blockType !== 32);
    const expectedCellCount = getExpectedTableCellCount(node);
    const resolvedCellIds = await resolveCreatedTableCellIds(
      client,
      documentId,
      createdBlockId,
      createdBlock,
      Math.max(expectedCellCount, sourceCellNodes.length),
      authOptions,
      docxLimiter,
    );
    const blockById = new Map<string, DocxBlockEntry>(createdBlocks.map((entry) => [entry.block_id, entry] as const));
    let listHydrated = false;
    const ensureBlockMapFromList = async (): Promise<void> => {
      if (listHydrated) return;
      const listed = await listAllDocumentBlocks(client, documentId, authOptions, docxLimiter);
      for (const entry of listed) {
        blockById.set(entry.block_id, entry);
      }
      listHydrated = true;
    };

    for (let i = 0; i < sourceCellNodes.length; i += 1) {
      const sourceCellNode = sourceCellNodes[i];
      const createdCellId = resolvedCellIds[i];
      if (!sourceCellNode || !createdCellId) continue;

      let consumedByPatch = false;
      if (sourceCellNode.children.length === 1) {
        const onlySourceChild = sourceCellNode.children[0];
        const sourceRaw = toObjectRecord(onlySourceChild?.rawBlock);
        if (sourceRaw && canUseElementsOnlyPatch(sourceRaw)) {
          const elements = extractTextElementsForPatchFromRawBlock(sourceRaw);
          if (elements) {
            let textBlockId =
              Array.isArray(blockById.get(createdCellId)?.children) && blockById.get(createdCellId)?.children?.[0]
                ? (blockById.get(createdCellId)?.children?.[0] ?? '')
                : '';
            if (!textBlockId) {
              await ensureBlockMapFromList();
              textBlockId =
                Array.isArray(blockById.get(createdCellId)?.children) && blockById.get(createdCellId)?.children?.[0]
                  ? (blockById.get(createdCellId)?.children?.[0] ?? '')
                  : '';
            }
            if (!textBlockId) {
              const fetchedCell = await getDocumentBlockById(
                client,
                documentId,
                createdCellId,
                authOptions,
                docxLimiter,
              );
              if (fetchedCell) {
                blockById.set(createdCellId, fetchedCell);
              }
              textBlockId =
                fetchedCell && Array.isArray(fetchedCell.children) && fetchedCell.children[0]
                  ? fetchedCell.children[0]
                  : '';
            }
            if (textBlockId) {
              const align = extractTextAlignForPatchFromRawBlock(sourceRaw);
              await patchTextBlockElements(client, documentId, textBlockId, elements, authOptions, docxLimiter, align);
              consumedByPatch = true;
            }
          }
        }
      }
      if (consumedByPatch) {
        continue;
      }

      if (sourceCellNode.children.length > 0) {
        await deleteFirstChildIfPresent(client, documentId, createdCellId, authOptions, docxLimiter);
      }
      await renderBTTNodesToDocument(
        client,
        documentId,
        createdCellId,
        sourceCellNode.children,
        authOptions,
        docxLimiter,
        mediaLimiter,
        mermaidByBlockId,
        mermaidRenderConfig,
        report,
        continueOnError,
      );
    }

    await renderBTTNodesToDocument(
      client,
      documentId,
      createdBlockId,
      nonCellNodes,
      authOptions,
      docxLimiter,
      mediaLimiter,
      mermaidByBlockId,
      mermaidRenderConfig,
      report,
      continueOnError,
    );
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    report.failedNodes.push({
      sourceBlockId,
      blockType: node.blockType,
      parentBlockId,
      error: errorText,
    });
    if (continueOnError) {
      return;
    }
    throw error;
  }
}

export async function renderBTTToDocument(
  client: lark.Client,
  documentId: string,
  parentBlockId: string,
  rootNode: BTTNode,
  authOptions: LarkRequestOptions,
  docxLimiter: RateLimiter,
  mediaLimiter: RateLimiter,
  options?: {
    continueOnError?: boolean;
    mermaidByBlockId?: ReadonlyMap<string, MermaidPatch>;
    mermaidRender?: MermaidRenderConfig;
  },
): Promise<RenderBTTReport> {
  const report: RenderBTTReport = {
    createdBlockCount: 0,
    mediaTokenMappings: [],
    failedNodes: [],
  };
  const continueOnError = Boolean(options?.continueOnError);
  const mermaidByBlockId = options?.mermaidByBlockId ?? new Map<string, MermaidPatch>();
  const mermaidRenderConfig = options?.mermaidRender ?? DEFAULT_MERMAID_RENDER_CONFIG;
  const initialNodes = rootNode.blockType === 1 ? rootNode.children : [rootNode];
  await renderBTTNodesToDocument(
    client,
    documentId,
    parentBlockId,
    initialNodes,
    authOptions,
    docxLimiter,
    mediaLimiter,
    mermaidByBlockId,
    mermaidRenderConfig,
    report,
    continueOnError,
  );
  return report;
}
