module.exports = {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        releaseRules: [{ type: 'refactor', release: 'patch' }],
      },
    ],
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    [
      '@semantic-release/npm',
      {
        tarballDir: 'release-artifacts',
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: [{ path: 'release-artifacts/*.tgz', label: 'npm package tarball' }],
        // Commit messages in this repo reference GitLab issues like "(#36)".
        // GitHub success hooks would try to resolve those as GitHub issues/PRs and fail.
        successCommentCondition: false,
        releasedLabels: false,
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json', 'package-lock.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
};
