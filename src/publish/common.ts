import path from 'node:path';
import type {
  LASTBlockNode,
  LASTInlineMarks,
  LASTTextualBlock,
  LASTTextualBlockType,
} from '../last/types.js';
import { LAST_TEXTUAL_BLOCK_TYPE_SET } from '../last/textual-block-types.js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg', '.oga', '.opus']);
const PREVIEWABLE_FILE_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
]);

export function toObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function isTextualBlock(block: LASTBlockNode): block is LASTTextualBlock<LASTTextualBlockType> {
  return LAST_TEXTUAL_BLOCK_TYPE_SET.has(block.type as LASTTextualBlockType);
}

export function stripQueryAndHash(url: string): string {
  return url.split('#', 1)[0]?.split('?', 1)[0] ?? url;
}

export function safeDecodeURIComponent(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

export function getPathExtension(url: string): string {
  const clean = safeDecodeURIComponent(stripQueryAndHash(url));
  return path.extname(clean).toLowerCase();
}

export function isHttpLike(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url);
}

export function resolveLocalPathFromSource(sourceUrl: string, baseDir: string): string | null {
  const raw = sourceUrl.trim();
  if (!raw) return null;
  if (isHttpLike(raw)) {
    if (/^https?:/i.test(raw)) {
      return null;
    }
    return null;
  }

  const decoded = safeDecodeURIComponent(stripQueryAndHash(raw));
  const absolute = path.isAbsolute(decoded) ? decoded : path.resolve(baseDir, decoded);
  return absolute;
}

export function inferMediaKind(extension: string): 'image' | 'video' | 'audio' | 'file' {
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  return 'file';
}

export function shouldUsePreviewView(
  extension: string,
  mediaKind: 'image' | 'video' | 'audio' | 'file',
): boolean {
  if (mediaKind === 'video' || mediaKind === 'audio') return true;
  return PREVIEWABLE_FILE_EXTENSIONS.has(extension);
}

export function createDefaultMarks(): LASTInlineMarks {
  return {
    bold: false,
    italic: false,
    strikethrough: false,
    underline: false,
    inlineCode: false,
    textColor: null,
    backgroundColor: null,
    link: null,
  };
}

export function extractTextFromInlines(inlines: LASTTextualBlock<LASTTextualBlockType>['payload']['inlines']): string {
  let out = '';
  for (const inline of inlines) {
    if (inline.kind === 'text_run') {
      out += inline.text ?? '';
      continue;
    }
    if (inline.kind === 'mention_user') {
      out += inline.userId ?? '';
      continue;
    }
    if (inline.kind === 'equation') {
      out += inline.latex ?? '';
      continue;
    }
    if (inline.kind === 'mention_doc') {
      out += inline.title ?? '';
      continue;
    }
    if (inline.kind === 'link_preview') {
      out += inline.title ?? inline.url ?? '';
    }
  }
  return out;
}

export function firstInlineLinkUrl(block: LASTTextualBlock<LASTTextualBlockType>): string | null {
  if (block.payload.inlines.length === 0) return null;
  let resolvedUrl = '';
  for (const inline of block.payload.inlines) {
    if (inline.kind !== 'text_run') return null;
    const linkUrl = inline.marks.link?.url;
    if (typeof linkUrl !== 'string' || linkUrl.trim().length === 0) {
      return null;
    }
    const normalized = linkUrl.trim();
    if (!resolvedUrl) {
      resolvedUrl = normalized;
      continue;
    }
    if (resolvedUrl !== normalized) {
      return null;
    }
  }
  return resolvedUrl || null;
}

export function toPlainTextFromInlineList(
  inlines: LASTTextualBlock<LASTTextualBlockType>['payload']['inlines'],
): string {
  let out = '';
  for (const inline of inlines) {
    if (inline.kind === 'text_run') {
      out += inline.text ?? '';
    } else {
      out += extractTextFromInlines([inline] as LASTTextualBlock<LASTTextualBlockType>['payload']['inlines']);
    }
  }
  return out;
}
