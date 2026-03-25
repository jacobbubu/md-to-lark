import { buildBTT } from '../btt/build-tree.js';
import type { BTTDocument } from '../btt/types.js';
import type { LASTModel } from '../last/types.js';
import {
  buildLASTToBTTBlockIdMap,
  collectBlocksRootFirst,
  isLASTFragment,
  sortChildrenByTreeOrder,
  toDocumentModelForBTT,
  toRawBlock,
} from './codec-last-to-btt.js';

export function convertLASTToBTT(
  lastDoc: LASTModel,
  options?: {
    documentId?: string;
  },
): BTTDocument {
  const normalized = toDocumentModelForBTT(lastDoc);
  const lastToBttBlockId = buildLASTToBTTBlockIdMap(normalized);
  const rawBlocks = collectBlocksRootFirst(normalized).map((block) => toRawBlock(block, lastToBttBlockId));
  const docId = options?.documentId ?? String(lastDoc.id);
  return buildBTT(docId, rawBlocks);
}

export function summarizeLASTDocument(lastDoc: LASTModel): {
  blockCount: number;
  rootId: string;
  topLevelCount: number;
} {
  const topLevel = sortChildrenByTreeOrder(lastDoc);
  return {
    blockCount: Object.keys(lastDoc.blocks).length,
    rootId: isLASTFragment(lastDoc) ? '(fragment)' : lastDoc.rootId,
    topLevelCount: topLevel.length,
  };
}
