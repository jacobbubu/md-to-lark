import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';

const LEADING_FRONTMATTER_RE =
  /^((?:[ \t]*\r?\n)*)(-{3}|\+{3})[ \t]*\r?\n([\s\S]*?)\r?\n(?:-{3}|\+{3}|\.{3})[ \t]*(?:\r?\n|$)/;
const CHINESE_CONTEXT_DOUBLE_QUOTES_RE = /"([^"\r\n]*\p{Script=Han}[^"\r\n]*)"/gu;

interface TextEdit {
  start: number;
  end: number;
  text: string;
}

interface OffsetRange {
  start: number;
  end: number;
}

function getLeadingFrontmatterRange(markdown: string): OffsetRange | null {
  const hasBom = markdown.startsWith('\uFEFF');
  const source = hasBom ? markdown.slice(1) : markdown;
  const match = source.match(LEADING_FRONTMATTER_RE);
  if (!match || !match[0]) return null;
  return {
    start: 0,
    end: match[0].length + (hasBom ? 1 : 0),
  };
}

function overlaps(range: OffsetRange, other: OffsetRange): boolean {
  return range.start < other.end && other.start < range.end;
}

function replaceChineseContextDoubleQuotes(text: string): string {
  return text.replace(CHINESE_CONTEXT_DOUBLE_QUOTES_RE, '“$1”');
}

function applyTextEdits(markdown: string, edits: TextEdit[]): string {
  if (edits.length === 0) return markdown;

  let next = markdown;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    next = `${next.slice(0, edit.start)}${edit.text}${next.slice(edit.end)}`;
  }
  return next;
}

export function rewriteChineseSmartQuotes(markdown: string): string {
  const frontmatterRange = getLeadingFrontmatterRange(markdown);
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown);
  const edits: TextEdit[] = [];

  visit(tree, 'text', (node: any) => {
    if (typeof node?.value !== 'string') return;
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (typeof start !== 'number' || typeof end !== 'number' || end <= start) return;

    const sourceRange = { start, end };
    if (frontmatterRange && overlaps(sourceRange, frontmatterRange)) {
      return;
    }

    const rewritten = replaceChineseContextDoubleQuotes(node.value);
    if (rewritten === node.value) return;

    edits.push({
      start,
      end,
      text: rewritten,
    });
  });

  return applyTextEdits(markdown, edits);
}
