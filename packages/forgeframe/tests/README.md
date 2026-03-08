# ForgeFrame Test Index

This index documents what each ForgeFrame test file validates and the naming conventions used for clarity.

## Unit Tests (`packages/forgeframe/tests/unit`)

- `bridge.test.ts`: Function bridge serialization/deserialization and remote call dispatch behavior.
- `component.test.ts`: Component creation, registration, instance lifecycle, and host-context detection.
- `consumer-branch-coverage.test.ts`: Consumer branch/edge-path coverage for domain trust, rendering, and prop-sync internals.
- `consumer-lifecycle.test.ts`: Consumer handshake, lifecycle messaging, open/close guards, and update validation.
- `emitter.test.ts`: Event emitter subscription semantics, once/off behavior, and async error isolation.
- `host-branch-coverage.test.ts`: Host branch/edge-path coverage for deferred init, failure capture, and guard paths.
- `host-lifecycle.test.ts`: Host lifecycle message handling, hostProps synchronization, and consumer window resolution.
- `host-security.test.ts`: Host allowlist enforcement and deferred-init security gating.
- `iframe.test.ts`: Iframe creation, visibility/sizing helpers, and content-dimension access behavior.
- `index-auto-init.test.ts`: Auto-initialization safety when importing in top-level windows with ForgeFrame-shaped names.
- `messenger.test.ts`: Cross-window messenger request/response flow, filtering, trust checks, and teardown behavior.
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

- `consumer-host-handshake.test.ts`: End-to-end iframe happy path covering `create()`, `instance.render()`, `initHost()`, and the real INIT handshake.
- `function-prop-bridge.test.ts`: Real cross-window callback bridging from host `window.hostProps` back to consumer callbacks, including async results and thrown errors.
- `props-sync.test.ts`: Post-connect prop updates across the real messaging pipeline, including host snapshot replacement, stale key removal, and `onProps` subscriber delivery.

## Type Tests (`packages/forgeframe/tests/typecheck`)

- `schema.typecheck.ts`: Compile-time assertions for Standard Schema utility and contract types.

## Naming Conventions

- File names use `<module-or-scope>.test.ts` and should reflect the exact module or test concern.
- Top-level `describe` blocks should name the primary module or behavior area under test.
- `it(...)` titles should describe expected behavior with explicit context (for example, include function name when testing guard/error branches).

## Quick Commands

- Run all ForgeFrame tests: `npm run test:run -w forgeframe`
- Run a single test file: `npm run test:run -w forgeframe -- tests/unit/<file>.test.ts`
- Run typecheck assertions: `npm run typecheck:tests -w forgeframe`
