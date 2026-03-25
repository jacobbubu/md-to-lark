import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { stringify as stringifyYaml } from 'yaml';
import { markdownToHast } from '../src/pipeline/index.js';
import { hastToLAST } from '../src/pipeline/hast-to-last.js';
import { createLASTApi } from '../src/last/api.js';
import { serializeLASTToMarkdown } from '../src/last/to-markdown.js';
import type { LASTModel } from '../src/last/types.js';

const PORT = parsePort(process.env.PLAYGROUND_PORT ?? process.env.PORT ?? '3939');
const ROOT_DIR = process.cwd();
const EXAMPLES_DIR = path.resolve(ROOT_DIR, 'examples');
const PUBLIC_DIR = path.resolve(ROOT_DIR, 'devserver/public');
const TYPES_FILE = path.resolve(ROOT_DIR, 'devserver/playground-types.d.ts');

interface RunRequestBody {
  file?: string;
  markdown?: string;
  code: string;
}

interface RunResponseBody {
  ok: boolean;
  error?: string;
  diagnostics?: string[];
  logs?: string[];
  returned?: unknown;
  resultObject?: unknown;
  resultYaml?: string;
  markdownBefore?: string;
  markdownAfter?: string;
  htmlAfter?: string;
  plan?: unknown;
  commit?: unknown;
  summary?: {
    blockCount: number;
    topLevelCount: number;
  };
}

function parsePort(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 65535) {
    return 3939;
  }
  return Math.trunc(value);
}

function sendText(res: ServerResponse, status: number, contentType: string, body: string): void {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  sendText(res, status, 'application/json; charset=utf-8', JSON.stringify(body));
}

function isPathInside(baseDir: string, candidate: string): boolean {
  const relative = path.relative(baseDir, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function listExampleMarkdownFiles(): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith('.md')) continue;
      out.push(path.relative(EXAMPLES_DIR, fullPath));
    }
  }

  await walk(EXAMPLES_DIR);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function resolveExampleFile(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').trim();
  if (!normalized) {
    throw new Error('file is required.');
  }
  const absolute = path.resolve(EXAMPLES_DIR, normalized);
  if (!isPathInside(EXAMPLES_DIR, absolute)) {
    throw new Error('file must stay inside examples directory.');
  }
  if (!absolute.toLowerCase().endsWith('.md')) {
    throw new Error('only .md files are supported.');
  }
  return absolute;
}

async function readRequestBody(req: IncomingMessage, maxBytes = 8 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        reject(new Error('request body too large.'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function toSafeJsonValue(value: unknown): unknown {
  const seen = new WeakSet<object>();
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, currentValue) => {
        if (typeof currentValue === 'bigint') return currentValue.toString();
        if (typeof currentValue === 'function') return `[Function ${currentValue.name || 'anonymous'}]`;
        if (typeof currentValue === 'symbol') return currentValue.toString();
        if (currentValue instanceof RegExp) return currentValue.toString();
        if (currentValue instanceof Error) {
          return {
            name: currentValue.name,
            message: currentValue.message,
            stack: currentValue.stack,
          };
        }
        if (currentValue && typeof currentValue === 'object') {
          if (seen.has(currentValue as object)) {
            return '[Circular]';
          }
          seen.add(currentValue as object);
        }
        return currentValue;
      }),
    );
  } catch {
    return String(value);
  }
}

function buildRuntimeDiagnostics(code: string): { jsCode: string; diagnostics: string[] } {
  const transpiled = ts.transpileModule(code, {
    fileName: 'selector-playground.user.ts',
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: true,
    },
  });

  const diagnostics = (transpiled.diagnostics ?? []).map((diag) => {
    const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
    if (!diag.file || diag.start == null) {
      return message;
    }
    const position = diag.file.getLineAndCharacterOfPosition(diag.start);
    return `L${position.line + 1}:C${position.character + 1} ${message}`;
  });

  return {
    jsCode: transpiled.outputText,
    diagnostics,
  };
}

function getTopLevelCount(model: LASTModel): number {
  if ('mode' in model && model.mode === 'fragment') {
    return model.topLevel.length;
  }
  const rootId = model.rootId;
  if (!rootId) return 0;
  const root = model.blocks[rootId];
  return root?.children.length ?? 0;
}

async function markdownToHtml(markdown: string): Promise<string> {
  const output = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);
  return String(output);
}

async function runPlaygroundCode(markdown: string, userCode: string): Promise<RunResponseBody> {
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, {
    documentId: 'doc_selector_playground',
    mode: 'fragment',
  });
  const api = createLASTApi(last);
  const diagnosticsBundle = buildRuntimeDiagnostics(userCode);

  const logs: string[] = [];
  const print = (...args: unknown[]): void => {
    const line = args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(toSafeJsonValue(arg)))).join(' ');
    logs.push(line);
  };

  const sandbox = vm.createContext({
    $: api.$,
    api,
    model: api.model,
    print,
    console: {
      log: (...args: unknown[]) => print(...args),
      info: (...args: unknown[]) => print(...args),
      warn: (...args: unknown[]) => print(...args),
      error: (...args: unknown[]) => print(...args),
    },
  });

  const wrappedSource = [
    '(async function __playground_run__() {',
    '  const $ = globalThis.$;',
    '  const api = globalThis.api;',
    '  const model = globalThis.model;',
    '  const print = globalThis.print;',
    diagnosticsBundle.jsCode,
    '})()',
  ].join('\n');

  let returned: unknown = null;
  try {
    const script = new vm.Script(wrappedSource, { filename: 'selector-playground.user.ts' });
    returned = await script.runInContext(sandbox, {
      timeout: 3000,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      diagnostics: diagnosticsBundle.diagnostics,
      logs,
    };
  }

  let commitResult;
  try {
    const plan = api.compile();
    commitResult = api.commit();
    const markdownAfter = serializeLASTToMarkdown(commitResult.next);
    const htmlAfter = await markdownToHtml(markdownAfter);
    const commitSummary = {
      ok: commitResult.ok,
      changeCount: commitResult.changes.length,
      changes: commitResult.changes,
      warnings: commitResult.warnings,
    };
    const resultObject = {
      returned: toSafeJsonValue(returned),
      diagnostics: diagnosticsBundle.diagnostics,
      summary: {
        blockCount: Object.keys(commitResult.next.blocks).length,
        topLevelCount: getTopLevelCount(commitResult.next),
      },
      plan: toSafeJsonValue(plan),
      commit: commitSummary,
    };
    return {
      ok: true,
      diagnostics: diagnosticsBundle.diagnostics,
      logs,
      returned: toSafeJsonValue(returned),
      resultObject,
      resultYaml: stringifyYaml(resultObject),
      markdownBefore: markdown,
      markdownAfter,
      htmlAfter,
      plan: toSafeJsonValue(plan),
      commit: commitSummary,
      summary: resultObject.summary,
    };
  } catch (error) {
    const resultObject = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      diagnostics: diagnosticsBundle.diagnostics,
      returned: toSafeJsonValue(returned),
    };
    return {
      ok: false,
      error: resultObject.error,
      diagnostics: diagnosticsBundle.diagnostics,
      logs,
      returned: toSafeJsonValue(returned),
      resultObject,
      resultYaml: stringifyYaml(resultObject),
    };
  }
}

async function serveStatic(res: ServerResponse, relativePath: string, contentType: string): Promise<void> {
  const absolutePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!isPathInside(PUBLIC_DIR, absolutePath)) {
    sendText(res, 403, 'text/plain; charset=utf-8', 'Forbidden');
    return;
  }

  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      sendText(res, 404, 'text/plain; charset=utf-8', 'Not Found');
      return;
    }
    const data = await readFile(absolutePath, 'utf8');
    sendText(res, 200, contentType, data);
  } catch {
    sendText(res, 404, 'text/plain; charset=utf-8', 'Not Found');
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? `localhost:${PORT}`}`);

  if (req.method === 'GET' && requestUrl.pathname === '/') {
    await serveStatic(res, 'index.html', 'text/html; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/app.js') {
    await serveStatic(res, 'app.js', 'application/javascript; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/style.css') {
    await serveStatic(res, 'style.css', 'text/css; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/types') {
    try {
      const content = await readFile(TYPES_FILE, 'utf8');
      sendText(res, 200, 'text/plain; charset=utf-8', content);
    } catch (error) {
      sendText(res, 500, 'text/plain; charset=utf-8', error instanceof Error ? error.message : String(error));
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/examples') {
    try {
      const files = await listExampleMarkdownFiles();
      sendJson(res, 200, { ok: true, files });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/example') {
    const file = requestUrl.searchParams.get('file') ?? '';
    try {
      const absolutePath = resolveExampleFile(file);
      const markdown = await readFile(absolutePath, 'utf8');
      sendJson(res, 200, { ok: true, file, markdown });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/run') {
    let payload: RunRequestBody;
    try {
      const raw = await readRequestBody(req);
      payload = JSON.parse(raw) as RunRequestBody;
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: `invalid request body: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    if (!payload || typeof payload.code !== 'string') {
      sendJson(res, 400, { ok: false, error: 'code is required.' });
      return;
    }

    const hasMarkdown =
      Object.prototype.hasOwnProperty.call(payload, 'markdown') && typeof payload.markdown === 'string';
    const hasFile = typeof payload.file === 'string' && payload.file.trim().length > 0;
    if (!hasMarkdown && !hasFile) {
      sendJson(res, 400, { ok: false, error: 'file or markdown is required.' });
      return;
    }

    try {
      const markdown = hasMarkdown
        ? (payload.markdown ?? '')
        : await readFile(resolveExampleFile(payload.file ?? ''), 'utf8');
      const result = await runPlaygroundCode(markdown, payload.code);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  sendText(res, 404, 'text/plain; charset=utf-8', 'Not Found');
});

server.listen(PORT, () => {
  console.log(`jQuery selector playground: http://localhost:${PORT}`);
  console.log(`examples directory: ${EXAMPLES_DIR}`);
});
