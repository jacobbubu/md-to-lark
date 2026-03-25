import type { MermaidRenderTarget } from './mermaid-render.js';

export interface PublishMdCliOptions {
  inputPath: string;
  title?: string;
  titleDatePrefix?: boolean;
  presetPath?: string;
  folderToken: string;
  documentId?: string;
  downloadRemoteImages?: boolean;
  ytDlpPath?: string;
  ytDlpCookiesPath?: string;
  pipelineCacheDir?: string;
  mermaidTarget?: MermaidRenderTarget;
  mermaidBoardSyntaxType?: number;
  mermaidBoardStyleType?: number;
  mermaidBoardDiagramType?: number;
  dryRun: boolean;
}

function usage(): string {
  return [
    'Usage: npm run publish:md -- --input <file.md|dir> [--title <doc_title_or_prefix>] [--date-prefix|--no-date-prefix] [--preset <preset_name_or_module_path>] [--folder <folder_token>] [--doc <document_id>] [--download-remote-images|--no-download-remote-images] [--yt-dlp-path <path>] [--yt-dlp-cookies-path <path>] [--pipeline-cache-dir <dir>] [--mermaid-target <text-drawing|board>] [--mermaid-board-syntax-type <int>] [--mermaid-board-style-type <int>] [--mermaid-board-diagram-type <int>] [--dry-run] [--help|-h]',
    '',
    'Options:',
    '  --input   Markdown file path, or directory path (publish all *.md recursively).',
    '  --title   Single-file title. In directory mode this is used as title prefix.',
    '  --date-prefix      Enable date prefix in final title: YYYYMMDD-<title>. Default: enabled.',
    '  --no-date-prefix   Disable date prefix in final title.',
    '  --preset  Optional preset module path (js/mjs/cjs/ts) or built-in name (e.g. medium). Used to transform markdown before publish pipeline.',
    '  --folder  Feishu folder token. Default: LARK_FOLDER_TOKEN from .env',
    '  --doc     Existing Feishu document id (single-file only). If set, publish directly into this doc (and clear content first).',
    '  --download-remote-images    Enable prepare-stage remote image pre-download + link rewrite.',
    '  --no-download-remote-images Disable prepare-stage remote image pre-download.',
    '  --yt-dlp-path               Optional yt-dlp executable path for standalone URL extraction.',
    '  --yt-dlp-cookies-path       Optional cookie file path passed to yt-dlp --cookies.',
    '  --pipeline-cache-dir        Pipeline cache root directory. Default: ./out/pipeline-cache',
    '  --mermaid-target            Mermaid render target: text-drawing (default) or board.',
    '  --mermaid-board-syntax-type Optional integer syntax_type for board createPlantuml (default: 2).',
    '  --mermaid-board-style-type  Optional integer style_type for board createPlantuml.',
    '  --mermaid-board-diagram-type Optional integer diagram_type for board createPlantuml.',
    '  --dry-run Build pipeline and print patch stats only, do not call Feishu API.',
    '  --help, -h Show this help message and exit.',
    '',
    'Notes:',
    '  1) Local image/file paths are uploaded to Feishu and replaced by token.',
    '  2) Mermaid code fences can be rendered as text-drawing (block_type=40) or board (block_type=43).',
    '  3) Tables use width heuristics + numeric-column right align + row/column expansion strategy when size > 9.',
    '  4) Final title uses date prefix by default (YYYYMMDD-<title>); disable with --no-date-prefix or LARK_TITLE_DATE_PREFIX=false.',
    '  5) If markdown has exactly one h1 and --title is not provided, that h1 becomes doc title, then removed from content, and remaining headings are promoted by one level.',
    '  6) Stage cache layout per markdown: 00-source, 01-prepare, 02-hast, 03-last, 04-btt, 05-publish.',
    '  7) Prepare stage can pre-download remote markdown images and optional yt-dlp URL lines.',
    '  8) Leading YAML/TOML frontmatter is rewritten as fenced code block (yaml/toml), so it stays visible and will not be parsed as headings.',
    '  9) Missing local asset files are skipped/degraded to text fallback; publish will not fail only because a referenced local path is absent.',
    '',
    'Examples:',
    '  npm run publish:md -- --input ./docs/a.md',
    '  npm run publish:md -- --input ./docs --title Weekly --folder <token>',
    '  npm run publish:md -- --input ./docs/a.md --doc <document_id>',
    '  npm run publish:md -- --input ./docs/a.md --dry-run',
  ].join('\n');
}

export function getPublishMdUsage(): string {
  return usage();
}

export function hasPublishMdHelpFlag(argv: string[]): boolean {
  return argv.includes('--help') || argv.includes('-h');
}

export function parsePublishMdArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): PublishMdCliOptions {
  let inputPath = '';
  let title = '';
  let titleDatePrefix: boolean | undefined;
  let presetPath = '';
  let folderToken = (env.LARK_FOLDER_TOKEN ?? '').trim();
  let documentId: string | undefined;
  let downloadRemoteImages: boolean | undefined;
  let ytDlpPath = '';
  let ytDlpCookiesPath = '';
  let pipelineCacheDir = '';
  let mermaidTarget: MermaidRenderTarget | undefined;
  let mermaidBoardSyntaxType: number | undefined;
  let mermaidBoardStyleType: number | undefined;
  let mermaidBoardDiagramType: number | undefined;
  let dryRun = false;

  const parseNonNegativeInt = (name: string, value: string): number => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${name} must be a non-negative integer, received: ${value}`);
    }
    return parsed;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === '--input') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --input.');
      inputPath = value;
      i += 1;
      continue;
    }

    if (arg === '--title') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --title.');
      title = value;
      i += 1;
      continue;
    }

    if (arg === '--date-prefix') {
      titleDatePrefix = true;
      continue;
    }

    if (arg === '--no-date-prefix') {
      titleDatePrefix = false;
      continue;
    }

    if (arg === '--folder') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --folder.');
      folderToken = value;
      i += 1;
      continue;
    }

    if (arg === '--preset') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --preset.');
      presetPath = value;
      i += 1;
      continue;
    }

    if (arg === '--doc') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --doc.');
      documentId = value;
      i += 1;
      continue;
    }

    if (arg === '--download-remote-images') {
      downloadRemoteImages = true;
      continue;
    }

    if (arg === '--no-download-remote-images') {
      downloadRemoteImages = false;
      continue;
    }

    if (arg === '--yt-dlp-path') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --yt-dlp-path.');
      ytDlpPath = value;
      i += 1;
      continue;
    }

    if (arg === '--yt-dlp-cookies-path') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --yt-dlp-cookies-path.');
      ytDlpCookiesPath = value;
      i += 1;
      continue;
    }

    if (arg === '--pipeline-cache-dir') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --pipeline-cache-dir.');
      pipelineCacheDir = value;
      i += 1;
      continue;
    }

    if (arg === '--mermaid-target') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --mermaid-target.');
      mermaidTarget = value as MermaidRenderTarget;
      i += 1;
      continue;
    }

    if (arg === '--mermaid-board-syntax-type') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --mermaid-board-syntax-type.');
      mermaidBoardSyntaxType = parseNonNegativeInt('--mermaid-board-syntax-type', value);
      i += 1;
      continue;
    }

    if (arg === '--mermaid-board-style-type') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --mermaid-board-style-type.');
      mermaidBoardStyleType = parseNonNegativeInt('--mermaid-board-style-type', value);
      i += 1;
      continue;
    }

    if (arg === '--mermaid-board-diagram-type') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --mermaid-board-diagram-type.');
      mermaidBoardDiagramType = parseNonNegativeInt('--mermaid-board-diagram-type', value);
      i += 1;
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!inputPath) {
      inputPath = arg;
      continue;
    }

    throw new Error(`Unexpected extra argument: ${arg}`);
  }

  if (!inputPath.trim()) {
    throw new Error('Input path is required. Use --input <file.md|dir>.');
  }

  if (!documentId && !folderToken) {
    throw new Error('Folder token is required when --doc is not provided. Use --folder or set LARK_FOLDER_TOKEN.');
  }

  return {
    inputPath: inputPath.trim(),
    ...(title.trim() ? { title: title.trim() } : {}),
    ...(titleDatePrefix === undefined ? {} : { titleDatePrefix }),
    ...(presetPath.trim() ? { presetPath: presetPath.trim() } : {}),
    folderToken,
    ...(documentId ? { documentId: documentId.trim() } : {}),
    ...(downloadRemoteImages === undefined ? {} : { downloadRemoteImages }),
    ...(ytDlpPath.trim() ? { ytDlpPath: ytDlpPath.trim() } : {}),
    ...(ytDlpCookiesPath.trim() ? { ytDlpCookiesPath: ytDlpCookiesPath.trim() } : {}),
    ...(pipelineCacheDir.trim() ? { pipelineCacheDir: pipelineCacheDir.trim() } : {}),
    ...(mermaidTarget ? { mermaidTarget } : {}),
    ...(mermaidBoardSyntaxType === undefined ? {} : { mermaidBoardSyntaxType }),
    ...(mermaidBoardStyleType === undefined ? {} : { mermaidBoardStyleType }),
    ...(mermaidBoardDiagramType === undefined ? {} : { mermaidBoardDiagramType }),
    dryRun,
  };
}
