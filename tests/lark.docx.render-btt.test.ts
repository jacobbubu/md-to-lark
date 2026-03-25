import assert from 'node:assert/strict';
import test from 'node:test';
import { RateLimiter } from '../src/shared/rate-limiter.js';
import { renderBTTToDocument } from '../src/lark/docx/render-btt.js';

test('renderBTTToDocument removes invalid relative link urls but keeps allowed absolute urls', async () => {
  const calls: unknown[] = [];
  const client = {
    docx: {
      documentBlockChildren: {
        create: async (request: unknown) => {
          calls.push(request);
          return {
            code: 0,
            data: {
              children: [
                {
                  block_id: 'created_text',
                  block_type: 2,
                  children: [],
                },
              ],
            },
          };
        },
      },
    },
  };

  const rootNode = {
    blockId: 'b_root',
    blockType: 1,
    rawBlock: { block_id: 'b_root', block_type: 1, children: ['b_text'] },
    children: [
      {
        blockId: 'b_text',
        blockType: 2,
        rawBlock: {
          block_id: 'b_text',
          parent_id: 'b_root',
          block_type: 2,
          children: [],
          text: {
            elements: [
              {
                text_run: {
                  content: 'relative link',
                  text_element_style: {
                    italic: true,
                    link: {
                      url: '/@someone/post-abc',
                    },
                  },
                },
              },
              {
                text_run: {
                  content: 'absolute link',
                  text_element_style: {
                    italic: true,
                    link: {
                      url: 'https://example.com/a',
                    },
                  },
                },
              },
            ],
          },
        },
        children: [],
      },
    ],
  };

  await renderBTTToDocument(
    client as never,
    'doc_id',
    'root_block',
    rootNode as never,
    undefined,
    new RateLimiter(0),
    new RateLimiter(0),
  );

  assert.equal(calls.length, 1);

  const call = calls[0] as {
    data?: {
      children?: Array<{
        text?: {
          elements?: Array<{
            text_run?: {
              text_element_style?: Record<string, unknown>;
            };
          }>;
        };
      }>;
    };
  };

  const createChild = call.data?.children?.[0];
  const elements = createChild?.text?.elements ?? [];
  assert.equal(elements.length, 2);

  const style0 = elements[0]?.text_run?.text_element_style ?? {};
  const style1 = elements[1]?.text_run?.text_element_style ?? {};

  assert.equal(Object.prototype.hasOwnProperty.call(style0, 'link'), false);
  assert.deepEqual(style1.link, { url: 'https://example.com/a' });
});

test('renderBTTToDocument batches sibling leaf text blocks under same parent', async () => {
  const createCalls: unknown[] = [];
  let nextId = 1;
  const client = {
    docx: {
      documentBlockChildren: {
        create: async (request: unknown) => {
          createCalls.push(request);
          const children =
            ((request as { data?: { children?: Array<Record<string, unknown>> } }).data?.children ?? []) as Array<
              Record<string, unknown>
            >;
          return {
            code: 0,
            data: {
              children: children.map((item) => ({
                block_id: `created_${nextId++}`,
                block_type: typeof item.block_type === 'number' ? item.block_type : 2,
                children: [],
              })),
            },
          };
        },
      },
    },
  };

  const rootNode = {
    blockId: 'b_root',
    blockType: 1,
    rawBlock: { block_id: 'b_root', block_type: 1, children: ['b_1', 'b_2', 'b_3'] },
    children: [
      {
        blockId: 'b_1',
        blockType: 2,
        rawBlock: {
          block_id: 'b_1',
          parent_id: 'b_root',
          block_type: 2,
          children: [],
          text: { elements: [{ text_run: { content: 'a' } }] },
        },
        children: [],
      },
      {
        blockId: 'b_2',
        blockType: 2,
        rawBlock: {
          block_id: 'b_2',
          parent_id: 'b_root',
          block_type: 2,
          children: [],
          text: { elements: [{ text_run: { content: 'b' } }] },
        },
        children: [],
      },
      {
        blockId: 'b_3',
        blockType: 3,
        rawBlock: {
          block_id: 'b_3',
          parent_id: 'b_root',
          block_type: 3,
          children: [],
          heading1: { elements: [{ text_run: { content: 'c' } }] },
        },
        children: [],
      },
    ],
  };

  await renderBTTToDocument(
    client as never,
    'doc_id',
    'root_block',
    rootNode as never,
    undefined,
    new RateLimiter(0),
    new RateLimiter(0),
  );

  assert.equal(createCalls.length, 1);
  const requestChildren =
    ((createCalls[0] as { data?: { children?: unknown[] } }).data?.children as unknown[]) ?? [];
  assert.equal(requestChildren.length, 3);
});

test('renderBTTToDocument batches sibling non-leaf blocks and keeps child rendering order', async () => {
  const createCalls: Array<{
    parentId: string;
    children: Array<Record<string, unknown>>;
  }> = [];
  let nextId = 1;
  const client = {
    docx: {
      documentBlockChildren: {
        create: async (request: unknown) => {
          const row = request as {
            path?: { block_id?: string };
            data?: { children?: Array<Record<string, unknown>> };
          };
          const parentId = row.path?.block_id ?? '';
          const children = row.data?.children ?? [];
          createCalls.push({ parentId, children });
          return {
            code: 0,
            data: {
              children: children.map((item) => ({
                block_id: `created_${nextId++}`,
                block_type: typeof item.block_type === 'number' ? item.block_type : 2,
                children: [],
              })),
            },
          };
        },
      },
    },
  };

  const rootNode = {
    blockId: 'root',
    blockType: 1,
    rawBlock: { block_id: 'root', block_type: 1, children: ['b1', 'b2'] },
    children: [
      {
        blockId: 'b1',
        blockType: 12,
        rawBlock: {
          block_id: 'b1',
          parent_id: 'root',
          block_type: 12,
          children: ['b1t'],
          bullet: { elements: [{ text_run: { content: 'item-1' } }] },
        },
        children: [
          {
            blockId: 'b1t',
            blockType: 2,
            rawBlock: {
              block_id: 'b1t',
              parent_id: 'b1',
              block_type: 2,
              children: [],
              text: { elements: [{ text_run: { content: 'child-1' } }] },
            },
            children: [],
          },
        ],
      },
      {
        blockId: 'b2',
        blockType: 12,
        rawBlock: {
          block_id: 'b2',
          parent_id: 'root',
          block_type: 12,
          children: ['b2t'],
          bullet: { elements: [{ text_run: { content: 'item-2' } }] },
        },
        children: [
          {
            blockId: 'b2t',
            blockType: 2,
            rawBlock: {
              block_id: 'b2t',
              parent_id: 'b2',
              block_type: 2,
              children: [],
              text: { elements: [{ text_run: { content: 'child-2' } }] },
            },
            children: [],
          },
        ],
      },
    ],
  };

  await renderBTTToDocument(
    client as never,
    'doc_id',
    'root_block',
    rootNode as never,
    undefined,
    new RateLimiter(0),
    new RateLimiter(0),
  );

  assert.equal(createCalls.length, 3);
  assert.equal(createCalls[0]?.parentId, 'root_block');
  assert.equal(createCalls[0]?.children.length, 2);
  assert.equal(createCalls[1]?.parentId, 'created_1');
  assert.equal(createCalls[1]?.children.length, 1);
  assert.equal(createCalls[2]?.parentId, 'created_2');
  assert.equal(createCalls[2]?.children.length, 1);
});

test('renderBTTToDocument patches table cell text block with right align without recreating', async () => {
  const createCalls: unknown[] = [];
  const patchCalls: unknown[] = [];
  const deleteCalls: unknown[] = [];

  const client = {
    docx: {
      documentBlockChildren: {
        create: async (request: unknown) => {
          createCalls.push(request);
          const row = request as {
            path?: { block_id?: string };
            data?: { children?: Array<{ block_type?: number }> };
          };
          const parentId = row.path?.block_id ?? '';
          const blockType = row.data?.children?.[0]?.block_type ?? 0;

          if (blockType === 31) {
            return {
              code: 0,
              data: {
                children: [
                  {
                    block_id: 'table_created',
                    block_type: 31,
                    children: ['cell_created'],
                  },
                ],
              },
            };
          }

          if (blockType === 2 && parentId === 'cell_created') {
            return {
              code: 0,
              data: {
                children: [
                  {
                    block_id: 'cell_text_created',
                    block_type: 2,
                    children: [],
                  },
                ],
              },
            };
          }

          return {
            code: 0,
            data: {
              children: [
                {
                  block_id: `created_${createCalls.length}`,
                  block_type: blockType,
                  children: [],
                },
              ],
            },
          };
        },
        batchDelete: async (request: unknown) => {
          deleteCalls.push(request);
          return { code: 0, data: {} };
        },
      },
      documentBlock: {
        list: async () => ({
          code: 0,
          data: {
            items: [
              { block_id: 'table_created', block_type: 31, children: ['cell_created'] },
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
    },
  };

  const rootNode = {
    blockId: 'root_src',
    blockType: 1,
    rawBlock: { block_id: 'root_src', block_type: 1, children: ['table_src'] },
    children: [
      {
        blockId: 'table_src',
        blockType: 31,
        rawBlock: {
          block_id: 'table_src',
          parent_id: 'root_src',
          block_type: 31,
          children: ['cell_src'],
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
              parent_id: 'table_src',
              block_type: 32,
              children: ['text_src'],
              table_cell: {},
            },
            children: [
              {
                blockId: 'text_src',
                blockType: 2,
                rawBlock: {
                  block_id: 'text_src',
                  parent_id: 'cell_src',
                  block_type: 2,
                  children: [],
                  text: {
                    style: {
                      align: 3,
                    },
                    elements: [{ text_run: { content: '1,024' } }],
                  },
                },
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };

  await renderBTTToDocument(
    client as never,
    'doc_id',
    'root_block',
    rootNode as never,
    undefined,
    new RateLimiter(0),
    new RateLimiter(0),
  );

  assert.equal(patchCalls.length, 1);
  assert.equal(deleteCalls.length, 0);
  assert.equal(createCalls.length, 1);

  const patchRequest = patchCalls[0] as {
    data?: {
      update_text?: {
        style?: {
          align?: number;
        };
        fields?: number[];
      };
    };
  };
  assert.equal(patchRequest.data?.update_text?.style?.align, 3);
  assert.deepEqual(patchRequest.data?.update_text?.fields, [1]);
});
