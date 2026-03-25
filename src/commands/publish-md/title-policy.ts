import path from 'node:path';
import { toString } from 'hast-util-to-string';
import type { Element as HastElement, Root as HastRoot, RootContent as HastRootContent } from 'hast';
import type { PublishInputSet } from './input-resolver.js';

interface H1Hit {
  parent: HastRoot | HastElement;
  index: number;
  node: HastElement;
}

function stripMarkdownExtension(filePath: string): string {
  return filePath.replace(/\.md$/i, '');
}

function formatDatePrefix(now: Date): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function withDatePrefix(title: string, now = new Date()): string {
  const trimmed = title.trim();
  const datePrefix = formatDatePrefix(now);
  if (!trimmed) return `${datePrefix}-untitled`;
  if (new RegExp(`^${datePrefix}-`).test(trimmed)) return trimmed;
  return `${datePrefix}-${trimmed}`;
}

function finalizeTitle(title: string, datePrefixEnabled: boolean): string {
  const trimmed = title.trim();
  if (datePrefixEnabled) {
    return withDatePrefix(trimmed);
  }
  return trimmed || 'untitled';
}

function isElementNode(node: HastRootContent): node is HastElement {
  return node.type === 'element';
}

function collectH1Hits(node: HastRoot | HastElement, out: H1Hit[]): void {
  const children = Array.isArray(node.children) ? node.children : [];
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (!child || !isElementNode(child)) continue;
    if (child.tagName === 'h1') {
      out.push({ parent: node, index, node: child });
    }
    collectH1Hits(child, out);
  }
}

function promoteHeadingsOneLevel(node: HastRoot | HastElement): void {
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (!child || !isElementNode(child)) continue;
    const headingMatch = /^h([2-9])$/.exec(child.tagName);
    if (headingMatch) {
      const currentLevel = Number(headingMatch[1] ?? 2);
      child.tagName = `h${currentLevel - 1}`;
    }
    promoteHeadingsOneLevel(child);
  }
}

export function applySingleH1TitleRule(hast: HastRoot): { derivedTitle?: string } {
  const h1Hits: H1Hit[] = [];
  collectH1Hits(hast, h1Hits);
  if (h1Hits.length !== 1) return {};

  const onlyHit = h1Hits[0];
  if (!onlyHit) return {};
  const rawTitle = toString(onlyHit.node).trim();
  const parentChildren = Array.isArray(onlyHit.parent.children) ? onlyHit.parent.children : [];
  if (onlyHit.index >= 0 && onlyHit.index < parentChildren.length) {
    parentChildren.splice(onlyHit.index, 1);
  }
  promoteHeadingsOneLevel(hast);

  return rawTitle ? { derivedTitle: rawTitle } : {};
}

export function buildTitleForMarkdown(
  markdownPath: string,
  inputSet: PublishInputSet,
  titleOverride?: string,
  h1DerivedTitle?: string,
  options?: {
    datePrefix?: boolean;
  },
): string {
  const datePrefixEnabled = options?.datePrefix ?? true;
  if (inputSet.mode === 'single') {
    if (titleOverride && titleOverride.trim()) {
      return finalizeTitle(titleOverride, datePrefixEnabled);
    }
    if (h1DerivedTitle && h1DerivedTitle.trim()) {
      return finalizeTitle(h1DerivedTitle, datePrefixEnabled);
    }
    const baseName = path.basename(markdownPath, path.extname(markdownPath));
    return finalizeTitle(baseName || 'md-to-lark', datePrefixEnabled);
  }

  const relative = stripMarkdownExtension(path.relative(inputSet.rootPath, markdownPath));
  const relativeTitle = relative.split(path.sep).join(' / ');
  if (titleOverride && titleOverride.trim()) {
    return finalizeTitle(`${titleOverride.trim()} / ${relativeTitle}`, datePrefixEnabled);
  }
  if (h1DerivedTitle && h1DerivedTitle.trim()) {
    return finalizeTitle(h1DerivedTitle, datePrefixEnabled);
  }
  return finalizeTitle(relativeTitle || path.basename(markdownPath, path.extname(markdownPath)), datePrefixEnabled);
}
