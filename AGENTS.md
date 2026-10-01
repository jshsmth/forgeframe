# ForgeFrame Agent Guide

ForgeFrame provides cross-domain iframe and popup integrations. Keep changes
focused and preserve public behavior unless the task explicitly changes it.

## Find the relevant context

Project knowledge lives in the Plasma Wiki under `docs/`. Run
`wiki map --path docs`, or read [docs/_index.md](docs/_index.md) if the CLI is
unavailable. Open only the pages the task needs with `wiki search --path docs`
and `wiki read --path docs`; use `wiki match --path docs` for regex searches.

- Public API, usage, setup, and release commands: [README.md](README.md).
- Subsystem changes, state ownership, and lifecycle ordering:
  [architecture](docs/architecture.md).
- IOSP review or callable changes: [callable reference](docs/iosp-review.md).
  Update affected classifications and run their listed boundary tests.
- Test selection and fixture conventions:
  [test index](packages/forgeframe/tests/README.md).

Library code lives in `packages/forgeframe/src`; the consumer/host demos live in
`packages/playground`. Use npm workspaces and the pinned tools from `npm ci`.
Look up additional commands in the root `package.json` rather than duplicating
them here.

## Preserve the contracts

- Preserve public types, wire formats, errors, origin/source checks, sandbox behavior,
  callback identity, cancellation, acknowledgement, and cleanup ordering.
- Keep state with its existing runtime. Pass browser observations into pure
  policy; give changed callables one cohesive operation or an explicit sequence
  of named operations. Keep recursive algorithms and useful local helpers together.
- Keep types explicit at API boundaries. Use TSDoc for TypeScript API
  documentation and Standard Schema for schema
  interoperability. Add regression coverage at the appropriate public boundary
  when behavior changes; preserve coverage thresholds.
- Local test fixtures and playground servers are disposable validation surfaces.
  Run and repair task-related checks as part of the authorized work.

## Validate and finish

For code changes, run `npm run lint`, `npm run typecheck`, and the affected
tests. Use `npm run test:coverage` for the full unit/integration suite; it also
runs the tests, so a second full test run is unnecessary. For cross-window or
React lifecycle changes, run `npm run test:browser` across all three engines.
For release preparation, run `npm run release:check` and the browser suite.
Report local results and hosted CI separately; publish or announce only when
the user requests it.

For documentation changes, validate links and run `npm run docs:check`.
Edit the root README and run `npm run build` to refresh the package README
mirror. Build outputs, declarations, coverage, and generated wiki surfaces
belong to their generators.

## Maintain the wiki

Keep current architecture and callable knowledge on the existing topic pages.
Author page bodies and descriptive metadata; let `wiki update --path docs` own
`name`, timestamps, headings, and index link blocks above `***`. After changing
pages or their locations, run `npm run docs:update`, then `npm run docs:check`.
Rename with `git mv` and fix authored links. Setup and the pinned CLI version
are documented in the README's **Project wiki** section. This repo uses the CLI
and Markdown directly; it needs no Obsidian configuration or executable wiki hooks.
