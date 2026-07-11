import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getRendererCapabilities,
  parseArticleFrontmatter,
  resolveRendererContract,
  validateRendererContract,
} from '../src/protocol/index.js';

async function tempDir(t: test.TestContext): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'md-to-lark-contract-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('protocol frontmatter is parsed and removed from visible body', () => {
  const parsed = parseArticleFrontmatter(
    `---\narticle_render:\n  protocol: article-render/v1\n  contracts:\n    lark: ./index.lark.yml\n---\n# Title\n`,
  );
  assert.equal(parsed?.articleRender?.protocol, 'article-render/v1');
  assert.equal(parsed?.articleRender?.contracts?.lark, './index.lark.yml');
  assert.equal(parsed?.body, '# Title\n');
});

test('renderer contract discovery resolves inheritance with map merge and array replacement', async (t) => {
  const dir = await tempDir(t);
  await mkdir(path.join(dir, 'config'));
  await writeFile(
    path.join(dir, 'config', 'base.lark.yml'),
    `protocol: article-render/v1\nrenderer: lark\ndocument:\n  source: index.md\nrequirements: [local-images]\ntargets:\n  lark:\n    figures:\n      default_width_ratio: 1\n      preserve_source_ratio: true\n`,
  );
  await writeFile(
    path.join(dir, 'index.lark.yml'),
    `protocol: article-render/v1\nrenderer: lark\ndocument:\n  source: index.md\nextends:\n  - ./config/base.lark.yml\nrequirements: [semantic-directives, native-tables]\nstrict: true\ntargets:\n  lark:\n    figures:\n      default_width_ratio: 0.8\n`,
  );
  const markdown = `---\narticle_render:\n  protocol: article-render/v1\n  contracts:\n    lark: ./index.lark.yml\n---\n# Title\n`;
  const resolved = await resolveRendererContract({ inputPath: path.join(dir, 'index.md'), markdown });
  assert.equal(resolved.resolved?.selection, 'frontmatter');
  assert.equal(resolved.resolved?.strict, true);
  assert.deepEqual(resolved.resolved?.contract.requirements, ['semantic-directives', 'native-tables']);
  assert.deepEqual(resolved.resolved?.contract.targets.lark?.figures, {
    default_width_ratio: 0.8,
    preserve_source_ratio: true,
  });
  assert.equal(resolved.markdownBody, '# Title\n');
});

test('renderer contract rejects source mismatch, missing capabilities, and inheritance cycles', async (t) => {
  const dir = await tempDir(t);
  const contractPath = path.join(dir, 'bad.lark.yml');
  await writeFile(
    contractPath,
    `protocol: article-render/v1\nrenderer: lark\ndocument:\n  source: other.md\nrequirements: [future-capability]\ntargets:\n  lark: {}\n`,
  );
  await assert.rejects(
    () => validateRendererContract(contractPath, { inputPath: path.join(dir, 'index.md') }),
    /source mismatch/,
  );

  await writeFile(
    path.join(dir, 'a.lark.yml'),
    `extends: [./b.lark.yml]\nprotocol: article-render/v1\nrenderer: lark\ndocument: { source: index.md }\ntargets: { lark: {} }\n`,
  );
  await writeFile(
    path.join(dir, 'b.lark.yml'),
    `extends: [./a.lark.yml]\nprotocol: article-render/v1\nrenderer: lark\ndocument: { source: index.md }\ntargets: { lark: {} }\n`,
  );
  await assert.rejects(
    () => validateRendererContract(path.join(dir, 'a.lark.yml'), { inputPath: path.join(dir, 'index.md') }),
    /inheritance cycle/,
  );

  await writeFile(
    contractPath,
    `protocol: article-render/v1\nrenderer: lark\ndocument: { source: index.md }\nrequirements: [future-capability]\ntargets: { lark: {} }\n`,
  );
  await assert.rejects(() => validateRendererContract(contractPath), /missing required capabilities/);
});

test('lark capabilities expose article-render/v1 requirements', () => {
  const capabilities = getRendererCapabilities();
  assert.deepEqual(capabilities.protocols, ['article-render/v1']);
  for (const key of [
    'gfm-footnotes',
    'semantic-directives',
    'lark-callout',
    'image-display-size',
    'katex',
    'native-tables',
  ]) {
    assert.equal(capabilities.capabilities[key], 1);
  }
});

test('renderer contract validates target-specific enum and image ratio fields', async (t) => {
  const dir = await tempDir(t);
  const contractPath = path.join(dir, 'index.lark.yml');
  await writeFile(
    contractPath,
    'protocol: article-render/v1\nrenderer: lark\ndocument: { source: index.md }\ntargets:\n  lark:\n    footnotes:\n      render: list\n    figures:\n      default_width_ratio: 1.5\n',
  );
  await assert.rejects(() => validateRendererContract(contractPath), /supports only callout|default_width_ratio/);
});

test('strict mode without any discoverable renderer contract fails', async (t) => {
  const dir = await tempDir(t);
  await assert.rejects(
    () =>
      resolveRendererContract({
        inputPath: path.join(dir, 'index.md'),
        markdown: '# No contract\n',
        strict: true,
      }),
    /requires a lark renderer contract/,
  );
});
