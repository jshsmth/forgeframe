---
name: iosp-review
title: ForgeFrame callable reference
desc: Runtime callable responsibilities, IOSP classifications, and boundary test evidence.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-10-01T01:55:30Z
---

# ForgeFrame callable reference

This reference describes runtime responsibilities and the tests that exercise their boundaries. Type-only declarations, overload signatures and abstract methods have no runtime body; export/type barrels are explicitly accounted for below. Repetitive accessors and fluent builders share the stated rationale.

Use [architecture and state ownership](architecture.md) to follow a workflow. Use this reference when changing an individual callable. `callback@N` identifies an anonymous closure at source line N in its enclosing callable; named property arrows are listed by their enclosing name. Refresh source line locators when changing the callable.

- **O — operation:** one cohesive rule, transformation, state transition, supplied-callback boundary or platform action. Recursive codecs, traversals and validation algorithms may use local implementation helpers without becoming workflows.
- **I — integration:** sequences package behaviour. Branches selecting the next action, current-instance/cancellation guards and passed-through values are control flow.
- **M — retained small mixed helper:** listed with a specific locality/readability rationale. These are deliberate exceptions to avoid wrappers that only relocate a few statements.

Pure policy consumes observed facts; integrations/adapters obtain browser evidence. State remains owned by the existing runtime.

## Boundary tests

| Evidence group | Suites |
| --- | --- |
| <a id="evidence-props"></a>props | [props.test](../packages/forgeframe/tests/unit/props.test.ts), [prop-schema.test](../packages/forgeframe/tests/unit/prop-schema.test.ts), [schema.test](../packages/forgeframe/tests/unit/schema.test.ts), [schema-contract.test](../packages/forgeframe/tests/unit/schema-contract.test.ts), [schema-interoperability.test](../packages/forgeframe/tests/unit/schema-interoperability.test.ts), [schema-path-format.test](../packages/forgeframe/tests/unit/schema-path-format.test.ts), [props-alias-materialization.test](../packages/forgeframe/tests/unit/props-alias-materialization.test.ts), [props-alias-updates.test](../packages/forgeframe/tests/unit/props-alias-updates.test.ts), [props-alias-sync.test](../packages/forgeframe/tests/integration/props-alias-sync.test.ts), [props-sync.test](../packages/forgeframe/tests/integration/props-sync.test.ts) |
| <a id="evidence-messaging"></a>messaging | [bridge.test](../packages/forgeframe/tests/unit/bridge.test.ts), [messenger.test](../packages/forgeframe/tests/unit/messenger.test.ts), [messenger-routing.test](../packages/forgeframe/tests/unit/messenger-routing.test.ts), [protocol.test](../packages/forgeframe/tests/unit/protocol.test.ts), [function-prop-bridge.test](../packages/forgeframe/tests/integration/function-prop-bridge.test.ts), [host-controls-routing.test](../packages/forgeframe/tests/integration/host-controls-routing.test.ts) |
| <a id="evidence-render"></a>render | [consumer-renderer.test](../packages/forgeframe/tests/unit/consumer-renderer.test.ts), [iframe.test](../packages/forgeframe/tests/unit/iframe.test.ts), [popup.test](../packages/forgeframe/tests/unit/popup.test.ts), [render-templates.test](../packages/forgeframe/tests/unit/render-templates.test.ts), [body-param-bootstrap.test](../packages/forgeframe/tests/integration/body-param-bootstrap.test.ts), [popup-host-handshake.test](../packages/forgeframe/tests/integration/popup-host-handshake.test.ts) |
| <a id="evidence-consumer"></a>consumer | [component.test](../packages/forgeframe/tests/unit/component.test.ts), [component-clone.test](../packages/forgeframe/tests/unit/component-clone.test.ts), [component-instance-index.test](../packages/forgeframe/tests/unit/component-instance-index.test.ts), [consumer-lifecycle.test](../packages/forgeframe/tests/unit/consumer-lifecycle.test.ts), [consumer-branch-coverage.test](../packages/forgeframe/tests/unit/consumer-branch-coverage.test.ts), [consumer-transport.test](../packages/forgeframe/tests/unit/consumer-transport.test.ts), [consumer-host-handshake.test](../packages/forgeframe/tests/integration/consumer-host-handshake.test.ts), [host-controls-routing.test](../packages/forgeframe/tests/integration/host-controls-routing.test.ts) |
| <a id="evidence-host"></a>host | [host-security.test](../packages/forgeframe/tests/unit/host-security.test.ts), [host-lifecycle.test](../packages/forgeframe/tests/unit/host-lifecycle.test.ts), [host-branch-coverage.test](../packages/forgeframe/tests/unit/host-branch-coverage.test.ts), [host-transport.test](../packages/forgeframe/tests/unit/host-transport.test.ts), [props-sync.test](../packages/forgeframe/tests/integration/props-sync.test.ts), [consumer-host-handshake.test](../packages/forgeframe/tests/integration/consumer-host-handshake.test.ts) |
| <a id="evidence-react"></a>react | [react-host-sync.test](../packages/forgeframe/tests/integration/react-host-sync.test.ts), [react-driver-lifecycle.test](../packages/forgeframe/tests/unit/react-driver-lifecycle.test.ts), [react-driver-prop-sync.test](../packages/forgeframe/tests/unit/react-driver-prop-sync.test.ts), [react-prop-queue.test](../packages/forgeframe/tests/unit/react-prop-queue.test.ts), [react-driver-dom.test](../packages/forgeframe/tests/integration/react-driver-dom.test.ts) |
| <a id="evidence-utilities"></a>utilities | [utils.test](../packages/forgeframe/tests/unit/utils.test.ts), [domain-pattern.test](../packages/forgeframe/tests/unit/domain-pattern.test.ts), [window-helpers.test](../packages/forgeframe/tests/unit/window-helpers.test.ts), [window-name-payload.test](../packages/forgeframe/tests/unit/window-name-payload.test.ts), [props-serialize.test](../packages/forgeframe/tests/unit/props-serialize.test.ts), [protocol.test](../packages/forgeframe/tests/unit/protocol.test.ts) |
| <a id="evidence-contract"></a>contract | [package-contract.test](../packages/forgeframe/tests/unit/package-contract.test.ts), [index-node-smoke.test](../packages/forgeframe/tests/unit/index-node-smoke.test.ts), [index-side-effect-free.test](../packages/forgeframe/tests/unit/index-side-effect-free.test.ts), [component-node-runtime-transition.test](../packages/forgeframe/tests/unit/component-node-runtime-transition.test.ts), [version.test](../packages/forgeframe/tests/unit/version.test.ts) |

Compile-time checks and browser suites are described in the [test index](../packages/forgeframe/tests/README.md). Current validation commands are listed in the [root README](../README.md).

## Module and callable classifications

### [communication/bridge.ts](../packages/forgeframe/src/communication/bridge.ts)

Registry reconciliation, capacity admission, reference framing and remote wrapper creation are separate responsibilities. Retain recursive object/array codecs and local ID reconciliation as cohesive algorithms; CALL and PEER_CALL invoke supplied functions after browser-source authorization. The call channel is supplied to the bridge so peer relay registries retain a lifetime independent of props/export batches. Reference guards require the complete own-property wire shape and preserve records with extra user fields.

Ordinary marker-shaped records are escaped after JSON conversion and omission and restored as data, including nested escape markers, across JSON/BASE64/DOTIFY props and exports.

Local callback admission rejects oversized 500-function snapshots without eviction. Batch ownership records new IDs for pre-delivery rollback, while uncertain delivery preserves references within a 1,000-entry pool. Append-mode peer relays retain a cumulative 500-reference bound. Verified reconnect cleanup is sequenced inside the consumer props queue before bootstrap serialization, releasing strong registrations while preserving weak IDs used by props already acknowledged by the new document. Remote wrapper cache eviction and recursive codec semantics remain unchanged.

Array encoding checks every position before mapping, rejecting undefined entries and sparse holes for both props and exports while leaving object-field omission and function/Date framing unchanged.

- **O:** `isSafeObjectKey`, `FunctionBridge.retainLocalFunction`, `FunctionBridge.findRemoteWrapper`, `FunctionBridge.evictOldestRemote`, `FunctionBridge.assertLocalCapacity`, `FunctionBridge.clearBatch`, `FunctionBridge.createRemoteWrapper`, `FunctionBridge.isFunctionRef`, `FunctionBridge.removeLocal`, `FunctionBridge.startBatch`, `FunctionBridge.staleLocalIds`, `FunctionBridge.clearRemote`, `FunctionBridge.localFunctionCount`, `FunctionBridge.remoteFunctionCount`, `serializeFunctions`, `deserializeFunctions`, `createFunctionRef`.
- **I:** `FunctionBridge.constructor`, `FunctionBridge.serialize`, `FunctionBridge.deserialize`, `FunctionBridge.createRemoteWrapper.wrapper`, `FunctionBridge.setupCallHandler`, `FunctionBridge.finishBatch`, `FunctionBridge.abortBatch`, `FunctionBridge.clearLocal`, `FunctionBridge.destroy`.
- **O callbacks:** `FunctionBridge.constructor.callback@96`, `FunctionBridge.setupCallHandler.callback@231`, `FunctionBridge.staleLocalIds.callback@299`.
- **I callbacks:** `serializeFunctions.callback@372`, `deserializeFunctions.callback@433`.

Evidence: [messaging](#evidence-messaging); typecheck.

### [communication/index.ts](../packages/forgeframe/src/communication/index.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [messaging](#evidence-messaging), typecheck.

### [communication/messenger.ts](../packages/forgeframe/src/communication/messenger.ts)

Admission precedes decoding; channel, usable source, expected origin and pending target identity remain explicit. Execution and response encoding are cohesive boundary operations; their workflow and posting are named separately. Trusted-domain recursion is one matcher-registry algorithm.

- **O:** `isPendingResponseSourceMatch`, `normalizeTargetDomainToExpectedOrigin`, `Messenger.addTrustedDomain`, `Messenger.removeTrustedDomain`, `Messenger.isOriginTrusted`, `Messenger.on`, `Messenger.settlePendingResponse`, `Messenger.executeRequest`, `Messenger.serializeResponse`, `Messenger.postResponse`, `Messenger.isDestroyed`.
- **I:** `Messenger.constructor`, `Messenger.send`, `Messenger.post`, `Messenger.setupListener`, `Messenger.setupListener.this.listener`, `Messenger.readTrustedMessage`, `Messenger.handleMessage`, `Messenger.handleRequest`, `Messenger.destroy`.
- **O callbacks:** `Messenger.removeTrustedDomain.callback@197`, `Messenger.removeTrustedDomain.callback@203`, `Messenger.on.callback@334`.
- **I callbacks:** `Messenger.send.callback@263`.

Evidence: [messaging](#evidence-messaging); typecheck.

### [communication/protocol.ts](../packages/forgeframe/src/communication/protocol.ts)

Envelope framing and prefixed JSON encoding/decoding are operations. Malformed messages keep their null fallback.

- **O:** `serializeMessage`, `deserializeMessage`, `createRequestMessage`, `createResponseMessage`.

Evidence: [messaging](#evidence-messaging); typecheck.

### [communication/types.ts](../packages/forgeframe/src/communication/types.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [messaging](#evidence-messaging), typecheck.

### [constants.ts](../packages/forgeframe/src/constants.ts)

The VERSION initializer validates the injected build value. Other entries are immutable protocol/constants data.

- **O callbacks:** `callback@182`.

Evidence: [contract](#evidence-contract); typecheck.

### [core/component-instance-index.ts](../packages/forgeframe/src/core/component-instance-index.ts)

Map/index mutation and snapshots are cohesive state operations; this module remains the single active-instance index.

- **O:** `indexComponentInstance`, `removeIndexedComponentInstance`, `clearIndexedInstancesByTag`, `clearIndexedInstances`, `getComponentInstancesByTag`, `getIndexedComponentInstances`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/component-registry.ts](../packages/forgeframe/src/core/component-registry.ts)

Group registry registration, lookups, snapshots and deletion as state operations. Metadata remains owned by this registry.

- **O:** `registerComponent`, `hasRegisteredComponent`, `getRegisteredComponent`, `getRegisteredComponentEntries`, `getComponentOptions`, `getRegisteredComponentTags`, `deleteRegisteredComponent`, `clearRegisteredComponents`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/component.ts](../packages/forgeframe/src/core/component.ts)

Declaration policy receives options; static URL context selection receives observed origin. Factory construction and host configuration are integrations; getters are short delegates. Factory host-props caching checks the current singleton before reuse and rebinds after a failed bootstrap is retried. An owner callback removes factory and index identities before destruction observers, even after public listeners are removed. It propagates to clones; the retained event listener preserves synthetic destroy notifications.

- **O:** `assertComponentShape`, `staticUrlValidationContext`, `removeTrackedInstance`, `create.Component.canRenderTo`.
- **I:** `validateComponentOptions`, `validateStaticComponentUrl`, `create`, `create.untrackInstance`, `create.createTrackedInstance`, `create.canDetectComponentHost`, `create.syncHostProps`, `create.detectHostState`, `create.Component.isHost`, `create.Component.isEmbedded`, `create.get`, `getComponent`, `getRegisteredComponents`, `getComponentInstancesByTag`, `getIndexedComponentInstances`, `destroy`, `destroyByTag`, `destroyAll`, `unregisterComponent`, `clearComponents`.
- **M:** `create.trackInstance`.
- **I callbacks:** `create.trackInstance.callback@234`, `create.callback@305`, `destroyByTag.callback@452`, `destroyAll.callback@474`.
- **Retained rationale —** `create.trackInstance`: The factory-local guard, list append, index update and destruction subscription share one lifetime. Keep this short ownership adapter next to construction; removal bookkeeping is named separately.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer.ts](../packages/forgeframe/src/core/consumer.ts)

Lifecycle integrations preserve user-callback and cancellation checkpoints. Render guards, task release and destruction start are named state operations. Rendering captures previously admitted prop work after installing its lock, drains it before validation, and pins the validated navigation URL before lifecycle callbacks. Hook proxies wire the existing runtime, while response construction and browser reads remain local operations.

- **O:** `ConsumerComponent.uid`, `ConsumerComponent.assertRenderAllowed`, `ConsumerComponent.finishRenderTask`, `ConsumerComponent.applyPropsUpdate.isRendered`, `ConsumerComponent.assertPropsUpdateActive`, `ConsumerComponent.assertStableRenderedOrigin`, `ConsumerComponent.isDestroyed`, `ConsumerComponent.normalizeOptions`, `ConsumerComponent.createPropContext`, `ConsumerComponent.createConsumerExports`, `ConsumerComponent.createRenderCancellationError`, `ConsumerComponent.isRenderCancelled`, `ConsumerComponent.assertRenderActive`, `ConsumerComponent.beginDestroy`.
- **I:** `ConsumerComponent.constructor`, `ConsumerComponent.constructor.close`, `ConsumerComponent.constructor.focus`, `ConsumerComponent.render`, `ConsumerComponent.performRender`, `ConsumerComponent.emitRenderStage`, `ConsumerComponent.validateForRender`, `ConsumerComponent.renderTo`, `ConsumerComponent.close`, `ConsumerComponent.focus`, `ConsumerComponent.resize`, `ConsumerComponent.show`, `ConsumerComponent.hide`, `ConsumerComponent.updateProps`, `ConsumerComponent.applyPropsUpdate`, `ConsumerComponent.applyPropsUpdate.assertActive`, `ConsumerComponent.applyPropsUpdate.resolveUrl`, `ConsumerComponent.applyPropsUpdate.resolveUrlOrigin`, `ConsumerComponent.applyPropsUpdate.assertStableRenderedOrigin`, `ConsumerComponent.applyPropsUpdate.syncTrustedDomainForUrl`, `ConsumerComponent.applyPropsUpdate.shouldSendPropsToHost`, `ConsumerComponent.applyPropsUpdate.sendPropsUpdateToHost`, `ConsumerComponent.applyPropsUpdate.emitPropsUpdated`, `ConsumerComponent.sendPropsUpdateToHost`, `ConsumerComponent.clone`, `ConsumerComponent.resolveUrl`, `ConsumerComponent.resolveDimensions`, `ConsumerComponent.resolveUrlOrigin`, `ConsumerComponent.syncTrustedDomainForUrl`, `ConsumerComponent.createPropContext.onError`, `ConsumerComponent.resolveContainer`, `ConsumerComponent.checkEligibility`, `ConsumerComponent.prerender`, `ConsumerComponent.createIframeElement`, `ConsumerComponent.open`, `ConsumerComponent.open.assertActive`, `ConsumerComponent.open.buildUrl`, `ConsumerComponent.open.buildBodyParams`, `ConsumerComponent.open.buildWindowName`, `ConsumerComponent.open.submitBodyForm`, `ConsumerComponent.open.onPopupClose`, `ConsumerComponent.open.registerCleanup`, `ConsumerComponent.buildUrl`, `ConsumerComponent.buildBodyParams`, `ConsumerComponent.submitBodyForm`, `ConsumerComponent.buildWindowName`, `ConsumerComponent.waitForHost`, `ConsumerComponent.setupMessageHandlers`, `ConsumerComponent.setupMessageHandlers.onBootstrap`, `ConsumerComponent.setupMessageHandlers.onReconnect`, `ConsumerComponent.setupMessageHandlers.onClose`, `ConsumerComponent.setupMessageHandlers.onResize`, `ConsumerComponent.setupMessageHandlers.onFocus`, `ConsumerComponent.setupMessageHandlers.onShow`, `ConsumerComponent.setupMessageHandlers.onHide`, `ConsumerComponent.setupMessageHandlers.onError`, `ConsumerComponent.setupMessageHandlers.onExport`, `ConsumerComponent.setupMessageHandlers.onConsumerExport`, `ConsumerComponent.setupMessageHandlers.onGetSiblings`, `ConsumerComponent.setupCleanup`, `ConsumerComponent.teardownRenderResources`, `ConsumerComponent.destroy`.
- **M:** `ConsumerComponent.isEligible`, `ConsumerComponent.createPropContext.close`, `ConsumerComponent.createPropContext.focus`.
- **O callbacks:** `ConsumerComponent.constructor.callback@163`, `ConsumerComponent.constructor.callback@182`, `ConsumerComponent.performRender.callback@314`, `ConsumerComponent.waitForHost.callback@832`.
- **I callbacks:** `ConsumerComponent.constructor.callback@164`, `ConsumerComponent.constructor.callback@174`, `ConsumerComponent.constructor.callback@181`, `ConsumerComponent.performRender.callback@279`, `ConsumerComponent.prerender.callback@710`, `ConsumerComponent.prerender.callback@711`, `ConsumerComponent.prerender.callback@712`, `ConsumerComponent.setupMessageHandlers.onBootstrap.callback@873`, `ConsumerComponent.setupCleanup.callback@919`.
- **Retained rationale —** `ConsumerComponent.isEligible`: Schema preparation followed by one optional eligibility result is a short public adapter; extracting the result wrapper would obscure the contract.
- **Retained rationale —** `ConsumerComponent.createPropContext.close`: The construction-time gate either records one action or calls close immediately. Keeping the two branches together exposes the synchronous behaviour.
- **Retained rationale —** `ConsumerComponent.createPropContext.focus`: The construction-time gate either records one action or calls focus immediately. Keeping the two branches together exposes the synchronous behaviour.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer/callbacks.ts](../packages/forgeframe/src/core/consumer/callbacks.ts)

Invoking one supplied observer, including async failure isolation, is a callback boundary operation. Consumer error delivery composes event and prop notification.

- **O:** `invokePropCallback`.
- **I:** `emitConsumerError`.
- **O callbacks:** `invokePropCallback.callback@35`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer/child-refs.ts](../packages/forgeframe/src/core/consumer/child-refs.ts)

Registry lookup is separate from metadata-to-reference construction. Creating lazy references does not construct child instances.

References omit executable prop definitions; hosts resolve them from their local registered factories. Recursive child schemas therefore cannot enter parent bootstrap serialization. Evidence also includes `consumer-host-handshake.test.ts`.

- **O:** `createNestedHostRef`.
- **I:** `buildNestedHostRefs`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer/prop-update.ts](../packages/forgeframe/src/core/consumer/prop-update.ts)

Patch merging, reset deletion and validation-key bookkeeping operate on explicit snapshots/sets, with no runtime construction.

- **O:** `mergePropPatch`, `invalidatePatchedKeys`, `definedInputKeys`, `recordValidatedKeys`.
- **O callbacks:** `definedInputKeys.callback@43`.

Evidence: [consumer](#evidence-consumer), [prop-update.test](../packages/forgeframe/tests/unit/prop-update.test.ts); typecheck.

### [core/consumer/props-pipeline.ts](../packages/forgeframe/src/core/consumer/props-pipeline.ts)

Preparation, schema/decorator sequencing, validation, candidate construction and commitment are separate. Queue ownership stays in the pipeline; disconnected updates also install their entries before user callbacks, and render admission drains the captured settled tail. Deferred normalization and clone restoration retain validation evidence. Regression evidence includes [consumer-props-queue.test](../packages/forgeframe/tests/unit/consumer-props-queue.test.ts).

Update admission now checks deliverable array values after URL/origin policy and before snapshot commitment. Render admission performs the same check before allocating resources. Delivery-time checks retain host-decorator/custom-encoder timing and the existing post-commit transport failure semantics.

- **O:** `UserNormalizationCallbackFailure.constructor`, `buildPropsSnapshot`, `ConsumerPropsPipeline.restoreSnapshot`, `ConsumerPropsPipeline.adoptNormalizedState`, `ConsumerPropsPipeline.deferFailedNormalization`, `ConsumerPropsPipeline.createSnapshot`, `ConsumerPropsPipeline.preparePropPatch`, `ConsumerPropsPipeline.commitSnapshot`.
- **I:** `prevalidateProvidedSchemaInputs`, `validateNormalizedSchemaValues`, `ConsumerPropsPipeline.constructor`, `ConsumerPropsPipeline.ensureSchemaValidated`, `ConsumerPropsPipeline.revalidateSchemaValues`, `ConsumerPropsPipeline.buildNextProps`, `ConsumerPropsPipeline.validateDeferredSnapshot`, `ConsumerPropsPipeline.normalizePatchedSnapshot`, `ConsumerPropsPipeline.validatePatchedSnapshot`, `ConsumerPropsPipeline.normalizeInputSnapshot`, `ConsumerPropsPipeline.revalidateSchemaInputs`, `ConsumerPropsPipeline.updateProps`, `ConsumerPropsPipeline.syncCurrentPropsToHost`, `ConsumerPropsPipeline.readCurrentProps`, `ConsumerPropsPipeline.queuePropsUpdate`, `ConsumerPropsPipeline.trackPendingUpdate`.
- **O callbacks:** `ConsumerPropsPipeline.constructor.callback@193`, `ConsumerPropsPipeline.trackPendingUpdate.callback@623`, `ConsumerPropsPipeline.trackPendingUpdate.callback@624`, `ConsumerPropsPipeline.trackPendingUpdate.callback@629`.
- **I callbacks:** `ConsumerPropsPipeline.updateProps.callback@509`, `ConsumerPropsPipeline.syncCurrentPropsToHost.callback@561`, `ConsumerPropsPipeline.readCurrentProps.callback@578`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer/renderer.ts](../packages/forgeframe/src/core/consumer/renderer.ts)

Prerender context construction, mounting, iframe/popup opening, POST submission and teardown have named entrypoints. `completePrerender` coordinates iframe swapping or popup loading removal after initialization, retaining the caller mount and custom shells. POST DOM/form work remains one browser operation; method calls use the created form's prototype from the mount document, and construction/submission share a cleanup guard so named controls cannot mask append, submit, or removal. Resource acquisition and user callbacks retain synchronous cancellation checkpoints.

- **O:** `ConsumerRenderer.constructor`, `ConsumerRenderer.resolveContainer`, `ConsumerRenderer.createTemplateContext`, `ConsumerRenderer.submitBodyForm`.
- **I:** `ConsumerRenderer.prerender`, `ConsumerRenderer.createTemplateContext.close`, `ConsumerRenderer.createTemplateContext.focus`, `ConsumerRenderer.createIframeElement`, `ConsumerRenderer.open`, `ConsumerRenderer.openIframe`, `ConsumerRenderer.openPopup`, `ConsumerRenderer.completePrerender`, `ConsumerRenderer.focus`, `ConsumerRenderer.resize`, `ConsumerRenderer.show`, `ConsumerRenderer.hide`, `ConsumerRenderer.destroy`.
- **M:** `ConsumerRenderer.mountPrerenderContent`.
- **I callbacks:** `ConsumerRenderer.openPopup.callback@293`.
- **Retained rationale —** `ConsumerRenderer.mountPrerenderContent`: Ownership checks, DOM attachment and cancellation assertions must stay adjacent: cancellation can occur inside DOM/template actions. This short mounting adapter makes those boundaries visible.

Evidence: [render](#evidence-render); typecheck.

### [core/consumer/siblings.ts](../packages/forgeframe/src/core/consumer/siblings.ts)

Index lookup supplies identities to a data-only peer selection/reference operation.

- **O:** `selectSiblingInstances`.
- **I:** `getSiblingInstances`.
- **O callbacks:** `getSiblingInstances.callback@35`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer/transport.ts](../packages/forgeframe/src/core/consumer/transport.ts)

Trusted matcher construction is data-only; window/origin observation and messenger rotation are integrations. Bootstrap and INIT integrations retain explicit source/session admission and state-transition order; control callbacks select the next protocol action. Their small response literals remain visible at the handler boundary. Peer discovery sequences indexed lookup and recursive serialization through a separate source-guarded relay bridge. Its batch bookkeeping is cleared without retiring held snapshots; reconnect and destroy clear relay identities.

- **O:** `ConsumerTransport.getHostDomain`, `ConsumerTransport.isHostConnected`, `ConsumerTransport.isHostControlSource`, `ConsumerTransport.resetHostWindow`, `collectTrustedDomains`.
- **I:** `ConsumerTransport.constructor`, `ConsumerTransport.buildTrustedDomains`, `ConsumerTransport.syncTrustedDomainForUrl`, `ConsumerTransport.serializePropsForHost`, `ConsumerTransport.sendPropsUpdateToHost`, `ConsumerTransport.buildWindowName`, `ConsumerTransport.waitForHost`, `ConsumerTransport.setupMessageHandlers`, `ConsumerTransport.onHostControl`, `ConsumerTransport.destroy`.
- **I callbacks:** `ConsumerTransport.constructor.callback@110`, `ConsumerTransport.setupMessageHandlers.callback@299`, `ConsumerTransport.setupMessageHandlers.callback@320`, `ConsumerTransport.setupMessageHandlers.callback@320.callback@335`, `ConsumerTransport.setupMessageHandlers.callback@320.callback@335.callback@336`, `ConsumerTransport.setupMessageHandlers.callback@346`, `ConsumerTransport.setupMessageHandlers.callback@351`, `ConsumerTransport.setupMessageHandlers.callback@356`, `ConsumerTransport.setupMessageHandlers.callback@361`, `ConsumerTransport.setupMessageHandlers.callback@366`, `ConsumerTransport.setupMessageHandlers.callback@373`, `ConsumerTransport.setupMessageHandlers.callback@382`, `ConsumerTransport.setupMessageHandlers.callback@398`, `ConsumerTransport.setupMessageHandlers.callback@405`, `ConsumerTransport.onHostControl.callback@416`.

Evidence: [consumer](#evidence-consumer); typecheck.

### [core/consumer/types.ts](../packages/forgeframe/src/core/consumer/types.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [consumer](#evidence-consumer), typecheck.

### [core/host.ts](../packages/forgeframe/src/core/host.ts)

Public host checks delegate to bootstrap/window adapters; the browser-free public import remains inert.

- **I:** `isHost`, `isEmbedded`, `getHostProps`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/bootstrap.ts](../packages/forgeframe/src/core/host/bootstrap.ts)

The singleton integration reuses/configures or constructs the runtime, retaining retry after failed asynchronous validation. Its ready callback clears only the instance it created.

Its destruction callback clears only the same owned instance. Cleanup releases the singleton before resource destruction, avoiding reentrant cleanup and allowing public teardown followed by fresh initialization from retained channel metadata.

- **O:** `getHost`.
- **I:** `readInitialPayload`, `initHost`, `clearHostInstance`.
- **I callbacks:** `initHost.onDestroy`, `initHost.ready.catch`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/builtin-keys.ts](../packages/forgeframe/src/core/host/builtin-keys.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [host](#evidence-host), typecheck.

### [core/host/component.ts](../packages/forgeframe/src/core/host/component.ts)

Constructor proxies bind the owning host fields and existing props/transport runtimes. Accessors delegate. Bootstrap readiness, source verification and teardown remain explicit integrations.

`HostComponent.destroy` sequences transport, observer and prop cleanup before notifying its bootstrap owner. The callback remains local to that owner; stale or repeated destruction cannot clear a replacement host. Evidence also includes `consumer-host-handshake.test.ts`.

- **O:** `HostComponent.constructor.getConsumerDomain@98`, `HostComponent.constructor.getConsumerWindow`, `HostComponent.constructor.getConsumerDomain@121`, `HostComponent.constructor.isConsumerDomainVerified`, `HostComponent.constructor.getMessenger`, `HostComponent.constructor.getBridge`, `HostComponent.constructor.get@131`, `HostComponent.constructor.get@135`, `HostComponent.constructor.get@139`, `HostComponent.constructor.get@143`, `HostComponent.constructor.isConsumerSource`.
- **I:** `HostComponent.constructor`, `HostComponent.constructor.close`, `HostComponent.constructor.focus`, `HostComponent.constructor.resize`, `HostComponent.constructor.show`, `HostComponent.constructor.hide`, `HostComponent.constructor.onError`, `HostComponent.constructor.exportData`, `HostComponent.constructor.consumerExport`, `HostComponent.constructor.getPeerInstances`, `HostComponent.constructor.onFirstHostPropsAccess`, `HostComponent.constructor.applySerializedProps`, `HostComponent.initializeFromConsumer`, `HostComponent.hostProps@196`, `HostComponent.hostProps@200`, `HostComponent.flushInit`, `HostComponent.getProps`, `HostComponent.getInitError`, `HostComponent.applyHostConfiguration`, `HostComponent.assertAllowedConsumerDomain`, `HostComponent.assertAllowedConsumerDomain.onConsumerDomainChange`, `HostComponent.destroy`.
- **O callbacks:** `HostComponent.constructor.callback@100`, `HostComponent.constructor.callback@165`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/consumer-origin-policy.ts](../packages/forgeframe/src/core/host/consumer-origin-policy.ts)

All trust policy uses supplied origins/options. HTTP(S) messaging bootstrap context is provisional until verified. A changed accessible/referrer origin wins over old verification.

- **O:** `assertAllowedConsumerDomain`, `selectConsumerSecurityContext`, `validateMessagingConsumerContext`, `selectObservedConsumerContext`, `assertVerifiedConsumerContext`.

Evidence: [host](#evidence-host), [consumer-origin-policy.test](../packages/forgeframe/tests/unit/consumer-origin-policy.test.ts); typecheck.

### [core/host/props-runtime.ts](../packages/forgeframe/src/core/host/props-runtime.ts)

Stable built-in reference construction is separate from consumer snapshot commitment and subscriber notification. Bootstrap schema relaxation is a supplied-data operation; stale custom props use own-key membership so inherited names cannot retain an old value; subscribers are invoked only after reconciliation. Notification observes promise/thenable failures without awaiting user work, preserving acknowledgement and event order.

`HostPropsRuntime.deserialize` filters explicit consumer-only wire fields using the delivered definitions before invoking the codec. Its filter callback is an **O** admission predicate using own-key membership; undeclared fields keep their existing behavior. Legacy/bootstrap and live-update state, subscribers, and events all use the filtered snapshot. Consumer-only definitions remain absent from host validation, so required local inputs do not prevent initialization.

The rejection callback in `HostPropsRuntime.notifyPropsHandlers` is an **O** callback boundary: it logs one observer failure and does not mutate prop state.

- **O:** `filterReservedHostPropKeys`, `HostPropsRuntime.constructor`, `HostPropsRuntime.createHostProps.getConsumer`, `HostPropsRuntime.exposeHostProps.set`, `HostPropsRuntime.commitHostProps`, `HostPropsRuntime.notifyPropsHandlers`, `HostPropsRuntime.destroy`, `HostPropsRuntime.onProps`, `HostPropsRuntime.onProps.cancel`, `HostPropsRuntime.removeStaleHostProps`, `HostPropsRuntime.getDeliveredPropDefinitions`, `relaxSameDomainBootstrapDefinitions`.
- **I:** `HostPropsRuntime.initializeHostProps`, `HostPropsRuntime.createHostProps`, `HostPropsRuntime.createHostProps.close`, `HostPropsRuntime.createHostProps.focus`, `HostPropsRuntime.createHostProps.resize`, `HostPropsRuntime.createHostProps.show`, `HostPropsRuntime.createHostProps.hide`, `HostPropsRuntime.createHostProps.onProps`, `HostPropsRuntime.createHostProps.onError`, `HostPropsRuntime.createHostProps.getConsumerDomain`, `HostPropsRuntime.createHostProps.export@111`, `HostPropsRuntime.createHostProps.export@114`, `HostPropsRuntime.createHostProps.getPeerInstances`, `HostPropsRuntime.exposeHostProps`, `HostPropsRuntime.exposeHostProps.get`, `HostPropsRuntime.applyHostConfiguration`, `HostPropsRuntime.applyBootstrap`, `HostPropsRuntime.applySerializedProps`, `HostPropsRuntime.deserialize`, `HostPropsRuntime.getBootstrapValidationDefinitions`, `HostPropsRuntime.buildNestedComponents`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/security.ts](../packages/forgeframe/src/core/host/security.ts)

Browser observations are distinct from policy. Reassertion retains messenger trust rotation before allowlist enforcement, including the existing failure path.

- **O:** `resolveConsumerWindow`, `getReferrerOrigin`, `getAccessibleConsumerOrigin`.
- **I:** `getVerifiedConsumerOrigin`, `resolveConsumerSecurityContext`, `resolveMessagingConsumerContext`, `reassertAllowedConsumerDomain`.

Evidence: [host](#evidence-host); typecheck.

### [core/host/transport.ts](../packages/forgeframe/src/core/host/transport.ts)

Outbound export batches share a FIFO queue. Serialization failure aborts new bridge registrations; send failure preserves possibly delivered references, and acknowledged delivery retires stale IDs. INIT workflow preserves beforeInit, destroy-after-await guard, error capture and event reporting. Browser focus remains part of the focus integration. Peer lookup sequences a correlated response and recursive decoding through the separate peer-call bridge; prop/export batches cannot retire these relay wrappers.

- **O:** `HostTransport.getInitError`.
- **I:** `HostTransport.constructor`, `HostTransport.registerPropsHandler`, `HostTransport.requestBootstrap`, `HostTransport.updateTrustedConsumerDomain`, `HostTransport.close`, `HostTransport.focus`, `HostTransport.resize`, `HostTransport.show`, `HostTransport.hide`, `HostTransport.onError`, `HostTransport.exportData`, `HostTransport.sendExportBatch`, `HostTransport.consumerExport`, `HostTransport.getPeerInstances`, `HostTransport.destroy`, `HostTransport.sendInit`, `HostTransport.sendMessage`.
- **M:** `HostTransport.handleHostPropsAccess`, `HostTransport.flushInit`, `HostTransport.scheduleDeferredInitFlush`.
- **O callbacks:** `HostTransport.constructor.callback@46`, `HostTransport.exportData.callback@142`.
- **I callbacks:** `HostTransport.registerPropsHandler.callback@55`, `HostTransport.exportData.callback@139`, `HostTransport.scheduleDeferredInitFlush.callback@199`.
- **Retained rationale —** `HostTransport.handleHostPropsAccess`: One deferred-init guard and one scheduling call keep accessor-triggered timing visible.
- **Retained rationale —** `HostTransport.flushInit`: The idempotent guard, flag transition and launch of sendInit are a short atomic scheduling adapter.
- **Retained rationale —** `HostTransport.scheduleDeferredInitFlush`: A small ownership guard and microtask registration belong together; splitting the flag writes would hide when another flush may be scheduled.

Evidence: [host](#evidence-host); typecheck.

### [core/host/types.ts](../packages/forgeframe/src/core/host/types.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [host](#evidence-host), typecheck.

### [core/index.ts](../packages/forgeframe/src/core/index.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [consumer](#evidence-consumer), typecheck.

### [drivers/index.ts](../packages/forgeframe/src/drivers/index.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [react](#evidence-react), typecheck.

### [drivers/react.ts](../packages/forgeframe/src/drivers/react.ts)

Hooks remain unconditional and in their original order. Hook callbacks coordinate extracted lifecycle/queue helpers using current refs; forwarded refs and callback refs keep existing timing.

- **O:** `reportReactError`.
- **I:** `createReactComponent`, `createReactComponent.ForgeFrameComponent`, `createReactComponent.ForgeFrameComponent.isCurrent`, `createReactComponent.ForgeFrameComponent.onDriverError`, `createReactComponent.ForgeFrameComponent.drain`, `createReactComponent.ForgeFrameComponent.callback@343.onRendered`, `createReactComponent.ForgeFrameComponent.callback@343.onClose`, `withReactComponent`, `withReactComponent.createComponent`.
- **O callbacks:** `reportReactError.callback@169`, `createReactComponent.ForgeFrameComponent.callback@337`, `createReactComponent.ForgeFrameComponent.callback@380`, `createReactComponent.ForgeFrameComponent.callback@380.callback@385`, `createReactComponent.ForgeFrameComponent.callback@380.callback@392`.
- **I callbacks:** `createReactComponent.ForgeFrameComponent.callback@343`, `createReactComponent.ForgeFrameComponent.callback@343.callback@364`, `createReactComponent.ForgeFrameComponent.callback@370`.

Evidence: [react](#evidence-react); typecheck.

### [drivers/react/lifecycle.ts](../packages/forgeframe/src/drivers/react/lifecycle.ts)

State creation/current-identity selection/ref release are operations; mounting sequences construction, observer registration, render readiness and cleanup. Promise callbacks guard obsolete mounts before applying state.

- **O:** `isCurrentSyncState`, `createPropSyncState`, `releaseInstanceRefs`.
- **I:** `mountReactInstance`, `mountReactInstance.isCurrent`.
- **O callbacks:** `mountReactInstance.callback@127`, `mountReactInstance.callback@134`, `mountReactInstance.callback@158.callback@160`.
- **I callbacks:** `mountReactInstance.callback@130`, `mountReactInstance.callback@139`, `mountReactInstance.callback@147`, `mountReactInstance.callback@158`.

Evidence: [react](#evidence-react); typecheck.

### [drivers/react/prop-sync.ts](../packages/forgeframe/src/drivers/react/prop-sync.ts)

Comparison, shallow snapshots, omission resets and queue acknowledgement/failure transitions are explicit operations. Draining composes them around updateProps and checks identity at each await boundary.

- **O:** `shallowEqualProps`, `deactivatePropSyncState`, `snapshotProps`, `buildPropUpdate`, `failPropUpdate`, `acknowledgePropUpdate`.
- **I:** `drainPropUpdates`.
- **M:** `enqueuePropSnapshot`.
- **Retained rationale —** `enqueuePropSnapshot`: Comparison chooses either one pending retry flag or an appended prepared payload. This short queue adapter keeps equivalent-commit behaviour readable; comparison, reset construction and failure transitions are separate operations.

Evidence: [react](#evidence-react); typecheck.

### [events/emitter.ts](../packages/forgeframe/src/events/emitter.ts)

Listener storage is an operation; emission sequences isolated supplied-observer execution. Keep synchronous subscription order and reentrant Set iteration semantics.

- **O:** `EventEmitter.on`, `EventEmitter.invokeHandler`, `EventEmitter.off`, `EventEmitter.removeAllListeners`, `EventEmitter.listenerCount`.
- **I:** `EventEmitter.once`, `EventEmitter.emit`.
- **M:** `EventEmitter.once.onceHandler`.
- **O callbacks:** `EventEmitter.invokeHandler.callback@133`.
- **I callbacks:** `EventEmitter.on.callback@60`.
- **Retained rationale —** `EventEmitter.once.onceHandler`: Unsubscribe immediately before invoking the supplied observer. This short wrapper makes reentrant once semantics explicit.

Evidence: [contract](#evidence-contract), [emitter.test](../packages/forgeframe/tests/unit/emitter.test.ts); typecheck.

### [forgeframe.ts](../packages/forgeframe/src/forgeframe.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [contract](#evidence-contract), typecheck.

### [index.ts](../packages/forgeframe/src/index.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [contract](#evidence-contract), typecheck.

### [props/definitions.ts](../packages/forgeframe/src/props/definitions.ts)

Built-in definitions are data assembled by one operation. The uid/context default callback only reads the supplied context.

- **O:** `createBuiltinPropDefinitions`.
- **O callbacks:** `createBuiltinPropDefinitions.callback@111`.

Evidence: [props](#evidence-props); typecheck.

### [props/index.ts](../packages/forgeframe/src/props/index.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [props](#evidence-props), typecheck.

### [props/normalize.ts](../packages/forgeframe/src/props/normalize.ts)

Fallback precedence selection, schema probing/conversion, decoration, output-contract decisions and snapshot writes are named responsibilities. Alias traversal and output equality retain cohesive cycle-aware algorithms. Canonical/alias reads and schema/custom validation treat only own snapshot values as supplied; host reconciliation also uses own membership for stale-key removal. Schema validation loops and host decoration are contract operations with explicit supplied values; integrations expose normalization and delivery order. Query/body integrations invoke custom converters as definition methods, preserving their receiver; `serializePropParameter` only encodes values without a custom converter.

- **O:** `resolvePropDefinition`, `hasOwn`, `schemaOutputMatchesInput`, `getCompiledPropDefinitions`, `materializePropAliases`, `invokeUserNormalizationCallback`, `readSuppliedProp`, `selectNormalizationFallback`, `probeSchemaDefault`, `validateNormalizationOutput`, `recordNormalizedValue`, `validateSchemaInputs`, `validateCustomProps`, `decorateHostProp`, `shouldSendPropToHost`, `serializePropParameter`.
- **I:** `normalizeProps`, `normalizeConsumerProps`, `resolveNormalizationFallback`, `parseExplicitFallback`, `decorateNormalizedValue`, `normalizePropValue`, `normalizePropsInternal`, `validateProps`, `validateConsumerProps`, `validateNormalizedProps`, `validatePropsInternal`, `getPropsForHost`, `validatePropsForHostTransport`, `propsToQueryParams`, `propsToBodyParams`.
- **O callbacks:** `getCompiledPropDefinitions.callback@154`, `materializePropAliases.callback@201`, `materializePropAliases.callback@203`, `resolveNormalizationFallback.callback@385`, `resolveNormalizationFallback.callback@397`, `decorateNormalizedValue.callback@462`.

Evidence: [props](#evidence-props); typecheck.

### [props/prop.ts](../packages/forgeframe/src/props/prop.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [props](#evidence-props), typecheck.

### [props/prop/base.ts](../packages/forgeframe/src/props/prop/base.ts)

Presence selection is separate from default/nested validation execution. Callable default parameters require factories, including widened optional/nullable builders; scalar default behavior is unchanged. Free functions preserve the exported subclass surface; immutable fluent builders retain the explicit small exceptions below. Runtime schema invocation is one validation boundary operation.

- **O:** `testRegExpStateless`, `validateSchemaSync`, `prependIssuePath`, `getValueKind`, `formatDateForMessage`, `defineDataProperty`, `validateDateBound`, `selectSchemaPresence`, `PropSchema._getDefaultValue`, `PropSchema._copyBaseTo`, `PropSchema._copyPresenceTo`.
- **I:** `validateSchemaPresence`, `PropSchema.validate`, `PropSchema._validateInput`.
- **M:** `PropSchema.optional`, `PropSchema.nullable`, `PropSchema.default`.
- **I callbacks:** `prependIssuePath.callback@39`, `PropSchema._validateInput.callback@227`, `PropSchema._validateInput.callback@228`.
- **Retained rationale —** `PropSchema.optional`, `PropSchema.nullable`, `PropSchema.default`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.

Evidence: [props](#evidence-props); typecheck.

### [props/prop/composite.ts](../packages/forgeframe/src/props/prop/composite.ts)

Outer shape/length constraints and strict-key selection are separate from nested schema traversal. Child validation selects own field values, passing omitted fields as undefined before presence/default handling. Issue-path accumulation and result assembly remain cohesive algorithms. Exported classes retain existing members and inference.

- **O:** `TupleSchema.constructor`, `RecordSchema.constructor`, `validateArrayItems`, `validateTupleItems`, `findUnknownObjectKey`, `validateObjectFields`, `validateRecordEntries`, `checkArrayConstraints`, `checkTupleConstraints`, `checkRecordInput`.
- **I:** `ArraySchema._validate`, `TupleSchema._validate`, `ObjectSchema._validate`, `RecordSchema._validate`.
- **M:** `ArraySchema._clone`, `ArraySchema.of`, `ArraySchema.min`, `ArraySchema.max`, `ArraySchema.nonempty`, `TupleSchema._clone`, `ObjectSchema._clone`, `ObjectSchema.shape`, `ObjectSchema.strict`, `RecordSchema._clone`.
- **O callbacks:** `findUnknownObjectKey.callback@374`.
- **Retained rationale —** `ArraySchema._clone`, `ArraySchema.of`, `ArraySchema.min`, `ArraySchema.max`, `ArraySchema.nonempty`, `TupleSchema._clone`, `ObjectSchema._clone`, `ObjectSchema.shape`, `ObjectSchema.strict`, `RecordSchema._clone`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.

Evidence: [props](#evidence-props); typecheck.

### [props/prop/factory.ts](../packages/forgeframe/src/props/prop/factory.ts)

Group scalar/composite/literal schema factory methods as construction operations. They retain typed inference and no workflow state.

- **O:** `string`, `number`, `date`, `boolean`, `function`, `array`, `tuple`, `object`, `record`, `literal`, `enum`, `union`, `any`.

Evidence: [props](#evidence-props); typecheck.

### [props/prop/literals.ts](../packages/forgeframe/src/props/prop/literals.ts)

Literal/enum constraint evaluation and ordered union probing are cohesive validation operations. Union presence uses the same free selector with union-specific null/undefined policy.

`EnumSchema.constructor` copies the values array before building its membership set, keeping clones and diagnostics independent of later caller mutations. This remains one cohesive construction operation.

`formatRejectedValue` formats primitive values or a type label without invoking arbitrary JSON serialization. Rejected cyclic objects, BigInts and custom encoders therefore cannot abort later union branches.

- **O:** `formatRejectedValue`, `LiteralSchema.constructor`, `LiteralSchema._validate`, `EnumSchema.constructor`, `EnumSchema._validate`, `UnionSchema.constructor`, `UnionSchema._validate`.
- **I:** `UnionSchema._validateInput`.
- **M:** `LiteralSchema._clone`, `EnumSchema._clone`, `UnionSchema._clone`.
- **O callbacks:** `EnumSchema._validate.callback@81`.
- **I callbacks:** `UnionSchema._validateInput.callback@140`, `UnionSchema._validateInput.callback@141`.
- **Retained rationale —** `LiteralSchema._clone`, `EnumSchema._clone`, `UnionSchema._clone`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.

Evidence: [props](#evidence-props); typecheck.

### [props/prop/primitives.ts](../packages/forgeframe/src/props/prop/primitives.ts)

Scalar schema validation stays cohesive: string trimming/constraints, number bounds/integer checks and Date bounds are algorithms, not workflows. Builder exceptions keep clone/set/return local. Callback default validation sequences one factory evaluation and result validation, preserving optional/nullable presence without invoking the returned callback.

Number validation rejects nonfinite values before JSON transport can change them to null. The pure `isHttpUrl` operation parses absolute HTTP(S) URL syntax; string cloning retains this constraint independently of regex patterns and preserves the schema output.

- **O:** `isHttpUrl`, `StringSchema._validate`, `NumberSchema._validate`, `DateSchema._validate`, `BooleanSchema._validate`, `FunctionSchema._validate`, `AnySchema.constructor`, `AnySchema._validate`.
- **I:** `FunctionSchema._validateInput`.
- **M:** `StringSchema._clone`, `StringSchema.min`, `StringSchema.max`, `StringSchema.length`, `StringSchema.pattern`, `StringSchema.email`, `StringSchema.url`, `StringSchema.uuid`, `StringSchema.trim`, `StringSchema.nonempty`, `NumberSchema._clone`, `NumberSchema.min`, `NumberSchema.max`, `NumberSchema.int`, `NumberSchema.positive`, `NumberSchema.nonnegative`, `NumberSchema.negative`, `DateSchema._clone`, `DateSchema.min`, `DateSchema.max`, `BooleanSchema._clone`, `FunctionSchema._clone`, `AnySchema._clone`.
- **Retained rationale —** `StringSchema._clone`, `StringSchema.min`, `StringSchema.max`, `StringSchema.length`, `StringSchema.pattern`, `StringSchema.email`, `StringSchema.url`, `StringSchema.uuid`, `StringSchema.trim`, `StringSchema.nonempty`, `NumberSchema._clone`, `NumberSchema.min`, `NumberSchema.max`, `NumberSchema.int`, `NumberSchema.positive`, `NumberSchema.nonnegative`, `NumberSchema.negative`, `DateSchema._clone`, `DateSchema.min`, `DateSchema.max`, `BooleanSchema._clone`, `FunctionSchema._clone`, `AnySchema._clone`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.

Evidence: [props](#evidence-props); typecheck.

### [props/schema.ts](../packages/forgeframe/src/props/schema.ts)

Standard Schema detection, issue-path formatting and invoking a supplied schema are validation boundary operations; sync/async rejection and error text remain intact.

- **O:** `isStandardSchema`, `isAsyncSchemaResult`, `validateWithSchema`, `formatIssuePath`.
- **O callbacks:** `validateWithSchema.callback@261`, `formatIssuePath.callback@288`.

Evidence: [props](#evidence-props); typecheck.

### [props/serialize.ts](../packages/forgeframe/src/props/serialize.ts)

DOTIFY pair decoding and path reconstruction are distinct operations. Reconstruction tracks assembled branches separately from encoded leaves so `escapeDotNotationBranches` escapes their final shapes without confusing genuine leaf function/Date markers. JSON-undefined leaves are omitted and emptied branches retain explicit framing. Recursive wire conversion, escaping, reserved-key checks and malformed fallback remain cohesive codec algorithms. BASE64 and DOTIFY register nested callbacks while encoding JSON values, retaining custom `toJSON()` behavior. After wrapper decoding, the recursive bridge reconstructs callbacks and Date values together, preserving the existing wire formats and transport-owned batch boundary. The encoding closures only delegate function retention to the supplied bridge. BASE64/DOTIFY guards require both own fields and no extra keys, so user records with additional fields remain ordinary data.

- **O:** `isSafeObjectKey`, `encodeDotNotationPath`, `encodeDotNotationValue`, `createDotNotationPair`, `createDotNotationEmptyObjectPair`, `defineDataProperty`, `toDotNotation`, `fromDotNotation`, `escapeDotNotationBranches`, `decodeDotNotationPair`, `assignDotNotationPath`, `decodeDotNotationPath`, `isDotifyEncoded`, `serializeProps`, `serializeValue`, `deserializeProps`, `deserializeValue`, `isBase64Encoded`.
- **O callbacks:** `encodeDotNotationValue.callback@74`, `serializeValue.callback@331`, `fromDotNotation.callback@170`, `decodeDotNotationPath.callback@249`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [props/types.ts](../packages/forgeframe/src/props/types.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [props](#evidence-props), typecheck.

### [render/iframe-configuration.ts](../packages/forgeframe/src/render/iframe-configuration.ts)

CSS key/value encoding and boolean HTML-attribute representation use only supplied data. Custom property names retain case, standard unitless numeric styles retain numeric meaning, and dimensional numeric values use pixels.

- **O:** `encodeIframeStyle`, `encodeIframeAttribute`.

Evidence: [render](#evidence-render), [iframe-configuration.test](../packages/forgeframe/tests/unit/iframe-configuration.test.ts); typecheck.

### [render/iframe.ts](../packages/forgeframe/src/render/iframe.ts)

Reserved attributes are checked before element creation. Style/attribute decisions are supplied-data operations; application keeps write order, default sandbox timing and explicit empty values.

- **O:** `assertSafeIframeAttributes`, `destroyIframe`, `showIframe`, `hideIframe`, `focusIframe`.
- **I:** `createIframeElement`, `createIframe`, `resizeIframe`, `applyStyles`, `applyAttributes`.
- **M:** `createPrerenderIframe`, `applyDimensions`, `applyDefaultSandbox`.
- **Retained rationale —** `createPrerenderIframe`: One browser action constructs, sizes and mounts the inert placeholder. The dimension adapter is the only package call; another workflow layer would hide the synchronous setup.
- **Retained rationale —** `applyDimensions`: Two supplied-value guards next to CSS writes preserve partial resize behaviour; the reusable conversion already lives in utils/dimension.ts.
- **Retained rationale —** `applyDefaultSandbox`: One supplied sandbox-presence guard and one DOM write express the whole default policy. Keep explicit empty sandbox distinct from omission.

Evidence: [render](#evidence-render); typecheck.

### [render/index.ts](../packages/forgeframe/src/render/index.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [render](#evidence-render), typecheck.

### [render/popup-layout.ts](../packages/forgeframe/src/render/popup-layout.ts)

Geometry/features and capped polling-delay growth use explicit screen/dimension data.

- **O:** `buildPopupFeatures`, `nextPopupPollInterval`.

Evidence: [render](#evidence-render), [popup-layout.test](../packages/forgeframe/tests/unit/popup-layout.test.ts); typecheck.

### [render/popup.ts](../packages/forgeframe/src/render/popup.ts)

Opening coordinates geometry with the browser action. Polling remains one timer/resource operation with a supplied onClose callback; its cancellation closure only clears the owned timer.

- **O:** `PopupOpenError.constructor`, `closePopup`, `focusPopup`, `isPopupBlocked`, `watchPopupClose`, `watchPopupClose.invokeCallback`, `watchPopupClose.check`, `resizePopup`.
- **I:** `openPopup`.
- **O callbacks:** `watchPopupClose.callback@301`.

Evidence: [render](#evidence-render); typecheck.

### [render/templates.ts](../packages/forgeframe/src/render/templates.ts)

DOM creation, style insertion, fade scheduling and dimensional writes remain cohesive browser operations. Swap coordinates the existing transition operations.

- **O:** `ensureSpinnerKeyframes`, `defaultContainerTemplate`, `defaultPrerenderTemplate`, `createStyleElement`, `fadeIn`, `fadeOut`.
- **I:** `swapPrerenderContent`.
- **M:** `applyDimensions`.
- **O callbacks:** `fadeIn.callback@250`, `fadeOut.callback@289`.
- **Retained rationale —** `applyDimensions`: Keep the two dimension guards beside their style writes; the shared dimension conversion is already isolated.

Evidence: [render](#evidence-render); typecheck.

### [types.ts](../packages/forgeframe/src/types.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [contract](#evidence-contract), typecheck.

### [types/events.ts](../packages/forgeframe/src/types/events.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [contract](#evidence-contract), typecheck.

### [types/props.ts](../packages/forgeframe/src/types/props.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [contract](#evidence-contract), typecheck.

### [types/runtime.ts](../packages/forgeframe/src/types/runtime.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [contract](#evidence-contract), typecheck.

### [types/templates.ts](../packages/forgeframe/src/types/templates.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [contract](#evidence-contract), typecheck.

### [types/utility.ts](../packages/forgeframe/src/types/utility.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [contract](#evidence-contract), typecheck.

### [utils/browser.ts](../packages/forgeframe/src/utils/browser.ts)

One environment observation checks for a browser window.

- **O:** `hasBrowserWindow`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [utils/cleanup.ts](../packages/forgeframe/src/utils/cleanup.ts)

Taking the LIFO task batch marks cleanup claimed before any callback runs. Cleanup then sequences the detached tasks; registration/unregistration are state operations.

- **O:** `CleanupManager.register`, `CleanupManager.takeCleanupTasks`.
- **I:** `CleanupManager.cleanup`.
- **O callbacks:** `CleanupManager.register.callback@70`, `CleanupManager.register.callback@71`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [utils/dimension.ts](../packages/forgeframe/src/utils/dimension.ts)

Numeric/CSS dimension normalization uses supplied values and explicit fallbacks. Popup conversion admits finite numbers and complete numeric/px strings, truncating string fractions; nonpixel units use the supplied fallback. CSS conversion preserves iframe units.

- **O:** `normalizeDimensionToCSS`, `normalizeDimensionToNumber`.

Evidence: [utilities](#evidence-utilities), [dimension.test](../packages/forgeframe/tests/unit/dimension.test.ts), [popup.test](../packages/forgeframe/tests/unit/popup.test.ts); typecheck.

### Playground peer text rendering

`host/main.ts` retains static layout insertion and event binding as a rendering integration. Its local `renderPropsGrid` is a cohesive DOM construction operation using textContent and property assignment for labels, values, and IDs. Identity text is populated after the static layout. `consumer/logger.ts` keeps `log` as one append-and-scroll DOM operation with the existing timestamp/message spans. No shared escaping abstraction or public API is introduced.

Evidence: [playground-text-rendering.test](../packages/forgeframe/tests/unit/playground-text-rendering.test.ts), [playground-text.spec](../packages/forgeframe/tests/browser/playground-text.spec.ts); playground typecheck/build.

### [utils/domain-pattern.ts](../packages/forgeframe/src/utils/domain-pattern.ts)

Wildcard compilation and stateless regex testing are cohesive algorithms. Keep their cache and lastIndex protection intact.

- **O:** `escapeRegExp`, `compileWildcardDomainPattern`, `testDomainRegExpStateless`.
- **O callbacks:** `compileWildcardDomainPattern.callback@41`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [utils/index.ts](../packages/forgeframe/src/utils/index.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [utilities](#evidence-utilities), typecheck.

### [utils/error.ts](../packages/forgeframe/src/utils/error.ts)

Unknown-error conversion preserves Error identity and ordinary coercion, with a stable fallback when coercion throws. The helper has no runtime ownership or browser observations.

- **O:** `normalizeError`.

Evidence: [error.test](../packages/forgeframe/tests/unit/error.test.ts), function-prop-bridge and host-controls-routing integration regressions; typecheck.

### [utils/promise.ts](../packages/forgeframe/src/utils/promise.ts)

Deferred creation and timeout wrapping are cohesive platform operations. Executor/timer/completion callbacks claim resolver references or settle the owned promise, with no domain workflow.

- **O:** `createDeferred`, `promiseTimeout`.
- **O callbacks:** `createDeferred.callback@48`, `promiseTimeout.callback@92`, `promiseTimeout.callback@92.callback@93`, `promiseTimeout.callback@92.callback@98`, `promiseTimeout.callback@92.callback@102`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [utils/realm-values.ts](../packages/forgeframe/src/utils/realm-values.ts)

Date detection uses the intrinsic Date brand across realms. Ordinary-record detection compares native constructor/prototype evidence, preserving null-prototype records and rejecting class instances. Schemas, output comparison and codecs use these neutral supplied-value operations.

- **O:** `isDate`, `isPlainObject`.

Evidence: realm-value/schema tests, public integration and navigation browser regressions; typecheck.

### [utils/uid.ts](../packages/forgeframe/src/utils/uid.ts)

Random ID creation is one platform operation. Preserve length and wire-visible shape.

- **O:** `generateUID`, `generateShortUID`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [utils/url.ts](../packages/forgeframe/src/utils/url.ts)

HTTP(S)/credential/domain URL validation is one cohesive supplied-data operation. Browser integrations supply `document.baseURI` and pin the validated absolute URL before lifecycle callbacks; the validator itself reads no browser globals. Query suffix construction operates before the first fragment delimiter and preserves existing query bytes. Regression evidence includes [url.test](../packages/forgeframe/tests/unit/url.test.ts) and [consumer-navigation.test](../packages/forgeframe/tests/unit/consumer-navigation.test.ts).

- **O:** `resolveComponentHostUrl`, `appendComponentQuery`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [utils/wire-value.ts](../packages/forgeframe/src/utils/wire-value.ts)

Date framing and recursive JSON replacer/reviver behaviour are codec operations. The optional internal function encoder extends the existing replacer for prop codecs while callers without that encoder retain ordinary JSON function omission. Retain recursion and malformed Date handling together. For prop-codec JSON leaves, native conversion runs encoders once and records generated marker paths; `escapeConvertedRecords` then escapes final ordinary record shapes without re-running encoders.

`assertDefinedArrayEntries` checks normalized container values with cycle-safe traversal and without calling custom JSON encoders. `hasJsonEncoder` inspects descriptors without invoking computed properties. BASE64 encoder-bearing branches are deferred to the replacer; `isDotifyObjectBranch` mirrors DOTIFY traversal so only its encoded leaves may defer. Top-level arrays and marker-shaped records use the same JSON bridge fallback during admission and serialization. Non-callable `toJSON` fields remain ordinary data. `assertDefinedArrayEntry` also guards bridge arrays, including holes, and prop-codec replacer values before JSON can convert them to null. Date framing ignores extra instance fields as before.

- **O:** `needsRecordEscape`, `escapeWireRecord`, `isRecordWireValue`, `assertDefinedArrayEntry`, `assertDefinedArrayEntries`, `hasJsonEncoder`, `isDotifyObjectBranch`, `isObjectRecord`, `hasOwnKey`, `encodeDateWireValue`, `isDateWireValue`, `decodeDateWireValue`, `stringifyWireValue`, `escapeConvertedRecords`, `stringifyWireValue.wireValueReplacer`, `parseWireValue`.
- **O callbacks:** `parseWireValue` reviver; both `escapeConvertedRecords` mapping callbacks.

Evidence: [utilities](#evidence-utilities); typecheck.

### [window/helpers.ts](../packages/forgeframe/src/window/helpers.ts)

Group browser observations, defensive traversal and window actions as operations. Recursive/iterative ancestry and domain matching retain cohesive algorithms; security exceptions are part of their browser boundary.

- **O:** `getDomain`, `isSameDomain`, `matchDomain`, `isWindowClosed`, `getOpener`, `getConsumer`, `getTop`, `isIframe`, `isPopup`, `getAncestor`, `getDistanceToConsumer`, `focusWindow`, `closeWindow`, `getFrames`.
- **O callbacks:** `matchDomain.callback@116`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [window/index.ts](../packages/forgeframe/src/window/index.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [utilities](#evidence-utilities), typecheck.

### [window/name-payload.ts](../packages/forgeframe/src/window/name-payload.ts)

Payload shape/framing/validation is separate from browser window-name mutation. Channel-only retention is data-only; consuming payload coordinates the existing destructive read and reconnect identity.

- **O:** `buildWindowName`, `parseWindowName`, `isObjectRecord`, `isValidSerializedProps`, `isValidConsumerExports`, `isValidHostComponentRef`, `isValidChildrenMap`, `isValidWindowNamePayload`, `isForgeFrameWindow`, `isHostOfComponent`, `encodePayload`, `decodePayload`, `createWindowPayload`, `retainChannelMetadata`.
- **I:** `updateWindowName`, `getInitialPayload`, `consumeInitialPayload`, `clearInitialPayload`.
- **O callbacks:** `isValidConsumerExports.callback@111`, `isValidChildrenMap.callback@169`.

Evidence: [utilities](#evidence-utilities); typecheck.

### [window/types.ts](../packages/forgeframe/src/window/types.ts)

**Contract only.** Types, re-exports or immutable declarations; no runtime callable body. Public exports and supported subpaths remain unchanged.
Evidence: [utilities](#evidence-utilities), typecheck.
