import {
  getPublishMdUsage,
  hasPublishMdHelpFlag,
  parsePublishMdArgs,
  type PublishMdCliOptions,
  type PublishMdToLarkOptions,
} from './args.js';
import { resolvePublishInputSet } from './input-resolver.js';
import { loadMarkdownPresets } from './preset-loader.js';
import { createDocument, listFolderChildren, normalizeDocumentId } from '../../lark/docx/ops.js';
import { processSingleMarkdownFile } from '../../publish/process-file.js';
import { buildPublishRuntime, logPublishRuntimeSummary } from '../../publish/runtime.js';
import { sleep } from '../../shared/rate-limiter.js';
import { getRendererCapabilities, validateRendererContract } from '../../protocol/index.js';

export { getPublishMdUsage, parsePublishMdArgs };
export type { PublishMdCliOptions, PublishMdToLarkOptions };

export interface PublishMdResult {
  documentId: string | null;
  title: string;
  status: 'dry-run' | 'published' | 'failed';
  documentUrl: string | null;
}

type FolderDocIndex = Map<string, string[]>;

function resolveMarkdownPresetRefs(options: PublishMdCliOptions): string[] {
  if (options.presetPaths && options.presetPaths.length > 0) {
    return options.presetPaths.map((presetPath) => presetPath.trim()).filter(Boolean);
  }
  return options.presetPath?.trim() ? [options.presetPath.trim()] : [];
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

function createFolderDocumentResolver(
  runtime: ReturnType<typeof buildPublishRuntime>,
  options: PublishMdCliOptions,
): (title: string) => Promise<string> {
  let folderDocIndex: FolderDocIndex | null = null;

  const ensureFolderDocIndex = async (): Promise<FolderDocIndex> => {
    if (folderDocIndex) return folderDocIndex;
    if (!options.folderToken) {
      throw new Error('Folder token is required when publishing without --doc.');
    }
    const files = await listFolderChildren(
      runtime.sdkClient,
      options.folderToken,
      runtime.authOptions,
      runtime.docxLimiter,
    );
    folderDocIndex = buildFolderDocIndex(files);
    return folderDocIndex;
  };

  return async (title: string): Promise<string> => {
    const byTitle = await ensureFolderDocIndex();
    const sameNameDocs = byTitle.get(title) ?? [];
    if (sameNameDocs.length > 0) {
      return sameNameDocs[0] ?? '';
    }

    const documentId = await createDocument(
      runtime.sdkClient,
      options.folderToken,
      title,
      runtime.authOptions,
      runtime.docxLimiter,
    );
    prependDocIntoFolderIndex(byTitle, title, documentId);
    return documentId;
  };
}

export async function publishMdToLark(
  options: PublishMdToLarkOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PublishMdResult[]> {
  const publishOptions: PublishMdCliOptions = {
    ...options,
    folderToken: options.folderToken?.trim() || env.LARK_FOLDER_TOKEN?.trim() || '',
    dryRun: options.dryRun ?? false,
  };
  if (!publishOptions.dryRun && !publishOptions.documentId && !publishOptions.folderToken) {
    throw new Error('Folder token is required when documentId is not provided.');
  }
  const inputSet = await resolvePublishInputSet(publishOptions.inputPath);
  const markdownPresets = await loadMarkdownPresets(resolveMarkdownPresetRefs(publishOptions));
  if (publishOptions.documentId && inputSet.markdownFiles.length !== 1) {
    throw new Error('--doc only supports single markdown input file.');
  }

  const runtime = buildPublishRuntime(publishOptions, env, markdownPresets);
  logPublishRuntimeSummary(runtime, inputSet.markdownFiles.length, inputSet.mode);

  const normalizedDocumentId = publishOptions.documentId ? normalizeDocumentId(publishOptions.documentId) : undefined;
  const resolveTargetDocumentId =
    publishOptions.dryRun || normalizedDocumentId ? undefined : createFolderDocumentResolver(runtime, publishOptions);
  const results: PublishMdResult[] = [];

  for (let index = 0; index < inputSet.markdownFiles.length; index += 1) {
    const markdownPath = inputSet.markdownFiles[index]!;
    const perFileOptions = normalizedDocumentId
      ? { ...publishOptions, documentId: normalizedDocumentId }
      : publishOptions;
    const result = await processSingleMarkdownFile({
      runtime,
      inputSet,
      options: perFileOptions,
      markdownPath,
      index,
      ...(resolveTargetDocumentId ? { resolveTargetDocumentId } : {}),
    });
    results.push({
      documentId: result.documentId,
      title: result.title,
      status: result.status,
      documentUrl: result.documentUrl,
    });

    if (!publishOptions.dryRun && index < inputSet.markdownFiles.length - 1 && runtime.publishCooldownMs > 0) {
      console.error(
        `[${index + 1}/${inputSet.markdownFiles.length}] Cooldown ${runtime.publishCooldownMs}ms before next markdown...`,
      );
      await sleep(runtime.publishCooldownMs);
    }
  }

  return results;
}

export async function runPublishMdToLarkCli(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (hasPublishMdHelpFlag(argv)) {
    console.log(getPublishMdUsage());
    return;
  }
  if (argv.includes('--print-capabilities')) {
    const rendererIndex = argv.indexOf('--renderer');
    const renderer = rendererIndex >= 0 ? argv[rendererIndex + 1] : undefined;
    console.log(JSON.stringify(getRendererCapabilities(renderer), null, 2));
    return;
  }
  const validateIndex = argv.indexOf('--validate-contract');
  if (validateIndex >= 0) {
    const contractPath = argv[validateIndex + 1];
    if (!contractPath) throw new Error('Missing value for --validate-contract.');
    const resolved = await validateRendererContract(contractPath);
    console.log(JSON.stringify(resolved, null, 2));
    return;
  }
  const options = parsePublishMdArgs(argv, env);
  const results = await publishMdToLark(options, env);
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}
