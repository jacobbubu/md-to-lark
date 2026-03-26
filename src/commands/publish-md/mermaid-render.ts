import {
  DEFAULT_MERMAID_RENDER_CONFIG,
  type MermaidRenderTarget,
  type MermaidRenderConfig,
} from '../../lark/docx/render-types.js';

export { DEFAULT_MERMAID_BOARD_SYNTAX_TYPE } from '../../lark/docx/render-types.js';
export type { MermaidBoardRenderConfig, MermaidRenderConfig, MermaidRenderTarget } from '../../lark/docx/render-types.js';

const TEXT_DRAWING_TARGET_ALIASES = new Set(['text-drawing', 'text_drawing', 'textdrawing', 'text']);
const BOARD_TARGET_ALIASES = new Set(['board', 'whiteboard', 'canvas']);

export function normalizeMermaidRenderTarget(raw: string | undefined): MermaidRenderTarget {
  const normalized = raw?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return DEFAULT_MERMAID_RENDER_CONFIG.target;
  }
  if (TEXT_DRAWING_TARGET_ALIASES.has(normalized)) {
    return 'text-drawing';
  }
  if (BOARD_TARGET_ALIASES.has(normalized)) {
    return 'board';
  }
  throw new Error(
    `Invalid mermaid target "${raw}". Expected one of: text-drawing, board (aliases: text_drawing, textdrawing, whiteboard, canvas).`,
  );
}
