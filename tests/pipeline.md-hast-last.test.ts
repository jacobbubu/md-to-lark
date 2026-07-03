import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Root as HastRoot } from 'hast';
import { DEFAULT_IMAGE_WIDTH, DEFAULT_TABLE_CELL_IMAGE_WIDTH } from '../src/last/image-defaults.js';
import { hastToLAST, markdownToHast } from '../src/pipeline/index.js';
import { normalizeMarkdownBeforeParse } from '../src/pipeline/markdown/normalize-markdown.js';
import { convertLASTToBTT } from '../src/interop/index.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const richFixturePath = path.join(currentDir, 'fixtures', 'md', 'rich-gfm.md');
const linkedImageFixturePath = path.join(currentDir, 'fixtures', 'md', 'linked-image.md');
const unitreeFixturePath = path.join(currentDir, 'fixtures', 'md', 'unitree-article-verification.md');
const TEST_CJK_BOLD_TRAILING_PUNCTUATION = new Set([
  '，',
  '。',
  '；',
  '：',
  '！',
  '？',
  '、',
  '）',
  '》',
  '】',
  '」',
  '』',
]);
const TEST_NORMALIZATION_NEXT_CHAR_RE = /[\p{Script=Han}\p{Letter}\p{Number}\[]/u;

function collectTextNodeValues(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const record = node as { type?: unknown; value?: unknown; children?: unknown[] };
  const values: string[] = [];
  if (record.type === 'text' && typeof record.value === 'string') {
    values.push(record.value);
  }
  for (const child of record.children ?? []) {
    values.push(...collectTextNodeValues(child));
  }
  return values;
}

function hasTagName(node: unknown, tagName: string): boolean {
  if (!node || typeof node !== 'object') return false;
  const record = node as { type?: unknown; tagName?: unknown; children?: unknown[] };
  if (record.type === 'element' && record.tagName === tagName) {
    return true;
  }
  return (record.children ?? []).some((child) => hasTagName(child, tagName));
}

function markdownInlineToPlainText(markdown: string): string {
  return markdown.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function collectSourceBoldIntentTexts(markdown: string): string[] {
  const texts: string[] = [];
  let cursor = 0;

  while (cursor < markdown.length - 1) {
    const open = markdown.indexOf('**', cursor);
    if (open === -1) break;
    const close = markdown.indexOf('**', open + 2);
    if (close === -1) break;

    let content = markdown.slice(open + 2, close);
    if (content && !content.includes('\n')) {
      const punctuation = content[content.length - 1] ?? '';
      const nextChar = markdown[close + 2] ?? '';
      if (TEST_CJK_BOLD_TRAILING_PUNCTUATION.has(punctuation) && TEST_NORMALIZATION_NEXT_CHAR_RE.test(nextChar)) {
        content = content.slice(0, -1);
      }
      texts.push(markdownInlineToPlainText(content));
    }

    cursor = close + 2;
  }

  return texts;
}

function collectLASTTextRuns(
  last: ReturnType<typeof hastToLAST>,
): Array<{ text: string; bold: boolean; link: string | null; inlineCode: boolean }> {
  const runs: Array<{ text: string; bold: boolean; link: string | null; inlineCode: boolean }> = [];

  for (const block of Object.values(last.blocks)) {
    const inlines = (block as { payload?: { inlines?: unknown[] } }).payload?.inlines;
    if (!Array.isArray(inlines)) continue;
    for (const inline of inlines) {
      const record = inline as { kind?: unknown; text?: unknown; marks?: { bold?: unknown } };
      if (record.kind === 'text_run' && typeof record.text === 'string') {
        const marks = record.marks as
          | { bold?: unknown; inlineCode?: unknown; link?: { url?: unknown } | null }
          | undefined;
        runs.push({
          text: record.text,
          bold: marks?.bold === true,
          link: typeof marks?.link?.url === 'string' ? marks.link.url : null,
          inlineCode: marks?.inlineCode === true,
        });
      }
    }
  }

  return runs;
}

function collectLASTEquations(last: ReturnType<typeof hastToLAST>): string[] {
  const equations: string[] = [];

  for (const block of Object.values(last.blocks)) {
    const inlines = (block as { payload?: { inlines?: unknown[] } }).payload?.inlines;
    if (!Array.isArray(inlines)) continue;
    for (const inline of inlines) {
      const record = inline as { kind?: unknown; latex?: unknown };
      if (record.kind === 'equation' && typeof record.latex === 'string') {
        equations.push(record.latex);
      }
    }
  }

  return equations;
}

function collectBTTTextRuns(value: unknown): Array<{ text: string; bold: boolean; link: unknown }> {
  const runs: Array<{ text: string; bold: boolean; link: unknown }> = [];
  const seen = new WeakSet<object>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    const record = node as {
      text_run?: {
        content?: unknown;
        text_element_style?: { bold?: unknown };
      };
    };
    if (typeof record.text_run?.content === 'string') {
      runs.push({
        text: record.text_run.content,
        bold: record.text_run.text_element_style?.bold === true,
        link: record.text_run.text_element_style?.link ?? null,
      });
    }

    for (const child of Object.values(record)) {
      visit(child);
    }
  };

  const flatBlocks = (value as { flatBlocks?: unknown }).flatBlocks;
  if (flatBlocks && typeof flatBlocks === 'object') {
    for (const block of Object.values(flatBlocks)) {
      visit(block);
    }
  } else {
    visit(value);
  }

  return runs;
}

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

test('hastToLAST blockquote preserves inline bold link and code marks', async () => {
  const markdown = '> **GitHub** links to [OpenAI](https://openai.com) with `code`.';
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'quote-marks' });
  const btt = convertLASTToBTT(last, { documentId: 'quote-marks' });

  const quoteIds = last.indexes.byType.quote ?? [];
  assert.equal(quoteIds.length, 1);

  const lastRuns = collectLASTTextRuns(last);
  const githubRun = lastRuns.find((run) => run.text === 'GitHub');
  const openAiRun = lastRuns.find((run) => run.text === 'OpenAI');
  const codeRun = lastRuns.find((run) => run.text === 'code');

  assert.equal(githubRun?.bold, true);
  assert.equal(openAiRun?.link, 'https://openai.com');
  assert.equal(codeRun?.inlineCode, true);
  assert.equal(lastRuns.map((run) => run.text).join(''), 'GitHub links to OpenAI with code.');

  const bttRuns = collectBTTTextRuns(btt);
  const bttGithubRun = bttRuns.find((run) => run.text === 'GitHub');
  const bttOpenAiRun = bttRuns.find((run) => run.text === 'OpenAI');

  assert.equal(bttGithubRun?.bold, true);
  assert.equal(typeof bttOpenAiRun?.link, 'object');
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
  const markdown = ['Inline formula $$a^2 + b^2 = c^2$$ in sentence.', '', '$$', 'E = mc^2', '$$', ''].join('\n');
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

test('markdownToHast keeps currency amounts as plain text when single-dollar math is disabled', async () => {
  const markdown = '美国政府以每股 $20.47 持有最多 4.33 亿股 Intel 股票，SoftBank 的入场价是 $23.00。';
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'currency' });

  const textIds = last.indexes.byType.text ?? [];
  assert.equal(textIds.length, 1);
  const block = textIds[0] ? last.blocks[textIds[0]] : undefined;
  assert.ok(block && block.type === 'text');
  if (!block || block.type !== 'text') return;

  const kinds = block.payload.inlines.map((inline) => inline.kind);
  assert.deepEqual(kinds, ['text_run']);
  const text = block.payload.inlines
    .map((inline) => ('text' in inline && typeof inline.text === 'string' ? inline.text : ''))
    .join('');
  assert.equal(text, markdown);
});

test('markdownToHast keeps single-dollar inline math as text by default', async () => {
  const markdown = 'Inline formula stays text by default: $x_t = y_t + 1$.';
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'single-dollar-default' });

  assert.deepEqual(collectLASTEquations(last), []);
  assert.equal(
    collectLASTTextRuns(last)
      .map((run) => run.text)
      .join(''),
    markdown,
  );
});

test('markdownToHast can opt in to single-dollar inline math while protecting code', async () => {
  const markdown = [
    'Inline formula: $x_t = y_t + 1$.',
    '',
    'Chinese text with formula: 第 $t$ 步的状态为 $s_t$。',
    '',
    'Code span must not parse: `$x_t$`.',
    '',
    '| 方法 | 复杂度 |',
    '| --- | --- |',
    '| 注意力 | $O(n^2)$ |',
    '',
    'Fenced code must not parse:',
    '',
    '```python',
    'price = "$20.47"',
    'formula = "$x_t$"',
    '```',
    '',
  ].join('\n');
  const hast = await markdownToHast(markdown, { singleDollarTextMath: true });
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'single-dollar-enabled' });

  assert.deepEqual(collectLASTEquations(last), ['x_t = y_t + 1', 't', 's_t', 'O(n^2)']);

  const inlineCodeRun = collectLASTTextRuns(last).find((run) => run.inlineCode);
  assert.equal(inlineCodeRun?.text, '$x_t$');

  const codeIds = last.indexes.byType.code ?? [];
  assert.equal(codeIds.length, 1);
  const codeBlock = codeIds[0] ? last.blocks[codeIds[0]] : undefined;
  assert.ok(codeBlock && codeBlock.type === 'code');
  if (!codeBlock || codeBlock.type !== 'code') return;

  const codeText = codeBlock.payload.inlines
    .map((inline) => ('text' in inline && typeof inline.text === 'string' ? inline.text : ''))
    .join('');
  assert.equal(codeText.includes('price = "$20.47"'), true);
  assert.equal(codeText.includes('formula = "$x_t$"'), true);
});

test('normalizeMarkdownBeforeParse moves trailing chinese punctuation outside bold markers', () => {
  const markdown =
    '**随着汽车销量扩大，掌握电芯会把需求直接传导出去，进而带来供给改善和生态形成，**像 [Hunan Yuneng](https://example.com) 和 [Shenzhen Dynanonic](https://example.com) 一样。';
  const normalized = normalizeMarkdownBeforeParse(markdown);

  assert.equal(
    normalized,
    '**随着汽车销量扩大，掌握电芯会把需求直接传导出去，进而带来供给改善和生态形成**，像 [Hunan Yuneng](https://example.com) 和 [Shenzhen Dynanonic](https://example.com) 一样。',
  );
});

test('normalizeMarkdownBeforeParse does not rewrite after an already closed bold span on the same line', () => {
  const markdown =
    'Tesla 在 **2022** 年首次展示人形机器人，而当它以及其他西方玩家如今仍在生产处于早期、尚未成熟的人形机器人时，**据我们了解，Unitree 可能会在未来几周内交付第 10,000 台。**';

  const normalized = normalizeMarkdownBeforeParse(markdown);

  assert.equal(normalized, markdown);
});

test('normalizeMarkdownBeforeParse fixes opening bold adjacent to chinese text', () => {
  const markdown = '另一个有用的办法，是**往电机里塞进更多铜线。**更粗、填充更密的铜线在承载同样电流时电阻更低。';
  const normalized = normalizeMarkdownBeforeParse(markdown);

  assert.equal(
    normalized,
    '另一个有用的办法，是**往电机里塞进更多铜线**。更粗、填充更密的铜线在承载同样电流时电阻更低。',
  );
});

test('normalizeMarkdownBeforeParse keeps multiple same-line bold spans from crossing into each other', () => {
  const markdown =
    '尽管如此，我们认为 Unitree 的**成本结构**恰恰是它相对竞争对手最大的优势之一。过去 12-18 个月里，Unitree 已把税前售价**从 5 万美元以上砍到 2.73 万美元。**即便在这个价位，我们估算它的旗舰 G1 仍能做到**67% 的毛利率。**随着制造规模扩大、BoM（物料清单）快速下降，**我们甚至已经听到某些交易的价格远低于 2 万美元。**';
  const normalized = normalizeMarkdownBeforeParse(markdown);

  assert.equal(
    normalized,
    '尽管如此，我们认为 Unitree 的**成本结构**恰恰是它相对竞争对手最大的优势之一。过去 12-18 个月里，Unitree 已把税前售价**从 5 万美元以上砍到 2.73 万美元**。即便在这个价位，我们估算它的旗舰 G1 仍能做到**67% 的毛利率**。随着制造规模扩大、BoM（物料清单）快速下降，**我们甚至已经听到某些交易的价格远低于 2 万美元。**',
  );
});

test('normalizeMarkdownBeforeParse skips inline code fenced code and already valid bold endings', () => {
  const markdown = [
    '这里是 `**一句中文，**像这样`',
    '',
    '```md',
    '**一句中文，**像这样',
    '```',
    '',
    '**BYD 的战略是关键。**',
  ].join('\n');

  const normalized = normalizeMarkdownBeforeParse(markdown);

  assert.equal(normalized, markdown);
});

test('markdownToHast normalizes chinese bold punctuation before parsing emphasis', async () => {
  const markdown = '**BYD 可以自由决定哪些制造环节值得内收，从而让优势继续复利。**它把电芯、驱动、电机都做到了内部。';
  const hast = await markdownToHast(markdown);

  assert.equal(hasTagName(hast, 'strong'), true);
  assert.equal(
    collectTextNodeValues(hast).some((value) => value.includes('**')),
    false,
  );
});

test('markdownToHast normalizes opening bold adjacent to chinese text before parsing emphasis', async () => {
  const markdown = '另一个有用的办法，是**往电机里塞进更多铜线。**更粗、填充更密的铜线在承载同样电流时电阻更低。';
  const hast = await markdownToHast(markdown);

  assert.equal(hasTagName(hast, 'strong'), true);
  assert.equal(
    collectTextNodeValues(hast).some((value) => value.includes('**')),
    false,
  );
});

test('markdownToHast keeps multiple same-line bold spans separate after normalization', async () => {
  const markdown =
    '尽管如此，我们认为 Unitree 的**成本结构**恰恰是它相对竞争对手最大的优势之一。过去 12-18 个月里，Unitree 已把税前售价**从 5 万美元以上砍到 2.73 万美元。**即便在这个价位，我们估算它的旗舰 G1 仍能做到**67% 的毛利率。**随着制造规模扩大、BoM（物料清单）快速下降，**我们甚至已经听到某些交易的价格远低于 2 万美元。**';
  const hast = await markdownToHast(markdown);

  assert.equal(hasTagName(hast, 'strong'), true);
  assert.equal(
    collectTextNodeValues(hast).some((value) => value.includes('**')),
    false,
  );
});

test('hastToLAST and BTT keep multiple valid bold spans on one chinese sentence without stray asterisks', async () => {
  const markdown =
    'Tesla 在 **2022** 年首次展示人形机器人，而当它以及其他西方玩家如今仍在生产处于早期、尚未成熟的人形机器人时，**据我们了解，Unitree 可能会在未来几周内交付第 10,000 台。**';
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'bold-cjk-multi' });
  const btt = convertLASTToBTT(last, { documentId: 'bold-cjk-multi' });

  assert.equal(hasTagName(hast, 'strong'), true);
  assert.equal(
    collectTextNodeValues(hast).some((value) => value.includes('**')),
    false,
  );

  const textIds = last.indexes.byType.text ?? [];
  assert.equal(textIds.length, 1);
  const block = textIds[0] ? last.blocks[textIds[0]] : undefined;
  assert.ok(block && block.type === 'text');
  if (!block || block.type !== 'text') return;

  const boldRuns = block.payload.inlines.filter(
    (inline): inline is Extract<(typeof block.payload.inlines)[number], { kind: 'text_run' }> =>
      inline.kind === 'text_run' && inline.marks.bold === true,
  );
  assert.equal(boldRuns.length, 2);
  assert.equal(boldRuns[0]?.text, '2022');
  assert.equal(boldRuns[1]?.text, '据我们了解，Unitree 可能会在未来几周内交付第 10,000 台。');
  assert.equal(
    block.payload.inlines.some(
      (inline) => inline.kind === 'text_run' && typeof inline.text === 'string' && inline.text.includes('**'),
    ),
    false,
  );

  const rawTextBlockId = textIds[0] ?? '';
  const rawTextBlock = rawTextBlockId ? btt.flatBlocks[rawTextBlockId]?.text : undefined;
  const elements = Array.isArray((rawTextBlock as { elements?: unknown[] } | undefined)?.elements)
    ? ((rawTextBlock as { elements?: unknown[] }).elements as Array<{
        text_run?: { content?: string; text_element_style?: Record<string, unknown> };
      }>)
    : [];
  const boldContents = elements
    .filter((element) => element.text_run?.text_element_style?.bold === true)
    .map((element) => element.text_run?.content ?? '');
  assert.deepEqual(boldContents, ['2022', '据我们了解，Unitree 可能会在未来几周内交付第 10,000 台。']);
  assert.equal(
    elements.some((element) => element.text_run?.content?.includes('**')),
    false,
  );
});

test('hastToLAST and BTT keep multiple same-line bold spans separate without stray asterisks', async () => {
  const markdown =
    '尽管如此，我们认为 Unitree 的**成本结构**恰恰是它相对竞争对手最大的优势之一。过去 12-18 个月里，Unitree 已把税前售价**从 5 万美元以上砍到 2.73 万美元。**即便在这个价位，我们估算它的旗舰 G1 仍能做到**67% 的毛利率。**随着制造规模扩大、BoM（物料清单）快速下降，**我们甚至已经听到某些交易的价格远低于 2 万美元。**';
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'bold-cjk-chain' });
  const btt = convertLASTToBTT(last, { documentId: 'bold-cjk-chain' });

  const textIds = last.indexes.byType.text ?? [];
  assert.equal(textIds.length, 1);
  const block = textIds[0] ? last.blocks[textIds[0]] : undefined;
  assert.ok(block && block.type === 'text');
  if (!block || block.type !== 'text') return;

  const boldRuns = block.payload.inlines.filter(
    (inline): inline is Extract<(typeof block.payload.inlines)[number], { kind: 'text_run' }> =>
      inline.kind === 'text_run' && inline.marks.bold === true,
  );
  const boldTexts = boldRuns.map((inline) => inline.text ?? '');
  assert.deepEqual(boldTexts, [
    '成本结构',
    '从 5 万美元以上砍到 2.73 万美元',
    '67% 的毛利率',
    '我们甚至已经听到某些交易的价格远低于 2 万美元。',
  ]);
  assert.equal(
    block.payload.inlines.some(
      (inline) => inline.kind === 'text_run' && typeof inline.text === 'string' && inline.text.includes('**'),
    ),
    false,
  );

  const rawTextBlockId = textIds[0] ?? '';
  const rawTextBlock = rawTextBlockId ? btt.flatBlocks[rawTextBlockId]?.text : undefined;
  const elements = Array.isArray((rawTextBlock as { elements?: unknown[] } | undefined)?.elements)
    ? ((rawTextBlock as { elements?: unknown[] }).elements as Array<{
        text_run?: { content?: string; text_element_style?: Record<string, unknown> };
      }>)
    : [];
  const boldContents = elements
    .filter((element) => element.text_run?.text_element_style?.bold === true)
    .map((element) => element.text_run?.content ?? '');
  assert.deepEqual(boldContents, [
    '成本结构',
    '从 5 万美元以上砍到 2.73 万美元',
    '67% 的毛利率',
    '我们甚至已经听到某些交易的价格远低于 2 万美元。',
  ]);
  assert.equal(
    elements.some((element) => element.text_run?.content?.includes('**')),
    false,
  );
});

test('normalizeMarkdownBeforeParse keeps valid bold spans after a chinese comma', async () => {
  const markdown =
    (await readFile(unitreeFixturePath, 'utf8'))
      .split(/\n/)
      .find(
        (line) =>
          line.includes('最多约 250 台人形机器人') &&
          line.includes('今天已经部署了 30 台 G1，还有多家公司部署了 5-6 台 G1'),
      ) ?? '';
  const normalized = normalizeMarkdownBeforeParse(markdown);

  assert.equal(normalized, markdown);

  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'bold-cjk-comma-valid' });
  const btt = convertLASTToBTT(last, { documentId: 'bold-cjk-comma-valid' });

  assert.equal(
    collectTextNodeValues(hast).some((value) => value.includes('**')),
    false,
  );

  const lastRuns = collectLASTTextRuns(last);
  const lastBoldTexts = lastRuns.filter((run) => run.bold).map((run) => run.text);
  assert.deepEqual(lastBoldTexts, ['最多约 250 台人形机器人', '今天已经部署了 30 台 G1，还有多家公司部署了 5-6 台 G1']);
  assert.equal(
    lastRuns.some((run) => run.text.includes('**')),
    false,
  );

  const bttRuns = collectBTTTextRuns(btt);
  const bttBoldTexts = bttRuns.filter((run) => run.bold).map((run) => run.text);
  assert.deepEqual(bttBoldTexts, ['最多约 250 台人形机器人', '今天已经部署了 30 台 G1，还有多家公司部署了 5-6 台 G1']);
  assert.equal(
    bttRuns.some((run) => run.text.includes('**')),
    false,
  );
});

test('Unitree verification fixture preserves source bold intent without stray asterisks', async () => {
  const markdown = await readFile(unitreeFixturePath, 'utf8');
  const expectedBoldTexts = collectSourceBoldIntentTexts(markdown);

  assert.ok(expectedBoldTexts.length > 20);

  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'unitree-bold-fixture' });
  const btt = convertLASTToBTT(last, { documentId: 'unitree-bold-fixture' });

  assert.equal(
    collectTextNodeValues(hast).some((value) => value.includes('**')),
    false,
  );

  const lastRuns = collectLASTTextRuns(last);
  const lastBoldText = lastRuns
    .filter((run) => run.bold)
    .map((run) => run.text)
    .join('');
  for (const expected of expectedBoldTexts) {
    assert.equal(lastBoldText.includes(expected), true, `missing LAST bold text: ${expected}`);
  }
  assert.equal(
    lastRuns.some((run) => run.text.includes('**')),
    false,
  );

  const bttRuns = collectBTTTextRuns(btt);
  const bttBoldText = bttRuns
    .filter((run) => run.bold)
    .map((run) => run.text)
    .join('');
  for (const expected of expectedBoldTexts) {
    assert.equal(bttBoldText.includes(expected), true, `missing BTT bold text: ${expected}`);
  }
  assert.equal(
    bttRuns.some((run) => run.text.includes('**')),
    false,
  );
});

test('hastToLAST and BTT preserve bold text and links when opening bold is adjacent to chinese text', async () => {
  const markdown =
    '另一个有用的办法，是**往电机里塞进更多铜线。**更粗、填充更密的铜线在承载同样电流时电阻更低，Unitree 把这称为它们的 [“Low Copper Consumption Coil](https://www.unitree.com/go1/motor)”。';
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'bold-cjk-adjacent' });
  const btt = convertLASTToBTT(last, { documentId: 'bold-cjk-adjacent' });

  const textIds = last.indexes.byType.text ?? [];
  assert.equal(textIds.length, 1);
  const block = textIds[0] ? last.blocks[textIds[0]] : undefined;
  assert.ok(block && block.type === 'text');
  if (!block || block.type !== 'text') return;

  const boldRuns = block.payload.inlines.filter(
    (inline): inline is Extract<(typeof block.payload.inlines)[number], { kind: 'text_run' }> =>
      inline.kind === 'text_run' && inline.marks.bold === true,
  );
  assert.equal(boldRuns.length, 1);
  assert.equal(boldRuns[0]?.text, '往电机里塞进更多铜线');
  assert.equal(
    block.payload.inlines.some(
      (inline) => inline.kind === 'text_run' && inline.marks.link?.url === 'https://www.unitree.com/go1/motor',
    ),
    true,
  );
  assert.equal(
    block.payload.inlines.some(
      (inline) => inline.kind === 'text_run' && typeof inline.text === 'string' && inline.text.includes('**'),
    ),
    false,
  );

  const rawTextBlockId = textIds[0] ?? '';
  const rawTextBlock = rawTextBlockId ? btt.flatBlocks[rawTextBlockId]?.text : undefined;
  const elements = Array.isArray((rawTextBlock as { elements?: unknown[] } | undefined)?.elements)
    ? ((rawTextBlock as { elements?: unknown[] }).elements as Array<{
        text_run?: { content?: string; text_element_style?: Record<string, unknown> };
      }>)
    : [];
  const boldContents = elements
    .filter((element) => element.text_run?.text_element_style?.bold === true)
    .map((element) => element.text_run?.content ?? '');
  assert.deepEqual(boldContents, ['往电机里塞进更多铜线']);
  assert.equal(
    elements.some((element) => element.text_run?.content?.includes('**')),
    false,
  );
  assert.equal(
    elements.some(
      (element) =>
        element.text_run?.text_element_style?.link && typeof element.text_run?.text_element_style?.link === 'object',
    ),
    true,
  );
});

test('hastToLAST and BTT preserve bold text and links after chinese bold normalization', async () => {
  const markdown =
    '**随着汽车销量扩大，掌握电芯会把需求直接传导出去，进而带来供给改善和生态形成，**像 [Hunan Yuneng](https://example.com) 和 [Shenzhen Dynanonic](https://example.com) 一样。';
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'bold-cjk' });
  const btt = convertLASTToBTT(last, { documentId: 'bold-cjk' });

  const textIds = last.indexes.byType.text ?? [];
  assert.equal(textIds.length, 1);
  const block = textIds[0] ? last.blocks[textIds[0]] : undefined;
  assert.ok(block && block.type === 'text');
  if (!block || block.type !== 'text') return;

  assert.equal(
    block.payload.inlines.some((inline) => inline.kind === 'text_run' && inline.marks.bold === true),
    true,
  );
  assert.equal(
    block.payload.inlines.some(
      (inline) =>
        inline.kind === 'text_run' && 'text' in inline && typeof inline.text === 'string' && inline.text.includes('**'),
    ),
    false,
  );
  assert.equal(
    block.payload.inlines.some(
      (inline) => inline.kind === 'text_run' && inline.marks.link?.url === 'https://example.com',
    ),
    true,
  );

  const rawTextBlockId = textIds[0] ?? '';
  const rawTextBlock = rawTextBlockId ? btt.flatBlocks[rawTextBlockId]?.text : undefined;
  const elements = Array.isArray((rawTextBlock as { elements?: unknown[] } | undefined)?.elements)
    ? ((rawTextBlock as { elements?: unknown[] }).elements as Array<{
        text_run?: { content?: string; text_element_style?: Record<string, unknown> };
      }>)
    : [];
  assert.equal(
    elements.some((element) => element.text_run?.content?.includes('**')),
    false,
  );
  assert.equal(
    elements.some((element) => element.text_run?.text_element_style?.bold === true),
    true,
  );
  assert.equal(
    elements.some(
      (element) =>
        element.text_run?.text_element_style?.link && typeof element.text_run?.text_element_style?.link === 'object',
    ),
    true,
  );
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
  assert.equal(imageChild.payload.width, DEFAULT_TABLE_CELL_IMAGE_WIDTH);
  assert.equal(imageChild.payload.height, undefined);
  assert.equal(iframeChild.payload.component.iframeType, 'bilibili');
  assert.equal(iframeChild.payload.component.url, 'https://www.bilibili.com/video/BV1GJ411x7h7');
});

test('hastToLAST gives standalone paragraph images a non-zero default width', async () => {
  const markdown = '![tiny](./assets/tiny.png)\n';
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'image-default-width' });

  const imageId = last.indexes.byType.image?.[0];
  assert.ok(imageId, 'expected one image block');
  const image = imageId ? last.blocks[imageId] : undefined;
  assert.ok(image && image.type === 'image');
  if (!image || image.type !== 'image') return;
  assert.equal(image.payload.width, DEFAULT_IMAGE_WIDTH);
  assert.equal(image.payload.height, undefined);
});

test('hastToLAST converts linked markdown images to image blocks and preserves surrounding text', async () => {
  const markdown = await readFile(linkedImageFixturePath, 'utf8');
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, { mode: 'fragment', documentId: 'linked-image' });

  const imageIds = last.indexes.byType.image ?? [];
  assert.equal(imageIds.length, 3);

  const images = imageIds.map((imageId) => last.blocks[imageId]).filter((block) => block?.type === 'image');
  assert.equal(images.length, 3);
  assert.deepEqual(
    images.map((image) => (image?.type === 'image' ? image.selector?.attrs?.sourceUrl : null)),
    ['assets/image-1.webp', 'assets/image-2.jpg', 'assets/image-3.png'],
  );
  assert.deepEqual(
    images.map((image) => (image?.type === 'image' ? (image.selector?.attrs?.alt ?? null) : null)),
    [null, 'Alt text', 'Inline alt'],
  );

  const text = collectLASTTextRuns(last)
    .map((run) => run.text)
    .join('');
  assert.equal(text.includes('Caption after image'), true);
  assert.equal(text.includes('Before '), true);
  assert.equal(text.includes(' after.'), true);
  assert.equal(text.includes('substackcdn.com'), false);
  assert.equal(text.includes('https://example.com/original'), false);
});

test('hastToLAST applies imageSizeResolver widths to normal and linked images', async () => {
  const markdown = [
    '# Test',
    '',
    'Full image:',
    '',
    '![](assets/full.webp)',
    '',
    'Half image:',
    '',
    '![](assets/half.webp)',
    '',
    'Linked small image:',
    '',
    '[![](assets/small.webp)](https://example.com)',
    '',
  ].join('\n');
  const calls: Array<{ src: string; inputPath?: string; resourceBaseDir?: string }> = [];
  const sizes: Record<string, { widthRatio: number }> = {
    'assets/full.webp': { widthRatio: 1 },
    'assets/half.webp': { widthRatio: 0.5 },
    'assets/small.webp': { widthRatio: 0.3 },
  };
  const hast = await markdownToHast(markdown);
  const last = hastToLAST(hast, {
    mode: 'fragment',
    documentId: 'image-size-resolver',
    imageSizeContext: {
      inputPath: '/tmp/article.md',
      resourceBaseDir: '/tmp/resources',
    },
    imageSizeResolver: (src, context) => {
      calls.push({
        src,
        inputPath: context.inputPath,
        resourceBaseDir: context.resourceBaseDir,
      });
      return sizes[src];
    },
  });

  const imageIds = last.indexes.byType.image ?? [];
  assert.equal(imageIds.length, 3);
  const images = imageIds.map((imageId) => last.blocks[imageId]);
  assert.deepEqual(
    images.map((image) => (image?.type === 'image' ? image.selector?.attrs?.sourceUrl : null)),
    ['assets/full.webp', 'assets/half.webp', 'assets/small.webp'],
  );
  assert.deepEqual(
    images.map((image) => (image?.type === 'image' ? image.payload.width : null)),
    [DEFAULT_IMAGE_WIDTH, Math.round(DEFAULT_IMAGE_WIDTH * 0.5), Math.round(DEFAULT_IMAGE_WIDTH * 0.3)],
  );
  assert.deepEqual(
    calls.map((call) => call.src),
    ['assets/full.webp', 'assets/half.webp', 'assets/small.webp'],
  );
  assert.equal(
    calls.every((call) => call.inputPath === '/tmp/article.md'),
    true,
  );
  assert.equal(
    calls.every((call) => call.resourceBaseDir === '/tmp/resources'),
    true,
  );
});

test('hastToLAST ignores invalid image width ratios with a warning', async () => {
  const markdown = '![](assets/invalid.webp)';
  const hast = await markdownToHast(markdown);
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };
  try {
    const last = hastToLAST(hast, {
      mode: 'fragment',
      documentId: 'image-size-invalid',
      imageSizeResolver: () => ({ widthRatio: 1.2 }),
    });
    const imageId = last.indexes.byType.image?.[0];
    const image = imageId ? last.blocks[imageId] : undefined;
    assert.ok(image && image.type === 'image');
    if (!image || image.type !== 'image') return;
    assert.equal(image.payload.width, DEFAULT_IMAGE_WIDTH);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /Ignoring invalid image widthRatio/);
});
