const CJK_BOLD_TRAILING_PUNCTUATION = '，。；：！？、】【）」』》、';
const BOLD_PUNCTUATION_RE = new RegExp(
  `\\*\\*([^*\\n]+?)([${CJK_BOLD_TRAILING_PUNCTUATION}])\\*\\*(?=[\\p{Script=Han}\\p{Letter}\\p{Number}\\[])`,
  'gu',
);

function transformOutsideInlineCode(segment: string): string {
  return segment.replace(BOLD_PUNCTUATION_RE, (_match, content: string, punctuation: string) => {
    return `**${content}**${punctuation}`;
  });
}

function normalizeLineOutsideInlineCode(line: string): string {
  let output = '';
  let cursor = 0;

  while (cursor < line.length) {
    const tickIndex = line.indexOf('`', cursor);
    if (tickIndex === -1) {
      output += transformOutsideInlineCode(line.slice(cursor));
      break;
    }

    output += transformOutsideInlineCode(line.slice(cursor, tickIndex));

    let tickEnd = tickIndex;
    while (tickEnd < line.length && line[tickEnd] === '`') {
      tickEnd += 1;
    }

    const delimiter = line.slice(tickIndex, tickEnd);
    const closeIndex = line.indexOf(delimiter, tickEnd);
    if (closeIndex === -1) {
      output += line.slice(tickIndex);
      break;
    }

    output += line.slice(tickIndex, closeIndex + delimiter.length);
    cursor = closeIndex + delimiter.length;
  }

  return output;
}

export function rewriteLeadingFrontmatterAsCodeFence(markdown: string): string {
  const hasBom = markdown.startsWith('\uFEFF');
  const source = hasBom ? markdown.slice(1) : markdown;
  const fmMatch = source.match(
    /^((?:[ \t]*\r?\n)*)(-{3}|\+{3})[ \t]*\r?\n([\s\S]*?)\r?\n(?:-{3}|\+{3}|\.{3})[ \t]*(?:\r?\n|$)/,
  );
  if (!fmMatch || !fmMatch[0]) return markdown;

  const leadingBlankLines = fmMatch[1] ?? '';
  const opener = fmMatch[2];
  const body = fmMatch[3] ?? '';
  const language = opener === '+++' ? 'toml' : 'yaml';
  const rest = source.slice(fmMatch[0].length);
  const normalizedBody = body.replace(/\r\n/g, '\n');
  const trailing = normalizedBody.endsWith('\n') ? '' : '\n';
  const rewritten = `${leadingBlankLines}\`\`\`${language}\n${normalizedBody}${trailing}\`\`\`\n${rest}`;
  return hasBom ? `\uFEFF${rewritten}` : rewritten;
}

export function normalizeChineseBoldClosingPunctuation(markdown: string): string {
  const lines = markdown.match(/[^\r\n]*(?:\r?\n|$)/g) ?? [];
  let inFence = false;
  let activeFenceChar = '';
  let activeFenceLength = 0;
  let output = '';

  for (const chunk of lines) {
    if (!chunk) continue;
    const lineBreakMatch = chunk.match(/(\r?\n)$/);
    const lineBreak = lineBreakMatch?.[1] ?? '';
    const line = lineBreak ? chunk.slice(0, -lineBreak.length) : chunk;

    const fenceMatch = line.match(/^[ \t]{0,3}([`~]{3,})/);
    if (inFence) {
      output += chunk;
      if (fenceMatch) {
        const fence = fenceMatch[1] ?? '';
        if (fence && fence[0] === activeFenceChar && fence.length >= activeFenceLength) {
          inFence = false;
          activeFenceChar = '';
          activeFenceLength = 0;
        }
      }
      continue;
    }

    if (fenceMatch) {
      const fence = fenceMatch[1] ?? '';
      inFence = true;
      activeFenceChar = fence[0] ?? '';
      activeFenceLength = fence.length;
      output += chunk;
      continue;
    }

    output += normalizeLineOutsideInlineCode(line) + lineBreak;
  }

  return output;
}

export function normalizeMarkdownBeforeParse(markdown: string): string {
  return normalizeChineseBoldClosingPunctuation(rewriteLeadingFrontmatterAsCodeFence(markdown));
}
