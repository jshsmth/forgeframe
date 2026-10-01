# ForgeFrame Test Index

This index documents what each ForgeFrame test file validates and the naming conventions used for clarity.

## Unit Tests (`packages/forgeframe/tests/unit`)

- `company-demo-payment-policy.test.ts`: Browser-independent merchant session/result admission, receipt commitment/isolation, unpaid decline/retry, mismatch and duplicate rejection, malformed callback/receipt fields, ISO calendar/time validity, snapshot ownership and valid retry after rejection, payment availability, provider simulation, demo-card normalization and recorded acknowledgement rules.

- `bridge.test.ts`: Function bridge serialization/deserialization, remote call dispatch, 500-callback admission, full snapshot replacement, duplicate identity reuse, staged calls, rollback, bounded delivery recovery, append capacity, and reset/teardown.
- `component-clone.test.ts`: Clone snapshot preservation, lifecycle tracking, peer visibility, global/tag cleanup, and close completion while failed-render teardown is already waiting on cleanup.
- `component-instance-index.test.ts`: Internal active-instance indexing, reindexing, tag clearing, and peer lookup snapshot behavior.
- `component.test.ts`: Component creation, registration, instance lifecycle, and host-context detection.
- `component-node-runtime-transition.test.ts`: Component registration across a Node-to-browser runtime transition.
- `consumer-branch-coverage.test.ts`: Consumer branch/edge-path coverage for domain trust, rendering, and prop-sync internals.
- `domain-pattern.test.ts`: Wildcard domain compilation cache behavior and stateless `RegExp` trust checks.
- `dimension.test.ts`: Popup pixel conversion and fallbacks for nonpixel/nonfinite input, with unchanged iframe CSS units.
- `consumer-lifecycle.test.ts`: Consumer handshake, lifecycle messaging, open/close guards, and update validation.
- `consumer-navigation.test.ts`: Relative URL origin admission, declaration/render base changes, pinned destinations, and fragment-bearing navigation.
- `consumer-props-queue.test.ts`: Disconnected reentrant updates, FIFO failure recovery, render admission draining, matching initial request/bootstrap snapshots, and cancellation.
- `consumer-renderer.test.ts`: Renderer ownership of iframe/popup resources, loading completion, configured CSS preservation throughout the transition, eager/lazy loading concealment and early visibility controls, custom shell/control preservation, templates, form cleanup after submission failure, mount-document prototypes, and teardown.
- `consumer-transport.test.ts`: Direct consumer transport behavior for trust rotation, failed prop sync cleanup, handshake waiting, and async init error forwarding.
- `consumer-origin-policy.test.ts`: Trust decisions from supplied origin evidence, messaging-origin validation, and changed-origin selection.
- `error.test.ts`: Unknown-error normalization preserves Error identity and ordinary coercion, with a stable fallback when coercion throws.
- `emitter.test.ts`: Event emitter subscription semantics, once/off behavior, and async error isolation.
- `host-branch-coverage.test.ts`: Host branch/edge-path coverage for deferred init, failure capture, and guard paths.
- `host-lifecycle.test.ts`: Host lifecycle message handling, hostProps synchronization, consumer window resolution, consumer-only field discard in legacy bootstrap payloads, same-turn rejected legacy configuration through `initHost()` and matching `create()` with immediate/deferred INIT delivery, atomic late-configuration validation/reconciliation, built-in and snapshot identity, and pending-bootstrap removal persistence.
- `host-transport.test.ts`: Direct host transport behavior for deferred init scheduling, trust updates, props routing, and teardown.
- `host-security.test.ts`: Host allowlist enforcement and deferred-init security gating, including rejected late definitions preserving completed legacy hosts while invalidating incomplete messaging bootstrap.
- `iframe.test.ts`: Iframe creation, reserved-attribute guards, visibility, and sizing helpers.
- `iframe-configuration.test.ts`: Pure CSS and boolean/string attribute encoding rules.
- `index-side-effect-free.test.ts`: Public entrypoint import stays side-effect-free until `initHost()` is called explicitly in ForgeFrame-shaped host windows.
- `index-node-smoke.test.ts`: Public entrypoint imports and component definitions without browser globals.
- `messenger.test.ts`: Cross-window messenger request/response flow, filtering, trust checks, and teardown behavior.
- `messenger-routing.test.ts`: Multi-instance channel routing and function bridge response isolation.
- `popup.test.ts`: Popup open/close/focus/resize helpers, nonpixel resize fallbacks, and close/popup-block detection.
- `playground-code-generator.test.ts`: Executes generated iframe/popup/modal examples with empty props, composite values, callbacks, quoted names, and styles; verifies copied popup dimensions match live rendering and playground-owned callbacks override editor-added data definitions without duplicate object keys.
- `playground-props-bar.test.ts`: Quoted prop names and values, typed JSON edits, render-time preservation, invalid input recovery, rejection of every reserved host-control name before mutation, and modal schema cache invalidation.
- `playground-text-rendering.test.ts`: Literal prop keys/values and identity display, safe logger text, update IDs, and preserved host controls.
- `popup-layout.test.ts`: Popup geometry and polling backoff from supplied screen dimensions.
- `package-contract.test.ts`: ESM package exports, documentation claims, and release checks.
- `prop-schema.test.ts`: `prop` schema builder behavior, nonfinite-number rejection, own-field omission/defaults for inherited names in shaped objects, and Standard Schema compliance, parseable HTTP(S) URL validation with immutable/composable constraints, trimming before length validation, immutable literal optional/default clones, and literal/enum union continuation for BigInt/cyclic input and custom encoders without invoking JSON diagnostics.
- `prop-update.test.ts`: Isolated patch/reset merging and validation-key bookkeeping.
- `props-serialize.test.ts`: BASE64/DOTIFY serialization round-trips, ordinary-record encoding without primitive coercion probes, single wrapper coercion, customized/foreign boxed values, untouched branding getters and virtual proxy branding, opaque proxy prototype metadata, nested callbacks produced by custom `toJSON()`, native/foreign raw JSON values returned by encoders, JSON-undefined leaf omission, emptied branches, marker-shaped assembled branches, and malformed wrapper fallback behavior.
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
- `schema.test.ts`: Standard Schema detection and schema-aware prop validation integration, and observation of unsupported rejected native/foreign promises in direct and nested schemas.
- `realm-values.test.ts`: Cross-window Date and ordinary-record recognition, class/array rejection, and preservation of codec array values.
- `render-templates.test.ts`: Render template DOM creation, styles, transitions, and prerender swap behavior.
- `utils.test.ts`: UID, cleanup manager, and promise utility behavior.
- `url.test.ts`: Relative URL resolution and query appending that preserves fragments, existing encoding, and duplicate parameters.
- `version.test.ts`: Version constant synchronization with package metadata.
- `window-helpers.test.ts`: Cross-window helper behavior for domain checks, traversal, and defensive operations.
- `window-name-payload.test.ts`: Window name payload encoding/parsing and ForgeFrame-window detection helpers.

All unit tests and shared fixtures are strictly compiled by `npm run typecheck`, through `tests/unit/tsconfig.json`. Intentional invalid public inputs use a documented `@ts-expect-error` only at the negative fixture boundary. Compiler strictness remains inherited from the library.

## Integration Tests (`packages/forgeframe/tests/integration`)

`consumer-host-handshake.test.ts` also covers parent bootstrap with a recursive Zod child schema, preservation of own child names such as `__proto__` and `constructor` without changing map prototypes, and public host destruction followed by fresh initialization, prop synchronization, and working host controls. Child-name cases retain factory identity through a prop update and exercise public close. `prop-schema.test.ts` verifies enum constraints and diagnostics stay stable after the caller mutates the original values array.

`props-sync.test.ts` covers undefined definition entries as omitted through public construction, bootstrap, updates and close, and stale or duplicate cancellation handles after re-registering the same subscriber. `props.test.ts` checks that omitted built-in definitions retain default normalization and delivery rules.
`component.test.ts` covers omitted reserved entries during declaration and continued rejection of actual host-control definitions.

`prop-schema.test.ts` also locks down caller-container mutation for object shapes and the public tuple/union constructors, including indexed tuple, enum, and union definitions with null prototypes or shadowed iterators. `props-serialize.test.ts`, `cross-realm-props.test.ts`, and browser `navigation.spec.ts` exercise arrays with null prototypes and shadowed `map` methods through JSON/BASE64/DOTIFY props, updates, and exports; browser coverage includes iframe and popup contexts.

`component-clone.test.ts` verifies that repeated and reentrant close requests complete instance deregistration and destruction notifications before resolving, and that a rearmed once observer waits for the next public resize operation. `emitter.test.ts` preserves specific-listener removal during dispatch while deferring additions. The array browser journeys also verify repeated close completion on rendered iframes and popups.

- `array-prop-transport.test.ts`: Consumer-side rejection of undefined/sparse array entries before opening or update commitment, recovery, nested values, item defaults, nullable entries, delivery-policy exclusions, custom encoders/host decorators, and export rejection without replacing acknowledged data.
- `body-param-bootstrap.test.ts`: End-to-end iframe and popup `bodyParam` POST bootstrap coverage, including hidden-form submission and host initialization.
- `consumer-host-handshake.test.ts`: End-to-end iframe happy path covering `create()`, `instance.render()`, `initHost()`, and the real INIT handshake, plus oversized bootstrap metadata rejection followed by a valid retry.
- `cross-realm-props.test.ts`: Foreign-window Date and record inputs round-trip through props and exports across JSON, BASE64 and DOTIFY.
- `function-prop-bridge.test.ts`: Capacity rejection/recovery across all codecs, omitted callback defaults, a genuinely dropped acknowledgement with receiver-installed callbacks, and real cross-window callback bridging from host `window.hostProps` back to consumer callbacks, including async results, thrown errors, BASE64/DOTIFY nested callback/Date bootstrap and updates, and retirement of replaced callbacks after acknowledged updates in all three serialization modes.
- `host-controls-routing.test.ts`: Atomic export/peer-capacity rejection, held-reference recovery, and real host-builtins coverage for close/focus/resize/show/hide/error/export/peer lookup, plus spoofed-source rejection on consumer and host runtimes.
- `object-prop-roundtrip.test.ts`: Ordinary BASE64/DOTIFY/function-shaped records retain user fields through bootstrap and updates in all three serialization modes, including direct and nested DOTIFY branches converted by custom JSON encoders.
- `popup-host-handshake.test.ts`: End-to-end popup happy path and popup-blocked failure coverage through `render(..., 'popup')` and `initHost()`.
- `props-alias-sync.test.ts`: End-to-end canonical host synchronization for initial, updated, and chained alias values.
- `props-sync.test.ts`: Post-connect prop updates across the real messaging pipeline, including host snapshot replacement, successful/rejected configuration validators that destroy or replace the host, stale inherited-name key removal, nonfinite update rejection/recovery, host-side rejection followed by a queued valid update, private prop filtering, discard of stale consumer-only wire fields across JSON/BASE64/DOTIFY bootstrap and updates, private-field purge through late matching `create()`/`initHost()` with retained callbacks and subsequent updates, and nonblocking/cancellable `onProps` subscriber delivery.
- `react-driver-dom.test.ts`: Real React DOM construction failures stay local to the wrapper and preserve sibling application content.
- `react-host-sync.test.ts`: Real React DOM commits through the consumer/host handshake and messaging pipeline, covering updates before readiness, omitted prop defaults/removal, validation recovery, unmount cancellation/cleanup, wrapper styles/prop filtering, latest callbacks and DOM refs, equivalent-commit suppression, popup-to-iframe recovery, StrictMode replay, host error forwarding, and rejected lifecycle/error observer isolation.

All integration test files and their shared harness are checked by `npm run typecheck`. Their TypeScript configuration preserves strict checks and distinguishes consumer schema inputs from normalized host outputs. Vitest executes runtime assertions; it does not replace the separate compiler check.

## Browser Tests (`packages/forgeframe/tests/browser`)

`navigation.spec.ts` builds the production library and runs in Chromium, Firefox, and WebKit against separate local HTTP origins. It covers redirect isolation, rejection of legacy hosts, default-wrapper resizing, and iframe/popup reconnection after reload and full-page navigation with current props and callable callbacks. Recovery cases cover failed-schema retry, shared-factory host-props/control rebinding after successful retry, updates already pending at bootstrap, and callback updates queued during reconnection. Initial-navigation cases capture real iframe/popup GET and POST requests, test relative URL policies with cross-origin base tags and callback/converter mutations, and verify fragment preservation, queued prop snapshots, popup loading cleanup, async subscriber rejection isolation, POST names that shadow form methods, and BASE64/DOTIFY nested callback/Date initialization and updates. Marker-shaped records are exercised as props and exports in every codec, iframe/popup context, and browser engine. Integration cases also verify records that become marker-shaped after custom JSON conversion, with one encoder invocation per delivery.

Install the engines with `npx playwright install chromium firefox webkit`, then run `npm run test:browser` from the repository root. CI installs browser system dependencies and runs all three engines on Node 24. WebKit supplies automated Safari-engine coverage; these tests do not establish physical Safari/device acceptance.

`peer-exports.spec.ts` runs real same-origin sibling hosts under a separate consumer origin in all three engines. It verifies nested callable exports and dates, prop-update independence, propagated errors, retirement/replacement of exports, and discovery across component tags.

`playground-text.spec.ts` builds both real playground pages and the consumer logger. Cross-origin iframe/popup tests verify literal markup-shaped prop names and values, greeting logs, updates, and export controls. Omitted popup dimensions are verified as a 500 × 500 viewport in all three engines. The consumer editor also exercises the physical blur-to-Set click sequence, copied-code refresh, and render/close control states. Its Add Prop controls reject reserved names, then accept a valid addition that renders and reaches the host.

The suite also renders two same-tag widgets concurrently against the same host origin, verifying independent prop snapshots and callbacks and continued operation after one peer closes.

`playground-text.spec.ts` also runs the real `/tests` overview twice through its Run all button. It requires all 17 automatic scenarios, 76 passing assertions, the single documented production POST skip, no failures or uncaught page errors, and an empty sandbox after completion. It waits for the runner button to become enabled, since intermediate results can already say passed. The `/tests/popup` route must wait for a user click, complete all five assertions, close its window, and rerun successfully. POST transport remains exercised by the existing POST-capable navigation/integration fixtures.

`react-journey.spec.ts` bundles real React/React DOM and the public ForgeFrame driver with a separate host origin. Normal and StrictMode journeys verify readiness, prop delivery, updated callback return values, validation rejection without replacing host state or retiring acknowledged callbacks, subsequent recovery, forwarded-ref cleanup, zero active instances, removal of embedded frames, and preservation of surrounding application content. Development React is intentional: an effect probe verifies StrictMode actually performs its setup/cleanup replay. The browser fixture itself is strictly typechecked; it does not add React to the published runtime dependencies.

`company-demo.spec.ts` builds the production consumer and dedicated payment host with separate local origins. It exercises the `/company` navigation link and direct route, approved receipts, invoice isolation, decline/retry in the same window, cancellation during simulated processing, reopen/reset/refresh, and mobile Escape cancellation with restored keyboard focus. It also verifies Experience/Technical switching preserves invoice state and real callback arguments/return acknowledgements, that the guided steps contain actual acknowledgement and cleanup observations, and that lazily loaded source tabs contain the authored integration and TSDoc. Responsive checks cover payment visibility, initial provider orientation/focus, keyboard validation and stacked-view navigation at 390×844 and 441×569. Recovery checks cover a failed lazy source import, continued payment use and successful source loading after a page refresh. Malformed result callbacks from the allowlisted provider must reject before committing a receipt, leaving the invoice unpaid and permitting a valid payment retry. Both modal iframe and popup journeys run in Chromium, Firefox and WebKit, including non-localhost HTTP origins where secure-context-only APIs are unavailable. Transactions and card details are entirely simulated.

## Type Tests (`packages/forgeframe/tests/typecheck`)

- `component-inference.typecheck.ts`: Compile-time assertions for inferred and explicit schema-backed component props, third-party schemas, callbacks, and typed children.
- `events.typecheck.ts`: Typed event handlers preserve compatible registration and removal contracts and reject incompatible explicit types.
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

## Choosing useful additions

Start with a supported public behavior or a reproduced failure and an agreed public seam. Use literal expected outcomes independent of the implementation. Prefer a real consumer/host or React DOM integration when the behavior crosses layers; adapt browser APIs at the environment boundary. Retain focused policy and resource fault-injection cases when they add distinct evidence, and remove superseded wiring assertions once public behavior is verified.

Check both acceptance and rejection/recovery where meaningful. Keep schema inputs and normalized outputs explicit in fixtures, and run `typecheck:tests` as well as Vitest. Use a targeted regression probe to confirm a new test can detect the behavior being lost; restore the source before final validation. Coverage identifies candidates for inspection, while supported behavior and failure impact decide whether to add a test. Do not add casts, mocks, exclusions, or threshold changes merely to reach 100%.

The installed-package check compiles the actual README Define a Component and React Basic Usage examples under strict NodeNext resolution, and smoke-tests callback default behavior against the built package. React uses the repository's pinned optional fixture dependency. Callback type fixtures require factory syntax after fluent chaining. Consumer transport tests verify that only a verified new bootstrap session releases a full recovery pool.

Public integration regressions cover rejected `initHost()` replacement preserving a ready host and later recovery, exported array accessors captured once, and peer response encoding failure rolling back new relay registrations while held callbacks remain callable.

Host control regressions also cover pre-creation show requests with configured styles and latest show/hide precedence. Host subscriber regressions cover rearming, cancel-and-re-register identity, duplicate registration, cancellation before delivery, and destruction during notification. Emitter regressions cover the same event-dispatch boundary, including bulk listener removal.

`props-serialize.test.ts` and `cross-realm-props.test.ts` cover encoded accessors read once, original custom encoder receivers, single Date encoding, callback preservation, boxed primitive conversion, cycles, and real BASE64/DOTIFY bootstrap/update delivery.

`navigation.spec.ts` also measures eager iframe loading and ready layout with custom normal-flow templates (default and explicit eager loading), ensuring the mount and following content retain their positions. It covers lazy GET/POST initialization while concealed, restored configured CSS values and priorities, explicit visibility control during loading and before frame creation, configured display none during lazy GET/POST initialization, and cancellation before lazy navigation.

Functional convergence regressions also exercise rejected async schemas with supplied inputs and default probing in real browsers, requiring synchronous refusal, no unhandled rejection, and successful retry with valid input. Playground host-control cases click Request Close in iframe and popup contexts without supplying a remote onClose callback.
