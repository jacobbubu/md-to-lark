import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Root as HastRoot } from 'hast';
import { hastToLAST, markdownToHast } from '../src/pipeline/index.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const richFixturePath = path.join(currentDir, 'fixtures', 'md', 'rich-gfm.md');

test('markdownToHast + hastToLAST converts rich GFM fixture to fragment LAST', async () => {
  const markdown = await readFile(richFixturePath, 'utf8');
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'fixture-rich' });

  assert.equal(hast.type, 'root');
  assert.equal(last.mode, 'fragment');
  assert.ok(Array.isArray(last.topLevel));
  assert.ok((last.topLevel?.length ?? 0) >= 4);

  assert.equal(last.indexes.byType.heading1?.length ?? 0, 1);
  assert.ok((last.indexes.byType.text?.length ?? 0) >= 1);
  assert.equal(last.indexes.byType.table?.length ?? 0, 1);
  assert.ok((last.indexes.byType.table_cell?.length ?? 0) > 0);
  assert.ok(Object.keys(last.indexes.textScopes).length > 0);
});

test('hastToLAST conversion is deterministic for same markdown input', async () => {
  const markdown = await readFile(richFixturePath, 'utf8');

  const hastA = await markdownToHast(markdown);
  const hastB = await markdownToHast(markdown);
  const lastA = hastToLAST(hastA, { mode: 'fragment', documentId: 'same' });
  const lastB = hastToLAST(hastB, { mode: 'fragment', documentId: 'same' });

  assert.deepEqual(lastA, lastB);
});

test('hastToLAST supports document mode with rootId', async () => {
  const markdown = '# Doc Root\n\nParagraph';
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'document', documentId: 'custom' });

  assert.equal(last.schema, 'LAST');
  assert.equal(last.id, 'doc_custom');
  assert.ok(typeof (last as { rootId?: unknown }).rootId === 'string');
  assert.equal((last as { topLevel?: unknown }).topLevel, undefined);
});

test('markdownToHast keeps leading frontmatter as a code block', async () => {
  const markdown = [
    '---',
    'title: "Frontmatter Title"',
    'author: "Alice"',
    'url_handlers:',
    '  yt_dlp:',
    '    prefixes:',
    '      - "youtube.com"',
    '---',
    '',
    '# Real Heading',
    '',
    'Body paragraph',
    '',
  ].join('\n');

  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'fm' });

  const codeIds = last.indexes.byType.code ?? [];
  assert.equal(codeIds.length, 1);
  const code = codeIds[0] ? last.blocks[codeIds[0]] : undefined;
  const codeText =
    code && 'payload' in code && Array.isArray(code.payload.inlines)
      ? code.payload.inlines
          .map((inline) => ('text' in inline && typeof inline.text === 'string' ? inline.text : ''))
          .join('')
      : '';
  assert.equal(codeText.includes('title: "Frontmatter Title"'), true);
  assert.equal(codeText.includes('url_handlers:'), true);
  assert.equal(codeText.endsWith('\n'), false);

  const headingIds = last.indexes.byType.heading1 ?? [];
  assert.equal(headingIds.length, 1);
  const heading = headingIds[0] ? last.blocks[headingIds[0]] : undefined;
  const headingText =
    heading && 'payload' in heading && Array.isArray(heading.payload.inlines)
      ? heading.payload.inlines
          .map((inline) => ('text' in inline && typeof inline.text === 'string' ? inline.text : ''))
          .join('')
          .trim()
      : '';
  assert.equal(headingText, 'Real Heading');
});

test('markdownToHast rewrites frontmatter to code block even with leading blank lines', async () => {
  const markdown = ['', '', '---', 'title: "Frontmatter Title"', 'author: "Alice"', '---', '', 'Body'].join('\n');
  const hast = await markdownToHast(markdown);
  const children = Array.isArray(hast.children) ? hast.children : [];
  const firstMeaningful = children.find((node) => {
    if (node.type === 'text') {
      return String((node as { value?: unknown }).value ?? '').trim().length > 0;
    }
    return true;
  });
  assert.ok(firstMeaningful && firstMeaningful.type === 'element');
  if (!firstMeaningful || firstMeaningful.type !== 'element') return;
  assert.equal(firstMeaningful.tagName, 'pre');
});

test('hastToLAST blockquote strips only boundary newlines', async () => {
  const markdown = ['> quoted line', '', 'tail'].join('\n');
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'quote-trim' });

  const quoteIds = last.indexes.byType.quote ?? [];
  assert.equal(quoteIds.length, 1);
  const quoteBlock = quoteIds[0] ? last.blocks[quoteIds[0]] : undefined;
  assert.ok(
    quoteBlock && 'payload' in quoteBlock && Array.isArray(quoteBlock.payload.inlines),
    'expected quote block with inline payload',
  );

  const quoteText = (quoteBlock?.payload.inlines ?? [])
    .map((inline) => ('text' in inline && typeof inline.text === 'string' ? inline.text : ''))
    .join('');

  assert.equal(quoteText, 'quoted line');
  assert.equal(quoteText.startsWith('\n'), false);
  assert.equal(quoteText.endsWith('\n'), false);
});

test('hastToLAST unknown block element trims boundary newlines', () => {
  const hast: HastRoot = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'custom-block',
        properties: {},
        children: [{ type: 'text', value: '\nunknown payload\n' }],
      },
    ],
  };

  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'unknown-trim' });
  const textIds = last.indexes.byType.text ?? [];
  assert.equal(textIds.length, 1);
  const textBlock = textIds[0] ? last.blocks[textIds[0]] : undefined;
  assert.ok(
    textBlock && 'payload' in textBlock && Array.isArray(textBlock.payload.inlines),
    'expected text block with inline payload',
  );

  const text = (textBlock?.payload.inlines ?? [])
    .map((inline) => ('text' in inline && typeof inline.text === 'string' ? inline.text : ''))
    .join('');
  assert.equal(text, 'unknown payload');
});

test('hastToLAST code block trims exactly one trailing newline', async () => {
  const markdown = ['```text', 'line-1', '', '```', ''].join('\n');
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'code-tail-trim' });

  const codeIds = last.indexes.byType.code ?? [];
  assert.equal(codeIds.length, 1);
  const codeBlock = codeIds[0] ? last.blocks[codeIds[0]] : undefined;
  assert.ok(
    codeBlock && 'payload' in codeBlock && Array.isArray(codeBlock.payload.inlines),
    'expected code block with inline payload',
  );

  const codeText = (codeBlock?.payload.inlines ?? [])
    .map((inline) => ('text' in inline && typeof inline.text === 'string' ? inline.text : ''))
    .join('');
  assert.equal(codeText, 'line-1\n');
  assert.equal(codeText.endsWith('\n\n'), false);
});

test('markdownToHast + hastToLAST maps KaTeX inline/display math to equation inlines', async () => {
  const markdown = ['Inline formula $a^2 + b^2 = c^2$ in sentence.', '', '$$', 'E = mc^2', '$$', ''].join('\n');
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'katex' });

  const textIds = last.indexes.byType.text ?? [];
  assert.ok(textIds.length >= 2);
  assert.equal(last.indexes.byType.code?.length ?? 0, 0);

  const equations: string[] = [];
  let hasInlineMathSentence = false;
  for (const textId of textIds) {
    const block = last.blocks[textId];
    if (!block || block.type !== 'text') continue;
    const kinds = block.payload.inlines.map((inline) => inline.kind);
    if (kinds.includes('equation') && kinds.includes('text_run')) {
      hasInlineMathSentence = true;
    }
    for (const inline of block.payload.inlines) {
      if (inline.kind !== 'equation') continue;
      equations.push(inline.latex ?? '');
    }
  }

  assert.equal(hasInlineMathSentence, true);
  assert.deepEqual(equations, ['a^2 + b^2 = c^2', 'E = mc^2']);
});

test('hastToLAST converts standalone supported links into iframe blocks', async () => {
  const markdown = ['[Bilibili](https://www.bilibili.com/video/BV1xxxxxx)', '', 'tail'].join('\n');
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'iframe-standalone' });

  const iframeIds = last.indexes.byType.iframe ?? [];
  assert.equal(iframeIds.length, 1);

  const iframe = iframeIds[0] ? last.blocks[iframeIds[0]] : undefined;
  assert.ok(iframe && iframe.type === 'iframe');
  if (!iframe || iframe.type !== 'iframe') return;
  assert.equal(iframe.payload.component.iframeType, 'bilibili');
  assert.equal(iframe.payload.component.url, 'https://www.bilibili.com/video/BV1xxxxxx');
});

test('hastToLAST table cell converts standalone image/link-to-iframe into rich blocks', async () => {
  const markdown = [
    '| type | content |',
    '| --- | --- |',
    '| image | ![tiny](./assets/tiny.png) |',
    '| iframe | [Bilibili](https://www.bilibili.com/video/BV1GJ411x7h7) |',
  ].join('\n');
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'table-rich-cell' });

  const tableId = last.indexes.byType.table?.[0];
  assert.ok(tableId, 'expected one table block');
  const table = tableId ? last.blocks[tableId] : undefined;
  assert.ok(table && table.type === 'table');
  if (!table || table.type !== 'table') return;

  const columnSize = table.payload.columnSize ?? 0;
  const cells = table.payload.cells ?? table.children;
  const imageCellId = cells[1 * columnSize + 1];
  const iframeCellId = cells[2 * columnSize + 1];
  assert.ok(imageCellId);
  assert.ok(iframeCellId);
  const imageCell = imageCellId ? last.blocks[imageCellId] : undefined;
  const iframeCell = iframeCellId ? last.blocks[iframeCellId] : undefined;
  assert.ok(imageCell && imageCell.type === 'table_cell');
  assert.ok(iframeCell && iframeCell.type === 'table_cell');
  if (!imageCell || imageCell.type !== 'table_cell' || !iframeCell || iframeCell.type !== 'table_cell') return;

  const imageChild = imageCell.children[0] ? last.blocks[imageCell.children[0]] : undefined;
  const iframeChild = iframeCell.children[0] ? last.blocks[iframeCell.children[0]] : undefined;
  assert.ok(imageChild && imageChild.type === 'image');
  assert.ok(iframeChild && iframeChild.type === 'iframe');
  if (!imageChild || imageChild.type !== 'image' || !iframeChild || iframeChild.type !== 'iframe') return;
  assert.equal(imageChild.selector?.attrs?.sourceUrl, './assets/tiny.png');
  assert.equal(iframeChild.payload.component.iframeType, 'bilibili');
  assert.equal(iframeChild.payload.component.url, 'https://www.bilibili.com/video/BV1GJ411x7h7');
});
