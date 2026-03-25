import { getLarkBlockTypeName } from '../lark/block-types.js';
import type { LarkDocxBlock } from '../lark/types.js';
import type { BTTDocument, BTTNode } from './types.js';

interface BuildTreeContext {
  blocksById: Map<string, LarkDocxBlock>;
  missingChildren: Set<string>;
}

function pickRootBlockId(documentId: string, blocks: LarkDocxBlock[], blocksById: Map<string, LarkDocxBlock>): string {
  if (blocks.length === 0) {
    throw new Error(`No blocks returned for document "${documentId}".`);
  }

  const pageRoot = blocks.find((block) => block.block_type === 1);
  if (pageRoot) {
    return pageRoot.block_id;
  }

  const orphan = blocks.find((block) => !blocksById.has(block.parent_id));
  if (orphan) {
    return orphan.block_id;
  }

  const first = blocks[0];
  if (!first) {
    throw new Error(`No root block found for document "${documentId}".`);
  }
  return first.block_id;
}

function cloneBlock(block: LarkDocxBlock): LarkDocxBlock {
  return JSON.parse(JSON.stringify(block)) as LarkDocxBlock;
}

function buildNode(blockId: string, ctx: BuildTreeContext, visiting: Set<string>): BTTNode {
  const block = ctx.blocksById.get(blockId);
  if (!block) {
    throw new Error(`Block "${blockId}" is missing while building BTT.`);
  }

  if (visiting.has(blockId)) {
    throw new Error(`Cycle detected in block tree at "${blockId}".`);
  }

  visiting.add(blockId);

  const children: BTTNode[] = [];
  for (const childId of block.children ?? []) {
    if (!ctx.blocksById.has(childId)) {
      ctx.missingChildren.add(childId);
      continue;
    }
    children.push(buildNode(childId, ctx, visiting));
  }

  visiting.delete(blockId);

  return {
    blockId: block.block_id,
    parentId: block.parent_id,
    blockType: block.block_type,
    blockTypeName: getLarkBlockTypeName(block.block_type),
    rawBlock: cloneBlock(block),
    children,
  };
}

function toFlatBlocks(blocks: LarkDocxBlock[]): Record<string, LarkDocxBlock> {
  const output: Record<string, LarkDocxBlock> = {};
  for (const block of blocks) {
    output[block.block_id] = cloneBlock(block);
  }
  return output;
}

export function buildBTT(documentId: string, blocks: LarkDocxBlock[]): BTTDocument {
  const blocksById = new Map<string, LarkDocxBlock>();
  for (const block of blocks) {
    blocksById.set(block.block_id, block);
  }

  const rootBlockId = pickRootBlockId(documentId, blocks, blocksById);
  const ctx: BuildTreeContext = {
    blocksById,
    missingChildren: new Set<string>(),
  };

  const root = buildNode(rootBlockId, ctx, new Set<string>());

  return {
    schema: 'BTT',
    version: '1.0.0',
    documentId,
    generatedAt: new Date().toISOString(),
    rootBlockId,
    totalBlocks: blocks.length,
    missingChildren: Array.from(ctx.missingChildren),
    root,
    flatBlocks: toFlatBlocks(blocks),
  };
}
