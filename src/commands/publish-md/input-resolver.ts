import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export interface PublishInputSet {
  mode: 'single' | 'directory';
  rootPath: string;
  markdownFiles: string[];
}

export function isMarkdownFilePath(filePath: string): boolean {
  return /\.md$/i.test(filePath);
}

async function collectMarkdownFilesRecursive(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectMarkdownFilesRecursive(fullPath);
      files.push(...nested);
      continue;
    }
    if (entry.isFile() && isMarkdownFilePath(entry.name)) {
      files.push(fullPath);
    }
  }

  files.sort((a, b) => a.localeCompare(b, 'en'));
  return files;
}

export async function resolvePublishInputSet(inputPath: string): Promise<PublishInputSet> {
  const absolute = path.resolve(inputPath);
  const stats = await stat(absolute);
  if (stats.isFile()) {
    if (!isMarkdownFilePath(absolute)) {
      throw new Error(`Input file is not .md: ${absolute}`);
    }
    return {
      mode: 'single',
      rootPath: path.dirname(absolute),
      markdownFiles: [absolute],
    };
  }

  if (stats.isDirectory()) {
    const markdownFiles = await collectMarkdownFilesRecursive(absolute);
    if (markdownFiles.length === 0) {
      throw new Error(`No .md files found under directory: ${absolute}`);
    }
    return {
      mode: 'directory',
      rootPath: absolute,
      markdownFiles,
    };
  }

  throw new Error(`Input path is neither file nor directory: ${absolute}`);
}
