---
name: developing
title: Developing ForgeFrame
desc: Local setup, the playground, source layout, wiki maintenance, checks, and the release workflow.
tags: []
sources: []
created: 2026-11-16T03:15:22Z
updated: 2026-11-16T03:15:22Z
---

# Developing ForgeFrame

Repository tooling needs Node.js 22.23.4 or later 22.x, 24.22.1 or later 24.x, or 26.12.1 and newer. These minimums include the October 2026 Node.js security fixes and satisfy jsdom 30. Use Node.js 24 locally; CI also tests on Node.js 22 and 26. Run commands from the repository root:

```bash
npm ci
npm run dev
```

The playground serves the consumer at `https://localhost:5173` and the host at `https://localhost:5174`. Both import the library source, so no library build is needed. HTTPS uses `vite-plugin-mkcert`, which may ask you to trust its local certificate authority on first run.

To run over HTTP without certificates:

```bash
FORGEFRAME_SKIP_MKCERT=1 VITE_HOST_URL=http://localhost:5174/ FORGEFRAME_PLAYGROUND_OPEN=0 npm run dev
```

Then open `http://localhost:5173`. The `/tests` page runs browser scenarios for iframe and popup handshakes, prop updates, callbacks, and lifecycle behavior. `npm run dev:consumer` and `npm run dev:host` start the two servers separately; set `VITE_HOST_URL` when the host runs at another address.

The **Company demo** button opens `/company`, a fictional Pip Veterinary invoice portal that takes payment through the fictional Harbor Pay provider on the host's `/payment.html`. Pick one of three AUD invoices and pay in a modal iframe or a popup with the prepared demo card details. The outcome selector approves immediately or declines the first attempt and approves the retry. Closing the payment window leaves the invoice unpaid; a successful payment returns a receipt and marks only that invoice paid. **Reset demo** or a page refresh restores the sample invoices. All payment processing and company and customer data are simulated; there is no backend. The [playground architecture page](architecture/playground.md) describes how the demo is built.

**Experience** shows the clinic's payment journey. **Technical** keeps the same app running and adds its origins, live props, lifecycle events, and callback arguments and acknowledgements. Its source tabs show the consumer, host, shared contract, merchant acceptance rules, and provider simulation, with TSDoc on ownership, initialization, cancellation, and callback return values. The host waits for the consumer's `onResult` acknowledgement before closing.

For a custom deployment, set `VITE_HOST_URL` in the consumer build and `VITE_CONSUMER_URL` in the host build; the payment host allowlists that consumer origin. By default it allows the local consumer on port 5173 with the host page's protocol. Consumer builds generate a static `/company/index.html`; host builds include `/payment.html`.

## Architecture and Ownership

The [architecture guide](architecture/_index.md) covers state ownership and the render/bootstrap, props, callback, and React flows. The [callable reference](callables/_index.md) classifies runtime responsibilities and links their boundary tests.

- The package has two entries, built together so they share one copy of the core: `packages/forgeframe/src/index.ts` (`forgeframe`) defines the public exports, and `src/react.ts` (`forgeframe/react`) exports the React adapter. Other source barrels are internal.
- `core/component.ts` owns component factories and instance tracking. `core/consumer.ts` coordinates rendering, the prop pipeline, and transport; `core/host/` owns host bootstrap, the `Host` handle and the host's props.
- `communication/` owns request/response messaging and callback bridging. Transports hold their peer window and validate browser-provided sources and origins.
- `props/` owns schemas, normalization, and serialization. Each prop has one schema that must accept its own output unchanged, so every trust boundary revalidates normalized props with that same schema.
- `render/` owns iframe and popup resources and templates; `drivers/` holds the optional React adapter, published only through `forgeframe/react`. `packages/playground/` exercises the library as consumer and host.

## Project Wiki

Project documentation lives in the [wiki](_index.md): user guides under [guide](guide/_index.md), contributor knowledge under [architecture](architecture/_index.md) and [callables](callables/_index.md). It is managed with [Plasma Wiki](https://docs.plasma.ai/wiki/guide/index.html). The CLI generates page metadata and index navigation, and a GitHub Actions check fails on stale indexes or wiki lint issues.

Install Python 3.11 or newer and the pinned CLI with `uv tool install plasma-wiki==1.9.0` (or `pipx install plasma-wiki==1.9.0`). Browse with `wiki map --path docs`, search with `wiki search --path docs "callback"`, and read a page with `wiki read architecture --path docs`. The pages are plain Markdown and can also be read directly.

Edit page bodies and authored metadata such as `title` and `desc`. The CLI owns `name`, timestamps, headings, and the index link blocks above `***`; put index prose below that line. After adding, moving, or editing pages, run `npm run docs:update`, then `npm run docs:check` before committing. Image assets are excluded from indexing. No Obsidian vault, plugins, or wiki hooks are needed. Run `npm run docs:setup` once after cloning to register the merge driver that `.gitattributes` names for `_index.md` files, so the generated index blocks merge without conflicts; run `npm run docs:update` after each merge. Without the wiki CLI on `PATH`, the driver falls back to git's text merge. It registers only the driver, unlike `wiki config`, which also installs Obsidian files this repo does not use.

The wiki CLI is a contributor tool, separate from the npm package and its release checks. The Documentation workflow installs the same pinned version and runs the checks without modifying files.

## Checks

Development uses TypeScript 7 and Biome with default formatting and recommended lint rules. `npm ci` installs the pinned tools, and npm scripts run the local `tsc` and `biome`. TypeScript runs in strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and `noImplicitReturns`, and checks library declarations. The library also sets `isolatedDeclarations`, so every exported type is written out rather than inferred, and its published declarations cannot change by accident. The compile-time API contracts also run without the two optional-property flags, so the public types work under both settings. Biome fails on warnings, skips generated builds, coverage, and the npm lockfile, and leaves Markdown unformatted so it cannot rewrite the wiki's `***` and `[[` syntax.

In VS Code, use the Biome extension (`biomejs.biome`) and the TypeScript 7 language service (`TypeScriptTeam.native-preview`); in other editors, use their Biome and TypeScript 7 LSP integrations. Consumers of the package do not need TypeScript 7.

Tests and playground bindings use explicit value guards, so a missing fixture or element fails instead of silently skipping an assertion or action. `@ts-expect-error` appears only where a test asserts that the types reject an input: in the compile-time contracts, and in runtime tests that pass a JavaScript caller's invalid input. A local Biome suppression, with its reason, remains only where the code must break a rule: the variadic `any` bound callback types need, the type test that proves `IsEqual` rejects `any`, and fixtures that define a `then` prop to check that the name is reserved.

| Command | What it checks |
|---------|----------------|
| `npm run lint` | Biome lint, formatting, and import checks across source and supported configuration files |
| `npm run lint:fix` | Apply Biome formatting, import organization, and safe lint fixes |
| `npm run format` / `npm run format:check` | Write / check Biome formatting |
| `npm run check:ci` | Non-writing Biome checks for CI |
| `npm run docs:check` | Pinned Plasma Wiki version, generated-index freshness, and wiki lint |
| `npm run docs:update` | Regenerate wiki metadata and indexes after documentation edits |
| `npm run typecheck` | Library source, compile-time API contracts, playground types, and the Vite, Vitest, and Playwright configs |
| `npm run test:run` | Unit and integration tests in jsdom, plus Node-specific suites |
| `npm run test:coverage` | The same tests with coverage thresholds enforced |
| `npm run test:browser` | Cross-origin iframe and popup regressions in Chromium, Firefox, and WebKit |
| `npm run build && npm run typecheck:package` | ESM output and both entries' emitted declarations under NodeNext resolution |
| `npm run size` | Minified and gzipped size of each published entry (`forgeframe` and `forgeframe/react`, each with the shared chunks it imports) against its budgets in `packages/forgeframe/scripts/check-bundle-size.mjs`; run after `npm run build` |
| `npm run build:playground` | Consumer and host production builds |
| `npm run test:package` | Pack and install the built library in an isolated project; verify both entries' ESM imports, `require()` through the `default` condition, and NodeNext consumer types (root types checked before React is installed, and again with TypeScript 5.0, which it downloads); compile every TypeScript example in the README and the wiki pages, except the v1 migration guide. Mark a block that is not meant to compile with `<!-- readme-check: skip -->` on the line before it |
| `npm run release:check` | Lint, types, tests once with coverage, builds, bundle size, dependency audit, package dry run, and installed-package checks; does not publish |

See the [test index](../packages/forgeframe/tests/README.md) for suite selection and single-file commands. jsdom tests do not replace browser testing of cross-origin navigation, popup blockers, or visual behavior. `npm audit` needs registry access; if the audit service fails, the release check is incomplete even when the local checks pass.

Install browser engines with `npx playwright install chromium firefox webkit` before running `npm run test:browser`. CI runs all three engines on Node 24 in the Playwright container image, which ships the browsers and their system libraries; keep the image tag in `.github/workflows/test.yml` in step with `@playwright/test`. Browser tests get one retry: a test that passes only on retry still fails the run, and the traces, screenshots and videos of failed tests are uploaded as the `playwright-report` artifact. A release needs both the local checks and hosted CI to pass. WebKit covers the Safari engine, not physical Safari or devices.

The root `README.md` is the front page, and the reference guides are the wiki pages under `docs/guide/`; each topic has one home. Link from the README into `docs/` with absolute GitHub URLs, because the README is also the npm page. The library build copies the README to `packages/forgeframe/README.md` for npm; commit the refreshed copy and do not edit it directly. TypeScript generates the declarations under `dist/`, and `scripts/fix-dts-imports.mjs` adjusts them for NodeNext consumers; do not edit them by hand.

## Release Workflow

Version preparation and publication are separate. The Release workflow publishes from CI through [npm trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token is stored and the package gets a provenance attestation.

1. Run `npm run version:patch`, `version:minor`, or `version:major` to update workspace metadata and the lockfile only. For an explicit version, use `npm version 2.0.1 -w forgeframe --no-git-tag-version`. These commands do not commit, tag, publish, or push. npm 11 re-indents `package-lock.json` with tabs; re-serialize it with 2-space indentation before committing.
2. Run `npm run release:check` and `npm run test:browser`, review the changes, and commit the intended release source and metadata. Verify hosted CI for that commit before releasing.
3. Create the matching annotated Git tag, such as `v2.0.1`, on that commit. Keep the working tree clean so the published files match the tagged source.
4. Push the release commit and its specific tag explicitly. The Release workflow runs in three jobs, each with only the permissions it needs. The verify job checks that the tag matches the package version, runs `npm run release:check` and the browser suite in all three engines, and packs the package; it has no npm or write access. The publish job, the only one that can authenticate to npm, publishes that tarball with `npm publish <tarball> --provenance --tag <dist-tag>`. The last job creates the GitHub release notes. Manual workflow runs must select the matching tag.

A version with a pre-release component, such as `2.1.0-beta.1`, publishes under the `next` dist-tag and its GitHub release is marked as a pre-release, so `npm install forgeframe` keeps resolving to the latest final version; install a pre-release with `npm install forgeframe@next`. Any other version publishes under `latest`. `packages/forgeframe/scripts/release-dist-tag.mjs` makes that choice. Moving `next` after a final release (`npm dist-tag add forgeframe@<version> next`) needs the owner's npm login, because trusted publishing authenticates only the workflow's publish.

If the workflow fails before anything reaches npm, fix the problem through a normal pull request, then recreate the tag on the fixed commit or use the next pre-release number. If npm published but a later step failed, do not publish again: create the GitHub release by hand from the tag. A published version number can never be reused; fix a bad release with a new patch version and deprecate the bad one if necessary.

Trusted publishing needs a one-time setup on npmjs.com: in the `forgeframe` package settings, add a trusted publisher for this GitHub repository with the workflow file `release.yml`. There is no local publish script: every release goes through the workflow, so each published version has provenance and passed the browser suite.

There are no `release:patch`, `release:minor`, or `release:major` scripts, because workspace versioning does not create commits or tags. `npm run release:check` verifies locally without publishing or pushing.
