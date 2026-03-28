import assert from 'node:assert/strict';
import test from 'node:test';
import { larkTextPayloadToLast, lastTextPayloadToLark } from '../src/interop/codec-shared.js';

const VERIFIED_CODE_LANGUAGE_ALIASES: Array<[alias: string, expected: number]> = [
  ['text', 1],
  ['plaintext', 1],
  ['plain_text', 1],
  ['assembly', 6],
  ['bash', 7],
  ['csharp', 8],
  ['cpp', 9],
  ['c', 10],
  ['css', 12],
  ['coffee', 13],
  ['go', 22],
  ['html', 24],
  ['json', 28],
  ['java', 29],
  ['javascript', 30],
  ['js', 30],
  ['kotlin', 32],
  ['markdown', 39],
  ['md', 39],
  ['objectivec', 41],
  ['php', 43],
  ['perl', 44],
  ['powershell', 46],
  ['protobuf', 48],
  ['python', 49],
  ['r', 50],
  ['ruby', 52],
  ['rust', 53],
  ['sql', 56],
  ['scala', 57],
  ['shell', 60],
  ['swift', 61],
  ['typescript', 63],
  ['ts', 63],
  ['xml', 66],
  ['yaml', 67],
  ['toml', 75],
];

test('lastTextPayloadToLark maps supported code language aliases to verified Feishu values', () => {
  for (const [alias, expected] of VERIFIED_CODE_LANGUAGE_ALIASES) {
    const raw = lastTextPayloadToLark(
      'code',
      {
        style: { language: alias },
        inlines: [],
      } as never,
      {},
    );
    assert.equal(
      (raw.code as { style?: { language?: number } }).style?.language,
      expected,
      `expected alias "${alias}" to map to ${expected}`,
    );
  }
});

test('lastTextPayloadToLark keeps explicit numeric code values', () => {
  const raw = lastTextPayloadToLark(
    'code',
    {
      style: { language: '75' },
      inlines: [],
    } as never,
    {},
  );

  assert.equal((raw.code as { style?: { language?: number } }).style?.language, 75);
});

test('lastTextPayloadToLark does not assign language for unsupported aliases', () => {
  const raw = lastTextPayloadToLark(
    'code',
    {
      style: { language: 'graphql' },
      inlines: [],
    } as never,
    {},
  );

  assert.equal((raw.code as { style?: { language?: number } }).style?.language, undefined);
});

test('larkTextPayloadToLast preserves numeric language values from Feishu blocks', () => {
  const payload = larkTextPayloadToLast(
    {
      block_id: 'b_code',
      block_type: 14,
      code: {
        style: {
          language: 75,
        },
        elements: [],
      },
    } as never,
    'code',
    () => 'i_1' as never,
    {},
  );

  assert.equal(payload.style.language, '75');
});
