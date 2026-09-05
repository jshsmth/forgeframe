# ForgeFrame Agent Guide

This file defines working conventions for autonomous coding agents in this repository.

## Mission

- Keep `forgeframe` stable, type-safe, and secure for cross-domain iframe/popup integrations.
- Prefer minimal, focused changes over broad refactors unless explicitly requested.
- Preserve existing public behavior unless the task requires a breaking change.

## Project Structure

- `packages/forgeframe/src`: Core library source code.
- `packages/forgeframe/tests`: Unit, integration, and typecheck suites for the library. See `packages/forgeframe/tests/README.md` for suite-specific guidance.
- `packages/playground`: Consumer/host demo apps used for local validation.
- `README.md`: Public usage and API documentation.

## Tooling and Standards

- Package manager: `npm` with workspaces.
- Language: TypeScript 7 (`strict: true`).
- Build: Vite + TypeScript declaration emit.
- Lint and formatting: Biome (recommended rules and default formatting).
- Test: Vitest (`jsdom` environment).

## Common Commands (Run from repo root)

- Install dependencies: `npm install`
- Library dev playground: `npm run dev`
- Playground split mode: `npm run dev:consumer` and `npm run dev:host`
- Build library: `npm run build`
- Build playground: `npm run build:playground`
- Typecheck library: `npm run typecheck`
- Check lint, formatting, and imports: `npm run lint`
- Apply formatting and safe fixes: `npm run lint:fix`
- Format files: `npm run format`
- Check formatting: `npm run format:check`
- Run non-writing CI checks: `npm run check:ci`
- Run tests: `npm run test:run`

## Change Workflow

1. Identify the impacted package(s) and modules before editing.
2. Implement changes in `packages/forgeframe/src` (or `packages/playground` for demo-only work).
3. Add or update tests in the appropriate suite under `packages/forgeframe/tests` for behavior changes. See `packages/forgeframe/tests/README.md` when choosing between unit, integration, and typecheck coverage.
4. Run relevant validation commands before finishing:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test:run`
5. Update `README.md` when public API or behavior changes.

## Coding Guidelines

- Use ESM imports/exports.
- Keep types explicit at API boundaries.
- Use [TSDoc](https://tsdoc.org/) conventions for TypeScript documentation comments; prefer TSDoc over JSDoc.
- Use [Standard Schema](https://standardschema.dev/schema) for schema definitions/interoperability where schema standards are needed.
- Reuse existing module boundaries under `packages/forgeframe/src`; prefer the closest existing module before creating a new one.
- Prefer small, composable functions and avoid unnecessary dependencies.
- Maintain origin/sandbox safety checks for any cross-window messaging changes.

## Files to Avoid Editing Unless Required

- `node_modules/`
- `dist/` outputs
- `coverage/` outputs

## Done Criteria

- Code compiles and tests pass for affected areas.
- Lint/typecheck pass for touched code.
- Behavior is covered by the appropriate automated tests when feasible.
- Documentation is updated for user-visible changes.
