import katex from 'katex';
import type { Element as HastElement, Root as HastRoot, RootContent as HastRootContent } from 'hast';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified, type Plugin } from 'unified';
import type { LarkRendererTarget, ProtocolDiagnostic } from '../../protocol/types.js';
import { normalizeChineseBoldClosingPunctuation } from './normalize-markdown.js';

const SUPPORTED_CONTAINER_DIRECTIVES = new Set(['figure', 'table', 'equation', 'callout', 'footnote']);
const SUPPORTED_LEAF_DIRECTIVES = new Set(['caption', 'note', 'source']);
const FORBIDDEN_MATH_COMMAND_RE =
  /\\(?:includegraphics|include|input|cite|documentclass|usepackage|begin\{document\}|end\{document\})\b/;
const CURRENCY_MATH_RE = /^\s*(?:[$€£¥]\s*)?\d[\d,.]*(?:[KMBT])?(?:\s*-\s*[$€£¥]?\s*\d[\d,.]*(?:[KMBT])?)?\s*$/i;
const INLINE_CODE_PIPE_PLACEHOLDER = '\uE000';
const INLINE_MATH_PIPE_PLACEHOLDER = '\uE001';

interface MdastNode {
  type?: string;
  name?: string;
  identifier?: string;
  label?: string;
  url?: string;
  attributes?: Record<string, unknown> | null;
  value?: unknown;
  children?: MdastNode[];
  data?: Record<string, unknown>;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
}

export interface SemanticCounts {
  figures: number;
  figureCaptions: number;
  tables: number;
  tableCaptions: number;
  equations: number;
  footnoteReferences: number;
  footnoteDefinitions: number;
  callouts: number;
}

export interface SemanticAnalysis {
  counts: SemanticCounts;
  diagnostics: ProtocolDiagnostic[];
  ids: Record<string, string>;
  capabilityLosses: string[];
}

export interface MarkdownToSemanticHastOptions {
  inputPath?: string;
  strict?: boolean;
  singleDollarTextMath?: boolean;
  target?: LarkRendererTarget;
}

export interface MarkdownToSemanticHastResult {
  hast: HastRoot;
  semantic: SemanticAnalysis;
}

function normalizeDirectiveTree(node: MdastNode): void {
  if (node.type === 'footnoteReference') {
    const id = node.identifier ?? node.label ?? '';
    node.type = 'link';
    node.url = `#fn-${id}`;
    node.data = {
      ...(node.data ?? {}),
      hName: 'm2l-footnote-reference',
      hProperties: { footnoteId: id, href: `#fn-${id}` },
    };
    node.children = [{ type: 'text', value: `[${node.label ?? node.identifier ?? ''}]` }];
  } else if (node.type === 'footnoteDefinition') {
    const id = node.identifier ?? node.label ?? '';
    node.type = 'containerDirective';
    node.name = 'footnote';
    node.attributes = { id };
  }

  if (node.type === 'containerDirective' || node.type === 'leafDirective') {
    const name = node.name ?? '';
    const supported =
      node.type === 'containerDirective'
        ? SUPPORTED_CONTAINER_DIRECTIVES.has(name)
        : SUPPORTED_LEAF_DIRECTIVES.has(name);
    const attributes = node.attributes ?? {};
    node.data = {
      ...(node.data ?? {}),
      hName: supported ? `m2l-${name}` : 'm2l-unknown-directive',
      hProperties: {
        ...attributes,
        directiveName: name,
        ...(typeof attributes.id === 'string' ? { semanticId: attributes.id } : {}),
      },
    };
  }

  for (const child of node.children ?? []) normalizeDirectiveTree(child);
}

const semanticDirectivePlugin: Plugin = function semanticDirectivePlugin() {
  return (tree) => normalizeDirectiveTree(tree as unknown as MdastNode);
};

function collectProtectedMdastRanges(tree: MdastNode): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const visit = (node: MdastNode): void => {
    if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') {
      const start = node.position?.start?.offset;
      const end = node.position?.end?.offset;
      if (typeof start === 'number' && typeof end === 'number') ranges.push({ start, end });
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return ranges.sort((left, right) => left.start - right.start);
}

function protectCurrencyDollars(markdown: string): string {
  const tree = unified().use(remarkParse).parse(markdown) as unknown as MdastNode;
  const ranges = collectProtectedMdastRanges(tree);
  const protectSegment = (segment: string): string =>
    segment
      .replace(
        /(?<!\\)\$(\d[\d,.]*(?:[KMBT])?)\s*[-–]\s*\$(\d[\d,.]*(?:[KMBT])?)/gi,
        (_all, left, right) => `\\$${left}-\\$${right}`,
      )
      .replace(/(?<!\\)\$(\d[\d,.]*(?:[KMBT])?)\$/gi, (_all, amount) => `\\$${amount}\\$`);
  let output = '';
  let cursor = 0;
  for (const range of ranges) {
    output += protectSegment(markdown.slice(cursor, range.start));
    output += markdown.slice(range.start, range.end);
    cursor = range.end;
  }
  output += protectSegment(markdown.slice(cursor));
  return output;
}

function protectTableInlinePipes(markdown: string): string {
  const lines = markdown.match(/[^\n]*\n|[^\n]+/g) ?? [''];
  let fenceMarker = '';
  let fenceLength = 0;
  return lines
    .map((line) => {
      const fence = line.match(/^ {0,3}([`~]{3,})/);
      if (fenceMarker) {
        if (fence?.[1]?.startsWith(fenceMarker) && fence[1].length >= fenceLength) {
          fenceMarker = '';
          fenceLength = 0;
        }
        return line;
      }
      if (fence?.[1]) {
        fenceMarker = fence[1][0]!;
        fenceLength = fence[1].length;
        return line;
      }
      if (!line.includes('|')) return line;

      let output = '';
      let codeDelimiterLength = 0;
      let inMath = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index]!;
        if (char === '`' && !inMath) {
          let runLength = 1;
          while (line[index + runLength] === '`') runLength += 1;
          if (codeDelimiterLength === 0) codeDelimiterLength = runLength;
          else if (runLength === codeDelimiterLength) codeDelimiterLength = 0;
          output += '`'.repeat(runLength);
          index += runLength - 1;
          continue;
        }
        if (char === '$' && codeDelimiterLength === 0 && line[index - 1] !== '\\' && line[index + 1] !== '$') {
          inMath = !inMath;
          output += char;
          continue;
        }
        if (char === '|' && codeDelimiterLength > 0) {
          output += INLINE_CODE_PIPE_PLACEHOLDER;
          continue;
        }
        if (char === '|' && inMath) {
          output += INLINE_MATH_PIPE_PLACEHOLDER;
          continue;
        }
        output += char;
      }
      return output;
    })
    .join('');
}

function restoreTableInlinePipes(hast: HastRoot): void {
  const visit = (node: HastRootContent): void => {
    if (node.type === 'text') {
      node.value = node.value
        .replaceAll(INLINE_CODE_PIPE_PLACEHOLDER, '|')
        .replaceAll(INLINE_MATH_PIPE_PLACEHOLDER, '|');
      return;
    }
    if (isElement(node)) for (const child of node.children) visit(child);
  };
  for (const child of hast.children) visit(child);
}

function collectUnparsedFootnoteReferences(tree: MdastNode): string[] {
  const references: string[] = [];
  const visit = (node: MdastNode): void => {
    if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') return;
    if (node.type === 'text' && typeof node.value === 'string') {
      for (const match of node.value.matchAll(/\[\^([^\]\s]+)\]/g)) {
        if (match[1]) references.push(match[1].toLowerCase());
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return references;
}

function isElement(node: HastRootContent): node is HastElement {
  return node.type === 'element';
}

function getStringProperty(element: HastElement, key: string): string | undefined {
  const value = element.properties?.[key];
  return value === undefined || value === null ? undefined : String(value);
}

function sourceDiagnostic(
  node: HastRootContent | HastRoot,
  severity: ProtocolDiagnostic['severity'],
  code: string,
  message: string,
  inputPath?: string,
  semanticId?: string,
): ProtocolDiagnostic {
  return {
    severity,
    code,
    message,
    ...(inputPath ? { sourcePath: inputPath } : {}),
    ...(typeof node.position?.start.line === 'number' ? { line: node.position.start.line } : {}),
    ...(typeof node.position?.start.column === 'number' ? { column: node.position.start.column } : {}),
    ...(semanticId ? { semanticId } : {}),
  };
}

function findDescendants(element: HastElement, predicate: (node: HastElement) => boolean): HastElement[] {
  const matches: HastElement[] = [];
  const visit = (node: HastRootContent): void => {
    if (!isElement(node)) return;
    if (predicate(node)) matches.push(node);
    for (const child of node.children) visit(child);
  };
  for (const child of element.children) visit(child);
  return matches;
}

function analyzeSemanticHast(hast: HastRoot, options: MarkdownToSemanticHastOptions): SemanticAnalysis {
  const counts: SemanticCounts = {
    figures: 0,
    figureCaptions: 0,
    tables: 0,
    tableCaptions: 0,
    equations: 0,
    footnoteReferences: 0,
    footnoteDefinitions: 0,
    callouts: 0,
  };
  const diagnostics: ProtocolDiagnostic[] = [];
  const ids = new Map<string, string>();
  const footnoteReferences = new Map<string, number>();
  const footnoteDefinitions = new Map<string, number>();
  const anchorReferences: Array<{ id: string; node: HastElement }> = [];
  const capabilityLosses = new Set<string>();
  const strictSeverity: ProtocolDiagnostic['severity'] = options.strict ? 'error' : 'warning';
  const mathTarget = options.target?.math;

  const registerId = (element: HastElement, kind: string, required: boolean): void => {
    const id = getStringProperty(element, 'semanticId') ?? getStringProperty(element, 'id');
    if (!id) {
      if (required) {
        diagnostics.push(
          sourceDiagnostic(
            element,
            'error',
            'semantic-id-required',
            `${kind} requires a unique id.`,
            options.inputPath,
          ),
        );
      }
      return;
    }
    const previous = ids.get(id);
    if (previous) {
      diagnostics.push(
        sourceDiagnostic(
          element,
          'error',
          'duplicate-semantic-id',
          `Duplicate semantic id "${id}" (${previous}, ${kind}).`,
          options.inputPath,
          id,
        ),
      );
      return;
    }
    ids.set(id, kind);
  };

  const validateAnnotations = (element: HastElement, kind: string): void => {
    for (const annotation of ['caption', 'note', 'source']) {
      const matches = findDescendants(element, (node) => node.tagName === `m2l-${annotation}`);
      if (matches.length > 1) {
        diagnostics.push(
          sourceDiagnostic(
            element,
            'error',
            `duplicate-${kind}-${annotation}`,
            `${kind} may contain at most one ${annotation}.`,
            options.inputPath,
          ),
        );
      }
    }
  };

  const validateMath = (element: HastElement): void => {
    const latex = element.children.map((child) => (child.type === 'text' ? child.value : '')).join('');
    const forbidden = FORBIDDEN_MATH_COMMAND_RE.exec(latex);
    if (forbidden) {
      diagnostics.push(
        sourceDiagnostic(
          element,
          'error',
          'forbidden-math-command',
          `Forbidden document command in math: ${forbidden[0]}.`,
          options.inputPath,
        ),
      );
      return;
    }
    for (const match of latex.matchAll(/\\begin\{([^}]+)\}/g)) {
      const environment = match[1] ?? '';
      if (mathTarget?.environments && !mathTarget.environments.includes(environment)) {
        diagnostics.push(
          sourceDiagnostic(
            element,
            'error',
            'unsupported-math-environment',
            `Unsupported KaTeX environment: ${environment}.`,
            options.inputPath,
          ),
        );
      }
    }
    try {
      katex.renderToString(latex, {
        throwOnError: true,
        displayMode: element.properties?.className?.toString().includes('math-display') ?? false,
        ...(mathTarget?.macros ? { macros: mathTarget.macros } : {}),
        strict: 'error',
      });
    } catch (error) {
      diagnostics.push(
        sourceDiagnostic(
          element,
          mathTarget?.unsupported_command === 'warning' ? 'warning' : 'error',
          'katex-validation',
          error instanceof Error ? error.message : String(error),
          options.inputPath,
        ),
      );
    }
  };

  const visit = (node: HastRootContent): void => {
    if (!isElement(node)) return;
    if (node.tagName === 'm2l-unknown-directive') {
      const name = getStringProperty(node, 'directiveName') ?? '';
      diagnostics.push(
        sourceDiagnostic(
          node,
          strictSeverity,
          'unknown-directive',
          `Unknown semantic directive: ${name}.`,
          options.inputPath,
        ),
      );
    } else if (node.tagName === 'm2l-figure') {
      counts.figures += 1;
      registerId(node, 'figure', true);
      validateAnnotations(node, 'figure');
      const images = findDescendants(node, (element) => element.tagName === 'img');
      if (images.length === 0) {
        diagnostics.push(
          sourceDiagnostic(
            node,
            'error',
            'figure-image-required',
            'figure requires at least one Markdown image.',
            options.inputPath,
          ),
        );
      }
      const width = getStringProperty(node, 'width');
      if (width && !parseDirectiveWidth(width)) {
        diagnostics.push(
          sourceDiagnostic(node, 'error', 'invalid-figure-width', `Invalid figure width: ${width}.`, options.inputPath),
        );
      }
    } else if (node.tagName === 'm2l-table') {
      counts.tables += 1;
      registerId(node, 'table', true);
      validateAnnotations(node, 'table');
      const tables = findDescendants(node, (element) => element.tagName === 'table');
      if (tables.length !== 1) {
        diagnostics.push(
          sourceDiagnostic(
            node,
            'error',
            'invalid-semantic-table',
            `table requires exactly one GFM table; received ${tables.length}.`,
            options.inputPath,
          ),
        );
      }
      if (tables.length === 1 && options.target?.tables?.invalid_table === 'error') {
        const rows = findDescendants(tables[0]!, (element) => element.tagName === 'tr');
        const widths = rows.map(
          (row) =>
            row.children.filter((child) => isElement(child) && (child.tagName === 'th' || child.tagName === 'td'))
              .length,
        );
        if (new Set(widths).size > 1) {
          diagnostics.push(
            sourceDiagnostic(
              node,
              'error',
              'invalid-table-row-width',
              `Malformed table row widths: ${widths.join(', ')}.`,
              options.inputPath,
            ),
          );
        }
      }
    } else if (node.tagName === 'm2l-equation') {
      registerId(node, 'equation', true);
      validateAnnotations(node, 'equation');
      const displayMath = findDescendants(node, (element) => {
        const classes = Array.isArray(element.properties?.className)
          ? element.properties.className.map(String)
          : [String(element.properties?.className ?? '')];
        return element.tagName === 'code' && classes.includes('math-display');
      });
      if (displayMath.length !== 1) {
        diagnostics.push(
          sourceDiagnostic(
            node,
            'error',
            'invalid-semantic-equation',
            `equation requires exactly one display math node; received ${displayMath.length}.`,
            options.inputPath,
          ),
        );
      }
      if (getStringProperty(node, 'number') === 'auto') {
        if (typeof node.properties.equationNumber !== 'number') {
          diagnostics.push(
            sourceDiagnostic(
              node,
              'error',
              'equation-numbering',
              'Unable to assign automatic equation number.',
              options.inputPath,
            ),
          );
        }
      }
    } else if (node.tagName === 'm2l-callout') {
      counts.callouts += 1;
      registerId(node, 'callout', true);
      const type = getStringProperty(node, 'type');
      if (type && !['note', 'info', 'tip', 'warning', 'danger', 'important'].includes(type)) {
        diagnostics.push(
          sourceDiagnostic(node, 'error', 'invalid-callout-type', `Invalid callout type: ${type}.`, options.inputPath),
        );
      }
      const unsupported = findDescendants(node, (element) => ['img', 'table'].includes(element.tagName));
      if (unsupported.length > 0 && options.target?.callouts?.unsupported_child_policy !== 'sibling-after') {
        diagnostics.push(
          sourceDiagnostic(
            node,
            'error',
            'unsupported-callout-child',
            'Callout contains a child block unsupported by Lark.',
            options.inputPath,
          ),
        );
      }
    } else if (node.tagName === 'm2l-footnote') {
      counts.footnoteDefinitions += 1;
      const id = getStringProperty(node, 'semanticId') ?? getStringProperty(node, 'id') ?? '';
      footnoteDefinitions.set(id, (footnoteDefinitions.get(id) ?? 0) + 1);
      const images = findDescendants(node, (element) => element.tagName === 'img');
      if (images.length > 0 && options.target?.footnotes?.image_policy !== 'sibling-after') {
        diagnostics.push(
          sourceDiagnostic(
            node,
            'error',
            'unsupported-footnote-image',
            'Footnote image requires footnotes.image_policy: sibling-after.',
            options.inputPath,
          ),
        );
      }
    } else if (node.tagName === 'm2l-footnote-reference') {
      counts.footnoteReferences += 1;
      const id = getStringProperty(node, 'footnoteId') ?? '';
      footnoteReferences.set(id, (footnoteReferences.get(id) ?? 0) + 1);
    } else if (node.tagName === 'm2l-caption') {
      const parentTag = undefined;
      void parentTag;
    } else if (node.tagName === 'a') {
      const href = getStringProperty(node, 'href');
      if (href?.startsWith('#')) anchorReferences.push({ id: href.slice(1), node });
    }

    if (node.tagName === 'code') {
      const className = node.properties?.className;
      const classes = Array.isArray(className) ? className.map(String) : [String(className ?? '')];
      if (classes.includes('math-inline') || classes.includes('math-display')) {
        validateMath(node);
        counts.equations += 1;
        if (getStringProperty(node, 'mathLabel')) registerId(node, 'equation', false);
      }
    }
    if (node.tagName !== 'code' && node.tagName !== 'pre') {
      for (const child of node.children) {
        if (child.type !== 'text') continue;
        if (/(?:^|\n)\s*:{3,}/.test(child.value) || /\[table\]/i.test(child.value) || child.value.includes('$$')) {
          diagnostics.push(
            sourceDiagnostic(
              child,
              strictSeverity,
              'visible-semantic-residue',
              `Visible unrendered semantic residue: ${child.value.trim().slice(0, 80)}`,
              options.inputPath,
            ),
          );
        }
      }
    }
    for (const child of node.children) visit(child);
  };
  for (const child of hast.children) visit(child);

  counts.figureCaptions = countTag(hast, 'm2l-figure', 'm2l-caption');
  counts.tableCaptions = countTag(hast, 'm2l-table', 'm2l-caption');

  for (const [id, count] of footnoteDefinitions) {
    if (count > 1)
      diagnostics.push({
        severity: 'error',
        code: 'duplicate-footnote-definition',
        message: `Duplicate footnote definition: ${id}.`,
        ...(options.inputPath ? { sourcePath: options.inputPath } : {}),
      });
    if (!footnoteReferences.has(id))
      diagnostics.push({
        severity: 'warning',
        code: 'unreferenced-footnote',
        message: `Footnote definition is not referenced: ${id}.`,
        ...(options.inputPath ? { sourcePath: options.inputPath } : {}),
      });
  }
  if (footnoteReferences.size > 0) {
    capabilityLosses.add('Lark output preserves footnote reference labels but not Markdown anchor navigation.');
  }
  for (const id of footnoteReferences.keys()) {
    if (!footnoteDefinitions.has(id))
      diagnostics.push({
        severity: 'error',
        code: 'missing-footnote-definition',
        message: `Footnote reference has no definition: ${id}.`,
        ...(options.inputPath ? { sourcePath: options.inputPath } : {}),
      });
  }
  for (const reference of anchorReferences) {
    const normalized = reference.id.replace(/^fn-/, '');
    if (!ids.has(reference.id) && !footnoteDefinitions.has(normalized)) {
      diagnostics.push(
        sourceDiagnostic(
          reference.node,
          strictSeverity,
          'broken-semantic-reference',
          `Broken semantic reference: #${reference.id}.`,
          options.inputPath,
        ),
      );
    } else {
      capabilityLosses.add('Lark output preserves semantic reference labels but not Markdown anchor navigation.');
    }
  }
  return { counts, diagnostics, ids: Object.fromEntries(ids), capabilityLosses: [...capabilityLosses] };
}

function countTag(root: HastRoot, ancestorTag: string, targetTag: string): number {
  let count = 0;
  const visit = (node: HastRootContent, insideAncestor: boolean): void => {
    if (!isElement(node)) return;
    const nextInside = insideAncestor || node.tagName === ancestorTag;
    if (nextInside && node.tagName === targetTag) count += 1;
    for (const child of node.children) visit(child, nextInside);
  };
  for (const child of root.children) visit(child, false);
  return count;
}

export function parseDirectiveWidth(raw: string): { widthRatio?: number; widthPx?: number } | null {
  const value = raw.trim().toLowerCase();
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(value);
  if (percent) {
    const ratio = Number(percent[1]) / 100;
    return ratio > 0 && ratio <= 1 ? { widthRatio: ratio } : null;
  }
  const pixels = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (pixels) {
    const widthPx = Number(pixels[1]);
    return widthPx > 0 ? { widthPx } : null;
  }
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio > 0 && ratio <= 1 ? { widthRatio: ratio } : null;
}

function restoreCurrencyMath(hast: HastRoot, markdown: string): void {
  const visitChildren = (children: HastRootContent[]): void => {
    for (let index = 0; index < children.length; index += 1) {
      const node = children[index];
      if (!node || !isElement(node)) continue;
      const className = node.properties?.className;
      const classes = Array.isArray(className) ? className.map(String) : [String(className ?? '')];
      if (node.tagName === 'code' && classes.includes('math-inline')) {
        const latex = node.children.map((child) => (child.type === 'text' ? child.value : '')).join('');
        if (CURRENCY_MATH_RE.test(latex)) {
          const start = node.position?.start.offset;
          const end = node.position?.end.offset;
          children[index] = {
            type: 'text',
            value: typeof start === 'number' && typeof end === 'number' ? markdown.slice(start, end) : `$${latex}$`,
            position: node.position,
          };
          continue;
        }
      }
      visitChildren(node.children);
    }
  };
  visitChildren(hast.children);
}

function assignAutomaticEquationNumbers(hast: HastRoot): void {
  let number = 0;
  const visit = (node: HastRootContent): void => {
    if (!isElement(node)) return;
    if (node.tagName === 'm2l-equation' && getStringProperty(node, 'number') === 'auto') {
      number += 1;
      node.properties.equationNumber = number;
    }
    for (const child of node.children) visit(child);
  };
  for (const child of hast.children) visit(child);
}

function normalizeMathHast(hast: HastRoot, target: LarkRendererTarget['math']): void {
  const macros = Object.entries(target?.macros ?? {}).sort(([left], [right]) => right.length - left.length);
  const equationNumbers = new Map<string, string>();
  const collectNumbers = (node: HastRootContent): void => {
    if (!isElement(node)) return;
    if (node.tagName === 'm2l-equation') {
      const id = getStringProperty(node, 'semanticId');
      const number = getStringProperty(node, 'equationNumber');
      if (number) {
        if (id) equationNumbers.set(id, number);
        for (const math of findDescendants(node, (element) => element.tagName === 'code')) {
          const latex = math.children.map((child) => (child.type === 'text' ? child.value : '')).join('');
          for (const label of latex.matchAll(/\\label\{([^}]+)\}/g)) {
            if (label[1]) equationNumbers.set(label[1], number);
          }
        }
      }
    }
    for (const child of node.children) collectNumbers(child);
  };
  for (const child of hast.children) collectNumbers(child);
  const visit = (node: HastRootContent): void => {
    if (!isElement(node)) return;
    const className = node.properties?.className;
    const classes = Array.isArray(className) ? className.map(String) : [String(className ?? '')];
    if (node.tagName === 'code' && (classes.includes('math-inline') || classes.includes('math-display'))) {
      let latex = node.children.map((child) => (child.type === 'text' ? child.value : '')).join('');
      const labels = [...latex.matchAll(/\\label\{([^}]+)\}/g)].map((match) => match[1]).filter(Boolean) as string[];
      if (labels[0]) {
        node.properties.mathLabel = labels[0];
        node.properties.semanticId = labels[0];
      }
      latex = latex
        .replace(/\\label\{[^}]+\}/g, '')
        .replace(/\\begin\{equation\*?\}/g, '')
        .replace(/\\end\{equation\*?\}/g, '')
        .replace(/\\eqref\{([^}]+)\}/g, (_all, id: string) => '\\text{(' + (equationNumbers.get(id) ?? id) + ')}')
        .replace(/\\ref\{([^}]+)\}/g, (_all, id: string) => '\\text{' + (equationNumbers.get(id) ?? id) + '}');
      for (const [macro, replacement] of macros) {
        const escaped = macro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        latex = latex.replace(new RegExp(`${escaped}(?![A-Za-z])`, 'g'), replacement);
      }
      node.children = [{ type: 'text', value: latex }];
    }
    for (const child of node.children) visit(child);
  };
  for (const child of hast.children) visit(child);
}

export async function markdownToSemanticHast(
  markdown: string,
  options: MarkdownToSemanticHastOptions = {},
): Promise<MarkdownToSemanticHastResult> {
  const normalized = normalizeChineseBoldClosingPunctuation(markdown);
  const withProtectedTablePipes = protectTableInlinePipes(normalized);
  const content =
    options.target?.math?.currency_policy === 'parse'
      ? withProtectedTablePipes
      : protectCurrencyDollars(withProtectedTablePipes);
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath, { singleDollarTextMath: options.singleDollarTextMath ?? true })
    .use(remarkDirective)
    .use(semanticDirectivePlugin)
    .use(remarkRehype, { allowDangerousHtml: false });
  const mdast = processor.parse(content);
  const unparsedFootnoteReferences = collectUnparsedFootnoteReferences(mdast as unknown as MdastNode);
  const hast = (await processor.run(mdast)) as HastRoot;
  restoreTableInlinePipes(hast);
  if (options.target?.math?.currency_policy !== 'parse') restoreCurrencyMath(hast, content);
  assignAutomaticEquationNumbers(hast);
  normalizeMathHast(hast, options.target?.math);
  const semantic = analyzeSemanticHast(hast, options);
  for (const id of unparsedFootnoteReferences) {
    semantic.counts.footnoteReferences += 1;
    if (
      !semantic.diagnostics.some(
        (diagnostic) => diagnostic.code === 'missing-footnote-definition' && diagnostic.message.includes(id),
      )
    ) {
      semantic.diagnostics.push({
        severity: 'error',
        code: 'missing-footnote-definition',
        message: `Footnote reference has no definition: ${id}.`,
        ...(options.inputPath ? { sourcePath: options.inputPath } : {}),
      });
    }
  }
  return { hast, semantic };
}
