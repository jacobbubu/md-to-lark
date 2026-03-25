import type { BTTDocument } from '../btt/types.js';
import type { LarkDocxBlock } from '../lark/types.js';
import { LAST_TEXTUAL_BLOCK_TYPE_SET } from '../last/textual-block-types.js';
import type {
  LASTAlign,
  LASTBlockBackgroundColor,
  LASTBlockId,
  LASTBlockNode,
  LASTCalloutBlock,
  LASTCodeLanguage,
  LASTColorToken,
  LASTDocument,
  LASTFragment,
  LASTFeishuBlockType,
  LASTIframeType,
  LASTIndexes,
  LASTInlineId,
  LASTInlineMarks,
  LASTModel,
  LASTInlineNode,
  LASTIndentationLevel,
  LASTLinkPreviewUrlType,
  LASTMentionDocFallbackType,
  LASTObjType,
  LASTScopeId,
  LASTTableBlock,
  LASTTextPayload,
  LASTTextScope,
  LASTTextSegment,
  LASTTextualBlock,
  LASTTextualBlockType,
} from '../last/types.js';

export const LAST_TO_LARK_BLOCK_TYPE: Record<LASTFeishuBlockType, number> = {
  page: 1,
  text: 2,
  heading1: 3,
  heading2: 4,
  heading3: 5,
  heading4: 6,
  heading5: 7,
  heading6: 8,
  heading7: 9,
  heading8: 10,
  heading9: 11,
  bullet: 12,
  ordered: 13,
  code: 14,
  quote: 15,
  todo: 17,
  bitable: 18,
  callout: 19,
  chat_card: 20,
  diagram: 21,
  divider: 22,
  file: 23,
  grid: 24,
  grid_column: 25,
  iframe: 26,
  image: 27,
  table: 31,
  table_cell: 32,
  view: 33,
  quote_container: 34,
  board: 43,
  mindnote: 29,
  sheet: 30,
  synced_block: 999,
};

export const LARK_TO_LAST_BLOCK_TYPE: Readonly<Record<number, LASTFeishuBlockType>> = Object.freeze(
  Object.fromEntries(
    Object.entries(LAST_TO_LARK_BLOCK_TYPE).map(([lastType, larkType]) => [larkType, lastType]),
  ) as Record<number, LASTFeishuBlockType>,
);

const TEXTUAL_PAYLOAD_KEY: Record<LASTTextualBlockType, string> = {
  page: 'page',
  text: 'text',
  heading1: 'heading1',
  heading2: 'heading2',
  heading3: 'heading3',
  heading4: 'heading4',
  heading5: 'heading5',
  heading6: 'heading6',
  heading7: 'heading7',
  heading8: 'heading8',
  heading9: 'heading9',
  bullet: 'bullet',
  ordered: 'ordered',
  code: 'code',
  quote: 'quote',
  todo: 'todo',
};

const ALIGN_TO_NUM: Record<LASTAlign, number> = {
  left: 1,
  center: 2,
  right: 3,
};

const NUM_TO_ALIGN: Readonly<Record<number, LASTAlign>> = {
  1: 'left',
  2: 'center',
  3: 'right',
};

const BLOCK_BG_TO_API: Readonly<Record<LASTBlockBackgroundColor, string>> = {
  LightGrayBackground: 'LightGrayBackground',
  LightRedBackground: 'LightRedBackground',
  LightOrangeBackground: 'LightOrangeBackground',
  LightYellowBackground: 'LightYellowBackground',
  LightGreenBackground: 'LightGreenBackground',
  LightBlueBackground: 'LightBlueBackground',
  LightPurpleBackground: 'LightPurpleBackground',
  PaleGrayBackground: 'PaleGrayBackground',
  DarkGrayBackground: 'DarkGrayBackground',
  DarkRedBackground: 'DarkRedBackground',
  DarkOrangeBackground: 'DarkOrangeBackground',
  DarkYellowBackground: 'DarkYellowBackground',
  DarkGreenBackground: 'DarkGreenBackground',
  DarkBlueBackground: 'DarkBlueBackground',
  DarkPurpleBackground: 'DarkPurpleBackground',
};

const API_TO_BLOCK_BG: Readonly<Record<string, LASTBlockBackgroundColor>> = Object.freeze(
  Object.fromEntries(
    Object.keys(BLOCK_BG_TO_API).map((token) => [BLOCK_BG_TO_API[token as LASTBlockBackgroundColor], token]),
  ) as Record<string, LASTBlockBackgroundColor>,
);

const INDENT_TO_API: Readonly<Record<LASTIndentationLevel, string>> = {
  NoIndent: 'NoIndent',
  OneLevelIndent: 'OneLevelIndent',
};

const API_TO_INDENT: Readonly<Record<string, LASTIndentationLevel>> = Object.freeze(
  Object.fromEntries(Object.keys(INDENT_TO_API).map((k) => [INDENT_TO_API[k as LASTIndentationLevel], k])) as Record<
    string,
    LASTIndentationLevel
  >,
);

const COLOR_TO_NUM: Record<LASTColorToken, number> = {
  light_pink: 1,
  light_orange: 2,
  light_yellow: 3,
  light_green: 4,
  light_blue: 5,
  light_purple: 6,
  light_gray: 7,
  dark_pink: 8,
  dark_orange: 9,
  dark_yellow: 10,
  dark_green: 11,
  dark_blue: 12,
  dark_purple: 13,
  dark_gray: 14,
  dark_silver_gray: 15,
};

const NUM_TO_COLOR: Readonly<Record<number, LASTColorToken>> = {
  1: 'light_pink',
  2: 'light_orange',
  3: 'light_yellow',
  4: 'light_green',
  5: 'light_blue',
  6: 'light_purple',
  7: 'light_gray',
  8: 'dark_pink',
  9: 'dark_orange',
  10: 'dark_yellow',
  11: 'dark_green',
  12: 'dark_blue',
  13: 'dark_purple',
  14: 'dark_gray',
  15: 'dark_silver_gray',
};

type KnownCalloutBackgroundColor = Exclude<NonNullable<LASTCalloutBlock['payload']['backgroundColor']>, number>;
type KnownCalloutBorderColor = Exclude<NonNullable<LASTCalloutBlock['payload']['borderColor']>, number>;

export const CALLOUT_BG_TO_NUM: Record<KnownCalloutBackgroundColor, number> = {
  light_red: 1,
  light_orange: 2,
  light_yellow: 3,
  light_green: 4,
  light_blue: 5,
  light_purple: 6,
  light_gray: 7,
  dark_red: 8,
  dark_orange: 9,
  dark_yellow: 10,
  dark_green: 11,
  dark_blue: 12,
  dark_purple: 13,
  dark_gray: 14,
};

export const NUM_TO_CALLOUT_BG: Readonly<Record<number, KnownCalloutBackgroundColor>> = {
  1: 'light_red',
  2: 'light_orange',
  3: 'light_yellow',
  4: 'light_green',
  5: 'light_blue',
  6: 'light_purple',
  7: 'light_gray',
  8: 'dark_red',
  9: 'dark_orange',
  10: 'dark_yellow',
  11: 'dark_green',
  12: 'dark_blue',
  13: 'dark_purple',
  14: 'dark_gray',
};

export const CALLOUT_BORDER_TO_NUM: Record<KnownCalloutBorderColor, number> = {
  red: 1,
  orange: 2,
  yellow: 3,
  green: 4,
  blue: 5,
  purple: 6,
  gray: 7,
};

export const NUM_TO_CALLOUT_BORDER: Readonly<Record<number, KnownCalloutBorderColor>> = {
  1: 'red',
  2: 'orange',
  3: 'yellow',
  4: 'green',
  5: 'blue',
  6: 'purple',
  7: 'gray',
};

const OBJ_TYPE_TO_NUM: Record<LASTObjType, number> = {
  doc: 1,
  sheet: 3,
  bitable: 8,
  mindnote: 11,
  file: 12,
  slide: 15,
  wiki: 16,
  docx: 22,
};

export const NUM_TO_OBJ_TYPE: Readonly<Record<number, LASTObjType>> = {
  1: 'doc',
  3: 'sheet',
  8: 'bitable',
  11: 'mindnote',
  12: 'file',
  15: 'slide',
  16: 'wiki',
  22: 'docx',
};

export const IFRAME_TYPE_TO_NUM: Record<LASTIframeType, number> = {
  bilibili: 1,
  xigua: 2,
  youku: 3,
  airtable: 4,
  baidu_map: 5,
  gaode_map: 6,
  figma: 8,
  modao: 9,
  canva: 10,
  codepen: 11,
  feishu_wenjuan: 12,
  jinshuju: 13,
};

export const NUM_TO_IFRAME_TYPE: Readonly<Record<number, LASTIframeType>> = {
  1: 'bilibili',
  2: 'xigua',
  3: 'youku',
  4: 'airtable',
  5: 'baidu_map',
  6: 'gaode_map',
  8: 'figma',
  9: 'modao',
  10: 'canva',
  11: 'codepen',
  12: 'feishu_wenjuan',
  13: 'jinshuju',
};

const KNOWN_CODE_LANG_TO_NUM: Readonly<Record<string, number>> = {
  text: 1,
  plaintext: 1,
  plain_text: 1,
  assembly: 6,
  bash: 7,
  shell: 7,
  csharp: 8,
  cpp: 9,
  c: 10,
  css: 12,
  coffee: 13,
  go: 24,
  html: 26,
  json: 31,
  java: 32,
  javascript: 33,
  js: 33,
  kotlin: 35,
  markdown: 42,
  md: 42,
  objectivec: 44,
  php: 46,
  perl: 47,
  powershell: 49,
  protobuf: 51,
  python: 52,
  r: 53,
  ruby: 55,
  rust: 56,
  sql: 60,
  scala: 61,
  swift: 64,
  typescript: 66,
  ts: 66,
  xml: 69,
  yaml: 70,
  toml: 77,
};

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isTextualType(type: LASTFeishuBlockType): type is LASTTextualBlockType {
  return LAST_TEXTUAL_BLOCK_TYPE_SET.has(type as LASTTextualBlockType);
}

function toCodeLanguageNumber(language: LASTCodeLanguage | null): number | undefined {
  if (language == null) return undefined;
  if (/^\d+$/.test(language)) {
    return Number(language);
  }
  const normalized = language.toLowerCase();
  return KNOWN_CODE_LANG_TO_NUM[normalized];
}

function fromCodeLanguageValue(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === 'string') {
    return raw;
  }
  return null;
}

export function toAlignNumber(align: unknown): number | undefined {
  if (typeof align === 'number' && Number.isFinite(align)) {
    return align;
  }
  if (typeof align === 'string' && Object.prototype.hasOwnProperty.call(ALIGN_TO_NUM, align)) {
    return ALIGN_TO_NUM[align as LASTAlign];
  }
  return undefined;
}

export function fromAlignNumber(raw: unknown): LASTAlign | number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return undefined;
  }
  return NUM_TO_ALIGN[raw] ?? raw;
}

function toTextElementStyle(marks: LASTInlineMarks): Record<string, unknown> {
  const style: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(marks, 'bold')) {
    style.bold = Boolean(marks.bold);
  }
  if (Object.prototype.hasOwnProperty.call(marks, 'italic')) {
    style.italic = Boolean(marks.italic);
  }
  if (Object.prototype.hasOwnProperty.call(marks, 'strikethrough')) {
    style.strikethrough = Boolean(marks.strikethrough);
  }
  if (Object.prototype.hasOwnProperty.call(marks, 'underline')) {
    style.underline = Boolean(marks.underline);
  }
  if (Object.prototype.hasOwnProperty.call(marks, 'inlineCode')) {
    style.inline_code = Boolean(marks.inlineCode);
  }

  if (marks.backgroundColor) {
    style.background_color = COLOR_TO_NUM[marks.backgroundColor];
  }
  if (marks.textColor) {
    style.text_color = COLOR_TO_NUM[marks.textColor];
  }
  if (marks.link) {
    style.link = { url: marks.link.url };
  }
  if (Array.isArray(marks.commentIds) && marks.commentIds.length > 0) {
    style.comment_ids = [...marks.commentIds];
  }

  return style;
}

function fromTextElementStyle(raw: unknown): LASTInlineMarks {
  const style = (raw ?? {}) as Record<string, unknown>;
  const marks: LASTInlineMarks = {};

  if (Object.prototype.hasOwnProperty.call(style, 'bold')) {
    marks.bold = Boolean(style.bold);
  }
  if (Object.prototype.hasOwnProperty.call(style, 'italic')) {
    marks.italic = Boolean(style.italic);
  }
  if (Object.prototype.hasOwnProperty.call(style, 'strikethrough')) {
    marks.strikethrough = Boolean(style.strikethrough);
  }
  if (Object.prototype.hasOwnProperty.call(style, 'underline')) {
    marks.underline = Boolean(style.underline);
  }
  if (Object.prototype.hasOwnProperty.call(style, 'inline_code')) {
    marks.inlineCode = Boolean(style.inline_code);
  }
  if (Object.prototype.hasOwnProperty.call(style, 'background_color')) {
    if (typeof style.background_color === 'number') {
      marks.backgroundColor = NUM_TO_COLOR[style.background_color] ?? null;
    } else {
      marks.backgroundColor = null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(style, 'text_color')) {
    if (typeof style.text_color === 'number') {
      marks.textColor = NUM_TO_COLOR[style.text_color] ?? null;
    } else {
      marks.textColor = null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(style, 'link')) {
    const linkRaw = style.link as Record<string, unknown> | undefined;
    marks.link =
      linkRaw && typeof linkRaw.url === 'string'
        ? {
            url: linkRaw.url,
          }
        : null;
  }
  if (Array.isArray(style.comment_ids)) {
    marks.commentIds = style.comment_ids.filter((item) => typeof item === 'string') as string[];
  }

  return marks;
}

function resolveLASTBlockRefToBTTId(
  lastBlockId: LASTBlockId,
  lastToBttBlockId: Readonly<Record<string, string>>,
): string {
  return lastToBttBlockId[lastBlockId] ?? String(lastBlockId);
}

function lastInlinesToLarkElements(
  inlines: LASTInlineNode[],
  lastToBttBlockId: Readonly<Record<string, string>>,
): Array<Record<string, unknown>> {
  const elements: Array<Record<string, unknown>> = [];

  for (const inline of inlines) {
    const textElementStyle = toTextElementStyle(inline.marks);
    const stylePart =
      Object.keys(textElementStyle).length > 0
        ? {
            text_element_style: textElementStyle,
          }
        : {};

    if (inline.kind === 'text_run') {
      const textRun: Record<string, unknown> = {
        ...stylePart,
      };
      if (inline.text !== undefined) {
        textRun.content = inline.text;
      }
      elements.push({
        text_run: textRun,
      });
      continue;
    }

    if (inline.kind === 'mention_user') {
      const mentionUser: Record<string, unknown> = {
        ...stylePart,
      };
      if (inline.userId !== undefined) {
        mentionUser.user_id = inline.userId;
      }
      elements.push({
        mention_user: mentionUser,
      });
      continue;
    }

    if (inline.kind === 'equation') {
      const equation: Record<string, unknown> = {
        ...stylePart,
      };
      if (inline.latex !== undefined) {
        equation.content = inline.latex;
      }
      elements.push({
        equation,
      });
      continue;
    }

    if (inline.kind === 'mention_doc') {
      const mentionDoc: Record<string, unknown> = {
        ...stylePart,
      };
      if (inline.token !== undefined) {
        mentionDoc.token = inline.token;
      }
      if (inline.url !== undefined) {
        mentionDoc.url = inline.url;
      }
      if (inline.title !== undefined) {
        mentionDoc.title = inline.title;
      }
      if (Object.prototype.hasOwnProperty.call(inline, 'objType') && typeof inline.objType === 'number') {
        mentionDoc.obj_type = inline.objType;
      } else if (Object.prototype.hasOwnProperty.call(inline, 'objType') && typeof inline.objType === 'string') {
        mentionDoc.obj_type = OBJ_TYPE_TO_NUM[inline.objType];
      }
      if (inline.fallbackType) {
        mentionDoc.fallback_type = inline.fallbackType;
      }
      elements.push({
        mention_doc: mentionDoc,
      });
      continue;
    }

    if (inline.kind === 'reminder') {
      const reminder: Record<string, unknown> = { ...stylePart };
      if (inline.createUserId !== undefined) {
        reminder.create_user_id = inline.createUserId;
      }
      if (inline.expireTime !== undefined) {
        reminder.expire_time = inline.expireTime;
      }
      if (inline.notifyTime !== undefined) {
        reminder.notify_time = inline.notifyTime;
      }
      if (inline.isNotify !== undefined) {
        reminder.is_notify = inline.isNotify;
      }
      if (inline.isWholeDay !== undefined) {
        reminder.is_whole_day = inline.isWholeDay;
      }
      elements.push({
        reminder,
      });
      continue;
    }

    if (inline.kind === 'inline_block') {
      const inlineBlock: Record<string, unknown> = {
        ...stylePart,
      };
      if (inline.blockId !== undefined) {
        inlineBlock.block_id = resolveLASTBlockRefToBTTId(inline.blockId, lastToBttBlockId);
      }
      elements.push({
        inline_block: inlineBlock,
      });
      continue;
    }

    if (inline.kind === 'inline_file') {
      const file: Record<string, unknown> = {
        ...stylePart,
      };
      if (inline.fileToken !== undefined) {
        file.file_token = inline.fileToken;
      }
      if (inline.sourceBlockId !== undefined) {
        file.source_block_id = resolveLASTBlockRefToBTTId(inline.sourceBlockId, lastToBttBlockId);
      }
      const inlineBlock: Record<string, unknown> = {
        ...stylePart,
      };
      if (inline.inlineBlock.blockId !== undefined) {
        inlineBlock.block_id = resolveLASTBlockRefToBTTId(inline.inlineBlock.blockId, lastToBttBlockId);
      }
      file.inline_block = inlineBlock;
      elements.push({
        file,
      });
      continue;
    }

    if (inline.kind === 'link_preview') {
      const linkPreview: Record<string, unknown> = { ...stylePart };
      if (inline.url !== undefined) {
        linkPreview.url = inline.url;
      }
      if (inline.title !== undefined) {
        linkPreview.title = inline.title;
      }
      if (inline.urlType !== undefined) {
        linkPreview.url_type = inline.urlType;
      }
      elements.push({ link_preview: linkPreview });
    }
  }

  return elements;
}

function larkElementsToLastInlines(
  elements: unknown,
  nextInlineId: () => LASTInlineId,
  blockBttId: string,
  bttToLastBlockId: Readonly<Record<string, LASTBlockId>>,
): LASTInlineNode[] {
  const list = Array.isArray(elements) ? (elements as Array<Record<string, unknown>>) : [];
  const inlines: LASTInlineNode[] = [];

  for (let elementIndex = 0; elementIndex < list.length; elementIndex += 1) {
    const item = list[elementIndex];
    if (!item || typeof item !== 'object') {
      continue;
    }
    const bttId = `${blockBttId}/elements/${elementIndex}`;

    const textRun = item.text_run as Record<string, unknown> | undefined;
    if (textRun) {
      inlines.push({
        id: nextInlineId(),
        bttId,
        kind: 'text_run',
        marks: fromTextElementStyle(textRun.text_element_style),
        ...(typeof textRun.content === 'string' ? { text: textRun.content } : {}),
      });
      continue;
    }

    const mentionUser = item.mention_user as Record<string, unknown> | undefined;
    if (mentionUser) {
      inlines.push({
        id: nextInlineId(),
        bttId,
        kind: 'mention_user',
        marks: fromTextElementStyle(mentionUser.text_element_style),
        ...(typeof mentionUser.user_id === 'string' ? { userId: mentionUser.user_id } : {}),
      });
      continue;
    }

    const equation = item.equation as Record<string, unknown> | undefined;
    if (equation) {
      inlines.push({
        id: nextInlineId(),
        bttId,
        kind: 'equation',
        marks: fromTextElementStyle(equation.text_element_style),
        ...(typeof equation.content === 'string' ? { latex: equation.content } : {}),
      });
      continue;
    }

    const mentionDoc = item.mention_doc as Record<string, unknown> | undefined;
    if (mentionDoc) {
      const objTypeNum = typeof mentionDoc.obj_type === 'number' ? mentionDoc.obj_type : undefined;
      inlines.push({
        id: nextInlineId(),
        bttId,
        kind: 'mention_doc',
        marks: fromTextElementStyle(mentionDoc.text_element_style),
        ...(typeof mentionDoc.token === 'string' ? { token: mentionDoc.token } : {}),
        ...(objTypeNum == null ? {} : { objType: NUM_TO_OBJ_TYPE[objTypeNum] ?? objTypeNum }),
        ...(typeof mentionDoc.url === 'string' ? { url: mentionDoc.url } : {}),
        ...(typeof mentionDoc.title === 'string' ? { title: mentionDoc.title } : {}),
        ...(mentionDoc.fallback_type === 'FallbackToLink' || mentionDoc.fallback_type === 'FallbackToText'
          ? { fallbackType: mentionDoc.fallback_type as LASTMentionDocFallbackType }
          : {}),
      });
      continue;
    }

    const reminder = item.reminder as Record<string, unknown> | undefined;
    if (reminder) {
      inlines.push({
        id: nextInlineId(),
        bttId,
        kind: 'reminder',
        marks: fromTextElementStyle(reminder.text_element_style),
        ...(typeof reminder.create_user_id === 'string' ? { createUserId: reminder.create_user_id } : {}),
        ...(typeof reminder.expire_time === 'string' ? { expireTime: reminder.expire_time } : {}),
        ...(typeof reminder.notify_time === 'string' ? { notifyTime: reminder.notify_time } : {}),
        ...(Object.prototype.hasOwnProperty.call(reminder, 'is_notify')
          ? { isNotify: Boolean(reminder.is_notify) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(reminder, 'is_whole_day')
          ? { isWholeDay: Boolean(reminder.is_whole_day) }
          : {}),
      });
      continue;
    }

    const inlineBlock = item.inline_block as Record<string, unknown> | undefined;
    if (inlineBlock) {
      const rawBlockId = String(inlineBlock.block_id ?? '');
      inlines.push({
        id: nextInlineId(),
        bttId,
        kind: 'inline_block',
        marks: fromTextElementStyle(inlineBlock.text_element_style),
        ...(Object.prototype.hasOwnProperty.call(inlineBlock, 'block_id')
          ? {
              blockId: (bttToLastBlockId[rawBlockId] ?? (rawBlockId as LASTBlockId)) as LASTBlockId,
            }
          : {}),
      });
      continue;
    }

    const file = item.file as Record<string, unknown> | undefined;
    if (file) {
      const rawInlineBlock = file.inline_block as Record<string, unknown> | undefined;
      const sourceRawBlockId = String(file.source_block_id ?? '');
      const inlineRawBlockId = String(rawInlineBlock?.block_id ?? '');
      inlines.push({
        id: nextInlineId(),
        bttId,
        kind: 'inline_file',
        marks: fromTextElementStyle(file.text_element_style),
        ...(typeof file.file_token === 'string' ? { fileToken: file.file_token } : {}),
        ...(Object.prototype.hasOwnProperty.call(file, 'source_block_id')
          ? {
              sourceBlockId: (bttToLastBlockId[sourceRawBlockId] ?? (sourceRawBlockId as LASTBlockId)) as LASTBlockId,
            }
          : {}),
        inlineBlock: {
          ...(Object.prototype.hasOwnProperty.call(rawInlineBlock ?? {}, 'block_id')
            ? {
                blockId: (bttToLastBlockId[inlineRawBlockId] ?? (inlineRawBlockId as LASTBlockId)) as LASTBlockId,
              }
            : {}),
        },
      });
      continue;
    }

    const linkPreview = item.link_preview as Record<string, unknown> | undefined;
    if (linkPreview) {
      inlines.push({
        id: nextInlineId(),
        bttId,
        kind: 'link_preview',
        marks: fromTextElementStyle(linkPreview.text_element_style),
        ...(typeof linkPreview.url === 'string' ? { url: linkPreview.url } : {}),
        ...(linkPreview.url_type === 'Project' || linkPreview.url_type === 'Undefined'
          ? { urlType: linkPreview.url_type as LASTLinkPreviewUrlType }
          : {}),
        ...(typeof linkPreview.title === 'string' ? { title: linkPreview.title } : {}),
      });
    }
  }

  return inlines;
}

export function lastTextPayloadToLark(
  type: LASTTextualBlockType,
  payload: LASTTextPayload,
  lastToBttBlockId: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const style: Record<string, unknown> = {};
  const align = toAlignNumber(payload.style.align);
  if (align !== undefined) {
    style.align = align;
  }
  if (payload.style.done !== undefined) {
    style.done = payload.style.done;
  }
  if (payload.style.folded !== undefined) {
    style.folded = payload.style.folded;
  }
  if (payload.style.wrap !== undefined) {
    style.wrap = payload.style.wrap;
  }
  if (payload.style.backgroundColor) {
    style.background_color = BLOCK_BG_TO_API[payload.style.backgroundColor];
  }
  if (payload.style.indentationLevel) {
    style.indentation_level = INDENT_TO_API[payload.style.indentationLevel];
  }
  if (payload.style.sequence !== undefined) {
    style.sequence = payload.style.sequence;
  }

  const language = toCodeLanguageNumber(payload.style.language ?? null);
  if (language != null) {
    style.language = language;
  }

  return {
    [TEXTUAL_PAYLOAD_KEY[type]]: {
      ...(Object.keys(style).length > 0 ? { style } : {}),
      elements: lastInlinesToLarkElements(payload.inlines, lastToBttBlockId),
    },
  };
}

export function larkTextPayloadToLast(
  rawBlock: LarkDocxBlock,
  type: LASTTextualBlockType,
  nextInlineId: () => LASTInlineId,
  bttToLastBlockId: Readonly<Record<string, LASTBlockId>>,
): LASTTextPayload {
  const key = TEXTUAL_PAYLOAD_KEY[type];
  const raw = (rawBlock[key] ?? {}) as Record<string, unknown>;
  const styleRaw = (raw.style ?? {}) as Record<string, unknown>;
  const bgRaw = typeof styleRaw.background_color === 'string' ? styleRaw.background_color : undefined;
  const indentRaw = typeof styleRaw.indentation_level === 'string' ? styleRaw.indentation_level : undefined;
  const align = fromAlignNumber(styleRaw.align);
  const language = fromCodeLanguageValue(styleRaw.language);

  return {
    style: {
      ...(align === undefined ? {} : { align }),
      ...(language === null ? {} : { language }),
      ...(Object.prototype.hasOwnProperty.call(styleRaw, 'done') ? { done: Boolean(styleRaw.done) } : {}),
      ...(Object.prototype.hasOwnProperty.call(styleRaw, 'folded') ? { folded: Boolean(styleRaw.folded) } : {}),
      ...(Object.prototype.hasOwnProperty.call(styleRaw, 'wrap') ? { wrap: Boolean(styleRaw.wrap) } : {}),
      ...(bgRaw && API_TO_BLOCK_BG[bgRaw] ? { backgroundColor: API_TO_BLOCK_BG[bgRaw] } : {}),
      ...(indentRaw && API_TO_INDENT[indentRaw] ? { indentationLevel: API_TO_INDENT[indentRaw] } : {}),
      ...(typeof styleRaw.sequence === 'string' ? { sequence: styleRaw.sequence } : {}),
    },
    inlines: larkElementsToLastInlines(raw.elements, nextInlineId, String(rawBlock.block_id), bttToLastBlockId),
  };
}
