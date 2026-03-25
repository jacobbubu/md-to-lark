const state = {
  files: [],
  editor: null,
  monaco: null,
  lastRunPayload: null,
  resultFormat: 'yaml',
  splitters: [],
  sourceMode: 'example',
  selectedExample: '',
  uploadedFileName: '',
  uploadedMarkdown: '',
};

const MONACO_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs';

const defaultCode = `// Global variables available in this playground:
//   $      : LASTDollar
//   api    : LASTApi
//   model  : LASTModel (same as $.model)
//   print  : (...args) => void

const headingIds = $('heading1,heading2').ids();
print('heading ids:', headingIds);

$('heading1').text((idx, oldText) => \`[Edited H1-\${idx + 1}] \${oldText}\`);
$('text').matches(/demo|scope/gi).replaceText(/demo/gi, 'example');

return {
  touchedHeadings: headingIds.length,
  // Number of top-level blocks after running this script.
  // Usually unchanged unless you add/remove/replace blocks.
  topLevelBlockCountAfterEdit: $.model.topLevel?.length ?? 0,
};`;

const selectorRecipeDoc = `Selectors
- $('heading1')
  Select all H1 blocks.
- $('heading1,heading2')
  Select multiple block types.
- $('text').contains('demo')
  Filter text blocks by substring.
- $('text').matches(/demo|scope/gi)
  Filter text blocks by regex.
- $({ types: ['heading1'], hasText: /demo/i })
  Object selector by type + text.

Traversal
- $('list').children('list_item')
- $('heading1').next()
- $('text').closest('quote')
- $('heading2').siblings('heading2')

Text Replacers
- $('heading1').text((idx, oldText) => \`[H1-\${idx + 1}] \${oldText}\`)
- $('text').replaceText(/demo/gi, 'example')
- $.byScope({ pattern: /todo/i }).replace(/todo/gi, 'done')

Structure Replacers
- $('quote').after(node)
- $('list_item').before(node)
- $('heading3').replaceWith(node)
- $('table').remove()

Transaction
- $.begin()
- const plan = $.plan()
- const committed = $.commit()
- $.rollback()
`;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getStoredRatio(key, defaultRatio) {
  try {
    const raw = localStorage.getItem(`jq-playground-split:${key}`);
    if (!raw) return defaultRatio;
    const value = Number(raw);
    if (!Number.isFinite(value)) return defaultRatio;
    if (value <= 0 || value >= 1) return defaultRatio;
    return value;
  } catch {
    return defaultRatio;
  }
}

function saveRatio(key, ratio) {
  try {
    localStorage.setItem(`jq-playground-split:${key}`, String(ratio));
  } catch {
    // no-op
  }
}

function setupSplitter(config) {
  const container = document.getElementById(config.containerId);
  const first = document.getElementById(config.firstId);
  const second = document.getElementById(config.secondId);
  const splitter = document.getElementById(config.splitterId);
  if (!container || !first || !second || !splitter) return null;

  let ratio = getStoredRatio(config.key, config.defaultRatio);

  const getSplitterSize = () => (config.axis === 'y' ? splitter.offsetHeight || 8 : splitter.offsetWidth || 8);

  const apply = () => {
    const containerSize = config.axis === 'y' ? container.clientHeight : container.clientWidth;
    const available = containerSize - getSplitterSize();
    if (available <= 0) return;

    const minRatio = config.minFirst / available;
    const maxRatio = 1 - config.minSecond / available;
    ratio = clamp(ratio, minRatio, maxRatio);

    const firstPx = Math.round(available * ratio);
    const secondPx = Math.max(0, available - firstPx);
    first.style.flex = `0 0 ${firstPx}px`;
    second.style.flex = `0 0 ${secondPx}px`;
  };

  let startPointer = 0;
  let startFirstSize = 0;
  let startAvailable = 1;

  const onPointerMove = (event) => {
    const pointer = config.axis === 'y' ? event.clientY : event.clientX;
    const delta = pointer - startPointer;
    const nextFirst = clamp(startFirstSize + delta, config.minFirst, startAvailable - config.minSecond);
    ratio = nextFirst / startAvailable;
    apply();
  };

  const onPointerUp = () => {
    document.body.classList.remove('dragging');
    window.removeEventListener('mousemove', onPointerMove);
    saveRatio(config.key, ratio);
  };

  splitter.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const firstRect = first.getBoundingClientRect();
    startPointer = config.axis === 'y' ? event.clientY : event.clientX;
    startFirstSize = config.axis === 'y' ? firstRect.height : firstRect.width;
    const containerSize = config.axis === 'y' ? container.clientHeight : container.clientWidth;
    startAvailable = Math.max(1, containerSize - getSplitterSize());
    document.body.classList.add('dragging');
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp, { once: true });
  });

  apply();
  return { apply };
}

function initSplitters() {
  const configs = [
    {
      key: 'main',
      axis: 'y',
      containerId: 'workspace',
      firstId: 'pane-editor',
      secondId: 'pane-bottom',
      splitterId: 'split-main',
      defaultRatio: 0.36,
      minFirst: 170,
      minSecond: 260,
    },
    {
      key: 'columns',
      axis: 'x',
      containerId: 'pane-bottom',
      firstId: 'left-stack',
      secondId: 'right-stack',
      splitterId: 'split-columns',
      defaultRatio: 0.5,
      minFirst: 260,
      minSecond: 260,
    },
    {
      key: 'left',
      axis: 'y',
      containerId: 'left-stack',
      firstId: 'pane-source',
      secondId: 'pane-html',
      splitterId: 'split-left',
      defaultRatio: 0.5,
      minFirst: 120,
      minSecond: 120,
    },
    {
      key: 'right-top-row',
      axis: 'x',
      containerId: 'right-top-row',
      firstId: 'pane-output',
      secondId: 'pane-recipes',
      splitterId: 'split-right-top-row',
      defaultRatio: 0.56,
      minFirst: 220,
      minSecond: 220,
    },
    {
      key: 'right-top',
      axis: 'y',
      containerId: 'right-top-stack',
      firstId: 'right-top-row',
      secondId: 'pane-logs',
      splitterId: 'split-right-top',
      defaultRatio: 0.5,
      minFirst: 120,
      minSecond: 120,
    },
    {
      key: 'right-bottom',
      axis: 'y',
      containerId: 'right-stack',
      firstId: 'right-top-stack',
      secondId: 'pane-result',
      splitterId: 'split-right-bottom',
      defaultRatio: 0.66,
      minFirst: 220,
      minSecond: 120,
    },
  ];

  state.splitters = configs.map(setupSplitter).filter(Boolean);
  const applyAll = () => {
    for (const splitter of state.splitters) {
      splitter.apply();
    }
  };
  window.addEventListener('resize', applyAll);
  applyAll();
}

function setBusy(isBusy) {
  const runBtn = document.getElementById('run-btn');
  const fileSelect = document.getElementById('file-select');
  const uploadInput = document.getElementById('upload-md');
  runBtn.disabled = isBusy;
  fileSelect.disabled = isBusy;
  uploadInput.disabled = isBusy;
}

function renderText(id, value) {
  const node = document.getElementById(id);
  node.textContent = value;
}

function clearRunPanels() {
  renderText('markdown-after', '');
  renderText('logs', '');
  state.lastRunPayload = null;
  renderRunResult();
  renderHtmlPreview('');
}

function renderSourceIndicator() {
  const node = document.getElementById('source-indicator');
  if (!node) return;
  if (state.sourceMode === 'uploaded') {
    node.textContent = `Source: upload (${state.uploadedFileName || 'inline markdown'})`;
    return;
  }
  node.textContent = `Source: example (${state.selectedExample || 'none'})`;
}

function useUploadedSource(fileName, markdown) {
  state.sourceMode = 'uploaded';
  state.uploadedFileName = fileName;
  state.uploadedMarkdown = markdown;
  renderSourceIndicator();
  renderText('markdown-before', markdown);
  clearRunPanels();
}

function useExampleSource(fileName, markdown) {
  state.sourceMode = 'example';
  state.selectedExample = fileName;
  state.uploadedFileName = '';
  state.uploadedMarkdown = '';
  const uploadInput = document.getElementById('upload-md');
  if (uploadInput) {
    uploadInput.value = '';
  }
  renderSourceIndicator();
  renderText('markdown-before', markdown);
  clearRunPanels();
}

function renderHtmlPreview(html) {
  const iframe = document.getElementById('html-preview');
  iframe.srcdoc = html || '<!doctype html><html><body><p style="color:#6b7280;">No output yet.</p></body></html>';
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function fallbackResultObject(payload) {
  if (payload?.resultObject) return payload.resultObject;
  if (payload?.ok) {
    return {
      returned: payload.returned,
      diagnostics: payload.diagnostics || [],
      summary: payload.summary,
      plan: payload.plan,
      commit: payload.commit,
    };
  }
  return {
    ok: false,
    error: payload?.error,
    diagnostics: payload?.diagnostics || [],
  };
}

function renderRunResult() {
  if (!state.lastRunPayload) {
    renderText('result', '');
    return;
  }

  const payload = state.lastRunPayload;
  if (state.resultFormat === 'yaml' && typeof payload.resultYaml === 'string' && payload.resultYaml.length > 0) {
    renderText('result', payload.resultYaml);
    return;
  }

  renderText('result', formatJson(fallbackResultObject(payload)));
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || `HTTP ${res.status}`);
  }
  return payload;
}

async function loadMonaco() {
  if (window.monaco) {
    return window.monaco;
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${MONACO_BASE}/loader.min.js`;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Monaco loader.'));
    document.head.appendChild(script);
  });

  window.require.config({ paths: { vs: MONACO_BASE } });
  return new Promise((resolve, reject) => {
    window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
  });
}

async function initEditor() {
  const [monaco, dts] = await Promise.all([loadMonaco(), fetch('/api/types').then((res) => res.text())]);

  state.monaco = monaco;
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    strict: true,
    noEmit: true,
    target: monaco.languages.typescript.ScriptTarget.ES2022,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    allowNonTsExtensions: true,
  });
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  monaco.languages.typescript.typescriptDefaults.addExtraLib(dts, 'file:///playground-types.d.ts');

  state.editor = monaco.editor.create(document.getElementById('editor'), {
    language: 'typescript',
    value: defaultCode,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    lineNumbersMinChars: 3,
    scrollBeyondLastLine: false,
    tabSize: 2,
    theme: 'vs',
  });

  state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    void runCode();
  });
}

async function loadExamples() {
  const payload = await fetchJson('/api/examples');
  state.files = payload.files || [];

  const select = document.getElementById('file-select');
  select.innerHTML = '';
  for (const file of state.files) {
    const option = document.createElement('option');
    option.value = file;
    option.textContent = file;
    select.appendChild(option);
  }

  if (state.files.length > 0) {
    select.value = state.files[0];
    await loadSelectedMarkdown();
  } else {
    state.sourceMode = 'example';
    state.selectedExample = '';
    renderSourceIndicator();
    renderText('markdown-before', 'No markdown files found in examples/. You can upload a local .md file.');
  }

  select.addEventListener('change', () => {
    void loadSelectedMarkdown();
  });
}

async function loadSelectedMarkdown() {
  const select = document.getElementById('file-select');
  const file = select.value;
  if (!file) return;
  const payload = await fetchJson(`/api/example?file=${encodeURIComponent(file)}`);
  useExampleSource(file, payload.markdown || '');
}

async function handleUploadMarkdownFile() {
  const uploadInput = document.getElementById('upload-md');
  const file = uploadInput.files?.[0];
  if (!file) return;
  try {
    const markdown = await file.text();
    useUploadedSource(file.name, markdown);
  } catch (error) {
    renderText(
      'result',
      formatJson({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

async function runCode() {
  if (!state.editor) return;
  const select = document.getElementById('file-select');
  const file = select.value;
  if (state.sourceMode !== 'uploaded' && !file) return;

  setBusy(true);
  try {
    const requestBody = {
      code: state.editor.getValue(),
      ...(state.sourceMode === 'uploaded' ? { markdown: state.uploadedMarkdown } : { file }),
    };
    const payload = await fetchJson('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (payload.ok) {
      state.lastRunPayload = payload;
      renderText('markdown-before', payload.markdownBefore || '');
      renderText('markdown-after', payload.markdownAfter || '');
      renderText('logs', (payload.logs || []).join('\n'));
      renderRunResult();
      renderHtmlPreview(payload.htmlAfter || '');
      return;
    }

    state.lastRunPayload = payload;
    renderText('logs', (payload.logs || []).join('\n'));
    renderRunResult();
    renderText('markdown-after', '');
    renderHtmlPreview('');
  } catch (error) {
    state.lastRunPayload = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      diagnostics: [],
    };
    renderRunResult();
    renderHtmlPreview('');
  } finally {
    setBusy(false);
  }
}

async function bootstrap() {
  setBusy(true);
  try {
    renderText('selector-recipes', selectorRecipeDoc.trim());
    renderSourceIndicator();
    initSplitters();
    await initEditor();
    await loadExamples();
    const uploadInput = document.getElementById('upload-md');
    uploadInput.addEventListener('change', () => {
      void handleUploadMarkdownFile();
    });
    const resultFormatSelect = document.getElementById('result-format');
    resultFormatSelect.addEventListener('change', () => {
      state.resultFormat = resultFormatSelect.value === 'json' ? 'json' : 'yaml';
      renderRunResult();
    });
    document.getElementById('run-btn').addEventListener('click', () => {
      void runCode();
    });
  } catch (error) {
    renderText('result', formatJson({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  } finally {
    setBusy(false);
  }
}

void bootstrap();
