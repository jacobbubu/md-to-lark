import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as lark from '@larksuiteoapi/node-sdk';
import { getPublishMdUsage, hasPublishMdHelpFlag, parsePublishMdArgs, type PublishMdCliOptions } from './args.js';
import { RateLimiter, sleep } from '../../shared/rate-limiter.js';
import { resolvePublishInputSet } from './input-resolver.js';
import { loadMarkdownPreset } from './preset-loader.js';
import { applySingleH1TitleRule, buildTitleForMarkdown } from './title-policy.js';
import {
  applyStandaloneAttachmentTransforms,
  applyTableColumnWidthHeuristics,
  buildPipelineDocumentId,
  collectMermaidPatches,
  ensureLastBlockBttIds,
  patchBTTForMermaidAndAssets,
} from '../../publish/index.js';
import {
  clearDocumentContent,
  createDocument,
  listFolderChildren,
  normalizeDocumentId,
  type LarkRequestOptions,
} from '../../lark/docx/ops.js';
import {
  renderBTTToDocument,
  type RenderFailedNode,
  type RenderMediaTokenMapping,
} from '../../lark/docx/render-btt.js';
import {
  DEFAULT_MERMAID_BOARD_SYNTAX_TYPE,
  normalizeMermaidRenderTarget,
  type MermaidRenderConfig,
} from './mermaid-render.js';
import { convertLASTToBTT } from '../../interop/index.js';
import { createLarkClientConfigFromEnv } from '../../lark/index.js';
import { hastToLAST, markdownToHast, prepareMarkdownBeforePublish } from '../../pipeline/index.js';
export { getPublishMdUsage, parsePublishMdArgs };
export type { PublishMdCliOptions };

function getSdkDomain(baseUrl: string): lark.Domain | string {
  const lower = baseUrl.toLowerCase();
  if (lower.includes('open.larksuite.com')) return lark.Domain.Lark;
  if (lower.includes('open.feishu.cn')) return lark.Domain.Feishu;
  return baseUrl;
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value);
}

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

function parseOptionalEnvNonNegativeInt(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return toNonNegativeInt(Number(trimmed));
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim().length === 0) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeOptionalPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed === '~') return process.env.HOME;
  if (trimmed.startsWith('~/')) {
    const home = process.env.HOME;
    return home ? path.join(home, trimmed.slice(2)) : trimmed;
  }
  return trimmed;
}

function buildPrepareDirForSource(prepareRootDir: string, sourcePath: string): string {
  const sourceHash = createHash('sha1').update(path.resolve(sourcePath)).digest('hex').slice(0, 12);
  const baseName = path.basename(sourcePath, path.extname(sourcePath)).replace(/[^a-zA-Z0-9._-]+/g, '-');
  return path.join(prepareRootDir, `${baseName || 'md'}-${sourceHash}`);
}

interface PipelineStagePaths {
  rootDir: string;
  sourceDir: string;
  prepareDir: string;
  hastDir: string;
  lastDir: string;
  bttDir: string;
  publishDir: string;
}

interface PublishStageArtifact {
  status: 'dry-run' | 'published' | 'failed';
  sourcePath: string;
  title: string;
  documentId: string | null;
  rootBlockId: string | null;
  createdAt: string;
  finishedAt: string;
  failedBlocks: RenderFailedNode[];
  retryLogs: string[];
  mediaTokenMappings: RenderMediaTokenMapping[];
  error?: string;
}

type FolderDocIndex = Map<string, string[]>;

function buildPipelineStagePaths(cacheRootDir: string, sourcePath: string): PipelineStagePaths {
  const rootDir = buildPrepareDirForSource(cacheRootDir, sourcePath);
  return {
    rootDir,
    sourceDir: path.join(rootDir, '00-source'),
    prepareDir: path.join(rootDir, '01-prepare'),
    hastDir: path.join(rootDir, '02-hast'),
    lastDir: path.join(rootDir, '03-last'),
    bttDir: path.join(rootDir, '04-btt'),
    publishDir: path.join(rootDir, '05-publish'),
  };
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function stringifyConsoleArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

async function withCapturedRetryLogs<T>(
  run: () => Promise<T>,
): Promise<{ result?: T; retryLogs: string[]; error?: unknown }> {
  const originalWarn = console.warn;
  const retryLogs: string[] = [];
  let result: T | undefined;
  let caughtError: unknown;
  console.warn = (...args: unknown[]) => {
    const line = args.map((arg) => stringifyConsoleArg(arg)).join(' ');
    if (line.includes('[retry]')) {
      retryLogs.push(line);
    }
    originalWarn(...args);
  };
  try {
    result = await run();
  } catch (error) {
    caughtError = error;
  } finally {
    console.warn = originalWarn;
  }
  if (caughtError !== undefined) {
    return { retryLogs, error: caughtError };
  }
  if (result !== undefined) {
    return { result, retryLogs };
  }
  return { retryLogs };
}

function inferFailedBlocksFromError(error: unknown): RenderFailedNode[] {
  const message = error instanceof Error ? error.message : String(error);
  const sourceMatch = /source=([^\s]+)\s+type=(\d+)/.exec(message);
  if (!sourceMatch || !sourceMatch[1] || !sourceMatch[2]) {
    return [];
  }
  return [
    {
      sourceBlockId: sourceMatch[1],
      blockType: Number.parseInt(sourceMatch[2], 10),
      parentBlockId: '',
      error: message,
    },
  ];
}

function buildFolderDocIndex(entries: Array<{ token: string; name: string; type: string }>): FolderDocIndex {
  const byTitle: FolderDocIndex = new Map();
  for (const entry of entries) {
    if (entry.type !== 'docx') continue;
    const title = entry.name;
    const token = entry.token;
    if (!title || !token) continue;
    const current = byTitle.get(title);
    if (current) {
      current.push(token);
    } else {
      byTitle.set(title, [token]);
    }
  }
  return byTitle;
}

function prependDocIntoFolderIndex(index: FolderDocIndex, title: string, documentId: string): void {
  const current = index.get(title);
  if (current) {
    if (!current.includes(documentId)) {
      current.unshift(documentId);
    }
    return;
  }
  index.set(title, [documentId]);
}

export async function publishMdToLark(
  options: PublishMdCliOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const inputSet = await resolvePublishInputSet(options.inputPath);
  const markdownPreset = await loadMarkdownPreset(options.presetPath);
  if (options.documentId && inputSet.markdownFiles.length !== 1) {
    throw new Error('--doc only supports single markdown input file.');
  }

  const config = createLarkClientConfigFromEnv(env);
  const sdkClient = new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: getSdkDomain(config.baseUrl),
    loggerLevel: lark.LoggerLevel.warn,
    disableTokenCache: false,
  });

  const authOptions: LarkRequestOptions =
    config.tokenType === 'user' ? lark.withUserAccessToken(config.userAccessToken) : undefined;

  const docxLimiterIntervalMs = toPositiveInt(Number((env.LARK_DOCX_MIN_INTERVAL_MS ?? '').trim())) ?? 260;
  const mediaLimiterIntervalMs = toPositiveInt(Number((env.LARK_MEDIA_MIN_INTERVAL_MS ?? '').trim())) ?? 450;
  const publishCooldownMs = toPositiveInt(Number((env.LARK_PUBLISH_COOLDOWN_MS ?? '').trim())) ?? 600;
  const downloadRemoteImages = options.downloadRemoteImages ?? parseBoolean(env.DOWNLOAD_REMOTE_IMAGES, true);
  const titleDatePrefix = options.titleDatePrefix ?? parseBoolean(env.LARK_TITLE_DATE_PREFIX, true);
  const ytDlpPath = normalizeOptionalPath(options.ytDlpPath ?? env.YT_DLP_PATH);
  const ytDlpCookiesPath = normalizeOptionalPath(options.ytDlpCookiesPath ?? env.YT_DLP_COOKIES_PATH);
  const pipelineCacheRootDir = path.resolve(
    options.pipelineCacheDir ?? env.PIPELINE_CACHE_DIR ?? './out/pipeline-cache',
  );
  const prepareTimeoutMs = toPositiveInt(Number((env.PREPARE_TIMEOUT_MS ?? '').trim())) ?? 15_000;
  const prepareMaxRetries = toNonNegativeInt(Number((env.PREPARE_MAX_RETRIES ?? '').trim())) ?? 3;
  const prepareBackoffBaseMs = toPositiveInt(Number((env.PREPARE_BACKOFF_BASE_MS ?? '').trim())) ?? 500;
  const prepareBackoffMaxMs = toPositiveInt(Number((env.PREPARE_BACKOFF_MAX_MS ?? '').trim())) ?? 5_000;
  const prepareBackoffJitterRatio = Number((env.PREPARE_BACKOFF_JITTER_RATIO ?? '').trim());
  const prepareJitter =
    Number.isFinite(prepareBackoffJitterRatio) && prepareBackoffJitterRatio >= 0 ? prepareBackoffJitterRatio : 0.2;
  const ytDlpTimeoutMs = toPositiveInt(Number((env.YT_DLP_TIMEOUT_MS ?? '').trim())) ?? 600_000;
  const mermaidTarget = normalizeMermaidRenderTarget(options.mermaidTarget ?? env.LARK_MERMAID_TARGET);
  const mermaidBoardSyntaxType =
    options.mermaidBoardSyntaxType ??
    parseOptionalEnvNonNegativeInt(env.LARK_MERMAID_BOARD_SYNTAX_TYPE) ??
    DEFAULT_MERMAID_BOARD_SYNTAX_TYPE;
  const mermaidBoardStyleType =
    options.mermaidBoardStyleType ?? parseOptionalEnvNonNegativeInt(env.LARK_MERMAID_BOARD_STYLE_TYPE);
  const mermaidBoardDiagramType =
    options.mermaidBoardDiagramType ?? parseOptionalEnvNonNegativeInt(env.LARK_MERMAID_BOARD_DIAGRAM_TYPE);
  const mermaidRenderConfig: MermaidRenderConfig = {
    target: mermaidTarget,
    board: {
      syntaxType: mermaidBoardSyntaxType,
      ...(mermaidBoardStyleType === undefined ? {} : { styleType: mermaidBoardStyleType }),
      ...(mermaidBoardDiagramType === undefined ? {} : { diagramType: mermaidBoardDiagramType }),
    },
  };

  const docxLimiter = new RateLimiter(docxLimiterIntervalMs);
  const mediaLimiter = new RateLimiter(mediaLimiterIntervalMs);

  console.log(
    `Resolved markdown files: ${inputSet.markdownFiles.length} (${inputSet.mode === 'single' ? 'single' : 'directory'})`,
  );
  console.log(
    `Rate limits: docx=${docxLimiterIntervalMs}ms media=${mediaLimiterIntervalMs}ms cooldown=${publishCooldownMs}ms`,
  );
  console.log(
    `Prepare: download_remote_images=${String(downloadRemoteImages)} yt_dlp=${ytDlpPath ? 'enabled' : 'disabled'}`,
  );
  console.log(
    mermaidRenderConfig.target === 'board'
      ? `Mermaid: target=board syntax_type=${String(mermaidRenderConfig.board.syntaxType)} style_type=${String(
          mermaidRenderConfig.board.styleType ?? '(default)',
        )} diagram_type=${String(mermaidRenderConfig.board.diagramType ?? '(default)')}`
      : 'Mermaid: target=text-drawing',
  );
  if (markdownPreset) {
    console.log(`Preset: ${markdownPreset.displayPath}`);
  }

  let folderDocIndex: FolderDocIndex | null = null;
  const ensureFolderDocIndex = async (): Promise<FolderDocIndex> => {
    if (folderDocIndex) return folderDocIndex;
    if (!options.folderToken) {
      throw new Error('Folder token is required when publishing without --doc.');
    }
    const files = await listFolderChildren(sdkClient, options.folderToken, authOptions, docxLimiter);
    folderDocIndex = buildFolderDocIndex(files);
    return folderDocIndex;
  };

  for (let index = 0; index < inputSet.markdownFiles.length; index += 1) {
    const markdownPath = inputSet.markdownFiles[index]!;
    const sourceMarkdown = await readFile(markdownPath, 'utf8');
    const stagePaths = buildPipelineStagePaths(pipelineCacheRootDir, markdownPath);
    const startedAt = new Date().toISOString();

    await ensureDir(stagePaths.sourceDir);
    await writeFile(path.join(stagePaths.sourceDir, 'original.md'), sourceMarkdown, 'utf8');

    let markdown = sourceMarkdown;
    if (markdownPreset) {
      markdown = await markdownPreset.transform(markdown, {
        inputPath: markdownPath,
        index,
        total: inputSet.markdownFiles.length,
        env,
        log: (...args: unknown[]) =>
          console.log(`[preset ${index + 1}/${inputSet.markdownFiles.length}]`, ...args.map((arg) => String(arg))),
      });
    }
    await writeFile(path.join(stagePaths.sourceDir, 'preset.md'), markdown, 'utf8');
    await writeJson(path.join(stagePaths.sourceDir, 'meta.json'), {
      sourcePath: path.resolve(markdownPath),
      preset: markdownPreset ? markdownPreset.displayPath : null,
      startedAt,
    });

    const prepareOptions = {
      enabled: downloadRemoteImages,
      prepareDir: stagePaths.prepareDir,
      timeoutMs: prepareTimeoutMs,
      maxRetries: prepareMaxRetries,
      backoffBaseMs: prepareBackoffBaseMs,
      backoffMaxMs: prepareBackoffMaxMs,
      backoffJitterRatio: prepareJitter,
      ytDlpTimeoutMs,
      ...(ytDlpPath ? { ytDlpPath } : {}),
      ...(ytDlpCookiesPath ? { ytDlpCookiesPath } : {}),
    };
    const prepareResult = await prepareMarkdownBeforePublish(markdownPath, markdown, prepareOptions);
    markdown = prepareResult.preparedContent;
    await ensureDir(stagePaths.prepareDir);
    await writeFile(path.join(stagePaths.prepareDir, 'prepared.md'), markdown, 'utf8');
    const { preparedContent: _ignoredPreparedContent, ...prepareMeta } = prepareResult;
    await writeJson(path.join(stagePaths.prepareDir, 'result.json'), prepareMeta);
    console.log(
      `[prepare ${index + 1}/${inputSet.markdownFiles.length}] rewritten=${prepareResult.rewrittenCount} downloaded=${prepareResult.downloadedCount} failed=${prepareResult.failedCount} log=${prepareResult.logFilePath}`,
    );
    const hast = await markdownToHast(markdown);
    await writeJson(path.join(stagePaths.hastDir, 'hast.json'), hast);
    const h1RuleResult = options.title ? {} : applySingleH1TitleRule(hast);
    const title = buildTitleForMarkdown(markdownPath, inputSet, options.title, h1RuleResult.derivedTitle, {
      datePrefix: titleDatePrefix,
    });
    const last = hastToLAST(hast, {
      documentId: buildPipelineDocumentId(markdownPath),
      mode: 'fragment',
    });
    await writeJson(path.join(stagePaths.lastDir, 'last.json'), last);

    ensureLastBlockBttIds(last);
    const baseDir = path.dirname(markdownPath);
    const localAssetByBlockId = applyStandaloneAttachmentTransforms(last, baseDir);
    applyTableColumnWidthHeuristics(last);
    const mermaidByBlockId = collectMermaidPatches(last);

    const btt = convertLASTToBTT(last, {
      documentId: buildPipelineDocumentId(markdownPath),
    });
    patchBTTForMermaidAndAssets(btt, mermaidByBlockId, localAssetByBlockId, {
      mermaidRender: mermaidRenderConfig,
    });
    await writeJson(path.join(stagePaths.bttDir, 'btt.json'), btt);
    await writeJson(path.join(stagePaths.bttDir, 'meta.json'), {
      mermaidPatchCount: mermaidByBlockId.size,
      mermaidTarget: mermaidRenderConfig.target,
      mermaidBoard: mermaidRenderConfig.board,
      localAssetCount: localAssetByBlockId.size,
    });

    if (options.dryRun) {
      const dryRunArtifact: PublishStageArtifact = {
        status: 'dry-run',
        sourcePath: path.resolve(markdownPath),
        title,
        documentId: null,
        rootBlockId: null,
        createdAt: startedAt,
        finishedAt: new Date().toISOString(),
        failedBlocks: [],
        retryLogs: [],
        mediaTokenMappings: [],
      };
      await writeJson(path.join(stagePaths.publishDir, 'result.json'), dryRunArtifact);

      console.log(`[dry-run ${index + 1}/${inputSet.markdownFiles.length}] input: ${markdownPath}`);
      console.log(`[dry-run ${index + 1}/${inputSet.markdownFiles.length}] title: ${title}`);
      console.log(`[dry-run ${index + 1}/${inputSet.markdownFiles.length}] blocks: ${Object.keys(last.blocks).length}`);
      console.log(
        `[dry-run ${index + 1}/${inputSet.markdownFiles.length}] btt blocks: ${Object.keys(btt.flatBlocks).length}`,
      );
      console.log(`[dry-run ${index + 1}/${inputSet.markdownFiles.length}] mermaid patches: ${mermaidByBlockId.size}`);
      console.log(
        `[dry-run ${index + 1}/${inputSet.markdownFiles.length}] mermaid target: ${mermaidRenderConfig.target}`,
      );
      console.log(`[dry-run ${index + 1}/${inputSet.markdownFiles.length}] local assets: ${localAssetByBlockId.size}`);
      continue;
    }

    let documentId = options.documentId ? normalizeDocumentId(options.documentId) : '';
    let rootBlockId: string | null = null;
    let failedBlocks: RenderFailedNode[] = [];
    let mediaTokenMappings: RenderMediaTokenMapping[] = [];
    let retryLogs: string[] = [];

    try {
      const captured = await withCapturedRetryLogs(async () => {
        if (!documentId) {
          const byTitle = await ensureFolderDocIndex();
          const sameNameDocs = byTitle.get(title) ?? [];

          if (sameNameDocs.length > 0) {
            documentId = sameNameDocs[0] ?? '';
            console.log(`[${index + 1}/${inputSet.markdownFiles.length}] Found existing doc by title: ${documentId}`);
          } else {
            documentId = await createDocument(sdkClient, options.folderToken, title, authOptions, docxLimiter);
            prependDocIntoFolderIndex(byTitle, title, documentId);
            console.log(`[${index + 1}/${inputSet.markdownFiles.length}] Created doc: ${documentId}`);
          }
        }

        if (!documentId) {
          throw new Error('Failed to resolve target document id.');
        }

        rootBlockId = await clearDocumentContent(sdkClient, documentId, authOptions, docxLimiter);
        const renderReport = await renderBTTToDocument(
          sdkClient,
          documentId,
          rootBlockId,
          btt.root,
          authOptions,
          docxLimiter,
          mediaLimiter,
          {
            continueOnError: true,
            mermaidByBlockId,
            mermaidRender: mermaidRenderConfig,
          },
        );
        failedBlocks = renderReport.failedNodes;
        mediaTokenMappings = renderReport.mediaTokenMappings;

        if (renderReport.failedNodes.length > 0) {
          const first = renderReport.failedNodes[0]!;
          throw new Error(
            `renderBTTToDocument has ${renderReport.failedNodes.length} failed block(s), first source=${first.sourceBlockId} type=${first.blockType}`,
          );
        }
      });
      retryLogs = captured.retryLogs;
      if (captured.error !== undefined) {
        throw captured.error;
      }
    } catch (error) {
      if (failedBlocks.length === 0) {
        failedBlocks = inferFailedBlocksFromError(error);
      }
      const failedArtifact: PublishStageArtifact = {
        status: 'failed',
        sourcePath: path.resolve(markdownPath),
        title,
        documentId: documentId || null,
        rootBlockId,
        createdAt: startedAt,
        finishedAt: new Date().toISOString(),
        failedBlocks,
        retryLogs,
        mediaTokenMappings,
        error: error instanceof Error ? error.message : String(error),
      };
      await writeJson(path.join(stagePaths.publishDir, 'result.json'), failedArtifact);
      throw error;
    }

    const successArtifact: PublishStageArtifact = {
      status: 'published',
      sourcePath: path.resolve(markdownPath),
      title,
      documentId,
      rootBlockId,
      createdAt: startedAt,
      finishedAt: new Date().toISOString(),
      failedBlocks,
      retryLogs,
      mediaTokenMappings,
    };
    await writeJson(path.join(stagePaths.publishDir, 'result.json'), successArtifact);

    console.log(`[${index + 1}/${inputSet.markdownFiles.length}] Published markdown: ${markdownPath}`);
    console.log(`[${index + 1}/${inputSet.markdownFiles.length}] Document ID: ${documentId}`);
    console.log(`[${index + 1}/${inputSet.markdownFiles.length}] Title: ${title}`);
    console.log(
      `[${index + 1}/${inputSet.markdownFiles.length}] stage-cache: ${stagePaths.rootDir} (00-source..05-publish)`,
    );
    if (index < inputSet.markdownFiles.length - 1 && publishCooldownMs > 0) {
      console.log(
        `[${index + 1}/${inputSet.markdownFiles.length}] Cooldown ${publishCooldownMs}ms before next markdown...`,
      );
      await sleep(publishCooldownMs);
    }
  }
}

export async function runPublishMdToLarkCli(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (hasPublishMdHelpFlag(argv)) {
    console.log(getPublishMdUsage());
    return;
  }
  const options = parsePublishMdArgs(argv, env);
  await publishMdToLark(options, env);
}
