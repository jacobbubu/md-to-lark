import type { BTTNode } from '../../btt/types.js';

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

export interface RenderBatchEntry {
  node: BTTNode;
  createPayload: Record<string, unknown>;
  sourceBlockId: string;
}

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

export function toObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value);
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

export function canUseElementsOnlyPatch(rawBlock: Record<string, unknown>): boolean {
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
    if (key === 'align' && (value === 1 || value === 2 || value === 3 || value === 'left' || value === 'center' || value === 'right')) {
      continue;
    }
    return false;
  }
  return true;
}

export function extractTextAlignForPatchFromRawBlock(rawBlock: Record<string, unknown>): number | undefined {
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

export function buildCreatePayloadFromRawBlock(rawBlock: Record<string, unknown>): Record<string, unknown> | null {
  const blockType = typeof rawBlock.block_type === 'number' ? rawBlock.block_type : Number.NaN;
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

export function getExpectedTableCellCount(tableNode: BTTNode): number {
  const raw = toObjectRecord(tableNode.rawBlock);
  const table = toObjectRecord(raw?.table);
  const property = toObjectRecord(table?.property);
  const rowSize = Math.max(1, toPositiveInt(property?.row_size) ?? 0);
  const columnSize = Math.max(1, toPositiveInt(property?.column_size) ?? 0);
  const expectedByProperty = rowSize > 0 && columnSize > 0 ? rowSize * columnSize : 0;
  const expectedByChildren = tableNode.children.filter((item) => item.blockType === 32).length;
  return Math.max(expectedByProperty, expectedByChildren);
}

export function extractTextElementsForPatchFromRawBlock(rawBlock: Record<string, unknown>): unknown[] | null {
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

export function getSourceBlockId(node: BTTNode, rawBlockRecord: Record<string, unknown> | null): string {
  return typeof rawBlockRecord?.block_id === 'string' && rawBlockRecord.block_id.trim().length > 0
    ? rawBlockRecord.block_id
    : node.blockId;
}

function isBatchSafeBlockType(blockType: number): boolean {
  if (blockType === 1 || blockType === 23 || blockType === 27 || blockType === 31 || blockType === 32 || blockType === 43) {
    return false;
  }
  return true;
}

export function createRenderBatchEntry(node: BTTNode): RenderBatchEntry | null {
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
