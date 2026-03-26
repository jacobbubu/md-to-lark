import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rewriteRelativeMediumAuthorLinks } from './presets/medium.js';
import { formatChineseMarkdown } from './presets/zh-format.js';

export interface MarkdownPresetContext {
  inputPath: string;
  index: number;
  total: number;
  env: NodeJS.ProcessEnv;
  log: (...args: unknown[]) => void;
}

export type MarkdownPresetTransform = (markdown: string, context: MarkdownPresetContext) => string | Promise<string>;

export interface LoadedMarkdownPreset {
  sourcePath: string;
  displayPath: string;
  transform: MarkdownPresetTransform;
}

const BUILTIN_MARKDOWN_PRESETS: Readonly<
  Record<
    string,
    {
      transform: MarkdownPresetTransform;
      aliases: string[];
    }
  >
> = Object.freeze({
  medium: {
    transform: rewriteRelativeMediumAuthorLinks,
    aliases: ['medium', 'builtin:medium', 'preset:medium'],
  },
  'zh-format': {
    transform: (markdown, context) => formatChineseMarkdown(markdown, context.inputPath),
    aliases: [
      'zh-format',
      'zh-md-format',
      'builtin:zh-format',
      'preset:zh-format',
      'zh-smart-quotes',
      'cn-smart-quotes',
      'builtin:zh-smart-quotes',
      'preset:zh-smart-quotes',
    ],
  },
});

function toObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function pickTransform(moduleExports: Record<string, unknown>): MarkdownPresetTransform | null {
  const directCandidates: unknown[] = [
    moduleExports.default,
    moduleExports.transformMarkdown,
    moduleExports.transform,
    moduleExports.preset,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'function') {
      return candidate as MarkdownPresetTransform;
    }
    const record = toObjectRecord(candidate);
    if (!record) continue;
    if (typeof record.transformMarkdown === 'function') {
      return record.transformMarkdown as MarkdownPresetTransform;
    }
    if (typeof record.transform === 'function') {
      return record.transform as MarkdownPresetTransform;
    }
  }

  return null;
}

function resolveBuiltInPreset(rawPreset: string): LoadedMarkdownPreset | null {
  const normalized = rawPreset.trim().toLowerCase();
  if (!normalized) return null;

  for (const [name, preset] of Object.entries(BUILTIN_MARKDOWN_PRESETS)) {
    if (!preset.aliases.includes(normalized)) continue;
    return {
      sourcePath: `builtin:${name}`,
      displayPath: `builtin:${name}`,
      transform: preset.transform,
    };
  }
  return null;
}

export function listBuiltinMarkdownPresetNames(): string[] {
  return Object.keys(BUILTIN_MARKDOWN_PRESETS);
}

export async function loadMarkdownPreset(rawPath?: string): Promise<LoadedMarkdownPreset | null> {
  const trimmed = (rawPath ?? '').trim();
  if (!trimmed) return null;

  const builtin = resolveBuiltInPreset(trimmed);
  if (builtin) return builtin;

  const absolutePath = path.resolve(trimmed);
  let moduleStat;
  try {
    moduleStat = await stat(absolutePath);
  } catch {
    const builtins = listBuiltinMarkdownPresetNames()
      .map((name) => `"${name}"`)
      .join(', ');
    throw new Error(`Preset module not found: ${absolutePath}. Built-in presets: ${builtins}`);
  }
  if (!moduleStat.isFile()) {
    throw new Error(`Preset module is not a file: ${absolutePath}`);
  }

  let importedModule: Record<string, unknown>;
  try {
    importedModule = (await import(pathToFileURL(absolutePath).href)) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Failed to import preset module "${absolutePath}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const transform = pickTransform(importedModule);
  if (!transform) {
    throw new Error(
      `Invalid preset module "${absolutePath}". Expected export: default function, transformMarkdown(), transform(), or preset object.`,
    );
  }

  const wrappedTransform: MarkdownPresetTransform = async (markdown, context) => {
    const next = await transform(markdown, context);
    if (typeof next !== 'string') {
      throw new Error(
        `Preset "${absolutePath}" must return a markdown string, got ${next === null ? 'null' : typeof next}.`,
      );
    }
    return next;
  };

  return {
    sourcePath: absolutePath,
    displayPath: path.relative(process.cwd(), absolutePath) || absolutePath,
    transform: wrappedTransform,
  };
}
