import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { convertLASTToBTT } from '../interop/index.js';
import { clearDocumentContent, listAllDocumentBlocks, normalizeDocumentId } from '../lark/docx/ops.js';
import { renderBTTToDocument, type RenderFailedNode, type RenderMediaTokenMapping } from '../lark/docx/render-btt.js';
import { hastToLAST, markdownToHast, markdownToSemanticHast, prepareMarkdownBeforePublish } from '../pipeline/index.js';
import { getRendererCapabilities, resolveRendererContract } from '../protocol/index.js';
import type { PublishMdCliOptions } from '../commands/publish-md/args.js';
import type { PublishInputSet } from '../commands/publish-md/input-resolver.js';
import { applySingleH1TitleRule, buildTitleForMarkdown } from '../commands/publish-md/title-policy.js';
import { applyStandaloneAttachmentTransforms } from './asset-adapter.js';
import { patchBTTForMermaidAndAssets } from './btt-patch.js';
import { buildPipelineDocumentId } from './ids.js';
import { applyTableColumnWidthHeuristics, collectMermaidPatches, ensureLastBlockBttIds } from './last-normalize.js';
import { assertValidLastForLark } from './lark-tree-validator.js';
import { composeImageSizeResolvers, createImageSizeManifestResolver } from './image-size-manifest.js';
import { createArticleRenderReport, type ArticleRenderReport } from './render-report.js';
import type { PublishRuntime } from './runtime.js';
import {
  buildPipelineStagePaths,
  type PipelineStagePaths,
  type PublishStageArtifact,
  writeBttStage,
  writeContractStage,
  writeHastStage,
  writeLastStage,
  writePrepareStage,
  writePublishStageArtifact,
  writeRenderReport,
  writeSemanticStage,
  writeSourceStage,
} from './stage-cache.js';

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

export interface ProcessSingleMarkdownFileParams {
  runtime: PublishRuntime;
  inputSet: PublishInputSet;
  options: PublishMdCliOptions;
  markdownPath: string;
  index: number;
  resolveTargetDocumentId?: (title: string) => Promise<string>;
}

export interface ProcessSingleMarkdownFileResult {
  stagePaths: PipelineStagePaths;
  title: string;
  documentId: string | null;
  documentUrl: string | null;
  status: PublishStageArtifact['status'];
}

export async function processSingleMarkdownFile(
  params: ProcessSingleMarkdownFileParams,
): Promise<ProcessSingleMarkdownFileResult> {
  const { runtime, inputSet, options, markdownPath, index, resolveTargetDocumentId } = params;
  const startedAt = new Date().toISOString();
  const sourceMarkdown = await readFile(markdownPath, 'utf8');
  const resourceBaseDir = runtime.resourceBaseDir ?? path.dirname(markdownPath);
  const contractResolution = await resolveRendererContract({
    inputPath: markdownPath,
    markdown: sourceMarkdown,
    renderer: options.renderer ?? 'lark',
    ...(options.rendererContractPath ? { rendererContractPath: options.rendererContractPath } : {}),
    ...(options.rendererDefaultContractPath
      ? { rendererDefaultContractPath: options.rendererDefaultContractPath }
      : {}),
    ...(options.strict === undefined ? {} : { strict: options.strict }),
  });
  const resolvedContract = contractResolution.resolved;
  const stagePaths = buildPipelineStagePaths(runtime.pipelineCacheRootDir, markdownPath, {
    protocolMode: Boolean(resolvedContract),
  });
  if (resolvedContract) {
    await writeContractStage(stagePaths, resolvedContract, getRendererCapabilities(resolvedContract.contract.renderer));
  }

  let markdown = resolvedContract ? contractResolution.markdownBody : sourceMarkdown;
  for (let presetIndex = 0; presetIndex < runtime.markdownPresets.length; presetIndex += 1) {
    const preset = runtime.markdownPresets[presetIndex]!;
    markdown = await preset.transform(markdown, {
      inputPath: markdownPath,
      index,
      total: inputSet.markdownFiles.length,
      env: runtime.env,
      log: (...args: unknown[]) =>
        console.error(
          `[preset ${presetIndex + 1}/${runtime.markdownPresets.length} file ${index + 1}/${inputSet.markdownFiles.length}] [${preset.displayPath}]`,
          ...args.map((arg) => String(arg)),
        ),
    });
  }

  await writeSourceStage(stagePaths, sourceMarkdown, markdown, {
    sourcePath: path.resolve(markdownPath),
    resourceBaseDir,
    preset: runtime.markdownPresets.length === 1 ? runtime.markdownPresets[0]!.displayPath : null,
    presets: runtime.markdownPresets.map((preset) => preset.displayPath),
    startedAt,
  });

  const prepareResult = await prepareMarkdownBeforePublish(markdownPath, markdown, {
    ...runtime.prepareConfig,
    prepareDir: stagePaths.prepareDir,
  });
  markdown = prepareResult.preparedContent;
  await writePrepareStage(stagePaths, markdown, prepareResult);
  console.error(
    `[prepare ${index + 1}/${inputSet.markdownFiles.length}] rewritten=${prepareResult.rewrittenCount} downloaded=${prepareResult.downloadedCount} failed=${prepareResult.failedCount} log=${prepareResult.logFilePath}`,
  );

  const larkTarget = resolvedContract?.contract.targets.lark;
  const semanticResult = resolvedContract
    ? await markdownToSemanticHast(markdown, {
        inputPath: markdownPath,
        strict: resolvedContract.strict,
        singleDollarTextMath:
          runtime.markdownParseConfig.singleDollarTextMath ||
          Boolean(larkTarget?.math?.inline_delimiters?.includes('dollar')),
        ...(larkTarget ? { target: larkTarget } : {}),
      })
    : null;
  const hast = semanticResult ? semanticResult.hast : await markdownToHast(markdown, runtime.markdownParseConfig);
  await writeHastStage(stagePaths, hast);
  if (semanticResult) await writeSemanticStage(stagePaths, semanticResult.semantic);
  let articleRenderReport: ArticleRenderReport | null =
    resolvedContract && semanticResult
      ? createArticleRenderReport({
          resolved: resolvedContract,
          source: path.basename(markdownPath),
          semantic: semanticResult.semantic,
        })
      : null;
  if (articleRenderReport) {
    await writeRenderReport(stagePaths, articleRenderReport, options.renderReportPath);
  }
  const semanticErrors =
    semanticResult?.semantic.diagnostics.filter((diagnostic) => diagnostic.severity === 'error') ?? [];
  if (semanticErrors.length > 0) {
    const first = semanticErrors[0]!;
    throw new Error(`Renderer semantic validation failed with ${semanticErrors.length} error(s): ${first.message}`);
  }
  const h1RuleResult = options.title ? {} : applySingleH1TitleRule(hast);
  const title = buildTitleForMarkdown(markdownPath, inputSet, options.title, h1RuleResult.derivedTitle, {
    datePrefix: runtime.titleDatePrefix,
  });
  const documentKey = buildPipelineDocumentId(markdownPath);
  const preparedAliases = new Map<string, string>();
  for (const entry of prepareResult.logEntries) {
    if (entry.sourceType === 'image' && entry.localPath) preparedAliases.set(entry.localPath, entry.originalUrl);
  }
  let imageManifestResult: Awaited<ReturnType<typeof createImageSizeManifestResolver>> | null = null;
  const autoManifestPath = path.join(resourceBaseDir, 'assets', 'manifest.yml');
  const imageManifestPath = options.imageSizeManifestPath
    ? path.resolve(options.imageSizeManifestPath)
    : resolvedContract && larkTarget?.figures?.preserve_source_ratio !== false && (await pathExists(autoManifestPath))
      ? autoManifestPath
      : '';
  if (imageManifestPath) {
    imageManifestResult = await createImageSizeManifestResolver(imageManifestPath, {
      resourceBaseDir,
      preparedAliases,
    });
  }
  const imageSizeResolver = composeImageSizeResolvers(runtime.imageSizeResolver, imageManifestResult?.resolver);
  const last = hastToLAST(hast, {
    documentId: documentKey,
    mode: 'fragment',
    ...(imageSizeResolver
      ? {
          imageSizeResolver,
          imageSizeContext: {
            inputPath: markdownPath,
            resourceBaseDir,
          },
        }
      : {}),
    ...(larkTarget ? { semanticTarget: larkTarget } : {}),
  });
  await writeLastStage(stagePaths, last);
  if (resolvedContract && semanticResult) {
    articleRenderReport = createArticleRenderReport({
      resolved: resolvedContract,
      source: path.basename(markdownPath),
      semantic: semanticResult.semantic,
      last,
      ...(imageManifestResult ? { imageSizing: imageManifestResult.resolutions } : {}),
    });
    await writeRenderReport(stagePaths, articleRenderReport, options.renderReportPath);
  }

  ensureLastBlockBttIds(last);
  let localAssetByBlockId: ReturnType<typeof applyStandaloneAttachmentTransforms>;
  try {
    localAssetByBlockId = applyStandaloneAttachmentTransforms(last, resourceBaseDir, {
      missingLocalImage: resolvedContract?.strict ? 'error' : 'fallback',
    });
    if (resolvedContract?.strict) {
      for (const block of Object.values(last.blocks)) {
        if (block.type !== 'image' || localAssetByBlockId.has(block.id) || block.payload.token) continue;
        const sourceUrl = block.selector?.attrs?.sourceUrl;
        throw new Error(`Unresolved image asset: ${typeof sourceUrl === 'string' ? sourceUrl : block.id}`);
      }
    }
    if (resolvedContract) assertValidLastForLark(last);
  } catch (error) {
    if (articleRenderReport) {
      articleRenderReport.errors.push({
        severity: 'error',
        code: 'lark-prepublish-validation',
        message: error instanceof Error ? error.message : String(error),
        sourcePath: markdownPath,
      });
      await writeRenderReport(stagePaths, articleRenderReport, options.renderReportPath);
    }
    throw error;
  }
  applyTableColumnWidthHeuristics(last);
  const mermaidByBlockId = collectMermaidPatches(last);

  const btt = convertLASTToBTT(last, {
    documentId: documentKey,
  });
  patchBTTForMermaidAndAssets(btt, mermaidByBlockId, localAssetByBlockId, {
    mermaidRender: runtime.mermaidRenderConfig,
  });
  await writeBttStage(stagePaths, btt, {
    mermaidPatchCount: mermaidByBlockId.size,
    mermaidTarget: runtime.mermaidRenderConfig.target,
    mermaidBoard: runtime.mermaidRenderConfig.board,
    localAssetCount: localAssetByBlockId.size,
  });
  if (resolvedContract && semanticResult) {
    articleRenderReport = createArticleRenderReport({
      resolved: resolvedContract,
      source: path.basename(markdownPath),
      semantic: semanticResult.semantic,
      last,
      bttBlockTypes: Object.values(btt.flatBlocks).map((block) => block.block_type),
      ...(imageManifestResult ? { imageSizing: imageManifestResult.resolutions } : {}),
    });
    await writeRenderReport(stagePaths, articleRenderReport, options.renderReportPath);
  }

  if (options.dryRun) {
    const dryRunArtifact: PublishStageArtifact = {
      status: 'dry-run',
      sourcePath: path.resolve(markdownPath),
      title,
      documentId: null,
      documentUrl: null,
      rootBlockId: null,
      createdAt: startedAt,
      finishedAt: new Date().toISOString(),
      failedBlocks: [],
      retryLogs: [],
      mediaTokenMappings: [],
    };
    await writePublishStageArtifact(stagePaths, dryRunArtifact);

    console.error(`[dry-run ${index + 1}/${inputSet.markdownFiles.length}] input: ${markdownPath}`);
    console.error(`[dry-run ${index + 1}/${inputSet.markdownFiles.length}] title: ${title}`);
    console.error(`[dry-run ${index + 1}/${inputSet.markdownFiles.length}] blocks: ${Object.keys(last.blocks).length}`);
    console.error(
      `[dry-run ${index + 1}/${inputSet.markdownFiles.length}] btt blocks: ${Object.keys(btt.flatBlocks).length}`,
    );
    console.error(`[dry-run ${index + 1}/${inputSet.markdownFiles.length}] mermaid patches: ${mermaidByBlockId.size}`);
    console.error(
      `[dry-run ${index + 1}/${inputSet.markdownFiles.length}] mermaid target: ${runtime.mermaidRenderConfig.target}`,
    );
    console.error(`[dry-run ${index + 1}/${inputSet.markdownFiles.length}] local assets: ${localAssetByBlockId.size}`);
    return {
      stagePaths,
      title,
      documentId: null,
      documentUrl: null,
      status: 'dry-run',
    };
  }

  let documentId = options.documentId ? normalizeDocumentId(options.documentId) : '';
  let rootBlockId: string | null = null;
  let failedBlocks: RenderFailedNode[] = [];
  let mediaTokenMappings: RenderMediaTokenMapping[] = [];
  let retryLogs: string[] = [];

  try {
    const captured = await withCapturedRetryLogs(async () => {
      if (!documentId) {
        if (!resolveTargetDocumentId) {
          throw new Error('Failed to resolve target document id.');
        }
        documentId = await resolveTargetDocumentId(title);
      }

      if (!documentId) {
        throw new Error('Failed to resolve target document id.');
      }

      rootBlockId = await clearDocumentContent(runtime.sdkClient, documentId, runtime.authOptions, runtime.docxLimiter);
      const renderReport = await renderBTTToDocument(
        runtime.sdkClient,
        documentId,
        rootBlockId,
        btt.root,
        runtime.authOptions,
        runtime.docxLimiter,
        runtime.mediaLimiter,
        {
          continueOnError: true,
          mermaidByBlockId,
          mermaidRender: runtime.mermaidRenderConfig,
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
    if (resolvedContract && semanticResult && articleRenderReport) {
      const remoteBlocks = await listAllDocumentBlocks(
        runtime.sdkClient,
        documentId,
        runtime.authOptions,
        runtime.docxLimiter,
      );
      articleRenderReport = createArticleRenderReport({
        resolved: resolvedContract,
        source: path.basename(markdownPath),
        semantic: semanticResult.semantic,
        last,
        bttBlockTypes: Object.values(btt.flatBlocks).map((block) => block.block_type),
        ...(imageManifestResult ? { imageSizing: imageManifestResult.resolutions } : {}),
        remoteBlockTypes: remoteBlocks.map((block) => block.block_type),
      });
      for (const blockType of [19, 27, 31]) {
        const expected = Object.values(btt.flatBlocks).filter((block) => block.block_type === blockType).length;
        const actual = remoteBlocks.filter((block) => block.block_type === blockType).length;
        if (expected !== actual) {
          articleRenderReport.errors.push({
            severity: 'error',
            code: 'remote-block-count-mismatch',
            message: `Remote block_type=${blockType} count ${actual} does not match emitted count ${expected}.`,
            sourcePath: markdownPath,
          });
        }
      }
      await writeRenderReport(stagePaths, articleRenderReport, options.renderReportPath);
      if (resolvedContract.strict && articleRenderReport.errors.length > 0) {
        throw new Error(articleRenderReport.errors[0]!.message);
      }
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
      documentUrl: documentId ? runtime.documentUrlFor(documentId) : null,
      rootBlockId,
      createdAt: startedAt,
      finishedAt: new Date().toISOString(),
      failedBlocks,
      retryLogs,
      mediaTokenMappings,
      error: error instanceof Error ? error.message : String(error),
    };
    await writePublishStageArtifact(stagePaths, failedArtifact);
    if (articleRenderReport) {
      articleRenderReport.errors.push({
        severity: 'error',
        code: 'lark-publish-or-verify',
        message: error instanceof Error ? error.message : String(error),
        sourcePath: markdownPath,
      });
      await writeRenderReport(stagePaths, articleRenderReport, options.renderReportPath);
    }
    throw error;
  }

  const documentUrl = runtime.documentUrlFor(documentId);

  const successArtifact: PublishStageArtifact = {
    status: 'published',
    sourcePath: path.resolve(markdownPath),
    title,
    documentId,
    documentUrl,
    rootBlockId,
    createdAt: startedAt,
    finishedAt: new Date().toISOString(),
    failedBlocks,
    retryLogs,
    mediaTokenMappings,
  };
  await writePublishStageArtifact(stagePaths, successArtifact);

  console.error(`[${index + 1}/${inputSet.markdownFiles.length}] Published markdown: ${markdownPath}`);
  console.error(`[${index + 1}/${inputSet.markdownFiles.length}] Document ID: ${documentId}`);
  console.error(`[${index + 1}/${inputSet.markdownFiles.length}] Document URL: ${documentUrl}`);
  console.error(`[${index + 1}/${inputSet.markdownFiles.length}] Title: ${title}`);
  console.error(
    `[${index + 1}/${inputSet.markdownFiles.length}] stage-cache: ${stagePaths.rootDir} (00-source..05-publish)`,
  );

  return {
    stagePaths,
    title,
    documentId,
    documentUrl,
    status: 'published',
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
