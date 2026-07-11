export const ARTICLE_RENDER_PROTOCOL_V1 = 'article-render/v1' as const;

export type RendererName = 'lark' | (string & {});

export interface ProtocolDiagnostic {
  severity: 'warning' | 'error';
  code: string;
  message: string;
  sourcePath?: string;
  line?: number;
  column?: number;
  semanticId?: string;
}

export interface ArticleRenderFrontmatter {
  protocol?: string;
  contracts?: Record<string, string>;
}

export interface ParsedArticleFrontmatter {
  data: Record<string, unknown>;
  articleRender: ArticleRenderFrontmatter | null;
  body: string;
  startOffset: number;
  endOffset: number;
}

export type UnsupportedChildPolicy = 'error' | 'sibling-after';

export interface LarkRendererTarget {
  footnotes?: {
    render?: 'callout' | 'list';
    icon?: string;
    background_color?: string;
    border_color?: string;
    image_policy?: UnsupportedChildPolicy;
  };
  figures?: {
    caption_position?: 'above' | 'below';
    note_position?: 'above' | 'below';
    source_position?: 'above' | 'below-caption' | 'below-note' | 'below';
    default_width_ratio?: number;
    preserve_source_ratio?: boolean;
  };
  tables?: {
    caption_position?: 'above' | 'below';
    note_position?: 'above' | 'below';
    source_position?: 'above' | 'below-note' | 'below';
    invalid_table?: 'error' | 'warning';
  };
  callouts?: {
    unsupported_child_policy?: UnsupportedChildPolicy;
  };
  math?: {
    input?: 'latex';
    renderer?: 'katex';
    inline_delimiters?: string[];
    display_delimiters?: string[];
    currency_policy?: 'protect' | 'parse';
    numbering?: 'preserve-tag' | 'none';
    cross_references?: 'resolve' | 'text';
    unsupported_command?: 'error' | 'warning';
    environments?: string[];
    macros?: Record<string, string>;
  };
  [key: string]: unknown;
}

export interface RendererContract {
  protocol: string;
  renderer: string;
  document: {
    source: string;
  };
  extends?: string[];
  requirements?: string[];
  strict?: boolean;
  targets: Record<string, unknown> & {
    lark?: LarkRendererTarget;
  };
  [key: string]: unknown;
}

export interface ResolvedRendererContract {
  selectedPath: string;
  selection: 'explicit' | 'frontmatter' | 'auto' | 'default';
  contract: RendererContract;
  loadedPaths: string[];
  strict: boolean;
}

export interface RendererCapabilities {
  renderer: string;
  protocols: string[];
  capabilities: Record<string, number>;
}

export interface ContractResolutionOptions {
  inputPath: string;
  markdown: string;
  renderer?: string;
  rendererContractPath?: string;
  rendererDefaultContractPath?: string;
  strict?: boolean;
}

export interface ContractResolutionResult {
  frontmatter: ParsedArticleFrontmatter | null;
  resolved: ResolvedRendererContract | null;
  markdownBody: string;
}
