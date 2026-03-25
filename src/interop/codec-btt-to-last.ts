import type { BTTDocument } from '../btt/types.js';
import type { LarkDocxBlock } from '../lark/types.js';
import type {
  LASTBlockId,
  LASTBlockNode,
  LASTIndexes,
  LASTInlineId,
  LASTInlineNode,
  LASTModel,
  LASTScopeId,
  LASTTableBlock,
  LASTTextScope,
  LASTTextSegment,
  LASTTextualBlock,
  LASTTextualBlockType,
} from '../last/types.js';
import {
  LARK_TO_LAST_BLOCK_TYPE,
  NUM_TO_CALLOUT_BG,
  NUM_TO_CALLOUT_BORDER,
  NUM_TO_IFRAME_TYPE,
  NUM_TO_OBJ_TYPE,
  deepClone,
  fromAlignNumber,
  isTextualType,
  larkTextPayloadToLast,
} from './codec-shared.js';
import { sortChildrenByTreeOrder } from './codec-last-to-btt.js';

function toSearchText(inline: LASTInlineNode): { text: string; editable: boolean } {
  switch (inline.kind) {
    case 'text_run':
      return { text: inline.text ?? '', editable: true };
    case 'mention_user':
      return { text: inline.userId ?? '', editable: false };
    case 'equation':
      return { text: inline.latex ?? '', editable: false };
    case 'mention_doc':
      return { text: inline.title ?? '', editable: false };
    case 'reminder':
      return { text: '', editable: false };
    case 'inline_block':
      return { text: '', editable: false };
    case 'inline_file':
      return { text: '', editable: false };
    case 'link_preview':
      return { text: inline.title ?? inline.url ?? '', editable: false };
    default:
      return { text: '', editable: false };
  }
}

function isTextualBlockNode(block: LASTBlockNode): block is LASTTextualBlock<LASTTextualBlockType> {
  return isTextualType(block.type);
}

function buildScopeForTopLevelTextBlock(
  scopeId: LASTScopeId,
  block: LASTTextualBlock<LASTTextualBlockType>,
): LASTTextScope {
  let normalizedText = '';
  const segments: LASTTextSegment[] = [];

  for (const inline of block.payload.inlines) {
    const projection = toSearchText(inline);
    if (projection.text.length === 0) continue;

    const from = normalizedText.length;
    normalizedText += projection.text;
    const to = normalizedText.length;

    segments.push({
      inlineId: inline.id,
      inlineKind: inline.kind,
      from,
      to,
      editable: projection.editable,
    });
  }

  return {
    id: scopeId,
    blockId: block.id,
    blockType: block.type,
    normalizedText,
    segments,
  };
}

export function buildLASTIndexes(doc: LASTModel): LASTIndexes {
  const byType: LASTIndexes['byType'] = {};
  for (const block of Object.values(doc.blocks)) {
    const list = byType[block.type] ?? [];
    list.push(block.id);
    byType[block.type] = list;
  }

  const textScopes: Record<LASTScopeId, LASTTextScope> = {};
  const textScopeByBlockId: Partial<Record<LASTBlockId, LASTScopeId>> = {};

  const topLevel = sortChildrenByTreeOrder(doc);
  let scopeCounter = 1;

  for (const childId of topLevel) {
    const child = doc.blocks[childId];
    if (!child || !isTextualBlockNode(child) || child.type === 'page') {
      continue;
    }

    const scopeId = `scope_${scopeCounter}` as LASTScopeId;
    scopeCounter += 1;
    const scope = buildScopeForTopLevelTextBlock(scopeId, child);
    textScopes[scopeId] = scope;
    textScopeByBlockId[child.id] = scopeId;
  }

  return {
    byType,
    textScopes,
    textScopeByBlockId,
  };
}

export interface InlineCounter {
  value: number;
}

function nextInlineId(counter: InlineCounter): LASTInlineId {
  const id = `i_${counter.value}` as LASTInlineId;
  counter.value += 1;
  return id;
}

export function fromRawBlockToLAST(
  rawBlock: LarkDocxBlock,
  inlineCounter: InlineCounter,
  bttToLastBlockId: Readonly<Record<string, LASTBlockId>>,
): LASTBlockNode {
  const type = LARK_TO_LAST_BLOCK_TYPE[rawBlock.block_type];
  if (!type) {
    throw new Error(`Unsupported lark block_type: ${rawBlock.block_type}`);
  }

  const rawBlockId = String(rawBlock.block_id);
  const id = bttToLastBlockId[rawBlockId];
  if (!id) {
    throw new Error(`Missing LAST block id mapping for BTT block "${rawBlockId}".`);
  }

  const parentIdRaw = String(rawBlock.parent_id ?? '');
  const parentId = parentIdRaw ? (bttToLastBlockId[parentIdRaw] ?? (parentIdRaw as LASTBlockId)) : null;
  const childrenDefined = Object.prototype.hasOwnProperty.call(rawBlock, 'children');
  const children = (Array.isArray(rawBlock.children) ? rawBlock.children : []).map((item) => {
    const rawChildId = String(item);
    return (bttToLastBlockId[rawChildId] ?? (rawChildId as LASTBlockId)) as LASTBlockId;
  });

  if (isTextualType(type)) {
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: larkTextPayloadToLast(rawBlock, type, () => nextInlineId(inlineCounter), bttToLastBlockId),
    };
  }

  if (type === 'callout') {
    const callout = (rawBlock.callout ?? {}) as Record<string, unknown>;

    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {
        ...(typeof callout.background_color === 'number'
          ? {
              backgroundColor: NUM_TO_CALLOUT_BG[callout.background_color] ?? callout.background_color,
            }
          : {}),
        ...(typeof callout.border_color === 'number'
          ? {
              borderColor: NUM_TO_CALLOUT_BORDER[callout.border_color] ?? callout.border_color,
            }
          : {}),
        ...(typeof callout.text_color === 'number'
          ? {
              textColor: NUM_TO_CALLOUT_BORDER[callout.text_color] ?? callout.text_color,
            }
          : {}),
        ...(typeof callout.emoji_id === 'string' ? { emojiId: callout.emoji_id } : {}),
      },
    };
  }

  if (type === 'divider') {
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {},
    };
  }

  if (type === 'file') {
    const file = (rawBlock.file ?? {}) as Record<string, unknown>;
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {
        ...(typeof file.name === 'string' ? { name: file.name } : {}),
        ...(typeof file.token === 'string' ? { token: file.token } : {}),
        ...(typeof file.view_type === 'number' ? { viewType: file.view_type } : {}),
      },
    };
  }

  if (type === 'bitable') {
    const bitable = (rawBlock.bitable ?? {}) as Record<string, unknown>;
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {
        ...(typeof bitable.token === 'string' ? { token: bitable.token } : {}),
        ...(typeof bitable.view_type === 'number' ? { viewType: bitable.view_type } : {}),
      },
    };
  }

  if (type === 'chat_card') {
    const chatCard = (rawBlock.chat_card ?? {}) as Record<string, unknown>;
    const align = fromAlignNumber(chatCard.align);
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {
        chatId: typeof chatCard.chat_id === 'string' ? chatCard.chat_id : '',
        ...(align === undefined ? {} : { align }),
      },
    };
  }

  if (type === 'diagram') {
    const diagram = (rawBlock.diagram ?? {}) as Record<string, unknown>;
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {
        ...(typeof diagram.diagram_type === 'number' ? { diagramType: diagram.diagram_type } : {}),
      },
    };
  }

  if (type === 'grid') {
    const grid = (rawBlock.grid ?? {}) as Record<string, unknown>;
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {
        ...(typeof grid.column_size === 'number' ? { columnSize: grid.column_size } : {}),
      },
    };
  }

  if (type === 'grid_column') {
    const gridColumn = (rawBlock.grid_column ?? {}) as Record<string, unknown>;
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {
        ...(typeof gridColumn.width_ratio === 'number' ? { widthRatio: gridColumn.width_ratio } : {}),
      },
    };
  }

  if (type === 'iframe') {
    const iframe = (rawBlock.iframe ?? {}) as Record<string, unknown>;
    const component = (iframe.component ?? {}) as Record<string, unknown>;

    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {
        component: {
          ...(typeof component.iframe_type === 'number'
            ? {
                iframeType: NUM_TO_IFRAME_TYPE[component.iframe_type] ?? component.iframe_type,
              }
            : {}),
          ...(typeof component.url === 'string' ? { url: component.url } : {}),
        },
      },
    };
  }

  if (type === 'image' || type === 'board') {
    const payloadRaw = (rawBlock[type] ?? {}) as Record<string, unknown>;
    const captionRaw = (payloadRaw.caption ?? {}) as Record<string, unknown>;
    const align = fromAlignNumber(payloadRaw.align);
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {
        ...(typeof payloadRaw.width === 'number' ? { width: payloadRaw.width } : {}),
        ...(typeof payloadRaw.height === 'number' ? { height: payloadRaw.height } : {}),
        ...(typeof payloadRaw.token === 'string' ? { token: payloadRaw.token } : {}),
        ...(align === undefined ? {} : { align }),
        ...(typeof payloadRaw.scale === 'number' ? { scale: payloadRaw.scale } : {}),
        ...(Object.prototype.hasOwnProperty.call(payloadRaw, 'caption')
          ? {
              caption: {
                ...(typeof captionRaw.content === 'string' ? { content: captionRaw.content } : {}),
              },
            }
          : {}),
      },
    };
  }

  if (type === 'table') {
    const table = (rawBlock.table ?? {}) as Record<string, unknown>;
    const property = (table.property ?? {}) as Record<string, unknown>;
    const rawCells = Array.isArray(table.cells) ? table.cells : null;
    const mergeInfoRaw = Array.isArray(property.merge_info) ? property.merge_info : null;

    const payload: LASTTableBlock['payload'] = {
      ...(rawCells
        ? {
            cells: rawCells.map((cell) => {
              const rawCellId = String(cell);
              return (bttToLastBlockId[rawCellId] ?? (rawCellId as LASTBlockId)) as LASTBlockId;
            }),
          }
        : {}),
      ...(typeof property.row_size === 'number' ? { rowSize: property.row_size } : {}),
      ...(typeof property.column_size === 'number' ? { columnSize: property.column_size } : {}),
      ...(mergeInfoRaw
        ? {
            mergeInfo: mergeInfoRaw.map((item) => {
              const entry = item as Record<string, unknown>;
              return {
                ...(typeof entry.row_span === 'number' ? { rowSpan: entry.row_span } : {}),
                ...(typeof entry.col_span === 'number' ? { colSpan: entry.col_span } : {}),
              };
            }),
          }
        : {}),
      ...(Array.isArray(property.column_width)
        ? {
            columnWidth: property.column_width.filter((item) => typeof item === 'number') as number[],
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(property, 'header_column')
        ? { headerColumn: Boolean(property.header_column) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(property, 'header_row')
        ? { headerRow: Boolean(property.header_row) }
        : {}),
    };

    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload,
    };
  }

  if (type === 'table_cell') {
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {},
    };
  }

  if (type === 'mindnote') {
    const mindnote = (rawBlock.mindnote ?? {}) as Record<string, unknown>;
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {
        ...(typeof mindnote.token === 'string' ? { token: mindnote.token } : {}),
      },
    };
  }

  if (type === 'sheet') {
    const sheet = (rawBlock.sheet ?? {}) as Record<string, unknown>;
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {
        ...(typeof sheet.token === 'string' ? { token: sheet.token } : {}),
        ...(typeof sheet.row_size === 'number' ? { rowSize: sheet.row_size } : {}),
        ...(typeof sheet.column_size === 'number' ? { columnSize: sheet.column_size } : {}),
      },
    };
  }

  if (type === 'view') {
    const view = (rawBlock.view ?? {}) as Record<string, unknown>;
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {
        ...(typeof view.view_type === 'number' ? { viewType: view.view_type } : {}),
      },
    };
  }

  if (type === 'quote_container') {
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {},
    };
  }

  if (type === 'synced_block') {
    const synced = (rawBlock.reference_synced ?? rawBlock.synced_block ?? {}) as Record<string, unknown>;
    return {
      id,
      bttId: rawBlockId,
      type,
      parentId,
      children,
      childrenDefined,
      payload: {
        ...(typeof synced.source_document_id === 'string' ? { sourceDocumentId: synced.source_document_id } : {}),
        ...(typeof synced.source_block_id === 'string' ? { sourceBlockId: synced.source_block_id } : {}),
      },
    };
  }

  throw new Error(`Unsupported lark block type mapping in fromRawBlockToLAST: ${type}`);
}

export function flattenTreeBlocks(root: BTTDocument['root']): LarkDocxBlock[] {
  const list: LarkDocxBlock[] = [];

  const visit = (node: BTTDocument['root']): void => {
    list.push(deepClone(node.rawBlock));
    for (const child of node.children) {
      visit(child);
    }
  };

  visit(root);
  return list;
}
