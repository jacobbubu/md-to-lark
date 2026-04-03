import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCreatePayloadFromRawBlock,
  canUseElementsOnlyPatch,
  createRenderBatchEntry,
  extractTextAlignForPatchFromRawBlock,
  extractTextElementsForPatchFromRawBlock,
  getExpectedTableCellCount,
} from '../src/lark/docx/render-payload.js';

test('buildCreatePayloadFromRawBlock sanitizes links, file fields, and table payloads', () => {
  const textPayload = buildCreatePayloadFromRawBlock({
    block_id: 'b_text',
    block_type: 2,
    text: {
      style: {
        align: 3,
      },
      elements: [
        {
          text_run: {
            content: 'bad-link',
            text_element_style: {
              link: {
                url: '/relative/path',
              },
              italic: true,
            },
          },
        },
      ],
    },
  });
  assert.equal(
    (textPayload?.text as { elements?: Array<{ text_run?: { text_element_style?: Record<string, unknown> } }> }).elements?.[0]
      ?.text_run?.text_element_style?.link,
    undefined,
  );

  const filePayload = buildCreatePayloadFromRawBlock({
    block_id: 'b_file',
    block_type: 23,
    file: {
      local_path: '/tmp/a.pdf',
      media_kind: 'file',
      token: 'old_token',
      file_token: 'old_file_token',
      name: 'a.pdf',
      view_type: 2,
    },
  });
  assert.deepEqual(filePayload?.file, { view_type: 2 });

  const imagePayload = buildCreatePayloadFromRawBlock({
    block_id: 'b_image',
    block_type: 27,
    image: {
      local_path: '/tmp/a.png',
      token: '',
      width: 1000,
      height: 0,
      align: 1,
    },
  });
  assert.deepEqual(imagePayload?.image, { width: 1000, align: 1 });

  const tablePayload = buildCreatePayloadFromRawBlock({
    block_id: 'b_table',
    block_type: 31,
    table: {
      cells: ['x', 'y'],
      property: {
        row_size: 1.2,
        column_size: 2.7,
        column_width: [120.2, -1, 0, 300.8],
        header_row: false,
        header_column: false,
        merge_info: [],
      },
    },
  });
  assert.equal((tablePayload?.table as { cells?: unknown }).cells, undefined);
  assert.deepEqual((tablePayload?.table as { property?: { column_width?: number[] } }).property?.column_width, [120, 301]);
});

test('render payload helpers detect patch-safe styles and normalize text patch input', () => {
  assert.equal(
    canUseElementsOnlyPatch({
      block_type: 2,
      text: {
        style: { align: 'right' },
      },
    }),
    true,
  );
  assert.equal(
    canUseElementsOnlyPatch({
      block_type: 14,
      code: {
        style: { language: 49 },
      },
    }),
    false,
  );
  assert.equal(
    extractTextAlignForPatchFromRawBlock({
      block_type: 2,
      text: {
        style: { align: 'center' },
      },
    }),
    2,
  );

  const elements = extractTextElementsForPatchFromRawBlock({
    block_type: 2,
    text: {
      elements: [
        {
          text_run: {
            content: 'hello',
            text_element_style: {
              link: {
                url: '/bad',
              },
            },
          },
        },
      ],
    },
  });
  assert.equal(
    (elements?.[0] as { text_run?: { text_element_style?: Record<string, unknown> } })?.text_run?.text_element_style?.link,
    undefined,
  );
});

test('createRenderBatchEntry skips special block types and keeps source ids for batch-safe nodes', () => {
  const skipped = createRenderBatchEntry({
    blockId: 'b_file',
    blockType: 23,
    rawBlock: {
      block_id: 'b_file',
      block_type: 23,
      file: {},
    },
    children: [],
  } as never);
  assert.equal(skipped, null);

  const entry = createRenderBatchEntry({
    blockId: 'b_text',
    blockType: 2,
    rawBlock: {
      block_id: 'source_text',
      block_type: 2,
      text: {},
    },
    children: [],
  } as never);
  assert.ok(entry);
  assert.equal(entry?.sourceBlockId, 'source_text');
  assert.equal(entry?.createPayload.block_type, 2);
});

test('getExpectedTableCellCount prefers the larger of property size and cell children count', () => {
  const expected = getExpectedTableCellCount({
    blockId: 'b_table',
    blockType: 31,
    rawBlock: {
      block_id: 'b_table',
      block_type: 31,
      table: {
        property: {
          row_size: 1,
          column_size: 1,
        },
      },
    },
    children: [
      { blockId: 'c1', blockType: 32, rawBlock: {}, children: [] },
      { blockId: 'c2', blockType: 32, rawBlock: {}, children: [] },
    ],
  } as never);
  assert.equal(expected, 2);
});
