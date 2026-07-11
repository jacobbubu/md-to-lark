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
import { createDefaultImagePayload } from '../last/image-defaults.js';
import { LAST_TEXTUAL_BLOCK_TYPE_SET } from '../last/textual-block-types.js';
import type { LarkRendererTarget } from '../protocol/types.js';
import { parseDirectiveWidth } from './markdown/md-to-semantic-hast.js';

interface ConversionContext {
  blocks: Record<LASTBlockId, LASTBlockNode>;
  blockCounter: number;
  inlineCounter: number;
  imageSizeContext: ImageSizeResolverBaseContext;
  warnedImageSizeKeys: Set<string>;
  semanticTarget: LarkRendererTarget;
  imageSizeResolver?: ImageSizeResolver;
}

export interface ImageDisplaySize {
  widthRatio?: number;
  widthPx?: number;
  aspectRatio?: number;
}

export interface ImageSizeResolverContext {
  inputPath?: string;
  resourceBaseDir?: string;
  alt?: string;
  title?: string;
}

export interface ImageSizeResolverBaseContext {
  inputPath?: string;
  resourceBaseDir?: string;
}

export type ImageSizeResolver = (
  imageSrc: string,
  context: ImageSizeResolverContext,
) => ImageDisplaySize | null | undefined;

export interface HastToLASTOptions {
  documentId?: string;
  mode?: 'document' | 'fragment';
  imageSizeResolver?: ImageSizeResolver;
  imageSizeContext?: ImageSizeResolverBaseContext;
  semanticTarget?: LarkRendererTarget;
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

interface ImageSource {
  sourceUrl: string | null;
  alt: string | null;
  title: string | null;
  linkHref: string | null;
}

function createContext(options: HastToLASTOptions = {}): ConversionContext {
  return {
    blocks: {},
    blockCounter: 1,
    inlineCounter: 1,
    imageSizeContext: options.imageSizeContext ?? {},
    warnedImageSizeKeys: new Set(),
    semanticTarget: options.semanticTarget ?? {},
    ...(options.imageSizeResolver ? { imageSizeResolver: options.imageSizeResolver } : {}),
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

function warnInvalidImageDisplaySize(ctx: ConversionContext, key: string, message: string): void {
  if (ctx.warnedImageSizeKeys.has(key)) return;
  ctx.warnedImageSizeKeys.add(key);
  console.warn(`[md-to-lark] ${message}`);
}

function buildImageSizeResolverContext(ctx: ConversionContext, image: ImageSource): ImageSizeResolverContext {
  const context: ImageSizeResolverContext = {};
  if (ctx.imageSizeContext.inputPath) {
    context.inputPath = ctx.imageSizeContext.inputPath;
  }
  if (ctx.imageSizeContext.resourceBaseDir) {
    context.resourceBaseDir = ctx.imageSizeContext.resourceBaseDir;
  }
  if (image.alt) {
    context.alt = image.alt;
  }
  if (image.title) {
    context.title = image.title;
  }
  return context;
}

function toPositiveRoundedWidth(value: number, maximum = 1000): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(maximum, Math.max(1, Math.round(value)));
}

function applyImageDisplaySize(
  ctx: ConversionContext,
  image: ImageSource,
  block: Extract<LASTBlockNode, { type: 'image' }>,
): boolean {
  if (!ctx.imageSizeResolver || !image.sourceUrl) {
    return false;
  }

  const size = ctx.imageSizeResolver(image.sourceUrl, buildImageSizeResolverContext(ctx, image));
  if (!size) {
    return false;
  }

  const applyAspectRatio = (): void => {
    if (
      typeof size.aspectRatio === 'number' &&
      Number.isFinite(size.aspectRatio) &&
      size.aspectRatio > 0 &&
      typeof block.payload.width === 'number'
    ) {
      block.payload.height = Math.max(1, Math.round(block.payload.width / size.aspectRatio));
    }
  };

  const hasWidthRatio = typeof size.widthRatio === 'number';
  if (hasWidthRatio) {
    const ratio = size.widthRatio as number;
    if (Number.isFinite(ratio) && ratio > 0 && ratio <= 1) {
      const baseWidth =
        block.payload.width ??
        createDefaultImagePayload(block.parentId ? ctx.blocks[block.parentId]?.type : undefined).width ??
        0;
      const width = toPositiveRoundedWidth(baseWidth * ratio);
      if (width !== undefined) {
        block.payload.width = width;
        applyAspectRatio();
      }
      return true;
    }
    warnInvalidImageDisplaySize(
      ctx,
      `widthRatio:${image.sourceUrl}:${String(size.widthRatio)}`,
      `Ignoring invalid image widthRatio for ${image.sourceUrl}: ${String(size.widthRatio)}. Expected 0 < widthRatio <= 1.`,
    );
  }

  if (typeof size.widthPx === 'number') {
    const maximum =
      createDefaultImagePayload(block.parentId ? ctx.blocks[block.parentId]?.type : undefined).width ?? 1000;
    const width = toPositiveRoundedWidth(size.widthPx, maximum);
    if (width !== undefined) {
      block.payload.width = width;
      applyAspectRatio();
      return true;
    }
    warnInvalidImageDisplaySize(
      ctx,
      `widthPx:${image.sourceUrl}:${String(size.widthPx)}`,
      `Ignoring invalid image widthPx for ${image.sourceUrl}: ${String(size.widthPx)}. Expected widthPx > 0.`,
    );
  }
  return false;
}

function createImageBlock(
  ctx: ConversionContext,
  parentId: LASTBlockId,
  sourceUrl: string | null,
  alt: string | null = null,
  title: string | null = null,
  linkHref: string | null = null,
  displayOverride?: ImageDisplaySize & { align?: LASTAlign; fallback?: boolean },
): LASTBlockId {
  const blockId = nextBlockId(ctx);
  const parentBlock = ctx.blocks[parentId];
  const image: ImageSource = {
    sourceUrl,
    alt,
    title,
    linkHref,
  };
  const blockBase: Extract<LASTBlockNode, { type: 'image' }> = {
    id: blockId,
    type: 'image',
    parentId,
    children: [],
    payload: createDefaultImagePayload(parentBlock?.type),
  };

  const selectorAttrs: Record<string, string> = {};
  if (sourceUrl) {
    selectorAttrs.sourceUrl = sourceUrl;
  }
  if (alt) {
    selectorAttrs.alt = alt;
  }
  if (title) {
    selectorAttrs.title = title;
  }
  if (linkHref) {
    selectorAttrs.linkHref = linkHref;
  }
  if (Object.keys(selectorAttrs).length > 0) {
    blockBase.selector = { attrs: selectorAttrs };
  }

  const resolverMatched = applyImageDisplaySize(ctx, image, blockBase);
  const shouldApplyOverride = Boolean(displayOverride && (!displayOverride.fallback || !resolverMatched));
  if (shouldApplyOverride && displayOverride?.widthRatio !== undefined) {
    const ratio = displayOverride.widthRatio;
    if (Number.isFinite(ratio) && ratio > 0 && ratio <= 1) {
      const baseWidth = createDefaultImagePayload(parentBlock?.type).width ?? blockBase.payload.width ?? 0;
      blockBase.payload.width = Math.max(1, Math.round(baseWidth * ratio));
    }
  } else if (shouldApplyOverride && displayOverride?.widthPx !== undefined && displayOverride.widthPx > 0) {
    const maximum = createDefaultImagePayload(parentBlock?.type).width ?? 1000;
    blockBase.payload.width = Math.min(maximum, Math.max(1, Math.round(displayOverride.widthPx)));
  }
  if (shouldApplyOverride && displayOverride?.aspectRatio && blockBase.payload.width) {
    blockBase.payload.height = Math.max(1, Math.round(blockBase.payload.width / displayOverride.aspectRatio));
  }
  if (displayOverride?.align) blockBase.payload.align = displayOverride.align;
  addBlock(ctx, blockBase);
  return blockId;
}

function attachSemanticMeta(ctx: ConversionContext, blockId: LASTBlockId, role: string, semanticId?: string): void {
  const block = ctx.blocks[blockId];
  if (!block) return;
  block.selector = {
    ...(block.selector ?? {}),
    labels: [...(block.selector?.labels ?? []), role],
    attrs: {
      ...(block.selector?.attrs ?? {}),
      semanticRole: role,
      ...(semanticId ? { semanticId } : {}),
    },
  };
}

function normalizeCalloutColor(value: string | null): string | undefined {
  return value?.trim().toLowerCase().replaceAll('-', '_') || undefined;
}

function calloutStyleForElement(
  element: HastElement,
  footnote: boolean,
): Extract<LASTBlockNode, { type: 'callout' }>['payload'] {
  const target = footnote ? undefined : getStringProp(element, 'type');
  const defaults: Record<string, { backgroundColor: string; borderColor: string }> = {
    note: { backgroundColor: 'light_gray', borderColor: 'gray' },
    info: { backgroundColor: 'light_blue', borderColor: 'blue' },
    tip: { backgroundColor: 'light_green', borderColor: 'green' },
    warning: { backgroundColor: 'light_yellow', borderColor: 'yellow' },
    danger: { backgroundColor: 'light_red', borderColor: 'red' },
    important: { backgroundColor: 'light_purple', borderColor: 'purple' },
  };
  const style = defaults[target ?? 'note'] ?? defaults.note!;
  return {
    backgroundColor: style.backgroundColor,
    borderColor: style.borderColor,
  } as Extract<LASTBlockNode, { type: 'callout' }>['payload'];
}

function createCalloutBlock(
  ctx: ConversionContext,
  parentId: LASTBlockId,
  element: HastElement,
  footnote: boolean,
): LASTBlockId {
  const blockId = nextBlockId(ctx);
  const base = calloutStyleForElement(element, footnote);
  const footnoteTarget = ctx.semanticTarget.footnotes;
  const backgroundColor = footnote ? normalizeCalloutColor(footnoteTarget?.background_color ?? null) : undefined;
  const borderColor = footnote ? normalizeCalloutColor(footnoteTarget?.border_color ?? null) : undefined;
  addBlock(ctx, {
    id: blockId,
    type: 'callout',
    parentId,
    children: [],
    payload: {
      ...base,
      ...(backgroundColor ? { backgroundColor: backgroundColor as typeof base.backgroundColor } : {}),
      ...(borderColor ? { borderColor: borderColor as typeof base.borderColor } : {}),
      ...(footnoteTarget?.icon ? { emojiId: footnoteTarget.icon } : {}),
    },
  });
  attachSemanticMeta(
    ctx,
    blockId,
    footnote ? 'footnote' : 'callout',
    getStringProp(element, 'semanticId') ?? undefined,
  );
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

function trimBoundaryNewlinesFromInlines(inlines: LASTInlineNode[]): LASTInlineNode[] {
  const trimmed = inlines.map((inline) => ({ ...inline }));
  let start = 0;
  let end = trimmed.length;

  while (start < end) {
    const inline = trimmed[start];
    if (!inline || inline.kind !== 'text_run') break;
    const nextText = (inline.text ?? '').replace(/^(?:\r?\n)+/, '');
    if (nextText.length === 0) {
      start += 1;
      continue;
    }
    inline.text = nextText;
    break;
  }

  while (end > start) {
    const inline = trimmed[end - 1];
    if (!inline || inline.kind !== 'text_run') break;
    const nextText = (inline.text ?? '').replace(/(?:\r?\n)+$/, '');
    if (nextText.length === 0) {
      end -= 1;
      continue;
    }
    inline.text = nextText;
    break;
  }

  return mergeAdjacentTextRuns(trimmed.slice(start, end));
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
    if (node.tagName === 'a' || node.tagName === 'm2l-footnote-reference') {
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

function extractImageSourceFromElement(element: HastElement): ImageSource | null {
  if (element.tagName === 'img') {
    return {
      sourceUrl: getStringProp(element, 'src'),
      alt: getStringProp(element, 'alt'),
      title: getStringProp(element, 'title'),
      linkHref: null,
    };
  }

  if (element.tagName !== 'a') return null;
  const href = getStringProp(element, 'href');

  const meaningfulChildren = getMeaningfulChildren(getChildren(element));
  if (meaningfulChildren.length !== 1) return null;
  const only = meaningfulChildren[0];
  if (!only || !isElement(only)) return null;
  const imageSource = extractImageSourceFromElement(only);
  return imageSource ? { ...imageSource, linkHref: href } : null;
}

function findStandaloneImageInParagraph(paragraph: HastElement): ImageSource | null {
  const meaningfulChildren = getMeaningfulChildren(getChildren(paragraph));
  if (meaningfulChildren.length !== 1) return null;
  const only = meaningfulChildren[0];
  if (!only || !isElement(only)) return null;
  return extractImageSourceFromElement(only);
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
): (ImageSource & { kind: 'image' }) | { kind: 'iframe'; url: string; iframeType: LASTIframeType } | null {
  let meaningfulChildren = getMeaningfulChildren(getChildren(cell));
  if (meaningfulChildren.length !== 1) return null;
  let only = meaningfulChildren[0];
  if (only && isElement(only) && (only.tagName === 'p' || only.tagName === 'div')) {
    const nested = getMeaningfulChildren(getChildren(only));
    if (nested.length !== 1) return null;
    only = nested[0];
  }

  if (!only || !isElement(only)) return null;
  const imageSource = extractImageSourceFromElement(only);
  if (imageSource) {
    return {
      kind: 'image',
      ...imageSource,
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
        const imageId = createImageBlock(
          ctx,
          cellId,
          richItem.sourceUrl,
          richItem.alt,
          richItem.title,
          richItem.linkHref,
        );
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
  const inlines = trimBoundaryNewlinesFromInlines(parseInlineNodes(ctx, getChildren(blockquote)));

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

function hasNonWhitespaceInline(inlines: LASTInlineNode[]): boolean {
  return inlines.some((inline) => toSearchText(inline).text.trim().length > 0);
}

function convertParagraph(ctx: ConversionContext, paragraph: HastElement, parentId: LASTBlockId): LASTBlockId[] {
  const standaloneImage = findStandaloneImageInParagraph(paragraph);
  if (standaloneImage?.sourceUrl) {
    return [
      createImageBlock(
        ctx,
        parentId,
        standaloneImage.sourceUrl,
        standaloneImage.alt,
        standaloneImage.title,
        standaloneImage.linkHref,
      ),
    ];
  }

  const standaloneIframe = findStandaloneIframePayloadInParagraph(paragraph);
  if (standaloneIframe) {
    return [createIframeBlock(ctx, parentId, standaloneIframe.url, standaloneIframe.iframeType)];
  }

  const ids: LASTBlockId[] = [];
  let pendingInlineNodes: HastRootContent[] = [];
  const flushText = (): void => {
    if (pendingInlineNodes.length === 0) return;
    const inlines = parseInlineNodes(ctx, pendingInlineNodes);
    pendingInlineNodes = [];
    if (!hasNonWhitespaceInline(inlines)) return;
    ids.push(createTextualBlock(ctx, 'text', parentId, inlines));
  };

  for (const child of getChildren(paragraph)) {
    const image = isElement(child) ? extractImageSourceFromElement(child) : null;
    if (image?.sourceUrl) {
      flushText();
      ids.push(createImageBlock(ctx, parentId, image.sourceUrl, image.alt, image.title, image.linkHref));
      continue;
    }
    pendingInlineNodes.push(child);
  }

  flushText();

  if (ids.length > 0) {
    return ids;
  }

  return [createTextualBlock(ctx, 'text', parentId, parseInlineNodes(ctx, getChildren(paragraph)))];
}

function collectSemanticImages(element: HastElement): ImageSource[] {
  const images: ImageSource[] = [];
  const visit = (node: HastRootContent): void => {
    if (!isElement(node)) return;
    const image = extractImageSourceFromElement(node);
    if (image?.sourceUrl) {
      images.push(image);
      return;
    }
    for (const child of getChildren(node)) visit(child);
  };
  for (const child of getChildren(element)) visit(child);
  return images;
}

function findDirectSemanticChild(element: HastElement, tagName: string): HastElement | undefined {
  return getChildren(element).find((child): child is HastElement => isElement(child) && child.tagName === tagName);
}

function createSemanticTextBlock(
  ctx: ConversionContext,
  element: HastElement,
  parentId: LASTBlockId,
  role: string,
  semanticId?: string,
): LASTBlockId {
  const blockId = createTextualBlock(ctx, 'text', parentId, parseInlineNodes(ctx, getChildren(element)));
  attachSemanticMeta(ctx, blockId, role, semanticId);
  return blockId;
}

function parseSemanticAlign(element: HastElement): LASTAlign | undefined {
  return parseAlignValue(getStringProp(element, 'align'));
}

function semanticAnnotationIds(
  ctx: ConversionContext,
  wrapper: HastElement,
  parentId: LASTBlockId,
  semanticId: string | undefined,
): Partial<Record<'caption' | 'note' | 'source', LASTBlockId>> {
  const result: Partial<Record<'caption' | 'note' | 'source', LASTBlockId>> = {};
  for (const role of ['caption', 'note', 'source'] as const) {
    const element = findDirectSemanticChild(wrapper, `m2l-${role}`);
    if (element) result[role] = createSemanticTextBlock(ctx, element, parentId, role, semanticId);
  }
  return result;
}

function convertSemanticFigure(ctx: ConversionContext, figure: HastElement, parentId: LASTBlockId): LASTBlockId[] {
  const semanticId = getStringProp(figure, 'semanticId') ?? undefined;
  const display = parseDirectiveWidth(getStringProp(figure, 'width') ?? '');
  const fallbackRatio = ctx.semanticTarget.figures?.default_width_ratio;
  const effectiveDisplay =
    display ??
    (typeof fallbackRatio === 'number' && fallbackRatio > 0 && fallbackRatio <= 1
      ? { widthRatio: fallbackRatio, fallback: true }
      : undefined);
  const align = parseSemanticAlign(figure);
  const imageIds = collectSemanticImages(figure).map((image) => {
    const imageId = createImageBlock(ctx, parentId, image.sourceUrl, image.alt, image.title, image.linkHref, {
      ...(effectiveDisplay ?? {}),
      ...(align ? { align } : {}),
    });
    attachSemanticMeta(ctx, imageId, 'figure-image', semanticId);
    return imageId;
  });
  const annotations = semanticAnnotationIds(ctx, figure, parentId, semanticId);
  const target = ctx.semanticTarget.figures;
  const ids: LASTBlockId[] = [];
  if (target?.caption_position === 'above' && annotations.caption) ids.push(annotations.caption);
  if (target?.source_position === 'above' && annotations.source) ids.push(annotations.source);
  if (target?.note_position === 'above' && annotations.note) ids.push(annotations.note);
  ids.push(...imageIds);
  if (target?.caption_position !== 'above' && annotations.caption) ids.push(annotations.caption);
  if (target?.source_position === 'below-caption' && annotations.source) ids.push(annotations.source);
  if (target?.note_position !== 'above' && annotations.note) ids.push(annotations.note);
  if (target?.source_position !== 'above' && target?.source_position !== 'below-caption' && annotations.source) {
    ids.push(annotations.source);
  }
  return ids;
}

function convertSemanticTable(ctx: ConversionContext, wrapper: HastElement, parentId: LASTBlockId): LASTBlockId[] {
  const semanticId = getStringProp(wrapper, 'semanticId') ?? undefined;
  const table = getChildren(wrapper).find(
    (child): child is HastElement => isElement(child) && child.tagName === 'table',
  );
  const annotations = semanticAnnotationIds(ctx, wrapper, parentId, semanticId);
  const tableIds = table ? convertTable(ctx, table, parentId) : [];
  for (const tableId of tableIds) attachSemanticMeta(ctx, tableId, 'semantic-table', semanticId);
  const target = ctx.semanticTarget.tables;
  const ids: LASTBlockId[] = [];
  if (target?.caption_position !== 'below' && annotations.caption) ids.push(annotations.caption);
  if (target?.source_position === 'above' && annotations.source) ids.push(annotations.source);
  ids.push(...tableIds);
  if (target?.caption_position === 'below' && annotations.caption) ids.push(annotations.caption);
  if (annotations.note) ids.push(annotations.note);
  if (target?.source_position !== 'above' && annotations.source) ids.push(annotations.source);
  return ids;
}

function convertSemanticEquation(ctx: ConversionContext, wrapper: HastElement, parentId: LASTBlockId): LASTBlockId[] {
  const semanticId = getStringProp(wrapper, 'semanticId') ?? undefined;
  const ids: LASTBlockId[] = [];
  const equationNumber = getStringProp(wrapper, 'equationNumber');
  let numberAttached = false;
  for (const child of getChildren(wrapper)) {
    if (isElement(child) && ['m2l-caption', 'm2l-note', 'm2l-source'].includes(child.tagName)) continue;
    for (const blockId of convertBlock(ctx, child, parentId)) {
      attachSemanticMeta(ctx, blockId, 'equation', semanticId);
      const block = ctx.blocks[blockId];
      if (equationNumber && !numberAttached && block && isTextualBlockNode(block)) {
        block.payload.inlines.push({
          id: nextInlineId(ctx),
          kind: 'text_run',
          marks: createDefaultMarks(),
          text: ` (${equationNumber})`,
        });
        numberAttached = true;
      }
      ids.push(blockId);
    }
  }
  const annotations = semanticAnnotationIds(ctx, wrapper, parentId, semanticId);
  if (annotations.caption) ids.push(annotations.caption);
  if (annotations.note) ids.push(annotations.note);
  if (annotations.source) ids.push(annotations.source);
  return ids;
}

function prependFootnoteLabel(ctx: ConversionContext, blockId: LASTBlockId, label: string): void {
  const block = ctx.blocks[blockId];
  if (!block || !isTextualBlockNode(block)) return;
  block.payload.inlines.unshift({
    id: nextInlineId(ctx),
    kind: 'text_run',
    marks: { ...createDefaultMarks(), bold: true },
    text: `[${label}] `,
  });
}

function convertSemanticCallout(
  ctx: ConversionContext,
  element: HastElement,
  parentId: LASTBlockId,
  footnote: boolean,
): LASTBlockId[] {
  const output: LASTBlockId[] = [];
  let calloutId = createCalloutBlock(ctx, parentId, element, footnote);
  output.push(calloutId);
  let firstText = true;
  const appendConverted = (blockId: LASTBlockId): void => {
    const block = ctx.blocks[blockId];
    if (!block) return;
    if (block.type === 'image' || block.type === 'table' || block.type === 'file' || block.type === 'board') {
      block.parentId = parentId;
      attachSemanticMeta(
        ctx,
        blockId,
        footnote ? 'footnote-media-sibling' : 'callout-media-sibling',
        getStringProp(element, 'semanticId') ?? undefined,
      );
      output.push(blockId);
      calloutId = createCalloutBlock(ctx, parentId, element, footnote);
      output.push(calloutId);
      return;
    }
    const callout = ctx.blocks[calloutId];
    if (!callout || callout.type !== 'callout') return;
    block.parentId = calloutId;
    appendChild(callout, blockId);
    if (footnote && firstText && isTextualBlockNode(block)) {
      prependFootnoteLabel(ctx, blockId, getStringProp(element, 'semanticId') ?? '?');
      firstText = false;
    }
  };
  for (const child of getChildren(element)) {
    const current = ctx.blocks[calloutId];
    if (!current || current.type !== 'callout') continue;
    for (const blockId of convertBlock(ctx, child, calloutId)) appendConverted(blockId);
  }
  for (const blockId of [...output]) {
    const block = ctx.blocks[blockId];
    if (block?.type === 'callout' && block.children.length === 0) {
      delete ctx.blocks[blockId];
      output.splice(output.indexOf(blockId), 1);
    }
  }
  return output;
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
    case 'p':
      return convertParagraph(ctx, node, parentId);
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
    case 'm2l-figure':
      return convertSemanticFigure(ctx, node, parentId);
    case 'm2l-table':
      return convertSemanticTable(ctx, node, parentId);
    case 'm2l-equation':
      return convertSemanticEquation(ctx, node, parentId);
    case 'm2l-callout':
      return convertSemanticCallout(ctx, node, parentId, false);
    case 'm2l-footnote':
      return convertSemanticCallout(ctx, node, parentId, true);
    case 'm2l-unknown-directive':
    case 'm2l-caption':
    case 'm2l-note':
    case 'm2l-source':
      return convertUnknownElement(ctx, node, parentId);
    case 'img':
      return [
        createImageBlock(
          ctx,
          parentId,
          getStringProp(node, 'src'),
          getStringProp(node, 'alt'),
          getStringProp(node, 'title'),
        ),
      ];
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
  const ctx = createContext(options);
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
