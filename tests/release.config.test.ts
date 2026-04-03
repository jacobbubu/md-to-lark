import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const releaseConfig = require('../release.config.cjs');

function getPluginConfig(name: string) {
  const plugin = releaseConfig.plugins.find(
    (entry: string | [string, Record<string, unknown>]) =>
      Array.isArray(entry) && entry[0] === name,
  );

  assert.ok(plugin, `expected semantic-release plugin ${name} to be configured`);
  assert.ok(Array.isArray(plugin), `expected plugin ${name} to use tuple config`);
  return plugin[1];
}

test('semantic-release github plugin disables success issue resolution', () => {
  const pluginConfig = getPluginConfig('@semantic-release/github');

  assert.equal(pluginConfig.successCommentCondition, false);
  assert.equal(pluginConfig.releasedLabels, false);
});
