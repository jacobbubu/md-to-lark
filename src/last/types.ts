/**
 * LAST (Lark AST) schema for the pipeline:
 *   Markdown (GFM) -> HAST -> LAST -> Feishu Docx
 *
 * Design goals:
 * 1) Unambiguous rendering to Feishu docx blocks.
 * 2) Regex-capable find/replace in top-level text block scopes.
 * 3) Future selector-based rewrite support.
 */

export const LAST_SCHEMA = 'LAST';
export const LAST_VERSION = '1.0.0';

export type LASTDocId = `doc_${string}`;
export type LASTBlockId = `b_${string}`;
export type LASTInlineId = `i_${string}`;
export type LASTScopeId = `scope_${string}`;

export type LASTScalar = string | number | boolean | null;

export interface LASTSourcePos {
  line: number;
  column: number;
  offset: number;
}

export interface LASTSourceRange {
  file?: string;
  start: LASTSourcePos;
  end: LASTSourcePos;
}

/**
 * Extra metadata for selector/query engines.
 * - classes/labels/attrs are intentionally generic for future selectors.
 */
export interface LASTSelectorMeta {
  classes?: string[];
  labels?: string[];
  attrs?: Record<string, LASTScalar>;
}

export interface LASTNodeMeta {
  /**
   * Optional source BTT block/element id for roundtrip alignment.
   * - For block nodes: usually raw `block_id` from BTT.
   * - For inline nodes: can be a synthetic path such as `${block_id}/elements/${index}`.
   */
  bttId?: string;
  source?: LASTSourceRange[];
  selector?: LASTSelectorMeta;
}

/**
 * Feishu block type names represented in LAST.
 * This is a target-facing enum to keep rendering deterministic.
 */
export type LASTFeishuBlockType =
  | 'page'
  | 'text'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'heading7'
  | 'heading8'
  | 'heading9'
  | 'bullet'
  | 'ordered'
  | 'code'
  | 'quote'
  | 'todo'
  | 'bitable'
  | 'callout'
  | 'chat_card'
  | 'diagram'
  | 'divider'
  | 'file'
  | 'grid'
  | 'grid_column'
  | 'iframe'
  | 'image'
  | 'mindnote'
  | 'sheet'
  | 'table'
  | 'table_cell'
  | 'view'
  | 'quote_container'
  | 'board'
  | 'synced_block';

export type LASTTextualBlockType =
  | 'page'
  | 'text'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'heading7'
  | 'heading8'
  | 'heading9'
  | 'bullet'
  | 'ordered'
  | 'code'
  | 'quote'
  | 'todo';

export type LASTAlign = 'left' | 'center' | 'right';
export type LASTAlignValue = LASTAlign | number;

/**
 * Block-level background color enum from docx OpenAPI style.background_color.
 * Kept as OpenAPI canonical names to ensure 1:1 roundtrip.
 */
export type LASTBlockBackgroundColor =
  | 'LightGrayBackground'
  | 'LightRedBackground'
  | 'LightOrangeBackground'
  | 'LightYellowBackground'
  | 'LightGreenBackground'
  | 'LightBlueBackground'
  | 'LightPurpleBackground'
  | 'PaleGrayBackground'
  | 'DarkGrayBackground'
  | 'DarkRedBackground'
  | 'DarkOrangeBackground'
  | 'DarkYellowBackground'
  | 'DarkGreenBackground'
  | 'DarkBlueBackground'
  | 'DarkPurpleBackground';

/**
 * Block-level indentation enum from docx OpenAPI style.indentation_level.
 */
export type LASTIndentationLevel = 'NoIndent' | 'OneLevelIndent';

/**
 * Keep color token as a finite set to avoid style ambiguity.
 */
export type LASTColorToken =
  | 'light_pink'
  | 'light_orange'
  | 'light_yellow'
  | 'light_green'
  | 'light_blue'
  | 'light_purple'
  | 'light_gray'
  | 'dark_pink'
  | 'dark_orange'
  | 'dark_yellow'
  | 'dark_green'
  | 'dark_blue'
  | 'dark_purple'
  | 'dark_gray'
  | 'dark_silver_gray';

/**
 * Canonical code language key used inside LAST.
 * Renderer owns mapping from this key to Feishu enum values.
 */
export type LASTCodeLanguage = string;

export type LASTObjType = 'doc' | 'sheet' | 'bitable' | 'mindnote' | 'file' | 'slide' | 'wiki' | 'docx';

export type LASTIframeType =
  | 'bilibili'
  | 'xigua'
  | 'youku'
  | 'airtable'
  | 'baidu_map'
  | 'gaode_map'
  | 'figma'
  | 'modao'
  | 'canva'
  | 'codepen'
  | 'feishu_wenjuan'
  | 'jinshuju';

export interface LASTLink {
  url: string;
}

/**
 * Inline marks keep presence semantics:
 * - missing field means source did not provide that mark flag.
 * - explicit false/true means source explicitly provided it.
 */
export interface LASTInlineMarks {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  inlineCode?: boolean;
  textColor?: LASTColorToken | null;
  backgroundColor?: LASTColorToken | null;
  link?: LASTLink | null;
  /**
   * Optional comment IDs attached to the text element style.
   * Preserve as-is for exact API roundtrip.
   */
  commentIds?: string[];
}

export interface LASTInlineBase<TKind extends LASTInlineKind> extends LASTNodeMeta {
  id: LASTInlineId;
  kind: TKind;
  marks: LASTInlineMarks;
}

export type LASTInlineKind =
  | 'text_run'
  | 'mention_user'
  | 'equation'
  | 'mention_doc'
  | 'reminder'
  | 'inline_block'
  | 'inline_file'
  | 'link_preview';

export interface LASTTextRunInline extends LASTInlineBase<'text_run'> {
  text?: string;
}

export interface LASTEquationInline extends LASTInlineBase<'equation'> {
  latex?: string;
}

export interface LASTMentionUserInline extends LASTInlineBase<'mention_user'> {
  /** SDK field: mention_user.user_id */
  userId?: string;
}

export type LASTMentionDocFallbackType = 'FallbackToLink' | 'FallbackToText';

export interface LASTMentionDocInline extends LASTInlineBase<'mention_doc'> {
  token?: string;
  /**
   * Keep unknown numeric enum values as-is to avoid lossy normalization.
   */
  objType?: LASTObjType | number;
  url?: string;
  title?: string;
  /**
   * Optional fallback strategy in OpenAPI write APIs.
   */
  fallbackType?: LASTMentionDocFallbackType;
}

export interface LASTReminderInline extends LASTInlineBase<'reminder'> {
  /** SDK fields: reminder.create_user_id / expire_time / notify_time */
  createUserId?: string;
  isNotify?: boolean;
  isWholeDay?: boolean;
  expireTime?: string;
  notifyTime?: string;
}

export interface LASTInlineBlockInline extends LASTInlineBase<'inline_block'> {
  blockId?: LASTBlockId;
}

export interface LASTInlineFileInline extends LASTInlineBase<'inline_file'> {
  fileToken?: string;
  sourceBlockId?: LASTBlockId;
  inlineBlock: {
    blockId?: LASTBlockId;
  };
}

export type LASTLinkPreviewUrlType = 'Project' | 'Undefined';

export interface LASTLinkPreviewInline extends LASTInlineBase<'link_preview'> {
  /** SDK fields: link_preview.title / url / url_type */
  title?: string;
  url?: string;
  urlType?: LASTLinkPreviewUrlType;
}

export type LASTInlineNode =
  | LASTTextRunInline
  | LASTMentionUserInline
  | LASTEquationInline
  | LASTMentionDocInline
  | LASTReminderInline
  | LASTInlineBlockInline
  | LASTInlineFileInline
  | LASTLinkPreviewInline;

/**
 * Shared payload used by all textual block types.
 * - done/folded/wrap keep "presence semantics":
 *   undefined means "not provided by source", not a defaulted false/true.
 * - align/language also keep presence semantics for BTT roundtrip.
 * - done: meaningful for todo blocks when provided.
 * - backgroundColor/indentationLevel/sequence come from SDK style fields:
 *   background_color / indentation_level / sequence.
 * - language: meaningful for code blocks when provided.
 */
export interface LASTTextPayload {
  style: {
    align?: LASTAlignValue;
    done?: boolean;
    folded?: boolean;
    wrap?: boolean;
    backgroundColor?: LASTBlockBackgroundColor;
    indentationLevel?: LASTIndentationLevel;
    sequence?: string;
    language?: LASTCodeLanguage | null;
  };
  inlines: LASTInlineNode[];
}

export interface LASTBlockBase<TType extends LASTFeishuBlockType> extends LASTNodeMeta {
  id: LASTBlockId;
  type: TType;
  parentId: LASTBlockId | null;
  /**
   * Preserve source-field presence for BTT roundtrip:
   * - true/undefined: emit `children` in BTT output
   * - false: omit `children` field in BTT output
   */
  childrenDefined?: boolean;
  children: LASTBlockId[];
}

export interface LASTTextualBlock<TType extends LASTTextualBlockType> extends LASTBlockBase<TType> {
  payload: LASTTextPayload;
}

export interface LASTCalloutBlock extends LASTBlockBase<'callout'> {
  /**
   * SDK fields:
   * - callout.background_color
   * - callout.border_color
   * - callout.text_color
   * - callout.emoji_id
   */
  payload: {
    backgroundColor?:
      | 'light_red'
      | 'light_orange'
      | 'light_yellow'
      | 'light_green'
      | 'light_blue'
      | 'light_purple'
      | 'light_gray'
      | 'dark_red'
      | 'dark_orange'
      | 'dark_yellow'
      | 'dark_green'
      | 'dark_blue'
      | 'dark_purple'
      | 'dark_gray'
      | number;
    borderColor?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray' | number;
    textColor?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray' | number;
    emojiId?: string;
  };
}

export interface LASTDividerBlock extends LASTBlockBase<'divider'> {
  /**
   * SDK/doc response is empty object for divider payload.
   */
  payload: Record<never, never>;
}

export interface LASTFileBlock extends LASTBlockBase<'file'> {
  /**
   * SDK fields:
   * - file.token
   * - file.name
   * - file.view_type
   */
  payload: {
    token?: string;
    name?: string;
    viewType?: number;
  };
}

export interface LASTGridBlock extends LASTBlockBase<'grid'> {
  /**
   * SDK field: grid.column_size
   */
  payload: {
    columnSize?: number;
  };
}

export interface LASTGridColumnBlock extends LASTBlockBase<'grid_column'> {
  /**
   * SDK field: grid_column.width_ratio
   */
  payload: {
    widthRatio?: number;
  };
}

export interface LASTIframeBlock extends LASTBlockBase<'iframe'> {
  /**
   * SDK shape:
   * iframe.component.iframe_type / iframe.component.url
   */
  payload: {
    component: {
      /**
       * Keep unknown numeric enum values as-is to avoid lossy normalization.
       */
      iframeType?: LASTIframeType | number;
      /** URL-decoded in LAST. Renderer may encode before API call. */
      url?: string;
    };
  };
}

export interface LASTImageLikePayload {
  /**
   * SDK fields (image/board):
   * width/height/token/align, optional caption/content, optional scale.
   * `scale` is crucial for roundtrip fidelity on image blocks.
   */
  width?: number;
  height?: number;
  token?: string;
  align?: LASTAlignValue;
  caption?: {
    content?: string;
  };
  scale?: number;
}

export interface LASTImageBlock extends LASTBlockBase<'image'> {
  payload: LASTImageLikePayload;
}

export interface LASTBoardBlock extends LASTBlockBase<'board'> {
  payload: LASTImageLikePayload;
}

export interface LASTTableMergeInfo {
  rowSpan?: number;
  colSpan?: number;
}

export interface LASTTableBlock extends LASTBlockBase<'table'> {
  /**
   * SDK shape:
   * table.cells + table.property(row_size/column_size/column_width/merge_info/header_*).
   */
  payload: {
    /** Row-major flattened table cell block IDs. */
    cells?: LASTBlockId[];
    rowSize?: number;
    columnSize?: number;
    columnWidth?: number[];
    /**
     * Optional source markdown table column alignment hints.
     * This is pipeline metadata used by publish heuristics:
     * - if any column alignment is explicitly declared in markdown,
     *   numeric-column auto right-align should be disabled.
     * Not emitted to Feishu docx create payload directly.
     */
    columnAlign?: Array<LASTAlignValue | undefined>;
    headerColumn?: boolean;
    headerRow?: boolean;
    mergeInfo?: LASTTableMergeInfo[];
  };
}

/**
 * Strong block payloads inferred from:
 * - historical roundtrip corpus
 * - @larksuiteoapi/node-sdk docx v1 type declarations
 * - Feishu docx OpenAPI docs
 *
 * These are intentionally explicit (no generic opaque payload),
 * so LAST keeps unambiguous rendering semantics.
 */
export interface LASTBitableBlock extends LASTBlockBase<'bitable'> {
  /**
   * SDK fields: bitable.token / bitable.view_type
   */
  payload: {
    token?: string;
    viewType?: number;
  };
}

export interface LASTChatCardBlock extends LASTBlockBase<'chat_card'> {
  /**
   * SDK fields: chat_card.chat_id / chat_card.align
   */
  payload: {
    chatId: string;
    align?: LASTAlignValue;
  };
}

export interface LASTDiagramBlock extends LASTBlockBase<'diagram'> {
  /**
   * SDK field: diagram.diagram_type
   */
  payload: {
    diagramType?: number;
  };
}

export interface LASTTableCellBlock extends LASTBlockBase<'table_cell'> {
  /**
   * table_cell payload is empty in SDK/list responses; cell content is expressed via children.
   */
  payload: Record<never, never>;
}

export interface LASTMindnoteBlock extends LASTBlockBase<'mindnote'> {
  /**
   * SDK field: mindnote.token
   */
  payload: {
    token?: string;
  };
}

export interface LASTSheetBlock extends LASTBlockBase<'sheet'> {
  /**
   * SDK fields: sheet.token / sheet.row_size / sheet.column_size
   */
  payload: {
    token?: string;
    rowSize?: number;
    columnSize?: number;
  };
}

export interface LASTViewBlock extends LASTBlockBase<'view'> {
  /**
   * SDK field: view.view_type
   */
  payload: {
    viewType?: number;
  };
}

export interface LASTQuoteContainerBlock extends LASTBlockBase<'quote_container'> {
  /**
   * quote_container payload is empty in SDK/list responses.
   */
  payload: Record<never, never>;
}

/**
 * OpenAPI payload key is `reference_synced`.
 * LAST keeps canonical type name `synced_block` and field names in camelCase.
 */
export interface LASTSyncedBlock extends LASTBlockBase<'synced_block'> {
  payload: {
    sourceDocumentId?: string;
    sourceBlockId?: string;
  };
}

export type LASTBlockNode =
  | LASTTextualBlock<'page'>
  | LASTTextualBlock<'text'>
  | LASTTextualBlock<'heading1'>
  | LASTTextualBlock<'heading2'>
  | LASTTextualBlock<'heading3'>
  | LASTTextualBlock<'heading4'>
  | LASTTextualBlock<'heading5'>
  | LASTTextualBlock<'heading6'>
  | LASTTextualBlock<'heading7'>
  | LASTTextualBlock<'heading8'>
  | LASTTextualBlock<'heading9'>
  | LASTTextualBlock<'bullet'>
  | LASTTextualBlock<'ordered'>
  | LASTTextualBlock<'code'>
  | LASTTextualBlock<'quote'>
  | LASTTextualBlock<'todo'>
  | LASTBitableBlock
  | LASTChatCardBlock
  | LASTDiagramBlock
  | LASTTableCellBlock
  | LASTCalloutBlock
  | LASTDividerBlock
  | LASTFileBlock
  | LASTGridBlock
  | LASTGridColumnBlock
  | LASTIframeBlock
  | LASTImageBlock
  | LASTBoardBlock
  | LASTTableBlock
  | LASTMindnoteBlock
  | LASTSheetBlock
  | LASTViewBlock
  | LASTQuoteContainerBlock
  | LASTSyncedBlock;

/**
 * One segment in the top-level TextBlock search projection.
 * - [from, to) points into normalizedText.
 * - editable=false prevents replacements from mutating atomic inline nodes.
 */
export interface LASTTextSegment {
  inlineId: LASTInlineId;
  inlineKind: LASTInlineKind;
  from: number;
  to: number;
  editable: boolean;
}

/**
 * Search scope is built per top-level textual block.
 * Search/replace MUST happen inside a single scope.
 */
export interface LASTTextScope {
  id: LASTScopeId;
  blockId: LASTBlockId;
  blockType: LASTTextualBlockType;
  normalizedText: string;
  segments: LASTTextSegment[];
}

export interface LASTIndexes {
  /** Quick lookup by block type for selector engines. */
  byType: Partial<Record<LASTFeishuBlockType, LASTBlockId[]>>;
  /** Required for requirement #2 (regex find/replace in top-level text scopes). */
  textScopes: Record<LASTScopeId, LASTTextScope>;
  /** Convenience mapping: block -> scope. */
  textScopeByBlockId: Partial<Record<LASTBlockId, LASTScopeId>>;
}

export interface LASTBase {
  schema: typeof LAST_SCHEMA;
  version: typeof LAST_VERSION;
  id: LASTDocId;
  blocks: Record<LASTBlockId, LASTBlockNode>;
  indexes: LASTIndexes;
  meta?: {
    title?: string;
    createdAt?: string;
    updatedAt?: string;
    attrs?: Record<string, LASTScalar>;
  };
}

/**
 * Full document model aligned with Feishu/BTT root page.
 */
export interface LASTDocument extends LASTBase {
  mode?: 'document';
  rootId: LASTBlockId;
}

/**
 * Fragment model for pipeline intermediate representation.
 * - No mandatory page root block.
 * - topLevel represents root-level blocks in tree order.
 */
export interface LASTFragment extends LASTBase {
  mode: 'fragment';
  topLevel: LASTBlockId[];
}

export type LASTModel = LASTDocument | LASTFragment;

/**
 * Selector AST for future rewrite operations.
 */
export type LASTSelector =
  | LASTSimpleSelector
  | LASTSelectorAnd
  | LASTSelectorOr
  | LASTSelectorNot
  | LASTSelectorRelation;

export interface LASTSimpleSelector {
  op: 'match';
  target?: 'block' | 'inline' | 'any';
  ids?: string[];
  types?: string[];
  classes?: string[];
  labels?: string[];
  attrs?: LASTAttrPredicate[];
  hasText?: {
    pattern: string;
    flags?: string;
    use: 'normalized_scope_text' | 'render_text';
  };
}

export interface LASTSelectorAnd {
  op: 'and';
  selectors: LASTSelector[];
}

export interface LASTSelectorOr {
  op: 'or';
  selectors: LASTSelector[];
}

export interface LASTSelectorNot {
  op: 'not';
  selector: LASTSelector;
}

export interface LASTSelectorRelation {
  op: 'relation';
  combinator: 'descendant' | 'child';
  left: LASTSelector;
  right: LASTSelector;
}

export interface LASTAttrPredicate {
  key: string;
  cmp: '=' | '!=' | '^=' | '$=' | '*=' | 'exists';
  value?: LASTScalar;
}

/**
 * Rewrite contracts (optional but type-safe) for next phase.
 */
export type LASTRewriteRule = LASTTextReplaceRule | LASTSelectorReplaceRule;

export interface LASTTextReplaceRule {
  kind: 'text_replace';
  scope: {
    blockIds?: LASTBlockId[];
    selector?: LASTSelector;
  };
  find:
    | {
        mode: 'literal';
        value: string;
        caseSensitive?: boolean;
      }
    | {
        mode: 'regex';
        pattern: string;
        flags?: string;
      };
  replace: string;
}

export interface LASTSelectorReplaceRule {
  kind: 'selector_replace';
  selector: LASTSelector;
  action:
    | {
        type: 'set_attr';
        key: string;
        value: LASTScalar;
      }
    | {
        type: 'remove_attr';
        key: string;
      }
    | {
        type: 'remove_node';
      }
    | {
        type: 'replace_text_payload';
        payload: LASTTextPayload;
      };
}
