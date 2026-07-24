import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import type { Root as HastRoot } from 'hast';
import { normalizeMarkdownBeforeParse } from './normalize-markdown.js';
import { remarkMarkToHast } from './remark-mark.js';

export interface MarkdownToHastOptions {
  singleDollarTextMath?: boolean;
}

export async function markdownToHast(markdown: string, options: MarkdownToHastOptions = {}): Promise<HastRoot> {
  const content = normalizeMarkdownBeforeParse(markdown);
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath, { singleDollarTextMath: options.singleDollarTextMath ?? false })
    .use(remarkMarkToHast)
    .use(remarkRehype, { allowDangerousHtml: false });

  const mdast = processor.parse(content);
  const hast = await processor.run(mdast);
  return hast as HastRoot;
}
