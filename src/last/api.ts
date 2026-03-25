import type {
  LASTBlockId,
  LASTBlockNode,
  LASTDocId,
  LASTDocument,
  LASTFeishuBlockType,
  LASTFragment,
  LASTIndexes,
  LASTInlineId,
  LASTInlineNode,
  LASTInlineKind,
  LASTModel,
  LASTScopeId,
  LASTTextScope,
  LASTTextSegment,
  LASTTextualBlock,
  LASTTextualBlockType,
} from './types.js';
import { LAST_TEXTUAL_BLOCK_TYPE_SET } from './textual-block-types.js';

export interface JQuerySelectorObject {
  ids?: LASTBlockId[];
  types?: LASTFeishuBlockType[];
  bttIds?: string[];
  attrs?: Record<string, unknown>;
  hasText?: string | RegExp;
}

export type JQuerySelectorInput =
  | string
  | LASTBlockId
  | LASTBlockNode
  | LASTJQSelection<LASTBlockNode>
  | JQuerySelectorObject
  | ((idx: number, node: LASTBlockNode) => boolean)
  | undefined;

export interface CommitOptions {
  rebuildIndexes?: boolean;
}

export type MutationOp =
  | {
      kind: 'attr_set';
      targets: LASTBlockId[];
      name: string;
    }
  | {
      kind: 'attr_remove';
      targets: LASTBlockId[];
      name: string;
    }
  | {
      kind: 'prop_set';
      targets: LASTBlockId[];
      name: string;
    }
  | {
      kind: 'style_set';
      targets: LASTBlockId[];
      name: string;
    }
  | {
      kind: 'text_set';
      targets: LASTBlockId[];
    }
  | {
      kind: 'text_replace';
      targets: LASTBlockId[];
      pattern: string;
      flags: string;
    }
  | {
      kind: 'inlines_set';
      targets: LASTBlockId[];
    }
  | {
      kind: 'insert';
      mode: 'append' | 'prepend' | 'before' | 'after' | 'replace';
      targets: LASTBlockId[];
      count: number;
    }
  | {
      kind: 'remove';
      targets: LASTBlockId[];
    }
  | {
      kind: 'detach';
      targets: LASTBlockId[];
    }
  | {
      kind: 'empty';
      targets: LASTBlockId[];
    }
  | {
      kind: 'clone';
      targets: LASTBlockId[];
      deep: boolean;
    }
  | {
      kind: 'scope_replace';
      scopes: LASTScopeId[];
      pattern: string;
      flags: string;
    }
  | {
      kind: 'plugin';
      name: string;
      targets: LASTBlockId[];
      detail?: Record<string, unknown>;
    };

export interface MutationPlan {
  schema: 'LASTMutationPlan';
  version: '1.0.0';
  docId: LASTDocId;
  createdAt: string;
  ops: MutationOp[];
}

export interface ChangeSetItem {
  op: MutationOp['kind'];
  targets: LASTBlockId[];
  detail?: Record<string, unknown>;
}

export interface MutationResult {
  ok: boolean;
  next: LASTModel;
  indexes: LASTIndexes;
  changes: ChangeSetItem[];
  warnings: string[];
}

export interface LASTJQPluginRegistry {
  extend<T extends Record<string, (...args: any[]) => any>>(methods: T): void;
}

export interface LASTJQScopeSelection {
  ids(): string[];
  byBlockId(blockId: LASTBlockId): LASTJQScopeSelection;
  matches(pattern: RegExp): LASTJQScopeSelection;
  replace(find: RegExp, replacement: string | ((match: string, ...groups: string[]) => string)): LASTDollar;
}

export interface LASTJQSelection<TBlock extends LASTBlockNode> {
  get(): TBlock[];
  toArray(): TBlock[];
  ids(): LASTBlockId[];
  length(): number;
  isEmpty(): boolean;
  each(fn: (idx: number, node: TBlock) => void): LASTJQSelection<TBlock>;
  map<R>(fn: (idx: number, node: TBlock) => R): R[];

  find(selector: JQuerySelectorInput): LASTJQSelection<LASTBlockNode>;
  filter(selector: JQuerySelectorInput | ((idx: number, node: TBlock) => boolean)): LASTJQSelection<TBlock>;
  not(selector: JQuerySelectorInput): LASTJQSelection<TBlock>;
  is(selector: JQuerySelectorInput): boolean;
  has(selector: JQuerySelectorInput): LASTJQSelection<TBlock>;

  byType<TType extends TBlock['type']>(...types: TType[]): LASTJQSelection<Extract<TBlock, { type: TType }>>;
  byId(...ids: LASTBlockId[]): LASTJQSelection<TBlock>;
  byBttId(...bttIds: string[]): LASTJQSelection<TBlock>;

  parent(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode>;
  parents(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode>;
  children(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode>;
  descendants(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode>;
  siblings(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode>;
  next(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode>;
  prev(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode>;
  closest(selector: JQuerySelectorInput): LASTJQSelection<LASTBlockNode>;

  eq(index: number): LASTJQSelection<TBlock>;
  first(): LASTJQSelection<TBlock>;
  last(): LASTJQSelection<TBlock>;
  slice(start?: number, end?: number): LASTJQSelection<TBlock>;

  contains(text: string): LASTJQSelection<TBlock>;
  matches(pattern: RegExp): LASTJQSelection<TBlock>;

  text(): string;
  text(value: string | ((idx: number, oldText: string) => string)): LASTJQSelection<TBlock>;
  replaceText(
    pattern: RegExp,
    replacement: string | ((match: string, ...groups: string[]) => string),
  ): LASTJQSelection<TBlock>;

  inlines(): LASTInlineNode[];
  inlines(
    value: LASTInlineNode[] | ((idx: number, oldInlines: LASTInlineNode[]) => LASTInlineNode[]),
  ): LASTJQSelection<TBlock>;

  attr(name: string): unknown;
  attr(name: string, value: unknown | ((idx: number, oldValue: unknown) => unknown)): LASTJQSelection<TBlock>;
  removeAttr(name: string): LASTJQSelection<TBlock>;

  prop(name: string): unknown;
  prop(name: string, value: unknown | ((idx: number, oldValue: unknown) => unknown)): LASTJQSelection<TBlock>;

  css(name: string): unknown;
  css(name: string, value: unknown | ((idx: number, oldValue: unknown) => unknown)): LASTJQSelection<TBlock>;
  css(patch: Record<string, unknown>): LASTJQSelection<TBlock>;

  append(node: LASTBlockNode | LASTBlockNode[]): LASTJQSelection<TBlock>;
  prepend(node: LASTBlockNode | LASTBlockNode[]): LASTJQSelection<TBlock>;
  before(node: LASTBlockNode | LASTBlockNode[]): LASTJQSelection<TBlock>;
  after(node: LASTBlockNode | LASTBlockNode[]): LASTJQSelection<TBlock>;
  replaceWith(node: LASTBlockNode | LASTBlockNode[]): LASTJQSelection<TBlock>;
  remove(): LASTJQSelection<TBlock>;
  empty(): LASTJQSelection<TBlock>;

  clone(deep?: boolean): LASTJQSelection<TBlock>;
  detach(): LASTJQSelection<TBlock>;
}

export interface LASTDollar {
  <TBlock extends LASTBlockNode = LASTBlockNode>(selector?: JQuerySelectorInput): LASTJQSelection<TBlock>;
  readonly model: LASTModel;
  readonly fn: LASTJQPluginRegistry;

  begin(): LASTDollar;
  plan(): MutationPlan;
  commit(options?: CommitOptions): MutationResult;
  rollback(): LASTDollar;

  byScope(selector?: { blockId?: LASTBlockId; pattern?: RegExp }): LASTJQScopeSelection;
}

export interface CreateLASTDollarOptions {
  rebuildIndexesOnCommit?: boolean;
}

interface LASTDollarHooks {
  beforeCommit?(plan: MutationPlan): void;
  afterCommit?(result: MutationResult): void;
  onError?(error: Error): void;
}

interface State {
  original: LASTModel;
  model: LASTModel;
  checkpoint: LASTModel | null;
  stagedOps: MutationOp[];
  warnings: string[];
  active: boolean;
  hooks?: LASTDollarHooks;
  nextBlockCounter: number;
  nextInlineCounter: number;
}

interface Context {
  state: State;
  defaultRebuildIndexesOnCommit: boolean;
}

type Matcher<TBlock extends LASTBlockNode = LASTBlockNode> = (node: TBlock, idx: number) => boolean;
type LASTTextRunInline = Extract<LASTInlineNode, { kind: 'text_run' }>;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isDocument(model: LASTModel): model is LASTDocument {
  return !('mode' in model && model.mode === 'fragment');
}

function isTextualBlockNode(block: LASTBlockNode): block is LASTTextualBlock<LASTTextualBlockType> {
  return LAST_TEXTUAL_BLOCK_TYPE_SET.has(block.type as LASTTextualBlockType);
}

function getTopLevelBlockIds(model: LASTModel): LASTBlockId[] {
  if (!isDocument(model)) {
    return [...model.topLevel];
  }
  const root = model.blocks[model.rootId];
  return root ? [...root.children] : [];
}

function setTopLevelBlockIds(model: LASTModel, ids: LASTBlockId[]): void {
  if (!isDocument(model)) {
    model.topLevel = [...ids];
    return;
  }
  const root = model.blocks[model.rootId];
  if (!root) return;
  root.children = [...ids];
}

function parseNumericSuffix(value: string, prefix: string): number {
  if (!value.startsWith(prefix)) return 0;
  const n = Number(value.slice(prefix.length));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function seedNextCounters(model: LASTModel): { block: number; inline: number } {
  let maxBlock = 0;
  let maxInline = 0;

  for (const block of Object.values(model.blocks)) {
    maxBlock = Math.max(maxBlock, parseNumericSuffix(block.id, 'b_'));
    if (!isTextualBlockNode(block)) continue;
    for (const inline of block.payload.inlines) {
      maxInline = Math.max(maxInline, parseNumericSuffix(inline.id, 'i_'));
    }
  }

  return {
    block: maxBlock + 1,
    inline: maxInline + 1,
  };
}

function nextBlockId(state: State): LASTBlockId {
  let candidate = `b_${state.nextBlockCounter}` as LASTBlockId;
  while (state.model.blocks[candidate]) {
    state.nextBlockCounter += 1;
    candidate = `b_${state.nextBlockCounter}` as LASTBlockId;
  }
  state.nextBlockCounter += 1;
  return candidate;
}

function nextInlineId(state: State): LASTInlineId {
  const id = `i_${state.nextInlineCounter}` as LASTInlineId;
  state.nextInlineCounter += 1;
  return id;
}

function toSearchText(inline: LASTInlineNode): { text: string; editable: boolean } {
  switch (inline.kind) {
    case 'text_run':
      return { text: inline.text ?? '', editable: true };
    case 'mention_user':
      return { text: inline.userId ?? '', editable: false };
    case 'equation':
      return { text: inline.latex ?? '', editable: false };
    case 'mention_doc':
      return { text: inline.title ?? '', editable: false };
    case 'link_preview':
      return { text: inline.title ?? inline.url ?? '', editable: false };
    case 'reminder':
    case 'inline_block':
    case 'inline_file':
      return { text: '', editable: false };
    default:
      return { text: '', editable: false };
  }
}

function blockText(block: LASTBlockNode): string {
  if (!isTextualBlockNode(block)) return '';
  let out = '';
  for (const inline of block.payload.inlines) {
    out += toSearchText(inline).text;
  }
  return out;
}

function regexTest(text: string, pattern: RegExp): boolean {
  const probe = new RegExp(pattern.source, pattern.flags);
  return probe.test(text);
}

function buildScopeForTopLevelTextBlock(
  scopeId: LASTScopeId,
  block: LASTTextualBlock<LASTTextualBlockType>,
): LASTTextScope {
  let normalizedText = '';
  const segments: LASTTextSegment[] = [];

  for (const inline of block.payload.inlines) {
    const projection = toSearchText(inline);
    if (projection.text.length === 0) continue;

    const from = normalizedText.length;
    normalizedText += projection.text;
    const to = normalizedText.length;

    segments.push({
      inlineId: inline.id,
      inlineKind: inline.kind,
      from,
      to,
      editable: projection.editable,
    });
  }

  return {
    id: scopeId,
    blockId: block.id,
    blockType: block.type,
    normalizedText,
    segments,
  };
}

export function rebuildLASTIndexes(model: LASTModel): LASTIndexes {
  const byType: LASTIndexes['byType'] = {};
  for (const block of Object.values(model.blocks)) {
    const ids = byType[block.type] ?? [];
    ids.push(block.id);
    byType[block.type] = ids;
  }

  const textScopes: Record<LASTScopeId, LASTTextScope> = {};
  const textScopeByBlockId: Partial<Record<LASTBlockId, LASTScopeId>> = {};

  let scopeCounter = 1;
  for (const blockId of getTopLevelBlockIds(model)) {
    const block = model.blocks[blockId];
    if (!block || !isTextualBlockNode(block) || block.type === 'page') {
      continue;
    }

    const scopeId = `scope_${scopeCounter}` as LASTScopeId;
    scopeCounter += 1;

    const scope = buildScopeForTopLevelTextBlock(scopeId, block);
    textScopes[scopeId] = scope;
    textScopeByBlockId[block.id] = scopeId;
  }

  return {
    byType,
    textScopes,
    textScopeByBlockId,
  };
}

function ensureIndexes(state: State): void {
  state.model.indexes = rebuildLASTIndexes(state.model);
}

function ensureTxn(state: State): void {
  if (state.active) return;
  state.checkpoint = deepClone(state.model);
  state.stagedOps = [];
  state.warnings = [];
  state.active = true;
}

function uniqueOrdered(ids: LASTBlockId[]): LASTBlockId[] {
  const seen = new Set<LASTBlockId>();
  const out: LASTBlockId[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function matcherFromSelector(input: JQuerySelectorInput): Matcher<LASTBlockNode> {
  if (input === undefined) {
    return () => true;
  }

  if (typeof input === 'function') {
    return (node, idx) => input(idx, node);
  }

  if (typeof input === 'string') {
    const raw = input.trim();
    if (!raw || raw === '*') {
      return () => true;
    }

    const tokens = raw
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x.length > 0);

    const predicates = tokens.map((token) => {
      if (token === '*') {
        return (_node: LASTBlockNode) => true;
      }
      if (token.startsWith('#')) {
        const id = token.slice(1) as LASTBlockId;
        return (node: LASTBlockNode) => node.id === id;
      }
      const attrMatch = token.match(/^\[([^=\]]+)(?:=(.+))?\]$/);
      if (attrMatch) {
        const key = attrMatch[1]?.trim() ?? '';
        const rawValue = attrMatch[2]?.trim();
        const expected = rawValue ? stripQuotes(rawValue) : undefined;
        return (node: LASTBlockNode) => {
          const value = getPathValue(node, key);
          if (expected === undefined) return value !== undefined;
          return String(value) === expected;
        };
      }
      return (node: LASTBlockNode) => node.type === token;
    });

    return (node) => predicates.some((p) => p(node));
  }

  if (isSelectionLike(input)) {
    const ids = new Set(input.ids());
    return (node) => ids.has(node.id);
  }

  if (isBlockNode(input)) {
    return (node) => node.id === input.id;
  }

  const descriptor = input as JQuerySelectorObject;
  return (node) => {
    if (descriptor.ids && !descriptor.ids.includes(node.id)) return false;
    if (descriptor.types && !descriptor.types.includes(node.type)) return false;
    if (descriptor.bttIds && !descriptor.bttIds.includes(node.bttId ?? '')) return false;

    if (descriptor.attrs) {
      for (const [k, v] of Object.entries(descriptor.attrs)) {
        const current = getPathValue(node, k);
        if (current !== v) return false;
      }
    }

    if (descriptor.hasText !== undefined) {
      const text = blockText(node);
      if (typeof descriptor.hasText === 'string') {
        if (!text.includes(descriptor.hasText)) return false;
      } else if (!regexTest(text, descriptor.hasText)) {
        return false;
      }
    }

    return true;
  };
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function isSelectionLike(value: unknown): value is LASTJQSelection<LASTBlockNode> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ids' in value &&
    typeof (value as { ids?: unknown }).ids === 'function'
  );
}

function isBlockNode(value: unknown): value is LASTBlockNode {
  return typeof value === 'object' && value !== null && 'id' in value && 'type' in value && 'children' in value;
}

function getPathValue(target: unknown, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split('.').filter((x) => x.length > 0);
  let current: unknown = target;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function setPathValue(target: unknown, path: string, value: unknown): void {
  const parts = path.split('.').filter((x) => x.length > 0);
  if (parts.length === 0 || typeof target !== 'object' || target === null) return;

  let cursor = target as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!key) continue;
    const current = cursor[key];
    if (typeof current === 'object' && current !== null) {
      cursor = current as Record<string, unknown>;
      continue;
    }
    const next: Record<string, unknown> = {};
    cursor[key] = next;
    cursor = next;
  }

  const tail = parts[parts.length - 1];
  if (!tail) return;
  cursor[tail] = value;
}

function deletePathValue(target: unknown, path: string): void {
  const parts = path.split('.').filter((x) => x.length > 0);
  if (parts.length === 0 || typeof target !== 'object' || target === null) return;

  let cursor = target as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!key) return;
    const current = cursor[key];
    if (typeof current !== 'object' || current === null) {
      return;
    }
    cursor = current as Record<string, unknown>;
  }

  const tail = parts[parts.length - 1];
  if (!tail) return;
  delete cursor[tail];
}

function getSiblingContext(model: LASTModel, block: LASTBlockNode): { list: LASTBlockId[]; index: number } | null {
  if (block.parentId) {
    const parent = model.blocks[block.parentId];
    if (!parent) return null;
    const idx = parent.children.indexOf(block.id);
    if (idx < 0) return null;
    return { list: parent.children, index: idx };
  }

  if (isDocument(model)) {
    if (block.id === model.rootId) {
      return null;
    }
    const root = model.blocks[model.rootId];
    if (!root) return null;
    const idx = root.children.indexOf(block.id);
    if (idx < 0) return null;
    return { list: root.children, index: idx };
  }

  const idx = model.topLevel.indexOf(block.id);
  if (idx < 0) return null;
  return { list: model.topLevel, index: idx };
}

function gatherDescendantIds(model: LASTModel, id: LASTBlockId): LASTBlockId[] {
  const out: LASTBlockId[] = [];
  const stack: LASTBlockId[] = [id];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) continue;
    const node = model.blocks[currentId];
    if (!node) continue;

    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      const childId = node.children[i];
      if (!childId) continue;
      out.push(childId);
      stack.push(childId);
    }
  }

  return out;
}

function removeSubtree(model: LASTModel, rootId: LASTBlockId): LASTBlockId[] {
  const removed: LASTBlockId[] = [rootId, ...gatherDescendantIds(model, rootId)];

  const root = model.blocks[rootId];
  if (!root) return [];

  const sibling = getSiblingContext(model, root);
  if (sibling) {
    sibling.list.splice(sibling.index, 1);
  }

  for (const id of removed) {
    delete model.blocks[id];
  }

  return removed;
}

function asNodeList(input: LASTBlockNode | LASTBlockNode[]): LASTBlockNode[] {
  return Array.isArray(input) ? input : [input];
}

function materializeInsertionNodes(
  state: State,
  nodes: LASTBlockNode | LASTBlockNode[],
  parentId: LASTBlockId | null,
): LASTBlockNode[] {
  const out: LASTBlockNode[] = [];
  for (const node of asNodeList(nodes)) {
    const cloned = deepClone(node);
    cloned.id = nextBlockId(state);
    cloned.parentId = parentId;
    cloned.children = [];
    out.push(cloned);
  }
  return out;
}

function textualInlineFromText(state: State, text: string): LASTInlineNode {
  return {
    id: nextInlineId(state),
    kind: 'text_run',
    marks: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      inlineCode: false,
    },
    text,
  };
}

interface TextRunSlice {
  run: LASTTextRunInline;
  text: string;
  start: number;
  end: number;
}

interface TextRunSegment {
  text: string;
  marks: LASTTextRunInline['marks'];
}

interface RegexMatchInfo {
  match: string;
  captures: Array<string | undefined>;
  namedGroups?: Record<string, string>;
  start: number;
  end: number;
}

function advanceStringIndex(input: string, index: number, unicode: boolean): number {
  if (!unicode) return index + 1;
  if (index < 0 || index >= input.length) return index + 1;

  const first = input.charCodeAt(index);
  if (first < 0xd800 || first > 0xdbff || index + 1 >= input.length) {
    return index + 1;
  }

  const second = input.charCodeAt(index + 1);
  if (second < 0xdc00 || second > 0xdfff) {
    return index + 1;
  }
  return index + 2;
}

function collectRegexMatches(text: string, pattern: RegExp, maxMatches = Number.POSITIVE_INFINITY): RegexMatchInfo[] {
  if (maxMatches <= 0) {
    return [];
  }

  const matches: RegexMatchInfo[] = [];
  const flags = pattern.global ? pattern.flags : pattern.flags.replace(/g/g, '');
  const probe = new RegExp(pattern.source, flags);

  if (!pattern.global) {
    const found = probe.exec(text);
    if (!found) return [];
    return [
      {
        match: found[0],
        captures: found.slice(1).map((item) => (item === undefined ? undefined : String(item))),
        ...(found.groups ? { namedGroups: { ...found.groups } } : {}),
        start: found.index,
        end: found.index + found[0].length,
      },
    ];
  }

  while (matches.length < maxMatches) {
    const found = probe.exec(text);
    if (!found) break;

    matches.push({
      match: found[0],
      captures: found.slice(1).map((item) => (item === undefined ? undefined : String(item))),
      ...(found.groups ? { namedGroups: { ...found.groups } } : {}),
      start: found.index,
      end: found.index + found[0].length,
    });

    if (found[0].length === 0) {
      probe.lastIndex = advanceStringIndex(text, probe.lastIndex, probe.unicode);
    }
  }

  return matches;
}

function expandReplacementTemplate(template: string, found: RegexMatchInfo, input: string): string {
  let out = '';

  for (let i = 0; i < template.length; i += 1) {
    const ch = template[i];
    if (ch !== '$' || i + 1 >= template.length) {
      out += ch;
      continue;
    }

    const next = template[i + 1] ?? '';
    if (next === '$') {
      out += '$';
      i += 1;
      continue;
    }
    if (next === '&') {
      out += found.match;
      i += 1;
      continue;
    }
    if (next === '`') {
      out += input.slice(0, found.start);
      i += 1;
      continue;
    }
    if (next === "'") {
      out += input.slice(found.end);
      i += 1;
      continue;
    }
    if (next === '<') {
      const close = template.indexOf('>', i + 2);
      if (close < 0) {
        out += '$<';
        i += 1;
        continue;
      }
      const name = template.slice(i + 2, close);
      if (found.namedGroups) {
        out += found.namedGroups[name] ?? '';
      } else {
        out += `$<${name}>`;
      }
      i = close;
      continue;
    }

    if (next >= '0' && next <= '9') {
      let consumed = 1;
      let captureText: string | null = null;

      if (next !== '0') {
        const one = Number(next);
        const next2 = template[i + 2];

        if (next2 && next2 >= '0' && next2 <= '9') {
          const two = Number(`${next}${next2}`);
          if (two > 0 && two <= found.captures.length) {
            captureText = found.captures[two - 1] ?? '';
            consumed = 2;
          }
        }

        if (captureText === null && one > 0 && one <= found.captures.length) {
          captureText = found.captures[one - 1] ?? '';
          consumed = 1;
        }
      }

      if (captureText !== null) {
        out += captureText;
      } else {
        out += `$${next}`;
      }
      i += consumed;
      continue;
    }

    out += `$${next}`;
    i += 1;
  }

  return out;
}

function resolveReplacementText(
  source: string,
  found: RegexMatchInfo,
  replacement: string | ((match: string, ...groups: string[]) => string),
): string {
  if (typeof replacement === 'function') {
    const callback = replacement as unknown as (...args: unknown[]) => string;
    const args: unknown[] = [found.match, ...found.captures, found.start, source];
    if (found.namedGroups) {
      args.push(found.namedGroups);
    }
    return String(callback(...args));
  }
  return expandReplacementTemplate(replacement, found, source);
}

function marksEqual(a: LASTTextRunInline['marks'], b: LASTTextRunInline['marks']): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function marksAtIndex(slices: TextRunSlice[], index: number): LASTTextRunInline['marks'] {
  if (slices.length === 0) {
    return {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      inlineCode: false,
    };
  }

  for (const slice of slices) {
    if (index >= slice.start && index < slice.end) {
      return deepClone(slice.run.marks);
    }
  }

  const first = slices[0];
  if (!first) {
    return {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      inlineCode: false,
    };
  }

  if (index <= first.start) {
    return deepClone(first.run.marks);
  }

  const last = slices[slices.length - 1];
  if (!last) {
    return deepClone(first.run.marks);
  }
  return deepClone(last.run.marks);
}

function appendSourceSegments(slices: TextRunSlice[], from: number, to: number, out: TextRunSegment[]): void {
  if (to <= from) return;
  for (const slice of slices) {
    const left = Math.max(from, slice.start);
    const right = Math.min(to, slice.end);
    if (left >= right) continue;

    const part = slice.text.slice(left - slice.start, right - slice.start);
    if (part.length === 0) continue;
    out.push({
      text: part,
      marks: deepClone(slice.run.marks),
    });
  }
}

function mergeSegments(segments: TextRunSegment[]): TextRunSegment[] {
  const out: TextRunSegment[] = [];
  for (const segment of segments) {
    if (segment.text.length === 0) continue;
    const prev = out[out.length - 1];
    if (prev && marksEqual(prev.marks, segment.marks)) {
      prev.text += segment.text;
      continue;
    }
    out.push({
      text: segment.text,
      marks: deepClone(segment.marks),
    });
  }
  return out;
}

function replaceTextRunCluster(
  state: State,
  cluster: LASTTextRunInline[],
  pattern: RegExp,
  replacement: string | ((match: string, ...groups: string[]) => string),
  maxMatches: number,
): { changed: boolean; matchCount: number; inlines: LASTInlineNode[] } {
  if (maxMatches <= 0) {
    return {
      changed: false,
      matchCount: 0,
      inlines: cluster.map((inline) => deepClone(inline)),
    };
  }

  const slices: TextRunSlice[] = [];
  let cursor = 0;
  for (const run of cluster) {
    const text = run.text ?? '';
    slices.push({
      run,
      text,
      start: cursor,
      end: cursor + text.length,
    });
    cursor += text.length;
  }

  const source = slices.map((slice) => slice.text).join('');
  if (source.length === 0) {
    return {
      changed: false,
      matchCount: 0,
      inlines: cluster.map((inline) => deepClone(inline)),
    };
  }

  const matches = collectRegexMatches(source, pattern, maxMatches);
  if (matches.length === 0) {
    return {
      changed: false,
      matchCount: 0,
      inlines: cluster.map((inline) => deepClone(inline)),
    };
  }

  const segments: TextRunSegment[] = [];
  let consumed = 0;

  for (const found of matches) {
    if (found.start < consumed) {
      continue;
    }

    appendSourceSegments(slices, consumed, found.start, segments);

    const nextText = resolveReplacementText(source, found, replacement);
    if (nextText.length > 0) {
      segments.push({
        text: nextText,
        marks: marksAtIndex(slices, found.start),
      });
    }

    consumed = found.end;
  }

  appendSourceSegments(slices, consumed, source.length, segments);
  const merged = mergeSegments(segments);
  const nextText = merged.map((item) => item.text).join('');

  if (nextText === source) {
    return {
      changed: false,
      matchCount: 0,
      inlines: cluster.map((inline) => deepClone(inline)),
    };
  }

  const inlines: LASTInlineNode[] = merged.map((segment) => ({
    id: nextInlineId(state),
    kind: 'text_run',
    marks: deepClone(segment.marks),
    text: segment.text,
  }));

  return {
    changed: true,
    matchCount: matches.length,
    inlines,
  };
}

function applyScopeReplaceToBlock(
  state: State,
  block: LASTTextualBlock<LASTTextualBlockType>,
  pattern: RegExp,
  replacement: string | ((match: string, ...groups: string[]) => string),
): boolean {
  const sourceInlines = block.payload.inlines;
  const nextInlines: LASTInlineNode[] = [];
  let changed = false;
  let remaining = pattern.global ? Number.POSITIVE_INFINITY : 1;
  let cluster: LASTTextRunInline[] = [];

  const flushCluster = (): void => {
    if (cluster.length === 0) return;

    if (remaining <= 0) {
      nextInlines.push(...cluster.map((inline) => deepClone(inline)));
      cluster = [];
      return;
    }

    const result = replaceTextRunCluster(state, cluster, pattern, replacement, remaining);
    nextInlines.push(...result.inlines);
    if (result.changed) {
      changed = true;
    }
    if (Number.isFinite(remaining)) {
      remaining -= result.matchCount;
    }
    cluster = [];
  };

  for (const inline of sourceInlines) {
    if (inline.kind === 'text_run') {
      cluster.push(inline);
      continue;
    }
    flushCluster();
    nextInlines.push(deepClone(inline));
  }

  flushCluster();
  if (!changed) {
    return false;
  }

  block.payload.inlines = nextInlines;
  return true;
}

class LASTJQSelectionImpl<TBlock extends LASTBlockNode> implements LASTJQSelection<TBlock> {
  protected readonly ctx: Context;
  protected readonly selectedIds: LASTBlockId[];

  constructor(ctx: Context, ids: LASTBlockId[]) {
    this.ctx = ctx;
    this.selectedIds = uniqueOrdered(ids);
  }

  private create<UBlock extends LASTBlockNode>(ids: LASTBlockId[]): LASTJQSelection<UBlock> {
    return new LASTJQSelectionImpl<UBlock>(this.ctx, ids);
  }

  private nodesTyped(): TBlock[] {
    const out: TBlock[] = [];
    for (const id of this.selectedIds) {
      const node = this.ctx.state.model.blocks[id];
      if (!node) continue;
      out.push(node as TBlock);
    }
    return out;
  }

  private filteredIds(selector?: JQuerySelectorInput): LASTBlockId[] {
    const matcher = matcherFromSelector(selector);
    const out: LASTBlockId[] = [];

    this.nodesTyped().forEach((node, idx) => {
      if (matcher(node as LASTBlockNode, idx)) {
        out.push(node.id);
      }
    });

    return out;
  }

  get(): TBlock[] {
    return this.nodesTyped();
  }

  toArray(): TBlock[] {
    return this.get();
  }

  ids(): LASTBlockId[] {
    return [...this.selectedIds];
  }

  length(): number {
    return this.get().length;
  }

  isEmpty(): boolean {
    return this.length() === 0;
  }

  each(fn: (idx: number, node: TBlock) => void): LASTJQSelection<TBlock> {
    this.get().forEach((node, idx) => fn(idx, node));
    return this;
  }

  map<R>(fn: (idx: number, node: TBlock) => R): R[] {
    return this.get().map((node, idx) => fn(idx, node));
  }

  find(selector: JQuerySelectorInput): LASTJQSelection<LASTBlockNode> {
    const matcher = matcherFromSelector(selector);
    const model = this.ctx.state.model;
    const out: LASTBlockId[] = [];

    for (const id of this.selectedIds) {
      const descendants = gatherDescendantIds(model, id);
      for (const descendantId of descendants) {
        const node = model.blocks[descendantId];
        if (!node) continue;
        if (matcher(node, out.length)) {
          out.push(descendantId);
        }
      }
    }

    return this.create<LASTBlockNode>(out);
  }

  filter(selector: JQuerySelectorInput | ((idx: number, node: TBlock) => boolean)): LASTJQSelection<TBlock> {
    if (typeof selector === 'function') {
      const ids = this.get()
        .filter((node, idx) => selector(idx, node))
        .map((node) => node.id);
      return this.create<TBlock>(ids);
    }
    return this.create<TBlock>(this.filteredIds(selector));
  }

  not(selector: JQuerySelectorInput): LASTJQSelection<TBlock> {
    const matcher = matcherFromSelector(selector);
    const ids = this.get()
      .filter((node, idx) => !matcher(node as LASTBlockNode, idx))
      .map((node) => node.id);
    return this.create<TBlock>(ids);
  }

  is(selector: JQuerySelectorInput): boolean {
    const matcher = matcherFromSelector(selector);
    return this.get().some((node, idx) => matcher(node as LASTBlockNode, idx));
  }

  has(selector: JQuerySelectorInput): LASTJQSelection<TBlock> {
    const matcher = matcherFromSelector(selector);
    const model = this.ctx.state.model;
    const ids: LASTBlockId[] = [];

    for (const id of this.selectedIds) {
      const descendantIds = gatherDescendantIds(model, id);
      let matched = false;
      for (const descendantId of descendantIds) {
        const node = model.blocks[descendantId];
        if (!node) continue;
        if (matcher(node, 0)) {
          matched = true;
          break;
        }
      }
      if (matched) {
        ids.push(id);
      }
    }

    return this.create<TBlock>(ids);
  }

  byType<TType extends TBlock['type']>(...types: TType[]): LASTJQSelection<Extract<TBlock, { type: TType }>> {
    const set = new Set(types);
    const ids = this.get()
      .filter((node) => set.has(node.type as TType))
      .map((node) => node.id);
    return this.create<Extract<TBlock, { type: TType }>>(ids);
  }

  byId(...ids: LASTBlockId[]): LASTJQSelection<TBlock> {
    const set = new Set(ids);
    const out = this.selectedIds.filter((id) => set.has(id));
    return this.create<TBlock>(out);
  }

  byBttId(...bttIds: string[]): LASTJQSelection<TBlock> {
    const set = new Set(bttIds);
    const out = this.get()
      .filter((node) => set.has(node.bttId ?? ''))
      .map((node) => node.id);
    return this.create<TBlock>(out);
  }

  parent(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode> {
    const parents: LASTBlockId[] = [];
    for (const node of this.get()) {
      if (node.parentId) {
        parents.push(node.parentId);
      } else if (isDocument(this.ctx.state.model)) {
        const doc = this.ctx.state.model;
        if (node.id !== doc.rootId) {
          parents.push(doc.rootId);
        }
      }
    }
    return this.create<LASTBlockNode>(parents).filter(selector);
  }

  parents(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode> {
    const model = this.ctx.state.model;
    const out: LASTBlockId[] = [];

    for (const node of this.get()) {
      let cursor = node.parentId;
      while (cursor) {
        out.push(cursor);
        const parent = model.blocks[cursor];
        cursor = parent?.parentId ?? null;
      }
      if (!node.parentId && isDocument(model) && node.id !== model.rootId) {
        out.push(model.rootId);
      }
    }

    return this.create<LASTBlockNode>(out).filter(selector);
  }

  children(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode> {
    const out: LASTBlockId[] = [];
    for (const node of this.get()) {
      out.push(...node.children);
    }
    return this.create<LASTBlockNode>(out).filter(selector);
  }

  descendants(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode> {
    const model = this.ctx.state.model;
    const out: LASTBlockId[] = [];

    for (const id of this.selectedIds) {
      out.push(...gatherDescendantIds(model, id));
    }

    return this.create<LASTBlockNode>(out).filter(selector);
  }

  siblings(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode> {
    const model = this.ctx.state.model;
    const out: LASTBlockId[] = [];

    for (const node of this.get()) {
      const ctx = getSiblingContext(model, node);
      if (!ctx) continue;
      for (const siblingId of ctx.list) {
        if (siblingId === node.id) continue;
        out.push(siblingId);
      }
    }

    return this.create<LASTBlockNode>(out).filter(selector);
  }

  next(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode> {
    const model = this.ctx.state.model;
    const out: LASTBlockId[] = [];

    for (const node of this.get()) {
      const sibling = getSiblingContext(model, node);
      if (!sibling) continue;
      const candidate = sibling.list[sibling.index + 1];
      if (candidate) out.push(candidate);
    }

    return this.create<LASTBlockNode>(out).filter(selector);
  }

  prev(selector?: JQuerySelectorInput): LASTJQSelection<LASTBlockNode> {
    const model = this.ctx.state.model;
    const out: LASTBlockId[] = [];

    for (const node of this.get()) {
      const sibling = getSiblingContext(model, node);
      if (!sibling) continue;
      const candidate = sibling.list[sibling.index - 1];
      if (candidate) out.push(candidate);
    }

    return this.create<LASTBlockNode>(out).filter(selector);
  }

  closest(selector: JQuerySelectorInput): LASTJQSelection<LASTBlockNode> {
    const matcher = matcherFromSelector(selector);
    const model = this.ctx.state.model;
    const out: LASTBlockId[] = [];

    for (const node of this.get()) {
      let cursor: LASTBlockNode | undefined = node;
      while (cursor) {
        if (matcher(cursor, 0)) {
          out.push(cursor.id);
          break;
        }
        if (!cursor.parentId) {
          if (isDocument(model) && cursor.id !== model.rootId) {
            cursor = model.blocks[model.rootId];
            continue;
          }
          break;
        }
        cursor = model.blocks[cursor.parentId];
      }
    }

    return this.create<LASTBlockNode>(out);
  }

  eq(index: number): LASTJQSelection<TBlock> {
    const arr = this.get();
    const normalized = index >= 0 ? index : arr.length + index;
    if (normalized < 0 || normalized >= arr.length) {
      return this.create<TBlock>([]);
    }
    const node = arr[normalized];
    if (!node) {
      return this.create<TBlock>([]);
    }
    return this.create<TBlock>([node.id]);
  }

  first(): LASTJQSelection<TBlock> {
    return this.eq(0);
  }

  last(): LASTJQSelection<TBlock> {
    return this.eq(-1);
  }

  slice(start?: number, end?: number): LASTJQSelection<TBlock> {
    const ids = this.get()
      .slice(start, end)
      .map((node) => node.id);
    return this.create<TBlock>(ids);
  }

  contains(text: string): LASTJQSelection<TBlock> {
    const ids = this.get()
      .filter((node) => blockText(node).includes(text))
      .map((node) => node.id);
    return this.create<TBlock>(ids);
  }

  matches(pattern: RegExp): LASTJQSelection<TBlock> {
    const ids = this.get()
      .filter((node) => regexTest(blockText(node), pattern))
      .map((node) => node.id);
    return this.create<TBlock>(ids);
  }

  text(): string;
  text(value: string | ((idx: number, oldText: string) => string)): LASTJQSelection<TBlock>;
  text(value?: string | ((idx: number, oldText: string) => string)): string | LASTJQSelection<TBlock> {
    const nodes = this.get();

    if (value === undefined) {
      return nodes.map((node) => blockText(node)).join('');
    }

    ensureTxn(this.ctx.state);

    nodes.forEach((node, idx) => {
      if (!isTextualBlockNode(node)) return;
      const old = blockText(node);
      const next = typeof value === 'function' ? value(idx, old) : value;
      node.payload.inlines = next.length === 0 ? [] : [textualInlineFromText(this.ctx.state, next)];
    });

    this.ctx.state.stagedOps.push({
      kind: 'text_set',
      targets: nodes.map((n) => n.id),
    });
    ensureIndexes(this.ctx.state);

    return this;
  }

  replaceText(
    pattern: RegExp,
    replacement: string | ((match: string, ...groups: string[]) => string),
  ): LASTJQSelection<TBlock> {
    const nodes = this.get();
    ensureTxn(this.ctx.state);

    for (const node of nodes) {
      if (!isTextualBlockNode(node)) continue;
      applyScopeReplaceToBlock(this.ctx.state, node, pattern, replacement);
    }

    this.ctx.state.stagedOps.push({
      kind: 'text_replace',
      targets: nodes.map((n) => n.id),
      pattern: pattern.source,
      flags: pattern.flags,
    });
    ensureIndexes(this.ctx.state);

    return this;
  }

  inlines(): LASTInlineNode[];
  inlines(
    value: LASTInlineNode[] | ((idx: number, oldInlines: LASTInlineNode[]) => LASTInlineNode[]),
  ): LASTJQSelection<TBlock>;
  inlines(
    value?: LASTInlineNode[] | ((idx: number, oldInlines: LASTInlineNode[]) => LASTInlineNode[]),
  ): LASTInlineNode[] | LASTJQSelection<TBlock> {
    const nodes = this.get();

    if (value === undefined) {
      const out: LASTInlineNode[] = [];
      for (const node of nodes) {
        if (!isTextualBlockNode(node)) continue;
        out.push(...node.payload.inlines);
      }
      return out;
    }

    ensureTxn(this.ctx.state);

    nodes.forEach((node, idx) => {
      if (!isTextualBlockNode(node)) return;
      const old = node.payload.inlines;
      const nextRaw = typeof value === 'function' ? value(idx, old) : value;
      node.payload.inlines = nextRaw.map((inline) => {
        const cloned = deepClone(inline);
        if (!cloned.id) {
          cloned.id = nextInlineId(this.ctx.state);
        }
        return cloned;
      });
    });

    this.ctx.state.stagedOps.push({
      kind: 'inlines_set',
      targets: nodes.map((n) => n.id),
    });
    ensureIndexes(this.ctx.state);

    return this;
  }

  attr(name: string): unknown;
  attr(name: string, value: unknown | ((idx: number, oldValue: unknown) => unknown)): LASTJQSelection<TBlock>;
  attr(
    name: string,
    value?: unknown | ((idx: number, oldValue: unknown) => unknown),
  ): unknown | LASTJQSelection<TBlock> {
    const nodes = this.get();
    const first = nodes[0];

    if (value === undefined) {
      return first ? getPathValue(first, `selector.attrs.${name}`) : undefined;
    }

    ensureTxn(this.ctx.state);

    nodes.forEach((node, idx) => {
      const oldValue = getPathValue(node, `selector.attrs.${name}`);
      const nextValue = typeof value === 'function' ? value(idx, oldValue) : value;
      if (!node.selector) {
        node.selector = {};
      }
      if (!node.selector.attrs) {
        node.selector.attrs = {};
      }
      node.selector.attrs[name] = nextValue as any;
    });

    this.ctx.state.stagedOps.push({
      kind: 'attr_set',
      targets: nodes.map((n) => n.id),
      name,
    });

    return this;
  }

  removeAttr(name: string): LASTJQSelection<TBlock> {
    const nodes = this.get();
    ensureTxn(this.ctx.state);

    nodes.forEach((node) => {
      if (!node.selector?.attrs) return;
      delete node.selector.attrs[name];
      if (Object.keys(node.selector.attrs).length === 0) {
        delete node.selector.attrs;
      }
      if (Object.keys(node.selector).length === 0) {
        delete node.selector;
      }
    });

    this.ctx.state.stagedOps.push({
      kind: 'attr_remove',
      targets: nodes.map((n) => n.id),
      name,
    });

    return this;
  }

  prop(name: string): unknown;
  prop(name: string, value: unknown | ((idx: number, oldValue: unknown) => unknown)): LASTJQSelection<TBlock>;
  prop(
    name: string,
    value?: unknown | ((idx: number, oldValue: unknown) => unknown),
  ): unknown | LASTJQSelection<TBlock> {
    const nodes = this.get();
    const first = nodes[0];

    if (value === undefined) {
      return first ? getPathValue(first, name) : undefined;
    }

    ensureTxn(this.ctx.state);

    nodes.forEach((node, idx) => {
      const oldValue = getPathValue(node, name);
      const nextValue = typeof value === 'function' ? value(idx, oldValue) : value;
      setPathValue(node, name, nextValue);
    });

    this.ctx.state.stagedOps.push({
      kind: 'prop_set',
      targets: nodes.map((n) => n.id),
      name,
    });

    return this;
  }

  css(name: string): unknown;
  css(name: string, value: unknown | ((idx: number, oldValue: unknown) => unknown)): LASTJQSelection<TBlock>;
  css(patch: Record<string, unknown>): LASTJQSelection<TBlock>;
  css(
    nameOrPatch: string | Record<string, unknown>,
    value?: unknown | ((idx: number, oldValue: unknown) => unknown),
  ): unknown | LASTJQSelection<TBlock> {
    const nodes = this.get();
    const first = nodes[0];

    if (typeof nameOrPatch === 'string' && value === undefined) {
      if (!first || !isTextualBlockNode(first)) return undefined;
      return getPathValue(first.payload.style, nameOrPatch);
    }

    ensureTxn(this.ctx.state);

    if (typeof nameOrPatch === 'string') {
      nodes.forEach((node, idx) => {
        if (!isTextualBlockNode(node)) return;
        const oldValue = getPathValue(node.payload.style, nameOrPatch);
        const nextValue = typeof value === 'function' ? value(idx, oldValue) : value;
        setPathValue(node.payload.style, nameOrPatch, nextValue);
      });

      this.ctx.state.stagedOps.push({
        kind: 'style_set',
        targets: nodes.map((n) => n.id),
        name: nameOrPatch,
      });
      ensureIndexes(this.ctx.state);
      return this;
    }

    const patch = nameOrPatch;
    nodes.forEach((node) => {
      if (!isTextualBlockNode(node)) return;
      for (const [k, v] of Object.entries(patch)) {
        setPathValue(node.payload.style, k, v);
      }
    });

    this.ctx.state.stagedOps.push({
      kind: 'style_set',
      targets: nodes.map((n) => n.id),
      name: '[patch]',
    });
    ensureIndexes(this.ctx.state);

    return this;
  }

  append(node: LASTBlockNode | LASTBlockNode[]): LASTJQSelection<TBlock> {
    const targets = this.get();
    ensureTxn(this.ctx.state);

    for (const target of targets) {
      const inserted = materializeInsertionNodes(this.ctx.state, node, target.id);
      for (const child of inserted) {
        this.ctx.state.model.blocks[child.id] = child;
        target.children.push(child.id);
      }
    }

    this.ctx.state.stagedOps.push({
      kind: 'insert',
      mode: 'append',
      targets: targets.map((x) => x.id),
      count: asNodeList(node).length,
    });
    ensureIndexes(this.ctx.state);

    return this;
  }

  prepend(node: LASTBlockNode | LASTBlockNode[]): LASTJQSelection<TBlock> {
    const targets = this.get();
    ensureTxn(this.ctx.state);

    for (const target of targets) {
      const inserted = materializeInsertionNodes(this.ctx.state, node, target.id);
      for (const child of inserted) {
        this.ctx.state.model.blocks[child.id] = child;
      }
      target.children = [...inserted.map((x) => x.id), ...target.children];
    }

    this.ctx.state.stagedOps.push({
      kind: 'insert',
      mode: 'prepend',
      targets: targets.map((x) => x.id),
      count: asNodeList(node).length,
    });
    ensureIndexes(this.ctx.state);

    return this;
  }

  before(node: LASTBlockNode | LASTBlockNode[]): LASTJQSelection<TBlock> {
    const targets = this.get();
    ensureTxn(this.ctx.state);

    for (const target of targets) {
      const sibling = getSiblingContext(this.ctx.state.model, target);
      if (!sibling) continue;
      const parentId = target.parentId;
      const inserted = materializeInsertionNodes(this.ctx.state, node, parentId);
      for (const n of inserted) {
        this.ctx.state.model.blocks[n.id] = n;
      }
      sibling.list.splice(sibling.index, 0, ...inserted.map((x) => x.id));
    }

    this.ctx.state.stagedOps.push({
      kind: 'insert',
      mode: 'before',
      targets: targets.map((x) => x.id),
      count: asNodeList(node).length,
    });
    ensureIndexes(this.ctx.state);

    return this;
  }

  after(node: LASTBlockNode | LASTBlockNode[]): LASTJQSelection<TBlock> {
    const targets = this.get();
    ensureTxn(this.ctx.state);

    for (const target of targets) {
      const sibling = getSiblingContext(this.ctx.state.model, target);
      if (!sibling) continue;
      const parentId = target.parentId;
      const inserted = materializeInsertionNodes(this.ctx.state, node, parentId);
      for (const n of inserted) {
        this.ctx.state.model.blocks[n.id] = n;
      }
      sibling.list.splice(sibling.index + 1, 0, ...inserted.map((x) => x.id));
    }

    this.ctx.state.stagedOps.push({
      kind: 'insert',
      mode: 'after',
      targets: targets.map((x) => x.id),
      count: asNodeList(node).length,
    });
    ensureIndexes(this.ctx.state);

    return this;
  }

  replaceWith(node: LASTBlockNode | LASTBlockNode[]): LASTJQSelection<TBlock> {
    const targets = this.get();
    ensureTxn(this.ctx.state);

    for (const target of targets) {
      const sibling = getSiblingContext(this.ctx.state.model, target);
      if (!sibling) continue;
      const parentId = target.parentId;
      const inserted = materializeInsertionNodes(this.ctx.state, node, parentId);
      for (const n of inserted) {
        this.ctx.state.model.blocks[n.id] = n;
      }
      sibling.list.splice(sibling.index, 1, ...inserted.map((x) => x.id));
      const removedIds = gatherDescendantIds(this.ctx.state.model, target.id);
      for (const removedId of [target.id, ...removedIds]) {
        delete this.ctx.state.model.blocks[removedId];
      }
    }

    this.ctx.state.stagedOps.push({
      kind: 'insert',
      mode: 'replace',
      targets: targets.map((x) => x.id),
      count: asNodeList(node).length,
    });
    ensureIndexes(this.ctx.state);

    return this;
  }

  remove(): LASTJQSelection<TBlock> {
    const ids = this.ids();
    ensureTxn(this.ctx.state);

    for (const id of ids) {
      if (!this.ctx.state.model.blocks[id]) continue;
      if (isDocument(this.ctx.state.model) && id === this.ctx.state.model.rootId) {
        this.ctx.state.warnings.push('skip removing document root page');
        continue;
      }
      removeSubtree(this.ctx.state.model, id);
    }

    this.ctx.state.stagedOps.push({
      kind: 'remove',
      targets: ids,
    });
    ensureIndexes(this.ctx.state);

    return this;
  }

  empty(): LASTJQSelection<TBlock> {
    const nodes = this.get();
    ensureTxn(this.ctx.state);

    for (const node of nodes) {
      if (isTextualBlockNode(node)) {
        node.payload.inlines = [];
      }

      for (const childId of [...node.children]) {
        removeSubtree(this.ctx.state.model, childId);
      }
      node.children = [];
    }

    this.ctx.state.stagedOps.push({
      kind: 'empty',
      targets: nodes.map((n) => n.id),
    });
    ensureIndexes(this.ctx.state);

    return this;
  }

  clone(deep = true): LASTJQSelection<TBlock> {
    const model = this.ctx.state.model;
    const targets = this.get();
    ensureTxn(this.ctx.state);

    const clonedIds: LASTBlockId[] = [];

    const cloneOne = (sourceId: LASTBlockId, parentId: LASTBlockId | null): LASTBlockId | null => {
      const source = model.blocks[sourceId];
      if (!source) return null;

      const cloned = deepClone(source);
      cloned.id = nextBlockId(this.ctx.state);
      cloned.parentId = parentId;
      cloned.children = [];
      model.blocks[cloned.id] = cloned;

      if (deep) {
        for (const childId of source.children) {
          const childCloneId = cloneOne(childId, cloned.id);
          if (childCloneId) cloned.children.push(childCloneId);
        }
      }

      return cloned.id;
    };

    for (const target of targets) {
      const sibling = getSiblingContext(model, target);
      if (!sibling) continue;
      const rootCloneId = cloneOne(target.id, target.parentId);
      if (!rootCloneId) continue;
      sibling.list.splice(sibling.index + 1, 0, rootCloneId);
      clonedIds.push(rootCloneId);
    }

    this.ctx.state.stagedOps.push({
      kind: 'clone',
      targets: targets.map((x) => x.id),
      deep,
    });
    ensureIndexes(this.ctx.state);

    return this.create<TBlock>(clonedIds);
  }

  detach(): LASTJQSelection<TBlock> {
    const ids = this.ids();
    ensureTxn(this.ctx.state);

    for (const id of ids) {
      const block = this.ctx.state.model.blocks[id];
      if (!block) continue;
      if (isDocument(this.ctx.state.model) && id === this.ctx.state.model.rootId) {
        this.ctx.state.warnings.push('skip detaching document root page');
        continue;
      }
      removeSubtree(this.ctx.state.model, id);
    }

    this.ctx.state.stagedOps.push({
      kind: 'detach',
      targets: ids,
    });
    ensureIndexes(this.ctx.state);

    return this;
  }
}

class LASTJQScopeSelectionImpl implements LASTJQScopeSelection {
  private readonly ctx: Context;
  private readonly scopeIds: LASTScopeId[];

  constructor(ctx: Context, ids: LASTScopeId[]) {
    this.ctx = ctx;
    this.scopeIds = uniqueOrdered(ids as unknown as LASTBlockId[]) as unknown as LASTScopeId[];
  }

  private create(ids: LASTScopeId[]): LASTJQScopeSelection {
    return new LASTJQScopeSelectionImpl(this.ctx, ids);
  }

  ids(): string[] {
    return [...this.scopeIds];
  }

  byBlockId(blockId: LASTBlockId): LASTJQScopeSelection {
    const next = this.scopeIds.filter((scopeId) => {
      const scope = this.ctx.state.model.indexes.textScopes[scopeId];
      return scope?.blockId === blockId;
    });
    return this.create(next);
  }

  matches(pattern: RegExp): LASTJQScopeSelection {
    const next = this.scopeIds.filter((scopeId) => {
      const scope = this.ctx.state.model.indexes.textScopes[scopeId];
      if (!scope) return false;
      return regexTest(scope.normalizedText, pattern);
    });
    return this.create(next);
  }

  replace(find: RegExp, replacement: string | ((match: string, ...groups: string[]) => string)): LASTDollar {
    ensureTxn(this.ctx.state);

    for (const scopeId of this.scopeIds) {
      const scope = this.ctx.state.model.indexes.textScopes[scopeId];
      if (!scope) continue;
      const block = this.ctx.state.model.blocks[scope.blockId];
      if (!block || !isTextualBlockNode(block)) continue;
      applyScopeReplaceToBlock(this.ctx.state, block, find, replacement);
    }

    this.ctx.state.stagedOps.push({
      kind: 'scope_replace',
      scopes: [...this.scopeIds],
      pattern: find.source,
      flags: find.flags,
    });
    ensureIndexes(this.ctx.state);

    return createDollarProxy(this.ctx);
  }
}

function buildAllIds(model: LASTModel): LASTBlockId[] {
  return Object.keys(model.blocks) as LASTBlockId[];
}

function selectIds(model: LASTModel, selector?: JQuerySelectorInput): LASTBlockId[] {
  const matcher = matcherFromSelector(selector);
  const out: LASTBlockId[] = [];
  const all = buildAllIds(model);

  all.forEach((id, idx) => {
    const node = model.blocks[id];
    if (!node) return;
    if (matcher(node, idx)) {
      out.push(id);
    }
  });

  return out;
}

function operationToChange(op: MutationOp): ChangeSetItem {
  switch (op.kind) {
    case 'scope_replace':
      return {
        op: op.kind,
        targets: [],
        detail: {
          scopes: op.scopes,
          pattern: op.pattern,
          flags: op.flags,
        },
      };
    case 'insert':
      return {
        op: op.kind,
        targets: op.targets,
        detail: {
          mode: op.mode,
          count: op.count,
        },
      };
    case 'clone':
      return {
        op: op.kind,
        targets: op.targets,
        detail: {
          deep: op.deep,
        },
      };
    case 'attr_set':
    case 'attr_remove':
    case 'prop_set':
    case 'style_set':
      return {
        op: op.kind,
        targets: op.targets,
        detail: {
          name: op.name,
        },
      };
    case 'text_replace':
      return {
        op: op.kind,
        targets: op.targets,
        detail: {
          pattern: op.pattern,
          flags: op.flags,
        },
      };
    case 'plugin':
      return {
        op: op.kind,
        targets: op.targets,
        detail: {
          name: op.name,
          ...op.detail,
        },
      };
    default:
      return {
        op: op.kind,
        targets: 'targets' in op ? op.targets : [],
      };
  }
}

function makePlan(state: State): MutationPlan {
  return {
    schema: 'LASTMutationPlan',
    version: '1.0.0',
    docId: state.model.id,
    createdAt: new Date().toISOString(),
    ops: deepClone(state.stagedOps),
  };
}

function createDollarProxy(ctx: Context): LASTDollar {
  const callable = (<TBlock extends LASTBlockNode = LASTBlockNode>(
    selector?: JQuerySelectorInput,
  ): LASTJQSelection<TBlock> => {
    const ids = selectIds(ctx.state.model, selector);
    return new LASTJQSelectionImpl<TBlock>(ctx, ids);
  }) as LASTDollar;

  Object.defineProperty(callable, 'model', {
    enumerable: true,
    configurable: false,
    get: () => ctx.state.model,
  });

  const pluginRegistry: LASTJQPluginRegistry = {
    extend<T extends Record<string, (...args: any[]) => any>>(methods: T): void {
      for (const [name, fn] of Object.entries(methods)) {
        if (typeof fn !== 'function') continue;
        Object.defineProperty(LASTJQSelectionImpl.prototype, name, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: function pluginInvoker(this: LASTJQSelectionImpl<LASTBlockNode>, ...args: unknown[]): unknown {
            const result = fn.apply(this, args);
            const selection = this as unknown as LASTJQSelection<LASTBlockNode>;
            const selectionIds = selection.ids();

            const op: MutationOp = {
              kind: 'plugin',
              name,
              targets: selectionIds,
            };
            ensureTxn(ctx.state);
            ctx.state.stagedOps.push(op);
            return result;
          },
        });
      }
    },
  };

  Object.defineProperty(callable, 'fn', {
    enumerable: true,
    configurable: false,
    writable: false,
    value: pluginRegistry,
  });

  callable.begin = (): LASTDollar => {
    ctx.state.checkpoint = deepClone(ctx.state.model);
    ctx.state.stagedOps = [];
    ctx.state.warnings = [];
    ctx.state.active = true;
    return callable;
  };

  callable.plan = (): MutationPlan => makePlan(ctx.state);

  callable.commit = (options?: CommitOptions): MutationResult => {
    const shouldRebuild = options?.rebuildIndexes ?? ctx.defaultRebuildIndexesOnCommit;

    try {
      const plan = makePlan(ctx.state);
      ctx.state.hooks?.beforeCommit?.(plan);

      if (shouldRebuild) {
        ensureIndexes(ctx.state);
      }

      const result: MutationResult = {
        ok: true,
        next: deepClone(ctx.state.model),
        indexes: deepClone(ctx.state.model.indexes),
        changes: ctx.state.stagedOps.map(operationToChange),
        warnings: [...ctx.state.warnings],
      };

      ctx.state.active = false;
      ctx.state.checkpoint = null;
      ctx.state.stagedOps = [];
      ctx.state.warnings = [];
      ctx.state.hooks?.afterCommit?.(result);

      return result;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      ctx.state.hooks?.onError?.(normalized);

      if (ctx.state.checkpoint) {
        ctx.state.model = deepClone(ctx.state.checkpoint);
      }
      ctx.state.active = false;
      ctx.state.checkpoint = null;
      ctx.state.stagedOps = [];
      ctx.state.warnings = [];

      throw normalized;
    }
  };

  callable.rollback = (): LASTDollar => {
    if (ctx.state.checkpoint) {
      ctx.state.model = deepClone(ctx.state.checkpoint);
      ensureIndexes(ctx.state);
    }
    ctx.state.active = false;
    ctx.state.checkpoint = null;
    ctx.state.stagedOps = [];
    ctx.state.warnings = [];
    return callable;
  };

  callable.byScope = (selector?: { blockId?: LASTBlockId; pattern?: RegExp }): LASTJQScopeSelection => {
    const allIds = Object.keys(ctx.state.model.indexes.textScopes) as LASTScopeId[];

    let filtered = allIds;
    if (selector?.blockId) {
      filtered = filtered.filter((scopeId) => {
        const scope = ctx.state.model.indexes.textScopes[scopeId];
        return scope?.blockId === selector.blockId;
      });
    }

    if (selector?.pattern) {
      filtered = filtered.filter((scopeId) => {
        const scope = ctx.state.model.indexes.textScopes[scopeId];
        if (!scope) return false;
        return selector.pattern?.test(scope.normalizedText) ?? false;
      });
    }

    return new LASTJQScopeSelectionImpl(ctx, filtered);
  };

  return callable;
}

export function createLASTDollar(model: LASTModel, options?: CreateLASTDollarOptions): LASTDollar {
  const base = deepClone(model);
  base.indexes = rebuildLASTIndexes(base);

  const seeds = seedNextCounters(base);
  const state: State = {
    original: deepClone(base),
    model: base,
    checkpoint: null,
    stagedOps: [],
    warnings: [],
    active: false,
    nextBlockCounter: seeds.block,
    nextInlineCounter: seeds.inline,
  };

  const ctx: Context = {
    state,
    defaultRebuildIndexesOnCommit: options?.rebuildIndexesOnCommit ?? true,
  };

  return createDollarProxy(ctx);
}

export interface LASTApi {
  model: LASTModel;
  $: LASTDollar;
  compile(): MutationPlan;
  commit(options?: CommitOptions): MutationResult;
}

export function createLASTApi(model: LASTModel, options?: CreateLASTDollarOptions): LASTApi {
  const $ = createLASTDollar(model, options);
  return {
    get model(): LASTModel {
      return $.model;
    },
    $,
    compile(): MutationPlan {
      return $.plan();
    },
    commit(commitOptions?: CommitOptions): MutationResult {
      return $.commit(commitOptions);
    },
  };
}
