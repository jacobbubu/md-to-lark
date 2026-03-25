import type { Element, Parent, Root, RootContent, Text } from 'hast';
import { markdownToHast } from '../pipeline/markdown/md-to-hast.js';

export interface MarkdownTerminalRenderOptions {
  color?: boolean;
  sectionGapLines?: number;
  showHeader?: boolean;
}

interface RenderContext {
  options: Required<MarkdownTerminalRenderOptions>;
  lines: string[];
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
  red: '\u001b[31m',
};

function withAnsi(enabled: boolean, text: string, ...codes: Array<string | undefined>): string {
  if (!enabled || text.length === 0) return text;
  const start = codes.filter((x): x is string => Boolean(x));
  if (start.length === 0) return text;
  return `${start.join('')}${text}${ANSI.reset}`;
}

function isElement(node: RootContent | Root, tagName?: string): node is Element {
  if (node.type !== 'element') return false;
  if (!tagName) return true;
  return node.tagName === tagName;
}

function asChildren(node: Parent): RootContent[] {
  return [...node.children] as RootContent[];
}

function toText(node: RootContent): string {
  if (node.type === 'text') {
    return (node as Text).value;
  }

  if (!isElement(node)) {
    return '';
  }

  const children = asChildren(node);
  return children.map((child) => toText(child)).join('');
}

function getClassNames(element: Element): string[] {
  const raw = element.properties?.className;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item));
  }
  if (typeof raw === 'string') {
    return raw.split(/\s+/).filter((x) => x.length > 0);
  }
  return [];
}

function parseCodeLanguage(codeElement: Element): string {
  const classNames = getClassNames(codeElement);
  for (const name of classNames) {
    if (name.startsWith('language-') && name.length > 'language-'.length) {
      return name.slice('language-'.length);
    }
  }
  return 'text';
}

function renderInline(node: RootContent, ctx: RenderContext): string {
  if (node.type === 'text') {
    return (node as Text).value;
  }

  if (!isElement(node)) {
    return '';
  }

  const childrenText = asChildren(node)
    .map((child) => renderInline(child, ctx))
    .join('');

  if (node.tagName === 'strong') {
    return withAnsi(ctx.options.color, childrenText, ANSI.bold);
  }

  if (node.tagName === 'em') {
    return withAnsi(ctx.options.color, childrenText, ANSI.italic);
  }

  if (node.tagName === 'del') {
    return withAnsi(ctx.options.color, childrenText, ANSI.strike);
  }

  if (node.tagName === 'code') {
    return withAnsi(ctx.options.color, childrenText, ANSI.inverse);
  }

  if (node.tagName === 'a') {
    const href = typeof node.properties?.href === 'string' ? node.properties.href : '';
    const text = childrenText.length > 0 ? childrenText : href;
    if (!href) {
      return text;
    }
    return `${withAnsi(ctx.options.color, text, ANSI.blue, ANSI.underline)}(${href})`;
  }

  if (node.tagName === 'br') {
    return '\n';
  }

  if (node.tagName === 'img') {
    const alt = typeof node.properties?.alt === 'string' ? node.properties.alt : '';
    const src = typeof node.properties?.src === 'string' ? node.properties.src : '';
    return withAnsi(ctx.options.color, `![${alt}](${src})`, ANSI.dim);
  }

  return childrenText;
}

function renderInlineChildren(nodes: RootContent[], ctx: RenderContext): string {
  return nodes.map((node) => renderInline(node, ctx)).join('');
}

function pushLine(ctx: RenderContext, line = ''): void {
  ctx.lines.push(line);
}

function indent(depth: number): string {
  return '  '.repeat(Math.max(0, depth));
}

function pushSectionGap(ctx: RenderContext): void {
  for (let i = 0; i < ctx.options.sectionGapLines; i += 1) {
    pushLine(ctx, '');
  }
}

function renderParagraph(element: Element, ctx: RenderContext, depth: number): void {
  const text = renderInlineChildren(asChildren(element), ctx);
  const prefix = indent(depth);
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    pushLine(ctx, `${prefix}${line}`);
  }
}

function renderHeading(element: Element, ctx: RenderContext, depth: number): void {
  const level = Number(element.tagName.slice(1));
  const marker = '#'.repeat(Math.max(1, Math.min(6, Number.isFinite(level) ? level : 1)));
  const text = renderInlineChildren(asChildren(element), ctx);
  pushLine(ctx, `${indent(depth)}${withAnsi(ctx.options.color, `${marker} ${text}`, ANSI.bold)}`);
}

function renderCodeBlock(element: Element, ctx: RenderContext, depth: number): void {
  const prefix = indent(depth);
  const code = asChildren(element).find((node): node is Element => isElement(node, 'code'));
  const language = code ? parseCodeLanguage(code) : 'text';
  const raw = code ? toText(code as unknown as RootContent) : toText(element as unknown as RootContent);

  pushLine(ctx, `${prefix}${withAnsi(ctx.options.color, `\`\`\`${language}`, ANSI.dim)}`);
  const lines = raw.replace(/\n$/, '').split('\n');
  for (const line of lines) {
    pushLine(ctx, `${prefix}${line}`);
  }
  pushLine(ctx, `${prefix}${withAnsi(ctx.options.color, '\`\`\`', ANSI.dim)}`);
}

function renderBlockquote(element: Element, ctx: RenderContext, depth: number): void {
  const temp: RenderContext = {
    options: ctx.options,
    lines: [],
  };

  for (const child of asChildren(element)) {
    renderBlock(child, temp, 0);
  }

  for (const line of temp.lines) {
    const prefix = indent(depth);
    if (line.trim().length === 0) {
      pushLine(ctx, `${prefix}>`);
    } else {
      pushLine(ctx, `${prefix}> ${line}`);
    }
  }
}

function renderTable(element: Element, ctx: RenderContext, depth: number): void {
  const rows: string[][] = [];
  let headerRows = 0;

  const appendRows = (container: Element, isHeader: boolean): void => {
    const trNodes = asChildren(container).filter((child): child is Element => isElement(child, 'tr'));
    for (const tr of trNodes) {
      const cellNodes = asChildren(tr).filter((child): child is Element => isElement(child));
      const cells = cellNodes
        .filter((cell) => cell.tagName === 'th' || cell.tagName === 'td')
        .map((cell) => renderInlineChildren(asChildren(cell), ctx));
      rows.push(cells);
      if (isHeader) {
        headerRows += 1;
      }
    }
  };

  for (const child of asChildren(element)) {
    if (!isElement(child)) continue;
    if (child.tagName === 'thead') {
      appendRows(child, true);
      continue;
    }
    if (child.tagName === 'tbody' || child.tagName === 'tfoot') {
      appendRows(child, false);
      continue;
    }
    if (child.tagName === 'tr') {
      appendRows(
        {
          type: 'element',
          tagName: 'tbody',
          properties: {},
          children: [child],
        },
        false,
      );
    }
  }

  if (rows.length === 0) {
    pushLine(ctx, `${indent(depth)}${withAnsi(ctx.options.color, '[table]', ANSI.dim)}`);
    return;
  }

  const colCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const widths = new Array<number>(colCount).fill(3);

  for (const row of rows) {
    for (let i = 0; i < colCount; i += 1) {
      const cell = row[i] ?? '';
      widths[i] = Math.max(widths[i] ?? 3, cell.length);
    }
  }

  const formatRow = (row: string[]): string => {
    const cells: string[] = [];
    for (let i = 0; i < colCount; i += 1) {
      const content = row[i] ?? '';
      const width = widths[i] ?? 3;
      cells.push(content.padEnd(width, ' '));
    }
    return `| ${cells.join(' | ')} |`;
  };

  const prefix = indent(depth);
  pushLine(ctx, `${prefix}${formatRow(rows[0] ?? [])}`);

  if (headerRows > 0 || rows.length > 1) {
    const separator = widths.map((width) => '-'.repeat(Math.max(3, width))).join(' | ');
    pushLine(ctx, `${prefix}| ${separator} |`);
  }

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    pushLine(ctx, `${prefix}${formatRow(row)}`);
  }
}

function renderListItem(li: Element, ctx: RenderContext, depth: number, marker: string): void {
  const prefix = indent(depth);
  const children = asChildren(li);

  const nestedLists = children.filter(
    (child): child is Element => isElement(child) && (child.tagName === 'ul' || child.tagName === 'ol'),
  );
  const nonNested = children.filter(
    (child) => !(isElement(child) && (child.tagName === 'ul' || child.tagName === 'ol')),
  );

  const firstParagraph = nonNested.find((child): child is Element => isElement(child, 'p'));
  const firstLine = firstParagraph
    ? renderInlineChildren(asChildren(firstParagraph), ctx)
    : renderInlineChildren(nonNested, ctx);

  pushLine(ctx, `${prefix}${marker} ${firstLine}`.trimEnd());

  const extraBlocks = nonNested.filter((child) => child !== firstParagraph);
  for (const block of extraBlocks) {
    if (!isElement(block)) continue;
    if (block.tagName === 'p') {
      renderParagraph(block, ctx, depth + 1);
    } else if (block.tagName === 'pre') {
      renderCodeBlock(block, ctx, depth + 1);
    } else if (block.tagName === 'blockquote') {
      renderBlockquote(block, ctx, depth + 1);
    }
  }

  for (const list of nestedLists) {
    renderList(list, ctx, depth + 1);
  }
}

function renderList(element: Element, ctx: RenderContext, depth: number): void {
  const isOrdered = element.tagName === 'ol';
  const rawStart = element.properties?.start;
  const start = typeof rawStart === 'number' ? rawStart : Number(rawStart ?? 1);
  let counter = Number.isFinite(start) && start > 0 ? start : 1;

  const items = asChildren(element).filter((child): child is Element => isElement(child, 'li'));
  for (const item of items) {
    const marker = isOrdered ? `${counter}.` : '•';
    renderListItem(item, ctx, depth, marker);
    if (isOrdered) {
      counter += 1;
    }
  }
}

function renderBlock(node: RootContent, ctx: RenderContext, depth: number): void {
  if (node.type === 'text') {
    const text = (node as Text).value.trim();
    if (text.length > 0) {
      pushLine(ctx, `${indent(depth)}${text}`);
    }
    return;
  }

  if (!isElement(node)) {
    return;
  }

  switch (node.tagName) {
    case 'p':
      renderParagraph(node, ctx, depth);
      break;
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      renderHeading(node, ctx, depth);
      break;
    case 'ul':
    case 'ol':
      renderList(node, ctx, depth);
      break;
    case 'pre':
      renderCodeBlock(node, ctx, depth);
      break;
    case 'blockquote':
      renderBlockquote(node, ctx, depth);
      break;
    case 'hr':
      pushLine(ctx, `${indent(depth)}${withAnsi(ctx.options.color, '---', ANSI.dim)}`);
      break;
    case 'table':
      renderTable(node, ctx, depth);
      break;
    default: {
      const inlineText = renderInlineChildren(asChildren(node), ctx);
      if (inlineText.trim().length > 0) {
        pushLine(ctx, `${indent(depth)}${inlineText}`);
      }
      break;
    }
  }
}

export function renderHASTToTerminal(root: Root, options: MarkdownTerminalRenderOptions = {}): string {
  const ctx: RenderContext = {
    options: {
      color: options.color ?? true,
      sectionGapLines: options.sectionGapLines ?? 1,
      showHeader: options.showHeader ?? true,
    },
    lines: [],
  };

  if (ctx.options.showHeader) {
    pushLine(ctx, withAnsi(ctx.options.color, 'Markdown Terminal Preview', ANSI.dim));
    pushLine(ctx, '');
  }

  const blocks = asChildren(root);
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (!block) continue;
    renderBlock(block, ctx, 0);

    if (i !== blocks.length - 1) {
      pushSectionGap(ctx);
    }
  }

  while (ctx.lines.length > 0 && ctx.lines[ctx.lines.length - 1]?.trim() === '') {
    ctx.lines.pop();
  }

  return `${ctx.lines.join('\n')}\n`;
}

export async function renderMarkdownToTerminal(
  markdown: string,
  options: MarkdownTerminalRenderOptions = {},
): Promise<string> {
  const hast = await markdownToHast(markdown);
  return renderHASTToTerminal(hast, options);
}
