import * as lark from '@larksuiteoapi/node-sdk';
import { RateLimiter } from '../../shared/rate-limiter.js';
import type { BTTNode } from '../../btt/types.js';
import {
  clearBlockChildrenByKnownCount,
  getDocumentBlockById,
  listAllDocumentBlocks,
  patchTextBlockElements,
  resolveCreatedTableCellIds,
  type DocxBlockEntry,
  type LarkRequestOptions,
} from './ops.js';
import {
  canUseElementsOnlyPatch,
  extractTextAlignForPatchFromRawBlock,
  extractTextElementsForPatchFromRawBlock,
  getExpectedTableCellCount,
  toObjectRecord,
} from './render-payload.js';

function isNoChildrenDeleteError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /1770001|invalid param|start_index|end_index|out of range|no child/i.test(error.message);
}

async function deleteFirstChildIfPresent(
  client: lark.Client,
  documentId: string,
  blockId: string,
  authOptions: LarkRequestOptions,
  limiter: RateLimiter,
): Promise<void> {
  try {
    await clearBlockChildrenByKnownCount(client, documentId, blockId, 1, authOptions, limiter);
  } catch (error) {
    if (isNoChildrenDeleteError(error)) {
      return;
    }
    throw error;
  }
}

async function resolveCellTextBlockId(
  client: lark.Client,
  documentId: string,
  createdCellId: string,
  authOptions: LarkRequestOptions,
  docxLimiter: RateLimiter,
  blockById: Map<string, DocxBlockEntry>,
  ensureBlockMapFromList: () => Promise<void>,
): Promise<string> {
  let textBlockId =
    Array.isArray(blockById.get(createdCellId)?.children) && blockById.get(createdCellId)?.children?.[0]
      ? (blockById.get(createdCellId)?.children?.[0] ?? '')
      : '';
  if (!textBlockId) {
    await ensureBlockMapFromList();
    textBlockId =
      Array.isArray(blockById.get(createdCellId)?.children) && blockById.get(createdCellId)?.children?.[0]
        ? (blockById.get(createdCellId)?.children?.[0] ?? '')
        : '';
  }
  if (!textBlockId) {
    const fetchedCell = await getDocumentBlockById(client, documentId, createdCellId, authOptions, docxLimiter);
    if (fetchedCell) {
      blockById.set(createdCellId, fetchedCell);
    }
    textBlockId =
      fetchedCell && Array.isArray(fetchedCell.children) && fetchedCell.children[0] ? fetchedCell.children[0] : '';
  }
  return textBlockId;
}

export interface RenderCreatedTableNodeParams {
  client: lark.Client;
  documentId: string;
  createdBlockId: string;
  createdBlock: DocxBlockEntry | undefined;
  node: BTTNode;
  authOptions: LarkRequestOptions;
  docxLimiter: RateLimiter;
  renderChildren: (parentBlockId: string, nodes: BTTNode[]) => Promise<void>;
}

export async function renderCreatedTableNode(params: RenderCreatedTableNodeParams): Promise<void> {
  const { client, documentId, createdBlockId, createdBlock, node, authOptions, docxLimiter, renderChildren } = params;

  const sourceCellNodes = node.children.filter((item) => item.blockType === 32);
  const nonCellNodes = node.children.filter((item) => item.blockType !== 32);
  const expectedCellCount = getExpectedTableCellCount(node);
  const resolvedCellIds = await resolveCreatedTableCellIds(
    client,
    documentId,
    createdBlockId,
    createdBlock,
    Math.max(expectedCellCount, sourceCellNodes.length),
    authOptions,
    docxLimiter,
  );
  const blockById = new Map<string, DocxBlockEntry>(createdBlock ? [[createdBlock.block_id, createdBlock]] : []);
  let listHydrated = false;
  const ensureBlockMapFromList = async (): Promise<void> => {
    if (listHydrated) return;
    const listed = await listAllDocumentBlocks(client, documentId, authOptions, docxLimiter);
    for (const entry of listed) {
      blockById.set(entry.block_id, entry);
    }
    listHydrated = true;
  };

  for (let i = 0; i < sourceCellNodes.length; i += 1) {
    const sourceCellNode = sourceCellNodes[i];
    const createdCellId = resolvedCellIds[i];
    if (!sourceCellNode || !createdCellId) continue;

    let consumedByPatch = false;
    if (sourceCellNode.children.length === 1) {
      const onlySourceChild = sourceCellNode.children[0];
      const sourceRaw = toObjectRecord(onlySourceChild?.rawBlock);
      if (sourceRaw && canUseElementsOnlyPatch(sourceRaw)) {
        const elements = extractTextElementsForPatchFromRawBlock(sourceRaw);
        if (elements) {
          const textBlockId = await resolveCellTextBlockId(
            client,
            documentId,
            createdCellId,
            authOptions,
            docxLimiter,
            blockById,
            ensureBlockMapFromList,
          );
          if (textBlockId) {
            const align = extractTextAlignForPatchFromRawBlock(sourceRaw);
            await patchTextBlockElements(client, documentId, textBlockId, elements, authOptions, docxLimiter, align);
            consumedByPatch = true;
          }
        }
      }
    }
    if (consumedByPatch) {
      continue;
    }

    if (sourceCellNode.children.length > 0) {
      await deleteFirstChildIfPresent(client, documentId, createdCellId, authOptions, docxLimiter);
    }
    await renderChildren(createdCellId, sourceCellNode.children);
  }

  await renderChildren(createdBlockId, nonCellNodes);
}
