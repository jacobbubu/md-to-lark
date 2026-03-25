import type { LarkDocxBlock } from '../lark/types.js';

export interface BTTNode {
  blockId: string;
  parentId: string;
  blockType: number;
  blockTypeName: string;
  rawBlock: LarkDocxBlock;
  children: BTTNode[];
}

export interface BTTDocument {
  schema: 'BTT';
  version: '1.0.0';
  documentId: string;
  generatedAt: string;
  rootBlockId: string;
  totalBlocks: number;
  missingChildren: string[];
  root: BTTNode;
  flatBlocks: Record<string, LarkDocxBlock>;
}
