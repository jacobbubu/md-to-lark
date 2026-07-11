import type { LASTBlockNode, LASTModel } from '../last/types.js';

const CALLOUT_FORBIDDEN_CHILDREN = new Set<LASTBlockNode['type']>(['image', 'board', 'file', 'table']);

export function validateLastForLark(last: LASTModel): string[] {
  const errors: string[] = [];
  for (const block of Object.values(last.blocks)) {
    for (const childId of block.children) {
      const child = last.blocks[childId];
      if (!child) {
        errors.push(`Block ${block.id} references missing child ${childId}.`);
        continue;
      }
      if (child.parentId !== block.id) {
        errors.push(`Block ${child.id} parent mismatch: expected ${block.id}, received ${String(child.parentId)}.`);
      }
      if (block.type === 'callout' && CALLOUT_FORBIDDEN_CHILDREN.has(child.type)) {
        errors.push(`Lark Callout ${block.id} cannot contain ${child.type} child ${child.id}.`);
      }
      if (block.type === 'table' && child.type !== 'table_cell') {
        errors.push(`Lark Table ${block.id} may only contain table_cell children; received ${child.type}.`);
      }
    }
    if (block.type === 'table_cell' && block.children.length === 0) {
      errors.push(`Lark table cell ${block.id} must contain a child block.`);
    }
  }
  return errors;
}

export function assertValidLastForLark(last: LASTModel): void {
  const errors = validateLastForLark(last);
  if (errors.length > 0) throw new Error(`Invalid Lark parent-child structure:\n${errors.join('\n')}`);
}
