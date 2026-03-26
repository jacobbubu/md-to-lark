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

export interface MermaidPatch {
  code: string;
}

export const DEFAULT_MERMAID_BOARD_SYNTAX_TYPE = 2;

export const DEFAULT_MERMAID_RENDER_CONFIG: MermaidRenderConfig = {
  target: 'text-drawing',
  board: {
    syntaxType: DEFAULT_MERMAID_BOARD_SYNTAX_TYPE,
  },
};
