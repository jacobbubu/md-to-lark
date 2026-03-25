export type MermaidRenderTarget = 'text-drawing' | 'board';

export interface MermaidBoardRenderConfig {
  /**
   * Whiteboard parser type used by board.v1.whiteboardNode.createPlantuml.
   * Runtime probe shows `2` works for Mermaid in current Feishu open API.
   */
  syntaxType?: number;
  /**
   * Optional board style variant passed through to createPlantuml.
   */
  styleType?: number;
  /**
   * Optional diagram subtype passed through to createPlantuml.
   */
  diagramType?: number;
}

export interface MermaidRenderConfig {
  target: MermaidRenderTarget;
  board: MermaidBoardRenderConfig;
}

export const DEFAULT_MERMAID_BOARD_SYNTAX_TYPE = 2;

export const DEFAULT_MERMAID_RENDER_CONFIG: MermaidRenderConfig = {
  target: 'text-drawing',
  board: {
    syntaxType: DEFAULT_MERMAID_BOARD_SYNTAX_TYPE,
  },
};

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
