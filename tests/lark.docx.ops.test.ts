import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  clearDocumentContent,
  createBoardPlantumlNode,
  createDocument,
  createDocumentChildren,
  getDocumentBlockById,
  getRawDocumentBlockById,
  isRelationMismatchError,
  listAllDocumentBlocks,
  listFolderChildren,
  normalizeDocumentId,
  patchTextBlockElements,
  replaceFileBlock,
  replaceImageBlock,
  resolveCreatedTableCellIds,
  uploadBinaryToNode,
  type LarkRequestOptions,
} from '../src/lark/docx/ops.js';
import { RateLimiter } from '../src/shared/rate-limiter.js';

interface CallEntry {
  method: string;
  request: unknown;
  authOptions: LarkRequestOptions;
}

type AsyncHandler = (request: unknown, authOptions: LarkRequestOptions) => Promise<unknown>;

interface ClientHandlers {
  driveFileList?: AsyncHandler;
  driveMediaUploadAll?: AsyncHandler;
  docxDocumentCreate?: AsyncHandler;
  docxDocumentBlockList?: AsyncHandler;
  docxDocumentBlockBatchUpdate?: AsyncHandler;
  docxDocumentBlockPatch?: AsyncHandler;
  docxDocumentBlockGet?: AsyncHandler;
  docxDocumentBlockChildrenBatchDelete?: AsyncHandler;
  docxDocumentBlockChildrenCreate?: AsyncHandler;
  boardV1WhiteboardNodeCreatePlantuml?: AsyncHandler;
}

function createFakeClient(handlers: ClientHandlers): { client: any; calls: CallEntry[] } {
  const calls: CallEntry[] = [];
  const invoke = async (
    method: string,
    handler: AsyncHandler | undefined,
    request: unknown,
    authOptions: LarkRequestOptions,
  ): Promise<unknown> => {
    calls.push({ method, request, authOptions });
    if (!handler) {
      throw new Error(`Missing handler for ${method}`);
    }
    return handler(request, authOptions);
  };

  const client = {
    drive: {
      file: {
        list: (request: unknown, authOptions: LarkRequestOptions) =>
          invoke('drive.file.list', handlers.driveFileList, request, authOptions),
      },
      media: {
        uploadAll: (request: unknown, authOptions: LarkRequestOptions) =>
          invoke('drive.media.uploadAll', handlers.driveMediaUploadAll, request, authOptions),
      },
    },
    docx: {
      document: {
        create: (request: unknown, authOptions: LarkRequestOptions) =>
          invoke('docx.document.create', handlers.docxDocumentCreate, request, authOptions),
      },
      documentBlock: {
        list: (request: unknown, authOptions: LarkRequestOptions) =>
          invoke('docx.documentBlock.list', handlers.docxDocumentBlockList, request, authOptions),
        batchUpdate: (request: unknown, authOptions: LarkRequestOptions) =>
          invoke('docx.documentBlock.batchUpdate', handlers.docxDocumentBlockBatchUpdate, request, authOptions),
        patch: (request: unknown, authOptions: LarkRequestOptions) =>
          invoke('docx.documentBlock.patch', handlers.docxDocumentBlockPatch, request, authOptions),
        get: (request: unknown, authOptions: LarkRequestOptions) =>
          invoke('docx.documentBlock.get', handlers.docxDocumentBlockGet, request, authOptions),
      },
      documentBlockChildren: {
        batchDelete: (request: unknown, authOptions: LarkRequestOptions) =>
          invoke(
            'docx.documentBlockChildren.batchDelete',
            handlers.docxDocumentBlockChildrenBatchDelete,
            request,
            authOptions,
          ),
        create: (request: unknown, authOptions: LarkRequestOptions) =>
          invoke('docx.documentBlockChildren.create', handlers.docxDocumentBlockChildrenCreate, request, authOptions),
      },
    },
    board: {
      v1: {
        whiteboardNode: {
          createPlantuml: (request: unknown, authOptions: LarkRequestOptions) =>
            invoke(
              'board.v1.whiteboardNode.createPlantuml',
              handlers.boardV1WhiteboardNodeCreatePlantuml,
              request,
              authOptions,
            ),
        },
      },
    },
  };

  return { client, calls };
}

test('normalizeDocumentId and isRelationMismatchError basic behavior', () => {
  assert.equal(normalizeDocumentId('doc_abc'), 'abc');
  assert.equal(normalizeDocumentId('abc'), 'abc');
  assert.equal(isRelationMismatchError(new Error('1770013 relation mismatch happened')), true);
  assert.equal(isRelationMismatchError(new Error('other error')), false);
});

test('listFolderChildren paginates and parses drive file entries', async () => {
  let turn = 0;
  const { client, calls } = createFakeClient({
    driveFileList: async () => {
      turn += 1;
      if (turn === 1) {
        return {
          code: 0,
          data: {
            files: [{ token: 'doc_1', name: 'A', type: 'docx' }],
            has_more: true,
            next_page_token: 'p2',
          },
        };
      }
      return {
        code: 0,
        data: {
          files: [
            { token: 'doc_2', name: 'B', type: 'docx' },
            { token: 'img_1', name: 'Pic', type: 'image' },
            { invalid: true },
          ],
          has_more: false,
          next_page_token: '',
        },
      };
    },
  });

  const entries = await listFolderChildren(client, 'fld_x', undefined, new RateLimiter(0));
  assert.deepEqual(entries, [
    { token: 'doc_1', name: 'A', type: 'docx' },
    { token: 'doc_2', name: 'B', type: 'docx' },
    { token: 'img_1', name: 'Pic', type: 'image' },
  ]);
  assert.equal(calls.filter((row) => row.method === 'drive.file.list').length, 2);
});

test('createDocument returns document id and validates response shape', async () => {
  {
    const { client } = createFakeClient({
      docxDocumentCreate: async () => ({
        code: 0,
        data: {
          document: {
            document_id: 'doccn_x',
          },
        },
      }),
    });

    const id = await createDocument(client, 'fld_x', 'Title', undefined, new RateLimiter(0));
    assert.equal(id, 'doccn_x');
  }

  {
    const { client } = createFakeClient({
      docxDocumentCreate: async () => ({
        code: 0,
        data: {
          document: {},
        },
      }),
    });
    await assert.rejects(
      () => createDocument(client, 'fld_x', 'Title', undefined, new RateLimiter(0)),
      /returned empty document_id/,
    );
  }
});

test('listAllDocumentBlocks paginates and filters invalid block rows', async () => {
  let turn = 0;
  const { client } = createFakeClient({
    docxDocumentBlockList: async () => {
      turn += 1;
      if (turn === 1) {
        return {
          code: 0,
          data: {
            items: [{ block_id: 'doc_root', block_type: 1, children: ['b1'] }, { invalid: true }],
            has_more: true,
            page_token: 'next',
          },
        };
      }
      return {
        code: 0,
        data: {
          items: [{ block_id: 'b1', block_type: 2, parent_id: 'doc_root', children: [] }],
          has_more: false,
          page_token: '',
        },
      };
    },
  });

  const blocks = await listAllDocumentBlocks(client, 'doc_abc', undefined, new RateLimiter(0));
  assert.deepEqual(blocks, [
    { block_id: 'doc_root', block_type: 1, children: ['b1'] },
    { block_id: 'b1', block_type: 2, parent_id: 'doc_root', children: [] },
  ]);
});

test('clearDocumentContent deletes root children in batches and returns root id', async () => {
  const state = {
    children: Array.from({ length: 120 }, (_, index) => `child_${index + 1}`),
  };

  const { client, calls } = createFakeClient({
    docxDocumentBlockList: async () => ({
      code: 0,
      data: {
        items: [
          {
            block_id: 'root_block',
            block_type: 1,
            children: [...state.children],
          },
        ],
        has_more: false,
        page_token: '',
      },
    }),
    docxDocumentBlockChildrenBatchDelete: async (request) => {
      const row = request as {
        data?: { start_index?: number; end_index?: number };
      };
      const end = row.data?.end_index ?? 0;
      state.children = state.children.slice(end);
      return { code: 0, data: {} };
    },
  });

  const rootId = await clearDocumentContent(client, 'doc_abc', undefined, new RateLimiter(0));
  assert.equal(rootId, 'root_block');
  assert.equal(state.children.length, 0);
  assert.equal(calls.filter((row) => row.method === 'docx.documentBlock.list').length, 1);
  assert.equal(calls.filter((row) => row.method === 'docx.documentBlockChildren.batchDelete').length, 3);

  const batchDeleteRequests = calls
    .filter((row) => row.method === 'docx.documentBlockChildren.batchDelete')
    .map(
      (row) =>
        ((row.request as { data?: { end_index?: number } }).data?.end_index as number | undefined) ?? Number.NaN,
    );
  assert.deepEqual(batchDeleteRequests, [50, 50, 20]);
});

test('createDocumentChildren expands table over max row/column limits', async () => {
  const { client, calls } = createFakeClient({
    docxDocumentBlockChildrenCreate: async () => ({
      code: 0,
      data: {
        children: [{ block_id: 'tbl_1', block_type: 31, children: [] }],
      },
    }),
    docxDocumentBlockBatchUpdate: async () => ({
      code: 0,
      data: {},
    }),
  });

  const tablePayload = {
    block_type: 31,
    table: {
      property: {
        row_size: 12,
        column_size: 10,
        column_width: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
        merge_info: [],
      },
    },
  } as Record<string, unknown>;

  const created = await createDocumentChildren(
    client,
    'doc_x',
    'root_x',
    [tablePayload],
    undefined,
    new RateLimiter(0),
  );
  assert.deepEqual(created, [{ block_id: 'tbl_1', block_type: 31, children: [] }]);

  const createCall = calls.find((row) => row.method === 'docx.documentBlockChildren.create');
  assert.ok(createCall);
  const createChildren = ((createCall?.request as { data?: { children?: unknown[] } }).data?.children ?? []) as Array<
    Record<string, unknown>
  >;
  const createdTable = createChildren[0];
  assert.ok(createdTable);

  const property = ((createdTable.table as { property?: Record<string, unknown> })?.property ?? {}) as Record<
    string,
    unknown
  >;
  assert.equal(property.row_size, 9);
  assert.equal(property.column_size, 9);
  assert.equal(Array.isArray(property.column_width), true);
  assert.equal((property.column_width as unknown[]).length, 9);

  const batchUpdates = calls.filter((row) => row.method === 'docx.documentBlock.batchUpdate');
  assert.equal(batchUpdates.length, 4);
  const totalRequestCount = batchUpdates.reduce((count, row) => {
    const requestList = (row.request as { data?: { requests?: unknown[] } }).data?.requests ?? [];
    return count + (Array.isArray(requestList) ? requestList.length : 0);
  }, 0);
  assert.equal(totalRequestCount, 4);
  const maxRequestCountPerCall = batchUpdates.reduce((max, row) => {
    const requestList = (row.request as { data?: { requests?: unknown[] } }).data?.requests ?? [];
    return Math.max(max, Array.isArray(requestList) ? requestList.length : 0);
  }, 0);
  assert.equal(maxRequestCountPerCall, 1);
});

test('createDocumentChildren uses 9x9 base then expands for 9x10 table', async () => {
  const { client, calls } = createFakeClient({
    docxDocumentBlockChildrenCreate: async () => ({
      code: 0,
      data: {
        children: [{ block_id: 'tbl_1', block_type: 31, children: [] }],
      },
    }),
    docxDocumentBlockBatchUpdate: async () => ({
      code: 0,
      data: {},
    }),
  });

  await createDocumentChildren(
    client,
    'doc_x',
    'root_x',
    [
      {
        block_type: 31,
        table: {
          property: {
            row_size: 9,
            column_size: 10,
            column_width: [120, 120, 120, 120, 120, 120, 120, 120, 120, 120],
          },
        },
      },
    ],
    undefined,
    new RateLimiter(0),
  );

  const createCall = calls.find((row) => row.method === 'docx.documentBlockChildren.create');
  assert.ok(createCall);
  const createTable =
    (((createCall?.request as { data?: { children?: Array<Record<string, unknown>> } }).data?.children ??
      []) as Array<Record<string, unknown>>)[0] ?? {};
  const createProperty = ((createTable.table as { property?: Record<string, unknown> })?.property ?? {}) as Record<
    string,
    unknown
  >;
  assert.equal(createProperty.row_size, 9);
  assert.equal(createProperty.column_size, 9);
  assert.equal((createProperty.column_width as unknown[]).length, 9);

  const batchUpdates = calls.filter((row) => row.method === 'docx.documentBlock.batchUpdate');
  assert.equal(batchUpdates.length, 1);
  const requests =
    ((batchUpdates[0]?.request as { data?: { requests?: Array<Record<string, unknown>> } }).data?.requests ?? []) as Array<
      Record<string, unknown>
    >;
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    block_id: 'tbl_1',
    insert_table_column: {
      column_index: 9,
    },
  });
});

test('createDocumentChildren uses 9x9 base then expands for 10x9 table', async () => {
  const { client, calls } = createFakeClient({
    docxDocumentBlockChildrenCreate: async () => ({
      code: 0,
      data: {
        children: [{ block_id: 'tbl_1', block_type: 31, children: [] }],
      },
    }),
    docxDocumentBlockBatchUpdate: async () => ({
      code: 0,
      data: {},
    }),
  });

  await createDocumentChildren(
    client,
    'doc_x',
    'root_x',
    [
      {
        block_type: 31,
        table: {
          property: {
            row_size: 10,
            column_size: 9,
            column_width: [120, 120, 120, 120, 120, 120, 120, 120, 120],
          },
        },
      },
    ],
    undefined,
    new RateLimiter(0),
  );

  const createCall = calls.find((row) => row.method === 'docx.documentBlockChildren.create');
  assert.ok(createCall);
  const createTable =
    (((createCall?.request as { data?: { children?: Array<Record<string, unknown>> } }).data?.children ??
      []) as Array<Record<string, unknown>>)[0] ?? {};
  const createProperty = ((createTable.table as { property?: Record<string, unknown> })?.property ?? {}) as Record<
    string,
    unknown
  >;
  assert.equal(createProperty.row_size, 9);
  assert.equal(createProperty.column_size, 9);
  assert.equal((createProperty.column_width as unknown[]).length, 9);

  const batchUpdates = calls.filter((row) => row.method === 'docx.documentBlock.batchUpdate');
  assert.equal(batchUpdates.length, 1);
  const requests =
    ((batchUpdates[0]?.request as { data?: { requests?: Array<Record<string, unknown>> } }).data?.requests ?? []) as Array<
      Record<string, unknown>
    >;
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    block_id: 'tbl_1',
    insert_table_row: {
      row_index: 9,
    },
  });
});

test('createDocumentChildren batches non-table siblings into one create request', async () => {
  let nextId = 1;
  const { client, calls } = createFakeClient({
    docxDocumentBlockChildrenCreate: async (request) => {
      const children =
        ((request as { data?: { children?: Array<Record<string, unknown>> } }).data?.children ?? []) as Array<
          Record<string, unknown>
        >;
      return {
        code: 0,
        data: {
          children: children.map((item) => ({
            block_id: `b_${nextId++}`,
            block_type: typeof item.block_type === 'number' ? item.block_type : 2,
            children: [],
          })),
        },
      };
    },
  });

  const created = await createDocumentChildren(
    client,
    'doc_x',
    'root_x',
    [
      { block_type: 2, text: { elements: [{ text_run: { content: 'a' } }] } },
      { block_type: 2, text: { elements: [{ text_run: { content: 'b' } }] } },
      { block_type: 3, heading1: { elements: [{ text_run: { content: 'c' } }] } },
    ],
    undefined,
    new RateLimiter(0),
  );

  assert.equal(created.length, 3);
  const createCalls = calls.filter((row) => row.method === 'docx.documentBlockChildren.create');
  assert.equal(createCalls.length, 1);
  const requestChildren =
    ((createCalls[0]?.request as { data?: { children?: unknown[] } }).data?.children as unknown[]) ?? [];
  assert.equal(requestChildren.length, 3);
});

test('resolveCreatedTableCellIds uses create -> get -> list fallback order', async () => {
  {
    const { client, calls } = createFakeClient({
      docxDocumentBlockList: async () => {
        throw new Error('should not list when create children are enough');
      },
    });
    const ids = await resolveCreatedTableCellIds(
      client,
      'doc_x',
      'tbl_x',
      { block_id: 'tbl_x', block_type: 31, children: ['c1', 'c2', 'c3'] },
      2,
      undefined,
      new RateLimiter(0),
    );
    assert.deepEqual(ids, ['c1', 'c2', 'c3']);
    assert.equal(calls.length, 0);
  }

  {
    const { client, calls } = createFakeClient({
      docxDocumentBlockGet: async () => ({
        code: 0,
        data: {
          block: { block_id: 'tbl_x', block_type: 31, children: ['c1', 'c2', 'c3', 'c4'] },
        },
      }),
      docxDocumentBlockList: async () => {
        throw new Error('should not list when get block is enough');
      },
    });
    const ids = await resolveCreatedTableCellIds(
      client,
      'doc_x',
      'tbl_x',
      { block_id: 'tbl_x', block_type: 31, children: ['c1'] },
      4,
      undefined,
      new RateLimiter(0),
    );
    assert.deepEqual(ids, ['c1', 'c2', 'c3', 'c4']);
    assert.equal(calls.filter((row) => row.method === 'docx.documentBlock.get').length, 1);
    assert.equal(calls.filter((row) => row.method === 'docx.documentBlock.list').length, 0);
  }

  {
    const { client, calls } = createFakeClient({
      docxDocumentBlockGet: async () => ({
        code: 0,
        data: {
          block: { block_id: 'tbl_x', block_type: 31, children: ['c1'] },
        },
      }),
      docxDocumentBlockList: async () => ({
        code: 0,
        data: {
          items: [
            { block_id: 'tbl_x', block_type: 31, children: ['c1', 'c2', 'c3', 'c4'] },
            { block_id: 'root', block_type: 1, children: ['tbl_x'] },
          ],
          has_more: false,
          page_token: '',
        },
      }),
    });
    const ids = await resolveCreatedTableCellIds(
      client,
      'doc_x',
      'tbl_x',
      { block_id: 'tbl_x', block_type: 31, children: ['c1'] },
      4,
      undefined,
      new RateLimiter(0),
    );
    assert.deepEqual(ids, ['c1', 'c2', 'c3', 'c4']);
    assert.equal(calls.filter((row) => row.method === 'docx.documentBlock.get').length, 1);
    assert.equal(calls.filter((row) => row.method === 'docx.documentBlock.list').length, 1);
  }
});

test('patchTextBlockElements replaceImageBlock replaceFileBlock and getDocumentBlockById call expected endpoints', async () => {
  const { client, calls } = createFakeClient({
    docxDocumentBlockPatch: async () => ({ code: 0, data: {} }),
    docxDocumentBlockBatchUpdate: async () => ({ code: 0, data: {} }),
    docxDocumentBlockGet: async () => ({
      code: 0,
      data: {
        block: {
          block_id: 'b_1',
          block_type: 2,
          parent_id: 'root',
          children: [],
        },
      },
    }),
  });

  await patchTextBlockElements(client, 'doc_x', 'b_1', [{ text_run: { content: 'X' } }], undefined, new RateLimiter(0));
  await patchTextBlockElements(
    client,
    'doc_x',
    'b_1',
    [{ text_run: { content: 'Y' } }],
    undefined,
    new RateLimiter(0),
    3,
  );
  await replaceImageBlock(client, 'doc_x', 'b_1', 'img_token', undefined, new RateLimiter(0));
  await replaceFileBlock(client, 'doc_x', 'b_1', 'file_token', undefined, new RateLimiter(0));
  const block = await getDocumentBlockById(client, 'doc_x', 'b_1', undefined, new RateLimiter(0));

  assert.deepEqual(block, { block_id: 'b_1', block_type: 2, parent_id: 'root', children: [] });
  assert.ok(calls.some((row) => row.method === 'docx.documentBlock.patch'));
  const patchCalls = calls.filter((row) => row.method === 'docx.documentBlock.patch');
  assert.ok(
    patchCalls.some((row) => {
      const request = row.request as { data?: { update_text_elements?: unknown } };
      return Boolean(request.data?.update_text_elements);
    }),
  );
  assert.ok(
    patchCalls.some((row) => {
      const request = row.request as { data?: { update_text?: { style?: { align?: number } } } };
      return request.data?.update_text?.style?.align === 3;
    }),
  );
  assert.ok(calls.filter((row) => row.method === 'docx.documentBlock.batchUpdate').length >= 2);
  assert.ok(calls.some((row) => row.method === 'docx.documentBlock.get'));
});

test('createBoardPlantumlNode and getRawDocumentBlockById call expected endpoints', async () => {
  const { client, calls } = createFakeClient({
    boardV1WhiteboardNodeCreatePlantuml: async () => ({ code: 0, data: { node_id: 'n1' } }),
    docxDocumentBlockGet: async () => ({
      code: 0,
      data: {
        block: {
          block_id: 'board_block_1',
          block_type: 43,
          board: {
            token: 'wb_123',
          },
        },
      },
    }),
  });

  await createBoardPlantumlNode(
    client,
    'wb_123',
    'flowchart TD\nA-->B',
    {
      syntaxType: 2,
      styleType: 1,
    },
    undefined,
    new RateLimiter(0),
  );
  const raw = await getRawDocumentBlockById(client, 'doc_x', 'board_block_1', undefined, new RateLimiter(0));

  assert.equal(raw?.block_type, 43);
  assert.ok(calls.some((row) => row.method === 'board.v1.whiteboardNode.createPlantuml'));
  assert.ok(calls.some((row) => row.method === 'docx.documentBlock.get'));
});

test('uploadBinaryToNode validates file existence and returns uploaded token', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'md-to-lark-upload-'));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const validPath = path.join(dir, 'demo.bin');
  await writeFile(validPath, Buffer.from([1, 2, 3, 4]));

  const { client, calls } = createFakeClient({
    driveMediaUploadAll: async () => ({ code: 0, file_token: 'file_tok_1' }),
  });

  await assert.rejects(
    () =>
      uploadBinaryToNode(client, 'docx_file', 'b_x', path.join(dir, 'not-found.bin'), undefined, new RateLimiter(0)),
    /Asset file does not exist:/,
  );

  const token = await uploadBinaryToNode(client, 'docx_file', 'b_x', validPath, undefined, new RateLimiter(0));
  assert.equal(token, 'file_tok_1');
  assert.equal(calls.filter((row) => row.method === 'drive.media.uploadAll').length, 1);
});
