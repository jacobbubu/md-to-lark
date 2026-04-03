import type { LASTBlockNode, LASTImageLikePayload } from './types.js';

export const DEFAULT_IMAGE_WIDTH = 1000;
export const DEFAULT_TABLE_CELL_IMAGE_WIDTH = 240;

export function createDefaultImagePayload(parentType?: LASTBlockNode['type']): LASTImageLikePayload {
  return {
    width: parentType === 'table_cell' ? DEFAULT_TABLE_CELL_IMAGE_WIDTH : DEFAULT_IMAGE_WIDTH,
    token: '',
    align: 'left',
  };
}
