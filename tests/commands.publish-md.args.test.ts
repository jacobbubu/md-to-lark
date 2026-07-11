import assert from 'node:assert/strict';
import test from 'node:test';
import { getPublishMdUsage, hasPublishMdHelpFlag, parsePublishMdArgs } from '../src/commands/publish-md/args.js';

test('parsePublishMdArgs parses --input with env folder token', () => {
  const options = parsePublishMdArgs(['--input', './examples/a.md', '--dry-run'], {
    LARK_FOLDER_TOKEN: 'fld_test_token',
  });
  assert.deepEqual(options, {
    inputPath: './examples/a.md',
    folderToken: 'fld_test_token',
    dryRun: true,
  });
});

test('parsePublishMdArgs parses --preset path', () => {
  const options = parsePublishMdArgs(['--input', './examples/a.md', '--preset', './my-preset.mjs', '--dry-run'], {
    LARK_FOLDER_TOKEN: 'fld_test_token',
  });
  assert.equal(options.presetPath, './my-preset.mjs');
  assert.deepEqual(options.presetPaths, ['./my-preset.mjs']);
});

test('parsePublishMdArgs parses --preset built-in name', () => {
  const options = parsePublishMdArgs(['--input', './examples/a.md', '--preset', 'medium', '--dry-run'], {
    LARK_FOLDER_TOKEN: 'fld_test_token',
  });
  assert.equal(options.presetPath, 'medium');
  assert.deepEqual(options.presetPaths, ['medium']);
});

test('parsePublishMdArgs parses repeated --preset values in order', () => {
  const options = parsePublishMdArgs(
    ['--input', './examples/a.md', '--preset', 'zh-format', '--preset', './my-preset.mjs', '--dry-run'],
    {
      LARK_FOLDER_TOKEN: 'fld_test_token',
    },
  );
  assert.equal(options.presetPath, undefined);
  assert.deepEqual(options.presetPaths, ['zh-format', './my-preset.mjs']);
});

test('parsePublishMdArgs parses --document-base-url', () => {
  const options = parsePublishMdArgs(
    ['--input', './examples/a.md', '--document-base-url', 'https://li.feishu.cn', '--dry-run'],
    {
      LARK_FOLDER_TOKEN: 'fld_test_token',
    },
  );
  assert.equal(options.documentBaseUrl, 'https://li.feishu.cn');
});

test('parsePublishMdArgs parses --resource-base-dir', () => {
  const options = parsePublishMdArgs(
    ['--input', './examples/a.md', '--resource-base-dir', './generated-assets', '--dry-run'],
    {
      LARK_FOLDER_TOKEN: 'fld_test_token',
    },
  );
  assert.equal(options.resourceBaseDir, './generated-assets');
});

test('parsePublishMdArgs parses article renderer protocol options', () => {
  const options = parsePublishMdArgs(
    [
      '--input',
      './article/index-zh.md',
      '--renderer',
      'lark',
      '--renderer-contract',
      './article/index-zh.lark.yml',
      '--renderer-default-contract',
      './config/default.lark.yml',
      '--strict',
      '--render-report',
      './article/reports/render.json',
      '--image-size-manifest',
      './article/assets/manifest.yml',
      '--dry-run',
    ],
    { LARK_FOLDER_TOKEN: 'fld_test_token' },
  );
  assert.equal(options.renderer, 'lark');
  assert.equal(options.rendererContractPath, './article/index-zh.lark.yml');
  assert.equal(options.rendererDefaultContractPath, './config/default.lark.yml');
  assert.equal(options.strict, true);
  assert.equal(options.renderReportPath, './article/reports/render.json');
  assert.equal(options.imageSizeManifestPath, './article/assets/manifest.yml');
});

test('parsePublishMdArgs parses positional input and --doc without folder', () => {
  const options = parsePublishMdArgs(['./examples/a.md', '--doc', 'doccn123'], {});
  assert.deepEqual(options, {
    inputPath: './examples/a.md',
    folderToken: '',
    documentId: 'doccn123',
    dryRun: false,
  });
});

test('parsePublishMdArgs allows pure local dry-run without folder or document', () => {
  const options = parsePublishMdArgs(['--input', './examples/a.md', '--strict', '--dry-run'], {});
  assert.equal(options.folderToken, '');
  assert.equal(options.documentId, undefined);
  assert.equal(options.dryRun, true);
});

test('parsePublishMdArgs parses prepare options', () => {
  const options = parsePublishMdArgs(
    [
      '--input',
      './examples/a.md',
      '--download-remote-images',
      '--yt-dlp-path',
      '/usr/local/bin/yt-dlp',
      '--yt-dlp-cookies-path',
      '/tmp/cookies.txt',
      '--pipeline-cache-dir',
      './out/prepare',
      '--dry-run',
    ],
    { LARK_FOLDER_TOKEN: 'fld_test_token' },
  );
  assert.deepEqual(options, {
    inputPath: './examples/a.md',
    folderToken: 'fld_test_token',
    downloadRemoteImages: true,
    ytDlpPath: '/usr/local/bin/yt-dlp',
    ytDlpCookiesPath: '/tmp/cookies.txt',
    pipelineCacheDir: './out/prepare',
    dryRun: true,
  });
});

test('parsePublishMdArgs parses single-dollar math option aliases', () => {
  const longOption = parsePublishMdArgs(['--input', './examples/a.md', '--single-dollar-text-math', '--dry-run'], {
    LARK_FOLDER_TOKEN: 'fld_test_token',
  });
  assert.equal(longOption.singleDollarTextMath, true);

  const shortOption = parsePublishMdArgs(['--input', './examples/a.md', '--single-dollar-math', '--dry-run'], {
    LARK_FOLDER_TOKEN: 'fld_test_token',
  });
  assert.equal(shortOption.singleDollarTextMath, true);
});

test('parsePublishMdArgs parses --no-date-prefix', () => {
  const options = parsePublishMdArgs(['--input', './examples/a.md', '--no-date-prefix', '--dry-run'], {
    LARK_FOLDER_TOKEN: 'fld_test_token',
  });
  assert.equal(options.titleDatePrefix, false);
});

test('parsePublishMdArgs parses mermaid board options', () => {
  const options = parsePublishMdArgs(
    [
      '--input',
      './examples/a.md',
      '--mermaid-target',
      'board',
      '--mermaid-board-syntax-type',
      '2',
      '--mermaid-board-style-type',
      '1',
      '--mermaid-board-diagram-type',
      '0',
      '--dry-run',
    ],
    { LARK_FOLDER_TOKEN: 'fld_test_token' },
  );
  assert.equal(options.mermaidTarget, 'board');
  assert.equal(options.mermaidBoardSyntaxType, 2);
  assert.equal(options.mermaidBoardStyleType, 1);
  assert.equal(options.mermaidBoardDiagramType, 0);
});

test('parsePublishMdArgs rejects when input is missing', () => {
  assert.throws(
    () => parsePublishMdArgs([], { LARK_FOLDER_TOKEN: 'x' }),
    /Input path is required\. Use --input <file\.md\|dir>\./,
  );
});

test('parsePublishMdArgs rejects unknown option', () => {
  assert.throws(
    () => parsePublishMdArgs(['--input', 'a.md', '--unknown'], { LARK_FOLDER_TOKEN: 'x' }),
    /Unknown option: --unknown/,
  );
});

test('parsePublishMdArgs rejects when folder and doc are both missing', () => {
  assert.throws(
    () => parsePublishMdArgs(['--input', 'a.md'], {}),
    /Folder token is required when --doc is not provided\./,
  );
});

test('getPublishMdUsage returns usage text with key options', () => {
  const usage = getPublishMdUsage();
  assert.match(usage, /^Usage:/m);
  assert.match(usage, /--input/);
  assert.match(usage, /--preset/);
  assert.match(usage, /--document-base-url/);
  assert.match(usage, /--resource-base-dir/);
  assert.match(usage, /--renderer-contract/);
  assert.match(usage, /--render-report/);
  assert.match(usage, /--image-size-manifest/);
  assert.match(usage, /--download-remote-images/);
  assert.match(usage, /--yt-dlp-path/);
  assert.match(usage, /--pipeline-cache-dir/);
  assert.match(usage, /--single-dollar-text-math/);
  assert.match(usage, /--no-date-prefix/);
  assert.match(usage, /--mermaid-target/);
  assert.match(usage, /--mermaid-board-syntax-type/);
  assert.match(usage, /built-in name/);
  assert.match(usage, /--dry-run/);
  assert.match(usage, /--help, -h/);
  assert.match(usage, /article-render\/v1 protocol mode.*frontmatter.*removed from visible output/i);
  assert.match(usage, /legacy mode.*legacy preparation policy/i);
  assert.match(usage, /Missing local asset files are skipped\/degraded/i);
  assert.match(usage, /Relative local asset paths resolve against the markdown file directory by default/i);
});

test('hasPublishMdHelpFlag detects help options', () => {
  assert.equal(hasPublishMdHelpFlag([]), false);
  assert.equal(hasPublishMdHelpFlag(['--input', 'a.md']), false);
  assert.equal(hasPublishMdHelpFlag(['--help']), true);
  assert.equal(hasPublishMdHelpFlag(['-h']), true);
  assert.equal(hasPublishMdHelpFlag(['--input', 'a.md', '-h']), true);
});
