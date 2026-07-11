import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { assertRequiredCapabilities, getRendererCapabilities } from './capabilities.js';
import { parseArticleFrontmatter } from './frontmatter.js';
import {
  ARTICLE_RENDER_PROTOCOL_V1,
  type ContractResolutionOptions,
  type ContractResolutionResult,
  type RendererContract,
  type ResolvedRendererContract,
} from './types.js';

const MAX_CONTRACT_BYTES = 1024 * 1024;
const MAX_INHERITANCE_DEPTH = 32;

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function mergeContractValues(base: unknown, patch: unknown): unknown {
  const baseRecord = toRecord(base);
  const patchRecord = toRecord(patch);
  if (!baseRecord || !patchRecord) return patch;
  const output: Record<string, unknown> = { ...baseRecord };
  for (const [key, value] of Object.entries(patchRecord)) {
    output[key] = key in output ? mergeContractValues(output[key], value) : value;
  }
  return output;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function validateContractShape(value: unknown, sourcePath: string): RendererContract {
  const contract = toRecord(value);
  if (!contract) throw new Error(`Renderer contract must be a YAML mapping: ${sourcePath}`);
  if (contract.protocol !== ARTICLE_RENDER_PROTOCOL_V1) {
    throw new Error(
      `Unsupported renderer protocol in ${sourcePath}: ${String(contract.protocol)}. Expected ${ARTICLE_RENDER_PROTOCOL_V1}.`,
    );
  }
  if (typeof contract.renderer !== 'string' || !contract.renderer.trim()) {
    throw new Error(`Renderer contract is missing renderer: ${sourcePath}`);
  }
  const document = toRecord(contract.document);
  if (!document || typeof document.source !== 'string' || !document.source.trim()) {
    throw new Error(`Renderer contract is missing document.source: ${sourcePath}`);
  }
  const targets = toRecord(contract.targets);
  if (!targets || !toRecord(targets[contract.renderer])) {
    throw new Error(`Renderer contract is missing targets.${contract.renderer}: ${sourcePath}`);
  }
  if (contract.requirements !== undefined && !Array.isArray(contract.requirements)) {
    throw new Error(`Renderer contract requirements must be an array: ${sourcePath}`);
  }
  if (
    Array.isArray(contract.requirements) &&
    contract.requirements.some((requirement) => typeof requirement !== 'string' || !requirement.trim())
  ) {
    throw new Error('Renderer contract requirements must contain only capability names: ' + sourcePath);
  }
  if (contract.strict !== undefined && typeof contract.strict !== 'boolean') {
    throw new Error('Renderer contract strict must be boolean: ' + sourcePath);
  }
  if (contract.renderer === 'lark') validateLarkTarget(toRecord(targets.lark)!, sourcePath);
  return contract as unknown as RendererContract;
}

function assertEnum(value: unknown, allowed: readonly string[], field: string, sourcePath: string): void {
  if (value !== undefined && (typeof value !== 'string' || !allowed.includes(value))) {
    throw new Error(field + ' must be one of ' + allowed.join(', ') + ': ' + sourcePath);
  }
}

function validateLarkTarget(target: Record<string, unknown>, sourcePath: string): void {
  const footnotes = toRecord(target.footnotes);
  if (footnotes) {
    if (footnotes.render !== undefined && footnotes.render !== 'callout') {
      throw new Error('targets.lark.footnotes.render currently supports only callout: ' + sourcePath);
    }
    assertEnum(footnotes.image_policy, ['error', 'sibling-after'], 'targets.lark.footnotes.image_policy', sourcePath);
  }
  const figures = toRecord(target.figures);
  if (figures) {
    const ratio = figures.default_width_ratio;
    if (ratio !== undefined && (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0 || ratio > 1)) {
      throw new Error('targets.lark.figures.default_width_ratio must satisfy 0 < value <= 1: ' + sourcePath);
    }
    if (figures.preserve_source_ratio !== undefined && typeof figures.preserve_source_ratio !== 'boolean') {
      throw new Error('targets.lark.figures.preserve_source_ratio must be boolean: ' + sourcePath);
    }
    assertEnum(figures.caption_position, ['above', 'below'], 'targets.lark.figures.caption_position', sourcePath);
    assertEnum(figures.note_position, ['above', 'below'], 'targets.lark.figures.note_position', sourcePath);
    assertEnum(
      figures.source_position,
      ['above', 'below-caption', 'below-note', 'below'],
      'targets.lark.figures.source_position',
      sourcePath,
    );
  }
  const tables = toRecord(target.tables);
  if (tables) {
    assertEnum(tables.caption_position, ['above', 'below'], 'targets.lark.tables.caption_position', sourcePath);
    assertEnum(tables.note_position, ['above', 'below'], 'targets.lark.tables.note_position', sourcePath);
    assertEnum(
      tables.source_position,
      ['above', 'below-note', 'below'],
      'targets.lark.tables.source_position',
      sourcePath,
    );
    assertEnum(tables.invalid_table, ['error', 'warning'], 'targets.lark.tables.invalid_table', sourcePath);
  }
  const callouts = toRecord(target.callouts);
  if (callouts) {
    assertEnum(
      callouts.unsupported_child_policy,
      ['error', 'sibling-after'],
      'targets.lark.callouts.unsupported_child_policy',
      sourcePath,
    );
  }
  const math = toRecord(target.math);
  if (math) {
    assertEnum(math.input, ['latex'], 'targets.lark.math.input', sourcePath);
    assertEnum(math.renderer, ['katex'], 'targets.lark.math.renderer', sourcePath);
    assertEnum(math.currency_policy, ['protect', 'parse'], 'targets.lark.math.currency_policy', sourcePath);
    assertEnum(math.unsupported_command, ['error', 'warning'], 'targets.lark.math.unsupported_command', sourcePath);
    for (const field of ['inline_delimiters', 'display_delimiters'] as const) {
      const delimiters = math[field];
      if (
        delimiters !== undefined &&
        (!Array.isArray(delimiters) || delimiters.some((item) => typeof item !== 'string'))
      ) {
        throw new Error('targets.lark.math.' + field + ' must be an array of names: ' + sourcePath);
      }
    }
    if (
      math.environments !== undefined &&
      (!Array.isArray(math.environments) || math.environments.some((item) => typeof item !== 'string'))
    ) {
      throw new Error('targets.lark.math.environments must be an array of names: ' + sourcePath);
    }
    const macros = toRecord(math.macros);
    if (
      math.macros !== undefined &&
      (!macros || Object.entries(macros).some(([key, replacement]) => !key || typeof replacement !== 'string'))
    ) {
      throw new Error('targets.lark.math.macros must map macro names to strings: ' + sourcePath);
    }
  }
}

async function loadResolvedContract(
  contractPath: string,
  stack: string[],
  loadedPaths: string[],
): Promise<Record<string, unknown>> {
  const absolutePath = path.resolve(contractPath);
  if (stack.includes(absolutePath)) {
    throw new Error(`Renderer contract inheritance cycle: ${[...stack, absolutePath].join(' -> ')}`);
  }
  if (stack.length >= MAX_INHERITANCE_DEPTH) {
    throw new Error(`Renderer contract inheritance exceeds ${MAX_INHERITANCE_DEPTH} levels: ${absolutePath}`);
  }
  const text = await readFile(absolutePath, 'utf8');
  if (Buffer.byteLength(text) > MAX_CONTRACT_BYTES) {
    throw new Error(`Renderer contract exceeds ${MAX_CONTRACT_BYTES} bytes: ${absolutePath}`);
  }
  const parsed = toRecord(parseYaml(text, { maxAliasCount: 100 }));
  if (!parsed) throw new Error(`Renderer contract must be a YAML mapping: ${absolutePath}`);
  const parentsRaw = parsed.extends;
  const parents = parentsRaw === undefined ? [] : parentsRaw;
  if (!Array.isArray(parents) || parents.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`Renderer contract extends must be an array of paths: ${absolutePath}`);
  }
  let resolved: unknown = {};
  for (const parent of parents as string[]) {
    const parentPath = path.resolve(path.dirname(absolutePath), parent);
    resolved = mergeContractValues(
      resolved,
      await loadResolvedContract(parentPath, [...stack, absolutePath], loadedPaths),
    );
  }
  loadedPaths.push(absolutePath);
  const own = { ...parsed };
  delete own.extends;
  return mergeContractValues(resolved, own) as Record<string, unknown>;
}

function autoContractPath(inputPath: string, renderer: string): string {
  const extension = path.extname(inputPath);
  const basename = path.basename(inputPath, extension);
  return path.join(path.dirname(inputPath), `${basename}.${renderer}.yml`);
}

export async function resolveRendererContract(options: ContractResolutionOptions): Promise<ContractResolutionResult> {
  const renderer = options.renderer?.trim() || 'lark';
  const inputPath = path.resolve(options.inputPath);
  const frontmatter = parseArticleFrontmatter(options.markdown);
  const declaration = frontmatter?.articleRender;
  if (declaration?.contracts && !declaration.protocol) {
    throw new Error('article_render.protocol is required when renderer contracts are declared.');
  }
  if (declaration?.protocol && declaration.protocol !== ARTICLE_RENDER_PROTOCOL_V1) {
    throw new Error(`Unsupported article_render.protocol: ${declaration.protocol}`);
  }

  let selectedPath = '';
  let selection: ResolvedRendererContract['selection'] = 'auto';
  let required = false;
  if (options.rendererContractPath?.trim()) {
    selectedPath = path.resolve(options.rendererContractPath.trim());
    selection = 'explicit';
    required = true;
  } else if (declaration?.contracts?.[renderer]) {
    selectedPath = path.resolve(path.dirname(inputPath), declaration.contracts[renderer]);
    selection = 'frontmatter';
    required = true;
  } else {
    const discovered = autoContractPath(inputPath, renderer);
    if (await exists(discovered)) {
      selectedPath = discovered;
      selection = 'auto';
    } else if (options.rendererDefaultContractPath?.trim()) {
      selectedPath = path.resolve(options.rendererDefaultContractPath.trim());
      selection = 'default';
      required = true;
    }
  }

  if (!selectedPath) {
    if (options.strict) {
      throw new Error(`Strict renderer mode requires a ${renderer} renderer contract.`);
    }
    return { frontmatter, resolved: null, markdownBody: options.markdown };
  }
  if (!(await exists(selectedPath))) {
    if (required) throw new Error(`Renderer contract does not exist: ${selectedPath}`);
    return { frontmatter, resolved: null, markdownBody: options.markdown };
  }

  const loadedPaths: string[] = [];
  const merged = await loadResolvedContract(selectedPath, [], loadedPaths);
  const contract = validateContractShape(merged, selectedPath);
  if (contract.renderer !== renderer) {
    throw new Error(`Renderer contract renderer mismatch: expected ${renderer}, received ${contract.renderer}.`);
  }
  if (path.basename(inputPath) !== contract.document.source) {
    throw new Error(
      `Renderer contract document.source mismatch: expected ${path.basename(inputPath)}, received ${contract.document.source}.`,
    );
  }
  if (!getRendererCapabilities(renderer).protocols.includes(contract.protocol)) {
    throw new Error(`Renderer ${renderer} does not support protocol ${contract.protocol}.`);
  }
  assertRequiredCapabilities(contract.requirements, renderer);

  return {
    frontmatter,
    resolved: {
      selectedPath: path.resolve(selectedPath),
      selection,
      contract,
      loadedPaths,
      strict: Boolean(options.strict || contract.strict),
    },
    markdownBody: frontmatter?.body ?? options.markdown,
  };
}

export async function validateRendererContract(
  contractPath: string,
  options: { inputPath?: string; renderer?: string; strict?: boolean } = {},
): Promise<ResolvedRendererContract> {
  const absolutePath = path.resolve(contractPath);
  const text = await readFile(absolutePath, 'utf8');
  const parsed = toRecord(parseYaml(text, { maxAliasCount: 100 }));
  const source = toRecord(parsed?.document)?.source;
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error(`Renderer contract is missing document.source: ${absolutePath}`);
  }
  const result = await resolveRendererContract({
    inputPath: options.inputPath ? path.resolve(options.inputPath) : path.join(path.dirname(absolutePath), source),
    markdown: '',
    renderer: options.renderer ?? (typeof parsed?.renderer === 'string' ? parsed.renderer : 'lark'),
    rendererContractPath: absolutePath,
    ...(options.strict === undefined ? {} : { strict: options.strict }),
  });
  if (!result.resolved) throw new Error(`Unable to resolve renderer contract: ${absolutePath}`);
  return result.resolved;
}

export function stringifyResolvedContract(contract: RendererContract): string {
  return stringifyYaml(contract, { sortMapEntries: true });
}
