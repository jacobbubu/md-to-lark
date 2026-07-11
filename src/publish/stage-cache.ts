import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RenderFailedNode, RenderMediaTokenMapping } from '../lark/docx/render-btt.js';
import type { PrepareMarkdownLogFile, PrepareMarkdownResult } from '../pipeline/markdown/prepare-markdown.js';
import type { RendererCapabilities, ResolvedRendererContract } from '../protocol/types.js';

function buildPrepareDirForSource(prepareRootDir: string, sourcePath: string): string {
  const sourceHash = createHash('sha1').update(path.resolve(sourcePath)).digest('hex').slice(0, 12);
  const baseName = path.basename(sourcePath, path.extname(sourcePath)).replace(/[^a-zA-Z0-9._-]+/g, '-');
  return path.join(prepareRootDir, `${baseName || 'md'}-${sourceHash}`);
}

export interface PipelineStagePaths {
  rootDir: string;
  sourceDir: string;
  contractDir: string;
  prepareDir: string;
  hastDir: string;
  semanticDir: string;
  lastDir: string;
  bttDir: string;
  publishDir: string;
}

export interface PublishStageArtifact {
  status: 'dry-run' | 'published' | 'failed';
  sourcePath: string;
  title: string;
  documentId: string | null;
  documentUrl: string | null;
  rootBlockId: string | null;
  createdAt: string;
  finishedAt: string;
  failedBlocks: RenderFailedNode[];
  retryLogs: string[];
  mediaTokenMappings: RenderMediaTokenMapping[];
  error?: string;
}

export function buildPipelineStagePaths(
  cacheRootDir: string,
  sourcePath: string,
  options: { protocolMode?: boolean } = {},
): PipelineStagePaths {
  const rootDir = buildPrepareDirForSource(cacheRootDir, sourcePath);
  const protocolMode = Boolean(options.protocolMode);
  return {
    rootDir,
    sourceDir: path.join(rootDir, '00-source'),
    contractDir: path.join(rootDir, '01-contract'),
    prepareDir: path.join(rootDir, protocolMode ? '02-prepare' : '01-prepare'),
    hastDir: path.join(rootDir, protocolMode ? '03-hast' : '02-hast'),
    semanticDir: path.join(rootDir, '04-semantic'),
    lastDir: path.join(rootDir, protocolMode ? '05-last' : '03-last'),
    bttDir: path.join(rootDir, protocolMode ? '06-btt' : '04-btt'),
    publishDir: path.join(rootDir, protocolMode ? '07-publish' : '05-publish'),
  };
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeSourceStage(
  stagePaths: PipelineStagePaths,
  originalMarkdown: string,
  presetMarkdown: string,
  meta: unknown,
): Promise<void> {
  await ensureDir(stagePaths.sourceDir);
  await writeFile(path.join(stagePaths.sourceDir, 'original.md'), originalMarkdown, 'utf8');
  await writeFile(path.join(stagePaths.sourceDir, 'preset.md'), presetMarkdown, 'utf8');
  await writeJson(path.join(stagePaths.sourceDir, 'meta.json'), meta);
}

export async function writePrepareStage(
  stagePaths: PipelineStagePaths,
  preparedMarkdown: string,
  prepareResult: PrepareMarkdownResult,
): Promise<void> {
  await ensureDir(stagePaths.prepareDir);
  await writeFile(path.join(stagePaths.prepareDir, 'prepared.md'), preparedMarkdown, 'utf8');
  const {
    preparedContent: _ignoredPreparedContent,
    logFileContent: _ignoredLogFileContent,
    ...prepareMeta
  } = prepareResult;
  await writeJson(path.join(stagePaths.prepareDir, 'result.json'), prepareMeta);
  await writePrepareLogFile(path.join(stagePaths.prepareDir, 'download.log.json'), prepareResult.logFileContent);
}

export async function writePrepareLogFile(filePath: string, value: PrepareMarkdownLogFile): Promise<void> {
  await writeJson(filePath, value);
}

export async function writeHastStage(stagePaths: PipelineStagePaths, hast: unknown): Promise<void> {
  await writeJson(path.join(stagePaths.hastDir, 'hast.json'), hast);
}

export async function writeContractStage(
  stagePaths: PipelineStagePaths,
  resolved: ResolvedRendererContract,
  capabilities: RendererCapabilities,
): Promise<void> {
  await writeJson(path.join(stagePaths.contractDir, 'selected.json'), {
    selectedPath: resolved.selectedPath,
    selection: resolved.selection,
    loadedPaths: resolved.loadedPaths,
    strict: resolved.strict,
  });
  await ensureDir(stagePaths.contractDir);
  const { stringify: stringifyYaml } = await import('yaml');
  await writeFile(path.join(stagePaths.contractDir, 'resolved.yml'), stringifyYaml(resolved.contract), 'utf8');
  await writeJson(path.join(stagePaths.contractDir, 'capabilities.json'), capabilities);
}

export async function writeSemanticStage(stagePaths: PipelineStagePaths, semantic: unknown): Promise<void> {
  await writeJson(path.join(stagePaths.semanticDir, 'semantic.json'), semantic);
}

export async function writeRenderReport(
  stagePaths: PipelineStagePaths,
  report: unknown,
  explicitPath?: string,
): Promise<void> {
  await writeJson(path.join(stagePaths.rootDir, 'render-report.json'), report);
  if (explicitPath) await writeJson(path.resolve(explicitPath), report);
}

export async function writeLastStage(stagePaths: PipelineStagePaths, last: unknown): Promise<void> {
  await writeJson(path.join(stagePaths.lastDir, 'last.json'), last);
}

export async function writeBttStage(stagePaths: PipelineStagePaths, btt: unknown, meta: unknown): Promise<void> {
  await writeJson(path.join(stagePaths.bttDir, 'btt.json'), btt);
  await writeJson(path.join(stagePaths.bttDir, 'meta.json'), meta);
}

export async function writePublishStageArtifact(
  stagePaths: PipelineStagePaths,
  artifact: PublishStageArtifact,
): Promise<void> {
  await writeJson(path.join(stagePaths.publishDir, 'result.json'), artifact);
}
