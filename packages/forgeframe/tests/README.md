# ForgeFrame Test Index

This index documents what each ForgeFrame test file validates and the naming conventions used for clarity.

## Unit Tests (`packages/forgeframe/tests/unit`)

- `bridge.test.ts`: Function bridge serialization/deserialization and remote call dispatch behavior.
- `component-clone.test.ts`: Clone snapshot preservation, lifecycle tracking, peer visibility, and global/tag cleanup.
- `component-instance-index.test.ts`: Internal active-instance indexing, reindexing, tag clearing, and peer lookup snapshot behavior.
- `component.test.ts`: Component creation, registration, instance lifecycle, and host-context detection.
- `consumer-branch-coverage.test.ts`: Consumer branch/edge-path coverage for domain trust, rendering, and prop-sync internals.
- `domain-pattern.test.ts`: Wildcard domain compilation cache behavior and stateless `RegExp` trust checks.
- `consumer-lifecycle.test.ts`: Consumer handshake, lifecycle messaging, open/close guards, and update validation.
- `consumer-transport.test.ts`: Direct consumer transport behavior for trust rotation, failed prop sync cleanup, handshake waiting, and async init error forwarding.
- `emitter.test.ts`: Event emitter subscription semantics, once/off behavior, and async error isolation.
- `host-branch-coverage.test.ts`: Host branch/edge-path coverage for deferred init, failure capture, and guard paths.
- `host-lifecycle.test.ts`: Host lifecycle message handling, hostProps synchronization, and consumer window resolution.
- `host-transport.test.ts`: Direct host transport behavior for deferred init scheduling, trust updates, props routing, and teardown.
- `host-security.test.ts`: Host allowlist enforcement and deferred-init security gating.
- `iframe.test.ts`: Iframe creation, reserved-attribute guards, visibility, and sizing helpers.
- `index-side-effect-free.test.ts`: Public entrypoint import stays side-effect-free until `initHost()` is called explicitly in ForgeFrame-shaped host windows.
- `messenger.test.ts`: Cross-window messenger request/response flow, filtering, trust checks, and teardown behavior.
- `messenger-routing.test.ts`: Multi-instance channel routing and function bridge response isolation.
- `popup.test.ts`: Popup open/close/focus/resize helpers and close/popup-block detection.
- `prop-schema.test.ts`: `prop` schema builder behavior and Standard Schema compliance checks.
- `props-serialize.test.ts`: BASE64/DOTIFY serialization round-trips and malformed wrapper fallback behavior.
- `props.test.ts`: Prop normalization, schema validation, host/query/body filtering and conversion rules.
- `protocol.test.ts`: Protocol message factory, serialization/deserialization, and prefix contract validation.
- `react-driver-lifecycle.test.ts`: React driver lifecycle integration, cleanup, prop synchronization, and error forwarding.
- `react-driver.test.ts`: React driver component factory wiring and hook-level integration expectations.
- `schema-backward-compat.test.ts`: Backward compatibility coverage for legacy Standard Schema shapes.
- `schema-contract.test.ts`: Contract coverage against real schema libraries (Zod and Valibot).
- `schema-path-format.test.ts`: Error path formatting behavior for mixed key/index Standard Schema segments.
- `schema.test.ts`: Standard Schema detection and schema-aware prop validation integration.
- `render-templates.test.ts`: Render template DOM creation, styles, transitions, and prerender swap behavior.
- `utils.test.ts`: UID, cleanup manager, and promise utility behavior.
- `version.test.ts`: Version constant synchronization with package metadata.
- `window-helpers.test.ts`: Cross-window helper behavior for domain checks, traversal, and defensive operations.
- `window-name-payload.test.ts`: Window name payload encoding/parsing and ForgeFrame-window detection helpers.
- `window-proxy.test.ts`: Window registry/reference creation, resolution, and serialization constraints.

## Integration Tests (`packages/forgeframe/tests/integration`)

- `body-param-bootstrap.test.ts`: End-to-end iframe and popup `bodyParam` POST bootstrap coverage, including hidden-form submission and host initialization.
- `consumer-host-handshake.test.ts`: End-to-end iframe happy path covering `create()`, `instance.render()`, `initHost()`, and the real INIT handshake.
- `function-prop-bridge.test.ts`: Real cross-window callback bridging from host `window.hostProps` back to consumer callbacks, including async results and thrown errors.
- `host-controls-routing.test.ts`: Real host-builtins coverage for close/focus/resize/show/hide/error/export/peer lookup, plus spoofed-source rejection on consumer and host runtimes.
- `popup-host-handshake.test.ts`: End-to-end popup happy path and popup-blocked failure coverage through `render(..., 'popup')` and `initHost()`.
- `props-sync.test.ts`: Post-connect prop updates across the real messaging pipeline, including host snapshot replacement, stale key removal, and `onProps` subscriber delivery.

## Type Tests (`packages/forgeframe/tests/typecheck`)

- `react-jsx.tsx`: Compile-time assertions for React JSX wrapper props and element return types.
- `schema.typecheck.ts`: Compile-time assertions for Standard Schema utility and contract types.

## Naming Conventions

- File names use `<module-or-scope>.test.ts` and should reflect the exact module or test concern.
- Top-level `describe` blocks should name the primary module or behavior area under test.
- `it(...)` titles should describe expected behavior with explicit context (for example, include function name when testing guard/error branches).

## Quick Commands

- Run all ForgeFrame tests: `npm run test:run -w forgeframe`
- Run a single test file: `npm run test:run -w forgeframe -- tests/unit/<file>.test.ts`
- Run typecheck assertions: `npm run typecheck:tests -w forgeframe`
