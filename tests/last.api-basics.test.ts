import assert from 'node:assert/strict';
import test from 'node:test';
import { createLASTApi } from '../src/last/api.js';
import { serializeLASTToMarkdown } from '../src/last/to-markdown.js';
import { hastToLAST, markdownToHast } from '../src/pipeline/index.js';

async function createApi(markdown: string) {
  const hast = await markdownToHast(markdown);
  const model = hastToLAST(hast, { mode: 'fragment', documentId: 'api-test' });
  return createLASTApi(model);
}

test('LAST API selector + replaceText + commit updates markdown', async () => {
  const api = await createApi('# Title\n\ndemo paragraph');

  assert.equal(api.$('heading1').length(), 1);
  assert.equal(api.$.byScope({ pattern: /demo/i }).ids().length, 1);

  api.$('text').replaceText(/demo/gi, 'example');
  const committed = api.commit();

  assert.equal(committed.ok, true);
  const output = serializeLASTToMarkdown(api.model);
  assert.match(output, /example paragraph/);
});

test('LAST API rollback restores content after staged mutations', async () => {
  const api = await createApi('# Original\n\nBody');
  const before = serializeLASTToMarkdown(api.model);

  api.$.begin();
  api.$('heading1').text('Changed');
  api.$('text').replaceText(/Body/g, 'Modified');
  api.$.rollback();

  const afterRollback = serializeLASTToMarkdown(api.model);
  assert.equal(afterRollback, before);
  assert.match(afterRollback, /^# Original/m);
});

test('LAST API scope replace mutates only matching scope', async () => {
  const api = await createApi('# Title\n\nalpha demo\n\nbeta');

  api.$.byScope({ pattern: /demo/i }).replace(/demo/gi, 'done');
  api.commit();

  const output = serializeLASTToMarkdown(api.model);
  assert.match(output, /alpha done/);
  assert.match(output, /beta/);
});
