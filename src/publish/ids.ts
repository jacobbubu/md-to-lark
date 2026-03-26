import path from 'node:path';

export function buildPipelineDocumentId(inputFile: string): string {
  const base = path.basename(inputFile, path.extname(inputFile));
  const safe = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe ? `md-${safe}` : 'md-doc';
}
