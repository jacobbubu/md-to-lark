import type { LASTModel } from '../last/types.js';
import type { SemanticAnalysis } from '../pipeline/markdown/md-to-semantic-hast.js';
import type { ProtocolDiagnostic, ResolvedRendererContract } from '../protocol/types.js';
import type { ImageSizeResolutionEntry } from './image-size-manifest.js';

export interface ArticleRenderReport {
  protocol: string;
  renderer: string;
  source: string;
  contract: string;
  strict: boolean;
  counts: SemanticAnalysis['counts'] & {
    imagesMovedOutsideCallouts: number;
    source: SemanticAnalysis['counts'];
    emitted: {
      lastByType: Record<string, number>;
      bttByBlockType: Record<string, number>;
    };
    remote?: {
      byBlockType: Record<string, number>;
    };
  };
  imageSizing: ImageSizeResolutionEntry[];
  capabilityLosses: string[];
  warnings: ProtocolDiagnostic[];
  errors: ProtocolDiagnostic[];
}

function countLast(last: LASTModel | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const block of Object.values(last?.blocks ?? {})) counts[block.type] = (counts[block.type] ?? 0) + 1;
  return counts;
}

export function createArticleRenderReport(options: {
  resolved: ResolvedRendererContract;
  source: string;
  semantic: SemanticAnalysis;
  last?: LASTModel;
  bttBlockTypes?: number[];
  imageSizing?: ImageSizeResolutionEntry[];
  remoteBlockTypes?: number[];
}): ArticleRenderReport {
  const countTypes = (types: Array<number | string>): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const type of types) counts[String(type)] = (counts[String(type)] ?? 0) + 1;
    return counts;
  };
  const warnings = options.semantic.diagnostics.filter((item) => item.severity === 'warning');
  const errors = options.semantic.diagnostics.filter((item) => item.severity === 'error');
  return {
    protocol: options.resolved.contract.protocol,
    renderer: options.resolved.contract.renderer,
    source: options.source,
    contract: options.resolved.selectedPath,
    strict: options.resolved.strict,
    counts: {
      ...options.semantic.counts,
      imagesMovedOutsideCallouts: options.last
        ? Object.values(options.last.blocks).filter(
            (block) => block.selector?.attrs?.semanticRole === 'footnote-media-sibling',
          ).length
        : 0,
      source: options.semantic.counts,
      emitted: {
        lastByType: countLast(options.last),
        bttByBlockType: countTypes(options.bttBlockTypes ?? []),
      },
      ...(options.remoteBlockTypes ? { remote: { byBlockType: countTypes(options.remoteBlockTypes) } } : {}),
    },
    imageSizing: [...(options.imageSizing ?? [])],
    capabilityLosses: [
      ...options.semantic.capabilityLosses,
      ...(options.last &&
      Object.values(options.last.blocks).some(
        (block) => block.type === 'image' && typeof block.selector?.attrs?.linkHref === 'string',
      )
        ? ['Lark image blocks preserve linked-image href metadata but are not clickable.']
        : []),
    ],
    warnings,
    errors,
  };
}
