import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parse as parseYaml } from 'yaml';

const MARKDOWN_IMAGE_TAG_RE = /(!\[[^\]\n]*\]\(\s*)(?:<([^>\n]+)>|([^\s)\n]+))(\s*\))/g;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 500;
const DEFAULT_BACKOFF_MAX_MS = 5_000;
const DEFAULT_BACKOFF_JITTER_RATIO = 0.2;
const DEFAULT_YT_DLP_TIMEOUT_MS = 10 * 60 * 1_000;
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429]);
const YT_DLP_PRINT_PREFIX = '__M2L__';

const CONTENT_TYPE_TO_EXTENSION: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/avif': '.avif',
};

const IMAGE_FILE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif']);

interface ImageTagMatch {
  start: number;
  end: number;
  prefix: string;
  suffix: string;
  originalUrl: string;
  wrappedByAngles: boolean;
}

interface StandaloneUrlLineMatch {
  start: number;
  end: number;
  originalUrl: string;
  normalizedUrl: string;
}

interface YtDlpPrefixRule {
  originalPrefix: string;
  normalizedPrefix: string;
  host: string;
  pathPrefix: string;
}

interface YtDlpFrontmatterConfig {
  configured: boolean;
  prefixes: string[];
  rules: YtDlpPrefixRule[];
}

interface DownloadImageResult {
  ok: boolean;
  localPath?: string;
  contentType?: string;
  size?: number;
  httpStatus?: number;
  resumeSupported?: boolean;
  retryable: boolean;
  attempts: number;
  retries: number;
  error?: string;
}

interface YtDlpFileResult {
  localPath: string;
  title: string;
  sourceUrl?: string;
  playlistIndex?: number;
}

interface ParsedYtDlpOutputEntry {
  localPath: string;
  sourceUrl?: string;
  playlistIndex?: number;
  order: number;
}

interface DownloadYtDlpResult {
  ok: boolean;
  files?: YtDlpFileResult[];
  attempts: number;
  retries: number;
  retryable: boolean;
  httpStatus?: number;
  error?: string;
}

export type PrepareRemoteAssetStatus = 'downloaded' | 'failed' | 'skipped-disabled';

export interface PrepareRemoteAssetLogEntry {
  index: number;
  status: PrepareRemoteAssetStatus;
  sourceType?: 'image' | 'yt_dlp';
  originalUrl: string;
  attempts?: number;
  retries?: number;
  retryable?: boolean;
  httpStatus?: number;
  localPath?: string;
  contentType?: string;
  size?: number;
  error?: string;
}

export interface PrepareMarkdownOptions {
  enabled: boolean;
  prepareDir: string;
  ytDlpPath?: string;
  ytDlpCookiesPath?: string;
  timeoutMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  backoffJitterRatio?: number;
  ytDlpTimeoutMs?: number;
}

export interface PrepareMarkdownResult {
  sourcePath: string;
  preparedContent: string;
  changed: boolean;
  remoteImageCount: number;
  remoteYtDlpCount: number;
  remoteFetchTotal: number;
  rewrittenCount: number;
  downloadedCount: number;
  failedCount: number;
  remoteFetchFailed: number;
  ytDlpDownloadedCount: number;
  ytDlpFailedCount: number;
  prepareDir: string;
  assetsDir: string;
  logFilePath: string;
  logEntries: PrepareRemoteAssetLogEntry[];
  logFileContent: PrepareMarkdownLogFile;
}

export interface PrepareMarkdownLogFile {
  generatedAt: string;
  sourcePath: string;
  enabled: boolean;
  retryPolicy?: {
    maxRetries: number;
    backoffBaseMs: number;
    backoffMaxMs: number;
    backoffJitterRatio: number;
  };
  ytDlp: {
    enabled: boolean;
    configuredInFrontmatter: boolean;
    prefixes: string[];
    executable: string | null;
    cookiesPath: string | null;
    timeoutMs: number;
  };
  remoteImageCount: number;
  remoteYtDlpCount: number;
  remoteFetchTotal: number;
  rewrittenCount: number;
  downloadedCount: number;
  failedCount: number;
  remoteFetchFailed: number;
  ytDlpDownloadedCount: number;
  ytDlpFailedCount: number;
  entries: PrepareRemoteAssetLogEntry[];
}

function isRemoteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseHttpUrl(value: string): URL | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function toPosixPath(p: string): string {
  return p.replaceAll('\\', '/');
}

function toMarkdownLocalPath(localPath: string): string {
  return encodeURI(toPosixPath(localPath));
}

function normalizeContentType(value: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.split(';', 1)[0]?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeErrorMessage(error: unknown): string {
  if (!error) return 'unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const withName = error as { name?: string };
  return withName.name === 'AbortError';
}

function isRecoverableNetworkError(error: unknown): boolean {
  if (isAbortLikeError(error)) return true;
  const message = normalizeErrorMessage(error).toLowerCase();
  return (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('eai_again') ||
    message.includes('etimedout') ||
    message.includes('ehostunreach') ||
    message.includes('und_err_connect_timeout')
  );
}

function isRetryableHttpStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUS.has(status) || (status >= 500 && status <= 599);
}

function fibonacci(n: number): number {
  if (n <= 2) return 1;
  let a = 1;
  let b = 1;
  for (let i = 3; i <= n; i += 1) {
    const next = a + b;
    a = b;
    b = next;
  }
  return b;
}

function getBackoffMs(retryIndex: number, baseMs: number, maxMs: number, jitterRatio: number): number {
  const withoutJitter = Math.min(maxMs, fibonacci(retryIndex) * baseMs);
  if (jitterRatio <= 0) return withoutJitter;
  const jitterFactor = 1 + (Math.random() * 2 - 1) * jitterRatio;
  return Math.max(0, Math.round(withoutJitter * jitterFactor));
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fileSize(targetPath: string): Promise<number> {
  try {
    const st = await stat(targetPath);
    return st.size;
  } catch {
    return 0;
  }
}

async function writeResponseToTempFile(response: Response, tempFilePath: string, append: boolean): Promise<void> {
  if (!response.body) {
    throw new Error('response body is empty');
  }
  const nodeReadable = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
  const writeStream = createWriteStream(tempFilePath, {
    flags: append ? 'a' : 'w',
  });
  await pipeline(nodeReadable, writeStream);
}

function resolveImageExtension(url: string, contentType: string | undefined): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (IMAGE_FILE_EXTENSIONS.has(ext)) return ext;
  } catch {
    // noop
  }
  if (contentType) {
    const mapped = CONTENT_TYPE_TO_EXTENSION[contentType.toLowerCase()];
    if (mapped) return mapped;
  }
  return '.img';
}

async function downloadRemoteImageOnce(
  url: string,
  assetsDir: string,
  tempFilePath: string,
  fileKey: string,
  timeoutMs: number,
  allowResume: boolean,
): Promise<DownloadImageResult> {
  await mkdir(assetsDir, { recursive: true });

  const existingTempSize = allowResume ? await fileSize(tempFilePath) : 0;
  const resumeFrom = existingTempSize > 0 ? existingTempSize : 0;
  const rangeHeader = resumeFrom > 0 ? `bytes=${resumeFrom}-` : undefined;

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const fetchInit: RequestInit = {
      method: 'GET',
      redirect: 'follow',
      signal: abortController.signal,
    };
    if (rangeHeader) {
      fetchInit.headers = { Range: rangeHeader };
    }
    const response = await fetch(url, fetchInit);

    const contentType = normalizeContentType(response.headers.get('content-type'));
    if (!response.ok) {
      if (response.status === 416 && resumeFrom > 0) {
        return {
          ok: false,
          retryable: true,
          resumeSupported: false,
          attempts: 1,
          retries: 0,
          httpStatus: response.status,
          ...(contentType ? { contentType } : {}),
          error: 'http status 416 (range not satisfiable)',
        };
      }
      return {
        ok: false,
        retryable: isRetryableHttpStatus(response.status),
        attempts: 1,
        retries: 0,
        httpStatus: response.status,
        ...(contentType ? { contentType } : {}),
        error: `http status ${response.status}`,
      };
    }

    const extension = resolveImageExtension(url, contentType);
    const isImageByType = contentType ? contentType.startsWith('image/') : false;
    const isImageByExt = IMAGE_FILE_EXTENSIONS.has(extension);
    if (!isImageByType && !isImageByExt) {
      return {
        ok: false,
        retryable: false,
        attempts: 1,
        retries: 0,
        ...(contentType ? { contentType } : {}),
        error: `unsupported content-type: ${contentType ?? 'unknown'}`,
      };
    }

    let appendMode = false;
    let resumeSupported: boolean | undefined;
    if (resumeFrom > 0) {
      if (response.status === 206) {
        appendMode = true;
        resumeSupported = true;
      } else {
        appendMode = false;
        resumeSupported = false;
      }
    }

    try {
      await writeResponseToTempFile(response, tempFilePath, appendMode);
    } catch (streamError: unknown) {
      return {
        ok: false,
        retryable: isRecoverableNetworkError(streamError),
        ...(resumeSupported !== undefined ? { resumeSupported } : {}),
        attempts: 1,
        retries: 0,
        error: normalizeErrorMessage(streamError),
      };
    }

    const tempSize = await fileSize(tempFilePath);
    if (tempSize <= 0) {
      return {
        ok: false,
        retryable: false,
        attempts: 1,
        retries: 0,
        ...(resumeSupported !== undefined ? { resumeSupported } : {}),
        ...(contentType ? { contentType } : {}),
        error: 'downloaded file is empty',
      };
    }

    const localPath = path.join(assetsDir, `${fileKey}${extension}`);
    await rm(localPath, { force: true });
    await rename(tempFilePath, localPath);
    const finalSize = await fileSize(localPath);

    return {
      ok: true,
      retryable: false,
      attempts: 1,
      retries: 0,
      localPath,
      ...(resumeSupported !== undefined ? { resumeSupported } : {}),
      ...(contentType ? { contentType } : {}),
      size: finalSize,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      retryable: isRecoverableNetworkError(error),
      attempts: 1,
      retries: 0,
      error: normalizeErrorMessage(error),
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function downloadRemoteImageWithRetry(
  url: string,
  assetsDir: string,
  timeoutMs: number,
  maxRetries: number,
  backoffBaseMs: number,
  backoffMaxMs: number,
  backoffJitterRatio: number,
): Promise<DownloadImageResult> {
  const retriesLimit = Math.max(0, maxRetries);
  const fileKey = createHash('sha1').update(url).digest('hex').slice(0, 16);
  const tempFilePath = path.join(assetsDir, `${fileKey}.part`);
  let allowResume = true;

  for (let attempt = 1; attempt <= retriesLimit + 1; attempt += 1) {
    const single = await downloadRemoteImageOnce(url, assetsDir, tempFilePath, fileKey, timeoutMs, allowResume);
    const retries = attempt - 1;
    if (single.ok) {
      return {
        ...single,
        attempts: attempt,
        retries,
      };
    }

    if (single.resumeSupported === false) {
      allowResume = false;
      await rm(tempFilePath, { force: true });
    }

    const canRetry = single.retryable && retries < retriesLimit;
    if (!canRetry) {
      await rm(tempFilePath, { force: true });
      return {
        ...single,
        attempts: attempt,
        retries,
      };
    }

    const retryIndex = retries + 1;
    const waitMs = getBackoffMs(retryIndex, backoffBaseMs, backoffMaxMs, backoffJitterRatio);
    await delay(waitMs);
  }

  return {
    ok: false,
    retryable: true,
    attempts: retriesLimit + 1,
    retries: retriesLimit,
    error: 'download failed',
  };
}

function normalizeYtDlpPrefix(rawPrefix: string): YtDlpPrefixRule | undefined {
  const cleaned = rawPrefix.trim();
  if (!cleaned) return undefined;
  const normalizedInput =
    cleaned.startsWith('http://') || cleaned.startsWith('https://')
      ? cleaned
      : /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:[/:?#].*)?$/i.test(cleaned)
        ? `https://${cleaned}`
        : undefined;
  if (!normalizedInput) return undefined;

  const parsed = parseHttpUrl(normalizedInput);
  if (!parsed) return undefined;
  const pathPrefix = parsed.pathname === '/' ? '' : parsed.pathname;
  return {
    originalPrefix: rawPrefix,
    normalizedPrefix: parsed.toString(),
    host: parsed.hostname.toLowerCase(),
    pathPrefix,
  };
}

function readYtDlpPrefixesFromFrontmatter(sourceContent: string): YtDlpFrontmatterConfig {
  const matched = sourceContent.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/);
  if (!matched) {
    return { configured: false, prefixes: [], rules: [] };
  }
  const yamlText = matched[1];
  if (!yamlText || yamlText.trim().length === 0) {
    return { configured: false, prefixes: [], rules: [] };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch {
    return { configured: false, prefixes: [], rules: [] };
  }

  const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  const urlHandlers = obj?.url_handlers;
  const urlHandlersObj =
    urlHandlers && typeof urlHandlers === 'object' ? (urlHandlers as Record<string, unknown>) : null;
  const ytDlp = urlHandlersObj?.yt_dlp;
  const ytDlpObj = ytDlp && typeof ytDlp === 'object' ? (ytDlp as Record<string, unknown>) : null;
  const rawPrefixes = ytDlpObj?.prefixes;

  let prefixes: string[] = [];
  if (typeof rawPrefixes === 'string') {
    prefixes = [rawPrefixes.trim()].filter((item) => item.length > 0);
  } else if (Array.isArray(rawPrefixes)) {
    prefixes = rawPrefixes
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  } else {
    return { configured: false, prefixes: [], rules: [] };
  }

  const uniqueRules = new Map<string, YtDlpPrefixRule>();
  for (const rawPrefix of prefixes) {
    const normalized = normalizeYtDlpPrefix(rawPrefix);
    if (!normalized) continue;
    uniqueRules.set(normalized.normalizedPrefix, normalized);
  }

  return {
    configured: true,
    prefixes,
    rules: [...uniqueRules.values()],
  };
}

function normalizeStandaloneUrl(value: string): URL | undefined {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return undefined;
  const unwrapped = trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1).trim() : trimmed;
  if (!unwrapped || /\s/.test(unwrapped)) return undefined;
  const maybeWithProtocol =
    unwrapped.startsWith('http://') || unwrapped.startsWith('https://')
      ? unwrapped
      : /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:[/:?#].*)?$/i.test(unwrapped)
        ? `https://${unwrapped}`
        : undefined;
  if (!maybeWithProtocol) return undefined;
  return parseHttpUrl(maybeWithProtocol);
}

function getHostSuffixMatchLength(candidateHost: string, ruleHost: string): number {
  if (candidateHost === ruleHost) return ruleHost.length;
  if (candidateHost.endsWith(`.${ruleHost}`)) return ruleHost.length;
  return -1;
}

function matchesYtDlpPrefix(url: URL, rules: YtDlpPrefixRule[]): boolean {
  const candidateHost = url.hostname.toLowerCase();
  const candidatePath = url.pathname || '/';
  let bestHostSuffixLength = -1;
  let bestPathPrefixLength = -1;

  for (const rule of rules) {
    const hostSuffixLength = getHostSuffixMatchLength(candidateHost, rule.host);
    if (hostSuffixLength < 0) continue;
    if (rule.pathPrefix && !candidatePath.startsWith(rule.pathPrefix)) continue;
    const pathPrefixLength = rule.pathPrefix.length;
    const isBetter =
      hostSuffixLength > bestHostSuffixLength ||
      (hostSuffixLength === bestHostSuffixLength && pathPrefixLength > bestPathPrefixLength);
    if (isBetter) {
      bestHostSuffixLength = hostSuffixLength;
      bestPathPrefixLength = pathPrefixLength;
    }
  }

  return bestHostSuffixLength >= 0;
}

function collectStandaloneYtDlpUrlLines(content: string, rules: YtDlpPrefixRule[]): StandaloneUrlLineMatch[] {
  if (rules.length === 0) return [];
  const matches: StandaloneUrlLineMatch[] = [];
  const lineRegex = /([^\r\n]*)(\r?\n|$)/g;
  let lineMatch: RegExpExecArray | null;
  let insideFence: '`' | '~' | undefined;
  let insideFenceLength = 0;

  while ((lineMatch = lineRegex.exec(content)) !== null) {
    const whole = lineMatch[0];
    if (!whole) break;
    const lineRaw = lineMatch[1] ?? '';
    const lineStart = lineMatch.index;
    const lineEnd = lineStart + lineRaw.length;
    const trimmed = lineRaw.trim();

    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const fenceMarker = fenceMatch[1];
      if (!fenceMarker) continue;
      const fenceChar = fenceMarker[0] as '`' | '~';
      if (!insideFence) {
        insideFence = fenceChar;
        insideFenceLength = fenceMarker.length;
      } else if (insideFence === fenceChar && fenceMarker.length >= insideFenceLength) {
        insideFence = undefined;
        insideFenceLength = 0;
      }
      continue;
    }
    if (insideFence) continue;

    const parsedUrl = normalizeStandaloneUrl(trimmed);
    if (!parsedUrl || !matchesYtDlpPrefix(parsedUrl, rules)) continue;
    matches.push({
      start: lineStart,
      end: lineEnd,
      originalUrl: trimmed,
      normalizedUrl: parsedUrl.toString(),
    });
  }

  return matches;
}

function extractHttpStatusFromText(text: string): number | undefined {
  const match = text.match(/\b(?:http(?:\s+error)?|error)\s*[: ]\s*(\d{3})\b/i);
  const statusStr = match?.[1];
  if (!statusStr) return undefined;
  const status = Number.parseInt(statusStr, 10);
  return Number.isFinite(status) ? status : undefined;
}

function isRetryableYtDlpFailure(stderr: string, status: number | undefined): boolean {
  if (status !== undefined) {
    if (isRetryableHttpStatus(status)) return true;
    if (status === 401 || status === 403 || status === 404) return false;
  }
  const normalized = stderr.toLowerCase();
  if (normalized.includes('unsupported url')) return false;
  if (normalized.includes('private video')) return false;
  if (normalized.includes('sign in to confirm your age')) return false;
  if (normalized.includes('this video is unavailable')) return false;
  if (normalized.includes('copyright')) return false;
  return isRecoverableNetworkError(stderr);
}

function normalizeYtDlpSourceUrl(rawUrl: string | undefined): string | undefined {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.toLowerCase();
  if (normalized === 'na' || normalized === 'n/a' || normalized === 'none' || normalized === 'null') {
    return undefined;
  }
  const parsed = parseHttpUrl(trimmed);
  return parsed?.toString();
}

function resolveYtDlpPath(rawPath: string, downloadDir: string): string {
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(downloadDir, rawPath);
}

function parseYtDlpOutputEntries(stdout: string, downloadDir: string): ParsedYtDlpOutputEntry[] {
  const byPath = new Map<string, ParsedYtDlpOutputEntry>();
  let nextOrder = 0;

  const upsert = (localPath: string, sourceUrl: string | undefined, playlistIndex: number | undefined): void => {
    const existing = byPath.get(localPath);
    if (!existing) {
      const entry: ParsedYtDlpOutputEntry = {
        localPath,
        order: nextOrder,
      };
      if (sourceUrl) {
        entry.sourceUrl = sourceUrl;
      }
      if (playlistIndex !== undefined) {
        entry.playlistIndex = playlistIndex;
      }
      byPath.set(localPath, {
        ...entry,
      });
      nextOrder += 1;
      return;
    }
    if (!existing.sourceUrl && sourceUrl) {
      existing.sourceUrl = sourceUrl;
    }
    if (existing.playlistIndex === undefined && playlistIndex !== undefined) {
      existing.playlistIndex = playlistIndex;
    }
  };

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('[')) continue;

    if (trimmed.startsWith(YT_DLP_PRINT_PREFIX)) {
      const payload = trimmed.slice(YT_DLP_PRINT_PREFIX.length);
      const [rawPath = '', rawSourceUrl = '', rawPlaylistIndex = ''] = payload.split('\t');
      const normalizedPath = rawPath.trim();
      if (!normalizedPath) continue;
      const localPath = resolveYtDlpPath(normalizedPath, downloadDir);
      const sourceUrl = normalizeYtDlpSourceUrl(rawSourceUrl);
      const parsedPlaylistIndex = Number.parseInt(rawPlaylistIndex.trim(), 10);
      const playlistIndex =
        Number.isFinite(parsedPlaylistIndex) && parsedPlaylistIndex > 0 ? parsedPlaylistIndex : undefined;
      upsert(localPath, sourceUrl, playlistIndex);
      continue;
    }

    const localPath = resolveYtDlpPath(trimmed, downloadDir);
    upsert(localPath, undefined, undefined);
  }

  return [...byPath.values()].sort((a, b) => a.order - b.order);
}

async function runYtDlpOnce(
  ytDlpPath: string,
  ytDlpCookiesPath: string | undefined,
  url: string,
  downloadDir: string,
  timeoutMs: number,
): Promise<DownloadYtDlpResult> {
  await mkdir(downloadDir, { recursive: true });
  const args = [
    '--ignore-config',
    '--no-warnings',
    '--no-progress',
    '--newline',
    '--restrict-filenames',
    '--paths',
    downloadDir,
    '--output',
    '%(title).80B-%(id)s.%(ext)s',
    '--print',
    `after_move:${YT_DLP_PRINT_PREFIX}%(filepath)s\t%(webpage_url)s\t%(playlist_index)s`,
  ];
  if (ytDlpCookiesPath) {
    args.push('--cookies', ytDlpCookiesPath);
  }
  args.push(url);

  const spawnResult = await new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    spawnError?: string;
  }>((resolve) => {
    const child = spawn(ytDlpPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    let spawnError: string | undefined;

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (error) => {
      spawnError = normalizeErrorMessage(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeoutHandle);
      const result: {
        code: number | null;
        stdout: string;
        stderr: string;
        timedOut: boolean;
        spawnError?: string;
      } = {
        code,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        timedOut,
      };
      if (spawnError) {
        result.spawnError = spawnError;
      }
      resolve(result);
    });
  });

  if (spawnResult.timedOut) {
    return {
      ok: false,
      attempts: 1,
      retries: 0,
      retryable: true,
      error: `yt-dlp timed out after ${timeoutMs}ms`,
    };
  }
  if (spawnResult.spawnError) {
    return {
      ok: false,
      attempts: 1,
      retries: 0,
      retryable: false,
      error: `yt-dlp spawn failed: ${spawnResult.spawnError}`,
    };
  }
  if (spawnResult.code !== 0) {
    const httpStatus = extractHttpStatusFromText(spawnResult.stderr);
    const retryable = isRetryableYtDlpFailure(spawnResult.stderr, httpStatus);
    return {
      ok: false,
      attempts: 1,
      retries: 0,
      retryable,
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      error: spawnResult.stderr.trim() || `yt-dlp exited with code ${String(spawnResult.code ?? 'unknown')}`,
    };
  }

  const parsedEntries = parseYtDlpOutputEntries(spawnResult.stdout, downloadDir);
  if (parsedEntries.length === 0) {
    return {
      ok: false,
      attempts: 1,
      retries: 0,
      retryable: false,
      error: 'yt-dlp returned success but no downloaded files were reported',
    };
  }

  const files: YtDlpFileResult[] = [];
  for (const entry of parsedEntries) {
    const size = await fileSize(entry.localPath);
    if (size <= 0) continue;
    const file: YtDlpFileResult = {
      localPath: entry.localPath,
      title: path.basename(entry.localPath),
    };
    if (entry.sourceUrl) {
      file.sourceUrl = entry.sourceUrl;
    }
    if (entry.playlistIndex !== undefined) {
      file.playlistIndex = entry.playlistIndex;
    }
    files.push(file);
  }

  if (files.length === 0) {
    return {
      ok: false,
      attempts: 1,
      retries: 0,
      retryable: false,
      error: 'yt-dlp output files are empty or missing',
    };
  }

  return {
    ok: true,
    attempts: 1,
    retries: 0,
    retryable: false,
    files,
  };
}

async function downloadMediaWithYtDlpRetry(
  url: string,
  ytDlpPath: string,
  ytDlpCookiesPath: string | undefined,
  assetsDir: string,
  timeoutMs: number,
  maxRetries: number,
  backoffBaseMs: number,
  backoffMaxMs: number,
  backoffJitterRatio: number,
): Promise<DownloadYtDlpResult> {
  const retriesLimit = Math.max(0, maxRetries);
  const sourceHash = createHash('sha1').update(url).digest('hex').slice(0, 12);
  const downloadDir = path.join(assetsDir, 'yt-dlp', sourceHash);

  for (let attempt = 1; attempt <= retriesLimit + 1; attempt += 1) {
    const single = await runYtDlpOnce(ytDlpPath, ytDlpCookiesPath, url, downloadDir, timeoutMs);
    const retries = attempt - 1;
    if (single.ok) {
      return {
        ...single,
        attempts: attempt,
        retries,
      };
    }
    const canRetry = single.retryable && retries < retriesLimit;
    if (!canRetry) {
      return {
        ...single,
        attempts: attempt,
        retries,
      };
    }
    const retryIndex = retries + 1;
    const waitMs = getBackoffMs(retryIndex, backoffBaseMs, backoffMaxMs, backoffJitterRatio);
    await delay(waitMs);
  }

  return {
    ok: false,
    attempts: retriesLimit + 1,
    retries: retriesLimit,
    retryable: true,
    error: 'yt-dlp download failed',
  };
}

function collectImageTagMatches(content: string): ImageTagMatch[] {
  const matches: ImageTagMatch[] = [];
  const regex = new RegExp(MARKDOWN_IMAGE_TAG_RE.source, MARKDOWN_IMAGE_TAG_RE.flags);
  let matched: RegExpExecArray | null;
  while ((matched = regex.exec(content)) !== null) {
    const full = matched[0];
    const prefix = matched[1] ?? '';
    const angleWrappedUrl = matched[2];
    const plainUrl = matched[3];
    const suffix = matched[4] ?? '';
    const start = matched.index;
    const end = start + full.length;
    const originalUrl = angleWrappedUrl ?? plainUrl;
    if (!originalUrl) continue;
    matches.push({
      start,
      end,
      prefix,
      suffix,
      originalUrl,
      wrappedByAngles: angleWrappedUrl !== undefined,
    });
  }
  return matches;
}

function escapeMarkdownLinkText(value: string): string {
  const normalized = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (!normalized) return 'downloaded-video';
  // Keep markdown link labels literal (avoid emphasis/code parsing for filenames such as a_b_c.mp4).
  return normalized.replace(/([\\`*_[\]])/g, '\\$1');
}

function formatYtDlpReplacementMarkdown(files: YtDlpFileResult[]): string {
  return files
    .map((file) => {
      const markdownPath = toMarkdownLocalPath(file.localPath);
      const title = escapeMarkdownLinkText(file.title);
      return `[${title}](<${markdownPath}>)`;
    })
    .join('\n\n');
}

async function tryAccess(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function prepareMarkdownBeforePublish(
  sourcePath: string,
  sourceContent: string,
  options: PrepareMarkdownOptions,
): Promise<PrepareMarkdownResult> {
  const absoluteSourcePath = path.resolve(sourcePath);
  const prepareDir = path.resolve(options.prepareDir);
  const assetsDir = path.join(prepareDir, 'assets');
  const logFilePath = path.join(prepareDir, 'download.log.json');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const backoffMaxMs = options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
  const backoffJitterRatio = options.backoffJitterRatio ?? DEFAULT_BACKOFF_JITTER_RATIO;
  const ytDlpTimeoutMs = options.ytDlpTimeoutMs ?? DEFAULT_YT_DLP_TIMEOUT_MS;
  const ytDlpPath = options.ytDlpPath?.trim();
  const ytDlpCookiesPath = options.ytDlpCookiesPath?.trim();

  const remoteImageMatches = collectImageTagMatches(sourceContent).filter((item) => isRemoteHttpUrl(item.originalUrl));
  const ytDlpFrontmatterConfig = readYtDlpPrefixesFromFrontmatter(sourceContent);
  const ytDlpConfigured = ytDlpFrontmatterConfig.configured && ytDlpFrontmatterConfig.rules.length > 0;
  const canRunYtDlp = ytDlpConfigured && Boolean(ytDlpPath);
  const ytDlpLineMatches = collectStandaloneYtDlpUrlLines(sourceContent, ytDlpFrontmatterConfig.rules);

  const logEntries: PrepareRemoteAssetLogEntry[] = [];
  let nextLogIndex = 1;
  const pushLogEntry = (entry: Omit<PrepareRemoteAssetLogEntry, 'index'>): void => {
    logEntries.push({
      index: nextLogIndex,
      ...entry,
    });
    nextLogIndex += 1;
  };

  if (remoteImageMatches.length === 0 && ytDlpLineMatches.length === 0) {
    const logFileContent: PrepareMarkdownLogFile = {
      generatedAt: new Date().toISOString(),
      sourcePath: absoluteSourcePath,
      enabled: options.enabled,
      ytDlp: {
        enabled: canRunYtDlp,
        configuredInFrontmatter: ytDlpFrontmatterConfig.configured,
        prefixes: ytDlpFrontmatterConfig.prefixes,
        executable: ytDlpPath ?? null,
        cookiesPath: ytDlpCookiesPath ?? null,
        timeoutMs: ytDlpTimeoutMs,
      },
      remoteImageCount: 0,
      remoteYtDlpCount: 0,
      remoteFetchTotal: 0,
      rewrittenCount: 0,
      downloadedCount: 0,
      failedCount: 0,
      remoteFetchFailed: 0,
      ytDlpDownloadedCount: 0,
      ytDlpFailedCount: 0,
      entries: [],
    };
    const result: PrepareMarkdownResult = {
      sourcePath: absoluteSourcePath,
      preparedContent: sourceContent,
      changed: false,
      remoteImageCount: 0,
      remoteYtDlpCount: 0,
      remoteFetchTotal: 0,
      rewrittenCount: 0,
      downloadedCount: 0,
      failedCount: 0,
      remoteFetchFailed: 0,
      ytDlpDownloadedCount: 0,
      ytDlpFailedCount: 0,
      prepareDir,
      assetsDir,
      logFilePath,
      logEntries,
      logFileContent,
    };
    return result;
  }

  const imageDownloadResults = new Map<string, DownloadImageResult>();
  const ytDlpResults = new Map<string, DownloadYtDlpResult>();

  if (options.enabled) {
    const uniqueRemoteUrls = [...new Set(remoteImageMatches.map((item) => item.originalUrl))];
    await Promise.all(
      uniqueRemoteUrls.map(async (url) => {
        const result = await downloadRemoteImageWithRetry(
          url,
          assetsDir,
          timeoutMs,
          maxRetries,
          backoffBaseMs,
          backoffMaxMs,
          backoffJitterRatio,
        );
        imageDownloadResults.set(url, result);
      }),
    );
  }

  if (canRunYtDlp && ytDlpPath) {
    const uniqueYtDlpUrls = [...new Set(ytDlpLineMatches.map((item) => item.normalizedUrl))];
    for (const url of uniqueYtDlpUrls) {
      const result = await downloadMediaWithYtDlpRetry(
        url,
        ytDlpPath,
        ytDlpCookiesPath,
        assetsDir,
        ytDlpTimeoutMs,
        maxRetries,
        backoffBaseMs,
        backoffMaxMs,
        backoffJitterRatio,
      );
      ytDlpResults.set(url, result);
    }
  }

  const replacements: Array<{ start: number; end: number; replacement: string }> = [];
  let imageDownloadedCount = 0;
  let imageFailedCount = 0;
  let ytDlpDownloadedCount = 0;
  let ytDlpFailedCount = 0;

  for (const match of remoteImageMatches) {
    if (!options.enabled) {
      pushLogEntry({
        status: 'skipped-disabled',
        sourceType: 'image',
        originalUrl: match.originalUrl,
      });
      continue;
    }
    const downloadResult = imageDownloadResults.get(match.originalUrl);
    if (!downloadResult?.ok || !downloadResult.localPath) {
      imageFailedCount += 1;
      const failedLog: Omit<PrepareRemoteAssetLogEntry, 'index'> = {
        status: 'failed',
        sourceType: 'image',
        originalUrl: match.originalUrl,
        error: downloadResult?.error ?? 'download failed',
      };
      if (downloadResult) {
        failedLog.attempts = downloadResult.attempts;
        failedLog.retries = downloadResult.retries;
        failedLog.retryable = downloadResult.retryable;
        if (downloadResult.httpStatus !== undefined) {
          failedLog.httpStatus = downloadResult.httpStatus;
        }
      }
      pushLogEntry(failedLog);
      continue;
    }
    imageDownloadedCount += 1;
    const pathForMarkdown = toMarkdownLocalPath(downloadResult.localPath);
    const urlValue = match.wrappedByAngles ? `<${pathForMarkdown}>` : pathForMarkdown;
    replacements.push({
      start: match.start,
      end: match.end,
      replacement: `${match.prefix}${urlValue}${match.suffix}`,
    });
    const downloadedImageLog: Omit<PrepareRemoteAssetLogEntry, 'index'> = {
      status: 'downloaded',
      sourceType: 'image',
      originalUrl: match.originalUrl,
      attempts: downloadResult.attempts,
      retries: downloadResult.retries,
      retryable: downloadResult.retryable,
      localPath: downloadResult.localPath,
    };
    if (downloadResult.httpStatus !== undefined) {
      downloadedImageLog.httpStatus = downloadResult.httpStatus;
    }
    if (downloadResult.contentType) {
      downloadedImageLog.contentType = downloadResult.contentType;
    }
    if (downloadResult.size !== undefined) {
      downloadedImageLog.size = downloadResult.size;
    }
    pushLogEntry(downloadedImageLog);
  }

  for (const match of ytDlpLineMatches) {
    if (!canRunYtDlp) {
      pushLogEntry({
        status: 'skipped-disabled',
        sourceType: 'yt_dlp',
        originalUrl: match.originalUrl,
      });
      continue;
    }
    const downloadResult = ytDlpResults.get(match.normalizedUrl);
    if (!downloadResult?.ok || !downloadResult.files || downloadResult.files.length === 0) {
      ytDlpFailedCount += 1;
      const failedLog: Omit<PrepareRemoteAssetLogEntry, 'index'> = {
        status: 'failed',
        sourceType: 'yt_dlp',
        originalUrl: match.originalUrl,
        error: downloadResult?.error ?? 'yt-dlp download failed',
      };
      if (downloadResult) {
        failedLog.attempts = downloadResult.attempts;
        failedLog.retries = downloadResult.retries;
        failedLog.retryable = downloadResult.retryable;
        if (downloadResult.httpStatus !== undefined) {
          failedLog.httpStatus = downloadResult.httpStatus;
        }
      }
      pushLogEntry(failedLog);
      continue;
    }

    ytDlpDownloadedCount += 1;
    replacements.push({
      start: match.start,
      end: match.end,
      replacement: formatYtDlpReplacementMarkdown(downloadResult.files),
    });

    const first = downloadResult.files[0];
    let totalBytes = 0;
    for (const item of downloadResult.files) {
      if (await tryAccess(item.localPath)) {
        totalBytes += await fileSize(item.localPath);
      }
    }
    const downloadedYtDlpLog: Omit<PrepareRemoteAssetLogEntry, 'index'> = {
      status: 'downloaded',
      sourceType: 'yt_dlp',
      originalUrl: match.originalUrl,
      attempts: downloadResult.attempts,
      retries: downloadResult.retries,
      retryable: downloadResult.retryable,
      size: totalBytes,
      contentType: 'video/*',
    };
    if (first?.localPath) {
      downloadedYtDlpLog.localPath = first.localPath;
    }
    pushLogEntry(downloadedYtDlpLog);
  }

  let preparedContent = sourceContent;
  replacements
    .sort((a, b) => b.start - a.start)
    .forEach((item) => {
      preparedContent = preparedContent.slice(0, item.start) + item.replacement + preparedContent.slice(item.end);
    });

  const remoteImageCount = remoteImageMatches.length;
  const remoteYtDlpCount = ytDlpLineMatches.length;
  const remoteFetchTotal = (options.enabled ? remoteImageCount : 0) + (canRunYtDlp ? remoteYtDlpCount : 0);
  const downloadedCount = imageDownloadedCount + ytDlpDownloadedCount;
  const failedCount = imageFailedCount + ytDlpFailedCount;
  const rewrittenCount = replacements.length;
  const logFileContent: PrepareMarkdownLogFile = {
    generatedAt: new Date().toISOString(),
    sourcePath: absoluteSourcePath,
    enabled: options.enabled,
    retryPolicy: {
      maxRetries,
      backoffBaseMs,
      backoffMaxMs,
      backoffJitterRatio,
    },
    ytDlp: {
      enabled: canRunYtDlp,
      configuredInFrontmatter: ytDlpFrontmatterConfig.configured,
      prefixes: ytDlpFrontmatterConfig.prefixes,
      executable: ytDlpPath ?? null,
      cookiesPath: ytDlpCookiesPath ?? null,
      timeoutMs: ytDlpTimeoutMs,
    },
    remoteImageCount,
    remoteYtDlpCount,
    remoteFetchTotal,
    rewrittenCount,
    downloadedCount,
    failedCount,
    remoteFetchFailed: failedCount,
    ytDlpDownloadedCount,
    ytDlpFailedCount,
    entries: logEntries,
  };

  return {
    sourcePath: absoluteSourcePath,
    preparedContent,
    changed: preparedContent !== sourceContent,
    remoteImageCount,
    remoteYtDlpCount,
    remoteFetchTotal,
    rewrittenCount,
    downloadedCount,
    failedCount,
    remoteFetchFailed: failedCount,
    ytDlpDownloadedCount,
    ytDlpFailedCount,
    prepareDir,
    assetsDir,
    logFilePath,
    logEntries,
    logFileContent,
  };
}
