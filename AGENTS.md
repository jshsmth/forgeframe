# ForgeFrame Agent Guide

This file defines working conventions for autonomous coding agents in this repository.

## Mission

- Keep `forgeframe` stable, type-safe, and secure for cross-domain iframe/popup integrations.
- Prefer minimal, focused changes over broad refactors unless explicitly requested.
- Preserve existing public behavior unless the task requires a breaking change.

## Project Structure

- `packages/forgeframe/src`: Core library source code.
- `packages/forgeframe/tests/unit`: Vitest unit tests for the library.
- `packages/playground`: Consumer/host demo apps used for local validation.
- `README.md`: Public usage and API documentation.

## Tooling and Standards

- Package manager: `npm` with workspaces.
- Language: TypeScript (`strict: true`).
- Build: Vite + TypeScript declaration emit.
- Lint: ESLint + `typescript-eslint`.
- Test: Vitest (`jsdom` environment).

## Common Commands (Run from repo root)

- Install dependencies: `npm install`
- Library dev playground: `npm run dev`
- Playground split mode: `npm run dev:consumer` and `npm run dev:host`
- Build library: `npm run build`
- Build playground: `npm run build:playground`
- Typecheck library: `npm run typecheck`
- Lint all packages: `npm run lint`
- Run tests: `npm run test:run`

## Change Workflow

1. Identify the impacted package(s) and modules before editing.
2. Implement changes in `packages/forgeframe/src` (or `packages/playground` for demo-only work).
3. Add or update tests in `packages/forgeframe/tests/unit` for behavior changes.
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
- Reuse existing module boundaries (`core`, `communication`, `props`, `render`, `window`, `drivers`).
- Prefer small, composable functions and avoid unnecessary dependencies.
- Maintain origin/sandbox safety checks for any cross-window messaging changes.

## Files to Avoid Editing Unless Required

- `node_modules/`
- `dist/` outputs
- `coverage/` outputs

## Done Criteria

- Code compiles and tests pass for affected areas.
- Lint/typecheck pass for touched code.
- Behavior is covered by tests when feasible.
- Documentation is updated for user-visible changes.
