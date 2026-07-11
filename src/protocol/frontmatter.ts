import { unified } from 'unified';
import remarkFrontmatter from 'remark-frontmatter';
import remarkParse from 'remark-parse';
import { parse as parseYaml } from 'yaml';
import type { ArticleRenderFrontmatter, ParsedArticleFrontmatter } from './types.js';

interface PositionedNode {
  type?: string;
  value?: unknown;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseArticleRender(value: unknown): ArticleRenderFrontmatter | null {
  const record = toRecord(value);
  if (!record) return null;
  const contractsRaw = toRecord(record.contracts);
  const contracts = contractsRaw
    ? Object.fromEntries(
        Object.entries(contractsRaw)
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
          .map(([key, path]) => [key, path.trim()]),
      )
    : undefined;
  return {
    ...(typeof record.protocol === 'string' ? { protocol: record.protocol.trim() } : {}),
    ...(contracts && Object.keys(contracts).length > 0 ? { contracts } : {}),
  };
}

export function parseArticleFrontmatter(markdown: string): ParsedArticleFrontmatter | null {
  const tree = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).parse(markdown) as {
    children?: PositionedNode[];
  };
  const first = tree.children?.[0];
  if (first?.type !== 'yaml' || typeof first.value !== 'string') return null;
  const startOffset = first.position?.start?.offset;
  const endOffset = first.position?.end?.offset;
  if (typeof startOffset !== 'number' || typeof endOffset !== 'number') {
    throw new Error('Unable to resolve renderer frontmatter source range.');
  }

  const parsed = parseYaml(first.value, { maxAliasCount: 100 });
  const data = toRecord(parsed) ?? {};
  const body = `${markdown.slice(0, startOffset)}${markdown.slice(endOffset).replace(/^\r?\n/, '')}`;
  return {
    data,
    articleRender: parseArticleRender(data.article_render),
    body,
    startOffset,
    endOffset,
  };
}
