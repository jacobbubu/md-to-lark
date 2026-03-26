import { existsSync } from 'node:fs';
import path from 'node:path';
import type { LASTBlockNode, LASTModel } from '../last/types.js';
import {
  createDefaultMarks,
  extractTextFromInlines,
  firstInlineLinkUrl,
  getPathExtension,
  inferMediaKind,
  isTextualBlock,
  resolveLocalPathFromSource,
  shouldUsePreviewView,
  stripQueryAndHash,
} from './common.js';

export interface LocalAsset {
  kind: 'image' | 'file';
  absolutePath: string;
  fileName: string;
  mediaKind?: 'image' | 'video' | 'audio' | 'file';
}

export function applyStandaloneAttachmentTransforms(last: LASTModel, baseDir: string): Map<string, LocalAsset> {
  const localAssetByBlockId = new Map<string, LocalAsset>();

  for (const block of Object.values(last.blocks)) {
    if (!isTextualBlock(block) || block.type !== 'text') {
      continue;
    }

    if (block.children.length > 0) {
      continue;
    }

    const linkUrl = firstInlineLinkUrl(block);
    if (!linkUrl) {
      continue;
    }

    const resolvedPath = resolveLocalPathFromSource(linkUrl, baseDir);
    if (!resolvedPath) {
      continue;
    }
    if (!existsSync(resolvedPath)) {
      continue;
    }

    const extension = getPathExtension(linkUrl);
    const mediaKind = inferMediaKind(extension);
    const displayName = extractTextFromInlines(block.payload.inlines).trim();
    const fileName = displayName.length > 0 ? displayName : path.basename(stripQueryAndHash(linkUrl));

    if (mediaKind === 'image') {
      const transformed: Extract<LASTBlockNode, { type: 'image' }> = {
        id: block.id,
        ...(block.bttId ? { bttId: block.bttId } : {}),
        type: 'image',
        parentId: block.parentId,
        children: [],
        payload: {
          width: 0,
          height: 0,
          token: '',
          align: 'left',
        },
        selector: {
          attrs: {
            sourceUrl: linkUrl,
          },
        },
      };
      last.blocks[block.id] = transformed;
      localAssetByBlockId.set(block.id, {
        kind: 'image',
        absolutePath: resolvedPath,
        fileName: path.basename(resolvedPath),
        mediaKind,
      });
      continue;
    }

    const transformed: Extract<LASTBlockNode, { type: 'file' }> = {
      id: block.id,
      ...(block.bttId ? { bttId: block.bttId } : {}),
      type: 'file',
      parentId: block.parentId,
      children: [],
      payload: {
        name: fileName,
        viewType: shouldUsePreviewView(extension, mediaKind) ? 2 : 1,
      },
      selector: {
        attrs: {
          sourceUrl: linkUrl,
        },
      },
    };
    last.blocks[block.id] = transformed;
    localAssetByBlockId.set(block.id, {
      kind: 'file',
      absolutePath: resolvedPath,
      fileName: path.basename(resolvedPath),
      mediaKind,
    });
  }

  for (const block of Object.values(last.blocks)) {
    if (block.type !== 'image') continue;
    const sourceUrl =
      block.selector && block.selector.attrs && typeof block.selector.attrs.sourceUrl === 'string'
        ? String(block.selector.attrs.sourceUrl)
        : '';
    if (!sourceUrl) continue;
    const resolvedPath = resolveLocalPathFromSource(sourceUrl, baseDir);
    if (!resolvedPath) continue;
    if (!existsSync(resolvedPath)) {
      last.blocks[block.id] = {
        id: block.id,
        ...(block.bttId ? { bttId: block.bttId } : {}),
        type: 'text',
        parentId: block.parentId,
        children: [],
        payload: {
          style: {
            align: 'left',
            language: null,
          },
          inlines: [
            {
              id: `i_missing_${block.id}`,
              kind: 'text_run',
              marks: createDefaultMarks(),
              text: sourceUrl,
            },
          ],
        },
      };
      continue;
    }
    localAssetByBlockId.set(block.id, {
      kind: 'image',
      absolutePath: resolvedPath,
      fileName: path.basename(resolvedPath),
      mediaKind: 'image',
    });
  }

  return localAssetByBlockId;
}
