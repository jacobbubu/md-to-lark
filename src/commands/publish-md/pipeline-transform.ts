import { existsSync } from 'node:fs';
import path from 'node:path';
import { getLarkBlockTypeName } from '../../lark/index.js';
import { DEFAULT_MERMAID_RENDER_CONFIG, type MermaidPatch, type MermaidRenderConfig } from '../../lark/docx/render-types.js';
import type { BTTDocument } from '../../btt/types.js';
import type {
  LASTBlockNode,
  LASTInlineMarks,
  LASTModel,
  LASTTextualBlock,
  LASTTextualBlockType,
} from '../../last/types.js';
import { LAST_TEXTUAL_BLOCK_TYPE_SET } from '../../last/textual-block-types.js';

export interface LocalAsset {
  kind: 'image' | 'file';
  absolutePath: string;
  fileName: string;
  mediaKind?: 'image' | 'video' | 'audio' | 'file';
}

const MERMAID_COMPONENT_TYPE_ID = 'blk_631fefbbae02400430b8f9f4';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg', '.oga', '.opus']);
const PREVIEWABLE_FILE_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
]);

const TABLE_DEFAULT_PAGE_WIDTH_PX = 1024;
const TABLE_FONT_SIZE_PX = 14;
const TABLE_CELL_HORIZONTAL_PADDING_PX = 24;
const TABLE_TEXT_COLUMN_MIN_WIDTH_PX = 96;
const TABLE_TEXT_COLUMN_MAX_WIDTH_PX = 360;
const TABLE_NUMERIC_COLUMN_MIN_WIDTH_PX = 72;
const TABLE_NUMERIC_COLUMN_MAX_WIDTH_PX = 240;
const INVALID_NUMERIC_TOKENS = new Set([
  'inf',
  '+inf',
  '-inf',
  'infinity',
  '+infinity',
  '-infinity',
  'na',
  'n/a',
  'nan',
  'null',
  'nil',
  '--',
  '-',
]);
const CURRENCY_PREFIX_RE = /^(?:[$€£¥₹]|cny|rmb|usd|eur|gbp|jpy|hkd|cad|aud)\s*/i;
const NUMBER_WITH_OPTIONAL_UNIT_RE =
  /^([+-]?(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d+)?|[+-]?\.\d+)(?:\s*(%|[a-zA-Z\u4e00-\u9fff]{1,12}))?$/;

function toObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function isTextualBlock(block: LASTBlockNode): block is LASTTextualBlock<LASTTextualBlockType> {
  return LAST_TEXTUAL_BLOCK_TYPE_SET.has(block.type as LASTTextualBlockType);
}

function stripQueryAndHash(url: string): string {
  return url.split('#', 1)[0]?.split('?', 1)[0] ?? url;
}

function safeDecodeURIComponent(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function getPathExtension(url: string): string {
  const clean = safeDecodeURIComponent(stripQueryAndHash(url));
  return path.extname(clean).toLowerCase();
}

function isHttpLike(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url);
}

function resolveLocalPathFromSource(sourceUrl: string, baseDir: string): string | null {
  const raw = sourceUrl.trim();
  if (!raw) return null;
  if (isHttpLike(raw)) {
    if (/^https?:/i.test(raw)) {
      return null;
    }
    return null;
  }

  const decoded = safeDecodeURIComponent(stripQueryAndHash(raw));
  const absolute = path.isAbsolute(decoded) ? decoded : path.resolve(baseDir, decoded);
  return absolute;
}

function inferMediaKind(extension: string): 'image' | 'video' | 'audio' | 'file' {
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  return 'file';
}

function shouldUsePreviewView(extension: string, mediaKind: 'image' | 'video' | 'audio' | 'file'): boolean {
  if (mediaKind === 'video' || mediaKind === 'audio') return true;
  return PREVIEWABLE_FILE_EXTENSIONS.has(extension);
}

function createDefaultMarks(): LASTInlineMarks {
  return {
    bold: false,
    italic: false,
    strikethrough: false,
    underline: false,
    inlineCode: false,
    textColor: null,
    backgroundColor: null,
    link: null,
  };
}

function extractTextFromInlines(inlines: LASTTextualBlock<LASTTextualBlockType>['payload']['inlines']): string {
  let out = '';
  for (const inline of inlines) {
    if (inline.kind === 'text_run') {
      out += inline.text ?? '';
      continue;
    }
    if (inline.kind === 'mention_user') {
      out += inline.userId ?? '';
      continue;
    }
    if (inline.kind === 'equation') {
      out += inline.latex ?? '';
      continue;
    }
    if (inline.kind === 'mention_doc') {
      out += inline.title ?? '';
      continue;
    }
    if (inline.kind === 'link_preview') {
      out += inline.title ?? inline.url ?? '';
    }
  }
  return out;
}

function firstInlineLinkUrl(block: LASTTextualBlock<LASTTextualBlockType>): string | null {
  if (block.payload.inlines.length === 0) return null;
  let resolvedUrl = '';
  for (const inline of block.payload.inlines) {
    if (inline.kind !== 'text_run') return null;
    const linkUrl = inline.marks.link?.url;
    if (typeof linkUrl !== 'string' || linkUrl.trim().length === 0) {
      return null;
    }
    const normalized = linkUrl.trim();
    if (!resolvedUrl) {
      resolvedUrl = normalized;
      continue;
    }
    if (resolvedUrl !== normalized) {
      return null;
    }
  }
  return resolvedUrl || null;
}

function isMermaidLanguage(language: unknown): boolean {
  if (typeof language !== 'string') return false;
  const normalized = language.trim().toLowerCase();
  if (normalized === 'mermaid') return true;
  if (normalized.startsWith('mermaid ')) return true;
  return normalized.split(/[,\s{}[\]()]+/).includes('mermaid');
}

function toPlainTextFromInlineList(inlines: LASTTextualBlock<LASTTextualBlockType>['payload']['inlines']): string {
  let out = '';
  for (const inline of inlines) {
    if (inline.kind === 'text_run') {
      out += inline.text ?? '';
    } else {
      out += extractTextFromInlines([inline] as LASTTextualBlock<LASTTextualBlockType>['payload']['inlines']);
    }
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function charWidthPx(ch: string): number {
  if (/\s/.test(ch)) return TABLE_FONT_SIZE_PX * 0.33;
  if (/[0-9]/.test(ch)) return TABLE_FONT_SIZE_PX * 0.56;
  if (/[A-Z]/.test(ch)) return TABLE_FONT_SIZE_PX * 0.62;
  if (/[a-z]/.test(ch)) return TABLE_FONT_SIZE_PX * 0.54;
  if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(ch)) return TABLE_FONT_SIZE_PX * 1.0;
  if (/[.,:;'"`|]/.test(ch)) return TABLE_FONT_SIZE_PX * 0.32;
  if (/[(){}\[\]<>]/.test(ch)) return TABLE_FONT_SIZE_PX * 0.4;
  if (/[!@#$%^&*+=?/\\~-]/.test(ch)) return TABLE_FONT_SIZE_PX * 0.48;
  return TABLE_FONT_SIZE_PX * 0.56;
}

function estimateLineWidthPx(line: string): number {
  let width = 0;
  for (const ch of Array.from(line)) {
    width += charWidthPx(ch);
  }
  return width;
}

function estimateCellTextWidthPx(text: string): number {
  if (text.trim().length === 0) return 0;
  const lines = text.split(/\r?\n/);
  const maxWidth = lines.reduce((acc, line) => Math.max(acc, estimateLineWidthPx(line)), 0);
  return Math.ceil(maxWidth + TABLE_CELL_HORIZONTAL_PADDING_PX);
}

function isEmptyLikeNumericValue(value: string): boolean {
  const compact = value.trim().toLowerCase().replace(/\s+/g, '');
  return compact.length === 0 || INVALID_NUMERIC_TOKENS.has(compact);
}

function isNumericLikeValue(value: string): boolean {
  let text = value.trim();
  if (text.length === 0) return false;
  if (isEmptyLikeNumericValue(text)) return false;

  text = text.replace(CURRENCY_PREFIX_RE, '');
  if (text.length === 0) return false;

  const matched = text.match(NUMBER_WITH_OPTIONAL_UNIT_RE);
  if (!matched) return false;

  const numberToken = matched[1];
  if (!numberToken) return false;
  const numberPart = numberToken.replace(/,/g, '');
  const parsed = Number(numberPart);
  return Number.isFinite(parsed);
}

function classifyCellValue(value: string): 'empty' | 'numeric' | 'text' {
  if (isEmptyLikeNumericValue(value)) return 'empty';
  return isNumericLikeValue(value) ? 'numeric' : 'text';
}

function isRightAlignedAlready(align: unknown): boolean {
  return align === 'right' || align === 3;
}

function normalizeDeclaredColumnAlign(
  raw: unknown,
  columnSize: number,
): Array<'left' | 'center' | 'right' | undefined> {
  if (!Array.isArray(raw) || columnSize <= 0) {
    return Array.from({ length: Math.max(0, columnSize) }, () => undefined);
  }
  const normalized: Array<'left' | 'center' | 'right' | undefined> = Array.from(
    { length: columnSize },
    () => undefined,
  );
  for (let col = 0; col < columnSize; col += 1) {
    const value = raw[col];
    if (value === 'left' || value === 'center' || value === 'right') {
      normalized[col] = value;
    } else if (value === 1) {
      normalized[col] = 'left';
    } else if (value === 2) {
      normalized[col] = 'center';
    } else if (value === 3) {
      normalized[col] = 'right';
    }
  }
  return normalized;
}

function allocateTableColumnWidths(
  rows: string[][],
  richCells: boolean[][],
  hasHeaderRow: boolean,
  pageWidthPx = TABLE_DEFAULT_PAGE_WIDTH_PX,
): number[] {
  if (rows.length === 0) return [];
  const columnCount = rows[0]?.length ?? 0;
  if (columnCount === 0) return [];

  const dataRowStart = hasHeaderRow ? 1 : 0;
  const preferred: number[] = [];
  const minWidths: number[] = [];

  for (let col = 0; col < columnCount; col += 1) {
    let numeric = true;
    for (let row = dataRowStart; row < rows.length; row += 1) {
      if (richCells[row]?.[col]) {
        numeric = false;
        break;
      }
    }
    for (let row = dataRowStart; row < rows.length; row += 1) {
      if (!numeric) break;
      const value = rows[row]?.[col] ?? '';
      if (classifyCellValue(value) === 'text') {
        numeric = false;
        break;
      }
    }

    const minWidth = numeric ? TABLE_NUMERIC_COLUMN_MIN_WIDTH_PX : TABLE_TEXT_COLUMN_MIN_WIDTH_PX;
    const maxWidth = numeric ? TABLE_NUMERIC_COLUMN_MAX_WIDTH_PX : TABLE_TEXT_COLUMN_MAX_WIDTH_PX;

    const widths: number[] = [];
    for (let row = 0; row < rows.length; row += 1) {
      widths.push(estimateCellTextWidthPx(rows[row]?.[col] ?? ''));
    }

    const sorted = [...widths].sort((a, b) => a - b);
    const p95Idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
    const p95 = sorted[p95Idx] ?? 0;
    const preferredWidth = clamp(p95 > 0 ? p95 : minWidth, minWidth, maxWidth);

    preferred.push(preferredWidth);
    minWidths.push(minWidth);
  }

  const preferredSum = preferred.reduce((sum, item) => sum + item, 0);
  if (preferredSum <= pageWidthPx) {
    return preferred.map((item) => Math.round(item));
  }

  const minSum = minWidths.reduce((sum, item) => sum + item, 0);
  if (minSum >= pageWidthPx) {
    const ratio = pageWidthPx / minSum;
    return minWidths.map((item) => Math.max(50, Math.round(item * ratio)));
  }

  const flex = preferred.map((item, idx) => Math.max(item - (minWidths[idx] ?? 0), 0));
  const flexSum = flex.reduce((sum, item) => sum + item, 0);
  const ratio = flexSum > 0 ? (pageWidthPx - minSum) / flexSum : 0;
  return preferred.map((item, idx) => Math.round((minWidths[idx] ?? 0) + (item - (minWidths[idx] ?? 0)) * ratio));
}

function applyNumericColumnRightAlignment(
  rows: string[][],
  textBlocks: Array<Array<LASTTextualBlock<LASTTextualBlockType> | null>>,
  richCells: boolean[][],
  hasHeaderRow: boolean,
): void {
  const rowCount = rows.length;
  if (rowCount === 0) return;
  const columnCount = rows[0]?.length ?? 0;
  if (columnCount === 0) return;

  const dataRowStart = hasHeaderRow ? 1 : 0;
  if (dataRowStart >= rowCount) return;

  for (let col = 0; col < columnCount; col += 1) {
    let numericColumn = true;
    for (let row = dataRowStart; row < rowCount; row += 1) {
      if (richCells[row]?.[col]) {
        numericColumn = false;
        break;
      }
      if (classifyCellValue(rows[row]?.[col] ?? '') === 'text') {
        numericColumn = false;
        break;
      }
    }
    if (!numericColumn) continue;

    for (let row = dataRowStart; row < rowCount; row += 1) {
      const textBlock = textBlocks[row]?.[col];
      if (!textBlock) continue;
      if (isRightAlignedAlready(textBlock.payload.style.align)) continue;
      textBlock.payload.style.align = 'right';
    }
  }
}

function applyDefaultHeaderCenterAlignment(
  textBlocks: Array<Array<LASTTextualBlock<LASTTextualBlockType> | null>>,
  hasHeaderRow: boolean,
): void {
  if (!hasHeaderRow) return;
  const headerRow = textBlocks[0];
  if (!headerRow || headerRow.length === 0) return;
  for (const textBlock of headerRow) {
    if (!textBlock) continue;
    textBlock.payload.style.align = 'center';
  }
}

function applyDeclaredColumnAlignment(
  textBlocks: Array<Array<LASTTextualBlock<LASTTextualBlockType> | null>>,
  columnAlign: Array<'left' | 'center' | 'right' | undefined>,
): void {
  if (columnAlign.length === 0) return;
  for (let row = 0; row < textBlocks.length; row += 1) {
    for (let col = 0; col < columnAlign.length; col += 1) {
      const align = columnAlign[col];
      if (align === undefined) continue;
      const textBlock = textBlocks[row]?.[col];
      if (!textBlock) continue;
      textBlock.payload.style.align = align;
    }
  }
}

function applyRawBlockPatch(
  rawBlock: Record<string, unknown>,
  blockId: string,
  mermaidByBlockId: ReadonlyMap<string, MermaidPatch>,
  assetByBlockId: ReadonlyMap<string, LocalAsset>,
  mermaidRenderConfig: MermaidRenderConfig,
): void {
  const mermaid = mermaidByBlockId.get(blockId);
  if (mermaid) {
    rawBlock.block_type = mermaidRenderConfig.target === 'board' ? 43 : 40;
    for (const key of Object.keys(rawBlock)) {
      if (key === 'block_id' || key === 'parent_id' || key === 'children' || key === 'block_type') continue;
      delete rawBlock[key];
    }
    if (mermaidRenderConfig.target === 'board') {
      rawBlock.board = {};
    } else {
      rawBlock.add_ons = {
        component_type_id: MERMAID_COMPONENT_TYPE_ID,
        record: JSON.stringify({
          data: mermaid.code,
          theme: 'default',
          view: 'chart',
        }),
      };
    }
  }

  const asset = assetByBlockId.get(blockId);
  if (!asset) return;

  if (asset.kind === 'image') {
    rawBlock.block_type = 27;
    const image = toObjectRecord(rawBlock.image) ?? {};
    image.local_path = asset.absolutePath;
    rawBlock.image = image;
    return;
  }

  rawBlock.block_type = 23;
  const file = toObjectRecord(rawBlock.file) ?? {};
  file.local_path = asset.absolutePath;
  file.name = typeof file.name === 'string' && file.name.trim().length > 0 ? file.name : asset.fileName;
  if (asset.mediaKind) {
    file.media_kind = asset.mediaKind;
  }
  if (typeof file.view_type !== 'number') {
    file.view_type = shouldUsePreviewView(path.extname(asset.fileName).toLowerCase(), asset.mediaKind ?? 'file')
      ? 2
      : 1;
  }
  rawBlock.file = file;
}

export function buildPipelineDocumentId(inputFile: string): string {
  const base = path.basename(inputFile, path.extname(inputFile));
  const safe = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe ? `md-${safe}` : 'md-doc';
}

export function ensureLastBlockBttIds(last: LASTModel): void {
  for (const block of Object.values(last.blocks)) {
    block.bttId = block.id;
  }
}

export function applyStandaloneAttachmentTransforms(last: LASTModel, baseDir: string): Map<string, LocalAsset> {
  const localAssetByBlockId = new Map<string, LocalAsset>();

  for (const block of Object.values(last.blocks)) {
    if (!isTextualBlock(block) || block.type !== 'text') {
      continue;
    }

    if (block.children.length > 0) {
      continue;
    }

    const linkUrl = firstInlineLinkUrl(block);
    if (!linkUrl) {
      continue;
    }

    const resolvedPath = resolveLocalPathFromSource(linkUrl, baseDir);
    if (!resolvedPath) {
      continue;
    }
    if (!existsSync(resolvedPath)) {
      continue;
    }

    const extension = getPathExtension(linkUrl);
    const mediaKind = inferMediaKind(extension);
    const displayName = extractTextFromInlines(block.payload.inlines).trim();
    const fileName = displayName.length > 0 ? displayName : path.basename(stripQueryAndHash(linkUrl));

    if (mediaKind === 'image') {
      const transformed: Extract<LASTBlockNode, { type: 'image' }> = {
        id: block.id,
        ...(block.bttId ? { bttId: block.bttId } : {}),
        type: 'image',
        parentId: block.parentId,
        children: [],
        payload: {
          width: 0,
          height: 0,
          token: '',
          align: 'left',
        },
        selector: {
          attrs: {
            sourceUrl: linkUrl,
          },
        },
      };
      last.blocks[block.id] = transformed;
      localAssetByBlockId.set(block.id, {
        kind: 'image',
        absolutePath: resolvedPath,
        fileName: path.basename(resolvedPath),
        mediaKind,
      });
      continue;
    }

    const transformed: Extract<LASTBlockNode, { type: 'file' }> = {
      id: block.id,
      ...(block.bttId ? { bttId: block.bttId } : {}),
      type: 'file',
      parentId: block.parentId,
      children: [],
      payload: {
        name: fileName,
        viewType: shouldUsePreviewView(extension, mediaKind) ? 2 : 1,
      },
      selector: {
        attrs: {
          sourceUrl: linkUrl,
        },
      },
    };
    last.blocks[block.id] = transformed;
    localAssetByBlockId.set(block.id, {
      kind: 'file',
      absolutePath: resolvedPath,
      fileName: path.basename(resolvedPath),
      mediaKind,
    });
  }

  for (const block of Object.values(last.blocks)) {
    if (block.type !== 'image') continue;
    const sourceUrl =
      block.selector && block.selector.attrs && typeof block.selector.attrs.sourceUrl === 'string'
        ? String(block.selector.attrs.sourceUrl)
        : '';
    if (!sourceUrl) continue;
    const resolvedPath = resolveLocalPathFromSource(sourceUrl, baseDir);
    if (!resolvedPath) continue;
    if (!existsSync(resolvedPath)) {
      last.blocks[block.id] = {
        id: block.id,
        ...(block.bttId ? { bttId: block.bttId } : {}),
        type: 'text',
        parentId: block.parentId,
        children: [],
        payload: {
          style: {
            align: 'left',
            language: null,
          },
          inlines: [
            {
              id: `i_missing_${block.id}`,
              kind: 'text_run',
              marks: createDefaultMarks(),
              text: sourceUrl,
            },
          ],
        },
      };
      continue;
    }
    localAssetByBlockId.set(block.id, {
      kind: 'image',
      absolutePath: resolvedPath,
      fileName: path.basename(resolvedPath),
      mediaKind: 'image',
    });
  }

  return localAssetByBlockId;
}

export function collectMermaidPatches(last: LASTModel): Map<string, MermaidPatch> {
  const patches = new Map<string, MermaidPatch>();
  for (const block of Object.values(last.blocks)) {
    if (block.type !== 'code') continue;
    if (!isMermaidLanguage(block.payload.style.language)) continue;
    const code = extractTextFromInlines(block.payload.inlines);
    patches.set(block.id, { code });
  }
  return patches;
}

export function applyTableColumnWidthHeuristics(last: LASTModel): void {
  for (const block of Object.values(last.blocks)) {
    if (block.type !== 'table') continue;

    const rowSize = Math.max(1, block.payload.rowSize ?? 0);
    const columnSize = Math.max(1, block.payload.columnSize ?? 0);
    if (rowSize <= 0 || columnSize <= 0) continue;

    const cells = block.payload.cells && block.payload.cells.length > 0 ? block.payload.cells : block.children;
    if (!cells || cells.length === 0) continue;

    const rows: string[][] = [];
    const textBlocks: Array<Array<LASTTextualBlock<LASTTextualBlockType> | null>> = [];
    const richCells: boolean[][] = [];
    for (let r = 0; r < rowSize; r += 1) {
      const row: string[] = [];
      const rowTextBlocks: Array<LASTTextualBlock<LASTTextualBlockType> | null> = [];
      const rowRichCells: boolean[] = [];
      for (let c = 0; c < columnSize; c += 1) {
        const idx = r * columnSize + c;
        const cellId = cells[idx];
        if (!cellId) {
          row.push('');
          rowTextBlocks.push(null);
          rowRichCells.push(false);
          continue;
        }

        const cell = last.blocks[cellId];
        if (!cell || cell.type !== 'table_cell') {
          row.push('');
          rowTextBlocks.push(null);
          rowRichCells.push(false);
          continue;
        }

        const childBlocks = cell.children.map((id) => last.blocks[id]).filter(Boolean);
        const textChild =
          childBlocks.find((candidate): candidate is LASTTextualBlock<LASTTextualBlockType> => {
            return Boolean(candidate && isTextualBlock(candidate) && candidate.type === 'text');
          }) ?? null;
        const hasRichContent =
          childBlocks.length > 1 ||
          childBlocks.some((candidate) => {
            return !candidate || !isTextualBlock(candidate) || candidate.type !== 'text';
          });
        if (!textChild) {
          row.push('');
          rowTextBlocks.push(null);
          rowRichCells.push(hasRichContent);
          continue;
        }

        row.push(toPlainTextFromInlineList(textChild.payload.inlines).replace(/\s+/g, ' ').trim());
        rowTextBlocks.push(textChild);
        rowRichCells.push(hasRichContent);
      }
      rows.push(row);
      textBlocks.push(rowTextBlocks);
      richCells.push(rowRichCells);
    }

    const hasHeaderRow = block.payload.headerRow ?? rowSize > 1;
    const declaredColumnAlign = normalizeDeclaredColumnAlign(block.payload.columnAlign, columnSize);
    const hasDeclaredColumnAlign = declaredColumnAlign.some((item) => item !== undefined);
    if (hasDeclaredColumnAlign) {
      applyDeclaredColumnAlignment(textBlocks, declaredColumnAlign);
    } else {
      applyDefaultHeaderCenterAlignment(textBlocks, hasHeaderRow);
      applyNumericColumnRightAlignment(rows, textBlocks, richCells, hasHeaderRow);
    }

    const widths = allocateTableColumnWidths(rows, richCells, hasHeaderRow);
    if (widths.length > 0) {
      block.payload.columnWidth = widths;
    }
  }
}

export function patchBTTForMermaidAndAssets(
  btt: BTTDocument,
  mermaidByBlockId: ReadonlyMap<string, MermaidPatch>,
  assetByBlockId: ReadonlyMap<string, LocalAsset>,
  options?: {
    mermaidRender?: MermaidRenderConfig;
  },
): void {
  const mermaidRenderConfig = options?.mermaidRender ?? DEFAULT_MERMAID_RENDER_CONFIG;
  const walk = (node: BTTDocument['root']): void => {
    applyRawBlockPatch(node.rawBlock, node.blockId, mermaidByBlockId, assetByBlockId, mermaidRenderConfig);
    node.blockType = node.rawBlock.block_type;
    node.blockTypeName = getLarkBlockTypeName(node.blockType);
    for (const child of node.children) {
      walk(child);
    }
  };

  walk(btt.root);

  for (const [blockId, rawBlock] of Object.entries(btt.flatBlocks)) {
    applyRawBlockPatch(rawBlock, blockId, mermaidByBlockId, assetByBlockId, mermaidRenderConfig);
  }
}
