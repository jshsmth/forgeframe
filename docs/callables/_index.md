---
name: callables
title: ForgeFrame callable reference
desc: Runtime callable responsibilities, IOSP classifications, and boundary test evidence.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-10-28T00:03:58Z
---

# ForgeFrame callable reference

[[_index|..]]

[[callables/communication|communication]]: Bridge, messenger, and wire protocol callables with their IOSP classifications and boundary tests.

[[callables/consumer|consumer]]: Consumer runtime callables for rendering, props, peers, and transport with their IOSP classifications and boundary tests.

[[callables/core|core]]: Component factory, registry, instance index, and render-context callables with their IOSP classifications and boundary tests.

[[callables/entrypoints|entrypoints]]: Package entry points, constants, errors, events, and type-only modules with their IOSP classifications.

[[callables/host|host]]: Host runtime callables for bootstrap, origin policy, props, and transport with their IOSP classifications and boundary tests.

[[callables/playground|playground]]: Diagnostic playground and company payment demo responsibilities with their IOSP classifications and tests.

[[callables/props|props]]: Prop definition, schema, normalization, and serialization callables with their IOSP classifications and boundary tests.

[[callables/react|react]]: React adapter callables for lifecycle and prop synchronization with their IOSP classifications and boundary tests.

[[callables/render|render]]: Iframe, popup, and template rendering callables with their IOSP classifications and boundary tests.

[[callables/utilities|utilities]]: Utility and window-name callables with their IOSP classifications and boundary tests.

***

Runtime callables in `packages/forgeframe/src`, their IOSP classification, and the tests that exercise their boundaries. Use [architecture](../architecture/_index.md) to follow a workflow. Open the page for the module you are changing: update its classification and run its evidence suites.

Type-only declarations, overload signatures, and abstract methods have no runtime body and are not listed; modules without runtime callables are marked **Contract only**. Repeated accessors and fluent builders share one rationale.

`callback@N` names an anonymous closure that starts on source line N inside its enclosing callable; named property arrows use their enclosing name, and named function expressions use their own name. Refresh these line numbers whenever an edit shifts them.

- **O — operation:** one cohesive rule, transformation, state transition, supplied-callback boundary, or platform action. Recursive codecs, traversals, and validation algorithms may use local helpers and still count as operations.
- **I — integration:** sequences package behavior. Branches that select the next action, current-instance and cancellation guards, and passed-through values count as control flow.
- **M — mixed helper, kept deliberately:** a small helper that mixes both, listed with its locality or readability rationale. Splitting it would only move a few statements into a wrapper.

Pure policy consumes observed facts; integrations and adapters obtain browser evidence. State stays with the runtime that owns it.

## Boundary tests

| Evidence group | Suites |
| --- | --- |
| <a id="evidence-props"></a>props | [props.test](../../packages/forgeframe/tests/unit/props.test.ts), [prop-schema.test](../../packages/forgeframe/tests/unit/prop-schema.test.ts), [schema.test](../../packages/forgeframe/tests/unit/schema.test.ts), [schema-contract.test](../../packages/forgeframe/tests/unit/schema-contract.test.ts), [schema-interoperability.test](../../packages/forgeframe/tests/unit/schema-interoperability.test.ts), [schema-path-format.test](../../packages/forgeframe/tests/unit/schema-path-format.test.ts), [props-sync.test](../../packages/forgeframe/tests/integration/props-sync.test.ts), [prop-definition-checks.test](../../packages/forgeframe/tests/unit/prop-definition-checks.test.ts), [schema-self-acceptance.test](../../packages/forgeframe/tests/integration/schema-self-acceptance.test.ts), [exports-schema.test](../../packages/forgeframe/tests/integration/exports-schema.test.ts) |
| <a id="evidence-messaging"></a>messaging | [bridge.test](../../packages/forgeframe/tests/unit/bridge.test.ts), [messenger.test](../../packages/forgeframe/tests/unit/messenger.test.ts), [messenger-routing.test](../../packages/forgeframe/tests/unit/messenger-routing.test.ts), [protocol.test](../../packages/forgeframe/tests/unit/protocol.test.ts), [function-prop-bridge.test](../../packages/forgeframe/tests/integration/function-prop-bridge.test.ts), [host-controls-routing.test](../../packages/forgeframe/tests/integration/host-controls-routing.test.ts) |
| <a id="evidence-render"></a>render | [consumer-renderer.test](../../packages/forgeframe/tests/unit/consumer-renderer.test.ts), [iframe.test](../../packages/forgeframe/tests/unit/iframe.test.ts), [popup.test](../../packages/forgeframe/tests/unit/popup.test.ts), [render-templates.test](../../packages/forgeframe/tests/unit/render-templates.test.ts), [body-param-bootstrap.test](../../packages/forgeframe/tests/integration/body-param-bootstrap.test.ts), [popup-host-handshake.test](../../packages/forgeframe/tests/integration/popup-host-handshake.test.ts), [secure-defaults.test](../../packages/forgeframe/tests/integration/secure-defaults.test.ts) |
| <a id="evidence-consumer"></a>consumer | [component.test](../../packages/forgeframe/tests/unit/component.test.ts), [component-instance-index.test](../../packages/forgeframe/tests/unit/component-instance-index.test.ts), [consumer-lifecycle.test](../../packages/forgeframe/tests/unit/consumer-lifecycle.test.ts), [consumer-branch-coverage.test](../../packages/forgeframe/tests/unit/consumer-branch-coverage.test.ts), [consumer-transport.test](../../packages/forgeframe/tests/unit/consumer-transport.test.ts), [component-events.test](../../packages/forgeframe/tests/unit/component-events.test.ts), [lifecycle-events.test](../../packages/forgeframe/tests/integration/lifecycle-events.test.ts), [consumer-host-handshake.test](../../packages/forgeframe/tests/integration/consumer-host-handshake.test.ts), [host-controls-routing.test](../../packages/forgeframe/tests/integration/host-controls-routing.test.ts), [instance-tracking.test](../../packages/forgeframe/tests/integration/instance-tracking.test.ts), [secure-defaults.test](../../packages/forgeframe/tests/integration/secure-defaults.test.ts), [exports-schema.test](../../packages/forgeframe/tests/integration/exports-schema.test.ts) |
| <a id="evidence-host"></a>host | [host-security.test](../../packages/forgeframe/tests/unit/host-security.test.ts), [host-lifecycle.test](../../packages/forgeframe/tests/unit/host-lifecycle.test.ts), [host-branch-coverage.test](../../packages/forgeframe/tests/unit/host-branch-coverage.test.ts), [host-transport.test](../../packages/forgeframe/tests/unit/host-transport.test.ts), [props-sync.test](../../packages/forgeframe/tests/integration/props-sync.test.ts), [consumer-host-handshake.test](../../packages/forgeframe/tests/integration/consumer-host-handshake.test.ts), [host-startup.test](../../packages/forgeframe/tests/integration/host-startup.test.ts), [handshake-failure.test](../../packages/forgeframe/tests/unit/handshake-failure.test.ts), [protocol-version.test](../../packages/forgeframe/tests/integration/protocol-version.test.ts), [schema-self-acceptance.test](../../packages/forgeframe/tests/integration/schema-self-acceptance.test.ts), [secure-defaults.test](../../packages/forgeframe/tests/integration/secure-defaults.test.ts), [exports-schema.test](../../packages/forgeframe/tests/integration/exports-schema.test.ts) |
| <a id="evidence-react"></a>react | [react-host-sync.test](../../packages/forgeframe/tests/integration/react-host-sync.test.ts), [react-driver-faults.test](../../packages/forgeframe/tests/integration/react-driver-faults.test.ts), [react-prop-queue.test](../../packages/forgeframe/tests/unit/react-prop-queue.test.ts), [react-driver-dom.test](../../packages/forgeframe/tests/integration/react-driver-dom.test.ts), [index-node-smoke.test](../../packages/forgeframe/tests/unit/index-node-smoke.test.ts) |
| <a id="evidence-utilities"></a>utilities | [utils.test](../../packages/forgeframe/tests/unit/utils.test.ts), [origin-pattern.test](../../packages/forgeframe/tests/unit/origin-pattern.test.ts), [window-helpers.test](../../packages/forgeframe/tests/unit/window-helpers.test.ts), [window-name-payload.test](../../packages/forgeframe/tests/unit/window-name-payload.test.ts), [props-serialize.test](../../packages/forgeframe/tests/unit/props-serialize.test.ts), [protocol.test](../../packages/forgeframe/tests/unit/protocol.test.ts) |
| <a id="evidence-contract"></a>contract | [package-contract.test](../../packages/forgeframe/tests/unit/package-contract.test.ts), [index-node-smoke.test](../../packages/forgeframe/tests/unit/index-node-smoke.test.ts), [index-side-effect-free.test](../../packages/forgeframe/tests/unit/index-side-effect-free.test.ts), [component-node-runtime-transition.test](../../packages/forgeframe/tests/unit/component-node-runtime-transition.test.ts), [version.test](../../packages/forgeframe/tests/unit/version.test.ts) |

The [test index](../../packages/forgeframe/tests/README.md) describes compile-time and browser suites; the [root README](../../README.md) lists validation commands.
