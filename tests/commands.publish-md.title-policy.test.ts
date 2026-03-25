import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { toString } from 'hast-util-to-string';
import type { Element as HastElement, Root as HastRoot, RootContent as HastRootContent } from 'hast';
import { markdownToHast } from '../src/pipeline/index.js';
import type { PublishInputSet } from '../src/commands/publish-md/input-resolver.js';
import { applySingleH1TitleRule, buildTitleForMarkdown } from '../src/commands/publish-md/title-policy.js';

function datePrefix(now = new Date()): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function isElement(node: HastRootContent): node is HastElement {
  return node.type === 'element';
}

function collectHeadingTags(node: HastRoot | HastElement, out: string[] = []): string[] {
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (!child || !isElement(child)) continue;
    if (/^h[1-9]$/.test(child.tagName)) {
      out.push(child.tagName);
    }
    collectHeadingTags(child, out);
  }
  return out;
}

function findFirstTag(node: HastRoot | HastElement, tagName: string): HastElement | undefined {
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (!child || !isElement(child)) continue;
    if (child.tagName === tagName) return child;
    const nested = findFirstTag(child, tagName);
    if (nested) return nested;
  }
  return undefined;
}

test('applySingleH1TitleRule derives title, removes h1, and promotes headings', async () => {
  const hast = await markdownToHast('# Main Title\n\n## Child Section\n\nParagraph');
  const result = applySingleH1TitleRule(hast);

  assert.deepEqual(result, { derivedTitle: 'Main Title' });

  const headings = collectHeadingTags(hast);
  assert.equal(headings.filter((tag) => tag === 'h1').length, 1);
  assert.equal(headings.includes('h2'), false);

  const promoted = findFirstTag(hast, 'h1');
  assert.ok(promoted);
  assert.equal(toString(promoted), 'Child Section');
});

test('applySingleH1TitleRule keeps content unchanged when multiple h1 exist', async () => {
  const hast = await markdownToHast('# A\n\n# B\n\n## C');
  const before = collectHeadingTags(hast);
  const result = applySingleH1TitleRule(hast);
  const after = collectHeadingTags(hast);

  assert.deepEqual(result, {});
  assert.deepEqual(after, before);
  assert.equal(after.filter((tag) => tag === 'h1').length, 2);
  assert.equal(after.filter((tag) => tag === 'h2').length, 1);
});

test('buildTitleForMarkdown uses override for single mode with date prefix', () => {
  const inputSet: PublishInputSet = {
    mode: 'single',
    rootPath: '/tmp',
    markdownFiles: ['/tmp/a.md'],
  };
  const prefix = datePrefix();
  const title = buildTitleForMarkdown('/tmp/a.md', inputSet, 'My Doc');
  assert.equal(title, `${prefix}-My Doc`);
});

test('buildTitleForMarkdown does not duplicate date prefix', () => {
  const inputSet: PublishInputSet = {
    mode: 'single',
    rootPath: '/tmp',
    markdownFiles: ['/tmp/a.md'],
  };
  const prefixed = `${datePrefix()}-Already`;
  const title = buildTitleForMarkdown('/tmp/a.md', inputSet, prefixed);
  assert.equal(title, prefixed);
});

test('buildTitleForMarkdown composes directory title with override prefix', () => {
  const rootPath = path.join('/tmp', 'docs');
  const markdownPath = path.join(rootPath, 'sales', 'q1.md');
  const inputSet: PublishInputSet = {
    mode: 'directory',
    rootPath,
    markdownFiles: [markdownPath],
  };

  const title = buildTitleForMarkdown(markdownPath, inputSet, 'Batch');
  assert.equal(title, `${datePrefix()}-Batch / sales / q1`);
});

test('buildTitleForMarkdown prefers h1DerivedTitle when no override in directory mode', () => {
  const rootPath = path.join('/tmp', 'docs');
  const markdownPath = path.join(rootPath, 'ops.md');
  const inputSet: PublishInputSet = {
    mode: 'directory',
    rootPath,
    markdownFiles: [markdownPath],
  };

  const title = buildTitleForMarkdown(markdownPath, inputSet, undefined, 'From H1');
  assert.equal(title, `${datePrefix()}-From H1`);
});

test('buildTitleForMarkdown can disable date prefix', () => {
  const inputSet: PublishInputSet = {
    mode: 'single',
    rootPath: '/tmp',
    markdownFiles: ['/tmp/a.md'],
  };
  const title = buildTitleForMarkdown('/tmp/a.md', inputSet, 'My Doc', undefined, {
    datePrefix: false,
  });
  assert.equal(title, 'My Doc');
});
