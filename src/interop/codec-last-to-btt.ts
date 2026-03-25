import type { LarkDocxBlock } from '../lark/types.js';
import type {
  LASTBlockId,
  LASTBlockNode,
  LASTDocument,
  LASTFragment,
  LASTModel,
  LASTTextualBlock,
  LASTTextualBlockType,
} from '../last/types.js';
import {
  CALLOUT_BG_TO_NUM,
  CALLOUT_BORDER_TO_NUM,
  IFRAME_TYPE_TO_NUM,
  LAST_TO_LARK_BLOCK_TYPE,
  deepClone,
  isTextualType,
  lastTextPayloadToLark,
  toAlignNumber,
} from './codec-shared.js';

export function normalizeDocumentIdToLAST(value: string): string {
  return value.startsWith('doc_') ? value : `doc_${value}`;
}

export function isLASTFragment(doc: LASTModel): doc is LASTFragment {
  return (doc as LASTFragment).mode === 'fragment' || Array.isArray((doc as Partial<LASTFragment>).topLevel);
}

export function sortChildrenByTreeOrder(doc: LASTModel): LASTBlockId[] {
  if (isLASTFragment(doc)) {
    return [...doc.topLevel];
  }
  const root = doc.blocks[doc.rootId];
  if (!root) return [];
  return [...root.children];
}

export function buildLASTToBTTBlockIdMap(lastDoc: LASTModel): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<string>();

  for (const block of Object.values(lastDoc.blocks)) {
    const preferred = (block.bttId ?? '').trim();
    const resolved = preferred || String(block.id);

    if (used.has(resolved)) {
      throw new Error(`Duplicate bttId "${resolved}" found in LAST blocks.`);
    }
    used.add(resolved);
    map[block.id] = resolved;
  }

  return map;
}

export function collectBlocksRootFirst(lastDoc: LASTModel): LASTBlockNode[] {
  const ordered: LASTBlockNode[] = [];
  const visited = new Set<LASTBlockId>();

  const visit = (blockId: LASTBlockId): void => {
    if (visited.has(blockId)) return;
    const block = lastDoc.blocks[blockId];
    if (!block) return;

    visited.add(blockId);
    ordered.push(block);
    for (const childId of block.children) {
      visit(childId);
    }
  };

  if (isLASTFragment(lastDoc)) {
    for (const topLevelId of lastDoc.topLevel) {
      visit(topLevelId);
    }
  } else {
    visit(lastDoc.rootId);
  }

  for (const block of Object.values(lastDoc.blocks)) {
    if (!visited.has(block.id)) {
      ordered.push(block);
    }
  }

  return ordered;
}

export function toDocumentModelForBTT(lastDoc: LASTModel): LASTDocument {
  if (!isLASTFragment(lastDoc)) {
    return lastDoc;
  }

  const blocks: Record<LASTBlockId, LASTBlockNode> = {};
  for (const [blockId, block] of Object.entries(lastDoc.blocks) as Array<[LASTBlockId, LASTBlockNode]>) {
    blocks[blockId] = deepClone(block);
  }

  let rootId = 'b_root' as LASTBlockId;
  let suffix = 1;
  while (blocks[rootId]) {
    rootId = `b_root_${suffix}` as LASTBlockId;
    suffix += 1;
  }

  for (const childId of lastDoc.topLevel) {
    const child = blocks[childId];
    if (child) {
      child.parentId = rootId;
    }
  }

  blocks[rootId] = {
    id: rootId,
    type: 'page',
    parentId: null,
    childrenDefined: true,
    children: [...lastDoc.topLevel],
    payload: {
      style: {
        align: 'left',
      },
      inlines: [],
    },
  } as LASTBlockNode;

  return {
    schema: lastDoc.schema,
    version: lastDoc.version,
    id: lastDoc.id,
    rootId,
    blocks,
    indexes: {
      byType: {},
      textScopes: {},
      textScopeByBlockId: {},
    },
    ...(lastDoc.meta ? { meta: deepClone(lastDoc.meta) } : {}),
  };
}

export function toRawBlock(block: LASTBlockNode, lastToBttBlockId: Readonly<Record<string, string>>): LarkDocxBlock {
  const blockType = LAST_TO_LARK_BLOCK_TYPE[block.type];
  const blockBttId = lastToBttBlockId[block.id] ?? String(block.id);
  const parentBttId = block.parentId ? (lastToBttBlockId[block.parentId] ?? String(block.parentId)) : '';
  const childrenBttIds = block.children.map((childId) => lastToBttBlockId[childId] ?? String(childId));

  const base: LarkDocxBlock = {
    block_id: blockBttId,
    parent_id: parentBttId,
    block_type: blockType,
    ...(block.childrenDefined === false ? {} : { children: childrenBttIds }),
  };

  if (isTextualType(block.type)) {
    const textualBlock = block as LASTTextualBlock<LASTTextualBlockType>;
    return {
      ...base,
      ...lastTextPayloadToLark(block.type, textualBlock.payload, lastToBttBlockId),
    };
  }

  if (block.type === 'callout') {
    const callout: Record<string, unknown> = {};
    if (block.payload.backgroundColor !== undefined) {
      if (typeof block.payload.backgroundColor === 'number') {
        callout.background_color = block.payload.backgroundColor;
      } else {
        callout.background_color = CALLOUT_BG_TO_NUM[block.payload.backgroundColor];
      }
    }
    if (block.payload.borderColor !== undefined) {
      if (typeof block.payload.borderColor === 'number') {
        callout.border_color = block.payload.borderColor;
      } else {
        callout.border_color = CALLOUT_BORDER_TO_NUM[block.payload.borderColor];
      }
    }
    if (block.payload.textColor !== undefined) {
      if (typeof block.payload.textColor === 'number') {
        callout.text_color = block.payload.textColor;
      } else {
        callout.text_color = CALLOUT_BORDER_TO_NUM[block.payload.textColor];
      }
    }
    if (block.payload.emojiId !== undefined) {
      callout.emoji_id = block.payload.emojiId;
    }
    return {
      ...base,
      callout,
    };
  }

  if (block.type === 'divider') {
    return {
      ...base,
      divider: {},
    };
  }

  if (block.type === 'file') {
    const file: Record<string, unknown> = {};
    if (block.payload.name !== undefined) {
      file.name = block.payload.name;
    }
    if (block.payload.token !== undefined) {
      file.token = block.payload.token;
    }
    if (block.payload.viewType !== undefined) {
      file.view_type = block.payload.viewType;
    }
    return {
      ...base,
      file,
    };
  }

  if (block.type === 'bitable') {
    const bitable: Record<string, unknown> = {};
    if (block.payload.token !== undefined) {
      bitable.token = block.payload.token;
    }
    if (block.payload.viewType !== undefined) {
      bitable.view_type = block.payload.viewType;
    }
    return {
      ...base,
      bitable,
    };
  }

  if (block.type === 'chat_card') {
    const chatCard: Record<string, unknown> = {
      chat_id: block.payload.chatId,
    };
    const align = toAlignNumber(block.payload.align);
    if (align !== undefined) {
      chatCard.align = align;
    }
    return {
      ...base,
      chat_card: chatCard,
    };
  }

  if (block.type === 'diagram') {
    const diagram: Record<string, unknown> = {};
    if (block.payload.diagramType !== undefined) {
      diagram.diagram_type = block.payload.diagramType;
    }
    return {
      ...base,
      diagram,
    };
  }

  if (block.type === 'grid') {
    const grid: Record<string, unknown> = {};
    if (block.payload.columnSize !== undefined) {
      grid.column_size = block.payload.columnSize;
    }
    return {
      ...base,
      grid,
    };
  }

  if (block.type === 'grid_column') {
    const gridColumn: Record<string, unknown> = {};
    if (block.payload.widthRatio !== undefined) {
      gridColumn.width_ratio = block.payload.widthRatio;
    }
    return {
      ...base,
      grid_column: gridColumn,
    };
  }

  if (block.type === 'iframe') {
    const component: Record<string, unknown> = {};
    if (block.payload.component.iframeType !== undefined) {
      if (typeof block.payload.component.iframeType === 'number') {
        component.iframe_type = block.payload.component.iframeType;
      } else {
        component.iframe_type = IFRAME_TYPE_TO_NUM[block.payload.component.iframeType];
      }
    }
    if (block.payload.component.url !== undefined) {
      component.url = block.payload.component.url;
    }
    return {
      ...base,
      iframe: {
        component,
      },
    };
  }

  if (block.type === 'image' || block.type === 'board') {
    const imageLike: Record<string, unknown> = {};
    if (block.payload.width !== undefined) {
      imageLike.width = block.payload.width;
    }
    if (block.payload.height !== undefined) {
      imageLike.height = block.payload.height;
    }
    if (block.payload.token !== undefined) {
      imageLike.token = block.payload.token;
    }
    const align = toAlignNumber(block.payload.align);
    if (align !== undefined) {
      imageLike.align = align;
    }
    if (block.payload.caption) {
      imageLike.caption = {
        content: block.payload.caption.content,
      };
    }
    if (block.payload.scale !== undefined) {
      imageLike.scale = block.payload.scale;
    }
    return {
      ...base,
      [block.type]: imageLike,
    };
  }

  if (block.type === 'table') {
    const property: Record<string, unknown> = {};
    if (block.payload.rowSize !== undefined) {
      property.row_size = block.payload.rowSize;
    }
    if (block.payload.columnSize !== undefined) {
      property.column_size = block.payload.columnSize;
    }
    if (block.payload.mergeInfo !== undefined) {
      property.merge_info = block.payload.mergeInfo.map((item) => ({
        ...(item.rowSpan !== undefined ? { row_span: item.rowSpan } : {}),
        ...(item.colSpan !== undefined ? { col_span: item.colSpan } : {}),
      }));
    }
    if (block.payload.columnWidth !== undefined) {
      property.column_width = block.payload.columnWidth;
    }
    if (block.payload.headerColumn !== undefined) {
      property.header_column = block.payload.headerColumn;
    }
    if (block.payload.headerRow !== undefined) {
      property.header_row = block.payload.headerRow;
    }
    return {
      ...base,
      table: {
        ...(block.payload.cells !== undefined
          ? {
              cells: block.payload.cells.map((cellId) => lastToBttBlockId[cellId] ?? String(cellId)),
            }
          : {}),
        ...(Object.keys(property).length > 0 ? { property } : {}),
      },
    };
  }

  if (block.type === 'table_cell') {
    return {
      ...base,
      table_cell: {},
    };
  }

  if (block.type === 'mindnote') {
    const mindnote: Record<string, unknown> = {};
    if (block.payload.token !== undefined) {
      mindnote.token = block.payload.token;
    }
    return {
      ...base,
      mindnote,
    };
  }

  if (block.type === 'sheet') {
    const sheet: Record<string, unknown> = {};
    if (block.payload.token !== undefined) {
      sheet.token = block.payload.token;
    }
    if (block.payload.rowSize !== undefined) {
      sheet.row_size = block.payload.rowSize;
    }
    if (block.payload.columnSize !== undefined) {
      sheet.column_size = block.payload.columnSize;
    }
    return {
      ...base,
      sheet,
    };
  }

  if (block.type === 'view') {
    const view: Record<string, unknown> = {};
    if (block.payload.viewType !== undefined) {
      view.view_type = block.payload.viewType;
    }
    return {
      ...base,
      view,
    };
  }

  if (block.type === 'quote_container') {
    return {
      ...base,
      quote_container: {},
    };
  }

  if (block.type === 'synced_block') {
    const referenceSynced: Record<string, unknown> = {};
    if (block.payload.sourceDocumentId !== undefined) {
      referenceSynced.source_document_id = block.payload.sourceDocumentId;
    }
    if (block.payload.sourceBlockId !== undefined) {
      referenceSynced.source_block_id = block.payload.sourceBlockId;
    }
    return {
      ...base,
      reference_synced: referenceSynced,
    };
  }

  throw new Error(`Unsupported LAST block type in toRawBlock: ${(block as LASTBlockNode).type}`);
}
