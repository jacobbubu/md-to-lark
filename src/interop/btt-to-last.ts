import type { BTTDocument } from '../btt/types.js';
import type { LarkDocxBlock } from '../lark/types.js';
import type { LASTBlockId, LASTBlockNode, LASTDocument } from '../last/types.js';
import {
  buildLASTIndexes,
  flattenTreeBlocks,
  fromRawBlockToLAST,
  type InlineCounter,
} from './codec-btt-to-last.js';
import { normalizeDocumentIdToLAST } from './codec-last-to-btt.js';

export function convertBTTToLAST(bttDoc: BTTDocument): LASTDocument {
  const rawBlocks = Object.keys(bttDoc.flatBlocks ?? {}).length
    ? Object.values(bttDoc.flatBlocks)
    : flattenTreeBlocks(bttDoc.root);

  const rawById = new Map<string, LarkDocxBlock>();
  for (const rawBlock of rawBlocks) {
    rawById.set(String(rawBlock.block_id), rawBlock);
  }

  const rootRawId = String(bttDoc.rootBlockId || bttDoc.root.blockId);
  if (!rawById.has(rootRawId)) {
    throw new Error(`BTT root block "${rootRawId}" is not found in source blocks.`);
  }

  const orderedRawIds: string[] = [];
  const visitedRawIds = new Set<string>();
  const visitRawId = (rawId: string): void => {
    if (visitedRawIds.has(rawId)) return;
    const rawBlock = rawById.get(rawId);
    if (!rawBlock) return;

    visitedRawIds.add(rawId);
    orderedRawIds.push(rawId);
    for (const childId of rawBlock.children ?? []) {
      visitRawId(String(childId));
    }
  };

  visitRawId(rootRawId);
  for (const rawBlock of rawBlocks) {
    const rawId = String(rawBlock.block_id);
    if (!visitedRawIds.has(rawId)) {
      orderedRawIds.push(rawId);
    }
  }

  const bttToLastBlockId: Record<string, LASTBlockId> = {};
  let blockCounter = 1;
  for (const rawId of orderedRawIds) {
    bttToLastBlockId[rawId] = `b_${blockCounter}` as LASTBlockId;
    blockCounter += 1;
  }

  const inlineCounter: InlineCounter = { value: 1 };
  const blocks: Record<LASTBlockId, LASTBlockNode> = {};

  for (const rawId of orderedRawIds) {
    const rawBlock = rawById.get(rawId);
    if (!rawBlock) continue;
    const block = fromRawBlockToLAST(rawBlock, inlineCounter, bttToLastBlockId);
    blocks[block.id] = block;
  }

  const rootId = bttToLastBlockId[rootRawId];
  if (!rootId) {
    throw new Error(`Failed to map root block "${rootRawId}" to LAST id.`);
  }

  if (!blocks[rootId]) {
    throw new Error(`BTT rootBlockId "${rootId}" is not found in blocks.`);
  }

  const doc: LASTDocument = {
    schema: 'LAST',
    version: '1.0.0',
    id: normalizeDocumentIdToLAST(String(bttDoc.documentId)) as LASTDocument['id'],
    rootId,
    blocks,
    indexes: {
      byType: {},
      textScopes: {},
      textScopeByBlockId: {},
    },
  };

  doc.indexes = buildLASTIndexes(doc);
  return doc;
}

export function summarizeBTTDocument(bttDoc: BTTDocument): {
  totalBlocks: number;
  rootBlockId: string;
  missingChildren: number;
} {
  return {
    totalBlocks: bttDoc.totalBlocks,
    rootBlockId: bttDoc.rootBlockId,
    missingChildren: bttDoc.missingChildren.length,
  };
}
