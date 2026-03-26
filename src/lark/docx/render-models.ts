export interface RenderMediaTokenMapping {
  kind: 'image' | 'file';
  sourceBlockId: string;
  createdBlockId: string;
  localPath: string;
  token: string;
}

export interface RenderFailedNode {
  sourceBlockId: string;
  blockType: number;
  parentBlockId: string;
  error: string;
}

export interface RenderBTTReport {
  createdBlockCount: number;
  mediaTokenMappings: RenderMediaTokenMapping[];
  failedNodes: RenderFailedNode[];
}
