import { unified } from 'unified';
import remarkParse from 'remark-parse';

const CJK_BOLD_TRAILING_PUNCTUATION = new Set(['，', '。', '；', '：', '！', '？', '、', '）', '》', '】', '」', '』']);
const NORMALIZATION_NEXT_CHAR_RE = /[\p{Script=Han}\p{Letter}\p{Number}\[]/u;
const PROTECTED_NODE_TYPES = new Set(['code', 'inlineCode', 'html']);

interface ProtectedRange {
  start: number;
  end: number;
}

interface TextEdit {
  start: number;
  end: number;
  replacement: string;
}

interface StrongRange {
  start: number;
  end: number;
}

type MarkdownTree = {
  type?: string;
  value?: unknown;
  children?: unknown[];
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
};

function parseMarkdown(markdown: string): MarkdownTree {
  return unified().use(remarkParse).parse(markdown) as MarkdownTree;
}

function mergeProtectedRanges(ranges: ProtectedRange[]): ProtectedRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: ProtectedRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) {
      merged.push({ ...range });
      continue;
    }
    if (range.end > last.end) {
      last.end = range.end;
    }
  }
  return merged;
}

function collectProtectedRanges(markdown: string): ProtectedRange[] {
  const tree = parseMarkdown(markdown);
  const ranges: ProtectedRange[] = [];

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const record = node as {
      type?: string;
      children?: unknown[];
      position?: {
        start?: { offset?: number };
        end?: { offset?: number };
      };
    };

    const start = record.position?.start?.offset;
    const end = record.position?.end?.offset;
    if (
      record.type &&
      PROTECTED_NODE_TYPES.has(record.type) &&
      typeof start === 'number' &&
      typeof end === 'number' &&
      end > start
    ) {
      ranges.push({ start, end });
      return;
    }

    for (const child of record.children ?? []) {
      visit(child);
    }
  };

  visit(tree);
  return mergeProtectedRanges(ranges);
}

function collectParsedStrongRanges(markdown: string): StrongRange[] {
  const tree = parseMarkdown(markdown);
  const ranges: StrongRange[] = [];

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const record = node as MarkdownTree;

    const start = record.position?.start?.offset;
    const end = record.position?.end?.offset;
    if (record.type === 'strong' && typeof start === 'number' && typeof end === 'number' && end > start) {
      const raw = markdown.slice(start, end);
      if (raw.startsWith('**') && raw.endsWith('**')) {
        ranges.push({ start, end });
      }
    }

    for (const child of record.children ?? []) {
      visit(child);
    }
  };

  visit(tree);
  return ranges.sort((a, b) => a.start - b.start || a.end - b.end);
}

function canDelimiterCloseCjkBoldCandidate(
  markdown: string,
  close: number,
  blockedOpeningOffsets: ReadonlySet<number>,
): boolean {
  const punctuation = markdown[close - 1] ?? '';
  const nextChar = markdown[close + 2] ?? '';
  if (!CJK_BOLD_TRAILING_PUNCTUATION.has(punctuation) || !NORMALIZATION_NEXT_CHAR_RE.test(nextChar)) {
    return false;
  }

  let searchFrom = close - 1;
  while (searchFrom >= 0) {
    const open = markdown.lastIndexOf('**', searchFrom);
    if (open === -1) return false;
    if (blockedOpeningOffsets.has(open) || (open > 0 && markdown[open - 1] === '*')) {
      searchFrom = open - 1;
      continue;
    }

    const rawContent = markdown.slice(open + 2, close);
    if (rawContent.includes('\n')) {
      return false;
    }
    if (rawContent.includes('**')) {
      searchFrom = open - 1;
      continue;
    }

    const firstContentChar = markdown[open + 2] ?? '';
    const content = markdown.slice(open + 2, close - 1);
    return Boolean(
      content &&
      firstContentChar &&
      !/\s/u.test(firstContentChar) &&
      !CJK_BOLD_TRAILING_PUNCTUATION.has(firstContentChar),
    );
  }

  return false;
}

function collectTrustedStrongClosingDelimiters(markdown: string): Set<number> {
  const trustedClosingDelimiters = new Set<number>();

  for (const range of collectParsedStrongRanges(markdown)) {
    if (canDelimiterCloseCjkBoldCandidate(markdown, range.start, trustedClosingDelimiters)) {
      continue;
    }
    trustedClosingDelimiters.add(range.end - 2);
  }

  return trustedClosingDelimiters;
}

function collectCjkBoldNormalizationEdits(
  segment: string,
  baseOffset: number,
  blockedOpeningOffsets: ReadonlySet<number>,
): TextEdit[] {
  const edits: TextEdit[] = [];
  let cursor = 0;

  while (cursor < segment.length - 1) {
    const open = segment.indexOf('**', cursor);
    if (open === -1) break;
    const absoluteOpen = baseOffset + open;
    if (blockedOpeningOffsets.has(absoluteOpen) || (open > 0 && segment[open - 1] === '*')) {
      cursor = open + 2;
      continue;
    }
    const firstContentChar = segment[open + 2] ?? '';
    if (!firstContentChar || /\s/u.test(firstContentChar) || CJK_BOLD_TRAILING_PUNCTUATION.has(firstContentChar)) {
      cursor = open + 2;
      continue;
    }

    let closeSearch = open + 2;
    let matched = false;
    while (closeSearch < segment.length - 1) {
      const close = segment.indexOf('**', closeSearch);
      if (close === -1) break;
      const rawContent = segment.slice(open + 2, close);
      if (rawContent.includes('\n')) {
        break;
      }
      if (rawContent.includes('**')) {
        closeSearch = close + 2;
        continue;
      }
      const punctuation = segment[close - 1] ?? '';
      const content = segment.slice(open + 2, close - 1);
      const nextChar = segment[close + 2] ?? '';
      if (content && CJK_BOLD_TRAILING_PUNCTUATION.has(punctuation) && NORMALIZATION_NEXT_CHAR_RE.test(nextChar)) {
        edits.push({
          start: baseOffset + open,
          end: baseOffset + close + 2,
          replacement: `**${content}**${punctuation}`,
        });
        cursor = close + 2;
        matched = true;
        break;
      }
      closeSearch = close + 2;
    }

    if (!matched) {
      cursor = open + 2;
    }
  }

  return edits;
}

function applyTextEdits(source: string, edits: TextEdit[]): string {
  if (edits.length === 0) return source;
  let output = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start || b.end - a.end)) {
    output = `${output.slice(0, edit.start)}${edit.replacement}${output.slice(edit.end)}`;
  }
  return output;
}

export function rewriteLeadingFrontmatterAsCodeFence(markdown: string): string {
  const hasBom = markdown.startsWith('\uFEFF');
  const source = hasBom ? markdown.slice(1) : markdown;
  const fmMatch = source.match(
    /^((?:[ \t]*\r?\n)*)(-{3}|\+{3})[ \t]*\r?\n([\s\S]*?)\r?\n(?:-{3}|\+{3}|\.{3})[ \t]*(?:\r?\n|$)/,
  );
  if (!fmMatch || !fmMatch[0]) return markdown;

  const leadingBlankLines = fmMatch[1] ?? '';
  const opener = fmMatch[2];
  const body = fmMatch[3] ?? '';
  const language = opener === '+++' ? 'toml' : 'yaml';
  const rest = source.slice(fmMatch[0].length);
  const normalizedBody = body.replace(/\r\n/g, '\n');
  const trailing = normalizedBody.endsWith('\n') ? '' : '\n';
  const rewritten = `${leadingBlankLines}\`\`\`${language}\n${normalizedBody}${trailing}\`\`\`\n${rest}`;
  return hasBom ? `\uFEFF${rewritten}` : rewritten;
}

export function normalizeChineseBoldClosingPunctuation(markdown: string): string {
  const protectedRanges = collectProtectedRanges(markdown);
  const trustedStrongClosingDelimiters = collectTrustedStrongClosingDelimiters(markdown);
  const edits: TextEdit[] = [];
  let cursor = 0;

  for (const range of protectedRanges) {
    if (cursor < range.start) {
      edits.push(
        ...collectCjkBoldNormalizationEdits(
          markdown.slice(cursor, range.start),
          cursor,
          trustedStrongClosingDelimiters,
        ),
      );
    }
    cursor = Math.max(cursor, range.end);
  }

  if (cursor < markdown.length) {
    edits.push(...collectCjkBoldNormalizationEdits(markdown.slice(cursor), cursor, trustedStrongClosingDelimiters));
  }

  return applyTextEdits(markdown, edits);
}

export function normalizeMarkdownBeforeParse(markdown: string): string {
  return normalizeChineseBoldClosingPunctuation(rewriteLeadingFrontmatterAsCodeFence(markdown));
}
