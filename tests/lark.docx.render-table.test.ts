import assert from 'node:assert/strict';
import test from 'node:test';
import { RateLimiter } from '../src/shared/rate-limiter.js';
import { renderCreatedTableNode } from '../src/lark/docx/render-table.js';

test('renderCreatedTableNode patches cell text in place when patch-safe', async () => {
  const patchCalls: unknown[] = [];
  const renderChildrenCalls: Array<{ parentId: string; childCount: number }> = [];

  const client = {
    docx: {
      documentBlock: {
        list: async () => ({
          code: 0,
          data: {
            items: [
              { block_id: 'cell_created', block_type: 32, children: ['default_cell_text'] },
              { block_id: 'default_cell_text', block_type: 2, children: [] },
            ],
            has_more: false,
            page_token: '',
          },
        }),
        patch: async (request: unknown) => {
          patchCalls.push(request);
          return {
            code: 0,
            data: {
              block: {
                block_id: 'default_cell_text',
                block_type: 2,
                children: [],
              },
            },
          };
        },
      },
      documentBlockChildren: {
        batchDelete: async () => {
          throw new Error('batchDelete should not be called in patch path');
        },
      },
    },
  };

  await renderCreatedTableNode({
    client: client as never,
    documentId: 'doc_id',
    createdBlockId: 'table_created',
    createdBlock: {
      block_id: 'table_created',
      block_type: 31,
      children: ['cell_created'],
    },
    node: {
      blockId: 'table_src',
      blockType: 31,
      rawBlock: {
        block_id: 'table_src',
        block_type: 31,
        table: {
          property: {
            row_size: 1,
            column_size: 1,
          },
        },
      },
      children: [
        {
          blockId: 'cell_src',
          blockType: 32,
          rawBlock: {
            block_id: 'cell_src',
            block_type: 32,
            table_cell: {},
          },
          children: [
            {
              blockId: 'text_src',
              blockType: 2,
              rawBlock: {
                block_id: 'text_src',
                block_type: 2,
                text: {
                  style: {
                    align: 'right',
                  },
                  elements: [{ text_run: { content: '42' } }],
                },
              },
              children: [],
            },
          ],
        },
      ],
    } as never,
    authOptions: undefined,
    docxLimiter: new RateLimiter(0),
    renderChildren: async (parentId, nodes) => {
      renderChildrenCalls.push({ parentId, childCount: nodes.length });
    },
  });

  assert.equal(renderChildrenCalls.length, 1);
  assert.deepEqual(renderChildrenCalls[0], { parentId: 'table_created', childCount: 0 });
  const request = patchCalls[0] as {
    path?: { block_id?: string };
    data?: { update_text?: { style?: { align?: number } } };
  };
  assert.equal(request.path?.block_id, 'default_cell_text');
  assert.equal(request.data?.update_text?.style?.align, 3);
});

test('renderCreatedTableNode deletes default cell child and falls back to recursive render when patch is not safe', async () => {
  const deleteCalls: unknown[] = [];
  const renderChildrenCalls: Array<{ parentId: string; childCount: number }> = [];

  const client = {
    docx: {
      documentBlockChildren: {
        batchDelete: async (request: unknown) => {
          deleteCalls.push(request);
          return { code: 0, data: {} };
        },
      },
    },
  };

  await renderCreatedTableNode({
    client: client as never,
    documentId: 'doc_id',
    createdBlockId: 'table_created',
    createdBlock: {
      block_id: 'table_created',
      block_type: 31,
      children: ['cell_created'],
    },
    node: {
      blockId: 'table_src',
      blockType: 31,
      rawBlock: {
        block_id: 'table_src',
        block_type: 31,
        table: {
          property: {
            row_size: 1,
            column_size: 1,
          },
        },
      },
      children: [
        {
          blockId: 'cell_src',
          blockType: 32,
          rawBlock: {
            block_id: 'cell_src',
            block_type: 32,
            table_cell: {},
          },
          children: [
            {
              blockId: 'code_src',
              blockType: 14,
              rawBlock: {
                block_id: 'code_src',
                block_type: 14,
                code: {
                  style: {
                    language: 49,
                  },
                },
              },
              children: [],
            },
          ],
        },
      ],
    } as never,
    authOptions: undefined,
    docxLimiter: new RateLimiter(0),
    renderChildren: async (parentId, nodes) => {
      renderChildrenCalls.push({ parentId, childCount: nodes.length });
    },
  });

  assert.equal(deleteCalls.length, 1);
  const deleteRequest = deleteCalls[0] as { path?: { block_id?: string } };
  assert.equal(deleteRequest.path?.block_id, 'cell_created');
  assert.deepEqual(renderChildrenCalls, [
    { parentId: 'cell_created', childCount: 1 },
    { parentId: 'table_created', childCount: 0 },
  ]);
});
