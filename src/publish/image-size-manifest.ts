import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ImageDisplaySize, ImageSizeResolver, ImageSizeResolverContext } from '../pipeline/hast-to-last.js';

export interface ImageManifestEntry {
  source_url?: string;
  alt?: string;
  intrinsic_width?: number;
  intrinsic_height?: number;
  rendered_width?: number;
  rendered_height?: number;
  container_width?: number;
  display_ratio?: number;
  aspect_ratio?: number;
  captured_at?: string;
}

export interface ImageSizeResolutionEntry {
  imageSrc: string;
  matchedManifestKey: string | null;
  matchedBy: 'path' | 'absolute-path' | 'source-url' | 'prepared-alias' | 'none';
  widthRatio?: number;
  widthPx?: number;
  aspectRatio?: number;
}

export interface ImageSizeManifestResolver {
  resolver: ImageSizeResolver;
  resolutions: ImageSizeResolutionEntry[];
  manifestPath: string;
}

interface IndexedHint {
  manifestKey: string;
  entry: ImageManifestEntry;
  matchedBy: Exclude<ImageSizeResolutionEntry['matchedBy'], 'prepared-alias' | 'none'>;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizePathKey(value: string): string {
  let normalized = value.trim();
  try {
    normalized = decodeURI(normalized);
  } catch {
    // Keep malformed URL escapes literal so diagnostics can still identify the source.
  }
  if (normalized.startsWith('file://')) {
    try {
      normalized = new URL(normalized).pathname;
    } catch {
      // Keep the original value.
    }
  }
  return normalized.replaceAll('\\', '/').replace(/^\.\//, '');
}

function normalizeRemoteUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = '';
    return url.href;
  } catch {
    return value.trim();
  }
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeEntry(raw: unknown, key: string): ImageManifestEntry {
  const record = toRecord(raw);
  if (!record) throw new Error(`Image manifest entry must be a mapping: ${key}`);
  const displayRatio = positive(record.display_ratio);
  if (displayRatio !== undefined && displayRatio > 1) {
    throw new Error(`Image manifest display_ratio must satisfy 0 < value <= 1: ${key}`);
  }
  const intrinsicWidth = positive(record.intrinsic_width);
  const intrinsicHeight = positive(record.intrinsic_height);
  const renderedWidth = positive(record.rendered_width);
  const renderedHeight = positive(record.rendered_height);
  const containerWidth = positive(record.container_width);
  const aspectRatio = positive(record.aspect_ratio);
  return {
    ...(typeof record.source_url === 'string' ? { source_url: record.source_url } : {}),
    ...(typeof record.alt === 'string' ? { alt: record.alt } : {}),
    ...(intrinsicWidth ? { intrinsic_width: intrinsicWidth } : {}),
    ...(intrinsicHeight ? { intrinsic_height: intrinsicHeight } : {}),
    ...(renderedWidth ? { rendered_width: renderedWidth } : {}),
    ...(renderedHeight ? { rendered_height: renderedHeight } : {}),
    ...(containerWidth ? { container_width: containerWidth } : {}),
    ...(displayRatio ? { display_ratio: displayRatio } : {}),
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    ...(typeof record.captured_at === 'string' ? { captured_at: record.captured_at } : {}),
  };
}

function toDisplaySize(entry: ImageManifestEntry): ImageDisplaySize | undefined {
  let widthRatio = entry.display_ratio;
  if (!widthRatio && entry.rendered_width && entry.container_width) {
    widthRatio = Math.min(1, entry.rendered_width / entry.container_width);
  }
  const aspectRatio =
    entry.aspect_ratio ??
    (entry.intrinsic_width && entry.intrinsic_height ? entry.intrinsic_width / entry.intrinsic_height : undefined) ??
    (entry.rendered_width && entry.rendered_height ? entry.rendered_width / entry.rendered_height : undefined);
  if (widthRatio) return { widthRatio, ...(aspectRatio ? { aspectRatio } : {}) };
  if (entry.rendered_width) return { widthPx: entry.rendered_width, ...(aspectRatio ? { aspectRatio } : {}) };
  return undefined;
}

export async function createImageSizeManifestResolver(
  manifestPath: string,
  options: {
    resourceBaseDir: string;
    preparedAliases?: ReadonlyMap<string, string>;
  },
): Promise<ImageSizeManifestResolver> {
  const absoluteManifestPath = path.resolve(manifestPath);
  const parsed = toRecord(parseYaml(await readFile(absoluteManifestPath, 'utf8'), { maxAliasCount: 100 }));
  if (!parsed || parsed.version !== 1) {
    throw new Error(`Unsupported image manifest version in ${absoluteManifestPath}: ${String(parsed?.version)}`);
  }
  const images = toRecord(parsed.images);
  if (!images) throw new Error(`Image manifest is missing images mapping: ${absoluteManifestPath}`);
  const lookup = new Map<string, IndexedHint>();
  for (const [rawKey, rawEntry] of Object.entries(images)) {
    const manifestKey = normalizePathKey(rawKey);
    const entry = normalizeEntry(rawEntry, rawKey);
    const pathHint: IndexedHint = { manifestKey, entry, matchedBy: 'path' };
    lookup.set(manifestKey, pathHint);
    lookup.set(`./${manifestKey}`, pathHint);
    lookup.set(normalizePathKey(path.resolve(options.resourceBaseDir, manifestKey)), {
      manifestKey,
      entry,
      matchedBy: 'absolute-path',
    });
    if (entry.source_url) {
      lookup.set(normalizeRemoteUrl(entry.source_url), { manifestKey, entry, matchedBy: 'source-url' });
    }
  }
  const aliases = new Map<string, string>();
  for (const [prepared, original] of options.preparedAliases ?? []) {
    aliases.set(normalizePathKey(prepared), normalizeRemoteUrl(original));
  }
  const resolutions: ImageSizeResolutionEntry[] = [];
  const resolver = (imageSrc: string, _context: ImageSizeResolverContext): ImageDisplaySize | undefined => {
    const normalizedPath = normalizePathKey(imageSrc);
    const alias = aliases.get(normalizedPath);
    const direct = lookup.get(normalizedPath) ?? lookup.get(normalizeRemoteUrl(imageSrc));
    const hint = direct ?? (alias ? lookup.get(alias) : undefined);
    const size = hint ? toDisplaySize(hint.entry) : undefined;
    resolutions.push({
      imageSrc,
      matchedManifestKey: hint?.manifestKey ?? null,
      matchedBy: alias && hint && !direct ? 'prepared-alias' : (hint?.matchedBy ?? 'none'),
      ...(size?.widthRatio ? { widthRatio: size.widthRatio } : {}),
      ...(size?.widthPx ? { widthPx: size.widthPx } : {}),
      ...(size?.aspectRatio ? { aspectRatio: size.aspectRatio } : {}),
    });
    return size;
  };
  return { resolver, resolutions, manifestPath: absoluteManifestPath };
}

export function composeImageSizeResolvers(
  primary: ImageSizeResolver | undefined,
  fallback: ImageSizeResolver | undefined,
): ImageSizeResolver | undefined {
  if (!primary) return fallback;
  if (!fallback) return primary;
  return (src, context) => primary(src, context) ?? fallback(src, context);
}
