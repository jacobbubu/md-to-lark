type LASTBlockId = `b_${string}` | string;
type LASTInlineId = `i_${string}` | string;
type LASTScopeId = `scope_${string}` | string;

type LASTScalar = string | number | boolean | null;

interface LASTInlineMarks {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  inlineCode?: boolean;
  textColor?: string | null;
  backgroundColor?: string | null;
  link?: { url: string } | null;
  commentIds?: string[];
}

interface LASTInlineNode {
  id: LASTInlineId;
  kind: string;
  bttId?: string;
  marks: LASTInlineMarks;
  [key: string]: unknown;
}

interface LASTBlockNode {
  id: LASTBlockId;
  type: string;
  parentId: LASTBlockId | null;
  children: LASTBlockId[];
  childrenDefined?: boolean;
  bttId?: string;
  payload: Record<string, unknown>;
  [key: string]: unknown;
}

interface LASTIndexes {
  byType: Record<string, LASTBlockId[]>;
  textScopes: Record<LASTScopeId, LASTTextScope>;
  textScopeByBlockId: Partial<Record<LASTBlockId, LASTScopeId>>;
}

interface LASTTextSegment {
  inlineId: LASTInlineId;
  inlineKind: string;
  from: number;
  to: number;
  editable: boolean;
}

interface LASTTextScope {
  id: LASTScopeId;
  blockId: LASTBlockId;
  blockType: string;
  normalizedText: string;
  segments: LASTTextSegment[];
}

interface LASTModel {
  schema: string;
  version: string;
  id: string;
  rootId?: LASTBlockId;
  topLevel?: LASTBlockId[];
  mode?: 'document' | 'fragment';
  blocks: Record<LASTBlockId, LASTBlockNode>;
  indexes: LASTIndexes;
  [key: string]: unknown;
}

interface JQuerySelectorObject {
  ids?: LASTBlockId[];
  types?: string[];
  bttIds?: string[];
  attrs?: Record<string, unknown>;
  hasText?: string | RegExp;
}

type JQuerySelectorInput =
  | string
  | LASTBlockId
  | LASTBlockNode
  | LASTJQSelection<LASTBlockNode>
  | JQuerySelectorObject
  | ((idx: number, node: LASTBlockNode) => boolean)
  | undefined;

interface MutationPlan {
  schema: string;
  version: string;
  docId: string;
  createdAt: string;
  ops: Array<Record<string, unknown>>;
}

interface ChangeSetItem {
  op: string;
  targets: LASTBlockId[];
  detail?: Record<string, unknown>;
}

interface MutationResult {
  ok: true;
  next: LASTModel;
  indexes: LASTIndexes;
  changes: ChangeSetItem[];
  warnings: string[];
}

interface LASTJQPluginRegistry {
  extend<T extends Record<string, (...args: any[]) => any>>(methods: T): void;
}

interface LASTJQScopeSelection {
  ids(): string[];
  byBlockId(blockId: LASTBlockId): LASTJQScopeSelection;
  matches(pattern: RegExp): LASTJQScopeSelection;
  replace(find: RegExp, replacement: string | ((match: string, ...groups: string[]) => string)): LASTDollar;
}

interface LASTJQSelection<TBlock extends LASTBlockNode> {
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

interface LASTDollar {
  <TBlock extends LASTBlockNode = LASTBlockNode>(selector?: JQuerySelectorInput): LASTJQSelection<TBlock>;
  readonly model: LASTModel;
  readonly fn: LASTJQPluginRegistry;

  begin(): LASTDollar;
  plan(): MutationPlan;
  commit(options?: { rebuildIndexes?: boolean }): MutationResult;
  rollback(): LASTDollar;
  byScope(selector?: { blockId?: LASTBlockId; pattern?: RegExp }): LASTJQScopeSelection;
}

interface LASTApi {
  model: LASTModel;
  $: LASTDollar;
  compile(): MutationPlan;
  commit(options?: { rebuildIndexes?: boolean }): MutationResult;
}

declare const $: LASTDollar;
declare const api: LASTApi;
declare const model: LASTModel;
declare const print: (...args: unknown[]) => void;
