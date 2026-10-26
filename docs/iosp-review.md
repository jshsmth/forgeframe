---
name: iosp-review
title: ForgeFrame callable reference
desc: Runtime callable responsibilities, IOSP classifications, and boundary test evidence.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-10-26T02:56:13Z
---

# ForgeFrame callable reference

Runtime callables in `packages/forgeframe/src`, their IOSP classification, and the tests that exercise their boundaries. Use [architecture](architecture.md) to follow a workflow. Use this page when changing an individual callable: update its classification and run its evidence suites.

Type-only declarations, overload signatures, and abstract methods have no runtime body and are not listed; modules without runtime callables are marked **Contract only**. Repeated accessors and fluent builders share one rationale.

`callback@N` names an anonymous closure that starts on source line N inside its enclosing callable; named property arrows use their enclosing name. Refresh these line numbers whenever an edit shifts them.

- **O — operation:** one cohesive rule, transformation, state transition, supplied-callback boundary, or platform action. Recursive codecs, traversals, and validation algorithms may use local helpers and still count as operations.
- **I — integration:** sequences package behavior. Branches that select the next action, current-instance and cancellation guards, and passed-through values count as control flow.
- **M — mixed helper, kept deliberately:** a small helper that mixes both, listed with its locality or readability rationale. Splitting it would only move a few statements into a wrapper.

Pure policy consumes observed facts; integrations and adapters obtain browser evidence. State stays with the runtime that owns it.

## Boundary tests

| Evidence group | Suites |
| --- | --- |
| <a id="evidence-props"></a>props | [props.test](../packages/forgeframe/tests/unit/props.test.ts), [prop-schema.test](../packages/forgeframe/tests/unit/prop-schema.test.ts), [schema.test](../packages/forgeframe/tests/unit/schema.test.ts), [schema-contract.test](../packages/forgeframe/tests/unit/schema-contract.test.ts), [schema-interoperability.test](../packages/forgeframe/tests/unit/schema-interoperability.test.ts), [schema-path-format.test](../packages/forgeframe/tests/unit/schema-path-format.test.ts), [props-sync.test](../packages/forgeframe/tests/integration/props-sync.test.ts), [prop-definition-checks.test](../packages/forgeframe/tests/unit/prop-definition-checks.test.ts), [schema-self-acceptance.test](../packages/forgeframe/tests/integration/schema-self-acceptance.test.ts) |
| <a id="evidence-messaging"></a>messaging | [bridge.test](../packages/forgeframe/tests/unit/bridge.test.ts), [messenger.test](../packages/forgeframe/tests/unit/messenger.test.ts), [messenger-routing.test](../packages/forgeframe/tests/unit/messenger-routing.test.ts), [protocol.test](../packages/forgeframe/tests/unit/protocol.test.ts), [function-prop-bridge.test](../packages/forgeframe/tests/integration/function-prop-bridge.test.ts), [host-controls-routing.test](../packages/forgeframe/tests/integration/host-controls-routing.test.ts) |
| <a id="evidence-render"></a>render | [consumer-renderer.test](../packages/forgeframe/tests/unit/consumer-renderer.test.ts), [iframe.test](../packages/forgeframe/tests/unit/iframe.test.ts), [popup.test](../packages/forgeframe/tests/unit/popup.test.ts), [render-templates.test](../packages/forgeframe/tests/unit/render-templates.test.ts), [body-param-bootstrap.test](../packages/forgeframe/tests/integration/body-param-bootstrap.test.ts), [popup-host-handshake.test](../packages/forgeframe/tests/integration/popup-host-handshake.test.ts) |
| <a id="evidence-consumer"></a>consumer | [component.test](../packages/forgeframe/tests/unit/component.test.ts), [component-instance-index.test](../packages/forgeframe/tests/unit/component-instance-index.test.ts), [consumer-lifecycle.test](../packages/forgeframe/tests/unit/consumer-lifecycle.test.ts), [consumer-branch-coverage.test](../packages/forgeframe/tests/unit/consumer-branch-coverage.test.ts), [consumer-transport.test](../packages/forgeframe/tests/unit/consumer-transport.test.ts), [component-events.test](../packages/forgeframe/tests/unit/component-events.test.ts), [lifecycle-events.test](../packages/forgeframe/tests/integration/lifecycle-events.test.ts), [consumer-host-handshake.test](../packages/forgeframe/tests/integration/consumer-host-handshake.test.ts), [host-controls-routing.test](../packages/forgeframe/tests/integration/host-controls-routing.test.ts), [instance-tracking.test](../packages/forgeframe/tests/integration/instance-tracking.test.ts) |
| <a id="evidence-host"></a>host | [host-security.test](../packages/forgeframe/tests/unit/host-security.test.ts), [host-lifecycle.test](../packages/forgeframe/tests/unit/host-lifecycle.test.ts), [host-branch-coverage.test](../packages/forgeframe/tests/unit/host-branch-coverage.test.ts), [host-transport.test](../packages/forgeframe/tests/unit/host-transport.test.ts), [props-sync.test](../packages/forgeframe/tests/integration/props-sync.test.ts), [consumer-host-handshake.test](../packages/forgeframe/tests/integration/consumer-host-handshake.test.ts), [host-startup.test](../packages/forgeframe/tests/integration/host-startup.test.ts), [protocol-version.test](../packages/forgeframe/tests/integration/protocol-version.test.ts), [schema-self-acceptance.test](../packages/forgeframe/tests/integration/schema-self-acceptance.test.ts) |
| <a id="evidence-react"></a>react | [react-host-sync.test](../packages/forgeframe/tests/integration/react-host-sync.test.ts), [react-driver-lifecycle.test](../packages/forgeframe/tests/unit/react-driver-lifecycle.test.ts), [react-driver-prop-sync.test](../packages/forgeframe/tests/unit/react-driver-prop-sync.test.ts), [react-prop-queue.test](../packages/forgeframe/tests/unit/react-prop-queue.test.ts), [react-driver-dom.test](../packages/forgeframe/tests/integration/react-driver-dom.test.ts) |
| <a id="evidence-utilities"></a>utilities | [utils.test](../packages/forgeframe/tests/unit/utils.test.ts), [domain-pattern.test](../packages/forgeframe/tests/unit/domain-pattern.test.ts), [window-helpers.test](../packages/forgeframe/tests/unit/window-helpers.test.ts), [window-name-payload.test](../packages/forgeframe/tests/unit/window-name-payload.test.ts), [props-serialize.test](../packages/forgeframe/tests/unit/props-serialize.test.ts), [protocol.test](../packages/forgeframe/tests/unit/protocol.test.ts) |
| <a id="evidence-contract"></a>contract | [package-contract.test](../packages/forgeframe/tests/unit/package-contract.test.ts), [index-node-smoke.test](../packages/forgeframe/tests/unit/index-node-smoke.test.ts), [index-side-effect-free.test](../packages/forgeframe/tests/unit/index-side-effect-free.test.ts), [component-node-runtime-transition.test](../packages/forgeframe/tests/unit/component-node-runtime-transition.test.ts), [version.test](../packages/forgeframe/tests/unit/version.test.ts) |

The [test index](../packages/forgeframe/tests/README.md) describes compile-time and browser suites; the [root README](../README.md) lists validation commands.

## Module and callable classifications

### [communication/bridge.ts](../packages/forgeframe/src/communication/bridge.ts)

Registry reconciliation, capacity admission, reference framing, and remote wrapper creation are separate responsibilities. Recursive object/array codecs and local ID reconciliation are cohesive algorithms. Decoding has no cycle check: its input always comes from parsed JSON. CALL and PEER_CALL invoke supplied functions after browser-source authorization. The call channel is passed in, so peer relay registries have a lifetime independent of prop and export batches.

Reference guards require the complete own-property wire shape, so records with extra user fields stay data. Ordinary marker-shaped records are escaped after JSON conversion and omission and restored as data, including nested escape markers, in props and exports.

Array encoding reads and checks every indexed entry once before recursive registration, rejecting `undefined` entries and sparse holes in props and exports. It never calls caller-controlled array methods, so arrays with null prototypes or a shadowed `map` encode correctly. Object-field omission and function/`Date` framing are separate rules.

Encoding converts objects other than arrays, dates, and native raw JSON through `toJSON(key)` and primitive unboxing once, as native JSON does, so a class's `toJSON()` decides what crosses; the module-private `serializeConvertedValue` dispatches an already converted value to function framing, `serializeArray`, `Date` framing, or `serializeRecord` (arrays first, since they never carry the `Date` brand), and nested values convert again through `serializeFunctions`. Both paths reach `serializeRecord`, which returns native raw JSON unchanged, at any depth or from `toJSON()`, so the message envelope's JSON encoding writes its text. `isSafeObjectKey` is shared with the props codec's root decode filter. The source object stays on the cycle stack while its `toJSON()` result is encoded, so a result that contains its source is reported as circular. A `toJSON()` that returns `undefined` for an array entry is rejected like an `undefined` entry. Remote wrappers send calls without a timeout, because the callback may still be running in the other window; teardown rejects them, and `rejectRemoteCalls` rejects this bridge's in-flight calls to a host whose document was replaced. `endRemoteSession` rejects calls to a window whose host session ended, including calls not yet dispatched, and makes later wrapper calls to it reject until `resumeRemoteSession`. While calls to a window are pending, `watchRemoteCall` counts them and `scheduleLivenessCheck` asks that window every 10 s, on a `<call channel>_liveness` request answered by the same source guard, whether it still listens; an unanswered check rejects the window's pending calls unless they belong to a newer watch, so a document that went away without teardown cannot leave them waiting forever. The constructor requires a source guard; there is no permissive default.

Local callback admission rejects snapshots over 500 functions without evicting. Batch ownership records new IDs for rollback before delivery; an uncertain delivery keeps references within a 1,000-entry pool. Append-mode peer relays have a cumulative 500-reference bound. Verified reconnect cleanup runs inside the consumer props queue before bootstrap serialization: it releases strong registrations and keeps the weak IDs of props the new document already acknowledged.

- **O:** `isSafeObjectKey`, `FunctionBridge.retainLocalFunction`, `FunctionBridge.findRemoteWrapper`, `FunctionBridge.evictOldestRemote`, `FunctionBridge.assertLocalCapacity`, `FunctionBridge.clearBatch`, `FunctionBridge.createRemoteWrapper`, `FunctionBridge.isFunctionRef`, `FunctionBridge.removeLocal`, `FunctionBridge.startBatch`, `FunctionBridge.staleLocalIds`, `FunctionBridge.resumeRemoteSession`, `FunctionBridge.livenessMessageName`, `FunctionBridge.clearRemote`, `serializeFunctions`, `enterStack`, `serializeConvertedValue`, `serializeArray`, `serializeRecord`, `deserializeFunctions`, `createFunctionRef`.
- **I:** `FunctionBridge.constructor`, `FunctionBridge.serialize`, `FunctionBridge.rejectRemoteCalls`, `FunctionBridge.endRemoteSession`, `FunctionBridge.watchRemoteCall`, `FunctionBridge.scheduleLivenessCheck`, `FunctionBridge.deserialize`, `FunctionBridge.createRemoteWrapper.wrapper`, `FunctionBridge.setupCallHandler`, `FunctionBridge.finishBatch`, `FunctionBridge.abortBatch`, `FunctionBridge.clearLocal`, `FunctionBridge.destroy`.
- **O callbacks:** `FunctionBridge.setupCallHandler.callback@365`, `FunctionBridge.setupCallHandler.callback@376`, `FunctionBridge.watchRemoteCall.callback@293`, `FunctionBridge.staleLocalIds.callback@464`.
- **I callbacks:** `deserializeFunctions.callback@687`, `FunctionBridge.scheduleLivenessCheck.callback@307`.
- **M callbacks:** `FunctionBridge.scheduleLivenessCheck.callback@307.callback@317`, `FunctionBridge.scheduleLivenessCheck.callback@307.callback@321`.
- **Retained rationale —** `FunctionBridge.scheduleLivenessCheck.callback@307.callback@317`, `FunctionBridge.scheduleLivenessCheck.callback@307.callback@321`: Each settles one check with one guard that its watch is still current and one call, rescheduling or rejecting, so a check from a finished watch neither continues the loop nor rejects calls a newer watch tracks.

Evidence: [messaging](#evidence-messaging); typecheck.

### [communication/messenger.ts](../packages/forgeframe/src/communication/messenger.ts)

Admission precedes decoding, and channel, usable source, expected origin, and pending target identity are each checked explicitly. A messenger never trusts its own origin when that origin is opaque (`"null"`), because every opaque document serializes the same way. Consumers construct their messenger without a listener and attach it once with `listen()` when host content opens. A `null` send timeout waits for the response or for rejection; `rejectPending` rejects one message type's requests to a window whose document can no longer answer, and teardown rejects the rest. Request execution and response encoding are cohesive boundary operations; the request workflow and posting are named separately. `send` and `post` resolve the target before encoding: only an absolute URL with a non-opaque origin is accepted, normalized to that origin as `postMessage` does, and responses must come from exactly that origin. `"*"`, `"/"`, other strings, and URLs with an opaque origin such as `data:` or `about:blank` throw before anything is posted. Trusted-domain recursion is one matcher-registry algorithm.

- **O:** `isPendingResponseSourceMatch`, `resolveTargetOrigin`, `Messenger.addTrustedDomain`, `Messenger.removeTrustedDomain`, `Messenger.isOriginTrusted`, `Messenger.on`, `Messenger.settlePendingResponse`, `Messenger.executeRequest`, `Messenger.serializeResponse`, `Messenger.postResponse`, `Messenger.rejectPending`.
- **I:** `Messenger.constructor`, `Messenger.listen`, `Messenger.send`, `Messenger.post`, `Messenger.setupListener`, `Messenger.setupListener.this.listener`, `Messenger.readTrustedMessage`, `Messenger.handleMessage`, `Messenger.handleRequest`, `Messenger.destroy`.
- **O callbacks:** `Messenger.removeTrustedDomain.callback@209`, `Messenger.removeTrustedDomain.callback@215`, `Messenger.on.callback@356`.
- **I callbacks:** `Messenger.send.callback@285`.

Evidence: [messaging](#evidence-messaging); typecheck.

### [communication/protocol.ts](../packages/forgeframe/src/communication/protocol.ts)

Envelope framing and prefixed JSON encoding and decoding are operations. Malformed messages decode to null.

- **O:** `serializeMessage`, `deserializeMessage`, `createRequestMessage`, `createResponseMessage`.

Evidence: [messaging](#evidence-messaging); typecheck.

### [communication/types.ts](../packages/forgeframe/src/communication/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [messaging](#evidence-messaging); typecheck.

### [constants.ts](../packages/forgeframe/src/constants.ts)

The `VERSION` initializer validates the injected build value. Other entries are immutable protocol constants.

- **O callbacks:** `callback@147`.

Evidence: [contract](#evidence-contract); typecheck.

### [core/component-instance-index.ts](../packages/forgeframe/src/core/component-instance-index.ts)

Index mutation and snapshots are cohesive state operations. This module is the only active-instance index. Indexed instances expose their verified and opened host origins and `peerDomains` for peer scoping.

- **O:** `indexComponentInstance`, `removeIndexedComponentInstance`, `clearIndexedInstancesByTag`, `clearIndexedInstances`, `getComponentInstancesByTag`, `getIndexedComponentInstances`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/component-registry.ts](../packages/forgeframe/src/core/component-registry.ts)

Registration, lookups, snapshots, and deletion are state operations. The registry owns component metadata.

- **O:** `registerComponent`, `hasRegisteredComponent`, `getRegisteredComponent`, `getComponentOptions`, `deleteRegisteredComponent`, `clearRegisteredComponents`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/component.ts](../packages/forgeframe/src/core/component.ts)

Declaration policy receives options, including domain-matcher validation, so empty or blank matcher strings throw; static URL context selection receives the observed origin. Factory construction is an integration. Defining a component never starts or configures a host: the module does not import the host runtime, and `initHost(Component, ...)` reads the registered options instead. An owner callback removes factory and index identities before the `closed` event; no public listener takes part, so user code cannot affect the bookkeeping. The `instances` getter (`create.get`) is an **O** state snapshot that returns a new frozen copy of the factory list on each read. `closeAll` is an integration over the global instance index: it snapshots every live instance, closes them concurrently, and collects failures into one `AggregateError` after every close settles.

`assertComponentShape` is an **O** declaration policy. It validates `timeout` and the optional non-empty `cspNonce` string. Its reserved-definition guard, the shared `assertNoReservedPropDefinitions`, treats `undefined` entries as omitted, matching normalization, and rejects real host-control definitions; `component.test.ts` covers both cases. It also applies the shared prop-definition checks (getter entries, removed options including `outputSchema`, a missing `schema`, `deliverTo` and parameter names) before the factory is registered, and `assertNoRemovedComponentOptions` throws a migration error naming the replacement for the removed `allowedConsumerDomains`, `eligible` and `children` options.

- **O:** `assertComponentShape`, `assertNoRemovedComponentOptions`, `staticUrlValidationContext`, `removeTrackedInstance`, `create.get`.
- **I:** `validateStaticComponentUrl`, `create`, `create.untrackInstance`, `create.createTrackedInstance`, `getComponent`, `closeAll`, `unregisterComponent`, `clearComponents`.
- **M:** `create.trackInstance`, `validateComponentOptions`.
- **O callbacks:** `closeAll.callback@376`.
- **I callbacks:** `create.callback@306`, `closeAll.callback@374`.
- **Retained rationale —** `create.trackInstance`: The factory-local guard, list append and index update share one lifetime. Keep this short ownership adapter next to construction; removal bookkeeping is named separately.
- **Retained rationale —** `validateComponentOptions`: Two calls and one duplicate-tag rule over the registry; the rule is one line, and naming it would only wrap a `has` check.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer.ts](../packages/forgeframe/src/core/consumer.ts)

Lifecycle integrations keep their cancellation checkpoints. Render guards, task release, and destruction start are named state operations. Rendering places a props-queue hold after installing its render task, waits for earlier prop work before validation, pins the validated navigation URL before the `render` event, and releases the hold once the attempt settles, so updates requested meanwhile run in call order afterwards. `updateProps` rejects only once the instance closes. The update delivery origin comes from the pure `selectUpdateDeliveryOrigin`, and destruction asks the transport (`rejectPendingInit`) and the props pipeline (`abandonPending`) to clear their own state. The lifecycle emits on a private `#emitter` field, which plain JavaScript cannot reach either; `event` is the frozen `on`/`once` facade from `createEventSubscriber`, and ForgeFrame never calls a prop by name. `render` fires once before the placeholder or frame exists and is followed by a cancellation check; `rendered` fires once after loading completes. `focus` reports the renderer's result and emits only when a frame is mounted or a popup is open. `onExport` replaces `exports` before emitting `exports`; a reconnection clears `exports` without an event. Hook proxies wire the props, renderer, and transport runtimes; response construction and browser reads are local operations.

`buildWindowName` rechecks schema values before the host window is created, because dimension and URL functions can mutate prop values after the previous check; the payload it builds carries channel metadata only. No user code receives instance controls during construction, so construction has no deferred action queue.

Array admission before render and before an update commits passes the URL's origin and the consumer's own origin to the pure `createDeliveryTarget`, so a host on the consumer's origin counts as a possible same-origin recipient and arrays of `deliverTo: 'same-origin'` props it may receive are checked before anything is committed. Bootstrap uses the verified source origin the same way.

`ConsumerComponent.resize` does nothing for a popup that is not open and rejects without notifying when the browser denies resizing a cross-origin popup; `resizeForHost` handles a host's RESIZE request: a popup host has already resized its own window, so it resizes only iframes, then notifies through `emitResize`.

`ConsumerComponent.close` installs its shared completion before calling `performClose`, which sequences the `close` event, destruction, and flag release. `destroy` installs its own shared completion before `performDestroy` sequences resource teardown, cleanup, deregistration, the `closed` event, and disposal of the emitter, after which subscriptions are inert. Both pairs are lifecycle integrations. Reentrant callers, including close calls during failed-render destruction, join the pending completion without repeating the workflow or close events.

- **O:** `ConsumerComponent.uid`, `ConsumerComponent.assertRenderAllowed`, `ConsumerComponent.finishRenderTask`, `ConsumerComponent.applyPropsUpdate.isRendered`, `ConsumerComponent.assertPropsUpdateActive`, `ConsumerComponent.assertStableRenderedOrigin`, `ConsumerComponent.isDestroyed`, `ConsumerComponent.getVerifiedHostDomain`, `ConsumerComponent.getOpenedHostDomain`, `ConsumerComponent.getPeerDomains`, `ConsumerComponent.normalizeOptions`, `ConsumerComponent.applyPropsUpdate.emitPropsUpdated`, `ConsumerComponent.emitResize`, `ConsumerComponent.setupMessageHandlers.onError`, `ConsumerComponent.createRenderCancellationError`, `ConsumerComponent.isRenderCancelled`.
- **I:** `ConsumerComponent.constructor`, `ConsumerComponent.constructor.close`, `ConsumerComponent.constructor.focus`, `ConsumerComponent.render`, `ConsumerComponent.performRender`, `ConsumerComponent.validateForRender`, `ConsumerComponent.close`, `ConsumerComponent.performClose`, `ConsumerComponent.focus`, `ConsumerComponent.resize`, `ConsumerComponent.resizeForHost`, `ConsumerComponent.show`, `ConsumerComponent.hide`, `ConsumerComponent.updateProps`, `ConsumerComponent.applyPropsUpdate`, `ConsumerComponent.applyPropsUpdate.assertActive`, `ConsumerComponent.applyPropsUpdate.resolveUrl`, `ConsumerComponent.applyPropsUpdate.resolveUrlOrigin`, `ConsumerComponent.applyPropsUpdate.assertStableRenderedOrigin`, `ConsumerComponent.applyPropsUpdate.validateTransportProps`, `ConsumerComponent.applyPropsUpdate.syncTrustedDomainForUrl`, `ConsumerComponent.applyPropsUpdate.shouldSendPropsToHost`, `ConsumerComponent.applyPropsUpdate.sendPropsUpdateToHost`, `ConsumerComponent.sendPropsUpdateToHost`, `ConsumerComponent.resolveUrl`, `ConsumerComponent.resolveDimensions`, `ConsumerComponent.resolveUrlOrigin`, `ConsumerComponent.syncTrustedDomainForUrl`, `ConsumerComponent.resolveContainer`, `ConsumerComponent.prerender`, `ConsumerComponent.createIframeElement`, `ConsumerComponent.open`, `ConsumerComponent.open.assertActive`, `ConsumerComponent.open.buildUrl`, `ConsumerComponent.open.buildBodyParams`, `ConsumerComponent.open.buildWindowName`, `ConsumerComponent.open.submitBodyForm`, `ConsumerComponent.open.onPopupClose`, `ConsumerComponent.open.registerCleanup`, `ConsumerComponent.buildUrl`, `ConsumerComponent.buildBodyParams`, `ConsumerComponent.submitBodyForm`, `ConsumerComponent.buildWindowName`, `ConsumerComponent.waitForHost`, `ConsumerComponent.setupMessageHandlers`, `ConsumerComponent.setupMessageHandlers.onBootstrap`, `ConsumerComponent.setupMessageHandlers.onReconnect`, `ConsumerComponent.setupMessageHandlers.onClose`, `ConsumerComponent.setupMessageHandlers.onResize`, `ConsumerComponent.setupMessageHandlers.onFocus`, `ConsumerComponent.setupMessageHandlers.onShow`, `ConsumerComponent.setupMessageHandlers.onHide`, `ConsumerComponent.setupMessageHandlers.onExport`, `ConsumerComponent.setupMessageHandlers.onGetSiblings`, `ConsumerComponent.setupCleanup`, `ConsumerComponent.teardownRenderResources`, `ConsumerComponent.destroy`, `ConsumerComponent.performDestroy`.
- **M:** `ConsumerComponent.assertRenderActive`, `ConsumerComponent.beginDestroy`.
- **O callbacks:** `ConsumerComponent.constructor.callback@156`, `ConsumerComponent.constructor.callback@170`, `ConsumerComponent.performRender.callback@315`, `ConsumerComponent.waitForHost.callback@725`.
- **I callbacks:** `ConsumerComponent.constructor.callback@157`, `ConsumerComponent.constructor.callback@169`, `ConsumerComponent.performRender.callback@282`, `ConsumerComponent.prerender.callback@619`, `ConsumerComponent.prerender.callback@620`, `ConsumerComponent.prerender.callback@621`, `ConsumerComponent.setupMessageHandlers.onBootstrap.callback@762`, `ConsumerComponent.setupCleanup.callback@798`.
- **Retained rationale —** `ConsumerComponent.assertRenderActive`: A cancellation guard, `teardownRenderResources()` and the throw stay together, so every one of its call sites releases render resources before reporting cancellation.
- **Retained rationale —** `ConsumerComponent.beginDestroy`: Marking the instance destroyed and asking the transport to reject its pending handshake are one transition; the guard returns `false` for a repeat, so teardown starts once and no caller can observe a destroyed instance with a live handshake.

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

Candidate construction, validation, and commitment are separate steps. `buildCandidate` composes the pure merge, key selection and overlay from `prop-update.ts` with normalization: it converts only the patched keys from the merged inputs, then `validateSnapshot` rechecks the other supplied inputs and normalized outputs before the component `validate` runs. A construction-time schema failure is kept and rethrown at every trust boundary until an update normalizes every prop. The pipeline owns the queue and the render hold: updates made before a host connects also install their entries before user code (schema transforms and the component `validate`) runs. `holdForRender` places one entry at the queue tail and returns the earlier work the render waits for plus a release step; reads the render owns (`readCurrentProps` during a hold) run inside it, ahead of held updates, and `appendOwnWork` counts the earlier work and each own read until they settle. `releaseRenderHold` lets held updates run after that work, and leaves the queue idle at once only when nothing is held or still running. `abandonPending` forgets the tail at teardown and releases the hold, so held updates settle and reject as closed.

Update admission checks deliverable array values after URL/origin policy and before snapshot commitment; render admission checks them before allocating resources. Arrays produced by custom encoders are checked at delivery, after commitment, where a transport failure does not roll back the committed snapshot. [consumer-props-queue.test](../packages/forgeframe/tests/unit/consumer-props-queue.test.ts) covers the queue; [consumer-host-handshake.test](../packages/forgeframe/tests/integration/consumer-host-handshake.test.ts), [body-param-bootstrap.test](../packages/forgeframe/tests/integration/body-param-bootstrap.test.ts) and [props-sync.test](../packages/forgeframe/tests/integration/props-sync.test.ts) cover the render hold.

- **O:** `ConsumerPropsPipeline.commitCandidate`, `ConsumerPropsPipeline.appendOwnWork`, `ConsumerPropsPipeline.appendOwnWork.settle`, `ConsumerPropsPipeline.releaseRenderHold`, `ConsumerPropsPipeline.abandonPending`.
- **I:** `ConsumerPropsPipeline.constructor`, `ConsumerPropsPipeline.revalidateSchemaValues`, `ConsumerPropsPipeline.buildCandidate`, `ConsumerPropsPipeline.validateSnapshot`, `ConsumerPropsPipeline.updateProps`, `ConsumerPropsPipeline.readCurrentProps`, `ConsumerPropsPipeline.readCurrentProps.readSnapshot`, `ConsumerPropsPipeline.holdForRender.release`, `ConsumerPropsPipeline.queuePropsUpdate`, `ConsumerPropsPipeline.trackPendingUpdate`.
- **M:** `ConsumerPropsPipeline.holdForRender`.
- **O callbacks:** `ConsumerPropsPipeline.holdForRender.callback@234`, `ConsumerPropsPipeline.trackPendingUpdate.callback@306`, `ConsumerPropsPipeline.trackPendingUpdate.callback@307`, `ConsumerPropsPipeline.trackPendingUpdate.callback@312`.
- **I callbacks:** `ConsumerPropsPipeline.updateProps.callback@165`.
- **Retained rationale —** `ConsumerPropsPipeline.holdForRender`: Building the hold record, installing it as the active hold and tracking its queue tail are one placement; each step reads what the previous one created, and a separate builder would only pass the half-built hold back.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer/renderer.ts](../packages/forgeframe/src/core/consumer/renderer.ts)

Prerender context construction, mounting, iframe/popup opening, POST submission, and teardown have named entrypoints. Container resolution rejects a detached container in iframe context, and iframe opening rechecks attachment, because a detached frame has no browsing context and a POST would open an untracked window. `resize` reports `false` when the browser denies resizing a popup, and `focus` reports `false` when no iframe is mounted and no popup is open. Template contexts carry the `cspNonce` component option, never a prop. `completePrerender` swaps the iframe in, or removes popup loading content, after initialization while keeping the caller's mount and custom shells. POST form work is one browser operation: methods are called through the created form's prototype from the mount document, and construction and submission share a cleanup guard, so named controls cannot mask append, submit, or removal. Resource acquisition and user callbacks have synchronous cancellation checkpoints.

Loading concealment and restoration are cohesive browser-style operations owned by the renderer. `concealLoadingFrame` captures CSS and conceals the frame: eager frames use `display: none` so custom loading templates gain no extra space, while lazy frames keep their layout and temporarily clear a configured inline `display: none` so navigation can start. Its local `capture` callback performs one style read. After the loader fades, `restoreLoadingFrameStyles` restores the saved styles, and explicit visibility controls take precedence. The reveal predicate and its style-value callback are **O**: only unstyled frames whose current visibility request allows showing get the default reveal animation. Teardown discards saved styles. Prerender applies a pending explicit show once the frame exists, so controls sent before creation behave like later ones.

- **O:** `ConsumerRenderer.constructor`, `ConsumerRenderer.resolveContainer`, `ConsumerRenderer.createTemplateContext`, `ConsumerRenderer.concealLoadingFrame`, `ConsumerRenderer.restoreLoadingFrameStyles`, `ConsumerRenderer.submitBodyForm`.
- **I:** `ConsumerRenderer.prerender`, `ConsumerRenderer.createTemplateContext.close`, `ConsumerRenderer.createTemplateContext.focus`, `ConsumerRenderer.createIframeElement`, `ConsumerRenderer.open`, `ConsumerRenderer.openIframe`, `ConsumerRenderer.openPopup`, `ConsumerRenderer.completePrerender`, `ConsumerRenderer.focus`, `ConsumerRenderer.resize`, `ConsumerRenderer.show`, `ConsumerRenderer.hide`, `ConsumerRenderer.destroy`.
- **M:** `ConsumerRenderer.mountPrerenderContent`.
- **O callbacks:** `ConsumerRenderer.concealLoadingFrame.capture`, `ConsumerRenderer.completePrerender.callback@378`, `ConsumerRenderer.completePrerender.callback@378.callback@381`.
- **I callbacks:** `ConsumerRenderer.openPopup.callback@360`.
- **Retained rationale —** `ConsumerRenderer.mountPrerenderContent`: Ownership checks, DOM attachment and cancellation assertions must stay adjacent: cancellation can occur inside DOM/template actions. This short mounting adapter makes those boundaries visible.

Evidence: [render](#evidence-render); typecheck.

### [core/consumer/siblings.ts](../packages/forgeframe/src/core/consumer/siblings.ts)

Index lookup supplies identities, and `observePeerCandidate` reads each instance's verified and opened host origins, `peerDomains`, and exports into a `PeerCandidate`. `selectSiblingInstances` is pure policy over those candidates: it compares each peer's verified host origin (or, while its host loads, its opened origin, without exports), or its `peerDomains` allowance, with the requester's supplied origin. Opaque origins never identify a peer, so an opaque requester selects nothing and a peer whose own host is opaque is never listed, even when its `peerDomains` match. `ConsumerSiblingRequest.anyConsumer` is required.

- **O:** `observePeerCandidate`, `selectSiblingInstances`.
- **I:** `getSiblingInstances`.
- **O callbacks:** `getSiblingInstances.callback@62`.
- **I callbacks:** `getSiblingInstances.callback@67`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer/transport.ts](../packages/forgeframe/src/core/consumer/transport.ts)

Trusted matcher construction is data-only; window/origin observation and messenger rotation are integrations. Bootstrap and INIT integrations keep explicit source and session admission and state-transition order. Control callbacks select the next protocol action, and their small response literals stay at the handler. Peer discovery sequences the index lookup and recursive serialization through a separate source-guarded relay bridge; its batch bookkeeping is cleared without retiring held snapshots, and reconnect and destroy clear relay identities.

`attachHostWindow` records opened host content and starts the messenger listener, so unrendered instances add no `message` listener. `attachHostWindow` records the opened origin together with the window, and `resetHostWindow` clears both, so the host-control guard matches the configured domain policy or that opened origin. `buildWindowName` always runs before host content exists, so INIT is accepted only for the current verified bootstrap session; the `window.name` payload carries channel metadata only. A bootstrap from a new host session asks the prop bridge to reject its pending calls to that window, which the replaced document can no longer answer. An ERROR marked `initFailed` during a pending handshake is recorded instead of reported, because the host can retry on the same page: a successful INIT clears the record, and a handshake timeout reports once with the host's reason. Outside a handshake it is reported at once. Without a recorded reason, the timeout's guidance adds that consumer and host must run the same ForgeFrame major version, because a 1.x host refuses the protocol 3 payload without replying.

A peer append commits only after the response passes native JSON encoding. If final response encoding fails, only the new registrations are rolled back; held callbacks and capacity stay available for later discoveries.

- **O:** `ConsumerTransport.getHostOrigin`, `ConsumerTransport.isHostConnected`, `ConsumerTransport.isHostControlSource`, `ConsumerTransport.resetHostWindow`, `ConsumerTransport.rejectPendingInit`, `collectTrustedDomains`.
- **I:** `ConsumerTransport.constructor`, `ConsumerTransport.getHostDomain`, `ConsumerTransport.attachHostWindow`, `ConsumerTransport.buildTrustedDomains`, `ConsumerTransport.syncTrustedDomainForUrl`, `ConsumerTransport.serializePropsForHost`, `ConsumerTransport.sendPropsUpdateToHost`, `ConsumerTransport.buildWindowName`, `ConsumerTransport.waitForHost`, `ConsumerTransport.setupMessageHandlers`, `ConsumerTransport.onHostControl`, `ConsumerTransport.destroy`.
- **O callbacks:** `ConsumerTransport.waitForHost.callback@280`.
- **I callbacks:** `ConsumerTransport.constructor.callback@117`, `ConsumerTransport.setupMessageHandlers.callback@304`, `ConsumerTransport.setupMessageHandlers.callback@337`, `ConsumerTransport.setupMessageHandlers.callback@358`, `ConsumerTransport.setupMessageHandlers.callback@367`, `ConsumerTransport.setupMessageHandlers.callback@372`, `ConsumerTransport.setupMessageHandlers.callback@377`, `ConsumerTransport.setupMessageHandlers.callback@383`, `ConsumerTransport.setupMessageHandlers.callback@388`, `ConsumerTransport.setupMessageHandlers.callback@395`, `ConsumerTransport.setupMessageHandlers.callback@411`, `ConsumerTransport.setupMessageHandlers.callback@427`, `ConsumerTransport.onHostControl.callback@459`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer/types.ts](../packages/forgeframe/src/core/consumer/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/host.ts](../packages/forgeframe/src/core/host.ts)

The public host check delegates to the bootstrap and window adapters. `isHost()` is true when a host runtime is active or `window.name` holds a decodable ForgeFrame payload of any protocol version, so older payloads reach the upgrade error; `isForgeFrameWindow` decides decodability through the payload reader. It is false for a malformed payload after the prefix, and stays true after `destroy()`. Importing the module without browser globals has no effect.

- **I:** `isHost`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/bootstrap.ts](../packages/forgeframe/src/core/host/bootstrap.ts)

`initHost()` is the only host start path. `init-host-arguments.ts` checks the call shape before any environment check and resolves what the host starts with. The integration then returns null without browser globals, throws while a host is active, reads the channel metadata, and in the component form throws when the payload's tag differs. It never consults the registry for another component's definitions and never reconfigures a running host. `readInitialPayload` classifies the current `window.name` on every new start and never rewrites it: a payload from another protocol throws the upgrade error that `describeUnsupportedPayload` words, before any host state exists or anything is sent to the unverified consumer, and an invalid payload is logged and yields null. `hasConsumerWindow` checks first that a parent or opener exists: a stale older payload in a window with neither has no consumer to upgrade, so it yields null, as a current payload without a consumer window does. There is no pending copy of the payload, so a retry after a failed start or failed asynchronous validation, and a start after `destroy()`, reread the retained channel metadata.

`startHostRuntime` passes the resolved start options to the runtime and makes it the active host from construction until it is destroyed or its start fails. A consumer-window resolution failure yields null; a disallowed consumer origin throws from construction and leaves no active host. Its ready callback is registered before the caller can observe `ready`, so a rejection releases the singleton before the caller's handlers run. The destruction callback is an **O** identity-guarded state transition, so stale or repeated destruction cannot clear a replacement host. `createHost` returns a frozen object with only `ready`, `hostProps`, `init`, `destroy`, `on` and `once`; `on` and `once` come from the shared subscriber facade and admit only the `error` event. The accepted names and the unknown-name message come from `core/host/events.ts`.

- **O:** `describeUnsupportedPayload`, `getHost`.
- **I:** `readInitialPayload`, `hasConsumerWindow`, `startHostRuntime`, `createHost`, `createHost.init`, `createHost.destroy`, `clearHostInstance`.
- **M:** `initHost`.
- **O callbacks:** `startHostRuntime.onDestroy`.
- **I callbacks:** `startHostRuntime.ready.catch`.
- **Retained rationale —** `initHost`: The component form's tag check is one comparison and throw between the payload read and the runtime start; it reads the payload this integration just obtained, so it stays inline.

Evidence: [host](#evidence-host); typecheck.

### [core/host/builtin-keys.ts](../packages/forgeframe/src/core/host/builtin-keys.ts)

The reserved built-in names and the declaration policy that rejects definitions for them. `create()` and `initHost()` share the policy, which reads fields by the own-field rule in `props/definition-checks.ts`: entries set to `undefined` count as omitted, and accessors are not invoked.

- **O:** `assertNoReservedPropDefinitions`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/component.ts](../packages/forgeframe/src/core/host/component.ts)

Constructor proxies bind the host's own fields and its props and transport runtimes. Accessors delegate. The constructor has one startup path: it selects the messaging target and checks it against the allowlist before BOOTSTRAP, starts with built-in host props and an empty consumer snapshot, makes `ready` the verified bootstrap, and makes INIT wait for it. With `autoInit`, the constructor calls `init()`; otherwise INIT waits for the caller. Bootstrap readiness, source verification, and teardown are explicit integrations. `ready` resolves to the live host props; its rejection observer only prevents an unhandled rejection.

`HostComponent.destroy` notifies its bootstrap owner first, then sequences transport, observer, and prop cleanup. The owner callback is local to that owner, so stale or repeated destruction cannot clear a replacement host; `consumer-host-handshake.test.ts` covers this.

The constructor takes one options object (`HostRuntimeOptions`: definitions, `consumerOrigins`, `autoInit`, and the owner's destruction callback). `receiveBootstrap` requests BOOTSTRAP, checks the response's shape, and passes the messaging consumer origin to the shared allowlist policy in `consumer-origin-policy.ts` again, as defence in depth. Any failure there, apart from destruction, is reported on the `error` event, as an `Error` whose `cause` is the failure, before `ready` rejects. When host schemas reject the bootstrap snapshot, the props runtime reports the `Error` instead, and `initializeFromConsumer` asks the transport to tell the verified, allowed consumer why; consumer-domain rejections are not reported to the consumer.

- **O:** `HostComponent.constructor.getConsumerDomain@80`, `HostComponent.constructor.beforeInit`, `HostComponent.constructor.getConsumerWindow`, `HostComponent.constructor.getConsumerDomain@103`, `HostComponent.constructor.getBridge`, `HostComponent.constructor.get@111`, `HostComponent.constructor.get@115`, `HostComponent.constructor.isConsumerSource`.
- **I:** `HostComponent.constructor`, `HostComponent.constructor.close`, `HostComponent.constructor.focus`, `HostComponent.constructor.resize`, `HostComponent.constructor.show`, `HostComponent.constructor.hide`, `HostComponent.constructor.reportError`, `HostComponent.constructor.exportData`, `HostComponent.constructor.getPeerInstances`, `HostComponent.constructor.applySerializedProps`, `HostComponent.initializeFromConsumer`, `HostComponent.receiveBootstrap`, `HostComponent.hostProps`, `HostComponent.init`, `HostComponent.destroy`.
- **O callbacks:** `HostComponent.constructor.callback@129`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/consumer-origin-policy.ts](../packages/forgeframe/src/core/host/consumer-origin-policy.ts)

All trust policy works from supplied origins and options. A messaging target must be an exact HTTP(S) origin that passes the allowlist, and stays provisional until the bootstrap exchange verifies the source window. `validateMessagingConsumerContext` returns that origin unchanged. `assertAllowedConsumerDomain` is the one allowlist check: the messaging context and the coordinator's post-bootstrap check both use it. The allowlist is always supplied.

- **O:** `assertAllowedConsumerDomain`, `validateMessagingConsumerContext`.

Evidence: [host](#evidence-host), [consumer-origin-policy.test](../packages/forgeframe/tests/unit/consumer-origin-policy.test.ts); typecheck.

### [core/host/events.ts](../packages/forgeframe/src/core/host/events.ts)

The host event-name set is data built from `EVENT`, matching `core/consumer/events.ts`. Describing an unknown name is one message policy: the removed v1 `props` event names `hostProps.onProps()` as its replacement, and any other name lists the supported event.

- **O:** `describeUnknownHostEvent`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/init-host-arguments.ts](../packages/forgeframe/src/core/host/init-host-arguments.ts)

`initHost()` call-shape policy, checked before any environment check, so a v1 call shape fails closed everywhere. `readInitHostArguments` resolves the component form's tag and definitions through the registry: a component must carry registered options and takes one options object, and a tag-agnostic call that adds a second positional argument (the v1 allowlist position) throws. `readInitHostOptions` is **O** declaration policy over the supplied options: it accepts only `consumerOrigins`, `autoInit`, and, in the tag-agnostic form, `props`; validates the required matcher; defaults `autoInit`; and applies the shared reserved-name and prop-definition checks to supplied definitions. `callShapeError` appends the v2 call shapes, so every argument error names them; the shared reserved-name and prop-definition errors name the prop instead.

- **O:** `callShapeError`, `readInitHostOptions`.
- **M:** `readInitHostArguments`.
- **Retained rationale —** `readInitHostArguments`: The argument-count rules are two inline guards on the call shape it is already resolving; a separate operation would only re-read the same array.

Evidence: [host](#evidence-host); typecheck.

### [core/host/props-runtime.ts](../packages/forgeframe/src/core/host/props-runtime.ts)

Building stable built-in references is separate from consumer snapshot commitment (`commitSerializedProps`) and subscriber notification (`notifyPropsHandlers`). An update acknowledged before a messaging bootstrap completes is committed but not published; `applyBootstrap` marks the runtime initialized and publishes the final snapshot once. `hostProps.consumer` keeps its identity and holds only `props`, which each commit replaces. Stale custom props are found by own-key membership, so inherited names cannot keep an old value. Subscribers run only after reconciliation; notification observes promise and thenable failures without awaiting user work, so acknowledgement order is unaffected. `onProps` is the only way to observe updates; the runtime emits only `error` events, always with an `Error`.

`HostPropsRuntime.filterUndeliveredProps` and its filter callback are **O** admission operations that use own-key membership and the delivered definitions; undeclared fields pass through. `HostPropsRuntime.getDeliveredPropDefinitions` is an **I**: it caches one call that applies the shared delivery policy (`createDeliveryTarget`, then `getDeliveredPropDefinitions`) with the host origin read at construction and the verified consumer origin, once, and keeps the selection, so consumer-only props and props whose `deliverTo` excludes this host are neither expected nor accepted. `deserialize` filters wire snapshots before calling the codec. The definitions are fixed when the runtime is constructed; bootstrap and live updates validate every expected prop with the same delivered definitions, including an acknowledged update that arrives before bootstrap completes, so required withheld or local inputs do not block initialization. The runtime defines no window global, and reading `hostProps` has no side effects.

Notification snapshots handlers with weak registration tokens. New registrations and cancel-and-register replacements wait for the next notification; cancellation or destruction skips pending delivery. Duplicate registrations keep their original token, and cancellation removes only the registration whose token it captured, so an old or duplicate handle cannot cancel a later registration of the same callback. `onProps` and the unsubscribe function it returns are **O** state operations, covered through public update delivery. The snapshot map callback is **O**. The rejection callback in `HostPropsRuntime.notifyPropsHandlers` is an **O** callback boundary: it logs one observer failure and leaves prop state alone.

- **O:** `filterReservedHostPropKeys`, `HostPropsRuntime.constructor`, `HostPropsRuntime.createHostProps.getConsumer`, `HostPropsRuntime.notifyPropsHandlers`, `HostPropsRuntime.destroy`, `HostPropsRuntime.onProps`, `HostPropsRuntime.onProps.callback@203`, `HostPropsRuntime.removeStaleHostProps`.
- **I:** `HostPropsRuntime.initializeHostProps`, `HostPropsRuntime.createHostProps`, `HostPropsRuntime.createHostProps.close`, `HostPropsRuntime.createHostProps.focus`, `HostPropsRuntime.createHostProps.resize`, `HostPropsRuntime.createHostProps.show`, `HostPropsRuntime.createHostProps.hide`, `HostPropsRuntime.createHostProps.onProps`, `HostPropsRuntime.createHostProps.reportError`, `HostPropsRuntime.createHostProps.getConsumerDomain`, `HostPropsRuntime.createHostProps.export`, `HostPropsRuntime.createHostProps.getPeerInstances`, `HostPropsRuntime.applyBootstrap`, `HostPropsRuntime.applySerializedProps`, `HostPropsRuntime.commitSerializedProps`, `HostPropsRuntime.deserialize`, `HostPropsRuntime.filterUndeliveredProps`, `HostPropsRuntime.expectedDefinitions`.
- **M:** `HostPropsRuntime.commitHostProps`.
- **Retained rationale —** `HostPropsRuntime.commitHostProps`: It calls `removeStaleHostProps`, then replaces the snapshot, the consumer view and the pending-bootstrap flag together, so a commit is never half-applied; the flag is one assignment of the same commit.

Evidence: [host](#evidence-host); typecheck.

### [core/host/security.ts](../packages/forgeframe/src/core/host/security.ts)

Browser observations are separate from policy. A directly accessible consumer origin is preferred over the payload's claimed origin; the referrer is not observed. `resolveMessagingConsumerContext` always passes the host's allowlist to the policy.

- **O:** `resolveConsumerWindow`, `getAccessibleConsumerOrigin`.
- **I:** `resolveMessagingConsumerContext`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/transport.ts](../packages/forgeframe/src/core/host/transport.ts)

Outbound export batches share a FIFO queue. A serialization failure aborts new bridge registrations, a send failure keeps possibly delivered references, and acknowledged delivery retires stale IDs. `sendInitOnce` launches the INIT workflow at most once and never after teardown; the coordinator calls it from `init()`. The workflow awaits `beforeInit` (the verified bootstrap); a rejected start sends and reports nothing, because the coordinator reports failed starts. `emitInitFailure` is the one place that wraps failed starts and INIT delivery failures in an `Error` whose message starts with `Failed to initialize host component:` and whose `cause` is the original error. It then guards against destruction after its await, sends INIT with only the session ID, captures errors, and reports events; a rejection caused by teardown is not an initialization failure and is not logged. `reportInitFailure` sends a best-effort ERROR marked `initFailed`, whose rejection after teardown is ignored. Teardown posts a best-effort one-way TEARDOWN notice before destroying the messenger, because the consumer's calls wait without a timeout and calls not yet dispatched would never be answered. Browser focus is part of the focus integration, which waits briefly for this window to receive the consumer's frame focus before resolving, unless the consumer's acknowledgement reports that its page has no focus to pass on; a popup host resizes its own window before notifying the consumer, which cannot resize it across origins. Peer lookup sends only the caller's options, sequences a correlated response and recursive decoding through the separate peer-call bridge, so prop and export batches cannot retire relay wrappers.

- **O:** `HostTransport.emitInitFailure`.
- **I:** `HostTransport.constructor`, `HostTransport.registerPropsHandler`, `HostTransport.requestBootstrap`, `HostTransport.close`, `HostTransport.focus`, `HostTransport.resize`, `HostTransport.show`, `HostTransport.hide`, `HostTransport.reportError`, `HostTransport.reportInitFailure`, `HostTransport.exportData`, `HostTransport.sendExportBatch`, `HostTransport.getPeerInstances`, `HostTransport.destroy`, `HostTransport.sendInit`, `HostTransport.sendMessage`.
- **M:** `HostTransport.sendInitOnce`.
- **O callbacks:** `HostTransport.constructor.callback@53`, `HostTransport.constructor.callback@59`, `HostTransport.reportInitFailure.callback@165`, `HostTransport.exportData.callback@172`.
- **I callbacks:** `HostTransport.registerPropsHandler.callback@69`, `HostTransport.exportData.callback@169`.
- **Retained rationale —** `HostTransport.sendInitOnce`: The idempotent guard, flag transition and launch of sendInit are a short atomic adapter.

Evidence: [host](#evidence-host); typecheck.

### [core/host/types.ts](../packages/forgeframe/src/core/host/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [host](#evidence-host); typecheck.

### [core/index.ts](../packages/forgeframe/src/core/index.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [consumer](#evidence-consumer); typecheck.

### [drivers/react.ts](../packages/forgeframe/src/drivers/react.ts)

Hooks are unconditional and keep their order. Hook callbacks coordinate the lifecycle and queue helpers through current refs. The container's ref is a callback created by `createContainerRef` and memoized per forwarded ref by `createContainerRefCache`, so a render React discards cannot replace a committed ref's callback, and React attaches and forwards the element during commit, before layout effects; a forwarded callback's React 19 cleanup replaces the `null` call on detach.

- **O:** `reportReactError`, `createContainerRefCache`, `createContainerRef`.
- **I:** `createReactComponent`, `createReactComponent.ForgeFrameComponent`, `createReactComponent.ForgeFrameComponent.isCurrent`, `createReactComponent.ForgeFrameComponent.onDriverError`, `createReactComponent.ForgeFrameComponent.drain`, `createReactComponent.ForgeFrameComponent.callback@394.onRendered`, `createReactComponent.ForgeFrameComponent.callback@394.onClose`, `withReactComponent`, `withReactComponent.createComponent`.
- **O callbacks:** `reportReactError.callback@221`, `createContainerRefCache.callback@163`, `createContainerRef.callback@187`, `createContainerRef.callback@187.callback@192`, `createReactComponent.ForgeFrameComponent.callback@388`.
- **I callbacks:** `createReactComponent.ForgeFrameComponent.callback@394`, `createReactComponent.ForgeFrameComponent.callback@394.callback@415`, `createReactComponent.ForgeFrameComponent.callback@421`.

Evidence: [react](#evidence-react); typecheck.

### [drivers/react/lifecycle.ts](../packages/forgeframe/src/drivers/react/lifecycle.ts)

Creating sync state, selecting the current identity, and releasing refs are operations. Mounting sequences construction, observer registration, render readiness, and cleanup. Promise callbacks discard results for obsolete mounts before applying state.

- **O:** `isCurrentSyncState`, `createPropSyncState`, `releaseInstanceRefs`.
- **I:** `mountReactInstance`, `mountReactInstance.isCurrent`.
- **O callbacks:** `mountReactInstance.callback@100`, `mountReactInstance.callback@107`, `mountReactInstance.callback@131.callback@133`.
- **I callbacks:** `mountReactInstance.callback@103`, `mountReactInstance.callback@112`, `mountReactInstance.callback@120`, `mountReactInstance.callback@131`.

Evidence: [react](#evidence-react); typecheck.

### [drivers/react/prop-sync.ts](../packages/forgeframe/src/drivers/react/prop-sync.ts)

Comparison, shallow snapshots, omission resets, and queue acknowledgement and failure transitions are explicit operations. Draining composes them around `updateProps` and checks identity at each await.

- **O:** `shallowEqualProps`, `deactivatePropSyncState`, `snapshotProps`, `buildPropUpdate`, `failPropUpdate`, `acknowledgePropUpdate`.
- **I:** `drainPropUpdates`.
- **O callbacks:** `snapshotProps.callback@80`.
- **M:** `enqueuePropSnapshot`.
- **Retained rationale —** `enqueuePropSnapshot`: Comparison chooses either one pending retry flag or an appended prepared payload. This short queue adapter keeps equivalent-commit behavior readable; comparison, reset construction and failure transitions are separate operations.

Evidence: [react](#evidence-react); typecheck.

### [events/emitter.ts](../packages/forgeframe/src/events/emitter.ts)

Each runtime keeps its emitter private; callers get the frozen `on`/`once` facade from `createEventSubscriber`, which rejects names outside the supplied set and non-function handlers before registering, so nobody outside the owning runtime can emit or remove other listeners. Listener storage keeps one registration token per handler and event, as DOM listeners do: registering a handler again keeps the first registration. Each returned unsubscribe function removes only the registration it created, so a stale handle cannot remove a newer registration of the same handler, and it also cancels a pending `once`. Emission runs each supplied observer in isolation, from a registration snapshot, in subscription order, and skips registrations removed before their turn. A `once` registration is removed immediately before its observer runs. New or replaced registrations wait for the next emission, so a rearmed `once` observer cannot loop within one dispatch. `dispose` clears every listener at the end of teardown and makes later registrations inert.

- **O:** `EventEmitter.register`, `EventEmitter.register.callback@83`, `EventEmitter.register.callback@93`, `EventEmitter.removeRegistration`, `EventEmitter.invokeHandler`, `EventEmitter.dispose`, `createEventSubscriber`, `createEventSubscriber.assertKnown`.
- **I:** `EventEmitter.on`, `EventEmitter.once`, `EventEmitter.emit`, `createEventSubscriber.on`, `createEventSubscriber.once`.
- **O callbacks:** `EventEmitter.invokeHandler.callback@158`.

Evidence: [consumer](#evidence-consumer), [component-events.test](../packages/forgeframe/tests/unit/component-events.test.ts), [host](#evidence-host); typecheck.

### [index.ts](../packages/forgeframe/src/index.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables. The entrypoint has named exports only.

Evidence: [contract](#evidence-contract); typecheck.

### [props/definition-checks.ts](../packages/forgeframe/src/props/definition-checks.ts)

Prop-definition admission is pure declaration policy over a supplied definitions record. `create()` and `initHost()` share it and call it before registering a factory or creating a host runtime. It rejects getter- or setter-defined entries without invoking them, because normalization reads the definitions again; it skips direct Standard Schemas and `undefined` entries and reads own property descriptors, so accessor-defined wrapped fields are not invoked; a data field set to `undefined` counts as omitted. `assertWrappedPropDefinition` rejects removed options (including `outputSchema`) with an error naming the replacement, a missing `schema`, a `deliverTo` that is neither `'same-origin'` nor a valid origin matcher (or mixes `'same-origin'` into an array), and a `queryParam` or `bodyParam` that is not a boolean or a non-empty name. `hasOwnDeclaredField` is the own-field rule; the reserved-name policy and `create()`'s removed component options read fields through it too. `component.test.ts`, `prop-definition-checks.test.ts`, and the handshake integration suite cover both entry points.

- **O:** `hasOwnDeclaredField`, `isDataField`, `readDeclaredField`, `assertWrappedPropDefinition`.
- **I:** `assertPropDefinitions`.

Evidence: [props](#evidence-props); typecheck.

### [props/definitions.ts](../packages/forgeframe/src/props/definitions.ts)

**Contract only:** the shared empty definitions map; no runtime callables. Instances have no built-in props: only declared props are normalized and sent.

Evidence: [props](#evidence-props); typecheck.

### [props/index.ts](../packages/forgeframe/src/props/index.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [props](#evidence-props); typecheck.

### [props/normalize.ts](../packages/forgeframe/src/props/normalize.ts)

Each defined prop's schema is the only source of its presence, default, and value: `normalizeProps` runs it on the supplied own value, including `undefined` for an omitted prop, and `assertSelfAccepting` turns a `validateUnchanged` outcome that is not `unchanged` into a definition-mistake error with the migrations. `validateUnchanged` is the one check every trust boundary shares: it runs the prop schema on a normalized value and reports `unchanged`, `changed`, or `rejected` with the schema's issues. `revalidatePropInputs` and `validateNormalizedProps` recheck supplied inputs and normalized outputs at trust boundaries, the latter through `validateUnchanged` and `assertValidatesUnchanged`, which keeps the schema's own issue for a rejection and reports a changed value as no longer matching; `buildUnnormalizedProps` builds the never-delivered snapshot kept after a construction-time failure; a schema or default that throws there leaves the prop `undefined`. Output equality is a cohesive cycle-aware algorithm.

`createDeliveryTarget` turns a host origin and the consumer's origin into a delivery target, so both sides agree on same-origin status and an opaque origin never counts. `isPropDelivered` is the pure delivery policy over a definition and that target; `getDeliveredPropDefinitions`, `getPropsForHost`, `validatePropsForHostTransport`, and the query/body integrations all use it. `propsToRequestParams` treats the unloaded host as not same-origin, so `deliverTo: 'same-origin'` props are never in the initial request; `serializePropParameter` encodes admitted values.

`getCompiledPropDefinitions` compiles only the supplied definitions and drops entries set to `undefined`, so undeclared inputs, including names of removed v1 lifecycle callbacks, are never normalized or sent. Its filter and map callbacks are **O**; unit tests cover omitted definitions, and public integration tests cover construction, bootstrap, updates, and close.

- **O:** `hasOwn`, `schemaOutputMatchesInput`, `getCompiledPropDefinitions`, `readSuppliedProp`, `isDeclaredProp`, `selectExpectedFields`, `assertSelfAccepting`, `assertValidatesUnchanged`, `buildUnnormalizedProps`, `createDeliveryTarget`, `isPropDelivered`, `serializePropParameter`.
- **I:** `normalizeProps`, `revalidatePropInputs`, `validateNormalizedProps`, `getDeliveredPropDefinitions`, `getPropsForHost`, `validatePropsForHostTransport`, `propsToQueryParams`, `propsToBodyParams`.
- **M:** `validateUnchanged`, `propsToRequestParams`.
- **O callbacks:** `getCompiledPropDefinitions.callback@137`, `getCompiledPropDefinitions.callback@138`, `getDeliveredPropDefinitions.callback@434`, `getDeliveredPropDefinitions.callback@435`, `selectExpectedFields.callback@181`.
- **Retained rationale —** `validateUnchanged`: It runs the schema and maps the result to one of three outcomes with a single comparison; the outcome is the shared contract every trust boundary reads, so the comparison stays with the run it describes.
- **Retained rationale —** `propsToRequestParams`: Parameter naming (`true` uses the key, a string names the parameter) is one expression inside the loop that applies delivery policy and encoding; it belongs to that loop.

Evidence: [props](#evidence-props); typecheck.

### [props/prop.ts](../packages/forgeframe/src/props/prop.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [props](#evidence-props); typecheck.

### [props/prop/base.ts](../packages/forgeframe/src/props/prop/base.ts)

Presence selection is separate from running default and nested validation. `copyDefaultValue` copies array, plain-object and `Date` defaults on each use, recursively, so instances never share a default; `assertNestedSchema` is the construction check every composite builder shares. Callable defaults require factories, including on widened optional and nullable builders; scalar defaults are plain values, and a default removes `undefined` from the output type unless the default can be `undefined`. Refinements are `SchemaCheck` lists: `addSchemaCheck` appends without replacing earlier checks of the same kind and keeps rank order, and `findFailedSchemaCheck` reports the first failure. Decomposition uses free functions so the exported classes keep their members, and the immutable fluent builders below are the deliberate exceptions. Invoking a runtime schema is one validation boundary operation.

- **O:** `copyDefaultEntry`, `assertNestedSchema`, `testRegExpStateless`, `validateSchemaSync`, `prependIssuePath`, `getValueKind`, `formatDateForMessage`, `defineDataProperty`, `validateDateBound`, `addSchemaCheck`, `findFailedSchemaCheck`, `selectSchemaPresence`, `PropSchema._copyBaseTo`.
- **I:** `copyDefaultValue`, `validateSchemaPresence`, `PropSchema.validate`, `PropSchema._validateInput`.
- **M:** `PropSchema.optional`, `PropSchema.nullable`, `PropSchema.default`, `PropSchema._getDefaultValue`.
- **O callbacks:** `addSchemaCheck.callback@110`, `findFailedSchemaCheck.callback@118`.
- **I callbacks:** `prependIssuePath.callback@45`, `PropSchema._validateInput.callback@308`, `PropSchema._validateInput.callback@309`.
- **Retained rationale —** `PropSchema._getDefaultValue`: One ternary picks a factory call or a copy of the literal default; the copy rule is `copyDefaultValue`, so the method only states which kind of default it holds.
- **Retained rationale —** `PropSchema.optional`, `PropSchema.nullable`, `PropSchema.default`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.

Evidence: [props](#evidence-props); typecheck.

### [props/prop/composite.ts](../packages/forgeframe/src/props/prop/composite.ts)

Outer shape and length constraints and strict-key selection are separate from nested schema traversal. Array length refinements accumulate as checks. Child validation reads own field values and passes omitted fields to presence and default handling as `undefined`. Issue-path accumulation and result assembly are cohesive algorithms. Exported classes keep their members and inference.

`ArraySchema.constructor`, `ObjectSchema.constructor`, `RecordSchema.constructor` and `TupleSchema.constructor` require their nested schemas (and the object its shape) and throw a `TypeError` that points to `prop.any()` otherwise, through the shared `assertNestedSchema` in `base.ts`. `TupleSchema.constructor` copies indexed positions without calling the caller's array iterator, and `ObjectSchema.constructor` copies own shape entries. Caller mutations cannot change these definitions or their presence clones.

- **O:** `ArraySchema.constructor`, `TupleSchema.constructor`, `ObjectSchema.constructor`, `RecordSchema.constructor`, `validateArrayItems`, `validateTupleItems`, `findUnknownObjectKey`, `validateObjectFields`, `validateRecordEntries`, `checkArrayConstraints`, `checkTupleConstraints`, `checkRecordInput`.
- **I:** `ArraySchema._validate`, `TupleSchema._validate`, `ObjectSchema._validate`, `RecordSchema._validate`.
- **M:** `ArraySchema._clone`, `ArraySchema._withCheck`, `ArraySchema.min`, `ArraySchema.max`, `ArraySchema.nonempty`, `TupleSchema._clone`, `ObjectSchema._clone`, `ObjectSchema.strict`, `RecordSchema._clone`.
- **O callbacks:** `ArraySchema.min.test`, `ArraySchema.max.test`, `findUnknownObjectKey.callback@380`.
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
- **O callbacks:** `EnumSchema._validate.callback@100`.
- **I callbacks:** `UnionSchema._validateInput.callback@167`, `UnionSchema._validateInput.callback@168`.
- **Retained rationale —** `LiteralSchema._clone`, `EnumSchema._clone`, `UnionSchema._clone`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.

Evidence: [props](#evidence-props); typecheck.

### [props/prop/primitives.ts](../packages/forgeframe/src/props/prop/primitives.ts)

Scalar validation is cohesive: string trimming and constraints, number bounds and integer checks, and `Date` bounds are algorithms, not workflows. Each refinement adds a check instead of overwriting a shared slot, so `.email().pattern()` and `.min(10).positive()` apply both rules. String checks run lengths, then URL syntax, then patterns; number checks run integer, then lower, then upper bounds. Messages name the failed rule, such as `Expected number, got NaN` and `Number must be > 0`. Builder exceptions keep clone/set/return local. Callback default validation sequences one factory evaluation and the result's validation, keeping optional/nullable presence without invoking the returned callback.

Number validation rejects nonfinite values before JSON transport can turn them into `null`. `isHttpUrl` parses absolute HTTP(S) URL syntax. String clones carry this constraint independently of regex patterns, and validation returns the input unchanged.

- **O:** `isHttpUrl`, `StringSchema._validate`, `NumberSchema._validate`, `DateSchema._validate`, `BooleanSchema._validate`, `FunctionSchema._validate`, `AnySchema.constructor`, `AnySchema._validate`.
- **I:** `FunctionSchema._validateInput`.
- **M:** `StringSchema._clone`, `StringSchema._withCheck`, `StringSchema.min`, `StringSchema.max`, `StringSchema.length`, `StringSchema.pattern`, `StringSchema.email`, `StringSchema.url`, `StringSchema.uuid`, `StringSchema.trim`, `StringSchema.nonempty`, `NumberSchema._clone`, `NumberSchema._withCheck`, `NumberSchema.min`, `NumberSchema.max`, `NumberSchema.int`, `NumberSchema.positive`, `NumberSchema.nonnegative`, `NumberSchema.negative`, `DateSchema._clone`, `DateSchema._withCheck`, `DateSchema.min`, `DateSchema.max`, `BooleanSchema._clone`, `FunctionSchema._clone`, `AnySchema._clone`.
- **O callbacks:** `StringSchema.min.test`, `StringSchema.max.test`, `StringSchema.pattern.test`, `NumberSchema.min.test`, `NumberSchema.max.test`, `NumberSchema.positive.test`, `NumberSchema.negative.test`, `DateSchema.min.test`, `DateSchema.max.test`.
- **Retained rationale —** `StringSchema._clone`, `StringSchema._withCheck`, `StringSchema.min`, `StringSchema.max`, `StringSchema.length`, `StringSchema.pattern`, `StringSchema.email`, `StringSchema.url`, `StringSchema.uuid`, `StringSchema.trim`, `StringSchema.nonempty`, `NumberSchema._clone`, `NumberSchema._withCheck`, `NumberSchema.min`, `NumberSchema.max`, `NumberSchema.int`, `NumberSchema.positive`, `NumberSchema.nonnegative`, `NumberSchema.negative`, `DateSchema._clone`, `DateSchema._withCheck`, `DateSchema.min`, `DateSchema.max`, `BooleanSchema._clone`, `FunctionSchema._clone`, `AnySchema._clone`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.

Evidence: [props](#evidence-props); typecheck.

### [props/schema.ts](../packages/forgeframe/src/props/schema.ts)

Standard Schema detection (including callable schemas such as ArkType types), issue-path formatting, and invoking a supplied schema (`runSchema`, which reports issues instead of throwing) are validation boundary operations. `validateWithSchema` runs `runSchema` and throws its issues as one "Validation failed" error. `isAsyncSchemaResult` observes unsupported promises across realms without awaiting validation, so direct and nested validation and the normalization default and output probes cannot leak rejected results. Its catch callback discards the refused result; callers see the synchronous error.

- **O:** `isStandardSchema`, `isAsyncSchemaResult`, `runSchema`, `formatIssuePath`.
- **M:** `validateWithSchema`.
- **O callbacks:** `runSchema.callback@290`, `formatIssuePath.callback@328`.
- **Retained rationale —** `validateWithSchema`: It runs `runSchema` and turns its issues into the thrown "Validation failed" error with one branch, the same shape as `validateUnchanged`; the throw belongs to the run it reports.

Evidence: [props](#evidence-props); typecheck.

### [props/serialize.ts](../packages/forgeframe/src/props/serialize.ts)

Prop snapshots use the recursive bridge codec directly, so prop definitions do not affect encoding or decoding. `serializeProps` skips `undefined` values and props whose root `toJSON()` returns `undefined`. `deserializeProps` drops unsafe root keys with the bridge's `isSafeObjectKey` and decodes each value through the bridge, which reconstructs callbacks and `Date` values together inside the transport-owned batch. Decoding needs only the bridge and the consumer window and origin.

- **O:** `serializeProps`, `deserializeProps`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [props/types.ts](../packages/forgeframe/src/props/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [props](#evidence-props); typecheck.

### [render/iframe-configuration.ts](../packages/forgeframe/src/render/iframe-configuration.ts)

CSS key/value encoding and boolean HTML-attribute representation use only supplied data. Custom property names keep their case, unitless numeric styles stay numbers, and other numeric values become pixels.

- **O:** `encodeIframeStyle`, `encodeIframeAttribute`.

Evidence: [render](#evidence-render), [iframe-configuration.test](../packages/forgeframe/tests/unit/iframe-configuration.test.ts); typecheck.

### [render/iframe.ts](../packages/forgeframe/src/render/iframe.ts)

Reserved attributes are checked before element creation. Dimensions use the shared `applyDimensions` from `render/templates.ts`. Style and attribute decisions use supplied data; applying them keeps write order, default sandbox timing, and explicit empty values.

- **O:** `assertSafeIframeAttributes`, `destroyIframe`, `showIframe`, `hideIframe`, `focusIframe`.
- **I:** `createIframeElement`, `resizeIframe`, `applyStyles`, `applyAttributes`.
- **M:** `applyDefaultSandbox`.
- **Retained rationale —** `applyDefaultSandbox`: One sandbox-presence guard and one DOM write express the whole default policy. The guard reads the attribute the element actually has, so HTML's case folding (`Sandbox`) and values that write nothing (`false`) are handled once, where the attributes were applied. Keep explicit empty sandbox distinct from omission.

Evidence: [render](#evidence-render); typecheck.

### [render/popup-layout.ts](../packages/forgeframe/src/render/popup-layout.ts)

Geometry, window features, and capped polling-delay growth use explicit screen and dimension data.

- **O:** `buildPopupFeatures`, `nextPopupPollInterval`.

Evidence: [render](#evidence-render), [popup-layout.test](../packages/forgeframe/tests/unit/popup-layout.test.ts); typecheck.

### [render/popup.ts](../packages/forgeframe/src/render/popup.ts)

Opening coordinates geometry with the browser action; a `null` window and the module-private `isPopupBlocked` heuristics both make it throw `PopupOpenError`. `resizePopup` reports `false` when the browser denies access to another origin's window. Polling is one timer resource with a supplied `onClose` callback; its cancellation closure only clears the owned timer.

- **O:** `PopupOpenError.constructor`, `closePopup`, `focusPopup`, `isPopupBlocked`, `watchPopupClose`, `watchPopupClose.invokeCallback`, `watchPopupClose.check`, `resizePopup`.
- **I:** `openPopup`.
- **O callbacks:** `watchPopupClose.callback@291`.

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

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [contract](#evidence-contract); typecheck.

### [types/runtime.ts](../packages/forgeframe/src/types/runtime.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

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

### [utils/domain-pattern.ts](../packages/forgeframe/src/utils/domain-pattern.ts)

Wildcard compilation and stateless regex testing are cohesive algorithms. Keep the compile cache and the `lastIndex` protection. `assertDomainMatcher` rejects configured matchers that would silently disable or widen an origin policy: values other than non-empty strings, `RegExp`s, or arrays of them. An empty array is valid and matches nothing.

- **O:** `escapeRegExp`, `compileWildcardDomainPattern`, `testDomainRegExpStateless`, `assertDomainMatcher`, `assertDomainMatcher.isPattern`.
- **O callbacks:** `compileWildcardDomainPattern.callback@43`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [utils/error.ts](../packages/forgeframe/src/utils/error.ts)

Unknown-error conversion keeps `Error` identity and ordinary coercion, with a stable fallback when coercion throws. It owns no runtime state and reads no browser state.

- **O:** `normalizeError`.

Evidence: [error.test](../packages/forgeframe/tests/unit/error.test.ts), [messaging](#evidence-messaging); typecheck.

### [utils/origin.ts](../packages/forgeframe/src/utils/origin.ts)

Origins are serialized strings: the JavaScript `null` means no origin is known yet, and the string `"null"` is the serialization every opaque origin shares. `isOpaqueOrigin` is the one check for the second meaning; messenger trust and peer selection use it so `"null"` never identifies a peer.

- **O:** `isOpaqueOrigin`.

Evidence: [messaging](#evidence-messaging), [consumer](#evidence-consumer); typecheck.

### [utils/promise.ts](../packages/forgeframe/src/utils/promise.ts)

Deferred creation and timeout wrapping are cohesive platform operations. Executor, timer, and completion callbacks claim resolver references or settle the owned promise; there is no domain workflow.

- **O:** `createDeferred`, `promiseTimeout`.
- **O callbacks:** `createDeferred.callback@48`, `promiseTimeout.callback@92`, `promiseTimeout.callback@92.callback@93`, `promiseTimeout.callback@92.callback@99`, `promiseTimeout.callback@92.callback@103`.

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

HTTP(S), credential, and domain URL validation is one cohesive supplied-data operation and reads no browser globals; browser integrations supply `document.baseURI` and pin the validated absolute URL before lifecycle callbacks. Query suffixes are inserted before the first fragment delimiter without changing existing query bytes.

- **O:** `resolveComponentHostUrl`, `appendComponentQuery`.

Evidence: [utilities](#evidence-utilities), [url.test](../packages/forgeframe/tests/unit/url.test.ts), [consumer-navigation.test](../packages/forgeframe/tests/unit/consumer-navigation.test.ts); typecheck.

### [utils/wire-value.ts](../packages/forgeframe/src/utils/wire-value.ts)

`Date` framing, record escaping, and array admission are codec operations; keep malformed-`Date` handling together. Escaping applies to ordinary records shaped like function, `Date`, or escaped-record markers once their fields are encoded; other records, including the former BASE64 and DOTIFY wrapper shapes, are ordinary data. Encoded records keep native raw JSON unchanged, so `toWrittenJsonValue` reads a marker field as the receiver will parse it, and a raw JSON `"function"`, `"date"` or `"record"` marker is escaped like the plain string.

`toJsonValue` applies one native JSON conversion (a callable `toJSON(key)`, then unboxing) for the bridge. `unboxJsonPrimitive` unboxes primitive wrappers with a local dummy encoder and an empty native JSON property list, avoiding exception-driven probes of ordinary records. It reuses the conversion so coercion hooks run once, and reads no ordinary fields, branding getters, or proxy prototype metadata. Arrays returned by `toJSON()` bypass the probe, so their entries are still bridged. `isRawJsonValue` detects native raw JSON with `JSON.isRawJSON`, resolved once at module load when the runtime has it, including values from another realm, so the bridge can pass it through.

`assertDefinedArrayEntries` checks normalized container values with cycle-safe traversal and without calling custom JSON encoders. It mirrors the bridge: arrays are read entry by entry, `convertsThroughJsonEncoder` defers a non-array object with a callable `toJSON` to delivery checks after its encoder runs, and `__proto__` fields are skipped because encoding omits them. `assertDefinedArrayEntry` also guards bridge arrays, including holes, before JSON can turn entries into `null`. `hasJsonEncoder` inspects descriptors without invoking computed properties, and a non-callable `toJSON` field is ordinary data.

- **O:** `needsRecordEscape`, `toWrittenJsonValue`, `escapeWireRecord`, `isRecordWireValue`, `assertDefinedArrayEntry`, `assertDefinedArrayEntries`, `convertsThroughJsonEncoder`, `hasJsonEncoder`, `isObjectRecord`, `hasOwnKey`, `encodeDateWireValue`, `isDateWireValue`, `decodeDateWireValue`, `isRawJsonValue`, `toJsonValue`, `unboxJsonPrimitive`.
- **O callbacks:** `needsRecordEscape.callback@20`, `unboxJsonPrimitive.toJSON`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [window/helpers.ts](../packages/forgeframe/src/window/helpers.ts)

Browser observations and defensive window reads are operations. Recursive domain matching is a cohesive algorithm; security exceptions are part of the browser boundary.

- **O:** `getDomain`, `isSameDomain`, `matchDomain`, `isWindowClosed`, `getOpener`, `getConsumer`, `isIframe`, `isPopup`, `waitForWindowFocus`.
- **O callbacks:** `matchDomain.callback@116`, `waitForWindowFocus.callback@288`, `waitForWindowFocus.callback@288.done`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [window/name-payload.ts](../packages/forgeframe/src/window/name-payload.ts)

Envelope framing is separate from protocol classification. `classifyWindowNamePayload` is pure policy over a decoded value: current protocol 3 metadata (copied without unknown fields), a payload from another protocol with its protocol and package version, or invalid. An older payload is recognised only when it carries the channel fields every older consumer wrote (uid, tag, context, consumer domain); a newer one needs only its tag. Reading never writes `window.name`; a name that throws or lacks the prefix yields null, and an undecodable or oversized one is invalid.

- **O:** `buildWindowName`, `isObjectRecord`, `isNonEmptyString`, `isContext`, `classifyWindowNamePayload`, `encodePayload`, `decodePayload`, `createWindowPayload`.
- **I:** `isForgeFrameWindow`, `readWindowNamePayload`.

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
