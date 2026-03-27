import { getPublishMdUsage, hasPublishMdHelpFlag, parsePublishMdArgs, type PublishMdCliOptions } from './args.js';
import { resolvePublishInputSet } from './input-resolver.js';
import { loadMarkdownPreset } from './preset-loader.js';
import { createDocument, listFolderChildren, normalizeDocumentId } from '../../lark/docx/ops.js';
import { processSingleMarkdownFile } from '../../publish/process-file.js';
import { buildPublishRuntime, logPublishRuntimeSummary } from '../../publish/runtime.js';
import { sleep } from '../../shared/rate-limiter.js';

export { getPublishMdUsage, parsePublishMdArgs };
export type { PublishMdCliOptions };

export interface PublishMdResult {
  documentId: string | null;
  title: string;
  status: 'dry-run' | 'published' | 'failed';
  documentUrl: string | null;
}

type FolderDocIndex = Map<string, string[]>;

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
  options: PublishMdCliOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PublishMdResult[]> {
  const inputSet = await resolvePublishInputSet(options.inputPath);
  const markdownPreset = await loadMarkdownPreset(options.presetPath);
  if (options.documentId && inputSet.markdownFiles.length !== 1) {
    throw new Error('--doc only supports single markdown input file.');
  }

  const runtime = buildPublishRuntime(options, env, markdownPreset);
  logPublishRuntimeSummary(runtime, inputSet.markdownFiles.length, inputSet.mode);

  const normalizedDocumentId = options.documentId ? normalizeDocumentId(options.documentId) : undefined;
  const resolveTargetDocumentId =
    options.dryRun || normalizedDocumentId
      ? undefined
      : createFolderDocumentResolver(runtime, options);
  const results: PublishMdResult[] = [];

  for (let index = 0; index < inputSet.markdownFiles.length; index += 1) {
    const markdownPath = inputSet.markdownFiles[index]!;
    const perFileOptions = normalizedDocumentId ? { ...options, documentId: normalizedDocumentId } : options;
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

    if (!options.dryRun && index < inputSet.markdownFiles.length - 1 && runtime.publishCooldownMs > 0) {
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
  const options = parsePublishMdArgs(argv, env);
  const results = await publishMdToLark(options, env);
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}
