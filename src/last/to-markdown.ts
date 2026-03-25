import type {
  LASTBlockId,
  LASTBlockNode,
  LASTModel,
  LASTTextualBlock,
  LASTTextualBlockType,
  LASTInlineNode,
  LASTTableBlock,
} from './types.js';
import { LAST_TEXTUAL_BLOCK_TYPE_SET } from './textual-block-types.js';

export interface LASTToMarkdownOptions {
  includeUnsupportedComment?: boolean;
}

interface SerializeContext {
  model: LASTModel;
  options: Required<LASTToMarkdownOptions>;
  stack: Set<LASTBlockId>;
}

function isTextual(block: LASTBlockNode): block is LASTTextualBlock<LASTTextualBlockType> {
  return LAST_TEXTUAL_BLOCK_TYPE_SET.has(block.type as LASTTextualBlockType);
}

function topLevelIds(model: LASTModel): LASTBlockId[] {
  if ('mode' in model && model.mode === 'fragment') {
    return [...model.topLevel];
  }

  const root = model.blocks[model.rootId];
  if (!root) return [];
  return [...root.children];
}

function escapeTextForMarkdown(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/([*_\[\]~`])/g, '\\$1');
}

function escapeCodeInline(text: string): string {
  return text.replace(/`/g, '\\`');
}

function applyInlineMarks(inline: LASTInlineNode, base: string): string {
  let value = base;
  const marks = inline.marks;

  if (marks.inlineCode) {
    value = `\`${escapeCodeInline(value)}\``;
  } else {
    if (marks.strikethrough) {
      value = `~~${value}~~`;
    }
    if (marks.bold) {
      value = `**${value}**`;
    }
    if (marks.italic) {
      value = `*${value}*`;
    }
    if (marks.underline) {
      value = `<u>${value}</u>`;
    }
  }

  if (marks.link?.url) {
    const label = value.length > 0 ? value : marks.link.url;
    value = `[${label}](${marks.link.url})`;
  }

  return value;
}

function inlineToMarkdown(inline: LASTInlineNode): string {
  switch (inline.kind) {
    case 'text_run': {
      const text = inline.text ?? '';
      return applyInlineMarks(inline, escapeTextForMarkdown(text));
    }
    case 'mention_user': {
      return applyInlineMarks(inline, `@${inline.userId ?? 'user'}`);
    }
    case 'equation': {
      return applyInlineMarks(inline, `$${inline.latex ?? ''}$`);
    }
    case 'mention_doc': {
      const title = inline.title ?? inline.token ?? 'doc';
      const text = inline.url ? `[${title}](${inline.url})` : `[doc:${title}]`;
      return applyInlineMarks(inline, text);
    }
    case 'reminder': {
      const part = inline.expireTime ? `@${inline.expireTime}` : '';
      return applyInlineMarks(inline, `[reminder${part}]`);
    }
    case 'inline_block': {
      return applyInlineMarks(inline, `[inline:${inline.blockId ?? 'block'}]`);
    }
    case 'inline_file': {
      return applyInlineMarks(inline, `[file:${inline.fileToken ?? 'token'}]`);
    }
    case 'link_preview': {
      const text = inline.title ?? inline.url ?? 'link_preview';
      return applyInlineMarks(inline, inline.url ? `[${text}](${inline.url})` : text);
    }
    default:
      return '';
  }
}

function textualInlinesToMarkdown(block: LASTTextualBlock<LASTTextualBlockType>): string {
  return block.payload.inlines.map((inline) => inlineToMarkdown(inline)).join('');
}

function renderCodeBlock(block: LASTTextualBlock<'code'>, indent: string): string[] {
  const lang = block.payload.style.language ?? 'text';
  const raw = block.payload.inlines
    .map((inline) => {
      if (inline.kind === 'text_run') {
        return inline.text ?? '';
      }
      return '';
    })
    .join('');
  const lines = raw.replace(/\n$/, '').split('\n');

  const out: string[] = [];
  out.push(`${indent}\`\`\`${lang}`);
  for (const line of lines) {
    out.push(`${indent}${line}`);
  }
  out.push(`${indent}\`\`\``);
  return out;
}

function tableCellText(ctx: SerializeContext, cellId: LASTBlockId): string {
  const cell = ctx.model.blocks[cellId];
  if (!cell) return '';

  const firstTextual = cell.children
    .map((childId) => ctx.model.blocks[childId])
    .find((child): child is LASTTextualBlock<LASTTextualBlockType> => Boolean(child && isTextual(child)));

  if (!firstTextual) {
    return '';
  }

  return textualInlinesToMarkdown(firstTextual).replace(/\n+/g, ' ').trim();
}

function renderTable(ctx: SerializeContext, block: LASTTableBlock, indent: string): string[] {
  const rowSize = block.payload.rowSize ?? 0;
  const columnSize = block.payload.columnSize ?? 0;
  if (rowSize <= 0 || columnSize <= 0) {
    return [`${indent}| table |`, `${indent}| --- |`];
  }

  const cells = block.payload.cells && block.payload.cells.length > 0 ? block.payload.cells : block.children;

  const matrix: string[][] = [];
  for (let r = 0; r < rowSize; r += 1) {
    const row: string[] = [];
    for (let c = 0; c < columnSize; c += 1) {
      const index = r * columnSize + c;
      const cellId = cells[index];
      row.push(cellId ? tableCellText(ctx, cellId) : '');
    }
    matrix.push(row);
  }

  if (matrix.length === 0) {
    return [`${indent}| table |`, `${indent}| --- |`];
  }

  const out: string[] = [];
  out.push(`${indent}| ${(matrix[0] ?? []).join(' | ')} |`);
  out.push(`${indent}| ${new Array(columnSize).fill('---').join(' | ')} |`);

  for (let i = 1; i < matrix.length; i += 1) {
    const row = matrix[i];
    if (!row) continue;
    out.push(`${indent}| ${row.join(' | ')} |`);
  }

  return out;
}

function renderUnsupportedBlock(block: LASTBlockNode, indent: string, includeUnsupportedComment: boolean): string[] {
  if (!includeUnsupportedComment) {
    return [];
  }
  return [`${indent}<!-- unsupported:${block.type}:${block.id} -->`];
}

function renderNestedChildren(
  ctx: SerializeContext,
  block: LASTBlockNode,
  depth: number,
  inListItem: boolean,
): string[] {
  const lines: string[] = [];

  let orderedCounter = 1;
  for (const childId of block.children) {
    const child = ctx.model.blocks[childId];
    if (!child) continue;

    let number: number | undefined;
    if (child.type === 'ordered') {
      number = orderedCounter;
      orderedCounter += 1;
    } else {
      orderedCounter = 1;
    }

    const childDepth = inListItem ? depth + 1 : depth;
    lines.push(...renderBlock(ctx, child, childDepth, number));
  }

  return lines;
}

function renderTextualBlock(
  ctx: SerializeContext,
  block: LASTTextualBlock<LASTTextualBlockType>,
  depth: number,
  orderedNumber?: number,
): string[] {
  const indent = '  '.repeat(Math.max(0, depth));
  const text = textualInlinesToMarkdown(block);

  switch (block.type) {
    case 'page':
      return text.trim().length > 0 ? [`${text}`] : [];
    case 'text': {
      const lines = text.split('\n');
      return lines.map((line) => `${indent}${line}`);
    }
    case 'heading1':
    case 'heading2':
    case 'heading3':
    case 'heading4':
    case 'heading5':
    case 'heading6':
    case 'heading7':
    case 'heading8':
    case 'heading9': {
      const levelRaw = Number(block.type.replace('heading', ''));
      const level = Number.isFinite(levelRaw) ? Math.max(1, Math.min(6, levelRaw)) : 1;
      return [`${indent}${'#'.repeat(level)} ${text}`.trimEnd()];
    }
    case 'bullet': {
      const first = `${indent}- ${text}`.trimEnd();
      const children = renderNestedChildren(ctx, block, depth, true);
      return [first, ...children];
    }
    case 'ordered': {
      const number = orderedNumber ?? 1;
      const first = `${indent}${number}. ${text}`.trimEnd();
      const children = renderNestedChildren(ctx, block, depth, true);
      return [first, ...children];
    }
    case 'todo': {
      const done = block.payload.style.done === true ? 'x' : ' ';
      const first = `${indent}- [${done}] ${text}`.trimEnd();
      const children = renderNestedChildren(ctx, block, depth, true);
      return [first, ...children];
    }
    case 'quote': {
      const quoteLines = text.split('\n').map((line) => `${indent}> ${line}`.trimEnd());
      const childLines = renderNestedChildren(ctx, block, depth, false).map((line) => `${indent}> ${line}`);
      return [...quoteLines, ...childLines];
    }
    case 'code': {
      return renderCodeBlock(block as LASTTextualBlock<'code'>, indent);
    }
    default:
      return [`${indent}${text}`.trimEnd()];
  }
}

function renderBlock(ctx: SerializeContext, block: LASTBlockNode, depth: number, orderedNumber?: number): string[] {
  if (ctx.stack.has(block.id)) {
    return [`${'  '.repeat(Math.max(0, depth))}<!-- cycle:${block.id} -->`];
  }
  ctx.stack.add(block.id);

  let lines: string[] = [];
  if (isTextual(block)) {
    lines = renderTextualBlock(ctx, block, depth, orderedNumber);
  } else if (block.type === 'table') {
    lines = renderTable(ctx, block as LASTTableBlock, '  '.repeat(Math.max(0, depth)));
  } else if (block.type === 'divider') {
    lines = [`${'  '.repeat(Math.max(0, depth))}---`];
  } else if (block.type === 'quote_container') {
    lines = renderNestedChildren(ctx, block, depth, false).map((line) => `${'  '.repeat(Math.max(0, depth))}> ${line}`);
  } else {
    lines = renderUnsupportedBlock(block, '  '.repeat(Math.max(0, depth)), ctx.options.includeUnsupportedComment);

    const childLines = renderNestedChildren(ctx, block, depth, false);
    if (childLines.length > 0) {
      lines.push(...childLines);
    }
  }

  ctx.stack.delete(block.id);
  return lines;
}

function normalizeBlankLines(lines: string[]): string[] {
  const out: string[] = [];
  let prevBlank = true;

  for (const line of lines) {
    const isBlank = line.trim().length === 0;
    if (isBlank && prevBlank) {
      continue;
    }
    out.push(line);
    prevBlank = isBlank;
  }

  while (out.length > 0 && out[0]?.trim().length === 0) {
    out.shift();
  }
  while (out.length > 0 && out[out.length - 1]?.trim().length === 0) {
    out.pop();
  }

  return out;
}

export function serializeLASTToMarkdown(model: LASTModel, options: LASTToMarkdownOptions = {}): string {
  const ctx: SerializeContext = {
    model,
    options: {
      includeUnsupportedComment: options.includeUnsupportedComment ?? true,
    },
    stack: new Set<LASTBlockId>(),
  };

  const lines: string[] = [];
  let orderedCounter = 1;

  for (const blockId of topLevelIds(model)) {
    const block = model.blocks[blockId];
    if (!block) continue;

    let number: number | undefined;
    if (block.type === 'ordered') {
      number = orderedCounter;
      orderedCounter += 1;
    } else {
      orderedCounter = 1;
    }

    const chunk = renderBlock(ctx, block, 0, number);
    if (chunk.length > 0) {
      if (lines.length > 0) {
        lines.push('');
      }
      lines.push(...chunk);
    }
  }

  const normalized = normalizeBlankLines(lines);
  return `${normalized.join('\n')}\n`;
}
