import { ARTICLE_RENDER_PROTOCOL_V1, type RendererCapabilities } from './types.js';

export const LARK_RENDERER_CAPABILITIES: Readonly<RendererCapabilities> = Object.freeze({
  renderer: 'lark',
  protocols: [ARTICLE_RENDER_PROTOCOL_V1],
  capabilities: Object.freeze({
    'gfm-footnotes': 1,
    'semantic-directives': 1,
    'lark-callout': 1,
    'local-images': 1,
    'image-display-size': 1,
    katex: 1,
    'native-tables': 1,
  }),
});

export function getRendererCapabilities(renderer = 'lark'): RendererCapabilities {
  if (renderer !== 'lark') {
    throw new Error(`Unsupported renderer: ${renderer}`);
  }
  return {
    renderer: LARK_RENDERER_CAPABILITIES.renderer,
    protocols: [...LARK_RENDERER_CAPABILITIES.protocols],
    capabilities: { ...LARK_RENDERER_CAPABILITIES.capabilities },
  };
}

export function assertRequiredCapabilities(requirements: string[] | undefined, renderer = 'lark'): void {
  const supported = getRendererCapabilities(renderer).capabilities;
  const missing = (requirements ?? []).filter((requirement) => !supported[requirement]);
  if (missing.length > 0) {
    throw new Error(`Renderer "${renderer}" is missing required capabilities: ${missing.join(', ')}`);
  }
}
