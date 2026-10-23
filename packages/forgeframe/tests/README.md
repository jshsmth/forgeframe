# ForgeFrame Test Index

What each test file covers, how to run it, and how to choose new tests. Paths are relative to `packages/forgeframe/tests`.

## Commands

| Task | Command |
|------|---------|
| Run unit and integration tests | `npm run test:run -w forgeframe` |
| Run them with coverage thresholds (no separate test run needed) | `npm run test:coverage -w forgeframe` |
| Run one file | `npm run test:run -w forgeframe -- tests/unit/<file>.test.ts` |
| Typecheck type assertions and all unit, integration, and browser fixtures | `npm run typecheck:tests -w forgeframe` |
| Typecheck integration fixtures only | `npx tsc -p packages/forgeframe/tests/integration/tsconfig.json --noEmit` |
| Run browser tests (repository root) | `npm run test:browser` |

## Unit tests (`unit/`)

- `bridge.test.ts`: Function bridge serialization and deserialization, remote call dispatch, 500-callback admission, full snapshot replacement, duplicate identity reuse, staged calls, rollback, bounded delivery recovery, append capacity, and reset/teardown.
- `company-demo-payment-policy.test.ts`: Browser-independent playground payment rules: merchant session and result admission, receipt commitment and isolation, unpaid decline and retry, mismatch and duplicate rejection, malformed callback and receipt fields, ISO calendar/time validity, snapshot ownership, retry after rejection, payment availability, provider simulation, demo-card normalization, and acknowledgement admission with invoice correlation.
- `component-clone.test.ts`: Clone snapshots, lifecycle tracking, peer visibility, global and tag cleanup. Repeated and reentrant `close()` calls resolve only after deregistration and destruction notifications, including while failed-render teardown is in progress. A rearmed `once` observer waits for the next public resize.
- `component-instance-index.test.ts`: Internal active-instance indexing, reindexing, tag clearing, and peer lookup snapshots.
- `component-node-runtime-transition.test.ts`: Component registration across a Node-to-browser runtime transition.
- `component.test.ts`: Component creation, registration, instance lifecycle, and host-context detection. Undefined reserved definition entries are treated as omitted; real host-control definitions are rejected. Peer discovery is limited to the requester's verified host origin unless a peer's `peerDomains` admit the requester, and peers still loading are listed without exports.
- `consumer-branch-coverage.test.ts`: Consumer edge paths for domain trust, rendering, and prop sync.
- `consumer-lifecycle.test.ts`: Consumer handshake, lifecycle messaging, open/close guards, update validation, and `GET_SIBLINGS` scoping to the requester's own uid, tag, and verified host origin regardless of claimed or malformed request fields, with no peers for opaque (`"null"`) origins.
- `consumer-navigation.test.ts`: Relative URL origin admission, declaration and render base changes, pinned destinations, and fragment-bearing navigation.
- `consumer-origin-policy.test.ts`: Trust decisions from supplied origin evidence, messaging-origin validation, and changed-origin selection.
- `consumer-props-queue.test.ts`: Disconnected reentrant updates, FIFO failure recovery, render admission draining, matching initial request and bootstrap snapshots, and cancellation.
- `consumer-renderer.test.ts`: Renderer ownership of iframe and popup resources, loading completion, configured CSS preserved through the loading transition, eager/lazy loading concealment, show requests made before frame creation, latest show/hide precedence, custom shell and control preservation, templates, form cleanup after submission failure, mount-document prototypes, and teardown.
- `consumer-transport.test.ts`: Trust rotation, failed prop sync cleanup, handshake waiting, async init error forwarding, and release of a full recovery pool only by a verified new bootstrap session.
- `dimension.test.ts`: Popup pixel conversion and fallbacks for nonpixel and nonfinite input; iframe CSS units pass through.
- `domain-pattern.test.ts`: Wildcard domain compilation cache and stateless `RegExp` trust checks.
- `emitter.test.ts`: Subscription order, `once`/`off`, async error isolation, removal of a specific listener or all listeners during dispatch, and deferral of listeners added during dispatch.
- `error.test.ts`: Unknown-error normalization keeps `Error` identity and ordinary coercion, with a stable fallback when coercion throws.
- `host-branch-coverage.test.ts`: Host edge paths for deferred init, failure capture, and guards.
- `host-lifecycle.test.ts`: Host lifecycle messages, `hostProps` synchronization, consumer window resolution, consumer-only field discard in legacy bootstrap payloads, rejected same-turn legacy configuration through `initHost()` and a matching `create()` with immediate and deferred INIT delivery, atomic late-configuration validation and reconciliation, built-in and snapshot identity, and persistence of removals during a pending bootstrap.
- `host-security.test.ts`: Host allowlist enforcement and deferred-init security gating. Rejected late definitions keep a completed legacy host and invalidate an incomplete messaging bootstrap. Legacy payloads never treat `document.referrer` as consumer identity.
- `host-transport.test.ts`: Deferred init scheduling, trust updates, props routing, and teardown.
- `iframe-configuration.test.ts`: CSS and boolean/string attribute encoding.
- `iframe.test.ts`: Iframe creation, reserved-attribute guards, visibility, and sizing.
- `index-node-smoke.test.ts`: Public entrypoint imports and component definitions without browser globals.
- `index-side-effect-free.test.ts`: Importing the public entrypoint has no side effects until `initHost()` is called in a ForgeFrame host window.
- `messenger-routing.test.ts`: Multi-instance channel routing and function bridge response isolation.
- `messenger.test.ts`: Request/response flow, filtering, trust checks, and teardown.
- `package-contract.test.ts`: ESM package exports, README package claims, release scripts, and release tag validation.
- `playground-code-generator.test.ts`: Executes generated iframe, popup, and modal examples with empty props, composite values, callbacks, quoted names, and styles. Copied popup dimensions match live rendering; playground-owned callbacks replace editor-added definitions of the same name without duplicate object keys.
- `playground-props-bar.test.ts`: Quoted prop names and values, typed JSON edits, preservation at render time, invalid input recovery, rejection of every reserved host-control name before mutation, and modal schema cache invalidation.
- `playground-test-lab.test.ts`: The test lab keeps running after a failure, links the affected route, and renders failure text as text.
- `playground-text-rendering.test.ts`: Literal prop keys, values, and identity text, logger text, update IDs, and preserved host controls.
- `popup-layout.test.ts`: Popup geometry and polling backoff from supplied screen dimensions.
- `popup.test.ts`: Popup open, close, focus, and resize helpers, nonpixel resize fallbacks, and close and popup-blocker detection.
- `prop-schema.test.ts`: `prop` builders and Standard Schema compliance: nonfinite-number rejection, own-field omission and defaults for inherited names in shaped objects, HTTP(S) URL validation with composable constraints, trimming before length checks, literal optional/default clones, and union continuation after literal/enum rejection of BigInt, cyclic, or custom-encoder input without JSON diagnostics. Enum values, object shapes, and tuple/union definitions are copied at construction, including null-prototype arrays and shadowed iterators, so later caller mutation has no effect.
- `prop-update.test.ts`: Isolated patch/reset merging and validation-key bookkeeping.
- `props-alias-materialization.test.ts`: Alias-chain resolution, precedence, reset propagation, explicit clearing, and cycle safety.
- `props-alias-updates.test.ts`: Alias precedence in the consumer update pipeline, validation rollback, and preservation of materialized values.
- `props-serialize.test.ts`: BASE64/DOTIFY round trips; ordinary-record encoding without primitive coercion probes; one wrapper coercion and one read per encoded accessor; customized and foreign boxed values; untouched branding getters and proxy prototype metadata; original custom-encoder receivers; single `Date` encoding; nested callbacks from custom `toJSON()`; native and foreign raw JSON; JSON-undefined leaf omission; emptied and marker-shaped branches; cycles; arrays with null prototypes or shadowed `map`; and malformed-wrapper fallback.
- `props.test.ts`: Prop normalization, own canonical/alias selection for inherited names, schema validation, host/query/body filtering and conversion, and default normalization and delivery for omitted built-in definitions.
- `protocol.test.ts`: Message factories, serialization, and prefix validation.
- `react-driver-lifecycle.test.ts`: Lifecycle fault injection: stale completion and rejection isolation, cleanup order, unavailable mounts, and context changes. Public refs and observers are covered by `integration/react-host-sync.test.ts`.
- `react-driver-prop-sync.test.ts`: Queue fault injection: failed acknowledgement recovery, retries of equivalent in-flight or queued commits, and throwing observers. Public FIFO, omission, and validation behavior is covered by `integration/react-host-sync.test.ts`.
- `react-prop-queue.test.ts`: Queue acknowledgement, requested retries, and reset payloads without mounting React.
- `realm-values.test.ts`: Cross-window `Date` and ordinary-record recognition, class and array rejection, and codec array values.
- `render-templates.test.ts`: Template DOM creation, styles, transitions, and prerender swap.
- `schema-contract.test.ts`: Contract coverage against Zod and Valibot.
- `schema-interoperability.test.ts`: Minimal Standard Schema shapes, callable (ArkType-style) schemas through validation and render admission, and optional metadata.
- `schema-path-format.test.ts`: Error paths that mix key and index segments.
- `schema.test.ts`: Standard Schema detection, schema-aware prop validation, and handling of unsupported rejected native and foreign promises in direct and nested schemas.
- `url.test.ts`: Relative URL resolution and query appending that keeps fragments, existing encoding, and duplicate parameters.
- `utils.test.ts`: UID, cleanup manager, and promise utilities.
- `version.test.ts`: `VERSION` matches package metadata.
- `window-helpers.test.ts`: Domain checks, window traversal, and defensive operations.
- `window-name-payload.test.ts`: Window-name payload encoding and parsing, and ForgeFrame-window detection.

`react-driver-test-harness.ts` provides deterministic hook and component mocks for the React driver tests.

`../peer-host-domain.ts`, shared with the integration tests, marks unrendered instances as connected or still loading at a host origin, so peer-discovery tests do not need a rendered host for every peer.

`npm run typecheck` compiles all unit tests and fixtures through `unit/tsconfig.json` with the library's strict settings. Intentionally invalid public inputs use a documented `@ts-expect-error` at the negative fixture only.

## Integration tests (`integration/`)

- `array-prop-transport.test.ts`: Consumer rejection of undefined and sparse array entries before opening or committing an update, recovery, nested values, item defaults, nullable entries, delivery-policy exclusions, custom encoders and host decorators, and export rejection that keeps acknowledged data.
- `body-param-bootstrap.test.ts`: Iframe and popup `bodyParam` POST bootstrap, including hidden-form submission and host initialization.
- `company-demo-payment-contract.test.ts`: The shared payment amount schema through public consumer render admission and real host bootstrap and update validation. Negative, fractional, and unsafe cents are rejected and leave accepted host state intact; zero, ordinary cents, and the maximum safe integer pass.
- `consumer-host-handshake.test.ts`: Iframe happy path through `create()`, `render()`, `initHost()`, and the INIT handshake. Also covers oversized bootstrap metadata followed by a valid retry; parent bootstrap with a recursive Zod child schema; own child names such as `__proto__` and `constructor`, which keep their factory identity through a prop update and public close without changing map prototypes; and public host destruction followed by fresh initialization, prop sync, and working host controls.
- `cross-realm-props.test.ts`: Foreign-window `Date` and record inputs through props and exports in JSON, BASE64, and DOTIFY; arrays with null prototypes or shadowed `map`; encoded accessors read once; and real BASE64/DOTIFY bootstrap and update delivery.
- `function-prop-bridge.test.ts`: Capacity rejection and recovery in every codec, omitted callback defaults, a dropped acknowledgement after the receiver installed callbacks, and real callback bridging from host `window.hostProps` to consumer callbacks: async results, thrown errors, BASE64/DOTIFY nested callbacks and dates at bootstrap and update, and retirement of replaced callbacks after acknowledged updates in all three serialization modes.
- `host-controls-routing.test.ts`: Host built-ins (`close`, `focus`, `resize`, `show`, `hide`, `onError`, `export`, peer lookup); acknowledged hide during initial rendering; atomic export and peer-capacity rejection; exported array entries captured once; rollback of new peer relay registrations when response encoding fails while held callbacks stay callable; exclusion of peers verified at another host origin, and admission of a partner origin through `peerDomains` with callable exports; and spoofed-source rejection in consumer and host runtimes.
- `object-prop-roundtrip.test.ts`: Ordinary records shaped like BASE64, DOTIFY, or function markers keep their user fields through bootstrap and updates in all three serialization modes, including DOTIFY branches converted by custom JSON encoders.
- `popup-host-handshake.test.ts`: Popup happy path and popup-blocked failure through `render(..., 'popup')` and `initHost()`.
- `props-alias-sync.test.ts`: Canonical host synchronization for initial, updated, and chained alias values.
- `props-sync.test.ts`: Post-connect updates across the real messaging pipeline: host snapshot replacement; successful and rejected configuration validators that destroy or replace the host; a rejected public `initHost()` schema replacement that keeps the ready host and accepts a later valid configuration; removal of stale inherited-name keys; nonfinite update rejection and recovery; host-side rejection followed by a queued valid update; private prop filtering; discard of stale consumer-only wire fields in every codec; private-field purge through a late matching `create()` or `initHost()`; undefined definition entries treated as omitted through construction, bootstrap, updates, and close; and `onProps` delivery that is nonblocking and cancellable, defers rearmed or re-registered subscribers, keeps duplicate registrations, skips cancelled or destroyed ones, and ignores stale cancellation handles.
- `react-driver-dom.test.ts`: Real React DOM construction failures stay inside the wrapper and keep sibling content.
- `react-host-sync.test.ts`: Real React DOM commits through the handshake and messaging pipeline: updates before readiness, omitted prop defaults and removal, validation recovery, unmount cancellation and cleanup, wrapper styles and prop filtering, latest callbacks and DOM refs, equivalent-commit suppression, popup-to-iframe recovery, StrictMode replay, host error forwarding, and isolation of rejected lifecycle and error observers.

`helpers.ts` drives consumer and host runtimes in separate jsdom windows through real `postMessage` dispatch and `window.name` bootstrap payloads.

`npm run typecheck` checks all integration files and the harness. Their TypeScript configuration keeps strict checks and distinguishes consumer schema inputs from normalized host outputs; Vitest runs the runtime assertions.

## Browser tests (`browser/`)

Each suite runs in Chromium, Firefox, and WebKit against separate local origins. Install the engines with `npx playwright install chromium firefox webkit`, then run `npm run test:browser` from the repository root. CI installs browser system dependencies and runs on Node 24. WebKit covers the Safari engine; it does not replace testing on physical Safari or devices.

- `navigation.spec.ts`: Builds the production library and covers:
  - Redirect isolation, rejection of legacy hosts, default-wrapper resizing, and iframe/popup reconnection after reload and full-page navigation with current props and callable callbacks.
  - Recovery: failed-schema retry, rebinding of shared-factory host props and controls after a successful retry, updates pending at bootstrap, and callback updates queued during reconnection.
  - Initial navigation: real iframe/popup GET and POST requests, relative URL policies with cross-origin `<base>` tags and callback or converter mutations, fragment preservation, queued prop snapshots, popup loading cleanup, async subscriber rejection isolation, POST field names that shadow form methods, and BASE64/DOTIFY nested callbacks and dates at initialization and update.
  - Marker-shaped records as props and exports in every codec and context, including records that become marker-shaped after custom JSON conversion with one encoder call per delivery.
  - Arrays with null prototypes or shadowed `map` in props, updates, and exports, and repeated `close()` on rendered iframes and popups.
  - Loading layout: eager iframes with custom normal-flow templates keep the mount and following content in place; lazy GET/POST frames initialize while concealed, including with configured `display: none`; configured CSS values and priorities are restored; visibility controls apply during loading and before frame creation; and lazy navigation can be cancelled.
  - Rejected async schemas, with supplied input and during default probing: synchronous refusal, no unhandled rejection, and a successful retry with valid input.
- `peer-exports.spec.ts`: Same-origin sibling hosts under a separate consumer origin: nested callable exports and dates, independence from prop updates, propagated errors, retirement and replacement of exports, discovery across component tags, hosts on another origin neither seeing nor being seen as peers, and one-way `peerDomains` admission of a named host origin.
- `playground-text.spec.ts`: Builds both playground pages and the consumer logger.
  - Cross-origin iframe and popup: literal markup-shaped prop names and values, greeting logs, updates, export controls, and **Request Close** without a remote `onClose` callback. Omitted popup dimensions produce a 500 × 500 viewport.
  - Two same-tag widgets on one host origin keep independent prop snapshots and callbacks, and the remaining widget keeps working after the other closes.
  - Consumer editor: the blur-then-Set click sequence, copied-code refresh, render/close control states, and **Add Prop** rejecting reserved names before accepting a valid prop that reaches the host.
  - `/tests` overview, run twice through **Run all**: all 17 automatic scenarios with 76 passing assertions, the one documented production POST skip, no failures or uncaught page errors, and an empty sandbox afterwards. The test waits for the runner button to re-enable because intermediate results can already read "passed". `/tests/popup` waits for a user click, completes five assertions, closes its window, and reruns. POST transport is covered by `navigation.spec.ts` and the integration fixtures.
- `react-journey.spec.ts`: Bundles React, React DOM, and the public driver against a separate host origin. Normal and StrictMode journeys cover readiness, prop delivery, updated callback return values, validation rejection that keeps host state and acknowledged callbacks, recovery, forwarded-ref cleanup, zero active instances, removal of embedded frames, and preservation of surrounding content. Development React is intentional: an effect probe confirms StrictMode replays setup and cleanup. `react-journey-fixture.ts` is strictly typechecked and does not add React to the published runtime dependencies.
- `company-demo.spec.ts`: Builds the production consumer and payment host on separate origins and runs modal iframe and popup journeys, including on non-localhost HTTP origins without secure-context APIs:
  - The `/company` link and direct route, approved receipts, invoice isolation, decline and retry in the same window, cancellation during processing, reopen, reset, refresh, and mobile Escape cancellation with restored focus.
  - Experience/Technical switching keeps invoice state and real callback arguments and acknowledgements; the guided steps show actual acknowledgement and cleanup observations; lazily loaded source tabs show the authored integration and TSDoc.
  - Responsive layout at 390×844 and 441×569: payment visibility, initial provider orientation and focus, keyboard validation, and stacked-view navigation.
  - A failed lazy source import keeps payments usable and loads after a page refresh.
  - Malformed result callbacks from the allowlisted provider are rejected before a receipt is committed, leaving the invoice unpaid and retryable.
  - A faulty merchant fixture returns real acknowledgements: a different invoice must not mark approval or close the provider, and a later matching acknowledgement allows close. Decline callbacks reject malformed, `recorded`, or wrong-invoice acknowledgements before showing decline feedback; a fresh window with a valid decline acknowledgement supports the approval retry.

## Type tests (`typecheck/`)

- `alias-inputs.ts`: Canonical-key aliases, legacy aliases, mixed updates, and React wrapper input props.
- `component-inference.typecheck.ts`: Inferred and explicit schema-backed component props, third-party and callable schemas, callbacks, and typed children.
- `events.typecheck.ts`: Typed event handlers keep compatible registration and removal contracts and reject incompatible explicit types.
- `host.typecheck.ts`: Host initialization and host-prop schema input/output contracts.
- `prop-schema.typecheck.ts`: Prop builder inference, defaults, optionality, and composite schemas.
- `react-jsx.tsx`: React JSX wrapper props and element return types.
- `remote-values.typecheck.ts`: Promise-returning remote callbacks and exports, nested data shapes, and local callback inputs.
- `schema.typecheck.ts`: Standard Schema utility and contract types.

## Package check

`npm run test:package` packs and installs the built library in an isolated project. It compiles the README **Define a Component** and React **Basic Usage** examples under strict NodeNext resolution and smoke-tests callback defaults against the built package. React comes from the repository's pinned optional fixture dependency. Callback type fixtures require factory syntax for defaults after fluent chaining.

## Naming

- Name files `<module-or-scope>.test.ts` after the module or concern under test.
- Name top-level `describe` blocks after the primary module or behavior area.
- Write `it(...)` titles as expected behavior with explicit context, such as the function name for guard and error branches.

## Choosing new tests

Start from a supported public behavior or a reproduced failure, and an agreed public seam. Assert literal expected outcomes that do not depend on the implementation. Prefer a real consumer/host or React DOM integration when the behavior crosses layers, and adapt browser APIs at the environment boundary. Keep focused policy and resource fault-injection cases when they add distinct evidence; remove wiring assertions that public tests supersede.

Check acceptance and, where meaningful, rejection and recovery. Keep schema inputs and normalized outputs explicit in fixtures, and run `typecheck:tests` as well as Vitest. Confirm a new test fails when the behavior is removed, then restore the source before final validation. Coverage points to candidates; supported behavior and failure impact decide whether a test is worth adding. Do not add casts, mocks, exclusions, or threshold changes only to reach 100%.
