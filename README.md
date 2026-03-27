# md-to-lark

[中文说明](./README_zh.md)

`md-to-lark` publishes Markdown (GFM) content to Feishu docs through a repeatable pipeline.

It is not a one-off rendering script. The pipeline covers input preparation, title policy, asset detection and upload, Mermaid rendering, table enhancement, dry-run, and stage-by-stage artifacts for debugging.

## Repository And Package Name

- GitHub repository: [jacobbubu/md-to-lark](https://github.com/jacobbubu/md-to-lark)
- The npm package metadata is configured as `@jacobbubu/md-to-lark`
- The dependency `@jacobbubu/md-zh-format` remains unchanged

Notes:

- The commands in this README are still focused on local development and verification.
- Once the package is actually published to npm, it can be installed as `@jacobbubu/md-to-lark`.

## What It Is Good For

- Publishing a single Markdown file to a Feishu doc
- Recursively publishing multiple `.md` files from a directory
- Preparing local assets, remote images, and standalone URLs before publish
- Running a full dry-run without writing to Feishu
- Rewriting Markdown before publish with presets

## Quick Start

Install dependencies first:

```bash
npm install
```

Then prepare `.env`:

```bash
cp .env.sample .env
```

At minimum, make sure these values are valid:

```env
LARK_APP_ID="xxx"
LARK_APP_SECRET="xxx"
LARK_TOKEN_TYPE=tenant
LARK_FOLDER_TOKEN="xxx"
```

If you want the returned `documentUrl` to use a specific browser domain, set this too:

```env
LARK_DOCUMENT_BASE_URL="https://li.feishu.cn"
```

Notes:

- `--dry-run` still validates Feishu configuration first. It is not a zero-config mode.
- As long as `--doc` is not provided, `LARK_FOLDER_TOKEN` is required for single-file, directory, dry-run, and real publish modes.

The first run should use a built-in sample:

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run
```

This runs the full pipeline without actually writing to Feishu. After that looks correct, remove `--dry-run`:

```bash
npm run publish:md -- --input ./test-md/comp/comp.md
```

Successful CLI runs now print a JSON array to stdout. Each item contains:

- `documentId`
- `title`
- `status`
- `documentUrl`

Progress logs and exceptions are written to stderr.

`documentUrl` is built from `documentId` plus a document base URL:

- Prefer `--document-base-url`
- Otherwise use `LARK_DOCUMENT_BASE_URL`
- Otherwise fall back to the current compatibility derivation from `LARK_BASE_URL`

## Common Commands

Basic publish:

```bash
npm run publish:md -- --input ./test-md/comp/comp.md
npm run publish:md -- --input ./test-md/comp/comp.md --dry-run
npm run publish:md -- --input ./test-md
```

Target document and title:

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --doc <document_id>
npm run publish:md -- --input ./test-md --title "Team Notes"
npm run publish:md -- --input ./test-md/comp/comp.md --no-date-prefix
```

Presets, Mermaid, and stage artifacts:

```bash
npm run publish:md -- --input ./test-md/comp/comp.md --preset medium --dry-run
npm run publish:md -- --input ./test-md/comp/comp.md --preset zh-format --dry-run
npm run publish:md -- --input ./test-md/mermaid.md --mermaid-target board --dry-run
npm run publish:md -- --input ./test-md/comp/comp.md --pipeline-cache-dir ./out/debug-cache --dry-run
```

Debugging and helper scripts:

```bash
npm run dev:playground
npm run example:module
npm run fetch:board-data -- --doc <document_id> --index 1
```

## Testing

Default local verification:

```bash
npm run check
npm test
```

Live Feishu end-to-end tests:

```bash
npm run test:e2e
npm run test:e2e:watch
```

Notes:

- `npm test` only runs local tests and never writes to Feishu.
- `npm run test:e2e` runs real Feishu end-to-end tests and requires a local `.env-test`.
- `.env-test` is already ignored by Git and can be prepared from `.env-test.example`.

## Release Process

Releases are now driven by `semantic-release`.

- Only pushes to `main` can trigger a real release
- Version numbers are calculated from commit messages
- GitHub Releases and npm publishing are both handled automatically
- `CHANGELOG.md` is maintained by CI

Required repository setup:

- GitHub Actions must be enabled
- The repository must have an `NPM_TOKEN` secret with publish permission for `@jacobbubu/md-to-lark`
- Commits merged into `main` should continue to use Conventional Commit style such as `feat:` and `fix:`

Guardrails:

- Non-`main` branches do not trigger the release workflow
- Non-`main` branches can still run local checks, tests, and build verification
- npm publishing is expected to happen only through the `main` branch CI flow

## Core Capabilities

- Single-file and recursive directory publish
- Title derivation, title prefix, and single-H1 promotion
- Local attachment and image detection with real upload
- Remote image download and standalone URL preparation
- Mermaid `text-drawing` and `board` output paths
- Table width heuristics and numeric-column right alignment
- Chinese Markdown formatting preset (`zh-format`)
- Stage cache output from `00-source` to `05-publish`
- Programmatic access through `publishMdToLark`

## Where To Read Next

README is only the entry point. It does not repeat the full parameter reference or implementation details.

1. [docs/README.md](./docs/README.md)
2. [overview.md](./docs/01-getting-started/overview.md)
3. [quickstart.md](./docs/01-getting-started/quickstart.md)
4. [presets.md](./docs/02-guides/presets.md)
5. [cli-reference.md](./docs/03-reference/cli-reference.md)
6. [architecture-overview.md](./docs/04-internals/architecture-overview.md)

If this is your first time using the project, read in this order:

`01-getting-started -> 02-guides -> 03-reference -> 04-internals`
