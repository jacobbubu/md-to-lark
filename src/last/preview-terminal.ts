import type {
  LASTBlockId,
  LASTBlockNode,
  LASTInlineNode,
  LASTModel,
  LASTTextualBlock,
  LASTTextualBlockType,
} from './types.js';
import { LAST_TEXTUAL_BLOCK_TYPE_SET } from './textual-block-types.js';

export interface LASTTerminalRenderOptions {
  color?: boolean;
  showTypeTag?: boolean;
  showBlockId?: boolean;
  sectionGapLines?: number;
}

interface RenderContext {
  model: LASTModel;
  options: Required<LASTTerminalRenderOptions>;
  lines: string[];
}

interface ChildRenderMeta {
  depth: number;
  orderedNumber?: number;
}

const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  italic: '\u001b[3m',
  underline: '\u001b[4m',
  strike: '\u001b[9m',
  inverse: '\u001b[7m',
  dim: '\u001b[2m',
  blue: '\u001b[34m',
  cyan: '\u001b[36m',
  magenta: '\u001b[35m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  gray: '\u001b[90m',
};

const INLINE_COLOR_TO_ANSI: Readonly<Record<string, string>> = {
  light_pink: ANSI.magenta,
  light_orange: ANSI.yellow,
  light_yellow: ANSI.yellow,
  light_green: ANSI.green,
  light_blue: ANSI.blue,
  light_purple: ANSI.magenta,
  light_gray: ANSI.gray,
  dark_pink: ANSI.magenta,
  dark_orange: ANSI.yellow,
  dark_yellow: ANSI.yellow,
  dark_green: ANSI.green,
  dark_blue: ANSI.blue,
  dark_purple: ANSI.magenta,
  dark_gray: ANSI.gray,
  dark_silver_gray: ANSI.gray,
};

function isTextualBlock(block: LASTBlockNode): block is LASTTextualBlock<LASTTextualBlockType> {
  return LAST_TEXTUAL_BLOCK_TYPE_SET.has(block.type as LASTTextualBlockType);
}

function withAnsi(enabled: boolean, text: string, ...codes: Array<string | undefined>): string {
  if (!enabled || text.length === 0) return text;
  const starts = codes.filter((x): x is string => Boolean(x));
  if (starts.length === 0) return text;
  return `${starts.join('')}${text}${ANSI.reset}`;
}

function blockTypeTag(ctx: RenderContext, block: LASTBlockNode): string {
  if (!ctx.options.showTypeTag) return '';
  return withAnsi(ctx.options.color, `[${block.type}]`, ANSI.dim);
}

function blockIdTag(ctx: RenderContext, block: LASTBlockNode): string {
  if (!ctx.options.showBlockId) return '';
  return withAnsi(ctx.options.color, `(${block.id})`, ANSI.gray);
}

function inlineToText(ctx: RenderContext, inline: LASTInlineNode): string {
  const colorEnabled = ctx.options.color;

  const applyTextRunStyle = (text: string): string => {
    const marks = inline.marks;
    const textColor = marks.textColor ? INLINE_COLOR_TO_ANSI[marks.textColor] : undefined;
    const decorated = withAnsi(
      colorEnabled,
      text,
      marks.bold ? ANSI.bold : undefined,
      marks.italic ? ANSI.italic : undefined,
      marks.underline ? ANSI.underline : undefined,
      marks.strikethrough ? ANSI.strike : undefined,
      marks.inlineCode ? ANSI.inverse : undefined,
      textColor,
    );

    if (marks.link?.url) {
      return `${decorated}${withAnsi(colorEnabled, `(${marks.link.url})`, ANSI.blue, ANSI.underline)}`;
    }
    return decorated;
  };

  switch (inline.kind) {
    case 'text_run':
      return applyTextRunStyle(inline.text ?? '');
    case 'mention_user':
      return withAnsi(colorEnabled, `@${inline.userId ?? 'unknown'}`, ANSI.cyan);
    case 'equation':
      return withAnsi(colorEnabled, `$${inline.latex ?? ''}$`, ANSI.magenta);
    case 'mention_doc': {
      const title = inline.title ?? inline.token ?? 'doc';
      const suffix = inline.url ? `(${inline.url})` : '';
      return withAnsi(colorEnabled, `[doc:${title}]${suffix}`, ANSI.blue, ANSI.underline);
    }
    case 'reminder': {
      const expire = inline.expireTime ? `@${inline.expireTime}` : '';
      return withAnsi(colorEnabled, `[reminder${expire}]`, ANSI.yellow);
    }
    case 'inline_block':
      return withAnsi(colorEnabled, `[inline:${inline.blockId ?? 'block'}]`, ANSI.dim);
    case 'inline_file':
      return withAnsi(colorEnabled, `[file:${inline.fileToken ?? 'token'}]`, ANSI.dim);
    case 'link_preview': {
      const text = inline.title ?? inline.url ?? 'link_preview';
      return withAnsi(colorEnabled, `[link:${text}]`, ANSI.blue, ANSI.underline);
    }
    default:
      return '';
  }
}

function textualBlockText(ctx: RenderContext, block: LASTTextualBlock<LASTTextualBlockType>): string {
  return block.payload.inlines.map((inline) => inlineToText(ctx, inline)).join('');
}

function indent(depth: number): string {
  return '  '.repeat(Math.max(0, depth));
}

function pushLine(ctx: RenderContext, line = ''): void {
  ctx.lines.push(line);
}

function renderTextualBlock(
  ctx: RenderContext,
  block: LASTTextualBlock<LASTTextualBlockType>,
  meta: ChildRenderMeta,
): void {
  const gap = `${blockTypeTag(ctx, block)} ${blockIdTag(ctx, block)}`.trim();
  const suffix = gap.length > 0 ? ` ${gap}` : '';
  const text = textualBlockText(ctx, block);
  const baseIndent = indent(meta.depth);

  const headingLevelMap: Partial<Record<LASTTextualBlockType, number>> = {
    heading1: 1,
    heading2: 2,
    heading3: 3,
    heading4: 4,
    heading5: 5,
    heading6: 6,
    heading7: 7,
    heading8: 8,
    heading9: 9,
  };

  if (block.type === 'page') {
    if (text.trim().length > 0) {
      pushLine(ctx, `${withAnsi(ctx.options.color, text, ANSI.bold)}${suffix}`);
      if (ctx.options.sectionGapLines > 0) {
        for (let i = 0; i < ctx.options.sectionGapLines; i += 1) {
          pushLine(ctx, '');
        }
      }
    }
    return;
  }

  if (block.type === 'text') {
    pushLine(ctx, `${baseIndent}${text}${suffix}`);
    return;
  }

  const headingLevel = headingLevelMap[block.type];
  if (headingLevel) {
    const hashes = '#'.repeat(headingLevel);
    pushLine(ctx, `${baseIndent}${withAnsi(ctx.options.color, `${hashes} ${text}`, ANSI.bold)}${suffix}`);
    return;
  }

  if (block.type === 'bullet') {
    pushLine(ctx, `${baseIndent}• ${text}${suffix}`);
    return;
  }

  if (block.type === 'ordered') {
    const n = meta.orderedNumber ?? 1;
    pushLine(ctx, `${baseIndent}${n}. ${text}${suffix}`);
    return;
  }

  if (block.type === 'quote') {
    pushLine(ctx, `${baseIndent}> ${text}${suffix}`);
    return;
  }

  if (block.type === 'todo') {
    const done = block.payload.style.done === true;
    const marker = done ? '[x]' : '[ ]';
    pushLine(ctx, `${baseIndent}${marker} ${text}${suffix}`);
    return;
  }

  if (block.type === 'code') {
    const lang = block.payload.style.language ?? 'text';
    const header = withAnsi(ctx.options.color, `\`\`\`${lang}`, ANSI.dim);
    pushLine(ctx, `${baseIndent}${header}${suffix}`);
    pushLine(ctx, `${baseIndent}${text}`);
    pushLine(ctx, `${baseIndent}${withAnsi(ctx.options.color, '\`\`\`', ANSI.dim)}`);
    return;
  }

  pushLine(ctx, `${baseIndent}${text}${suffix}`);
}

function renderContainerPlaceholder(ctx: RenderContext, block: LASTBlockNode, depth: number): void {
  const prefix = indent(depth);
  const info = [`[${block.type}]`];

  if ('payload' in block) {
    if (block.type === 'image' || block.type === 'board') {
      const token = block.payload.token ?? 'no-token';
      const width = block.payload.width ?? 0;
      const height = block.payload.height ?? 0;
      info.push(`token=${token}`);
      if (width > 0 && height > 0) {
        info.push(`${width}x${height}`);
      }
    }

    if (block.type === 'table') {
      const rows = block.payload.rowSize ?? 0;
      const cols = block.payload.columnSize ?? 0;
      info.push(`rows=${rows}`);
      info.push(`cols=${cols}`);
    }

    if (block.type === 'grid') {
      info.push(`columns=${block.payload.columnSize ?? 0}`);
    }

    if (block.type === 'grid_column') {
      info.push(`widthRatio=${block.payload.widthRatio ?? 0}`);
    }
  }

  const tags = [blockTypeTag(ctx, block), blockIdTag(ctx, block)].filter((x) => x.length > 0).join(' ');
  const tail = tags.length > 0 ? ` ${tags}` : '';
  pushLine(ctx, `${prefix}${withAnsi(ctx.options.color, info.join(' '), ANSI.dim)}${tail}`);
}

function renderBlock(ctx: RenderContext, blockId: LASTBlockId, meta: ChildRenderMeta): void {
  const block = ctx.model.blocks[blockId];
  if (!block) {
    pushLine(ctx, `${indent(meta.depth)}${withAnsi(ctx.options.color, `[missing:${blockId}]`, ANSI.red)}`);
    return;
  }

  if (isTextualBlock(block)) {
    renderTextualBlock(ctx, block, meta);
  } else {
    renderContainerPlaceholder(ctx, block, meta.depth);
  }

  if (block.children.length === 0) {
    return;
  }

  let orderedCounter = 1;
  for (const childId of block.children) {
    const child = ctx.model.blocks[childId];
    let orderedNumber: number | undefined;

    if (child?.type === 'ordered') {
      orderedNumber = orderedCounter;
      orderedCounter += 1;
    } else {
      orderedCounter = 1;
    }

    const childDepth = block.type === 'bullet' || block.type === 'ordered' ? meta.depth + 1 : meta.depth;
    renderBlock(ctx, childId, {
      depth: childDepth,
      ...(orderedNumber !== undefined ? { orderedNumber } : {}),
    });
  }
}

function topLevelIds(model: LASTModel): LASTBlockId[] {
  if ('mode' in model && model.mode === 'fragment') {
    return [...model.topLevel];
  }
  const root = model.blocks[model.rootId];
  if (!root) return [];
  return [...root.children];
}

export function renderLASTToTerminal(model: LASTModel, options: LASTTerminalRenderOptions = {}): string {
  const ctx: RenderContext = {
    model,
    options: {
      color: options.color ?? true,
      showTypeTag: options.showTypeTag ?? false,
      showBlockId: options.showBlockId ?? false,
      sectionGapLines: options.sectionGapLines ?? 1,
    },
    lines: [],
  };

  const headerMode = 'mode' in model && model.mode === 'fragment' ? 'fragment' : 'document';
  const rootLabel =
    headerMode === 'document'
      ? `root=${(model as Exclude<LASTModel, { mode: 'fragment' }>).rootId}`
      : `topLevel=${(model as Extract<LASTModel, { mode: 'fragment' }>).topLevel.length}`;

  pushLine(
    ctx,
    withAnsi(
      ctx.options.color,
      `LAST Terminal Preview | ${headerMode} | blocks=${Object.keys(model.blocks).length} | ${rootLabel}`,
      ANSI.dim,
    ),
  );
  pushLine(ctx, '');

  if (headerMode === 'document') {
    const doc = model as Exclude<LASTModel, { mode: 'fragment' }>;
    const root = doc.blocks[doc.rootId];
    if (root && isTextualBlock(root)) {
      renderTextualBlock(ctx, root, { depth: 0 });
      if (ctx.options.sectionGapLines > 0) {
        for (let i = 0; i < ctx.options.sectionGapLines; i += 1) {
          pushLine(ctx, '');
        }
      }
    }
  }

  let orderedCounter = 1;
  for (const blockId of topLevelIds(model)) {
    const block = model.blocks[blockId];
    let orderedNumber: number | undefined;
    if (block?.type === 'ordered') {
      orderedNumber = orderedCounter;
      orderedCounter += 1;
    } else {
      orderedCounter = 1;
    }

    renderBlock(ctx, blockId, {
      depth: 0,
      ...(orderedNumber !== undefined ? { orderedNumber } : {}),
    });

    if (ctx.options.sectionGapLines > 0) {
      for (let i = 0; i < ctx.options.sectionGapLines; i += 1) {
        pushLine(ctx, '');
      }
    }
  }

  while (ctx.lines.length > 0 && ctx.lines[ctx.lines.length - 1]?.trim() === '') {
    ctx.lines.pop();
  }

  return `${ctx.lines.join('\n')}\n`;
}
