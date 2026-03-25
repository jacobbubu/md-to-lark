import { toString } from 'hast-util-to-string';
import type { Element as HastElement, Root as HastRoot, RootContent as HastRootContent, Text as HastText } from 'hast';
import type {
  LASTAlign,
  LASTBlockId,
  LASTBlockNode,
  LASTDocument,
  LASTFragment,
  LASTFeishuBlockType,
  LASTIndexes,
  LASTInlineId,
  LASTInlineMarks,
  LASTModel,
  LASTInlineNode,
  LASTIframeType,
  LASTLink,
  LASTScopeId,
  LASTTableBlock,
  LASTTextPayload,
  LASTTextScope,
  LASTTextSegment,
  LASTTextualBlock,
  LASTTextualBlockType,
} from '../last/types.js';
import { LAST_TEXTUAL_BLOCK_TYPE_SET } from '../last/textual-block-types.js';

interface ConversionContext {
  blocks: Record<LASTBlockId, LASTBlockNode>;
  blockCounter: number;
  inlineCounter: number;
}

export interface HastToLASTOptions {
  documentId?: string;
  mode?: 'document' | 'fragment';
}

const BLOCK_CONTAINER_TAGS: ReadonlySet<string> = new Set([
  'article',
  'section',
  'main',
  'div',
  'aside',
  'header',
  'footer',
]);

const DEFAULT_ALIGN: LASTAlign = 'left';

function createContext(): ConversionContext {
  return {
    blocks: {},
    blockCounter: 1,
    inlineCounter: 1,
  };
}

function nextBlockId(ctx: ConversionContext): LASTBlockId {
  const id = `b_${ctx.blockCounter}` as LASTBlockId;
  ctx.blockCounter += 1;
  return id;
}

function nextInlineId(ctx: ConversionContext): LASTInlineId {
  const id = `i_${ctx.inlineCounter}` as LASTInlineId;
  ctx.inlineCounter += 1;
  return id;
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

function cloneMarks(marks: LASTInlineMarks): LASTInlineMarks {
  const link: LASTLink | null = marks.link ? { url: marks.link.url } : null;
  return {
    ...marks,
    link,
  };
}

function createTextPayload(inlines: LASTInlineNode[], overrides?: Partial<LASTTextPayload['style']>): LASTTextPayload {
  return {
    style: {
      align: DEFAULT_ALIGN,
      language: null,
      ...overrides,
    },
    inlines,
  };
}

function addBlock(ctx: ConversionContext, block: LASTBlockNode): void {
  ctx.blocks[block.id] = block;
}

function isElement(node: HastRootContent): node is HastElement {
  return node.type === 'element';
}

function isText(node: HastRootContent): node is HastText {
  return node.type === 'text';
}

function getChildren(node: HastElement | HastRoot): HastRootContent[] {
  return Array.isArray(node.children) ? node.children : [];
}

function getClassNames(element: HastElement): string[] {
  const raw = element.properties?.className;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  return [String(raw)];
}

function getStringProp(element: HastElement, key: string): string | null {
  const raw = element.properties?.[key];
  if (raw == null) return null;
  return String(raw);
}

function getBooleanProp(element: HastElement, key: string): boolean | null {
  const raw = element.properties?.[key];
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  }
  return null;
}

function parseAlignValue(raw: string | null): LASTAlign | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === 'left' || value === 'center' || value === 'right') {
    return value;
  }
  return undefined;
}

function parseAlignFromStyle(rawStyle: string | null): LASTAlign | undefined {
  if (!rawStyle) return undefined;
  const matched = /(?:^|;)\s*text-align\s*:\s*(left|center|right)\s*(?:;|$)/i.exec(rawStyle);
  return parseAlignValue(matched?.[1] ?? null);
}

function extractTableCellAlign(cell: HastElement | undefined): LASTAlign | undefined {
  if (!cell) return undefined;
  const fromAlignAttr = parseAlignValue(getStringProp(cell, 'align'));
  if (fromAlignAttr !== undefined) return fromAlignAttr;
  return parseAlignFromStyle(getStringProp(cell, 'style'));
}

function appendChild(parent: LASTBlockNode, childId: LASTBlockId): void {
  parent.children.push(childId);
}

function createTextualBlock(
  ctx: ConversionContext,
  type: LASTTextualBlockType,
  parentId: LASTBlockId | null,
  inlines: LASTInlineNode[],
  styleOverrides?: Partial<LASTTextPayload['style']>,
): LASTBlockId {
  const blockId = nextBlockId(ctx);
  const block: LASTTextualBlock<LASTTextualBlockType> = {
    id: blockId,
    type,
    parentId,
    children: [],
    payload: createTextPayload(inlines, styleOverrides),
  };
  addBlock(ctx, block);
  return blockId;
}

function createDividerBlock(ctx: ConversionContext, parentId: LASTBlockId): LASTBlockId {
  const blockId = nextBlockId(ctx);
  addBlock(ctx, {
    id: blockId,
    type: 'divider',
    parentId,
    children: [],
    payload: {},
  });
  return blockId;
}

function createImageBlock(ctx: ConversionContext, parentId: LASTBlockId, sourceUrl: string | null): LASTBlockId {
  const blockId = nextBlockId(ctx);
  const blockBase: Extract<LASTBlockNode, { type: 'image' }> = {
    id: blockId,
    type: 'image',
    parentId,
    children: [],
    payload: {
      width: 0,
      height: 0,
      token: '',
      align: 'left',
    },
  };

  if (sourceUrl) {
    blockBase.selector = { attrs: { sourceUrl } };
  }

  addBlock(ctx, blockBase);
  return blockId;
}

function createIframeBlock(
  ctx: ConversionContext,
  parentId: LASTBlockId,
  url: string,
  iframeType: LASTIframeType,
): LASTBlockId {
  const blockId = nextBlockId(ctx);
  addBlock(ctx, {
    id: blockId,
    type: 'iframe',
    parentId,
    children: [],
    payload: {
      component: {
        url,
        iframeType,
      },
    },
  });
  return blockId;
}

function createTableBlock(ctx: ConversionContext, parentId: LASTBlockId): LASTBlockId {
  const blockId = nextBlockId(ctx);
  const block: LASTTableBlock = {
    id: blockId,
    type: 'table',
    parentId,
    children: [],
    payload: {
      cells: [],
      rowSize: 0,
      columnSize: 0,
      columnWidth: [],
      headerColumn: false,
      headerRow: false,
      mergeInfo: [],
    },
  };
  addBlock(ctx, block);
  return blockId;
}

function createTableCellBlock(ctx: ConversionContext, parentId: LASTBlockId): LASTBlockId {
  const blockId = nextBlockId(ctx);
  addBlock(ctx, {
    id: blockId,
    type: 'table_cell',
    parentId,
    children: [],
    payload: {},
  });
  return blockId;
}

function mergeAdjacentTextRuns(inlines: LASTInlineNode[]): LASTInlineNode[] {
  const merged: LASTInlineNode[] = [];

  for (const inline of inlines) {
    const prev = merged.at(-1);
    if (
      prev &&
      inline.kind === 'text_run' &&
      prev.kind === 'text_run' &&
      JSON.stringify(prev.marks) === JSON.stringify(inline.marks)
    ) {
      prev.text = (prev.text ?? '') + (inline.text ?? '');
      continue;
    }
    merged.push(inline);
  }

  return merged;
}

function hasClassName(element: HastElement, expected: string): boolean {
  return getClassNames(element).includes(expected);
}

function isMathInlineCodeElement(element: HastElement): boolean {
  if (element.tagName !== 'code') return false;
  return hasClassName(element, 'math-inline');
}

function isMathDisplayCodeElement(element: HastElement): boolean {
  if (element.tagName !== 'code') return false;
  return hasClassName(element, 'math-display');
}

function parseInlineNodes(
  ctx: ConversionContext,
  nodes: HastRootContent[],
  marks: LASTInlineMarks = createDefaultMarks(),
): LASTInlineNode[] {
  const result: LASTInlineNode[] = [];

  for (const node of nodes) {
    if (isText(node)) {
      if (node.value.length === 0) {
        continue;
      }
      result.push({
        id: nextInlineId(ctx),
        kind: 'text_run',
        marks: cloneMarks(marks),
        text: node.value,
      });
      continue;
    }

    if (!isElement(node)) {
      continue;
    }

    if (node.tagName === 'br') {
      result.push({
        id: nextInlineId(ctx),
        kind: 'text_run',
        marks: cloneMarks(marks),
        text: '\n',
      });
      continue;
    }

    if (node.tagName === 'input' && getStringProp(node, 'type') === 'checkbox') {
      continue;
    }

    if (node.tagName === 'code') {
      if (isMathInlineCodeElement(node)) {
        const formula = trimBoundaryNewlines(toString(node));
        if (formula.length > 0) {
          result.push({
            id: nextInlineId(ctx),
            kind: 'equation',
            marks: cloneMarks(marks),
            latex: formula,
          });
        }
        continue;
      }
      const nextMarks = cloneMarks(marks);
      nextMarks.inlineCode = true;
      result.push({
        id: nextInlineId(ctx),
        kind: 'text_run',
        marks: nextMarks,
        text: toString(node),
      });
      continue;
    }

    if (node.tagName === 'img') {
      const alt = getStringProp(node, 'alt') ?? '';
      if (alt.length > 0) {
        result.push({
          id: nextInlineId(ctx),
          kind: 'text_run',
          marks: cloneMarks(marks),
          text: alt,
        });
      }
      continue;
    }

    const nextMarks = cloneMarks(marks);

    if (node.tagName === 'strong' || node.tagName === 'b') {
      nextMarks.bold = true;
    }
    if (node.tagName === 'em' || node.tagName === 'i') {
      nextMarks.italic = true;
    }
    if (node.tagName === 'del' || node.tagName === 's' || node.tagName === 'strike') {
      nextMarks.strikethrough = true;
    }
    if (node.tagName === 'u') {
      nextMarks.underline = true;
    }
    if (node.tagName === 'a') {
      const href = getStringProp(node, 'href');
      nextMarks.link = href ? { url: href } : null;
    }

    result.push(...parseInlineNodes(ctx, getChildren(node), nextMarks));
  }

  return mergeAdjacentTextRuns(result);
}

function isWhitespaceTextNode(node: HastRootContent): boolean {
  return isText(node) && node.value.trim().length === 0;
}

function getMeaningfulChildren(nodes: HastRootContent[]): HastRootContent[] {
  return nodes.filter((child) => !isWhitespaceTextNode(child));
}

function findStandaloneImageSrcInParagraph(paragraph: HastElement): string | null {
  const meaningfulChildren = getMeaningfulChildren(getChildren(paragraph));
  if (meaningfulChildren.length !== 1) return null;
  const only = meaningfulChildren[0];
  if (!only || !isElement(only) || only.tagName !== 'img') return null;
  return getStringProp(only, 'src');
}

function parseHttpUrl(url: string): URL | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function safeDecodeURIComponent(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function hostEqualsOrEndsWith(host: string, target: string): boolean {
  return host === target || host.endsWith(`.${target}`);
}

function resolveIframeTypeByUrl(rawUrl: string): LASTIframeType | undefined {
  const normalized = rawUrl.trim();
  if (!normalized) return undefined;
  const maybeDecoded = /^https?%3a%2f%2f/i.test(normalized) ? safeDecodeURIComponent(normalized) : normalized;
  const parsed = parseHttpUrl(maybeDecoded);
  if (!parsed) return undefined;
  const host = parsed.hostname.toLowerCase();

  if (hostEqualsOrEndsWith(host, 'bilibili.com') || hostEqualsOrEndsWith(host, 'b23.tv')) {
    return 'bilibili';
  }
  if (hostEqualsOrEndsWith(host, 'douyin.com')) {
    return 'xigua';
  }
  if (hostEqualsOrEndsWith(host, 'youku.com')) {
    return 'youku';
  }
  if (hostEqualsOrEndsWith(host, 'airtable.com')) {
    return 'airtable';
  }
  if (hostEqualsOrEndsWith(host, 'map.baidu.com')) {
    return 'baidu_map';
  }
  if (hostEqualsOrEndsWith(host, 'amap.com')) {
    return 'gaode_map';
  }
  if (hostEqualsOrEndsWith(host, 'figma.com')) {
    return 'figma';
  }
  if (hostEqualsOrEndsWith(host, 'modao.cc')) {
    return 'modao';
  }
  if (hostEqualsOrEndsWith(host, 'canva.cn') || hostEqualsOrEndsWith(host, 'canva.com')) {
    return 'canva';
  }
  if (hostEqualsOrEndsWith(host, 'codepen.io')) {
    return 'codepen';
  }
  if (hostEqualsOrEndsWith(host, 'wenjuan.feishu.cn')) {
    return 'feishu_wenjuan';
  }
  if (hostEqualsOrEndsWith(host, 'jinshuju.net') || hostEqualsOrEndsWith(host, 'jinshuju.com')) {
    return 'jinshuju';
  }

  return undefined;
}

function findStandaloneIframePayloadInParagraph(
  paragraph: HastElement,
): { url: string; iframeType: LASTIframeType } | null {
  const meaningfulChildren = getMeaningfulChildren(getChildren(paragraph));
  if (meaningfulChildren.length !== 1) return null;
  const only = meaningfulChildren[0];
  if (!only || !isElement(only) || only.tagName !== 'a') return null;

  const href = getStringProp(only, 'href');
  if (!href) return null;
  const iframeType = resolveIframeTypeByUrl(href);
  if (!iframeType) return null;

  const maybeDecoded = /^https?%3a%2f%2f/i.test(href.trim()) ? safeDecodeURIComponent(href.trim()) : href.trim();
  const parsed = parseHttpUrl(maybeDecoded);
  if (!parsed) return null;
  return {
    url: parsed.toString(),
    iframeType,
  };
}

function findStandaloneRichItemInTableCell(
  cell: HastElement,
): { kind: 'image'; sourceUrl: string | null } | { kind: 'iframe'; url: string; iframeType: LASTIframeType } | null {
  let meaningfulChildren = getMeaningfulChildren(getChildren(cell));
  if (meaningfulChildren.length !== 1) return null;
  let only = meaningfulChildren[0];
  if (only && isElement(only) && (only.tagName === 'p' || only.tagName === 'div')) {
    const nested = getMeaningfulChildren(getChildren(only));
    if (nested.length !== 1) return null;
    only = nested[0];
  }

  if (!only || !isElement(only)) return null;
  if (only.tagName === 'img') {
    return {
      kind: 'image',
      sourceUrl: getStringProp(only, 'src'),
    };
  }
  if (only.tagName !== 'a') return null;

  const href = getStringProp(only, 'href');
  if (!href) return null;
  const iframeType = resolveIframeTypeByUrl(href);
  if (!iframeType) return null;
  const maybeDecoded = /^https?%3a%2f%2f/i.test(href.trim()) ? safeDecodeURIComponent(href.trim()) : href.trim();
  const parsed = parseHttpUrl(maybeDecoded);
  if (!parsed) return null;
  return {
    kind: 'iframe',
    url: parsed.toString(),
    iframeType,
  };
}

function parseHeadingType(tagName: string): LASTTextualBlockType {
  const level = Number(tagName.slice(1));
  if (!Number.isInteger(level) || level < 1) return 'heading1';
  if (level > 9) return 'heading9';
  return `heading${level}` as LASTTextualBlockType;
}

function isTaskListItem(li: HastElement): boolean {
  return getClassNames(li).includes('task-list-item');
}

function splitListItemContent(li: HastElement): {
  contentNodes: HastRootContent[];
  nestedBlocks: HastRootContent[];
  checked: boolean;
} {
  const contentNodes: HastRootContent[] = [];
  const nestedBlocks: HastRootContent[] = [];
  let checked = false;
  let consumedLeadParagraph = false;

  for (const child of getChildren(li)) {
    if (isWhitespaceTextNode(child)) {
      continue;
    }

    const childElement = isElement(child) ? child : null;

    if (childElement && childElement.tagName === 'input' && getStringProp(childElement, 'type') === 'checkbox') {
      checked = getBooleanProp(childElement, 'checked') ?? false;
      continue;
    }

    if (childElement && (childElement.tagName === 'ul' || childElement.tagName === 'ol')) {
      nestedBlocks.push(childElement);
      continue;
    }

    if (childElement && (childElement.tagName === 'p' || childElement.tagName === 'div')) {
      if (!consumedLeadParagraph && contentNodes.length === 0) {
        contentNodes.push(...getChildren(childElement));
        consumedLeadParagraph = true;
      } else {
        nestedBlocks.push(childElement);
      }
      continue;
    }

    if (
      childElement &&
      ['table', 'pre', 'blockquote', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(childElement.tagName)
    ) {
      nestedBlocks.push(childElement);
      continue;
    }

    contentNodes.push(child);
  }

  return { contentNodes, nestedBlocks, checked };
}

function convertList(
  ctx: ConversionContext,
  list: HastElement,
  parentId: LASTBlockId,
  kind: 'bullet' | 'ordered',
): LASTBlockId[] {
  const ids: LASTBlockId[] = [];

  for (const child of getChildren(list)) {
    if (!isElement(child) || child.tagName !== 'li') {
      continue;
    }

    const taskItem = isTaskListItem(child);
    const { contentNodes, nestedBlocks, checked } = splitListItemContent(child);

    const blockType: LASTTextualBlockType = taskItem ? 'todo' : kind;
    const blockId = createTextualBlock(
      ctx,
      blockType,
      parentId,
      parseInlineNodes(ctx, contentNodes),
      taskItem ? { done: checked } : undefined,
    );

    ids.push(blockId);

    for (const nested of nestedBlocks) {
      const childIds = convertBlock(ctx, nested, blockId);
      const block = ctx.blocks[blockId];
      if (block) {
        for (const childId of childIds) {
          appendChild(block, childId);
        }
      }
    }
  }

  return ids;
}

function findLanguageFromCodeClass(codeElement: HastElement): string | null {
  for (const className of getClassNames(codeElement)) {
    if (className.startsWith('language-')) {
      return className.slice('language-'.length) || null;
    }
  }
  return null;
}

function convertPre(ctx: ConversionContext, pre: HastElement, parentId: LASTBlockId): LASTBlockId[] {
  const codeElement = getChildren(pre).find((node): node is HastElement => isElement(node) && node.tagName === 'code');
  if (codeElement && isMathDisplayCodeElement(codeElement)) {
    const formula = trimBoundaryNewlines(toString(codeElement));
    const inlines: LASTInlineNode[] = formula.length
      ? [
          {
            id: nextInlineId(ctx),
            kind: 'equation',
            marks: createDefaultMarks(),
            latex: formula,
          },
        ]
      : [];
    return [createTextualBlock(ctx, 'text', parentId, inlines)];
  }

  const sourceRaw = codeElement ? toString(codeElement) : toString(pre);
  const source = trimSingleTrailingNewline(sourceRaw);
  const language = codeElement ? findLanguageFromCodeClass(codeElement) : null;

  const inlines: LASTInlineNode[] = source.length
    ? [
        {
          id: nextInlineId(ctx),
          kind: 'text_run',
          marks: createDefaultMarks(),
          text: source,
        },
      ]
    : [];

  const codeId = createTextualBlock(ctx, 'code', parentId, inlines, {
    language,
    wrap: false,
  });

  return [codeId];
}

function trimSingleTrailingNewline(value: string): string {
  return value.replace(/\r?\n$/, '');
}

function extractTableRows(table: HastElement): HastElement[] {
  const rows: HastElement[] = [];

  for (const child of getChildren(table)) {
    if (!isElement(child)) continue;

    if (child.tagName === 'tr') {
      rows.push(child);
      continue;
    }

    if (child.tagName === 'thead' || child.tagName === 'tbody' || child.tagName === 'tfoot') {
      for (const row of getChildren(child)) {
        if (isElement(row) && row.tagName === 'tr') {
          rows.push(row);
        }
      }
    }
  }

  return rows;
}

function extractRowCells(row: HastElement): HastElement[] {
  const cells: HastElement[] = [];
  for (const child of getChildren(row)) {
    if (isElement(child) && (child.tagName === 'th' || child.tagName === 'td')) {
      cells.push(child);
    }
  }
  return cells;
}

function convertTable(ctx: ConversionContext, table: HastElement, parentId: LASTBlockId): LASTBlockId[] {
  const tableId = createTableBlock(ctx, parentId);
  const rows = extractTableRows(table);
  const rowSize = rows.length;
  const columnSize = rows.reduce((max, row) => Math.max(max, extractRowCells(row).length), 0);
  const rowCellMatrix = rows.map((row) => extractRowCells(row));
  const columnAlign: Array<LASTAlign | undefined> = Array.from({ length: columnSize }, () => undefined);
  for (let c = 0; c < columnSize; c += 1) {
    for (let r = 0; r < rowSize; r += 1) {
      const align = extractTableCellAlign(rowCellMatrix[r]?.[c]);
      if (align === undefined) continue;
      columnAlign[c] = align;
      break;
    }
  }
  const hasExplicitColumnAlign = columnAlign.some((value) => value !== undefined);

  const cells: LASTBlockId[] = [];
  for (let r = 0; r < rowSize; r += 1) {
    const rowCells = rowCellMatrix[r] ?? [];

    for (let c = 0; c < columnSize; c += 1) {
      const cell = rowCells[c];
      const cellId = createTableCellBlock(ctx, tableId);
      const cellBlock = ctx.blocks[cellId];
      const richItem = cell ? findStandaloneRichItemInTableCell(cell) : null;

      if (cellBlock?.type === 'table_cell' && richItem?.kind === 'image') {
        const imageId = createImageBlock(ctx, cellId, richItem.sourceUrl);
        cellBlock.children = [imageId];
        cells.push(cellId);
        continue;
      }

      if (cellBlock?.type === 'table_cell' && richItem?.kind === 'iframe') {
        const iframeId = createIframeBlock(ctx, cellId, richItem.url, richItem.iframeType);
        cellBlock.children = [iframeId];
        cells.push(cellId);
        continue;
      }

      const inlines = cell ? parseInlineNodes(ctx, getChildren(cell)) : [];
      const declaredAlign = columnAlign[c];
      const textId = createTextualBlock(
        ctx,
        'text',
        cellId,
        inlines,
        declaredAlign ? { align: declaredAlign } : undefined,
      );
      if (cellBlock?.type === 'table_cell') {
        cellBlock.children = [textId];
      }
      cells.push(cellId);
    }
  }

  const tableBlock = ctx.blocks[tableId];
  if (tableBlock?.type === 'table') {
    tableBlock.children = [...cells];
    tableBlock.payload = {
      cells,
      rowSize,
      columnSize,
      columnWidth: Array.from({ length: columnSize }, () => 240),
      ...(hasExplicitColumnAlign ? { columnAlign } : {}),
      headerColumn: false,
      headerRow: getChildren(table).some((node) => isElement(node) && node.tagName === 'thead'),
      mergeInfo: [],
    };
  }

  return [tableId];
}

function convertBlockquote(ctx: ConversionContext, blockquote: HastElement, parentId: LASTBlockId): LASTBlockId[] {
  const quoteText = trimBoundaryNewlines(toString(blockquote));
  const inlines: LASTInlineNode[] = quoteText.length
    ? [
        {
          id: nextInlineId(ctx),
          kind: 'text_run',
          marks: createDefaultMarks(),
          text: quoteText,
        },
      ]
    : [];

  return [createTextualBlock(ctx, 'quote', parentId, inlines)];
}

function trimBoundaryNewlines(value: string): string {
  return value.replace(/^(?:\r?\n)+/, '').replace(/(?:\r?\n)+$/, '');
}

function convertUnknownElement(ctx: ConversionContext, element: HastElement, parentId: LASTBlockId): LASTBlockId[] {
  if (BLOCK_CONTAINER_TAGS.has(element.tagName)) {
    const ids: LASTBlockId[] = [];
    for (const child of getChildren(element)) {
      ids.push(...convertBlock(ctx, child, parentId));
    }
    return ids;
  }

  const text = trimBoundaryNewlines(toString(element));
  if (text.trim().length === 0) {
    return [];
  }

  return [
    createTextualBlock(ctx, 'text', parentId, [
      {
        id: nextInlineId(ctx),
        kind: 'text_run',
        marks: createDefaultMarks(),
        text,
      },
    ]),
  ];
}

function convertBlock(ctx: ConversionContext, node: HastRootContent, parentId: LASTBlockId): LASTBlockId[] {
  if (isWhitespaceTextNode(node)) {
    return [];
  }

  if (isText(node)) {
    return [
      createTextualBlock(ctx, 'text', parentId, [
        {
          id: nextInlineId(ctx),
          kind: 'text_run',
          marks: createDefaultMarks(),
          text: node.value,
        },
      ]),
    ];
  }

  if (!isElement(node)) {
    return [];
  }

  switch (node.tagName) {
    case 'p': {
      const standaloneImageSrc = findStandaloneImageSrcInParagraph(node);
      if (standaloneImageSrc) {
        return [createImageBlock(ctx, parentId, standaloneImageSrc)];
      }
      const standaloneIframe = findStandaloneIframePayloadInParagraph(node);
      if (standaloneIframe) {
        return [createIframeBlock(ctx, parentId, standaloneIframe.url, standaloneIframe.iframeType)];
      }
      return [createTextualBlock(ctx, 'text', parentId, parseInlineNodes(ctx, getChildren(node)))];
    }
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
    case 'h7':
    case 'h8':
    case 'h9':
      return [
        createTextualBlock(ctx, parseHeadingType(node.tagName), parentId, parseInlineNodes(ctx, getChildren(node))),
      ];
    case 'ul':
      return convertList(ctx, node, parentId, 'bullet');
    case 'ol':
      return convertList(ctx, node, parentId, 'ordered');
    case 'pre':
      return convertPre(ctx, node, parentId);
    case 'blockquote':
      return convertBlockquote(ctx, node, parentId);
    case 'hr':
      return [createDividerBlock(ctx, parentId)];
    case 'table':
      return convertTable(ctx, node, parentId);
    case 'img':
      return [createImageBlock(ctx, parentId, getStringProp(node, 'src'))];
    case 'br':
      return [
        createTextualBlock(ctx, 'text', parentId, [
          {
            id: nextInlineId(ctx),
            kind: 'text_run',
            marks: createDefaultMarks(),
            text: '\n',
          },
        ]),
      ];
    default:
      return convertUnknownElement(ctx, node, parentId);
  }
}

function isTextualBlockNode(block: LASTBlockNode): block is LASTTextualBlock<LASTTextualBlockType> {
  return LAST_TEXTUAL_BLOCK_TYPE_SET.has(block.type as LASTTextualBlockType);
}

function toSearchText(inline: LASTInlineNode): { text: string; editable: boolean } {
  switch (inline.kind) {
    case 'text_run':
      return { text: inline.text ?? '', editable: true };
    case 'mention_user':
      return { text: inline.userId ?? '', editable: false };
    case 'equation':
      return { text: inline.latex ?? '', editable: false };
    case 'mention_doc':
      return { text: inline.title ?? '', editable: false };
    case 'reminder':
      return { text: '', editable: false };
    case 'inline_block':
      return { text: '', editable: false };
    case 'inline_file':
      return { text: '', editable: false };
    case 'link_preview':
      return { text: inline.title ?? inline.url ?? '', editable: false };
    default:
      return { text: '', editable: false };
  }
}

function buildScopeForTopLevelTextBlock(
  scopeId: LASTScopeId,
  block: LASTTextualBlock<LASTTextualBlockType>,
): LASTTextScope {
  let normalizedText = '';
  const segments: LASTTextSegment[] = [];

  for (const inline of block.payload.inlines) {
    const projection = toSearchText(inline);
    if (projection.text.length === 0) {
      continue;
    }
    const from = normalizedText.length;
    normalizedText += projection.text;
    const to = normalizedText.length;
    segments.push({
      inlineId: inline.id,
      inlineKind: inline.kind,
      from,
      to,
      editable: projection.editable,
    });
  }

  return {
    id: scopeId,
    blockId: block.id,
    blockType: block.type,
    normalizedText,
    segments,
  };
}

function getTopLevelBlockIds(doc: LASTModel): LASTBlockId[] {
  if ('topLevel' in doc) {
    return [...doc.topLevel];
  }
  const root = doc.blocks[doc.rootId];
  return root ? [...root.children] : [];
}

function buildIndexes(doc: LASTModel): LASTIndexes {
  const byType: LASTIndexes['byType'] = {};

  for (const block of Object.values(doc.blocks)) {
    const entries = byType[block.type as LASTFeishuBlockType] ?? [];
    entries.push(block.id);
    byType[block.type as LASTFeishuBlockType] = entries;
  }

  const textScopes: Record<LASTScopeId, LASTTextScope> = {};
  const textScopeByBlockId: Partial<Record<LASTBlockId, LASTScopeId>> = {};
  let scopeCounter = 1;

  for (const childId of getTopLevelBlockIds(doc)) {
    const block = doc.blocks[childId];
    if (!block || !isTextualBlockNode(block) || block.type === 'page') {
      continue;
    }

    const scopeId = `scope_${scopeCounter}` as LASTScopeId;
    scopeCounter += 1;

    const scope = buildScopeForTopLevelTextBlock(scopeId, block);
    textScopes[scopeId] = scope;
    textScopeByBlockId[block.id] = scopeId;
  }

  return {
    byType,
    textScopes,
    textScopeByBlockId,
  };
}

function normalizeDocumentId(value?: string): LASTDocument['id'] {
  if (!value || value.trim().length === 0) {
    return 'doc_1';
  }
  const trimmed = value.trim();
  return (trimmed.startsWith('doc_') ? trimmed : `doc_${trimmed}`) as LASTDocument['id'];
}

function deepCloneBlock<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function hastToLAST(hast: HastRoot, options?: HastToLASTOptions): LASTModel {
  const ctx = createContext();
  const mode = options?.mode ?? 'fragment';

  const rootId = createTextualBlock(ctx, 'page', null, []);
  const root = ctx.blocks[rootId];
  if (!root || root.type !== 'page') {
    throw new Error('Failed to initialize LAST root page block.');
  }

  for (const child of getChildren(hast)) {
    const childIds = convertBlock(ctx, child, rootId);
    for (const childId of childIds) {
      appendChild(root, childId);
    }
  }

  if (mode === 'document') {
    const doc: LASTDocument = {
      schema: 'LAST',
      version: '1.0.0',
      id: normalizeDocumentId(options?.documentId),
      rootId,
      blocks: ctx.blocks,
      indexes: {
        byType: {},
        textScopes: {},
        textScopeByBlockId: {},
      },
    };
    doc.indexes = buildIndexes(doc);
    return doc;
  }

  const topLevel = [...root.children];
  const fragmentBlocks: Record<LASTBlockId, LASTBlockNode> = {};
  for (const [id, block] of Object.entries(ctx.blocks) as Array<[LASTBlockId, LASTBlockNode]>) {
    if (id === rootId) {
      continue;
    }
    fragmentBlocks[id] = deepCloneBlock(block);
  }
  for (const blockId of topLevel) {
    const block = fragmentBlocks[blockId];
    if (block) {
      block.parentId = null;
    }
  }

  const fragment: LASTFragment = {
    schema: 'LAST',
    version: '1.0.0',
    id: normalizeDocumentId(options?.documentId),
    mode: 'fragment',
    topLevel,
    blocks: fragmentBlocks,
    indexes: {
      byType: {},
      textScopes: {},
      textScopeByBlockId: {},
    },
  };
  fragment.indexes = buildIndexes(fragment);
  return fragment;
}
