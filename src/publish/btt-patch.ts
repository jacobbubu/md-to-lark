import path from 'node:path';
import type { BTTDocument } from '../btt/types.js';
import { getLarkBlockTypeName } from '../lark/index.js';
import {
  DEFAULT_MERMAID_RENDER_CONFIG,
  type MermaidPatch,
  type MermaidRenderConfig,
} from '../lark/docx/render-types.js';
import { shouldUsePreviewView, toObjectRecord } from './common.js';
import type { LocalAsset } from './asset-adapter.js';

const MERMAID_COMPONENT_TYPE_ID = 'blk_631fefbbae02400430b8f9f4';

function applyRawBlockPatch(
  rawBlock: Record<string, unknown>,
  blockId: string,
  mermaidByBlockId: ReadonlyMap<string, MermaidPatch>,
  assetByBlockId: ReadonlyMap<string, LocalAsset>,
  mermaidRenderConfig: MermaidRenderConfig,
): void {
  const mermaid = mermaidByBlockId.get(blockId);
  if (mermaid) {
    rawBlock.block_type = mermaidRenderConfig.target === 'board' ? 43 : 40;
    for (const key of Object.keys(rawBlock)) {
      if (key === 'block_id' || key === 'parent_id' || key === 'children' || key === 'block_type') continue;
      delete rawBlock[key];
    }
    if (mermaidRenderConfig.target === 'board') {
      rawBlock.board = {};
    } else {
      rawBlock.add_ons = {
        component_type_id: MERMAID_COMPONENT_TYPE_ID,
        record: JSON.stringify({
          data: mermaid.code,
          theme: 'default',
          view: 'chart',
        }),
      };
    }
  }

  const asset = assetByBlockId.get(blockId);
  if (!asset) return;

  if (asset.kind === 'image') {
    rawBlock.block_type = 27;
    const image = toObjectRecord(rawBlock.image) ?? {};
    image.local_path = asset.absolutePath;
    rawBlock.image = image;
    return;
  }

  rawBlock.block_type = 23;
  const file = toObjectRecord(rawBlock.file) ?? {};
  file.local_path = asset.absolutePath;
  file.name = typeof file.name === 'string' && file.name.trim().length > 0 ? file.name : asset.fileName;
  if (asset.mediaKind) {
    file.media_kind = asset.mediaKind;
  }
  if (typeof file.view_type !== 'number') {
    file.view_type = shouldUsePreviewView(path.extname(asset.fileName).toLowerCase(), asset.mediaKind ?? 'file') ? 2 : 1;
  }
  rawBlock.file = file;
}

export function patchBTTForMermaidAndAssets(
  btt: BTTDocument,
  mermaidByBlockId: ReadonlyMap<string, MermaidPatch>,
  assetByBlockId: ReadonlyMap<string, LocalAsset>,
  options?: {
    mermaidRender?: MermaidRenderConfig;
  },
): void {
  const mermaidRenderConfig = options?.mermaidRender ?? DEFAULT_MERMAID_RENDER_CONFIG;
  const walk = (node: BTTDocument['root']): void => {
    applyRawBlockPatch(node.rawBlock, node.blockId, mermaidByBlockId, assetByBlockId, mermaidRenderConfig);
    node.blockType = node.rawBlock.block_type;
    node.blockTypeName = getLarkBlockTypeName(node.blockType);
    for (const child of node.children) {
      walk(child);
    }
  };

  walk(btt.root);

  for (const [blockId, rawBlock] of Object.entries(btt.flatBlocks)) {
    applyRawBlockPatch(rawBlock, blockId, mermaidByBlockId, assetByBlockId, mermaidRenderConfig);
  }
}
