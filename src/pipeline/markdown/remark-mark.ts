import type { Root as MdastRoot } from 'mdast';
import type { Node } from 'unist';
import type { Plugin } from 'unified';

type MdastNode = Node & {
  value?: unknown;
  children?: MdastNode[];
};

const MARK_OPEN_RE = /^<mark(?:\s[^>]*)?>$/i;
const MARK_CLOSE_RE = /^<\/mark\s*>$/i;

function isHtmlNode(node: MdastNode | undefined): node is MdastNode & { type: 'html'; value: string } {
  return node?.type === 'html' && typeof node.value === 'string';
}

function isMarkOpen(node: MdastNode | undefined): boolean {
  return isHtmlNode(node) && MARK_OPEN_RE.test(node.value.trim());
}

function isMarkClose(node: MdastNode | undefined): boolean {
  return isHtmlNode(node) && MARK_CLOSE_RE.test(node.value.trim());
}

function toMarkNode(open: MdastNode, close: MdastNode, children: MdastNode[]): MdastNode {
  const markNode: MdastNode = {
    type: 'mark',
    children,
    data: {
      hName: 'mark',
    },
  };

  if (open.position?.start && close.position?.end) {
    markNode.position = {
      start: open.position.start,
      end: close.position.end,
    };
  }

  return markNode;
}

function rewriteMarkPairs(children: MdastNode[]): MdastNode[] {
  const rewritten: MdastNode[] = [];
  let cursor = 0;

  while (cursor < children.length) {
    const node = children[cursor];
    if (!node) {
      cursor += 1;
      continue;
    }
    if (!isMarkOpen(node)) {
      rewritten.push(node);
      cursor += 1;
      continue;
    }

    const markChildren: MdastNode[] = [];
    let depth = 1;
    let closeIndex = -1;

    for (let index = cursor + 1; index < children.length; index += 1) {
      const child = children[index];
      if (!child) continue;
      if (isMarkOpen(child)) {
        depth += 1;
      }
      if (isMarkClose(child)) {
        depth -= 1;
        if (depth === 0) {
          closeIndex = index;
          break;
        }
      }
      markChildren.push(child);
    }

    if (closeIndex === -1) {
      rewritten.push(node);
      cursor += 1;
      continue;
    }

    rewritten.push(toMarkNode(node, children[closeIndex]!, rewriteMarkPairs(markChildren)));
    cursor = closeIndex + 1;
  }

  return rewritten;
}

function visit(node: MdastNode): void {
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    visit(child);
  }
  node.children = rewriteMarkPairs(node.children);
}

export const remarkMarkToHast: Plugin<[], MdastRoot> = function remarkMarkToHast() {
  return (tree: MdastRoot): void => {
    visit(tree);
  };
};
