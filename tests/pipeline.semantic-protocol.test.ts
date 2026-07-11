import assert from 'node:assert/strict';
import test from 'node:test';
import { convertLASTToBTT } from '../src/interop/index.js';
import { hastToLAST, markdownToSemanticHast } from '../src/pipeline/index.js';

const target = {
  footnotes: {
    render: 'callout' as const,
    image_policy: 'sibling-after' as const,
    background_color: 'light-gray',
    border_color: 'gray',
  },
  figures: { default_width_ratio: 1, preserve_source_ratio: true },
  tables: { invalid_table: 'error' as const, caption_position: 'above' as const },
  callouts: { unsupported_child_policy: 'sibling-after' as const },
  math: {
    renderer: 'katex' as const,
    currency_policy: 'protect' as const,
    unsupported_command: 'error' as const,
    environments: ['aligned', 'cases', 'matrix'],
  },
};

test('article-render semantic nodes produce figure, table, equation, callout and split footnote blocks', async () => {
  const markdown = `:::figure{#fig-demo width="72%" align="center"}\n[![Diagram](assets/a.png)](https://example.com/full)\n\n::caption[Figure caption]\n::note[Figure note]\n::source[Figure source]\n:::\n\n:::table{#tbl-demo}\n| Name | Value |\n| --- | ---: |\n| \`a|b\` | $x \\mid y$ |\n\n::caption[Table caption]\n:::\n\n:::equation{#eq-demo number="auto"}\n$$\n\\begin{cases}x & x > 0 \\\\ 0 & x = 0\\end{cases}\n$$\n\n::caption[Equation caption]\n:::\n\n:::callout{#callout-warning type="warning"}\nWarning text.\n:::\n\nStatement[^1].\n\n[^1]: Before ![](assets/footnote.png) after.\n`;
  const parsed = await markdownToSemanticHast(markdown.replace('$x \\mid y$', '$x | y$'), {
    strict: true,
    target,
  });
  assert.deepEqual(parsed.semantic.diagnostics, []);
  assert.equal(parsed.semantic.counts.figures, 1);
  assert.equal(parsed.semantic.counts.tables, 1);
  assert.equal(parsed.semantic.counts.equations, 2);
  assert.equal(parsed.semantic.counts.footnoteReferences, 1);
  assert.equal(parsed.semantic.counts.footnoteDefinitions, 1);

  const last = hastToLAST(parsed.hast, {
    mode: 'fragment',
    semanticTarget: target,
    imageSizeResolver: (src) => (src === 'assets/a.png' ? { widthRatio: 0.5 } : undefined),
  });
  assert.equal(last.indexes.byType.image?.length, 2);
  assert.equal(last.indexes.byType.table?.length, 1);
  assert.equal(last.indexes.byType.callout?.length, 3);
  const tableCellTextBlocks = Object.values(last.blocks).filter(
    (block) => block.type === 'text' && block.parentId && last.blocks[block.parentId]?.type === 'table_cell',
  );
  assert.ok(
    tableCellTextBlocks.some(
      (block) =>
        block.type === 'text' &&
        block.payload.inlines.some(
          (inline) => inline.kind === 'text_run' && inline.marks.inlineCode && inline.text === 'a|b',
        ),
    ),
  );
  assert.ok(
    tableCellTextBlocks.some(
      (block) =>
        block.type === 'text' &&
        block.payload.inlines.some((inline) => inline.kind === 'equation' && inline.latex === 'x | y'),
    ),
  );
  const figureImage = Object.values(last.blocks).find(
    (block) => block.type === 'image' && block.selector?.attrs?.semanticId === 'fig-demo',
  );
  assert.equal(figureImage?.type === 'image' ? figureImage.payload.width : null, 720);
  assert.equal(figureImage?.selector?.attrs?.sourceUrl, 'assets/a.png');
  assert.equal(figureImage?.selector?.attrs?.linkHref, 'https://example.com/full');
  const text = Object.values(last.blocks)
    .filter((block) => block.type === 'text')
    .flatMap((block) =>
      block.type === 'text'
        ? block.payload.inlines.map((inline) =>
            inline.kind === 'text_run' ? (inline.text ?? '') : inline.kind === 'equation' ? (inline.latex ?? '') : '',
          )
        : [],
    )
    .join('\n');
  assert.match(text, /Figure caption/);
  assert.match(text, /Before/);
  assert.match(text, /after/);

  const btt = convertLASTToBTT(last, { documentId: 'semantic-protocol' });
  const blockTypes = Object.values(btt.flatBlocks).map((block) => block.block_type);
  assert.equal(blockTypes.filter((type) => type === 27).length, 2);
  assert.equal(blockTypes.filter((type) => type === 31).length, 1);
  assert.equal(blockTypes.filter((type) => type === 19).length, 3);
});

test('directive width overrides resolver and manifest-style image hints', async () => {
  const parsed = await markdownToSemanticHast(`:::figure{#fig-a width="30%"}\n![](assets/a.png)\n:::\n`, {
    strict: true,
    target,
  });
  const last = hastToLAST(parsed.hast, {
    mode: 'fragment',
    semanticTarget: target,
    imageSizeResolver: () => ({ widthRatio: 0.8 }),
  });
  const image = Object.values(last.blocks).find((block) => block.type === 'image');
  assert.equal(image?.type === 'image' ? image.payload.width : null, 300);
});

test('strict semantic validation rejects unknown directives, missing footnotes, invalid width and KaTeX', async () => {
  const parsed = await markdownToSemanticHast(
    `:::unknown{#x}\ntext\n:::\n\n:::figure{#fig-a width="120%"}\ntext\n:::\n\nMissing[^9].\n\n$\\unsupportedCommand{x}$\n`,
    { strict: true, target },
  );
  const codes = parsed.semantic.diagnostics.map((diagnostic) => diagnostic.code);
  assert.ok(codes.includes('unknown-directive'));
  assert.ok(codes.includes('invalid-figure-width'));
  assert.ok(codes.includes('figure-image-required'));
  assert.ok(codes.includes('missing-footnote-definition'));
  assert.ok(codes.includes('katex-validation'));
});

test('currency adjacent to math remains text while real inline math becomes equation', async () => {
  const parsed = await markdownToSemanticHast(`Budget is $20-$30 and formula is $x+1$.`, {
    strict: true,
    target,
    singleDollarTextMath: true,
  });
  const last = hastToLAST(parsed.hast, { mode: 'fragment', semanticTarget: target });
  const block = Object.values(last.blocks).find((item) => item.type === 'text');
  assert.equal(block?.type, 'text');
  assert.ok(
    block?.type === 'text' &&
      block.payload.inlines.some((inline) => inline.kind === 'equation' && inline.latex === 'x+1'),
  );
  const rendered =
    block?.type === 'text'
      ? block.payload.inlines.map((inline) => (inline.kind === 'text_run' ? inline.text : '')).join('')
      : '';
  assert.match(rendered, /\$20-\$30/);
});

test('currency protection handles standalone amounts across semantic text contexts', async () => {
  const markdown = [
    'Revenue rises from $45,000 per person to $1M per person.',
    '',
    '> The median is $50k/year and approximately ~$100M.',
    '',
    '- Aid rises from $1,200 to $10k per person.',
    '',
    '| Item | Cost |',
    '| --- | --- |',
    '| Plan | $2.4T |',
    '',
    ':::figure{#fig-currency}',
    '![](assets/a.png)',
    '',
    '::caption[Costs $20-$30, later $20–$30.]',
    ':::',
    '',
    'Statement[^money].',
    '',
    '[^money]: Floor $1M, ceiling $10M/yr.',
    '',
    'Real math remains math: $P(y \\mid x)$ and $2x + 1$.',
  ].join('\n');
  const parsed = await markdownToSemanticHast(markdown, {
    strict: true,
    target,
    singleDollarTextMath: true,
  });
  assert.deepEqual(parsed.semantic.diagnostics, []);
  assert.equal(parsed.semantic.counts.equations, 2);
  const visible = JSON.stringify(parsed.hast);
  for (const amount of [
    '$45,000',
    '$1M',
    '$50k/year',
    '~$100M',
    '$1,200',
    '$10k',
    '$2.4T',
    '$20-$30',
    '$20–$30',
    '$10M/yr',
  ]) {
    assert.ok(visible.includes(amount), 'missing visible currency amount: ' + amount);
  }
});

test('currency protection leaves code, escaped dollars, display math, and valid inline math intact', async () => {
  const markdown = [
    'Inline code: `$45,000` and escaped currency \\$20.',
    '',
    '```text',
    '$1M and $10M',
    '```',
    '',
    '$$',
    'x = 20',
    '$$',
    '',
    'Inline formula: $2x + 1$.',
  ].join('\n');
  const parsed = await markdownToSemanticHast(markdown, {
    strict: true,
    target,
    singleDollarTextMath: true,
  });
  assert.deepEqual(parsed.semantic.diagnostics, []);
  assert.equal(parsed.semantic.counts.equations, 2);
});

test('currency parse policy retains unprotected dollar parsing behavior', async () => {
  const parsed = await markdownToSemanticHast('From $20 to $30.', {
    strict: true,
    target: { ...target, math: { ...target.math, currency_policy: 'parse' as const } },
    singleDollarTextMath: true,
  });
  assert.equal(parsed.semantic.counts.equations, 1);
});

test('raw HTML produces a source diagnostic before visible content can be discarded', async () => {
  const markdown = [
    'Before.[^1]',
    '',
    '<table>',
    '  <tr><td>Plan A[^2]</td></tr>',
    '</table>',
    '',
    '[^1]: Before.',
    '[^2]: Inside.',
  ].join('\n');
  const strict = await markdownToSemanticHast(markdown, { strict: true, target, inputPath: '/tmp/article.md' });
  const diagnostic = strict.semantic.diagnostics.find((item) => item.code === 'unsupported-raw-html');
  assert.deepEqual(diagnostic, {
    severity: 'error',
    code: 'unsupported-raw-html',
    message: 'Raw HTML <table> would be discarded in Lark protocol mode. Convert it to a GFM table before publication.',
    sourcePath: '/tmp/article.md',
    line: 3,
    column: 1,
  });
  assert.equal(
    strict.semantic.diagnostics.some((item) => item.code === 'unreferenced-footnote' && item.message.includes('2')),
    false,
  );

  const nonStrict = await markdownToSemanticHast(markdown, { strict: false, target });
  assert.equal(
    nonStrict.semantic.diagnostics.find((item) => item.code === 'unsupported-raw-html')?.severity,
    'warning',
  );
});

test('raw HTML comments are accepted as non-visible protocol metadata', async () => {
  const parsed = await markdownToSemanticHast('Before.\n\n<!-- renderer metadata -->\n\nAfter.', {
    strict: true,
    target,
  });
  assert.equal(
    parsed.semantic.diagnostics.some((item) => item.code === 'unsupported-raw-html'),
    false,
  );
});

test('equation auto numbering, document wrapper normalization, labels and contract macros are materialized', async () => {
  const parsed = await markdownToSemanticHast(
    `:::equation{#eq-one number="auto"}\n$$\n\\begin{equation}\\label{eq-inner} x \\in \\R\\end{equation}\n$$\n:::\n`,
    {
      strict: true,
      target: { ...target, math: { ...target.math, macros: { '\\R': '\\mathbb{R}' } } },
    },
  );
  const duplicate = parsed.semantic.diagnostics.find((diagnostic) => diagnostic.code === 'duplicate-semantic-id');
  assert.equal(duplicate, undefined);
  const last = hastToLAST(parsed.hast, { mode: 'fragment', semanticTarget: target });
  const equationBlock = Object.values(last.blocks).find(
    (block) => block.type === 'text' && block.selector?.attrs?.semanticRole === 'equation',
  );
  assert.equal(equationBlock?.type, 'text');
  const equation =
    equationBlock?.type === 'text'
      ? equationBlock.payload.inlines.find((inline) => inline.kind === 'equation')
      : undefined;
  assert.equal(equation?.kind === 'equation' ? equation.latex : null, ' x \\in \\mathbb{R}');
  assert.ok(
    equationBlock?.type === 'text' &&
      equationBlock.payload.inlines.some((inline) => inline.kind === 'text_run' && inline.text === ' (1)'),
  );
});

test('text footnotes preserve inline formatting and links in one callout', async () => {
  const parsed = await markdownToSemanticHast(
    'Text[^12].\n\n[^12]: Footnote with **bold** and a [link](https://example.com).\n',
    { strict: true, target },
  );
  assert.deepEqual(parsed.semantic.diagnostics, []);
  const last = hastToLAST(parsed.hast, { mode: 'fragment', semanticTarget: target });
  assert.equal(last.indexes.byType.callout?.length, 1);
  const calloutId = last.indexes.byType.callout?.[0];
  const callout = calloutId ? last.blocks[calloutId] : undefined;
  assert.equal(callout?.type, 'callout');
  const child = callout?.children[0] ? last.blocks[callout.children[0]] : undefined;
  assert.ok(
    child?.type === 'text' &&
      child.payload.inlines.some((inline) => inline.kind === 'text_run' && inline.text === 'bold' && inline.marks.bold),
  );
  assert.ok(
    child?.type === 'text' &&
      child.payload.inlines.some(
        (inline) =>
          inline.kind === 'text_run' && inline.text === 'link' && inline.marks.link?.url === 'https://example.com',
      ),
  );
});

test('multi-image figures emit sequential image blocks', async () => {
  const parsed = await markdownToSemanticHast(':::figure{#fig-multi}\n![](assets/a.png)\n\n![](assets/b.png)\n:::\n', {
    strict: true,
    target,
  });
  const last = hastToLAST(parsed.hast, { mode: 'fragment', semanticTarget: target });
  assert.deepEqual(
    last.topLevel.map((id) => last.blocks[id]?.selector?.attrs?.sourceUrl),
    ['assets/a.png', 'assets/b.png'],
  );
});

test('aligned and matrix environments, explicit tags, and equation references validate structurally', async () => {
  const parsed = await markdownToSemanticHast(
    ':::equation{#eq-one number="auto"}\n$$\n\\begin{aligned}a &= b \\\\ c &= d\\end{aligned}\\tag{7}\n$$\n:::\n\n' +
      ':::equation{#eq-two}\n$$\n\\begin{matrix}1 & 2 \\\\ 3 & 4\\end{matrix}\n$$\n:::\n\n' +
      'See [Equation 1](#eq-one) and $\\eqref{eq-one}$.\n',
    { strict: true, target },
  );
  assert.deepEqual(parsed.semantic.diagnostics, []);
  assert.ok(parsed.semantic.capabilityLosses.some((loss) => loss.includes('anchor navigation')));
  const last = hastToLAST(parsed.hast, { mode: 'fragment', semanticTarget: target });
  const equations = Object.values(last.blocks)
    .filter((block) => block.type === 'text')
    .flatMap((block) =>
      block.type === 'text'
        ? block.payload.inlines.filter((inline) => inline.kind === 'equation').map((inline) => inline.latex)
        : [],
    );
  assert.ok(equations.some((latex) => latex?.includes('\\tag{7}')));
  assert.ok(equations.some((latex) => latex === '\\text{(1)}'));
});
