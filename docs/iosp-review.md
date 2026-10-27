---
name: iosp-review
title: ForgeFrame callable reference
desc: Runtime callable responsibilities, IOSP classifications, and boundary test evidence.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-10-27T03:07:53Z
---

# ForgeFrame callable reference

Runtime callables in `packages/forgeframe/src`, their IOSP classification, and the tests that exercise their boundaries. Use [architecture](architecture.md) to follow a workflow. Use this page when changing an individual callable: update its classification and run its evidence suites.

Type-only declarations, overload signatures, and abstract methods have no runtime body and are not listed; modules without runtime callables are marked **Contract only**. Repeated accessors and fluent builders share one rationale.

`callback@N` names an anonymous closure that starts on source line N inside its enclosing callable; named property arrows use their enclosing name, and named function expressions use their own name. Refresh these line numbers whenever an edit shifts them.

- **O — operation:** one cohesive rule, transformation, state transition, supplied-callback boundary, or platform action. Recursive codecs, traversals, and validation algorithms may use local helpers and still count as operations.
- **I — integration:** sequences package behavior. Branches that select the next action, current-instance and cancellation guards, and passed-through values count as control flow.
- **M — mixed helper, kept deliberately:** a small helper that mixes both, listed with its locality or readability rationale. Splitting it would only move a few statements into a wrapper.

Pure policy consumes observed facts; integrations and adapters obtain browser evidence. State stays with the runtime that owns it.

## Boundary tests

| Evidence group | Suites |
| --- | --- |
| <a id="evidence-props"></a>props | [props.test](../packages/forgeframe/tests/unit/props.test.ts), [prop-schema.test](../packages/forgeframe/tests/unit/prop-schema.test.ts), [schema.test](../packages/forgeframe/tests/unit/schema.test.ts), [schema-contract.test](../packages/forgeframe/tests/unit/schema-contract.test.ts), [schema-interoperability.test](../packages/forgeframe/tests/unit/schema-interoperability.test.ts), [schema-path-format.test](../packages/forgeframe/tests/unit/schema-path-format.test.ts), [props-sync.test](../packages/forgeframe/tests/integration/props-sync.test.ts), [prop-definition-checks.test](../packages/forgeframe/tests/unit/prop-definition-checks.test.ts), [schema-self-acceptance.test](../packages/forgeframe/tests/integration/schema-self-acceptance.test.ts), [exports-schema.test](../packages/forgeframe/tests/integration/exports-schema.test.ts) |
| <a id="evidence-messaging"></a>messaging | [bridge.test](../packages/forgeframe/tests/unit/bridge.test.ts), [messenger.test](../packages/forgeframe/tests/unit/messenger.test.ts), [messenger-routing.test](../packages/forgeframe/tests/unit/messenger-routing.test.ts), [protocol.test](../packages/forgeframe/tests/unit/protocol.test.ts), [function-prop-bridge.test](../packages/forgeframe/tests/integration/function-prop-bridge.test.ts), [host-controls-routing.test](../packages/forgeframe/tests/integration/host-controls-routing.test.ts) |
| <a id="evidence-render"></a>render | [consumer-renderer.test](../packages/forgeframe/tests/unit/consumer-renderer.test.ts), [iframe.test](../packages/forgeframe/tests/unit/iframe.test.ts), [popup.test](../packages/forgeframe/tests/unit/popup.test.ts), [render-templates.test](../packages/forgeframe/tests/unit/render-templates.test.ts), [body-param-bootstrap.test](../packages/forgeframe/tests/integration/body-param-bootstrap.test.ts), [popup-host-handshake.test](../packages/forgeframe/tests/integration/popup-host-handshake.test.ts), [secure-defaults.test](../packages/forgeframe/tests/integration/secure-defaults.test.ts) |
| <a id="evidence-consumer"></a>consumer | [component.test](../packages/forgeframe/tests/unit/component.test.ts), [component-instance-index.test](../packages/forgeframe/tests/unit/component-instance-index.test.ts), [consumer-lifecycle.test](../packages/forgeframe/tests/unit/consumer-lifecycle.test.ts), [consumer-branch-coverage.test](../packages/forgeframe/tests/unit/consumer-branch-coverage.test.ts), [consumer-transport.test](../packages/forgeframe/tests/unit/consumer-transport.test.ts), [component-events.test](../packages/forgeframe/tests/unit/component-events.test.ts), [lifecycle-events.test](../packages/forgeframe/tests/integration/lifecycle-events.test.ts), [consumer-host-handshake.test](../packages/forgeframe/tests/integration/consumer-host-handshake.test.ts), [host-controls-routing.test](../packages/forgeframe/tests/integration/host-controls-routing.test.ts), [instance-tracking.test](../packages/forgeframe/tests/integration/instance-tracking.test.ts), [secure-defaults.test](../packages/forgeframe/tests/integration/secure-defaults.test.ts), [exports-schema.test](../packages/forgeframe/tests/integration/exports-schema.test.ts) |
| <a id="evidence-host"></a>host | [host-security.test](../packages/forgeframe/tests/unit/host-security.test.ts), [host-lifecycle.test](../packages/forgeframe/tests/unit/host-lifecycle.test.ts), [host-branch-coverage.test](../packages/forgeframe/tests/unit/host-branch-coverage.test.ts), [host-transport.test](../packages/forgeframe/tests/unit/host-transport.test.ts), [props-sync.test](../packages/forgeframe/tests/integration/props-sync.test.ts), [consumer-host-handshake.test](../packages/forgeframe/tests/integration/consumer-host-handshake.test.ts), [host-startup.test](../packages/forgeframe/tests/integration/host-startup.test.ts), [handshake-failure.test](../packages/forgeframe/tests/unit/handshake-failure.test.ts), [protocol-version.test](../packages/forgeframe/tests/integration/protocol-version.test.ts), [schema-self-acceptance.test](../packages/forgeframe/tests/integration/schema-self-acceptance.test.ts), [secure-defaults.test](../packages/forgeframe/tests/integration/secure-defaults.test.ts), [exports-schema.test](../packages/forgeframe/tests/integration/exports-schema.test.ts) |
| <a id="evidence-react"></a>react | [react-host-sync.test](../packages/forgeframe/tests/integration/react-host-sync.test.ts), [react-driver-faults.test](../packages/forgeframe/tests/integration/react-driver-faults.test.ts), [react-prop-queue.test](../packages/forgeframe/tests/unit/react-prop-queue.test.ts), [react-driver-dom.test](../packages/forgeframe/tests/integration/react-driver-dom.test.ts), [index-node-smoke.test](../packages/forgeframe/tests/unit/index-node-smoke.test.ts) |
| <a id="evidence-utilities"></a>utilities | [utils.test](../packages/forgeframe/tests/unit/utils.test.ts), [origin-pattern.test](../packages/forgeframe/tests/unit/origin-pattern.test.ts), [window-helpers.test](../packages/forgeframe/tests/unit/window-helpers.test.ts), [window-name-payload.test](../packages/forgeframe/tests/unit/window-name-payload.test.ts), [props-serialize.test](../packages/forgeframe/tests/unit/props-serialize.test.ts), [protocol.test](../packages/forgeframe/tests/unit/protocol.test.ts) |
| <a id="evidence-contract"></a>contract | [package-contract.test](../packages/forgeframe/tests/unit/package-contract.test.ts), [index-node-smoke.test](../packages/forgeframe/tests/unit/index-node-smoke.test.ts), [index-side-effect-free.test](../packages/forgeframe/tests/unit/index-side-effect-free.test.ts), [component-node-runtime-transition.test](../packages/forgeframe/tests/unit/component-node-runtime-transition.test.ts), [version.test](../packages/forgeframe/tests/unit/version.test.ts) |

The [test index](../packages/forgeframe/tests/README.md) describes compile-time and browser suites; the [root README](../README.md) lists validation commands.

## Module and callable classifications

### [communication/bridge.ts](../packages/forgeframe/src/communication/bridge.ts)

Registry reconciliation, capacity admission, reference framing, and remote wrapper creation are separate responsibilities. Recursive object/array codecs and local ID reconciliation are cohesive algorithms. Decoding has no cycle check: its input always comes from parsed JSON. CALL and PEER_CALL invoke supplied functions after browser-source authorization; an unexpected window is `ORIGIN_REJECTED` and a retired ID is `CLOSED`. A supplied function's own failure is rethrown without a code, even when it is a `ForgeFrameError`, so the caller's plain `Error` never looks like a ForgeFrame failure. The exception is a remote wrapper this module created (tracked in a module-private `WeakSet`), which the consumer's peer relay registers for another host's export: its failure, such as `CLOSED` for a retired peer, is ForgeFrame's and keeps its code. The call channel is passed in, so peer relay registries have a lifetime independent of prop and export batches.

Reference guards require the complete own-property wire shape, so records with extra user fields stay data. Ordinary marker-shaped records are escaped after JSON conversion and omission and restored as data, including nested escape markers, in props and exports.

Array encoding reads and checks every indexed entry once before recursive registration, rejecting `undefined` entries and sparse holes in props and exports. It never calls caller-controlled array methods, so arrays with null prototypes or a shadowed `map` encode correctly. Object-field omission and function/`Date` framing are separate rules.

Encoding converts objects other than arrays, dates, and native raw JSON through `toJSON(key)` and primitive unboxing once, as native JSON does, so a class's `toJSON()` decides what crosses; the module-private `serializeConvertedValue` dispatches an already converted value to function framing, `serializeArray`, `Date` framing, or `serializeRecord` (arrays first, since they never carry the `Date` brand), and nested values convert again through `serializeFunctions`. Both paths reach `serializeRecord`, which returns native raw JSON unchanged, at any depth or from `toJSON()`, so the message envelope's JSON encoding writes its text. `isSafeObjectKey` is shared with the props codec's root decode filter. The source object stays on the cycle stack while its `toJSON()` result is encoded, so a result that contains its source is reported as circular. A `toJSON()` that returns `undefined` for an array entry is rejected like an `undefined` entry. Remote wrappers send calls without a timeout, because the callback may still be running in the other window; teardown rejects them, and `rejectRemoteCalls` rejects this bridge's in-flight calls to a host whose document was replaced. `endRemoteSession` rejects calls to a window whose host session ended, including calls not yet dispatched, and makes later wrapper calls to it reject until `resumeRemoteSession`. While calls to a window are pending, `watchRemoteCall` counts them and `scheduleLivenessCheck` asks that window every 10 s, on a `<call channel>_liveness` request answered by the same source guard, whether it still listens; an unanswered check rejects the window's pending calls unless they belong to a newer watch, so a document that went away without teardown cannot leave them waiting forever. The constructor requires a source guard; there is no permissive default.

Local callback admission rejects snapshots over 500 functions without evicting. Batch ownership records new IDs for rollback before delivery; an uncertain delivery keeps references within a 1,000-entry pool. Append-mode peer relays have a cumulative 500-reference bound. Verified reconnect cleanup runs inside the consumer props queue before bootstrap serialization: it releases strong registrations and keeps the weak IDs of props the new document already acknowledged.

- **O:** `isSafeObjectKey`, `FunctionBridge.retainLocalFunction`, `FunctionBridge.findRemoteWrapper`, `FunctionBridge.evictOldestRemote`, `FunctionBridge.assertLocalCapacity`, `FunctionBridge.clearBatch`, `FunctionBridge.createRemoteWrapper`, `FunctionBridge.isFunctionRef`, `FunctionBridge.removeLocal`, `FunctionBridge.startBatch`, `FunctionBridge.staleLocalIds`, `FunctionBridge.resumeRemoteSession`, `FunctionBridge.livenessMessageName`, `FunctionBridge.clearRemote`, `serializeFunctions`, `enterStack`, `serializeConvertedValue`, `serializeArray`, `serializeRecord`, `deserializeFunctions`, `createFunctionRef`.
- **I:** `FunctionBridge.constructor`, `FunctionBridge.serialize`, `FunctionBridge.rejectRemoteCalls`, `FunctionBridge.endRemoteSession`, `FunctionBridge.scheduleLivenessCheck`, `FunctionBridge.deserialize`, `FunctionBridge.createRemoteWrapper.wrapper`, `FunctionBridge.setupCallHandler`, `FunctionBridge.finishBatch`, `FunctionBridge.abortBatch`, `FunctionBridge.clearLocal`, `FunctionBridge.destroy`.
- **M:** `FunctionBridge.watchRemoteCall`.
- **O callbacks:** `FunctionBridge.setupCallHandler.callback@377`, `FunctionBridge.setupCallHandler.callback@403`, `FunctionBridge.watchRemoteCall.callback@305`, `FunctionBridge.staleLocalIds.callback@497`.
- **I callbacks:** `deserializeFunctions.callback@720`, `FunctionBridge.scheduleLivenessCheck.callback@319`.
- **M callbacks:** `FunctionBridge.scheduleLivenessCheck.callback@319.callback@329`, `FunctionBridge.scheduleLivenessCheck.callback@319.callback@333`.
- **Retained rationale —** `FunctionBridge.scheduleLivenessCheck.callback@319.callback@329`, `FunctionBridge.scheduleLivenessCheck.callback@319.callback@333`: Each settles one check with one guard that its watch is still current and one call, rescheduling or rejecting, so a check from a finished watch neither continues the loop nor rejects calls a newer watch tracks.
- **Retained rationale —** `FunctionBridge.watchRemoteCall`: It creates a window's watch and schedules its first liveness check when none exists, counts the call, and returns the release closure; the watch entry, the counter and the first schedule are one transition.

Evidence: [messaging](#evidence-messaging); typecheck.

### [communication/messenger.ts](../packages/forgeframe/src/communication/messenger.ts)

Admission precedes decoding, and channel, usable source, expected origin, and pending target identity are each checked explicitly. A messenger never trusts an opaque (`"null"`) origin, its own or a sender's, whatever matchers it holds (`'*'` and match-all `RegExp`s included), because every opaque document serializes the same way; `Messenger.isOriginTrusted` applies that rule first. Consumers construct their messenger without a listener and attach it once with `listen()` when host content opens. A `null` send timeout waits for the response or for rejection; `rejectPending` rejects, and `resolvePending` resolves, one message type's requests to a window whose document changed (both share `takePending`), and teardown rejects the rest. Request execution and response encoding are cohesive boundary operations; a request with no registered handler is answered with the `VERSION_MISMATCH` error `unsupportedRequest` (**O**) builds, so a peer on another version fails fast instead of at its timeout; `settlePendingResponse` (**M**) rebuilds an error response with `errorFromWire`, so a known code arrives as a `ForgeFrameError` and anything else as a plain `Error`. Timeouts and teardown reject with `CLOSED`; `createAcknowledgementTimeout` marks this messenger's own timeouts, so `isAcknowledgementTimeout` can tell them from a `CLOSED` the other window sent; the request workflow and posting are named separately. `send` and `post` resolve the target before encoding: only an absolute URL with a non-opaque origin is accepted, normalized to that origin as `postMessage` does, and responses must come from exactly that origin. `"*"`, `"/"`, other strings, and URLs with an opaque origin such as `data:` or `about:blank` throw before anything is posted. Trusted-origin recursion is one matcher-registry algorithm.

- **O:** `isPendingResponseSourceMatch`, `unsupportedRequest`, `createAcknowledgementTimeout`, `isAcknowledgementTimeout`, `Messenger.addTrustedOrigin`, `Messenger.removeTrustedOrigin`, `Messenger.isOriginTrusted`, `Messenger.on`, `Messenger.executeRequest`, `Messenger.serializeResponse`, `Messenger.postResponse`, `Messenger.takePending`.
- **M:** `resolveTargetOrigin`, `Messenger.settlePendingResponse`, `Messenger.send`, `Messenger.readTrustedMessage`.
- **Retained rationale —** `resolveTargetOrigin`: It parses the target and applies the shared `isOpaqueOrigin` predicate, each with the one throw it guards; a wrapper around the predicate would add nothing.
- **Retained rationale —** `Messenger.settlePendingResponse`: It removes the pending entry and clears its timer, then settles it through two shared rules (the source match and `errorFromWire`); splitting the settle step would only move one `resolve`/`reject` choice into a wrapper.
- **I:** `Messenger.rejectPending`, `Messenger.resolvePending`, `Messenger.constructor`, `Messenger.listen`, `Messenger.post`, `Messenger.setupListener`, `Messenger.setupListener.this.listener`, `Messenger.handleMessage`, `Messenger.handleRequest`, `Messenger.destroy`.
- **O callbacks:** `Messenger.removeTrustedOrigin.callback@232`, `Messenger.removeTrustedOrigin.callback@239`, `Messenger.on.callback@383`.
- **I callbacks:** `Messenger.send.callback@314`.
- **Retained rationale —** `Messenger.send`: It resolves the target, builds and encodes the envelope, then installs the pending entry with its timer before posting; the timer and the pending entry are one transition that must exist before the post.
- **Retained rationale —** `Messenger.readTrustedMessage`: Each admission rule (own window, trusted origin, decoded envelope, channel, usable source) is one guard in the order that keeps untrusted traffic from being parsed; naming them would only move the guards.

Evidence: [messaging](#evidence-messaging); typecheck.

### [communication/protocol.ts](../packages/forgeframe/src/communication/protocol.ts)

Envelope framing and decoding are operations. `serializeMessage` (**I**) prefixes the envelope's JSON from the shared `stringifyForWire`, so a value JSON cannot encode rejects as `VALIDATION` with the encoder's error as `cause`. Malformed messages decode to null. An error response carries `code` only for an error ForgeFrame raised (`wireErrorCode`); a non-string `code` makes the message malformed.

- **O:** `deserializeMessage`, `createRequestMessage`, `createResponseMessage`.
- **I:** `serializeMessage`.

Evidence: [messaging](#evidence-messaging); typecheck.

### [communication/types.ts](../packages/forgeframe/src/communication/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [messaging](#evidence-messaging); typecheck.

### [constants.ts](../packages/forgeframe/src/constants.ts)

The `VERSION` initializer validates the injected build value. Other entries are immutable protocol constants.

- **O callbacks:** `callback@130`.

Evidence: [contract](#evidence-contract); typecheck.

### [core/component-instance-index.ts](../packages/forgeframe/src/core/component-instance-index.ts)

Index mutation and snapshots are cohesive state operations. This module is the only active-instance index. Indexed instances expose their verified and opened host origins and their component's `peers` setting for peer scoping.

- **O:** `indexComponentInstance`, `removeIndexedComponentInstance`, `clearIndexedInstancesByTag`, `clearIndexedInstances`, `getComponentInstancesByTag`, `getIndexedComponentInstances`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/component-registry.ts](../packages/forgeframe/src/core/component-registry.ts)

Registration, lookups, snapshots, and deletion are state operations. The registry owns component metadata.

- **O:** `registerComponent`, `hasRegisteredComponent`, `getRegisteredComponent`, `getComponentOptions`, `deleteRegisteredComponent`, `clearRegisteredComponents`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/component.ts](../packages/forgeframe/src/core/component.ts)

`create` has one inference-only signature: props, factory input and exports types come from the schemas, so the runtime body handles plain records. Declaration policy receives options, including origin-matcher validation, so empty or blank matcher strings and strings without a scheme throw; static URL context selection receives the observed origin. Factory construction is an integration. `create` keeps its own copy of the options and validates the copy; `copyPropDefinitions` (**O**) then copies the checked definitions map and each wrapped entry, so later changes to the caller's objects cannot bypass validation. Defining a component never starts or configures a host: the module does not import the host runtime, and `initHost(Component, ...)` reads the registered options instead. An owner callback removes factory and index identities before the `closed` event; no public listener takes part, so user code cannot affect the bookkeeping. The `instances` getter (`create.get`) is an **O** state snapshot that returns a new frozen copy of the factory list on each read. `closeAll` is an integration over the global instance index: it snapshots every live instance, closes them concurrently, and collects failures into one `AggregateError` after every close settles.

`validateComponentOptions` composes the declaration checks before registration, each an **O** over supplied options without browser or registry access: `assertNoRemovedComponentOptions` (first, so a renamed option is reported by its new name), `assertComponentFields` (tag and URL shape, `hostOrigins` required when `url` is a function, `initTimeout`, and the optional non-empty `cspNonce`), `assertComponentMatchers` (the `hostOrigins` and `peers` matchers, empty arrays rejected; `peers` is `"same-origin"` or a matcher; `true` throws a rename error and `false` names how to keep discovery off), the `context` check through the shared `resolveRenderContext` (so `create()` and `render()` apply one rule), `assertSandboxOption`, `assertIframeAttributeNames` for static `attributes`, the shared `assertPropDefinitionsObject`, `assertExportsSchema` (the optional `exports` option is a Standard Schema), then `validateStaticComponentUrl` and the duplicate-tag rule. Every declaration error is a `VALIDATION` `ForgeFrameError`. `assertPropDefinitionsObject` (in `core/host/reserved-props.ts`, shared with `initHost()`) treats `undefined` entries as omitted, matching normalization, rejects `then` and `children`, and applies the shared prop-definition checks (getter entries, removed and unknown options including `outputSchema`, a missing `schema`, `deliverTo`, `sendToHost`, and parameter names and their clashes); `component.test.ts` covers both cases. `assertNoRemovedComponentOptions` reads one name-to-replacement table and throws a migration error naming the replacement for the removed `allowedConsumerDomains`, `eligible`, `children` and `peerDomains` options and the renamed `domain`, `timeout` and `defaultContext`.

- **O:** `assertComponentFields`, `assertNoRemovedComponentOptions`, `staticUrlValidationContext`, `removeTrackedInstance`, `copyPropDefinitions`, `create.get`.
- **I:** `validateStaticComponentUrl`, `create`, `create.untrackInstance`, `create.createTrackedInstance`, `getComponent`, `closeAll`, `unregisterComponent`, `clearComponents`.
- **M:** `create.trackInstance`, `validateComponentOptions`, `assertExportsSchema`, `assertComponentMatchers`.
- **O callbacks:** `closeAll.callback@415`.
- **I callbacks:** `create.Component`, `closeAll.callback@413`.
- **Retained rationale —** `create.trackInstance`: The factory-local guard, list append and index update share one lifetime. Keep this short ownership adapter next to construction; removal bookkeeping is named separately.
- **Retained rationale —** `assertExportsSchema`: It is the shared `isStandardSchema` predicate and the one throw it guards; a wrapper around the predicate would add nothing.
- **Retained rationale —** `assertComponentMatchers`: It applies the shared `assertOriginMatcher` to `hostOrigins` and `peers`, plus the one boolean `peers` rule that only this option has (`true` was renamed `"same-origin"`, `false` is never valid); naming that rule would wrap a single type check.
- **Retained rationale —** `validateComponentOptions`: It sequences the declaration checks and the static-URL check, plus one duplicate-tag rule over the registry and the `context` check, which calls `resolveRenderContext` only for its throw and discards the result; each rule is one line, and naming it would only wrap a `has` check or a call.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/render-context.ts](../packages/forgeframe/src/core/render-context.ts)

`resolveRenderContext` selects a requested context or the fallback and checks that it is `"iframe"` or `"popup"`, raising `VALIDATION` with the caller's label otherwise. `create()` checks the `context` option and `render()` resolves its argument through it, so both apply one rule.

- **O:** `resolveRenderContext`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer.ts](../packages/forgeframe/src/core/consumer.ts)

Lifecycle integrations keep their cancellation checkpoints. Render guards, task release, and destruction start are named state operations. Rendering places a props-queue hold after installing its render task, waits for earlier prop work before validation, pins the validated navigation URL before the `render` event (a URL that fails rejects without closing the instance), and releases the hold once the attempt settles, before its own task bookkeeping, so updates requested meanwhile run in call order afterwards. A second `render()` while one is in progress joins it when its container and context match the recorded `renderArguments` (`assertSameRenderArguments`, **O**) and rejects `VALIDATION` otherwise. `performRender` receives its render task and resolves it before emitting `rendered`, so a listener's `close()` cannot reject a completed render. A `POPUP_BLOCKED` failure releases the attempt's render resources without destroying the instance, so it can render again; any other failure records `renderFailure` before destruction (a `close()` that interrupts the render records the cancellation it rejects `render()` with, so both name one error object), and `assertPropsUpdateActive` passes it as the `cause` of the `CLOSED` error held updates reject with. `updateProps` rejects only once the instance closes. The update delivery origin comes from the pure `selectUpdateDeliveryOrigin`, and destruction asks the transport (`rejectPendingInit`) and the props pipeline (`abandonPending`) to clear their own state. The lifecycle emits on a private `#emitter` field, which plain JavaScript cannot reach either; `event` is the frozen `on`/`once` facade from `createEventSubscriber`, and ForgeFrame never calls a prop by name. `render` fires once before the placeholder or frame exists and is followed by a cancellation check; `rendered` fires once after loading completes. `show`, `hide`, `focus` and `resize` change only this page and return `void` after their effects; `focus` and `resize` emit only when a frame is mounted or a popup is open. The component `validate` runs through `ConsumerPropsPipeline.validateComponent`, which wraps its rejection as `VALIDATION`. `onExport` hands a verified EXPORT to `acceptExports`, which validates it against the `exports` schema with `validateExports`, then replaces `exports` and emits `exports`; an invalid export emits the `VALIDATION` error and rethrows it, so the host's `export()` rejects with the same code and the previous exports stay; the catch, emit and rethrow are integration control flow. A reconnection clears `exports` without an event. Hook proxies wire the props, renderer, and transport runtimes; response construction and browser reads are local operations.

`buildWindowName` rechecks schema values before the host window is created, because dimension and URL functions can mutate prop values after the previous check; the payload it builds carries channel metadata only. No user code receives instance controls during construction, so construction has no deferred action queue.

Array admission before render and before an update commits passes the URL's origin and the consumer's own origin to the pure `createDeliveryTarget`, so a host on the consumer's origin counts as a possible same-origin recipient and arrays of `deliverTo: 'same-origin'` props it may receive are checked before anything is committed. Bootstrap uses the verified source origin the same way.

`ConsumerComponent.resize` selects the next action from the renderer's outcome: nothing for `"unmounted"`, a synchronous `VALIDATION` throw without notifying for `"denied"` (a cross-origin popup), and `emitResize` for `"resized"`; `resizeForHost` handles a host's RESIZE request: a popup host has already resized its own window, so it resizes only iframes; it notifies through `emitResize` when `hostResizeApplied` (**O**) says the request took effect: an iframe was resized, or the host is a popup that is still open (the transport's `isHostConnected()`); nothing is emitted when nothing is mounted or the popup has closed. The renderer names its outcomes once as `ResizeOutcome`.

A close requested by the host's `close()` or by the user closing the popup goes through `closeFromOutside`, so an interrupted render rejects with `CLOSED`; only this page's own `close()` produces `CANCELLED`. `ConsumerComponent.close` cancels a render still in progress through `cancelActiveRender` (**O**: it records the cancellation as `renderFailure` before rejecting the render task, so held updates name the same error) and installs its shared completion before calling `performClose`, which sequences the `close` event, destruction, and flag release. `destroy` installs its own shared completion before `performDestroy` sequences resource teardown, cleanup, deregistration, the `closed` event, and disposal of the emitter, after which subscriptions are inert. Both pairs are lifecycle integrations. Reentrant callers, including close calls during failed-render destruction, join the pending completion without repeating the workflow or close events.

- **O:** `hostResizeApplied`, `ConsumerComponent.uid`, `ConsumerComponent.assertRenderAllowed`, `ConsumerComponent.assertSameRenderArguments`, `ConsumerComponent.finishRenderTask`, `ConsumerComponent.cancelActiveRender`, `ConsumerComponent.assertPropsUpdateActive`, `ConsumerComponent.assertStableRenderedOrigin`, `ConsumerComponent.isDestroyed`, `ConsumerComponent.getVerifiedHostOrigin`, `ConsumerComponent.getOpenedHostOrigin`, `ConsumerComponent.getPeers`, `ConsumerComponent.normalizeOptions`, `ConsumerComponent.applyPropsUpdate.emitPropsUpdated`, `ConsumerComponent.emitResize`, `ConsumerComponent.setupMessageHandlers.onError`, `ConsumerComponent.createRenderCancellationError`, `ConsumerComponent.isRenderCancelled`.
- **I:** `ConsumerComponent.constructor`, `ConsumerComponent.constructor.close`, `ConsumerComponent.constructor.focus`, `ConsumerComponent.render`, `ConsumerComponent.performRender`, `ConsumerComponent.validateForRender`, `ConsumerComponent.close`, `ConsumerComponent.performClose`, `ConsumerComponent.focus`, `ConsumerComponent.resizeForHost`, `ConsumerComponent.show`, `ConsumerComponent.hide`, `ConsumerComponent.updateProps`, `ConsumerComponent.applyPropsUpdate`, `ConsumerComponent.applyPropsUpdate.assertActive`, `ConsumerComponent.applyPropsUpdate.resolveUrl`, `ConsumerComponent.applyPropsUpdate.resolveUrlOrigin`, `ConsumerComponent.applyPropsUpdate.assertStableRenderedOrigin`, `ConsumerComponent.applyPropsUpdate.validateTransportProps`, `ConsumerComponent.applyPropsUpdate.shouldSendPropsToHost`, `ConsumerComponent.applyPropsUpdate.sendPropsUpdateToHost`, `ConsumerComponent.sendPropsUpdateToHost`, `ConsumerComponent.resolveUrlOrigin`, `ConsumerComponent.resolveContainer`, `ConsumerComponent.prerender`, `ConsumerComponent.createIframeElement`, `ConsumerComponent.open`, `ConsumerComponent.open.assertActive`, `ConsumerComponent.open.buildUrl`, `ConsumerComponent.open.buildBodyParams`, `ConsumerComponent.open.buildWindowName`, `ConsumerComponent.open.submitBodyForm`, `ConsumerComponent.open.onPopupClose`, `ConsumerComponent.open.registerCleanup`, `ConsumerComponent.buildUrl`, `ConsumerComponent.buildBodyParams`, `ConsumerComponent.submitBodyForm`, `ConsumerComponent.buildWindowName`, `ConsumerComponent.waitForHost`, `ConsumerComponent.setupMessageHandlers`, `ConsumerComponent.setupMessageHandlers.onBootstrap`, `ConsumerComponent.setupMessageHandlers.onReconnect`, `ConsumerComponent.setupMessageHandlers.onClose`, `ConsumerComponent.setupMessageHandlers.onResize`, `ConsumerComponent.setupMessageHandlers.onFocus`, `ConsumerComponent.setupMessageHandlers.onShow`, `ConsumerComponent.setupMessageHandlers.onHide`, `ConsumerComponent.setupMessageHandlers.onExport`, `ConsumerComponent.setupMessageHandlers.onGetPeers`, `ConsumerComponent.acceptExports`, `ConsumerComponent.setupCleanup`, `ConsumerComponent.teardownRenderResources`, `ConsumerComponent.destroy`, `ConsumerComponent.performDestroy`.
- **M:** `ConsumerComponent.assertRenderActive`, `ConsumerComponent.beginDestroy`, `ConsumerComponent.closeFromOutside`, `ConsumerComponent.resolveUrl`, `ConsumerComponent.resolveDimensions`, `ConsumerComponent.resize`.
- **O callbacks:** `ConsumerComponent.constructor.callback@172`, `ConsumerComponent.performRender.callback@374`, `ConsumerComponent.waitForHost.callback@821`.
- **I callbacks:** `ConsumerComponent.constructor.callback@182`, `ConsumerComponent.constructor.callback@173`, `ConsumerComponent.prerender.callback@715`, `ConsumerComponent.prerender.callback@716`, `ConsumerComponent.prerender.callback@717`, `ConsumerComponent.setupMessageHandlers.onBootstrap.callback@866`, `ConsumerComponent.setupCleanup.callback@916`.
- **Retained rationale —** `ConsumerComponent.assertRenderActive`: A cancellation guard, `teardownRenderResources()` and the throw stay together, so every one of its call sites releases render resources before reporting cancellation.
- **Retained rationale —** `ConsumerComponent.closeFromOutside`: Recording that the host or the user closed the window and starting the shared close are one request; the guard keeps an earlier close's reason, and `createRenderCancellationError` reads the flag to choose `CLOSED` over `CANCELLED`.
- **Retained rationale —** `ConsumerComponent.beginDestroy`: Marking the instance destroyed and asking the transport to reject its pending handshake are one transition; the guard returns `false` for a repeat, so teardown starts once and no caller can observe a destroyed instance with a live handshake.
- **Retained rationale —** `ConsumerComponent.resolveUrl`: It rechecks schema values when it reads the current props (`revalidateSchemaValues`), then calls a function `url` with the props or returns the static one; the choice is one `typeof` on the option it owns.
- **Retained rationale —** `ConsumerComponent.resolveDimensions`: It rechecks schema values (`revalidateSchemaValues`), then calls a dimensions function with the props or returns the static value; the choice is one `typeof` on the option it owns.
- **Retained rationale —** `ConsumerComponent.resize`: It selects the next action from the renderer's outcome: nothing, one throw, or `emitResize`; each branch is one statement.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer/events.ts](../packages/forgeframe/src/core/consumer/events.ts)

The consumer event-name set is data built from `EVENT`. Describing an unknown name is one message policy: a removed v1 name (`prerender`, `prerendered`, `display`, `destroy`) names its replacement, and any other name lists the supported events.

- **O:** `describeUnknownConsumerEvent`.

Evidence: [consumer](#evidence-consumer), [component-events.test](../packages/forgeframe/tests/unit/component-events.test.ts); typecheck.

### [core/consumer/prop-update.ts](../packages/forgeframe/src/core/consumer/prop-update.ts)

The update policy operates on explicit snapshots and observed facts and constructs no runtime: the patch merge (a key set to `undefined` is deleted, so it is not supplied), the keys an update normalizes, the overlay of normalized values on the current snapshot, the defined inputs to revalidate, and the origin an update is delivered to.

- **O:** `mergePropPatch`, `selectNormalizationKeys`, `mergeNormalizedPatch`, `definedInputKeys`, `selectUpdateDeliveryOrigin`.
- **O callbacks:** `definedInputKeys.callback@57`.

Evidence: [consumer](#evidence-consumer), [prop-update.test](../packages/forgeframe/tests/unit/prop-update.test.ts); typecheck.

### [core/consumer/props-pipeline.ts](../packages/forgeframe/src/core/consumer/props-pipeline.ts)

Candidate construction, validation, and commitment are separate steps. `buildCandidate` composes the pure merge, key selection and overlay from `prop-update.ts` with normalization: it converts only the patched keys from the merged inputs, then `validateSnapshot` rechecks the other supplied inputs and normalized outputs before the component `validate` runs. `validateComponent` is the supplied-callback boundary for that option: its rejection becomes `VALIDATION` with the thrown value as `cause`, for render and update alike. A construction-time schema failure is kept and rethrown at every trust boundary until an update normalizes every prop. The pipeline owns the queue and the render hold: updates made before a host connects also install their entries before user code (schema transforms and the component `validate`) runs. `holdForRender` places one entry at the queue tail and returns the earlier work the render waits for plus a release step; reads the render owns (`readCurrentProps` during a hold) run inside it, ahead of held updates, and `appendOwnWork` counts the earlier work and each own read until they settle. `releaseRenderHold` lets held updates run after that work, and leaves the queue idle at once only when nothing is held or still running. `abandonPending` forgets the tail at teardown and releases the hold, so held updates settle and reject as closed.

Update admission checks deliverable array values after URL/origin policy and before snapshot commitment; render admission checks them before allocating resources. Arrays produced by custom encoders are checked at delivery, after commitment, where a transport failure does not roll back the committed snapshot. [consumer-props-queue.test](../packages/forgeframe/tests/unit/consumer-props-queue.test.ts) covers the queue; [consumer-host-handshake.test](../packages/forgeframe/tests/integration/consumer-host-handshake.test.ts), [body-param-bootstrap.test](../packages/forgeframe/tests/integration/body-param-bootstrap.test.ts) and [props-sync.test](../packages/forgeframe/tests/integration/props-sync.test.ts) cover the render hold.

- **O:** `ConsumerPropsPipeline.validateComponent`, `ConsumerPropsPipeline.commitCandidate`, `ConsumerPropsPipeline.appendOwnWork`, `ConsumerPropsPipeline.appendOwnWork.settle`, `ConsumerPropsPipeline.releaseRenderHold`, `ConsumerPropsPipeline.abandonPending`.
- **I:** `ConsumerPropsPipeline.constructor`, `ConsumerPropsPipeline.revalidateSchemaValues`, `ConsumerPropsPipeline.buildCandidate`, `ConsumerPropsPipeline.validateSnapshot`, `ConsumerPropsPipeline.updateProps`, `ConsumerPropsPipeline.readCurrentProps`, `ConsumerPropsPipeline.readCurrentProps.readSnapshot`, `ConsumerPropsPipeline.holdForRender.release`, `ConsumerPropsPipeline.queuePropsUpdate`, `ConsumerPropsPipeline.trackPendingUpdate`.
- **M:** `ConsumerPropsPipeline.holdForRender`.
- **O callbacks:** `ConsumerPropsPipeline.holdForRender.callback@246`, `ConsumerPropsPipeline.trackPendingUpdate.callback@318`, `ConsumerPropsPipeline.trackPendingUpdate.callback@319`, `ConsumerPropsPipeline.trackPendingUpdate.callback@324`.
- **I callbacks:** `ConsumerPropsPipeline.updateProps.callback@181`.
- **Retained rationale —** `ConsumerPropsPipeline.holdForRender`: Building the hold record, installing it as the active hold and tracking its queue tail are one placement; each step reads what the previous one created, and a separate builder would only pass the half-built hold back.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer/renderer.ts](../packages/forgeframe/src/core/consumer/renderer.ts)

Prerender context construction, mounting, iframe/popup opening, POST submission, and teardown have named entrypoints. Container resolution rejects a detached container in iframe context, and iframe opening rechecks attachment, because a detached frame has no browsing context and a POST would open an untracked window. `resize` reports `false` when the browser denies resizing a popup, and `focus` reports `false` when no iframe is mounted and no popup is open. Template contexts carry the `cspNonce` component option, never a prop. `completePrerender` swaps the iframe in, or removes popup loading content, after initialization while keeping the caller's mount and custom shells. POST form work is one browser operation: methods are called through the created form's prototype from the mount document, and construction and submission share a cleanup guard, so named controls cannot mask append, submit, or removal. Resource acquisition and user callbacks have synchronous cancellation checkpoints.

Loading concealment and restoration are cohesive browser-style operations owned by the renderer. `concealLoadingFrame` captures CSS and conceals the frame: eager frames use `display: none` so custom loading templates gain no extra space, while lazy frames keep their layout and temporarily clear a configured inline `display: none` so navigation can start. Its local `capture` callback performs one style read. After the loader fades, `restoreLoadingFrameStyles` restores the saved styles, and explicit visibility controls take precedence. The reveal predicate and its style-value callback are **O**: only unstyled frames whose current visibility request allows showing get the default reveal animation. Teardown discards saved styles. Prerender applies a pending explicit show once the frame exists, so controls sent before creation behave like later ones.

- **O:** `ConsumerRenderer.constructor`, `ConsumerRenderer.resolveContainer`, `ConsumerRenderer.createTemplateContext`, `ConsumerRenderer.concealLoadingFrame`, `ConsumerRenderer.restoreLoadingFrameStyles`, `ConsumerRenderer.submitBodyForm`.
- **I:** `ConsumerRenderer.prerender`, `ConsumerRenderer.createTemplateContext.close`, `ConsumerRenderer.createTemplateContext.focus`, `ConsumerRenderer.createIframeElement`, `ConsumerRenderer.open`, `ConsumerRenderer.openPopup`, `ConsumerRenderer.focus`, `ConsumerRenderer.resize`, `ConsumerRenderer.show`, `ConsumerRenderer.hide`, `ConsumerRenderer.destroy`.
- **M:** `ConsumerRenderer.mountPrerenderContent`, `ConsumerRenderer.openIframe`, `ConsumerRenderer.completePrerender`.
- **O callbacks:** `ConsumerRenderer.concealLoadingFrame.capture`, `ConsumerRenderer.completePrerender.callback@397`, `ConsumerRenderer.completePrerender.callback@397.callback@400`.
- **I callbacks:** `ConsumerRenderer.openPopup.callback@379`.
- **Retained rationale —** `ConsumerRenderer.mountPrerenderContent`: Ownership checks, DOM attachment and cancellation assertions must stay adjacent: cancellation can occur inside DOM/template actions. This short mounting adapter makes those boundaries visible.
- **Retained rationale —** `ConsumerRenderer.openIframe`: It guards that prerender created the iframe and that it is still attached, then navigates it by POST (`submitBodyForm`) or by `src`; the guards protect the one navigation it performs.
- **Retained rationale —** `ConsumerRenderer.completePrerender`: It branches on the context it owns: for an iframe it calls `swapPrerenderContent` and restores the loading styles; for a popup it removes the loading content and its owned container. Each branch is a short cleanup of renderer state.

Evidence: [render](#evidence-render); typecheck.

### [core/consumer/peers.ts](../packages/forgeframe/src/core/consumer/peers.ts)

Peer discovery is opt-in on both sides. `assertPeersEnabled` refuses a request whose own component has no `peers` setting, with an error naming the tag and the option, so the host's `getPeerInstances()` rejects rather than reporting an empty list. Index lookup supplies identities, and `observePeerCandidate` reads each instance's verified and opened host origins, its component's `peers` setting, and exports into a `PeerCandidate`. `selectPeerInstances` is pure policy over those candidates: it skips candidates without `peers`, then compares each peer's verified host origin (or, while its host loads, its opened origin, without exports) with the requester's supplied origin, or, for a `peers` matcher, matches the requester's origin against it. Admission is one-way: the listed component's matcher decides. Opaque origins never identify a peer, so an opaque requester selects nothing and a peer whose own host is opaque is never listed, even when a matcher matches. `ConsumerPeerRequest.allTags` and `ConsumerPeerRequest.peers` are required; the transport supplies the requester's `peers` from its own options, never from the request.

- **O:** `assertPeersEnabled`, `observePeerCandidate`, `selectPeerInstances`.
- **I:** `getPeerInstances`.
- **O callbacks:** `getPeerInstances.callback@65`.
- **I callbacks:** `getPeerInstances.callback@70`.

Evidence: [consumer](#evidence-consumer), [consumer-peers.test](../packages/forgeframe/tests/unit/consumer-peers.test.ts); typecheck.

### [core/consumer/transport.ts](../packages/forgeframe/src/core/consumer/transport.ts)

Trusted matcher selection is data-only: `staticTrustedUrl` picks the static URL trusted without `hostOrigins`, and `selectInitialTrustedOrigins` picks `hostOrigins` or that URL's origin; the constructor resolves the origin (`resolveStaticUrlOrigin`) and records it in `staticUrlTrustedOrigin`. Window/origin observation and messenger rotation are integrations. A configured `hostOrigins` is the whole trust policy, so it is the initial matcher and `syncTrustedOriginForUrl` returns at once. Without one the URL is static, because `create()` requires `hostOrigins` for a function URL, and the trusted origin rotates only when a relative URL's document base changes between construction and render. Bootstrap and INIT integrations keep explicit source and session admission and state-transition order. Control callbacks select the next protocol action, and their small response literals stay at the handler. Peer discovery sequences the index lookup and recursive serialization through a separate source-guarded relay bridge; its batch bookkeeping is cleared without retiring held snapshots, and reconnect and destroy clear relay identities.

`attachHostWindow` records opened host content and starts the messenger listener, so unrendered instances add no `message` listener. `attachHostWindow` records the opened origin together with the window, and `resetHostWindow` clears both, so the host-control guard matches `hostOrigins` or that opened origin. `staticUrlTrustedOrigin` mirrors the messenger's trust: it is set only without `hostOrigins` and survives teardown, so a retried render on a moved document base untrusts the old origin. Prop updates go to `getHostOrigin()` (verified, else opened); a connected window always has one. `buildWindowName` always runs before host content exists, so INIT is accepted only for the current verified bootstrap session; the `window.name` payload carries channel metadata only. A bootstrap from a new host session asks the prop bridge to reject its pending calls to that window, which the replaced document can no longer answer, and the messenger to resolve its pending PROPS requests to it, because the bootstrap snapshot the new session reads already carries them. An ERROR marked `initFailed` during a pending handshake is recorded instead of reported, because the host can retry on the same page: a successful INIT clears the record, and a handshake timeout reports once as `INIT_TIMEOUT`, with the host's reason in its message and the host's coded error (rebuilt by `errorFromWire`) as `cause`. `readHostError` rebuilds the notice: an ERROR without `initFailed` is the host application's `reportError()` and stays a plain `Error`. Outside a handshake it is reported at once. A bootstrap snapshot that cannot be sent, such as one holding a `BigInt` (`serializePropsForHost` checks the encoded props), is different: the host cannot fix the consumer's props by retrying, so `readBootstrapSnapshot` fails the pending handshake at once with that error through `failPendingHandshake`, and the host's `ready` rejects with it too. Without a recorded reason, the timeout's guidance adds that consumer and host must run the same ForgeFrame major version, because a 1.x host refuses the protocol 3 payload without replying.

A peer append commits only after the response passes native JSON encoding. If final response encoding fails, only the new registrations are rolled back; held callbacks and capacity stay available for later discoveries.

- **O:** `readHostError`, `staticTrustedUrl`, `selectInitialTrustedOrigins`, `ConsumerTransport.failPendingHandshake`, `ConsumerTransport.getHostOrigin`, `ConsumerTransport.isHostConnected`, `ConsumerTransport.isHostControlSource`, `ConsumerTransport.resetHostWindow`, `ConsumerTransport.rejectPendingInit`.
- **I:** `ConsumerTransport.constructor`, `ConsumerTransport.attachHostWindow`, `ConsumerTransport.resolveStaticUrlOrigin`, `ConsumerTransport.syncTrustedOriginForUrl`, `ConsumerTransport.serializePropsForHost`, `ConsumerTransport.readBootstrapSnapshot`, `ConsumerTransport.sendPropsUpdateToHost`, `ConsumerTransport.buildWindowName`, `ConsumerTransport.waitForHost`, `ConsumerTransport.setupMessageHandlers`, `ConsumerTransport.onHostControl`, `ConsumerTransport.destroy`.
- **O callbacks:** `ConsumerTransport.waitForHost.callback@314`, `ConsumerTransport.sendPropsUpdateToHost.callback@265`.
- **I callbacks:** `ConsumerTransport.constructor.callback@129`, `ConsumerTransport.constructor.callback@134`, `ConsumerTransport.setupMessageHandlers.callback@342`, `ConsumerTransport.setupMessageHandlers.callback@388`, `ConsumerTransport.setupMessageHandlers.callback@418`, `ConsumerTransport.setupMessageHandlers.callback@409`, `ConsumerTransport.setupMessageHandlers.callback@423`, `ConsumerTransport.setupMessageHandlers.callback@428`, `ConsumerTransport.setupMessageHandlers.callback@434`, `ConsumerTransport.setupMessageHandlers.callback@448`, `ConsumerTransport.setupMessageHandlers.callback@439`, `ConsumerTransport.setupMessageHandlers.callback@463`, `ConsumerTransport.setupMessageHandlers.callback@479`, `ConsumerTransport.onHostControl.callback@513`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer/types.ts](../packages/forgeframe/src/core/consumer/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/host.ts](../packages/forgeframe/src/core/host.ts)

The public host check delegates to the bootstrap and window adapters. `isHost()` is true when a host runtime is active or `window.name` holds a decodable ForgeFrame payload of any protocol version, so older payloads reach the upgrade error; `isForgeFrameWindow` decides decodability through the payload reader. It is false for a malformed payload after the prefix, and stays true after `destroy()`. Importing the module without browser globals has no effect.

- **I:** `isHost`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/bootstrap.ts](../packages/forgeframe/src/core/host/bootstrap.ts)

`initHost()` is the only host start path. `init-host-arguments.ts` checks the call shape before any environment check and resolves what the host starts with. The integration then returns null without browser globals, throws while a host is active, reads the channel metadata, and in the component form throws when the payload's tag differs. It never consults the registry for another component's definitions and never reconfigures a running host. `readInitialPayload` classifies the current `window.name` on every new start and never rewrites it: a payload from another protocol throws the `VERSION_MISMATCH` upgrade error that `describeUnsupportedPayload` words, before any host state exists or anything is sent to the unverified consumer, and an invalid payload is logged and yields null. `hasConsumerWindow` checks first that a parent or opener exists: a stale older payload in a window with neither has no consumer to upgrade, so it yields null, as a current payload without a consumer window does. There is no pending copy of the payload, so a retry after a failed start or failed asynchronous validation, and a start after `destroy()`, reread the retained channel metadata.

`startHostRuntime` resolves the consumer window first, then passes it and the resolved start options to the runtime and makes it the active host from construction until it is destroyed or its start fails. A consumer-window resolution failure (`isConsumerWindowUnavailable`, around `resolveConsumerWindow` only, which recognizes only that function's own failure) yields null; a disallowed consumer origin throws from construction and leaves no active host. Its ready callback is registered before the caller can observe `ready`, so a rejection releases the singleton before the caller's handlers run. The destruction callback is an **O** identity-guarded state transition, so stale or repeated destruction cannot clear a replacement host. `createHost` returns the frozen `Host` handle: `ready`, `uid`, `tag`, `consumerOrigin`, the host controls (`close`, `focus`, `resize`, `show`, `hide`, `export`, `onProps`, `reportError`, `getPeerInstances`), `init`, `destroy`, `on` and `once`. Each control is a one-call delegate to the runtime; `ready` resolves to the props alone, so no prop name can clash with a control. `on` and `once` come from the shared subscriber facade and admit only the `error` event. The accepted names and the unknown-name message come from `core/host/events.ts`.

- **O:** `describeUnsupportedPayload`, `getHost`.
- **I:** `readInitialPayload`, `hasConsumerWindow`, `startHostRuntime`, `createHost`, `createHost.close`, `createHost.focus`, `createHost.resize`, `createHost.show`, `createHost.hide`, `createHost.export`, `createHost.onProps`, `createHost.reportError`, `createHost.getPeerInstances`, `createHost.init`, `createHost.destroy`, `clearHostInstance`.
- **M:** `initHost`.
- **O callbacks:** `startHostRuntime.onDestroy`.
- **I callbacks:** `startHostRuntime.callback@225`.
- **Retained rationale —** `initHost`: The component form's tag check is one comparison and throw between the payload read and the runtime start; it reads the payload this integration just obtained, so it stays inline.

Evidence: [host](#evidence-host); typecheck.

### [core/host/reserved-props.ts](../packages/forgeframe/src/core/host/reserved-props.ts)

The two reserved prop names (`then`, which would make the props object a thenable so `await host.ready` never settles, and `children`, so React JSX children never reach a host) and the declaration policy that rejects definitions for them. Host controls live on the `Host` handle, so no control name is reserved; the props runtime also drops reserved names from unchecked props. `create()` and `initHost()` share the policy, which reads fields by the own-field rule in `utils/own-field.ts`: entries set to `undefined` count as omitted, and accessors are not invoked. `assertPropDefinitionsObject` is the one prop-definitions check both entry points call: the reserved-name rule, then `assertPropDefinitions`.

- **O:** `assertNoReservedPropDefinitions`.
- **I:** `assertPropDefinitionsObject`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/component.ts](../packages/forgeframe/src/core/host/component.ts)

Constructor proxies bind the host's own fields and its props and transport runtimes. Accessors delegate. The constructor has one startup path: it selects the messaging target and checks it against the allowlist before BOOTSTRAP, starts with an empty live props object, makes `ready` the verified bootstrap, and makes INIT wait for it. With `autoInit`, the constructor calls `init()`; otherwise INIT waits for the caller. Bootstrap readiness, source verification, and teardown are explicit integrations. `ready` resolves to the live props object; its rejection observer only prevents an unhandled rejection. `uid`, `tag` and `consumerOrigin` are read-only fields set once in the constructor. The host controls (`close`, `focus`, `resize`, `show`, `hide`, `reportError`, `getPeerInstances`) delegate to the transport and `onProps` to the props runtime, so `createHost` reaches no runtime but this one.

`HostComponent.destroy` notifies its bootstrap owner first, then sequences transport, observer, and prop cleanup. The owner callback is local to that owner, so stale or repeated destruction cannot clear a replacement host; `consumer-host-handshake.test.ts` covers this.

The constructor takes one options object (`HostRuntimeOptions`: definitions, the component's `exports` schema, `consumerOrigins`, `autoInit`, and the owner's destruction callback). `export` checks each export with `validateExports` before queueing it on the transport, so an invalid export rejects at the host's call site without being sent; the tag-agnostic form has no schema and sends unchecked. `receiveBootstrap` requests BOOTSTRAP, checks the response's shape, and passes the messaging consumer origin to the shared allowlist policy in `consumer-origin-policy.ts` again, as defence in depth. `assertBootstrapResponse` is the **O** shape check (`VALIDATION`). Any failure there, apart from destruction, goes through `toHandshakeFailure` (an unanswered request becomes `INIT_TIMEOUT`, other codes stay) and is reported on the `error` event, as a `ForgeFrameError` with that code whose `cause` is the failure, before `ready` rejects with the failure itself. When host schemas reject the bootstrap snapshot, the props runtime reports the `Error` instead, and `initializeFromConsumer` passes it through `toHandshakeFailure` (so `ready` always rejects with a code; a schema that throws becomes `VALIDATION` with the original as `cause`) and asks the transport to tell the verified, allowed consumer why; consumer-origin rejections are not reported to the consumer.

- **O:** `assertBootstrapResponse`, `HostComponent.constructor.getConsumerOrigin`, `HostComponent.constructor.beforeInit`, `HostComponent.constructor.getConsumerWindow`, `HostComponent.constructor.getBridge`, `HostComponent.constructor.get`, `HostComponent.constructor.isConsumerWindow`.
- **I:** `HostComponent.constructor`, `HostComponent.constructor.applySerializedProps`, `HostComponent.initializeFromConsumer`, `HostComponent.receiveBootstrap`, `HostComponent.export`, `HostComponent.close`, `HostComponent.focus`, `HostComponent.resize`, `HostComponent.show`, `HostComponent.hide`, `HostComponent.reportError`, `HostComponent.getPeerInstances`, `HostComponent.onProps`, `HostComponent.init`, `HostComponent.destroy`.
- **O callbacks:** `HostComponent.constructor.callback@134`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/consumer-origin-policy.ts](../packages/forgeframe/src/core/host/consumer-origin-policy.ts)

All trust policy works from supplied origins and options. A messaging target must be an exact HTTP(S) origin that passes the allowlist, and stays provisional until the bootstrap exchange verifies the source window. `validateMessagingConsumerContext` returns that origin unchanged. `assertAllowedConsumerOrigin` is the one allowlist check: the messaging context and the coordinator's post-bootstrap check both use it. The allowlist is always supplied.

- **M:** `validateMessagingConsumerContext`, `assertAllowedConsumerOrigin`.
- **Retained rationale —** `validateMessagingConsumerContext`: It checks that the target is an exact HTTP(S) origin, then calls the shared `assertAllowedConsumerOrigin`; the exactness check is one parse and comparison that only the messaging target needs.
- **Retained rationale —** `assertAllowedConsumerOrigin`: It rejects an empty origin, then applies the shared `matchOrigin`; each rule is one guard with its throw.

Evidence: [host](#evidence-host), [consumer-origin-policy.test](../packages/forgeframe/tests/unit/consumer-origin-policy.test.ts); typecheck.

### [core/host/events.ts](../packages/forgeframe/src/core/host/events.ts)

The host event-name set is data built from `EVENT`, matching `core/consumer/events.ts`. Describing an unknown name is one message policy: the removed v1 `props` event names `host.onProps()` as its replacement, and any other name lists the supported event.

- **O:** `describeUnknownHostEvent`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/handshake-failure.ts](../packages/forgeframe/src/core/host/handshake-failure.ts)

`toHandshakeFailure` gives a failed bootstrap or INIT exchange its code: a request the consumer never answered (the messenger's own acknowledgement timeout) becomes `INIT_TIMEOUT` with the original as `cause`, other `ForgeFrameError`s keep theirs, including a `CLOSED` the consumer sent back, and anything else is `VALIDATION`. `HostComponent.receiveBootstrap` and `HostTransport.sendInit` use it before `emitInitFailure`.

- **M:** `toHandshakeFailure`.
- **Retained rationale —** `toHandshakeFailure`: The classification is the shared `isAcknowledgementTimeout` check and an `instanceof`, each with its construction; `normalizeError` only supplies the `cause`, and a separate builder would pass the same branch back.

Evidence: [host](#evidence-host); typecheck.

### [core/host/init-host-arguments.ts](../packages/forgeframe/src/core/host/init-host-arguments.ts)

`initHost()` call-shape policy, checked before any environment check, so a v1 call shape fails closed everywhere. `readInitHostArguments` resolves the component form's tag, definitions and `exports` schema through the registry: a component must carry registered options and takes one options object, and a tag-agnostic call that adds a second positional argument (the v1 allowlist position) throws. `readInitHostOptions` is **O** declaration policy over the supplied options: it accepts only `consumerOrigins`, `autoInit`, and, in the tag-agnostic form, `props` (naming `consumerOrigins` for the old `allowedConsumerDomains`); validates the required matcher; defaults `autoInit`; and applies the shared `assertPropDefinitionsObject` to supplied definitions. Only the empty array of `consumerOrigins` is accepted (it admits no consumer and so fails closed); `hostOrigins`, `peers` and `deliverTo` reject it. The component form substitutes the shared empty definitions for a component without `props`, so its host accepts no fields; only the tag-agnostic form without `props` passes the named `"unchecked"` mode, which keeps every field. `callShapeError` builds a `VALIDATION` `ForgeFrameError` that appends the v2 call shapes, so every argument error names them; the shared reserved-name and prop-definition errors name the prop instead.

- **O:** `callShapeError`, `readInitHostOptions`.
- **M:** `readInitHostArguments`.
- **Retained rationale —** `readInitHostArguments`: The argument-count rules are two inline guards on the call shape it is already resolving; a separate operation would only re-read the same array.

Evidence: [host](#evidence-host); typecheck.

### [core/host/peer-instances-options.ts](../packages/forgeframe/src/core/host/peer-instances-options.ts)

`getPeerInstances()` argument policy, kept apart from the transport like `init-host-arguments.ts`: `assertPeerInstancesOptions` rejects a non-object, the renamed `anyConsumer` and a non-boolean `allTags` with `VALIDATION` before anything is sent.

- **O:** `assertPeerInstancesOptions`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/props-runtime.ts](../packages/forgeframe/src/core/host/props-runtime.ts)

The runtime owns the live props object that `ready` resolves to; it holds the consumer's props only, and its identity never changes. Snapshot commitment (`commitSerializedProps`, then `commitProps`) is separate from subscriber notification (`notifyPropsHandlers`). An update acknowledged before a messaging bootstrap completes is committed but not published; `applyBootstrap` marks the runtime initialized and publishes the final snapshot once. `omitReservedPropNames` (**O**) drops `then` and `children` from every decoded snapshot, so an unchecked consumer cannot make the props object a thenable. Stale props are found by own-key membership, so inherited names cannot keep an old value. Subscribers run only after reconciliation; notification observes promise and thenable failures without awaiting user work, so acknowledgement order is unaffected. `onProps` is the only way to observe updates; the runtime emits only `error` events, always with an `Error`. A rejected snapshot goes through `toPropsFailure` (**O**), which keeps a `ForgeFrameError`'s code and wraps anything else, such as a throwing third-party schema, as `VALIDATION` with the original as `cause`, so the `error` event and the thrown error (which rejects `ready` during bootstrap) are the same object.

`HostPropsRuntime.filterUndeliveredProps` is an **I** admission step: a runtime constructed in the `"unchecked"` mode (a tag-agnostic host without `props`) keeps every field; otherwise it applies `selectExpectedFields`, which keeps only fields whose key the delivered definitions own, so undeclared fields, including those of `undefined` definition entries, never reach host state. `HostPropsRuntime.expectedDefinitions` is an **I**: it caches one call that applies the shared delivery policy (`createDeliveryTarget`, then `getDeliveredPropDefinitions`) with the host origin read at construction and the verified consumer origin, once, and keeps the selection, so consumer-only props and props whose `deliverTo` excludes this host are neither expected nor accepted. `deserialize` filters wire snapshots before calling the codec. The definitions are fixed when the runtime is constructed; bootstrap and live updates validate every expected prop with the same delivered definitions, including an acknowledged update that arrives before bootstrap completes, so required withheld or local inputs do not block initialization. The runtime defines no window global, and reading the props has no side effects.

Notification snapshots handlers with weak registration tokens. New registrations and cancel-and-register replacements wait for the next notification; cancellation or destruction skips pending delivery. Duplicate registrations keep their original token, and cancellation removes only the registration whose token it captured, so an old or duplicate handle cannot cancel a later registration of the same callback. `onProps` and the unsubscribe function it returns are **O** state operations, covered through public update delivery. The snapshot map callback is **O**. The rejection callback in `HostPropsRuntime.notifyPropsHandlers` is an **O** callback boundary: it logs one observer failure and leaves prop state alone.

- **O:** `omitReservedPropNames`, `toPropsFailure`, `HostPropsRuntime.constructor`, `HostPropsRuntime.commitProps`, `HostPropsRuntime.notifyPropsHandlers`, `HostPropsRuntime.destroy`, `HostPropsRuntime.onProps`, `HostPropsRuntime.onProps.callback@165`.
- **I:** `HostPropsRuntime.applySerializedProps`, `HostPropsRuntime.commitSerializedProps`, `HostPropsRuntime.deserialize`, `HostPropsRuntime.filterUndeliveredProps`.
- **M:** `HostPropsRuntime.applyBootstrap`, `HostPropsRuntime.expectedDefinitions`.
- **O callbacks:** `HostPropsRuntime.notifyPropsHandlers.callback@134`, `HostPropsRuntime.notifyPropsHandlers.callback@145`.
- **Retained rationale —** `HostPropsRuntime.applyBootstrap`: It picks the newer acknowledged snapshot over the bootstrap one, commits it through `commitSerializedProps`, then sets the initialized flag and notifies once; the choice is one `??` on state it owns, and the flag must change between commit and notification.
- **Retained rationale —** `HostPropsRuntime.expectedDefinitions`: It caches one call of the shared delivery policy and picks its input, the declared definitions or the shared empty ones for the `"unchecked"` mode; the choice is one conditional on the mode it already reads.

Evidence: [host](#evidence-host); typecheck.

### [core/host/security.ts](../packages/forgeframe/src/core/host/security.ts)

Browser observations are separate from policy. A directly accessible consumer origin is preferred over the payload's claimed origin; the referrer is not observed. `resolveMessagingConsumerContext` always passes the host's allowlist to the policy. A window without a parent or opener raises the one `CLOSED` start-up error and marks it in a module-private `WeakSet`; `isConsumerWindowUnavailable` recognizes only that marked error, so `initHost()` returns `null` instead of matching a message, and any other `CLOSED` error surfaces.

- **O:** `getAccessibleConsumerOrigin`, `isConsumerWindowUnavailable`.
- **I:** `resolveMessagingConsumerContext`.
- **M:** `resolveConsumerWindow`.
- **Retained rationale —** `resolveConsumerWindow`: It prefers the parent for an iframe and the opener for a popup, each through one `window/helpers` read, and marks the one start-up error it throws; the parent-before-opener rule is two guards on observations it just made.

Evidence: [host](#evidence-host); typecheck.

### [core/host/transport.ts](../packages/forgeframe/src/core/host/transport.ts)

Outbound export batches share a FIFO queue. Both bridges and the PROPS handler admit only `isConsumerSource` (**O**): the consumer window at the selected origin. `getPeerInstances` checks its options with `assertPeerInstancesOptions` (in `peer-instances-options.ts`) before sending, so the renamed `anyConsumer` and a non-boolean `allTags` reject without a request. A serialization failure aborts new bridge registrations, and so does a consumer's `VALIDATION` rejection of the export, which keeps its previous exports (`exportMayBeStored`); another send failure keeps possibly delivered references, and acknowledged delivery retires stale IDs. `sendInitOnce` launches the INIT workflow at most once and never after teardown; the coordinator calls it from `init()`. The workflow awaits `beforeInit` (the verified bootstrap); a rejected start sends and reports nothing, because the coordinator reports failed starts. `emitInitFailure` is the one place that wraps failed starts and INIT delivery failures in a `ForgeFrameError` with the failure's code, whose message starts with `Failed to initialize host component:` and whose `cause` is the failure; `sendInit` first passes an INIT failure through `toHandshakeFailure`. It then guards against destruction after its await, sends INIT with only the session ID, captures errors, and reports events; a rejection caused by teardown is not an initialization failure and is not logged. `reportInitFailure` sends a best-effort ERROR marked `initFailed`, with the error's code, whose rejection after teardown is ignored. Teardown posts a best-effort one-way TEARDOWN notice before destroying the messenger, because the consumer's calls wait without a timeout and calls not yet dispatched would never be answered. Browser focus is part of the focus integration, which waits briefly for this window to receive the consumer's frame focus before resolving, unless the consumer's acknowledgement reports that its page has no focus to pass on; a popup host resizes its own window before notifying the consumer, which cannot resize it across origins. Peer lookup sends only the caller's options, sequences a correlated response and recursive decoding through the separate peer-call bridge, so prop and export batches cannot retire relay wrappers.

- **O:** `HostTransport.emitInitFailure`, `HostTransport.isConsumerSource`, `exportMayBeStored`.
- **I:** `HostTransport.constructor`, `HostTransport.registerPropsHandler`, `HostTransport.requestBootstrap`, `HostTransport.close`, `HostTransport.focus`, `HostTransport.resize`, `HostTransport.show`, `HostTransport.hide`, `HostTransport.reportError`, `HostTransport.reportInitFailure`, `HostTransport.exportData`, `HostTransport.sendExportBatch`, `HostTransport.getPeerInstances`, `HostTransport.destroy`, `HostTransport.sendInit`, `HostTransport.sendMessage`.
- **M:** `HostTransport.sendInitOnce`.
- **O callbacks:** `HostTransport.reportInitFailure.callback@177`, `HostTransport.exportData.callback@184`, `HostTransport.sendExportBatch.callback@199`.
- **I callbacks:** `HostTransport.constructor.callback@57`, `HostTransport.constructor.callback@62`, `HostTransport.registerPropsHandler.callback@78`, `HostTransport.exportData.callback@181`.
- **Retained rationale —** `HostTransport.sendInitOnce`: The idempotent guard, flag transition and launch of sendInit are a short atomic adapter.

Evidence: [host](#evidence-host); typecheck.

### [core/host/types.ts](../packages/forgeframe/src/core/host/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [host](#evidence-host); typecheck.

### [core/index.ts](../packages/forgeframe/src/core/index.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [consumer](#evidence-consumer); typecheck.

### [drivers/react.ts](../packages/forgeframe/src/drivers/react.ts)

The wrapper imports React's own APIs; its type parameter is the component, its props come from `InputOf` of the component plus `ReactComponentProps<ExportsOf<C>>`, and its internal mount state uses the untyped `ComponentInstance`. `assertReactComponentArguments` reads the component's options from the registry once and applies the call-shape rules (no second argument, a ForgeFrame component, no reserved wrapper prop names, read through the shared `hasOwnDeclaredField` own-field rule as `create()` reads them, so an `undefined` entry counts as omitted), each a `VALIDATION` error; its tag names the wrapper. `splitWrapperProps` separates the wrapper's own props from the forwarded ones by the one reserved-name list (which also reserves React's `key`), the mount state comes from `createMountState`, and `containerElementProps` is the container's presentation policy (error or default layout, the caller's `style` winning). Hooks are unconditional and keep their order. Hook callbacks coordinate the lifecycle and queue helpers through the mount state ref. The container's ref is a callback created by `createContainerRef` and memoized per forwarded ref by `createContainerRefCache`, so a render React discards cannot replace a committed ref's callback, and React attaches and forwards the element during commit, before layout effects. The callback records the element and forwards it through the lifecycle module's `assignRef`, the one ref writer; a forwarded callback's React 19 cleanup replaces the `null` call on detach. The prop-sync effect's error observer drops a held update's `CLOSED` rejection while the render has not completed and the error carries the failed render's error as `cause` (`isHeldUpdateCancellation`).

- **O:** `splitWrapperProps`, `containerElementProps`, `createContainerRef`.
- **M:** `assertReactComponentArguments`, `createContainerRefCache`.
- **Retained rationale —** `createContainerRefCache`: the memo is the operation, and calling the `createContainerRef` factory is what it memoizes; its returned lookup callback is the same mix.
- **Retained rationale —** `assertReactComponentArguments`: It reads the registry's options once and applies three short call-shape rules to them; a separate lookup step would only pass the options through.
- **I:** `reportReactError`, `createReactComponent`, `createReactComponent.ForgeFrameComponent`, `createReactComponent.ForgeFrameComponent.callback@374.onError`.
- **O callbacks:** `createReactComponent.ForgeFrameComponent.callback@374.onRendered`, `createReactComponent.ForgeFrameComponent.callback@374.onClose`, `assertReactComponentArguments.callback@183`, `assertReactComponentArguments.callback@189`, `reportReactError.callback@284`, `createContainerRef.callback@268.callback@272`, `createReactComponent.ForgeFrameComponent.callback@367`.
- **M callbacks:** `createContainerRefCache.callback@244`.
- **I callbacks:** `createContainerRef.callback@268`, `createReactComponent.ForgeFrameComponent.callback@374`, `createReactComponent.ForgeFrameComponent.callback@395`, `createReactComponent.ForgeFrameComponent.callback@399`, `createReactComponent.ForgeFrameComponent.callback@399.callback@405`, `createReactComponent.ForgeFrameComponent.callback@399.callback@406`.

Evidence: [react](#evidence-react); typecheck.

### [drivers/react/lifecycle.ts](../packages/forgeframe/src/drivers/react/lifecycle.ts)

Creating the mount state, sync state and the instance handle, selecting the current identity, recognizing a held update's cancellation (a `CLOSED` error whose `cause` the core set to the failed render's error), and writing a ref are operations. `createInstanceHandle` builds the frozen `instanceRef` handle; its methods delegate to the instance and its `exports` getter reads it live. `publishHandle`, `unpublishHandle` and `retargetHandle` move the handle between the mount state and the `instanceRef` target; the ref write runs through `callReactCallback`, so a throwing callback ref is logged and render completion still calls `onRendered`, and close still calls `onClose`. `callReactCallback` runs a wrapper callback and logs a throw or a rejected promise, so lifecycle work continues. Mounting sequences construction, observer registration, render completion (publish the handle, then `onRendered`), and cleanup. Promise callbacks discard results for obsolete mounts before applying state; a render failure already reported on the `error` event is not reported again.

- **O:** `isHeldUpdateCancellation`, `createMountState`, `isCurrentSyncState`, `createPropSyncState`, `createInstanceHandle`, `createInstanceHandle.exports`, `assignRef`, `callReactCallback`, `callReactCallback.log`.
- **I:** `createInstanceHandle.close`, `createInstanceHandle.focus`, `createInstanceHandle.resize`, `createInstanceHandle.show`, `createInstanceHandle.hide`, `clearRef`, `mountReactInstance`.
- **M:** `publishHandle`, `unpublishHandle`, `retargetHandle`.
- **Retained rationale —** `publishHandle`, `unpublishHandle`: each makes one transition of the published-handle state and writes the target through `assignRef` or `clearRef`, isolated by `callReactCallback`; splitting would separate a field write from the ref write it records. `retargetHandle`: it sequences `unpublishHandle` and `publishHandle` around the one `target` field write they depend on.
- **O callbacks:** `mountReactInstance.callback@269.callback@271`.
- **I callbacks:** `publishHandle.callback@147`, `unpublishHandle.callback@161` (each calls `assignRef` or `clearRef` for `callReactCallback`; the first records the returned cleanup), `mountReactInstance.callback@249`, `mountReactInstance.callback@242`, `mountReactInstance.callback@255`, `mountReactInstance.callback@261`, `mountReactInstance.callback@269`. Their single state writes (`reported.add`, `syncState.rendered`, releasing `syncState`) record where the sequence is; the error callback's record lets the render rejection skip a second report.

Evidence: [react](#evidence-react); typecheck.

### [drivers/react/prop-sync.ts](../packages/forgeframe/src/drivers/react/prop-sync.ts)

Comparison, shallow snapshots, omission resets, and queue acknowledgement and failure transitions are explicit operations. Draining composes them around `updateProps` and checks identity at each await. There is no render gate: the core holds updates made during `render()`.

- **O:** `shallowEqualProps`, `deactivatePropSyncState`, `snapshotProps`, `buildPropUpdate`, `failPropUpdate`, `acknowledgePropUpdate`.
- **I:** `drainPropUpdates`.
- **O callbacks:** `snapshotProps.callback@75`.
- **M:** `enqueuePropSnapshot`.
- **Retained rationale —** `enqueuePropSnapshot`: Comparison chooses either one pending retry flag or an appended prepared payload. This short queue adapter keeps equivalent-commit behavior readable; comparison, reset construction and failure transitions are separate operations.

Evidence: [react](#evidence-react); typecheck.

### [errors.ts](../packages/forgeframe/src/errors.ts)

`ForgeFrameError` and the `ForgeFrameErrorCode` literal union. The constructor sets `name` and the read-only `code` and passes `cause` to `Error`. The wire helpers are the only place codes cross windows: `wireErrorCode` reads the code to send with an error response, `isForgeFrameErrorCode` admits only the eight known codes, and `errorFromWire` rebuilds a received error; a code this version does not know arrives as a plain `Error`, which is the documented 2.x policy for codes added in later minors. `hasErrorCode` is the one code check used by policy, such as the export-rejection and payload-capacity classifications. `errorFromWire` and the consumer transport's `readHostError` are both **O**: each chooses between two constructions of one received error.

- **O:** `ForgeFrameError.constructor`, `isForgeFrameErrorCode`, `wireErrorCode`, `hasErrorCode`, `errorFromWire`.

Evidence: [naming-and-errors.test](../packages/forgeframe/tests/integration/naming-and-errors.test.ts), [messaging](#evidence-messaging), [contract](#evidence-contract); typecheck.

### [events/emitter.ts](../packages/forgeframe/src/events/emitter.ts)

Each runtime keeps its emitter private; callers get the frozen `on`/`once` facade from `createEventSubscriber`, which rejects names outside the supplied set and non-function handlers before registering, so nobody outside the owning runtime can emit or remove other listeners. Listener storage keeps one registration token per handler and event, as DOM listeners do: registering a handler again keeps the first registration. Each returned unsubscribe function removes only the registration it created, so a stale handle cannot remove a newer registration of the same handler, and it also cancels a pending `once`. Emission runs each supplied observer in isolation, from a registration snapshot, in subscription order, and skips registrations removed before their turn. A `once` registration is removed immediately before its observer runs. New or replaced registrations wait for the next emission, so a rearmed `once` observer cannot loop within one dispatch. `dispose` clears every listener at the end of teardown and makes later registrations inert.

- **O:** `EventEmitter.register`, `EventEmitter.register.callback@84`, `EventEmitter.register.callback@94`, `EventEmitter.removeRegistration`, `EventEmitter.invokeHandler`, `EventEmitter.dispose`, `createEventSubscriber`, `createEventSubscriber.assertKnown`.
- **I:** `EventEmitter.on`, `EventEmitter.once`, `EventEmitter.emit`, `createEventSubscriber.on`, `createEventSubscriber.once`.
- **O callbacks:** `EventEmitter.invokeHandler.callback@159`.

Evidence: [consumer](#evidence-consumer), [component-events.test](../packages/forgeframe/tests/unit/component-events.test.ts), [host](#evidence-host); typecheck.

### [index.ts](../packages/forgeframe/src/index.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables. The `forgeframe` entrypoint has named exports only and no React exports.

Evidence: [contract](#evidence-contract); typecheck.

### [props/definition-checks.ts](../packages/forgeframe/src/props/definition-checks.ts)

Prop-definition admission is pure declaration policy over a supplied definitions record. `create()` and `initHost()` share it and call it before registering a factory or creating a host runtime. It rejects getter- or setter-defined entries without invoking them, because normalization reads the definitions again; it skips direct Standard Schemas and `undefined` entries and reads own property descriptors, so accessor-defined wrapped fields are not invoked; a data field set to `undefined` counts as omitted. `assertWrappedPropDefinition` rejects removed options (including `outputSchema`) with an error naming the replacement, then any other own field outside the delivery fields, so a misspelled option fails; a missing `schema`; a `deliverTo` that is neither `'same-origin'` nor a valid origin matcher (or mixes `'same-origin'` into an array); a non-boolean `sendToHost`; and a `queryParam` or `bodyParam` that is not a boolean or a non-empty name, or that is combined with `deliverTo: 'same-origin'`. `assertPropDefinitions` then records each prop's parameter names, which `readParameterName` (**O**) resolves (`true` is the prop key), and rejects two props sharing a query or body name. Fields are read through the shared own-field rule in `utils/own-field.ts`, which the reserved-name policy, `create()`'s removed component options and the React wrapper's reserved names use too. `component.test.ts`, `prop-definition-checks.test.ts`, and the handshake integration suite cover both entry points.

- **O:** `isDataField`, `readDeclaredField`, `assertWrappedPropDefinition`, `readParameterName`.
- **M:** `assertPropDefinitions`.
- **O callbacks:** `assertWrappedPropDefinition.callback@153`.
- **Retained rationale —** `assertPropDefinitions`: It walks the entries once, applying `assertWrappedPropDefinition` and recording each parameter name in the same pass; the clash rule needs every earlier entry, so a separate pass would read the definitions twice.

Evidence: [props](#evidence-props); typecheck.

### [props/definitions.ts](../packages/forgeframe/src/props/definitions.ts)

**Contract only:** the shared empty definitions map; no runtime callables. Instances have no built-in props: only declared props are normalized and sent.

Evidence: [props](#evidence-props); typecheck.

### [props/exports.ts](../packages/forgeframe/src/props/exports.ts)

The component's `exports` schema validates only, with the same unchanged-output rule as prop schemas. `validateExports` returns without a schema, and otherwise passes the shared `validateUnchanged` outcome to the shared `assertValidatesUnchanged` in `normalize.ts`, which throws `VALIDATION` with the schema's message for a rejection and the remove-the-transform message it is given for a changed value. The consumer and the host both call `validateExports`.

- **I:** `validateExports`.

Evidence: [consumer](#evidence-consumer), [host](#evidence-host), [props](#evidence-props); typecheck.

### [props/index.ts](../packages/forgeframe/src/props/index.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [props](#evidence-props); typecheck.

### [props/normalize.ts](../packages/forgeframe/src/props/normalize.ts)

Each defined prop's schema is the only source of its presence, default, and value: `normalizeProps` runs it on the supplied own value, including `undefined` for an omitted prop, and `assertSelfAccepting` turns a `validateUnchanged` outcome that is not `unchanged` into a definition-mistake error with the migrations. `validateUnchanged` is the one check every trust boundary shares: it runs the prop schema on a normalized value and reports `unchanged`, `changed`, or `rejected` with the schema's issues. `revalidatePropInputs` and `validateNormalizedProps` recheck supplied inputs and normalized outputs at trust boundaries, the latter through `validateUnchanged` and `assertValidatesUnchanged`, which keeps the schema's own issue for a rejection and reports a changed value as no longer matching; `buildUnnormalizedProps` builds the never-delivered snapshot kept after a construction-time failure; a schema or default that throws there leaves the prop `undefined`. Output equality is a cohesive cycle-aware algorithm.

`createDeliveryTarget` turns a host origin and the consumer's origin into a delivery target, so both sides agree on same-origin status and an opaque origin never counts. `isPropDelivered` is the pure delivery policy over a definition and that target; `getDeliveredPropDefinitions`, `getPropsForHost`, `validatePropsForHostTransport`, and the query/body integrations all use it. `propsToRequestParams` treats the unloaded host as not same-origin, so `deliverTo: 'same-origin'` props are never in the initial request; `serializePropParameter` encodes admitted values.

`getCompiledPropDefinitions` compiles only the supplied definitions and drops entries set to `undefined`, so undeclared inputs, including names of removed v1 lifecycle callbacks, are never normalized or sent. Its filter and map callbacks are **O**; unit tests cover omitted definitions, and public integration tests cover construction, bootstrap, updates, and close.

- **O:** `hasOwn`, `schemaOutputMatchesInput`, `getCompiledPropDefinitions`, `readSuppliedProp`, `isDeclaredProp`, `selectExpectedFields`, `assertSelfAccepting`, `assertValidatesUnchanged`, `createDeliveryTarget`, `isPropDelivered`.
- **I:** `normalizeProps`, `revalidatePropInputs`, `validateNormalizedProps`, `getDeliveredPropDefinitions`, `getPropsForHost`, `validatePropsForHostTransport`, `propsToQueryParams`, `propsToBodyParams`.
- **M:** `validateUnchanged`, `propsToRequestParams`, `serializePropParameter`, `buildUnnormalizedProps`.
- **O callbacks:** `getCompiledPropDefinitions.callback@140`, `getCompiledPropDefinitions.callback@139`, `getDeliveredPropDefinitions.callback@440`, `getDeliveredPropDefinitions.callback@439`, `selectExpectedFields.callback@181`.
- **Retained rationale —** `validateUnchanged`: It runs the schema and maps the result to one of three outcomes with a single comparison; the outcome is the shared contract every trust boundary reads, so the comparison stays with the run it describes.
- **Retained rationale —** `propsToRequestParams`: Parameter naming (`true` uses the key, a string names the parameter) is one expression inside the loop that applies delivery policy and encoding; it belongs to that loop.
- **Retained rationale —** `serializePropParameter`: It picks the encoding by value type and passes an object to the shared `stringifyForWire`, so an unencodable value is a coded `VALIDATION`; each branch is one expression.
- **Retained rationale —** `buildUnnormalizedProps`: It keeps each supplied input and asks the schema (`validateWithSchema` with `undefined`) for each missing one's default, treating a rejection as no value; the loop and the fallback are one pass over the compiled definitions.

Evidence: [props](#evidence-props); typecheck.

### [props/prop.ts](../packages/forgeframe/src/props/prop.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [props](#evidence-props); typecheck.

### [props/prop/base.ts](../packages/forgeframe/src/props/prop/base.ts)

Presence selection is separate from running default and nested validation. `copyDefaultValue` copies array, plain-object and `Date` defaults on each use, recursively, so instances never share a default; `assertNestedSchema` is the construction check every composite builder shares. Callable defaults require factories, including on widened optional and nullable builders; scalar defaults are plain values, and a default removes `undefined` from the output type unless the default can be `undefined`. Refinements are `SchemaCheck` lists: `addSchemaCheck` appends without replacing earlier checks of the same kind and keeps rank order, and `findFailedSchemaCheck` reports the first failure. Decomposition uses free functions so the exported classes keep their members, and the immutable fluent builders below are the deliberate exceptions. Invoking a runtime schema is one validation boundary operation.

- **O:** `copyDefaultEntry`, `assertNestedSchema`, `testRegExpStateless`, `validateSchemaSync`, `prependIssuePath`, `getValueKind`, `formatDateForMessage`, `defineDataProperty`, `validateDateBound`, `addSchemaCheck`, `findFailedSchemaCheck`, `selectSchemaPresence`, `PropSchema._copyBaseTo`.
- **I:** `validateSchemaPresence`, `PropSchema.validate`, `PropSchema._validateInput`.
- **M:** `copyDefaultValue`, `PropSchema.optional`, `PropSchema.nullable`, `PropSchema.default`, `PropSchema._getDefaultValue`.
- **O callbacks:** `addSchemaCheck.callback@115`, `findFailedSchemaCheck.callback@123`.
- **I callbacks:** `prependIssuePath.callback@47`, `PropSchema._validateInput.callback@326`, `PropSchema._validateInput.callback@327`.
- **Retained rationale —** `copyDefaultValue`: One primitive guard returns scalars before the `WeakMap` that tracks shared references is allocated; the copy itself is `copyDefaultEntry`, which defines object keys rather than assigning them, so an own `__proto__` key stays an own key.
- **Retained rationale —** `PropSchema._getDefaultValue`: One ternary picks a factory call or a copy of the literal default; the copy rule is `copyDefaultValue`, so the method only states which kind of default it holds.
- **Retained rationale —** `PropSchema.optional`, `PropSchema.nullable`, `PropSchema.default`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.

Evidence: [props](#evidence-props); typecheck.

### [props/prop/composite.ts](../packages/forgeframe/src/props/prop/composite.ts)

Outer shape and length constraints and strict-key selection are separate from nested schema traversal. Array length refinements accumulate as checks. Child validation reads own field values and passes omitted fields to presence and default handling as `undefined`. Issue-path accumulation and result assembly are cohesive algorithms. Exported classes keep their members and inference.

`ArraySchema.constructor`, `ObjectSchema.constructor`, `RecordSchema.constructor` and `TupleSchema.constructor` require their nested schemas (and the object its shape) and throw a `TypeError` that points to `prop.any()` otherwise, through the shared `assertNestedSchema` in `base.ts`. `TupleSchema.constructor` copies indexed positions without calling the caller's array iterator, and `ObjectSchema.constructor` copies own shape entries. Caller mutations cannot change these definitions or their presence clones.

- **O:** `ArraySchema.constructor`, `TupleSchema.constructor`, `ObjectSchema.constructor`, `RecordSchema.constructor`, `validateArrayItems`, `validateTupleItems`, `findUnknownObjectKey`, `validateObjectFields`, `validateRecordEntries`, `checkArrayConstraints`, `checkTupleConstraints`, `checkRecordInput`.
- **I:** `ArraySchema._validate`, `TupleSchema._validate`, `ObjectSchema._validate`, `RecordSchema._validate`.
- **M:** `ArraySchema._clone`, `ArraySchema._withCheck`, `ArraySchema.min`, `ArraySchema.max`, `ArraySchema.nonempty`, `TupleSchema._clone`, `ObjectSchema._clone`, `ObjectSchema.strict`, `RecordSchema._clone`.
- **O callbacks:** `ArraySchema.min.test`, `ArraySchema.max.test`, `findUnknownObjectKey.callback@388`.
- **Retained rationale —** `ArraySchema._clone`, `ArraySchema._withCheck`, `ArraySchema.min`, `ArraySchema.max`, `ArraySchema.nonempty`, `TupleSchema._clone`, `ObjectSchema._clone`, `ObjectSchema.strict`, `RecordSchema._clone`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.

Evidence: [props](#evidence-props); typecheck.

### [props/prop/factory.ts](../packages/forgeframe/src/props/prop/factory.ts)

Scalar, composite, and literal schema factories are construction operations with typed inference and no workflow state.

- **O:** `string`, `number`, `date`, `boolean`, `function`, `array`, `tuple`, `object`, `record`, `literal`, `enum`, `union`, `any`.

Evidence: [props](#evidence-props); typecheck.

### [props/prop/literals.ts](../packages/forgeframe/src/props/prop/literals.ts)

Literal and enum constraint checks and ordered union probing are cohesive validation operations. Union presence uses the shared selector with a union-specific `null`/`undefined` policy.

`EnumSchema.constructor` and `UnionSchema.constructor` each copy indexed positions (the union rejects a missing branch schema) from the supplied array without calling its iterator, and the enum then builds its membership set. Clones and diagnostics are therefore unaffected by later caller mutation. Each constructor is one construction operation.

`formatRejectedValue` formats primitives, or a type label for other values, without JSON serialization, so rejected cyclic objects, `BigInt`s, and custom encoders cannot abort later union branches.

- **O:** `formatRejectedValue`, `LiteralSchema.constructor`, `LiteralSchema._validate`, `EnumSchema.constructor`, `EnumSchema._validate`, `UnionSchema.constructor`, `UnionSchema._validate`.
- **I:** `UnionSchema._validateInput`.
- **M:** `LiteralSchema._clone`, `EnumSchema._clone`, `UnionSchema._clone`.
- **O callbacks:** `EnumSchema._validate.callback@101`.
- **I callbacks:** `UnionSchema._validateInput.callback@171`, `UnionSchema._validateInput.callback@172`.
- **Retained rationale —** `LiteralSchema._clone`, `EnumSchema._clone`, `UnionSchema._clone`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.

Evidence: [props](#evidence-props); typecheck.

### [props/prop/primitives.ts](../packages/forgeframe/src/props/prop/primitives.ts)

Scalar validation is cohesive: string trimming and constraints, number bounds and integer checks, and `Date` bounds are algorithms, not workflows. Each refinement adds a check instead of overwriting a shared slot, so `.email().pattern()` and `.min(10).positive()` apply both rules. String checks run lengths, then URL syntax, then patterns; number checks run integer, then lower, then upper bounds. Messages name the failed rule, such as `Expected number, got NaN` and `Number must be > 0`. Builder exceptions keep clone/set/return local. Callback default validation sequences one factory evaluation and the result's validation, keeping optional/nullable presence without invoking the returned callback.

Number validation rejects nonfinite values before JSON transport can turn them into `null`. `isHttpUrl` parses absolute HTTP(S) URL syntax. String clones carry this constraint independently of regex patterns, and validation returns the input unchanged.

- **O:** `isHttpUrl`, `StringSchema._validate`, `NumberSchema._validate`, `DateSchema._validate`, `BooleanSchema._validate`, `FunctionSchema._validate`, `AnySchema.constructor`, `AnySchema._validate`.
- **M:** `StringSchema._clone`, `StringSchema._withCheck`, `StringSchema.min`, `StringSchema.max`, `StringSchema.length`, `StringSchema.pattern`, `StringSchema.email`, `StringSchema.url`, `StringSchema.uuid`, `StringSchema.trim`, `StringSchema.nonempty`, `NumberSchema._clone`, `NumberSchema._withCheck`, `NumberSchema.min`, `NumberSchema.max`, `NumberSchema.int`, `NumberSchema.positive`, `NumberSchema.nonnegative`, `NumberSchema.negative`, `DateSchema._clone`, `DateSchema._withCheck`, `DateSchema.min`, `DateSchema.max`, `BooleanSchema._clone`, `FunctionSchema._clone`, `AnySchema._clone`, `FunctionSchema._validateInput`.
- **O callbacks:** `StringSchema.min.test`, `StringSchema.max.test`, `StringSchema.pattern.test`, `NumberSchema.min.test`, `NumberSchema.max.test`, `NumberSchema.positive.test`, `NumberSchema.negative.test`, `DateSchema.min.test`, `DateSchema.max.test`.
- **Retained rationale —** `StringSchema._clone`, `StringSchema._withCheck`, `StringSchema.min`, `StringSchema.max`, `StringSchema.length`, `StringSchema.pattern`, `StringSchema.email`, `StringSchema.url`, `StringSchema.uuid`, `StringSchema.trim`, `StringSchema.nonempty`, `NumberSchema._clone`, `NumberSchema._withCheck`, `NumberSchema.min`, `NumberSchema.max`, `NumberSchema.int`, `NumberSchema.positive`, `NumberSchema.nonnegative`, `NumberSchema.negative`, `DateSchema._clone`, `DateSchema._withCheck`, `DateSchema.min`, `DateSchema.max`, `BooleanSchema._clone`, `FunctionSchema._clone`, `AnySchema._clone`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.
- **Retained rationale —** `FunctionSchema._validateInput`: A function default is a factory, so for `undefined` input it evaluates the default and validates its result, accepting a `null` or `undefined` fallback the schema allows; other input goes to the base rule. The presence choice is two guards around the shared `_getDefaultValue` and `_validate`.

Evidence: [props](#evidence-props); typecheck.

### [props/schema.ts](../packages/forgeframe/src/props/schema.ts)

Standard Schema detection (including callable schemas such as ArkType types), issue-path formatting, and invoking a supplied schema (`runSchema`, which reports issues instead of throwing) are validation boundary operations. `validateWithSchema` runs `runSchema` and throws its issues as one "Validation failed" error. `isAsyncSchemaResult` observes unsupported promises across realms without awaiting validation, so direct and nested validation and the normalization default and output probes cannot leak rejected results. Its catch callback discards the refused result; callers see the synchronous error.

- **O:** `isStandardSchema`, `isAsyncSchemaResult`, `runSchema`, `formatIssuePath`.
- **M:** `validateWithSchema`.
- **O callbacks:** `runSchema.callback@289`, `formatIssuePath.callback@327`.
- **Retained rationale —** `validateWithSchema`: It runs `runSchema` and turns its issues into the thrown "Validation failed" error with one branch, the same shape as `validateUnchanged`; the throw belongs to the run it reports.

Evidence: [props](#evidence-props); typecheck.

### [props/serialize.ts](../packages/forgeframe/src/props/serialize.ts)

Prop snapshots use the recursive bridge codec directly, so prop definitions do not affect encoding or decoding. `serializeProps` skips `undefined` values and props whose root `toJSON()` returns `undefined`. `deserializeProps` drops unsafe root keys with the bridge's `isSafeObjectKey` and decodes each value through the bridge, which reconstructs callbacks and `Date` values together inside the transport-owned batch. Decoding needs only the bridge and the consumer window and origin.

- **O:** `deserializeProps`.
- **M:** `serializeProps`.
- **Retained rationale —** `serializeProps`: It skips `undefined` values and encodes each other value through the bridge in one pass; the skip is one guard per key.

Evidence: [utilities](#evidence-utilities); typecheck.

### [props/types.ts](../packages/forgeframe/src/props/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [props](#evidence-props); typecheck.

### [react.ts](../packages/forgeframe/src/react.ts)

**Contract only:** re-exports. The `forgeframe/react` entrypoint exports `createReactComponent` and the types `ReactComponentOf`, `ReactComponentProps` and `ReactInstance`; it is built with the root entry in one library build, so both share one core.

Evidence: [react](#evidence-react), [contract](#evidence-contract); typecheck.

### [render/iframe-configuration.ts](../packages/forgeframe/src/render/iframe-configuration.ts)

CSS key/value encoding, boolean HTML-attribute representation, attribute-name policy and the sandbox decision use only supplied data. Custom property names keep their case, unitless numeric styles stay numbers, and other numeric values become pixels. `assertIframeAttributeNames` folds names as HTML does (a non-object, such as an `attributes` function before it runs, has none to check): `name`, `src` and `srcdoc` are managed by ForgeFrame, and `sandbox` must use the component option; `create()` checks static `attributes`, and the element factory checks computed ones before an element exists. `assertSandboxOption` accepts omission, `false`, or a token string that contains `allow-scripts` and `allow-same-origin` (ASCII-whitespace split, case-insensitive). `resolveIframeSandbox` maps the option to the default tokens, the given string, or `null` for no attribute.

- **O:** `encodeIframeStyle`, `encodeIframeAttribute`, `assertIframeAttributeNames`, `assertSandboxOption`, `resolveIframeSandbox`.

Evidence: [render](#evidence-render), [iframe-configuration.test](../packages/forgeframe/tests/unit/iframe-configuration.test.ts); typecheck.

### [render/iframe.ts](../packages/forgeframe/src/render/iframe.ts)

Attribute names are checked before element creation. Dimensions use the shared `applyDimensions` from `render/templates.ts`. Style and attribute decisions use supplied data; applying them keeps write order. The element factory writes the sandbox it is given, as `resolveIframeSandbox` decided it, or none for `null`; it makes no sandbox decision itself.

- **O:** `destroyIframe`, `showIframe`, `hideIframe`, `focusIframe`, `applySandbox`.
- **I:** `createIframeElement`, `resizeIframe`, `applyStyles`, `applyAttributes`.

Evidence: [render](#evidence-render); typecheck.

### [render/popup-layout.ts](../packages/forgeframe/src/render/popup-layout.ts)

Geometry, window features, and capped polling-delay growth use explicit screen and dimension data.

- **O:** `buildPopupFeatures`, `nextPopupPollInterval`.

Evidence: [render](#evidence-render), [popup-layout.test](../packages/forgeframe/tests/unit/popup-layout.test.ts); typecheck.

### [render/popup.ts](../packages/forgeframe/src/render/popup.ts)

Opening coordinates geometry with the browser action; a `null` window and the module-private `isPopupBlocked` heuristics both make it throw a `POPUP_BLOCKED` `ForgeFrameError`, and a window that only looked blocked is closed first, so it is never left open and untracked. `resizePopup` reports `false` when the browser denies access to another origin's window. Polling is one timer resource with a supplied `onClose` callback; its cancellation closure only clears the owned timer.

- **O:** `closePopup`, `focusPopup`, `isPopupBlocked`, `watchPopupClose`, `watchPopupClose.invokeCallback`, `watchPopupClose.check`, `resizePopup`.
- **I:** `openPopup`.
- **O callbacks:** `watchPopupClose.callback@267`.

Evidence: [render](#evidence-render); typecheck.

### [render/templates.ts](../packages/forgeframe/src/render/templates.ts)

DOM creation, style insertion, fade scheduling, and dimension writes are cohesive browser operations. Swap coordinates the module-private fade operations and checks the caller's visibility request after the loading content fades.

- **O:** `ensureSpinnerKeyframes`, `defaultContainerTemplate`, `defaultPrerenderTemplate`, `fadeIn`, `fadeOut`.
- **I:** `swapPrerenderContent`.
- **M:** `applyDimensions`.
- **O callbacks:** `fadeIn.callback@211`, `fadeOut.callback@250`.
- **Retained rationale —** `applyDimensions`: Keep the two dimension guards beside their style writes; the shared dimension conversion is already isolated.

Evidence: [render](#evidence-render); typecheck.

### [types.ts](../packages/forgeframe/src/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [contract](#evidence-contract); typecheck.

### [types/events.ts](../packages/forgeframe/src/types/events.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [contract](#evidence-contract); typecheck.

### [types/props.ts](../packages/forgeframe/src/types/props.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables. The public definition types are `PropsDefinition`, `PropDefinition`, `InferProps` and `InferPropsInput`.

Evidence: [contract](#evidence-contract); typecheck.

### [types/runtime.ts](../packages/forgeframe/src/types/runtime.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables. `Component`, `ComponentInstance`, the `PropsOf`/`InputOf`/`ExportsOf`/`HostPropsOf` helpers, and the inference-only option types that `create()` checks entries and the `exports` schema with.

Evidence: [contract](#evidence-contract); typecheck.

### [types/templates.ts](../packages/forgeframe/src/types/templates.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [contract](#evidence-contract); typecheck.

### [types/utility.ts](../packages/forgeframe/src/types/utility.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [contract](#evidence-contract); typecheck.

### [utils/browser.ts](../packages/forgeframe/src/utils/browser.ts)

One environment observation checks for a browser window.

- **O:** `hasBrowserWindow`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [utils/cleanup.ts](../packages/forgeframe/src/utils/cleanup.ts)

Taking the LIFO task batch marks cleanup as claimed before any callback runs. Cleanup then runs the detached tasks; registration and unregistration are state operations.

- **O:** `CleanupManager.register`, `CleanupManager.takeCleanupTasks`.
- **I:** `CleanupManager.cleanup`.
- **O callbacks:** `CleanupManager.register.callback@70`, `CleanupManager.register.callback@71`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [utils/dimension.ts](../packages/forgeframe/src/utils/dimension.ts)

Numeric dimension normalization uses supplied values and an explicit fallback; CSS normalization maps an omitted value to `100%`. Popup conversion accepts finite numbers and complete numeric or `px` strings, truncating string fractions; other units use the supplied fallback. CSS conversion passes iframe units through.

- **O:** `normalizeDimensionToCSS`, `normalizeDimensionToNumber`.

Evidence: [utilities](#evidence-utilities), [dimension.test](../packages/forgeframe/tests/unit/dimension.test.ts), [popup.test](../packages/forgeframe/tests/unit/popup.test.ts); typecheck.

### [utils/json.ts](../packages/forgeframe/src/utils/json.ts)

`stringifyForWire` is the one JSON encoder for values that cross windows: the message envelope, primitive unboxing and URL or body parameters. A value JSON cannot encode, such as a `BigInt` or a cycle, makes the encoder throw a `TypeError`, which becomes a `VALIDATION` `ForgeFrameError` with that `TypeError` as `cause`; any other error, such as one a caller's own `toJSON()` throws, passes through unchanged.

- **O:** `stringifyForWire`.

Evidence: [utilities](#evidence-utilities), [messaging](#evidence-messaging); typecheck.

### [utils/origin-pattern.ts](../packages/forgeframe/src/utils/origin-pattern.ts)

Wildcard compilation and stateless regex testing are cohesive algorithms. Keep the compile cache and the `lastIndex` protection. `'*'` compiles to any origin; the only other wildcard is `scheme://*.rest` (`LEADING_LABEL_WILDCARD`), where `*` stands for one or more leading host labels with the scheme and port fixed; any other wildcard compiles to a pattern that matches nothing. `assertOriginMatcher` rejects configured matchers that would silently disable or widen an origin policy: values other than non-empty strings, `RegExp`s, or arrays of them, strings without a scheme (`isBareHostPattern`), such as `example.com`, `*.example.com` or `"true"`, a pattern with a path, query or fragment (`hasPathOrQuery`), such as `https://app.example.com/`, which can never equal an origin, an exact origin in a form browsers never report (`isNonCanonicalOrigin`, which compares it with `readOrigin`, the `URL` parser's origin), such as `https://Shop.example.com` or `https://example.com:443`, and a misplaced wildcard (`isMisplacedWildcard`), such as `https://*example.com`. An empty array matches nothing, so it is rejected unless the caller passes `"allowed"`, which only the `consumerOrigins` allowlist does, to fail closed.

- **O:** `escapeRegExp`, `compileWildcardOriginPattern`, `testOriginRegExpStateless`, `assertOriginMatcher`, `assertOriginMatcher.isPattern`, `isBareHostPattern`, `hasPathOrQuery`, `isNonCanonicalOrigin`, `readOrigin`, `isMisplacedWildcard`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [utils/own-field.ts](../packages/forgeframe/src/utils/own-field.ts)

The own-field rule for declarations: only own fields count, the descriptor is read so an accessor is never invoked (and counts as set), and a data field set to `undefined` counts as omitted. It has no imports, so the `forgeframe/react` entry shares it without pulling the definition checks into its chunk.

- **O:** `hasOwnDeclaredField`.

Evidence: [props](#evidence-props), [react](#evidence-react); typecheck.

### [utils/error.ts](../packages/forgeframe/src/utils/error.ts)

Unknown-error conversion keeps `Error` identity and ordinary coercion, with a stable fallback when coercion throws; a converted value is kept as the new error's `cause`. It owns no runtime state and reads no browser state.

- **O:** `normalizeError`.

Evidence: [error.test](../packages/forgeframe/tests/unit/error.test.ts), [messaging](#evidence-messaging); typecheck.

### [utils/origin.ts](../packages/forgeframe/src/utils/origin.ts)

Origins are serialized strings: the JavaScript `null` means no origin is known yet, and the string `"null"` is the serialization every opaque origin shares. `isOpaqueOrigin` is the one check for the second meaning; messenger trust and peer selection use it so `"null"` never identifies a peer.

- **O:** `isOpaqueOrigin`.

Evidence: [messaging](#evidence-messaging), [consumer](#evidence-consumer); typecheck.

### [utils/promise.ts](../packages/forgeframe/src/utils/promise.ts)

Deferred creation and timeout wrapping are cohesive platform operations. Executor, timer, and completion callbacks claim resolver references or settle the owned promise; there is no domain workflow.

- **O:** `createDeferred`, `promiseTimeout`.
- **O callbacks:** `createDeferred.callback@48`, `promiseTimeout.callback@92`, `promiseTimeout.callback@92.callback@93`, `promiseTimeout.callback@92.callback@98`, `promiseTimeout.callback@92.callback@102`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [utils/realm-values.ts](../packages/forgeframe/src/utils/realm-values.ts)

`Date` detection uses the intrinsic `Date` brand across realms. Ordinary-record detection compares native constructor and prototype evidence, accepting null-prototype records and rejecting class instances. Schemas, output comparison, and codecs share these supplied-value operations.

- **O:** `isDate`, `isPlainObject`.

Evidence: [realm-values.test](../packages/forgeframe/tests/unit/realm-values.test.ts), [props](#evidence-props), [cross-realm-props.test](../packages/forgeframe/tests/integration/cross-realm-props.test.ts), browser `navigation.spec.ts`; typecheck.

### [utils/uid.ts](../packages/forgeframe/src/utils/uid.ts)

Random ID creation is one platform operation. Keep the ID length and wire-visible shape.

- **O:** `generateUID`, `generateShortUID`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [utils/url.ts](../packages/forgeframe/src/utils/url.ts)

HTTP(S), credential, and origin URL validation is one cohesive supplied-data operation and reads no browser globals; browser integrations supply `document.baseURI` and pin the validated absolute URL before lifecycle callbacks. Query suffixes are inserted before the first fragment delimiter without changing existing query bytes.

- **O:** `resolveComponentHostUrl`, `appendComponentQuery`.

Evidence: [utilities](#evidence-utilities), [url.test](../packages/forgeframe/tests/unit/url.test.ts), [consumer-navigation.test](../packages/forgeframe/tests/unit/consumer-navigation.test.ts); typecheck.

### [utils/wire-value.ts](../packages/forgeframe/src/utils/wire-value.ts)

`Date` framing, record escaping, and array admission are codec operations; keep malformed-`Date` handling together. Escaping applies to ordinary records shaped like function, `Date`, or escaped-record markers once their fields are encoded; other records, including the former BASE64 and DOTIFY wrapper shapes, are ordinary data. Encoded records keep native raw JSON unchanged, so `toWrittenJsonValue` reads a marker field as the receiver will parse it, and a raw JSON `"function"`, `"date"` or `"record"` marker is escaped like the plain string.

`toJsonValue` applies one native JSON conversion (a callable `toJSON(key)`, then unboxing) for the bridge. `unboxJsonPrimitive` unboxes primitive wrappers with a local dummy encoder and an empty native JSON property list, avoiding exception-driven probes of ordinary records. It reuses the conversion so coercion hooks run once, and reads no ordinary fields, branding getters, or proxy prototype metadata. Arrays returned by `toJSON()` bypass the probe, so their entries are still bridged. `isRawJsonValue` detects native raw JSON with `JSON.isRawJSON`, resolved once at module load when the runtime has it, including values from another realm, so the bridge can pass it through.

`assertDefinedArrayEntries` checks normalized container values with cycle-safe traversal and without calling custom JSON encoders. It mirrors the bridge: arrays are read entry by entry, `convertsThroughJsonEncoder` defers a non-array object with a callable `toJSON` to delivery checks after its encoder runs, and `__proto__` fields are skipped because encoding omits them. `assertDefinedArrayEntry` also guards bridge arrays, including holes, before JSON can turn entries into `null`. `hasJsonEncoder` inspects descriptors without invoking computed properties, and a non-callable `toJSON` field is ordinary data.

- **O:** `needsRecordEscape`, `toWrittenJsonValue`, `escapeWireRecord`, `isRecordWireValue`, `assertDefinedArrayEntry`, `assertDefinedArrayEntries`, `convertsThroughJsonEncoder`, `hasJsonEncoder`, `isObjectRecord`, `hasOwnKey`, `encodeDateWireValue`, `isDateWireValue`, `decodeDateWireValue`, `isRawJsonValue`, `toJsonValue`.
- **M:** `unboxJsonPrimitive`.
- **Retained rationale —** `unboxJsonPrimitive`: It runs the shared `stringifyForWire` once, so an unencodable boxed `BigInt` is a coded `VALIDATION`, and parses its result only when the encoder unboxed something; the array guard and that one comparison stay with the call they qualify.
- **O callbacks:** `needsRecordEscape.callback@22`, `unboxJsonPrimitive.toJSON`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [window/helpers.ts](../packages/forgeframe/src/window/helpers.ts)

Browser observations and defensive window reads are operations. Recursive origin matching is a cohesive algorithm; security exceptions are part of the browser boundary.

- **O:** `getOrigin`, `matchOrigin`, `isWindowClosed`, `getOpener`, `getConsumer`, `isIframe`, `isPopup`, `waitForWindowFocus`.
- **O callbacks:** `matchOrigin.callback@87`, `waitForWindowFocus.callback@259`, `waitForWindowFocus.callback@259.done`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [window/name-payload.ts](../packages/forgeframe/src/window/name-payload.ts)

Envelope framing is separate from protocol classification. `classifyWindowNamePayload` is pure policy over a decoded value: current protocol 3 metadata (copied without unknown fields), a payload from another protocol with its protocol and package version, or invalid. An older payload is recognised only when it carries the channel fields every older consumer wrote (uid, tag, context, consumer origin); a newer one needs only its tag. Reading never writes `window.name`; a name that throws or lacks the prefix yields null, and an undecodable or oversized one is invalid.

- **O:** `isObjectRecord`, `isNonEmptyString`, `isContext`, `classifyWindowNamePayload`, `encodePayload`, `decodePayload`, `createWindowPayload`.
- **M:** `buildWindowName`, `readWindowNamePayload`, `isForgeFrameWindow`.
- **Retained rationale —** `buildWindowName`: It prefixes the result of `encodePayload`; the prefix is the only rule, one template literal.
- **Retained rationale —** `readWindowNamePayload`: It reads `window.name` defensively and checks the prefix before handing the rest to `decodePayload` and `classifyWindowNamePayload`; both guards protect the reads it makes.
- **Retained rationale —** `isForgeFrameWindow`: It turns `readWindowNamePayload`'s classification into a boolean with one comparison.

Evidence: [utilities](#evidence-utilities); typecheck.

### [window/types.ts](../packages/forgeframe/src/window/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [utilities](#evidence-utilities); typecheck.

## Playground classifications

The playground applications live in `packages/playground` and are outside the library.

### Diagnostic playground text rendering

`host/main.ts` keeps static layout insertion and event binding together as a rendering integration. Its **Request Close** handler uses the built-in host control, so copied examples close without a custom lifecycle callback. In the consumer config, the `getComponentDimensions` operation selects popup pixel dimensions for both live rendering and code generation; embedded iframe dimensions keep their configured units. The local `renderPropsGrid` is a cohesive DOM construction operation that sets labels, values, and IDs through `textContent` and properties; identity text is filled in after the static layout. `consumer/logger.ts` keeps `log` as one append-and-scroll DOM operation with timestamp and message spans. There is no shared escaping abstraction or public API.

`generateCode` and its custom-prop filter are **O** code-construction operations. The playground-owned `onGreet` and `onClose` entries use optional function validation and callback values, and replace conflicting custom entries in both generated object literals. `onGreet` has a generated schema; `onClose` uses the built-in consumer-only definition and its delivery policy. Unit tests execute iframe, modal, and popup examples with editor-supported string, number, and boolean definitions through real prop normalization and validation.

The prop editor's admission guard is an **O** name policy inside its DOM event integration. It checks the library's canonical host-control key set and unsafe object keys, rejecting invalid names before any config or value changes. Valid additions notify and refresh the editor.

Evidence: [playground-code-generator.test](../packages/forgeframe/tests/unit/playground-code-generator.test.ts), [playground-props-bar.test](../packages/forgeframe/tests/unit/playground-props-bar.test.ts), [playground-text-rendering.test](../packages/forgeframe/tests/unit/playground-text-rendering.test.ts), [playground-text.spec](../packages/forgeframe/tests/browser/playground-text.spec.ts); playground typecheck and build.

### Company payment journey

- **O:** `seedInvoices`, `invoiceTotal`, and `formatMoney` build fresh samples, sum supplied line items, and format amounts. [acceptance.ts](../packages/playground/consumer/company-demo/acceptance.ts) owns `commitPaymentResult`: it checks session identity, cancellation, and duplicate receipts, parses the unknown callback data, and matches the invoice and merchant-supplied amount before changing only the captured invoice and returning the acknowledgement and outcome. Its local `readPaymentResult`, `isRecord`, and `isIsoTimestamp` operations validate the discriminator and every receipt field, including real calendar and time values, and build a merchant-owned receipt snapshot. A rejection leaves the invoice unpaid and retryable. `paymentControls` selects availability and the next unpaid sample. These operations use supplied data and type-only domain imports, with no browser or ForgeFrame runtime dependency.
- **O:** [simulation.ts](../packages/playground/payment/simulation.ts) owns `shouldDeclineAttempt`, `normalizeDemoCardNumber`, `approvedPaymentResult`, and `assertPaymentAcknowledged`, which decide from supplied data; receipt construction receives the time, transaction ID, and last four digits explicitly. Acknowledgement admission treats the callback return as unknown and requires the expected `recorded` or `declined` status and the submitted invoice ID before approval and close, or before decline feedback. The provider's `collectReceiptEvidence` is a cohesive browser observation adapter for randomness, clock, and masked digits, kept outside the rules. DOM operations such as `appendEvent`, `updatePaymentControls`, and the provider's `beginProcessing`, `finishProcessing`, and `showFeedback` keep their local state and element updates together.
- **I:** Consumer `acceptResult` sequences the invoice total, acceptance and commit, phase update, callback observation, and decline or approval presentation. `reportApproval` sequences amount formatting, logging, the notice, and rendering. `logEvent` appends an event and refreshes the technical view. `render` integrates availability, control updates, invoice presentation, and observations. `openPayment`, `cancelPayment`, `selectInvoice`, and reset order instance lifetime, cancellation, cleanup, and focus with the merchant integration.
- **I:** Provider `processPayment` sequences processing presentation, the local delay, cancellation admission, attempt advance, the outcome rule, the remote decline or approval, recovery feedback, and control restoration. `reportApproval` composes supplied receipt evidence, result construction, the remote callback, validation of the `recorded` acknowledgement against the submitted invoice, and close. `reportDecline` captures its result, awaits the callback, and validates the decline acknowledgement before showing retry guidance. `validateCardForm` combines the card-number operation with native form validity. `start` keeps the order of trusted initialization, readiness, show, and focus. `renderForm`, `renderShell`, and `renderInvoices` are cohesive presentation integrations: authored markup, text-only dynamic values, and event wiring stay together instead of being split into a wrapper per platform call.

Technical observation and source renderers are display operations with no payment policy. `loadTechnicalSources` integrates cached imports of the consumer, host, contract, merchant acceptance, and provider simulation files. A failed import needs a page refresh, as the recovery guidance explains; switching views keeps payments usable. The acknowledgement step and source jump point at the real acceptance operation. `setView`, `focusRegion`, and `initTechnicalView` sequence presentation, focus, and navigation without replacing the running application.

Evidence: [company-demo-payment-contract.test](../packages/forgeframe/tests/integration/company-demo-payment-contract.test.ts) runs the shared amount schema through public consumer render admission and real host initialization and updates, rejecting negative, fractional, and unsafe cents while keeping valid state and retry. [company-demo-payment-policy.test](../packages/forgeframe/tests/unit/company-demo-payment-policy.test.ts) exercises acceptance, rejection and receipt preservation, session identity, merchant amount, availability, configured decline and retry, supplied receipt observations, card normalization, and acknowledgement admission without a mounted application or transport mocks. [company-demo.spec](../packages/forgeframe/tests/browser/company-demo.spec.ts) runs real separate-origin iframe and popup journeys in all three engines: cancellation during processing, receipt isolation, reset, sources and observations, mobile focus and layout, and rejection of malformed, wrong-status, and wrong-invoice acknowledgements for both outcomes while the provider stays open for recovery. It also checks that the rule files and the receipt-commit excerpt are visible in Technical. The playground typecheck and build and the full unit and integration suite add boundary evidence.
