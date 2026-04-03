import * as lark from '@larksuiteoapi/node-sdk';
import { RateLimiter } from '../../shared/rate-limiter.js';
import {
  createBoardPlantumlNode,
  getDocumentBlockById,
  getRawDocumentBlockById,
  isRelationMismatchError,
  replaceFileBlock,
  replaceImageBlock,
  uploadBinaryToNode,
  type DocxBlockEntry,
  type LarkRequestOptions,
} from './ops.js';
import type { MermaidPatch, MermaidRenderConfig } from './render-types.js';
import type { RenderMediaTokenMapping } from './render-models.js';
import { toObjectRecord } from './render-payload.js';

function extractWhiteboardId(rawBlock: Record<string, unknown> | null): string {
  const board = toObjectRecord(rawBlock?.board);
  if (!board) return '';
  const candidates = [board.token, board.whiteboard_id, board.board_token, board.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return '';
}

export async function applyCreatedBoardMermaid(
  client: lark.Client,
  documentId: string,
  createdBlockId: string,
  mermaidPatch: MermaidPatch,
  mermaidRenderConfig: MermaidRenderConfig,
  authOptions: LarkRequestOptions,
  docxLimiter: RateLimiter,
): Promise<void> {
  const createdRawBlock = await getRawDocumentBlockById(client, documentId, createdBlockId, authOptions, docxLimiter);
  const whiteboardId = extractWhiteboardId(createdRawBlock);
  if (!whiteboardId) {
    throw new Error(`Unable to resolve whiteboard id from created board block "${createdBlockId}".`);
  }
  await createBoardPlantumlNode(
    client,
    whiteboardId,
    mermaidPatch.code,
    mermaidRenderConfig.board,
    authOptions,
    docxLimiter,
  );
}

export async function applyCreatedImageBlock(
  client: lark.Client,
  documentId: string,
  createdBlockId: string,
  sourceBlockId: string,
  rawBlockRecord: Record<string, unknown>,
  authOptions: LarkRequestOptions,
  docxLimiter: RateLimiter,
  mediaLimiter: RateLimiter,
): Promise<RenderMediaTokenMapping | null> {
  const image = toObjectRecord(rawBlockRecord.image);
  const localPath = image && typeof image.local_path === 'string' ? image.local_path : '';
  if (!localPath) return null;
  const replaceOptions = {
    ...(image && typeof image.width === 'number' ? { width: image.width } : {}),
    ...(image && typeof image.height === 'number' ? { height: image.height } : {}),
    ...(image && typeof image.align === 'number' ? { align: image.align } : {}),
    ...(image && toObjectRecord(image.caption) ? { caption: toObjectRecord(image.caption) as { content?: string } } : {}),
    ...(image && typeof image.scale === 'number' ? { scale: image.scale } : {}),
  };

  let imageToken = await uploadBinaryToNode(client, 'docx_image', createdBlockId, localPath, authOptions, mediaLimiter);
  try {
    await replaceImageBlock(client, documentId, createdBlockId, imageToken, replaceOptions, authOptions, docxLimiter);
  } catch (error) {
    if (!isRelationMismatchError(error)) {
      throw error;
    }
    imageToken = await uploadBinaryToNode(client, 'docx_image', createdBlockId, localPath, authOptions, mediaLimiter);
    await replaceImageBlock(client, documentId, createdBlockId, imageToken, replaceOptions, authOptions, docxLimiter);
  }

  return {
    kind: 'image',
    sourceBlockId,
    createdBlockId,
    localPath,
    token: imageToken,
  };
}

async function resolveFileTargetBlockId(
  client: lark.Client,
  documentId: string,
  createdBlockId: string,
  createdBlock: DocxBlockEntry | undefined,
  authOptions: LarkRequestOptions,
  docxLimiter: RateLimiter,
): Promise<string> {
  let fileTargetBlockId =
    Array.isArray(createdBlock?.children) &&
    typeof createdBlock.children[0] === 'string' &&
    createdBlock.children[0].trim()
      ? createdBlock.children[0].trim()
      : '';
  if (!fileTargetBlockId) {
    const fetchedCreatedBlock = await getDocumentBlockById(client, documentId, createdBlockId, authOptions, docxLimiter);
    fileTargetBlockId =
      fetchedCreatedBlock &&
      Array.isArray(fetchedCreatedBlock.children) &&
      typeof fetchedCreatedBlock.children[0] === 'string' &&
      fetchedCreatedBlock.children[0].trim()
        ? fetchedCreatedBlock.children[0].trim()
        : createdBlockId;
  }
  return fileTargetBlockId;
}

export async function applyCreatedFileBlock(
  client: lark.Client,
  documentId: string,
  createdBlockId: string,
  createdBlock: DocxBlockEntry | undefined,
  sourceBlockId: string,
  rawBlockRecord: Record<string, unknown>,
  authOptions: LarkRequestOptions,
  docxLimiter: RateLimiter,
  mediaLimiter: RateLimiter,
): Promise<RenderMediaTokenMapping | null> {
  const file = toObjectRecord(rawBlockRecord.file);
  const localPath = file && typeof file.local_path === 'string' ? file.local_path : '';
  const existingToken =
    file && typeof file.file_token === 'string' && file.file_token.trim().length > 0
      ? file.file_token.trim()
      : file && typeof file.token === 'string' && file.token.trim().length > 0
        ? file.token.trim()
        : '';
  const fileTargetBlockId = await resolveFileTargetBlockId(
    client,
    documentId,
    createdBlockId,
    createdBlock,
    authOptions,
    docxLimiter,
  );

  if (localPath) {
    let fileToken = await uploadBinaryToNode(client, 'docx_file', fileTargetBlockId, localPath, authOptions, mediaLimiter);
    try {
      await replaceFileBlock(client, documentId, fileTargetBlockId, fileToken, authOptions, docxLimiter);
    } catch (error) {
      if (!isRelationMismatchError(error)) {
        throw error;
      }
      fileToken = await uploadBinaryToNode(client, 'docx_file', fileTargetBlockId, localPath, authOptions, mediaLimiter);
      await replaceFileBlock(client, documentId, fileTargetBlockId, fileToken, authOptions, docxLimiter);
    }
    return {
      kind: 'file',
      sourceBlockId,
      createdBlockId: fileTargetBlockId,
      localPath,
      token: fileToken,
    };
  }

  if (existingToken) {
    await replaceFileBlock(client, documentId, fileTargetBlockId, existingToken, authOptions, docxLimiter);
  }
  return null;
}
