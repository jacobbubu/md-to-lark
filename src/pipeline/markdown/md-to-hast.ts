import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import type { Root as HastRoot } from 'hast';

// Keep leading frontmatter visible in render output while avoiding accidental
// setext-heading parsing. We re-encode it as a fenced code block.
function rewriteLeadingFrontmatterAsCodeFence(markdown: string): string {
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

export async function markdownToHast(markdown: string): Promise<HastRoot> {
  const content = rewriteLeadingFrontmatterAsCodeFence(markdown);
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: false });

  const mdast = processor.parse(content);
  const hast = await processor.run(mdast);
  return hast as HastRoot;
}
