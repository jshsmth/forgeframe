# ForgeFrame Test Index

This index documents what each ForgeFrame test file validates and the naming conventions used for clarity.

## Unit Tests (`packages/forgeframe/tests/unit`)

- `bridge.test.ts`: Function bridge serialization/deserialization and remote call dispatch behavior.
- `component-clone.test.ts`: Clone snapshot preservation, lifecycle tracking, peer visibility, and global/tag cleanup.
- `component-instance-index.test.ts`: Internal active-instance indexing, reindexing, tag clearing, and peer lookup snapshot behavior.
- `component.test.ts`: Component creation, registration, instance lifecycle, and host-context detection.
- `component-node-runtime-transition.test.ts`: Component registration across a Node-to-browser runtime transition.
- `consumer-branch-coverage.test.ts`: Consumer branch/edge-path coverage for domain trust, rendering, and prop-sync internals.
- `domain-pattern.test.ts`: Wildcard domain compilation cache behavior and stateless `RegExp` trust checks.
- `dimension.test.ts`: Popup pixel conversion and fallbacks for nonpixel/nonfinite input, with unchanged iframe CSS units.
- `consumer-lifecycle.test.ts`: Consumer handshake, lifecycle messaging, open/close guards, and update validation.
- `consumer-navigation.test.ts`: Relative URL origin admission, declaration/render base changes, pinned destinations, and fragment-bearing navigation.
- `consumer-props-queue.test.ts`: Disconnected reentrant updates, FIFO failure recovery, render admission draining, matching initial request/bootstrap snapshots, and cancellation.
- `consumer-renderer.test.ts`: Renderer ownership of iframe/popup resources, loading completion, custom shell/control preservation, templates, form cleanup after submission failure, mount-document prototypes, and teardown.
- `consumer-transport.test.ts`: Direct consumer transport behavior for trust rotation, failed prop sync cleanup, handshake waiting, and async init error forwarding.
- `consumer-origin-policy.test.ts`: Trust decisions from supplied origin evidence, messaging-origin validation, and changed-origin selection.
- `emitter.test.ts`: Event emitter subscription semantics, once/off behavior, and async error isolation.
- `host-branch-coverage.test.ts`: Host branch/edge-path coverage for deferred init, failure capture, and guard paths.
- `host-lifecycle.test.ts`: Host lifecycle message handling, hostProps synchronization, and consumer window resolution.
- `host-transport.test.ts`: Direct host transport behavior for deferred init scheduling, trust updates, props routing, and teardown.
- `host-security.test.ts`: Host allowlist enforcement and deferred-init security gating.
- `iframe.test.ts`: Iframe creation, reserved-attribute guards, visibility, and sizing helpers.
- `iframe-configuration.test.ts`: Pure CSS and boolean/string attribute encoding rules.
- `index-side-effect-free.test.ts`: Public entrypoint import stays side-effect-free until `initHost()` is called explicitly in ForgeFrame-shaped host windows.
- `index-node-smoke.test.ts`: Public entrypoint imports and component definitions without browser globals.
- `messenger.test.ts`: Cross-window messenger request/response flow, filtering, trust checks, and teardown behavior.
- `messenger-routing.test.ts`: Multi-instance channel routing and function bridge response isolation.
- `popup.test.ts`: Popup open/close/focus/resize helpers, nonpixel resize fallbacks, and close/popup-block detection.
- `playground-code-generator.test.ts`: Executes generated iframe/popup/modal examples with empty props, composite values, callbacks, quoted names, and styles.
- `playground-props-bar.test.ts`: Quoted prop names and values, typed JSON edits, render-time preservation, invalid input recovery, and modal schema cache invalidation.
- `playground-text-rendering.test.ts`: Literal prop keys/values and identity display, safe logger text, update IDs, and preserved host controls.
- `popup-layout.test.ts`: Popup geometry and polling backoff from supplied screen dimensions.
- `package-contract.test.ts`: ESM package exports, documentation claims, and release checks.
- `prop-schema.test.ts`: `prop` schema builder behavior, nonfinite-number rejection, own-field omission/defaults for inherited names in shaped objects, and Standard Schema compliance, parseable HTTP(S) URL validation with immutable/composable constraints, trimming before length validation, immutable literal optional/default clones, and literal/enum union continuation for BigInt/cyclic input and custom encoders without invoking JSON diagnostics.
- `prop-update.test.ts`: Isolated patch/reset merging and validation-key bookkeeping.
- `props-serialize.test.ts`: BASE64/DOTIFY serialization round-trips, nested callbacks produced by custom `toJSON()`, and malformed wrapper fallback behavior.
- `props-alias-materialization.test.ts`: Pure alias-chain resolution, precedence, reset propagation, explicit clearing, and cycle safety.
- `props-alias-updates.test.ts`: Consumer update-pipeline alias precedence, validation rollback, and materialized-value preservation.
- `props.test.ts`: Prop normalization, own canonical/alias selection for inherited names, schema validation, host/query/body filtering and conversion rules.
- `protocol.test.ts`: Protocol message factory, serialization/deserialization, and prefix contract validation.
- `react-driver-lifecycle.test.ts`: Focused lifecycle fault injection for stale completion/rejection isolation, cleanup ordering, unavailable mounts, and context changes. Public refs and observer behavior are covered by `react-host-sync.test.ts`.
- `react-driver-prop-sync.test.ts`: Focused queue fault injection for failed acknowledgement recovery, equivalent in-flight/queued commit retries, and throwing observers. Public FIFO, omission, and validation behavior are covered by `react-host-sync.test.ts`.
- `react-prop-queue.test.ts`: Queue acknowledgement, explicitly requested retries, and reset payload rules without mounting React.
- `schema-interoperability.test.ts`: Interoperability coverage for minimal Standard Schema shapes and optional metadata.
- `schema-contract.test.ts`: Contract coverage against real schema libraries (Zod and Valibot).
- `schema-path-format.test.ts`: Error path formatting behavior for mixed key/index Standard Schema segments.
- `schema.test.ts`: Standard Schema detection and schema-aware prop validation integration.
- `render-templates.test.ts`: Render template DOM creation, styles, transitions, and prerender swap behavior.
- `utils.test.ts`: UID, cleanup manager, and promise utility behavior.
- `url.test.ts`: Relative URL resolution and query appending that preserves fragments, existing encoding, and duplicate parameters.
- `version.test.ts`: Version constant synchronization with package metadata.
- `window-helpers.test.ts`: Cross-window helper behavior for domain checks, traversal, and defensive operations.
- `window-name-payload.test.ts`: Window name payload encoding/parsing and ForgeFrame-window detection helpers.

All unit tests and shared fixtures are strictly compiled by `npm run typecheck`, through `tests/unit/tsconfig.json`. Intentional invalid public inputs use a documented `@ts-expect-error` only at the negative fixture boundary. Compiler strictness remains inherited from the library.

## Integration Tests (`packages/forgeframe/tests/integration`)

- `array-prop-transport.test.ts`: Consumer-side rejection of undefined/sparse array entries before opening or update commitment, recovery, nested values, item defaults, nullable entries, delivery-policy exclusions, custom encoders/host decorators, and export rejection without replacing acknowledged data.
- `body-param-bootstrap.test.ts`: End-to-end iframe and popup `bodyParam` POST bootstrap coverage, including hidden-form submission and host initialization.
- `consumer-host-handshake.test.ts`: End-to-end iframe happy path covering `create()`, `instance.render()`, `initHost()`, and the real INIT handshake, plus oversized bootstrap metadata rejection followed by a valid retry.
- `function-prop-bridge.test.ts`: Real cross-window callback bridging from host `window.hostProps` back to consumer callbacks, including async results, thrown errors, BASE64/DOTIFY nested callback/Date bootstrap and updates, and retirement of replaced callbacks after acknowledged updates in all three serialization modes.
- `host-controls-routing.test.ts`: Real host-builtins coverage for close/focus/resize/show/hide/error/export/peer lookup, plus spoofed-source rejection on consumer and host runtimes.
- `object-prop-roundtrip.test.ts`: Ordinary BASE64/DOTIFY/function-shaped records retain user fields through bootstrap and updates in all three serialization modes.
- `popup-host-handshake.test.ts`: End-to-end popup happy path and popup-blocked failure coverage through `render(..., 'popup')` and `initHost()`.
- `props-alias-sync.test.ts`: End-to-end canonical host synchronization for initial, updated, and chained alias values.
- `props-sync.test.ts`: Post-connect prop updates across the real messaging pipeline, including host snapshot replacement, stale inherited-name key removal, nonfinite update rejection/recovery, host-side rejection followed by a queued valid update, private prop filtering, and nonblocking/cancellable `onProps` subscriber delivery.
- `react-driver-dom.test.ts`: Real React DOM construction failures stay local to the wrapper and preserve sibling application content.
- `react-host-sync.test.ts`: Real React DOM commits through the consumer/host handshake and messaging pipeline, covering updates before readiness, omitted prop defaults/removal, validation recovery, unmount cancellation/cleanup, wrapper styles/prop filtering, latest callbacks and DOM refs, equivalent-commit suppression, popup-to-iframe recovery, StrictMode replay, host error forwarding, and rejected lifecycle/error observer isolation.

All integration test files and their shared harness are checked by `npm run typecheck`. Their TypeScript configuration preserves strict checks and distinguishes consumer schema inputs from normalized host outputs. Vitest executes runtime assertions; it does not replace the separate compiler check.

## Browser Tests (`packages/forgeframe/tests/browser`)

`navigation.spec.ts` builds the production library and runs in Chromium, Firefox, and WebKit against separate local HTTP origins. It covers redirect isolation, rejection of legacy hosts, default-wrapper resizing, and iframe/popup reconnection after reload and full-page navigation with current props and callable callbacks. Recovery cases cover failed-schema retry, shared-factory host-props/control rebinding after successful retry, updates already pending at bootstrap, and callback updates queued during reconnection. Initial-navigation cases capture real iframe/popup GET and POST requests, test relative URL policies with cross-origin base tags and callback/converter mutations, and verify fragment preservation, queued prop snapshots, popup loading cleanup, async subscriber rejection isolation, POST names that shadow form methods, and BASE64/DOTIFY nested callback/Date initialization and updates. Marker-shaped records are exercised as props and exports in every codec, iframe/popup context, and browser engine. Integration cases also verify records that become marker-shaped after custom JSON conversion, with one encoder invocation per delivery.

Install the engines with `npx playwright install chromium firefox webkit`, then run `npm run test:browser` from the repository root. CI installs browser system dependencies and runs all three engines on Node 24. WebKit supplies automated Safari-engine coverage; these tests do not establish physical Safari/device acceptance.

`peer-exports.spec.ts` runs real same-origin sibling hosts under a separate consumer origin in all three engines. It verifies nested callable exports and dates, prop-update independence, propagated errors, retirement/replacement of exports, and discovery across component tags.

`playground-text.spec.ts` builds both real playground pages and the consumer logger. Cross-origin iframe/popup tests verify literal markup-shaped prop names and values, greeting logs, updates, and export controls. Omitted popup dimensions are verified as a 500 × 500 viewport in all three engines. The consumer editor also exercises the physical blur-to-Set click sequence, copied-code refresh, and render/close control states.

The suite also renders two same-tag widgets concurrently against the same host origin, verifying independent prop snapshots and callbacks and continued operation after one peer closes.

## Type Tests (`packages/forgeframe/tests/typecheck`)

- `component-inference.typecheck.ts`: Compile-time assertions for inferred and explicit schema-backed component props, third-party schemas, callbacks, and typed children.
- `host.typecheck.ts`: Host initialization and host-prop schema input/output contracts.
- `remote-values.typecheck.ts`: Promise-returning remote callbacks and exports, nested data shapes, and unchanged local callback inputs.
- `prop-schema.typecheck.ts`: Prop builder inference, defaults, optionality, and composite schemas.
- `alias-inputs.ts`: Compile-time assertions for canonical-key aliases, legacy aliases, mixed updates, and React wrapper input props.
- `react-jsx.tsx`: Compile-time assertions for React JSX wrapper props and element return types.
- `schema.typecheck.ts`: Compile-time assertions for Standard Schema utility and contract types.

## Naming Conventions

- File names use `<module-or-scope>.test.ts` and should reflect the exact module or test concern.
- Top-level `describe` blocks should name the primary module or behavior area under test.
- `it(...)` titles should describe expected behavior with explicit context (for example, include function name when testing guard/error branches).

## Quick Commands

- Run all ForgeFrame tests: `npm run test:run -w forgeframe`
- Run the same suite with coverage thresholds: `npm run test:coverage -w forgeframe` (no separate test run needed)
- Run a single test file: `npm run test:run -w forgeframe -- tests/unit/<file>.test.ts`
- Run type assertions and all unit, integration, and browser fixture checks: `npm run typecheck:tests -w forgeframe`
- Run integration fixture checks alone: `npx tsc -p packages/forgeframe/tests/integration/tsconfig.json --noEmit`

See [the September 2026 test review](../../../docs/test-review.md) for the coverage assessment, regression checks, completed fixture migration, and test-quality decisions.


## Choosing useful additions

Start with a supported public behavior or a reproduced failure and an agreed public seam. Use literal expected outcomes independent of the implementation. Prefer a real consumer/host or React DOM integration when the behavior crosses layers; adapt browser APIs at the environment boundary. Retain focused policy and resource fault-injection cases when they add distinct evidence, and remove superseded wiring assertions once public behavior is verified.

Check both acceptance and rejection/recovery where meaningful. Keep schema inputs and normalized outputs explicit in fixtures, and run `typecheck:tests` as well as Vitest. Use a targeted regression probe to confirm a new test can detect the behavior being lost; restore the source before final validation. Coverage identifies candidates for inspection, while supported behavior and failure impact decide whether to add a test. Do not add casts, mocks, exclusions, or threshold changes merely to reach 100%.
