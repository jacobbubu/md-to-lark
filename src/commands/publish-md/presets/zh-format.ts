import { prettifyMarkdownContent } from '@jacobbubu/md-zh-format';

export async function formatChineseMarkdown(markdown: string, inputPath: string): Promise<string> {
  const result = await prettifyMarkdownContent(markdown, inputPath, {
    preserveFrontmatter: true,
    promoteHeadings: false,
  });
  return result.prettifiedContent;
}
