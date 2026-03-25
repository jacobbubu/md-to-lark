import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { markdownToHast, hastToLAST } from '../src/pipeline/index.js';
import { convertLASTToBTT } from '../src/interop/index.js';
import type { LASTBlockNode, LASTTextualBlock, LASTTextualBlockType } from '../src/last/types.js';
import {
  applyStandaloneAttachmentTransforms,
  applyTableColumnWidthHeuristics,
  collectMermaidPatches,
  ensureLastBlockBttIds,
  patchBTTForMermaidAndAssets,
} from '../src/commands/publish-md/pipeline-transform.js';

function isTextualBlock(block: LASTBlockNode): block is LASTTextualBlock<LASTTextualBlockType> {
  return (
    block.type === 'text' ||
    block.type === 'heading1' ||
    block.type === 'heading2' ||
    block.type === 'heading3' ||
    block.type === 'heading4' ||
    block.type === 'heading5' ||
    block.type === 'heading6' ||
    block.type === 'heading7' ||
    block.type === 'heading8' ||
    block.type === 'heading9' ||
    block.type === 'bullet' ||
    block.type === 'ordered' ||
    block.type === 'code' ||
    block.type === 'quote' ||
    block.type === 'todo'
  );
}

function getCellTextAlign(last: ReturnType<typeof hastToLAST>, rowIndex: number, columnIndex: number): unknown {
  const tableId = last.indexes.byType.table?.[0];
  assert.ok(tableId, 'expected one table block');
  const table = tableId ? last.blocks[tableId] : undefined;
  assert.ok(table && table.type === 'table', 'table block must exist');
  if (!table || table.type !== 'table') return undefined;

  const columnSize = table.payload.columnSize ?? 0;
  const cells = table.payload.cells ?? table.children;
  const cellId = cells[rowIndex * columnSize + columnIndex];
  assert.ok(cellId, `missing cell at row=${rowIndex}, col=${columnIndex}`);
  const cell = cellId ? last.blocks[cellId] : undefined;
  assert.ok(cell && cell.type === 'table_cell', 'table cell must exist');
  if (!cell || cell.type !== 'table_cell') return undefined;
  const textChild = cell.children
    .map((id) => last.blocks[id])
    .find((candidate): candidate is LASTTextualBlock<LASTTextualBlockType> =>
      Boolean(candidate && isTextualBlock(candidate)),
    );
  assert.ok(textChild, 'table cell text child must exist');
  return textChild?.payload.style.align;
}

test('applyTableColumnWidthHeuristics right-aligns numeric-like table columns', async () => {
  const markdown = [
    '| 模块 | 月成本 | 增长率 | 备注 |',
    '| --- | --- | --- | --- |',
    '| API Gateway | CNY 12,340.50 | 30% | 稳定 |',
    '| Worker Pool | $8,920 | 12.5 % | N/A |',
    '| Scheduler | USD -300 | 0% | inf |',
    '| Data Sync | RMB 3,000 | n/a | 观察中 |',
  ].join('\n');

  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'table-align' });
  applyTableColumnWidthHeuristics(last);

  const tableId = last.indexes.byType.table?.[0];
  assert.ok(tableId, 'expected one table block');
  const table = tableId ? last.blocks[tableId] : undefined;
  assert.ok(table && table.type === 'table', 'table block must exist');
  if (!table || table.type !== 'table') return;

  const rowSize = table.payload.rowSize ?? 0;
  const columnSize = table.payload.columnSize ?? 0;
  assert.equal(rowSize, 5);
  assert.equal(columnSize, 4);

  // Header row defaults to center alignment when markdown has no explicit align declaration.
  assert.equal(getCellTextAlign(last, 0, 1), 'center');
  assert.equal(getCellTextAlign(last, 0, 2), 'center');

  // Numeric-like columns are right-aligned in data rows.
  for (let rowIndex = 1; rowIndex < rowSize; rowIndex += 1) {
    assert.equal(getCellTextAlign(last, rowIndex, 1), 'right');
    assert.equal(getCellTextAlign(last, rowIndex, 2), 'right');
  }

  // Text columns stay left-aligned.
  for (let rowIndex = 1; rowIndex < rowSize; rowIndex += 1) {
    assert.equal(getCellTextAlign(last, rowIndex, 0), 'left');
  }
  assert.equal(getCellTextAlign(last, 1, 3), 'left');
  assert.equal(getCellTextAlign(last, 4, 3), 'left');
});

test('explicit markdown table alignment disables numeric auto right-align', async () => {
  const markdown = [
    '| 模块 | 月成本 | 增长率 |',
    '| :--- | :--- | :--- |',
    '| API Gateway | CNY 12,340.50 | 30% |',
    '| Worker Pool | $8,920 | 12.5 % |',
  ].join('\n');

  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'table-align-explicit' });
  applyTableColumnWidthHeuristics(last);

  const tableId = last.indexes.byType.table?.[0];
  assert.ok(tableId, 'expected one table block');
  const table = tableId ? last.blocks[tableId] : undefined;
  assert.ok(table && table.type === 'table', 'table block must exist');
  if (!table || table.type !== 'table') return;
  assert.ok(Array.isArray(table.payload.columnAlign));
  assert.equal(table.payload.columnAlign?.[0], 'left');
  assert.equal(table.payload.columnAlign?.[1], 'left');
  assert.equal(table.payload.columnAlign?.[2], 'left');

  // Data rows should keep declared left alignment instead of numeric auto-right.
  assert.equal(getCellTextAlign(last, 1, 1), 'left');
  assert.equal(getCellTextAlign(last, 1, 2), 'left');
  assert.equal(getCellTextAlign(last, 2, 1), 'left');
  assert.equal(getCellTextAlign(last, 2, 2), 'left');
});

test('applyStandaloneAttachmentTransforms skips missing local file links', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'md-to-lark-asset-missing-'));
  try {
    const markdown = '[Sample DOCX](./assets/missing.docx)';
    const hast = await markdownToHast(markdown);
    const last = hastToLAST(hast, { mode: 'fragment', documentId: 'missing-file' });
    const assets = applyStandaloneAttachmentTransforms(last, tempDir);
    assert.equal(assets.size, 0);
    const textIds = last.indexes.byType.text ?? [];
    assert.equal(textIds.length, 1);
    const first = textIds[0] ? last.blocks[textIds[0]] : undefined;
    assert.ok(first && first.type === 'text');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('applyStandaloneAttachmentTransforms converts existing local file links to file blocks', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'md-to-lark-asset-exists-'));
  try {
    const assetsDir = path.join(tempDir, 'assets');
    await mkdir(assetsDir, { recursive: true });
    await writeFile(path.join(assetsDir, 'sample.docx'), 'doc', 'utf8');

    const markdown = '[Sample DOCX](./assets/sample.docx)';
    const hast = await markdownToHast(markdown);
    const last = hastToLAST(hast, { mode: 'fragment', documentId: 'existing-file' });
    const assets = applyStandaloneAttachmentTransforms(last, tempDir);
    assert.equal(assets.size, 1);
    const fileIds = Object.values(last.blocks)
      .filter((b) => b.type === 'file')
      .map((b) => b.id);
    assert.equal(fileIds.length, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('applyStandaloneAttachmentTransforms converts split markdown-link text runs with same href', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'md-to-lark-asset-split-link-'));
  try {
    const assetsDir = path.join(tempDir, 'assets');
    await mkdir(assetsDir, { recursive: true });
    await writeFile(path.join(assetsDir, 'sample.mp4'), 'video', 'utf8');

    const markdown = '[nash_su_-_e_acc_-_Claude_+_Figma-2024.mp4](./assets/sample.mp4)';
    const hast = await markdownToHast(markdown);
    const last = hastToLAST(hast, { mode: 'fragment', documentId: 'split-link-file' });
    const assets = applyStandaloneAttachmentTransforms(last, tempDir);
    assert.equal(assets.size, 1);
    const fileIds = Object.values(last.blocks)
      .filter((b) => b.type === 'file')
      .map((b) => b.id);
    assert.equal(fileIds.length, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('applyStandaloneAttachmentTransforms degrades missing local markdown image to text block', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'md-to-lark-image-missing-'));
  try {
    const markdown = '![missing image](./assets/not-found.png)';
    const hast = await markdownToHast(markdown);
    const last = hastToLAST(hast, { mode: 'fragment', documentId: 'missing-image' });
    const assets = applyStandaloneAttachmentTransforms(last, tempDir);
    assert.equal(assets.size, 0);
    const textBlock = Object.values(last.blocks).find((b) => b.type === 'text');
    assert.ok(textBlock, 'image block should be degraded to text when local file is missing');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('patchBTTForMermaidAndAssets converts mermaid code blocks to text-drawing by default', async () => {
  const markdown = ['```mermaid', 'flowchart TD', 'A[Start]-->B[End]', '```'].join('\n');
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'mermaid-default' });
  ensureLastBlockBttIds(last);

  const mermaidByBlockId = collectMermaidPatches(last);
  const btt = convertLASTToBTT(last, { documentId: 'mermaid-default' });
  patchBTTForMermaidAndAssets(btt, mermaidByBlockId, new Map());

  const codeId = last.indexes.byType.code?.[0];
  assert.ok(codeId, 'expected one code block');
  const patched = codeId ? btt.flatBlocks[codeId] : undefined;
  assert.ok(patched, 'patched block missing');
  assert.equal(patched?.block_type, 40);
  assert.equal(typeof patched?.add_ons, 'object');
});

test('patchBTTForMermaidAndAssets converts mermaid code blocks to board when target=board', async () => {
  const markdown = ['```mermaid', 'flowchart TD', 'A[Start]-->B[End]', '```'].join('\n');
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'mermaid-board' });
  ensureLastBlockBttIds(last);

  const mermaidByBlockId = collectMermaidPatches(last);
  const btt = convertLASTToBTT(last, { documentId: 'mermaid-board' });
  patchBTTForMermaidAndAssets(btt, mermaidByBlockId, new Map(), {
    mermaidRender: {
      target: 'board',
      board: {
        syntaxType: 2,
      },
    },
  });

  const codeId = last.indexes.byType.code?.[0];
  assert.ok(codeId, 'expected one code block');
  const patched = codeId ? btt.flatBlocks[codeId] : undefined;
  assert.ok(patched, 'patched block missing');
  assert.equal(patched?.block_type, 43);
  assert.deepEqual(patched?.board, {});
});
