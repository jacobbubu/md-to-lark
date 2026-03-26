import * as lark from '@larksuiteoapi/node-sdk';
import { RateLimiter } from '../../shared/rate-limiter.js';
import {
  clearBlockChildrenByKnownCount,
  createDocumentChildren,
  getDocumentBlockById,
  listAllDocumentBlocks,
  patchTextBlockElements,
  resolveCreatedTableCellIds,
  type DocxBlockEntry,
  type LarkRequestOptions,
} from './ops.js';
import type { BTTNode } from '../../btt/types.js';
import {
  DEFAULT_MERMAID_RENDER_CONFIG,
  type MermaidPatch,
  type MermaidRenderConfig,
} from './render-types.js';
import { applyCreatedBoardMermaid, applyCreatedFileBlock, applyCreatedImageBlock } from './render-post-process.js';
import {
  buildCreatePayloadFromRawBlock,
  canUseElementsOnlyPatch,
  createRenderBatchEntry,
  extractTextAlignForPatchFromRawBlock,
  extractTextElementsForPatchFromRawBlock,
  getExpectedTableCellCount,
  getSourceBlockId,
  toObjectRecord,
} from './render-payload.js';
import type { RenderBatchEntry } from './render-payload.js';
import type { RenderBTTReport, RenderFailedNode, RenderMediaTokenMapping } from './render-models.js';
export type { RenderBTTReport, RenderFailedNode, RenderMediaTokenMapping } from './render-models.js';

const RENDER_LEAF_BATCH_SIZE = 50;

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

async function renderBTTNodesToDocument(
  client: lark.Client,
  documentId: string,
  parentBlockId: string,
  nodes: BTTNode[],
  authOptions: LarkRequestOptions,
  docxLimiter: RateLimiter,
  mediaLimiter: RateLimiter,
  mermaidByBlockId: ReadonlyMap<string, MermaidPatch>,
  mermaidRenderConfig: MermaidRenderConfig,
  report: RenderBTTReport,
  continueOnError: boolean,
): Promise<void> {
  const batch: RenderBatchEntry[] = [];

  const flushBatch = async (): Promise<void> => {
    if (batch.length === 0) return;
    const entries = [...batch];
    batch.length = 0;

    let created: DocxBlockEntry[] = [];
    try {
      created = await createDocumentChildren(
        client,
        documentId,
        parentBlockId,
        entries.map((entry) => entry.createPayload),
        authOptions,
        docxLimiter,
      );
    } catch (error) {
      if (!continueOnError) {
        throw error;
      }
      for (const entry of entries) {
        await renderBTTNodeToDocument(
          client,
          documentId,
          parentBlockId,
          entry.node,
          authOptions,
          docxLimiter,
          mediaLimiter,
          mermaidByBlockId,
          mermaidRenderConfig,
          report,
          continueOnError,
        );
      }
      return;
    }

    if (created.length !== entries.length) {
      const errorText = `Batch create count mismatch under parent=${parentBlockId}: expected=${entries.length} actual=${created.length}`;
      if (!continueOnError) {
        throw new Error(errorText);
      }
      for (const entry of entries) {
        report.failedNodes.push({
          sourceBlockId: entry.sourceBlockId,
          blockType: entry.node.blockType,
          parentBlockId,
          error: errorText,
        });
      }
      return;
    }

    report.createdBlockCount += created.length;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const createdBlock = created[index];
      if (!entry || !createdBlock) continue;
      const createdBlockId = createdBlock.block_id;
      if (!createdBlockId) continue;
      if (entry.node.children.length === 0) continue;
      await renderBTTNodesToDocument(
        client,
        documentId,
        createdBlockId,
        entry.node.children,
        authOptions,
        docxLimiter,
        mediaLimiter,
        mermaidByBlockId,
        mermaidRenderConfig,
        report,
        continueOnError,
      );
    }
  };

  for (const node of nodes) {
    const entry = createRenderBatchEntry(node);
    if (entry) {
      batch.push(entry);
      if (batch.length >= RENDER_LEAF_BATCH_SIZE) {
        await flushBatch();
      }
      continue;
    }

    await flushBatch();
    await renderBTTNodeToDocument(
      client,
      documentId,
      parentBlockId,
      node,
      authOptions,
      docxLimiter,
      mediaLimiter,
      mermaidByBlockId,
      mermaidRenderConfig,
      report,
      continueOnError,
    );
  }

  await flushBatch();
}

async function renderBTTNodeToDocument(
  client: lark.Client,
  documentId: string,
  parentBlockId: string,
  node: BTTNode,
  authOptions: LarkRequestOptions,
  docxLimiter: RateLimiter,
  mediaLimiter: RateLimiter,
  mermaidByBlockId: ReadonlyMap<string, MermaidPatch>,
  mermaidRenderConfig: MermaidRenderConfig,
  report: RenderBTTReport,
  continueOnError: boolean,
): Promise<void> {
  const rawBlockRecord = toObjectRecord(node.rawBlock);
  if (!rawBlockRecord) return;
  const sourceBlockId = getSourceBlockId(node, rawBlockRecord);

  try {
    const createPayload = buildCreatePayloadFromRawBlock(rawBlockRecord);
    if (!createPayload) {
      await renderBTTNodesToDocument(
        client,
        documentId,
        parentBlockId,
        node.children,
        authOptions,
        docxLimiter,
        mediaLimiter,
        mermaidByBlockId,
        mermaidRenderConfig,
        report,
        continueOnError,
      );
      return;
    }

    let createdBlocks: DocxBlockEntry[];
    try {
      createdBlocks = await createDocumentChildren(
        client,
        documentId,
        parentBlockId,
        [createPayload],
        authOptions,
        docxLimiter,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to render BTT node source=${String(rawBlockRecord.block_id ?? node.blockId)} type=${String(
          createPayload.block_type,
        )}: ${message}`,
      );
    }

    report.createdBlockCount += createdBlocks.length;

    const createdBlock = createdBlocks[0];
    const createdBlockId = createdBlock?.block_id;
    if (!createdBlockId) {
      throw new Error(`Failed to create block for source "${String(rawBlockRecord.block_id ?? node.blockId)}".`);
    }

    const mermaidPatch =
      mermaidRenderConfig.target === 'board'
        ? (mermaidByBlockId.get(node.blockId) ?? mermaidByBlockId.get(sourceBlockId))
        : undefined;
    if (node.blockType === 43 && mermaidPatch) {
      await applyCreatedBoardMermaid(
        client,
        documentId,
        createdBlockId,
        mermaidPatch,
        mermaidRenderConfig,
        authOptions,
        docxLimiter,
      );
    }

    if (node.blockType === 27) {
      const mapping = await applyCreatedImageBlock(
        client,
        documentId,
        createdBlockId,
        sourceBlockId,
        rawBlockRecord,
        authOptions,
        docxLimiter,
        mediaLimiter,
      );
      if (mapping) {
        report.mediaTokenMappings.push(mapping);
      }
    }

    if (node.blockType === 23) {
      const mapping = await applyCreatedFileBlock(
        client,
        documentId,
        createdBlockId,
        createdBlock,
        sourceBlockId,
        rawBlockRecord,
        authOptions,
        docxLimiter,
        mediaLimiter,
      );
      if (mapping) {
        report.mediaTokenMappings.push(mapping);
      }
    }

    if (node.blockType !== 31) {
      await renderBTTNodesToDocument(
        client,
        documentId,
        createdBlockId,
        node.children,
        authOptions,
        docxLimiter,
        mediaLimiter,
        mermaidByBlockId,
        mermaidRenderConfig,
        report,
        continueOnError,
      );
      return;
    }

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
    const blockById = new Map<string, DocxBlockEntry>(createdBlocks.map((entry) => [entry.block_id, entry] as const));
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
              const fetchedCell = await getDocumentBlockById(
                client,
                documentId,
                createdCellId,
                authOptions,
                docxLimiter,
              );
              if (fetchedCell) {
                blockById.set(createdCellId, fetchedCell);
              }
              textBlockId =
                fetchedCell && Array.isArray(fetchedCell.children) && fetchedCell.children[0]
                  ? fetchedCell.children[0]
                  : '';
            }
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
      await renderBTTNodesToDocument(
        client,
        documentId,
        createdCellId,
        sourceCellNode.children,
        authOptions,
        docxLimiter,
        mediaLimiter,
        mermaidByBlockId,
        mermaidRenderConfig,
        report,
        continueOnError,
      );
    }

    await renderBTTNodesToDocument(
      client,
      documentId,
      createdBlockId,
      nonCellNodes,
      authOptions,
      docxLimiter,
      mediaLimiter,
      mermaidByBlockId,
      mermaidRenderConfig,
      report,
      continueOnError,
    );
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    report.failedNodes.push({
      sourceBlockId,
      blockType: node.blockType,
      parentBlockId,
      error: errorText,
    });
    if (continueOnError) {
      return;
    }
    throw error;
  }
}

export async function renderBTTToDocument(
  client: lark.Client,
  documentId: string,
  parentBlockId: string,
  rootNode: BTTNode,
  authOptions: LarkRequestOptions,
  docxLimiter: RateLimiter,
  mediaLimiter: RateLimiter,
  options?: {
    continueOnError?: boolean;
    mermaidByBlockId?: ReadonlyMap<string, MermaidPatch>;
    mermaidRender?: MermaidRenderConfig;
  },
): Promise<RenderBTTReport> {
  const report: RenderBTTReport = {
    createdBlockCount: 0,
    mediaTokenMappings: [],
    failedNodes: [],
  };
  const continueOnError = Boolean(options?.continueOnError);
  const mermaidByBlockId = options?.mermaidByBlockId ?? new Map<string, MermaidPatch>();
  const mermaidRenderConfig = options?.mermaidRender ?? DEFAULT_MERMAID_RENDER_CONFIG;
  const initialNodes = rootNode.blockType === 1 ? rootNode.children : [rootNode];
  await renderBTTNodesToDocument(
    client,
    documentId,
    parentBlockId,
    initialNodes,
    authOptions,
    docxLimiter,
    mediaLimiter,
    mermaidByBlockId,
    mermaidRenderConfig,
    report,
    continueOnError,
  );
  return report;
}
