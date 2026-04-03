import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RateLimiter } from '../src/shared/rate-limiter.js';
import {
  applyCreatedBoardMermaid,
  applyCreatedFileBlock,
  applyCreatedImageBlock,
} from '../src/lark/docx/render-post-process.js';

test('applyCreatedBoardMermaid resolves whiteboard id and creates plantuml node', async () => {
  const calls: unknown[] = [];
  const client = {
    docx: {
      documentBlock: {
        get: async () => ({
          code: 0,
          data: {
            block: {
              board: {
                token: 'wb_123',
              },
            },
          },
        }),
      },
    },
    board: {
      v1: {
        whiteboardNode: {
          createPlantuml: async (request: unknown) => {
            calls.push(request);
            return { code: 0, data: {} };
          },
        },
      },
    },
  };

  await applyCreatedBoardMermaid(
    client as never,
    'doc_id',
    'block_id',
    { code: 'flowchart TD\nA-->B' },
    {
      target: 'board',
      board: {
        syntaxType: 2,
        styleType: 3,
        diagramType: 4,
      },
    },
    undefined,
    new RateLimiter(0),
  );

  const request = calls[0] as { path?: { whiteboard_id?: string }; data?: Record<string, unknown> };
  assert.equal(request.path?.whiteboard_id, 'wb_123');
  assert.equal(request.data?.syntax_type, 2);
  assert.equal(request.data?.style_type, 3);
  assert.equal(request.data?.diagram_type, 4);
});

test('applyCreatedFileBlock replaces existing token after resolving nested file target block id', async () => {
  const batchUpdateCalls: unknown[] = [];
  const client = {
    docx: {
      documentBlock: {
        get: async () => ({
          code: 0,
          data: {
            block: {
              block_id: 'wrapper_block',
              block_type: 23,
              children: ['real_file_block'],
            },
          },
        }),
        batchUpdate: async (request: unknown) => {
          batchUpdateCalls.push(request);
          return { code: 0, data: {} };
        },
      },
    },
  };

  const mapping = await applyCreatedFileBlock(
    client as never,
    'doc_id',
    'wrapper_block',
    {
      block_id: 'wrapper_block',
      block_type: 23,
      children: [],
    },
    'source_file',
    {
      file: {
        token: 'file_token_existing',
      },
    },
    undefined,
    new RateLimiter(0),
    new RateLimiter(0),
  );

  assert.equal(mapping, null);
  const request = batchUpdateCalls[0] as {
    data?: { requests?: Array<{ block_id?: string; replace_file?: { token?: string } }> };
  };
  assert.equal(request.data?.requests?.[0]?.block_id, 'real_file_block');
  assert.equal(request.data?.requests?.[0]?.replace_file?.token, 'file_token_existing');
});

test('applyCreatedImageBlock returns null when raw block does not carry local image path', async () => {
  const mapping = await applyCreatedImageBlock(
    {} as never,
    'doc_id',
    'block_id',
    'source_image',
    {
      image: {},
    },
    undefined,
    new RateLimiter(0),
    new RateLimiter(0),
  );

  assert.equal(mapping, null);
});

test('applyCreatedImageBlock preserves width and align in replace_image request', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'md-to-lark-render-post-process-'));
  const localPath = path.join(tempDir, 'image.png');
  await writeFile(localPath, 'png', 'utf8');
  const batchUpdateCalls: unknown[] = [];
  const uploadCalls: unknown[] = [];
  const client = {
    drive: {
      media: {
        uploadAll: async (request: unknown) => {
          uploadCalls.push(request);
          return {
            code: 0,
            file_token: 'img_uploaded_token',
          };
        },
      },
    },
    docx: {
      documentBlock: {
        batchUpdate: async (request: unknown) => {
          batchUpdateCalls.push(request);
          return { code: 0, data: {} };
        },
      },
    },
  };

  const mapping = await applyCreatedImageBlock(
    client as never,
    'doc_id',
    'block_id',
    'source_image',
    {
      image: {
        local_path: localPath,
        width: 1000,
        align: 1,
      },
    },
    undefined,
    new RateLimiter(0),
    new RateLimiter(0),
  );

  assert.equal(uploadCalls.length, 1);
  assert.deepEqual(mapping, {
    kind: 'image',
    sourceBlockId: 'source_image',
    createdBlockId: 'block_id',
    localPath,
    token: 'img_uploaded_token',
  });
  const request = batchUpdateCalls[0] as {
    data?: { requests?: Array<{ replace_image?: { token?: string; width?: number; align?: number } }> };
  };
  assert.equal(request.data?.requests?.[0]?.replace_image?.token, 'img_uploaded_token');
  assert.equal(request.data?.requests?.[0]?.replace_image?.width, 1000);
  assert.equal(request.data?.requests?.[0]?.replace_image?.align, 1);
  await rm(tempDir, { recursive: true, force: true });
});
