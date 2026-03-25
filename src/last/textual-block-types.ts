import type { LASTTextualBlockType } from './types.js';

export const LAST_TEXTUAL_BLOCK_TYPES = [
  'page',
  'text',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
  'heading7',
  'heading8',
  'heading9',
  'bullet',
  'ordered',
  'code',
  'quote',
  'todo',
] as const satisfies readonly LASTTextualBlockType[];

export const LAST_TEXTUAL_BLOCK_TYPE_SET: ReadonlySet<LASTTextualBlockType> = new Set(LAST_TEXTUAL_BLOCK_TYPES);
