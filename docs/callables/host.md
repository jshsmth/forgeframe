---
name: callables/host
title: Host runtime callables
desc: Host runtime callables for bootstrap, origin policy, props, and transport with their IOSP classifications and boundary tests.
tags: []
sources: []
created: 2026-10-27T21:30:00Z
updated: 2026-10-27T21:30:00Z
---

# Host runtime callables

Classifications use the legend and evidence groups in the [callable reference index](_index.md). Update an entry when its callable changes, and run the suites its evidence names.

### [core/host.ts](../../packages/forgeframe/src/core/host.ts)

The public host check delegates to the bootstrap and window adapters. `isHost()` is true when a host runtime is active or `window.name` holds a decodable ForgeFrame payload of any protocol version, so older payloads reach the upgrade error; `isForgeFrameWindow` decides decodability through the payload reader. It is false for a malformed payload after the prefix, and stays true after `destroy()`. Importing the module without browser globals has no effect.

- **I:** `isHost`.

Evidence: [host](_index.md#evidence-host); typecheck.

### [core/host/bootstrap.ts](../../packages/forgeframe/src/core/host/bootstrap.ts)

`initHost()` is the only host start path. `init-host-arguments.ts` checks the call shape before any environment check and resolves what the host starts with. The integration then returns null without browser globals, throws while a host is active, reads the channel metadata, and in the component form throws when the payload's tag differs. It never consults the registry for another component's definitions and never reconfigures a running host. `readInitialPayload` classifies the current `window.name` on every new start and never rewrites it: a payload from another protocol throws the `VERSION_MISMATCH` upgrade error that `describeUnsupportedPayload` words, before any host state exists or anything is sent to the unverified consumer, and an invalid payload is logged and yields null. `hasConsumerWindow` checks first that a parent or opener exists: a stale older payload in a window with neither has no consumer to upgrade, so it yields null, as a current payload without a consumer window does. There is no pending copy of the payload, so a retry after a failed start or failed asynchronous validation, and a start after `destroy()`, reread the retained channel metadata.

`startHostRuntime` resolves the consumer window first, then passes it and the resolved start options to the runtime and makes it the active host from construction until it is destroyed or its start fails. A consumer-window resolution failure (`isConsumerWindowUnavailable`, around `resolveConsumerWindow` only, which recognizes only that function's own failure) yields null; a disallowed consumer origin throws from construction and leaves no active host. Its ready callback is registered before the caller can observe `ready`, so a rejection releases the singleton before the caller's handlers run. The destruction callback is an **O** identity-guarded state transition, so stale or repeated destruction cannot clear a replacement host. `createHost` returns the frozen `Host` handle: `ready`, `uid`, `tag`, `consumerOrigin`, the host controls (`close`, `focus`, `resize`, `show`, `hide`, `export`, `onProps`, `reportError`, `getPeerInstances`), `init`, `destroy`, `on` and `once`. Each control is a one-call delegate to the runtime; `ready` resolves to the props alone, so no prop name can clash with a control. `on` and `once` come from the shared subscriber facade and admit only the `error` event. The accepted names and the unknown-name message come from `core/host/events.ts`.

- **O:** `describeUnsupportedPayload`, `getHost`.
- **I:** `readInitialPayload`, `hasConsumerWindow`, `startHostRuntime`, `createHost`, `createHost.close`, `createHost.focus`, `createHost.resize`, `createHost.show`, `createHost.hide`, `createHost.export`, `createHost.onProps`, `createHost.reportError`, `createHost.getPeerInstances`, `createHost.init`, `createHost.destroy`, `clearHostInstance`.
- **M:** `initHost`.
- **O callbacks:** `startHostRuntime.onDestroy`.
- **I callbacks:** `startHostRuntime.callback@225`.
- **Retained rationale —** `initHost`: The component form's tag check is one comparison and throw between the payload read and the runtime start; it reads the payload this integration just obtained, so it stays inline.

Evidence: [host](_index.md#evidence-host); typecheck.

### [core/host/reserved-props.ts](../../packages/forgeframe/src/core/host/reserved-props.ts)

The two reserved prop names (`then`, which would make the props object a thenable so `await host.ready` never settles, and `children`, so React JSX children never reach a host) and the declaration policy that rejects definitions for them. Host controls live on the `Host` handle, so no control name is reserved; the props runtime also drops reserved names from unchecked props. `create()` and `initHost()` share the policy, which reads fields by the own-field rule in `utils/own-field.ts`: entries set to `undefined` count as omitted, and accessors are not invoked. `assertPropDefinitionsObject` is the one prop-definitions check both entry points call: the reserved-name rule, then `assertPropDefinitions`.

- **O:** `assertNoReservedPropDefinitions`.
- **I:** `assertPropDefinitionsObject`.

Evidence: [host](_index.md#evidence-host); typecheck.

### [core/host/component.ts](../../packages/forgeframe/src/core/host/component.ts)

Constructor proxies bind the host's own fields and its props and transport runtimes. Accessors delegate. The constructor has one startup path: it selects the messaging target and checks it against the allowlist before BOOTSTRAP, starts with an empty live props object, makes `ready` the verified bootstrap, and makes INIT wait for it. With `autoInit`, the constructor calls `init()`; otherwise INIT waits for the caller. Bootstrap readiness, source verification, and teardown are explicit integrations. `ready` resolves to the live props object; its rejection observer only prevents an unhandled rejection. `uid`, `tag` and `consumerOrigin` are read-only fields set once in the constructor. The host controls (`close`, `focus`, `resize`, `show`, `hide`, `reportError`, `getPeerInstances`) delegate to the transport and `onProps` to the props runtime, so `createHost` reaches no runtime but this one.

`HostComponent.destroy` notifies its bootstrap owner first, then sequences transport, observer, and prop cleanup. The owner callback is local to that owner, so stale or repeated destruction cannot clear a replacement host; `consumer-host-handshake.test.ts` covers this.

The constructor takes one options object (`HostRuntimeOptions`: definitions, the component's `exports` schema, `consumerOrigins`, `autoInit`, and the owner's destruction callback). `export` checks each export with `validateExports` before queueing it on the transport, so an invalid export rejects at the host's call site without being sent; the tag-agnostic form has no schema and sends unchecked. `receiveBootstrap` requests BOOTSTRAP, checks the response's shape, and passes the messaging consumer origin to the shared allowlist policy in `consumer-origin-policy.ts` again, as defence in depth. `assertBootstrapResponse` is the **O** shape check (`VALIDATION`). Any failure there, apart from destruction, goes through `toHandshakeFailure` (an unanswered request becomes `INIT_TIMEOUT`, other codes stay) and is reported on the `error` event, as a `ForgeFrameError` with that code whose `cause` is the failure, before `ready` rejects with the failure itself. When host schemas reject the bootstrap snapshot, the props runtime reports the `Error` instead, and `initializeFromConsumer` passes it through `toHandshakeFailure` (so `ready` always rejects with a code; a schema that throws becomes `VALIDATION` with the original as `cause`) and asks the transport to tell the verified, allowed consumer why; consumer-origin rejections are not reported to the consumer.

- **O:** `assertBootstrapResponse`, `HostComponent.constructor.getConsumerOrigin`, `HostComponent.constructor.beforeInit`, `HostComponent.constructor.getConsumerWindow`, `HostComponent.constructor.getBridge`, `HostComponent.constructor.get`, `HostComponent.constructor.isConsumerWindow`.
- **I:** `HostComponent.constructor`, `HostComponent.constructor.applySerializedProps`, `HostComponent.initializeFromConsumer`, `HostComponent.receiveBootstrap`, `HostComponent.export`, `HostComponent.close`, `HostComponent.focus`, `HostComponent.resize`, `HostComponent.show`, `HostComponent.hide`, `HostComponent.reportError`, `HostComponent.getPeerInstances`, `HostComponent.onProps`, `HostComponent.init`, `HostComponent.destroy`.
- **O callbacks:** `HostComponent.constructor.callback@124`.

Evidence: [host](_index.md#evidence-host); typecheck.

### [core/host/consumer-origin-policy.ts](../../packages/forgeframe/src/core/host/consumer-origin-policy.ts)

All trust policy works from supplied origins and options. A messaging target must be an exact HTTP(S) origin that passes the allowlist, and stays provisional until the bootstrap exchange verifies the source window. `validateMessagingConsumerContext` returns that origin unchanged. `assertAllowedConsumerOrigin` is the one allowlist check: the messaging context and the coordinator's post-bootstrap check both use it. The allowlist is always supplied.

- **M:** `validateMessagingConsumerContext`, `assertAllowedConsumerOrigin`.
- **Retained rationale —** `validateMessagingConsumerContext`: It checks that the target is an exact HTTP(S) origin, then calls the shared `assertAllowedConsumerOrigin`; the exactness check is one parse and comparison that only the messaging target needs.
- **Retained rationale —** `assertAllowedConsumerOrigin`: It rejects an empty origin, then applies the shared `matchOrigin`; each rule is one guard with its throw.

Evidence: [host](_index.md#evidence-host), [consumer-origin-policy.test](../../packages/forgeframe/tests/unit/consumer-origin-policy.test.ts); typecheck.

### [core/host/events.ts](../../packages/forgeframe/src/core/host/events.ts)

The host event-name set is data built from `EVENT`, matching `core/consumer/events.ts`. Describing an unknown name is one message policy: the removed v1 `props` event names `host.onProps()` as its replacement, and any other name lists the supported event.

- **O:** `describeUnknownHostEvent`.

Evidence: [host](_index.md#evidence-host); typecheck.

### [core/host/handshake-failure.ts](../../packages/forgeframe/src/core/host/handshake-failure.ts)

`toHandshakeFailure` gives a failed bootstrap or INIT exchange its code: a request the consumer never answered (the messenger's own acknowledgement timeout) becomes `INIT_TIMEOUT` with the original as `cause`, other `ForgeFrameError`s keep theirs, including a `CLOSED` the consumer sent back, and anything else is `VALIDATION`. `HostComponent.receiveBootstrap` and `HostTransport.sendInit` use it before `emitInitFailure`.

- **M:** `toHandshakeFailure`.
- **Retained rationale —** `toHandshakeFailure`: The classification is the shared `isAcknowledgementTimeout` check and an `instanceof`, each with its construction; `normalizeError` only supplies the `cause`, and a separate builder would pass the same branch back.

Evidence: [host](_index.md#evidence-host); typecheck.

### [core/host/init-host-arguments.ts](../../packages/forgeframe/src/core/host/init-host-arguments.ts)

`initHost()` call-shape policy, checked before any environment check, so a v1 call shape fails closed everywhere. `readInitHostArguments` resolves the component form's tag, definitions and `exports` schema through the registry: a component must carry registered options and takes one options object, and a tag-agnostic call that adds a second positional argument (the v1 allowlist position) throws. `readInitHostOptions` is **O** declaration policy over the supplied options: it accepts only `consumerOrigins`, `autoInit`, and, in the tag-agnostic form, `props` (naming `consumerOrigins` for the old `allowedConsumerDomains`); validates the required matcher; defaults `autoInit`; and applies the shared `assertPropDefinitionsObject` to supplied definitions. Only the empty array of `consumerOrigins` is accepted (it admits no consumer and so fails closed); `hostOrigins`, `peers` and `deliverTo` reject it. The component form substitutes the shared empty definitions for a component without `props`, so its host accepts no fields; only the tag-agnostic form without `props` passes the named `"unchecked"` mode, which keeps every field. `callShapeError` builds a `VALIDATION` `ForgeFrameError` that appends the v2 call shapes, so every argument error names them; the shared reserved-name and prop-definition errors name the prop instead.

- **O:** `callShapeError`, `readInitHostOptions`.
- **M:** `readInitHostArguments`.
- **Retained rationale —** `readInitHostArguments`: The argument-count rules are two inline guards on the call shape it is already resolving; a separate operation would only re-read the same array.

Evidence: [host](_index.md#evidence-host); typecheck.

### [core/host/peer-instances-options.ts](../../packages/forgeframe/src/core/host/peer-instances-options.ts)

`getPeerInstances()` argument policy, kept apart from the transport like `init-host-arguments.ts`: `assertPeerInstancesOptions` rejects a non-object, the renamed `anyConsumer` and a non-boolean `allTags` with `VALIDATION` before anything is sent.

- **O:** `assertPeerInstancesOptions`.

Evidence: [host](_index.md#evidence-host); typecheck.

### [core/host/props-runtime.ts](../../packages/forgeframe/src/core/host/props-runtime.ts)

The runtime owns the live props object that `ready` resolves to; it holds the consumer's props only, and its identity never changes. Snapshot commitment (`commitSerializedProps`, then `commitProps`) is separate from subscriber notification (`notifyPropsHandlers`). An update acknowledged before a messaging bootstrap completes is committed but not published; `applyBootstrap` marks the runtime initialized and publishes the final snapshot once. `omitReservedPropNames` (**O**) drops `then` and `children` from every decoded snapshot, so an unchecked consumer cannot make the props object a thenable. Stale props are found by own-key membership, so inherited names cannot keep an old value. Subscribers run only after reconciliation; notification observes promise and thenable failures without awaiting user work, so acknowledgement order is unaffected. `onProps` is the only way to observe updates; the runtime emits only `error` events, always with an `Error`. A rejected snapshot goes through `toPropsFailure` (**O**), which keeps a `ForgeFrameError`'s code and wraps anything else, such as a throwing third-party schema, as `VALIDATION` with the original as `cause`, so the `error` event and the thrown error (which rejects `ready` during bootstrap) are the same object.

`HostPropsRuntime.filterUndeliveredProps` is an **I** admission step: a runtime constructed in the `"unchecked"` mode (a tag-agnostic host without `props`) keeps every field; otherwise it applies `selectExpectedFields`, which keeps only fields whose key the delivered definitions own, so undeclared fields, including those of `undefined` definition entries, never reach host state. `HostPropsRuntime.expectedDefinitions` is an **I**: it caches one call that applies the shared delivery policy (`createDeliveryTarget`, then `getDeliveredPropDefinitions`) with the host origin read at construction and the verified consumer origin, once, and keeps the selection, so consumer-only props and props whose `deliverTo` excludes this host are neither expected nor accepted. `deserialize` filters wire snapshots before calling the codec. The definitions are fixed when the runtime is constructed; bootstrap and live updates validate every expected prop with the same delivered definitions, including an acknowledged update that arrives before bootstrap completes, so required withheld or local inputs do not block initialization. The runtime defines no window global, and reading the props has no side effects.

Notification snapshots handlers with weak registration tokens. New registrations and cancel-and-register replacements wait for the next notification; cancellation or destruction skips pending delivery. Duplicate registrations keep their original token, and cancellation removes only the registration whose token it captured, so an old or duplicate handle cannot cancel a later registration of the same callback. `onProps` and the unsubscribe function it returns are **O** state operations, covered through public update delivery. The snapshot map callback is **O**. The rejection callback in `HostPropsRuntime.notifyPropsHandlers` is an **O** callback boundary: it logs one observer failure and leaves prop state alone.

- **O:** `omitReservedPropNames`, `toPropsFailure`, `HostPropsRuntime.constructor`, `HostPropsRuntime.commitProps`, `HostPropsRuntime.notifyPropsHandlers`, `HostPropsRuntime.destroy`, `HostPropsRuntime.onProps`, `HostPropsRuntime.onProps.callback@165`.
- **I:** `HostPropsRuntime.applySerializedProps`, `HostPropsRuntime.commitSerializedProps`, `HostPropsRuntime.deserialize`, `HostPropsRuntime.filterUndeliveredProps`.
- **M:** `HostPropsRuntime.applyBootstrap`, `HostPropsRuntime.expectedDefinitions`.
- **O callbacks:** `HostPropsRuntime.notifyPropsHandlers.callback@134`, `HostPropsRuntime.notifyPropsHandlers.callback@145`.
- **Retained rationale —** `HostPropsRuntime.applyBootstrap`: It picks the newer acknowledged snapshot over the bootstrap one, commits it through `commitSerializedProps`, then sets the initialized flag and notifies once; the choice is one `??` on state it owns, and the flag must change between commit and notification.
- **Retained rationale —** `HostPropsRuntime.expectedDefinitions`: It caches one call of the shared delivery policy and picks its input, the declared definitions or the shared empty ones for the `"unchecked"` mode; the choice is one conditional on the mode it already reads.

Evidence: [host](_index.md#evidence-host); typecheck.

### [core/host/security.ts](../../packages/forgeframe/src/core/host/security.ts)

Browser observations are separate from policy. A directly accessible consumer origin is preferred over the payload's claimed origin; the referrer is not observed. `resolveMessagingConsumerContext` always passes the host's allowlist to the policy. A window without a parent or opener raises the one `CLOSED` start-up error and marks it in a module-private `WeakSet`; `isConsumerWindowUnavailable` recognizes only that marked error, so `initHost()` returns `null` instead of matching a message, and any other `CLOSED` error surfaces.

- **O:** `getAccessibleConsumerOrigin`, `isConsumerWindowUnavailable`.
- **I:** `resolveMessagingConsumerContext`.
- **M:** `resolveConsumerWindow`.
- **Retained rationale —** `resolveConsumerWindow`: It prefers the parent for an iframe and the opener for a popup, each through one `window/helpers` read, and marks the one start-up error it throws; the parent-before-opener rule is two guards on observations it just made.

Evidence: [host](_index.md#evidence-host); typecheck.

### [core/host/transport.ts](../../packages/forgeframe/src/core/host/transport.ts)

Outbound export batches share a FIFO queue. Both bridges and the PROPS handler admit only `isConsumerSource` (**O**): the consumer window at the selected origin. `getPeerInstances` checks its options with `assertPeerInstancesOptions` (in `peer-instances-options.ts`) before sending, so the renamed `anyConsumer` and a non-boolean `allTags` reject without a request. A serialization failure aborts new bridge registrations, and so does a consumer's `VALIDATION` rejection of the export, which keeps its previous exports (`exportMayBeStored`); another send failure keeps possibly delivered references, and acknowledged delivery retires stale IDs. `sendInitOnce` launches the INIT workflow at most once and never after teardown; the coordinator calls it from `init()`. The workflow awaits `beforeInit` (the verified bootstrap); a rejected start sends and reports nothing, because the coordinator reports failed starts. `emitInitFailure` is the one place that wraps failed starts and INIT delivery failures in a `ForgeFrameError` with the failure's code, whose message starts with `Failed to initialize host component:` and whose `cause` is the failure; `sendInit` first passes an INIT failure through `toHandshakeFailure`. It then guards against destruction after its await, sends INIT with only the session ID, captures errors, and reports events; a rejection caused by teardown is not an initialization failure and is not logged. `reportInitFailure` sends a best-effort ERROR marked `initFailed`, with the error's code, whose rejection after teardown is ignored. Teardown posts a best-effort one-way TEARDOWN notice before destroying the messenger, because the consumer's calls wait without a timeout and calls not yet dispatched would never be answered. Browser focus is part of the focus integration, which waits briefly for this window to receive the consumer's frame focus before resolving, unless the consumer's acknowledgement reports that its page has no focus to pass on; a popup host resizes its own window before notifying the consumer, which cannot resize it across origins. Peer lookup sends only the caller's options, sequences a correlated response and recursive decoding through the separate peer-call bridge, so prop and export batches cannot retire relay wrappers.

- **O:** `HostTransport.emitInitFailure`, `HostTransport.isConsumerSource`, `exportMayBeStored`.
- **I:** `HostTransport.constructor`, `HostTransport.registerPropsHandler`, `HostTransport.requestBootstrap`, `HostTransport.close`, `HostTransport.focus`, `HostTransport.resize`, `HostTransport.show`, `HostTransport.hide`, `HostTransport.reportError`, `HostTransport.reportInitFailure`, `HostTransport.exportData`, `HostTransport.sendExportBatch`, `HostTransport.getPeerInstances`, `HostTransport.destroy`, `HostTransport.sendInit`, `HostTransport.sendMessage`.
- **M:** `HostTransport.sendInitOnce`.
- **O callbacks:** `HostTransport.reportInitFailure.callback@177`, `HostTransport.exportData.callback@184`, `HostTransport.sendExportBatch.callback@199`.
- **I callbacks:** `HostTransport.constructor.callback@57`, `HostTransport.constructor.callback@62`, `HostTransport.registerPropsHandler.callback@78`, `HostTransport.exportData.callback@181`.
- **Retained rationale —** `HostTransport.sendInitOnce`: The idempotent guard, flag transition and launch of sendInit are a short atomic adapter.

Evidence: [host](_index.md#evidence-host); typecheck.

### [core/host/types.ts](../../packages/forgeframe/src/core/host/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [host](_index.md#evidence-host); typecheck.
