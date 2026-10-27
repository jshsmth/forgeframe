---
name: callables/communication
title: Communication callables
desc: Bridge, messenger, and wire protocol callables with their IOSP classifications and boundary tests.
tags: []
sources: []
created: 2026-10-27T21:30:00Z
updated: 2026-10-27T21:30:00Z
---

# Communication callables

Classifications use the legend and evidence groups in the [callable reference index](_index.md). Update an entry when its callable changes, and run the suites its evidence names.

### [communication/bridge.ts](../../packages/forgeframe/src/communication/bridge.ts)

Registry reconciliation, capacity admission, reference framing, and remote wrapper creation are separate responsibilities. Recursive object/array codecs and local ID reconciliation are cohesive algorithms. Decoding has no cycle check: its input always comes from parsed JSON. CALL and PEER_CALL invoke supplied functions after browser-source authorization; an unexpected window is `ORIGIN_REJECTED` and a retired ID is `CLOSED`. A supplied function's own failure is rethrown without a code, even when it is a `ForgeFrameError`, so the caller's plain `Error` never looks like a ForgeFrame failure. The exception is a remote wrapper this module created (tracked in a module-private `WeakSet`), which the consumer's peer relay registers for another host's export: its failure, such as `CLOSED` for a retired peer, is ForgeFrame's and keeps its code. The call channel is passed in, so peer relay registries have a lifetime independent of prop and export batches.

Reference guards require the complete own-property wire shape, so records with extra user fields stay data. Ordinary marker-shaped records are escaped after JSON conversion and omission and restored as data, including nested escape markers, in props and exports.

Array encoding reads and checks every indexed entry once before recursive registration, rejecting `undefined` entries and sparse holes in props and exports. It never calls caller-controlled array methods, so arrays with null prototypes or a shadowed `map` encode correctly. Object-field omission and function/`Date` framing are separate rules.

Encoding converts objects other than arrays, dates, and native raw JSON through `toJSON(key)` and primitive unboxing once, as native JSON does, so a class's `toJSON()` decides what crosses; the module-private `serializeConvertedValue` dispatches an already converted value to function framing, `serializeArray`, `Date` framing, or `serializeRecord` (arrays first, since they never carry the `Date` brand), and nested values convert again through `serializeFunctions`. Both paths reach `serializeRecord`, which returns native raw JSON unchanged, at any depth or from `toJSON()`, so the message envelope's JSON encoding writes its text. `isSafeObjectKey` is shared with the props codec's root decode filter. The source object stays on the cycle stack while its `toJSON()` result is encoded, so a result that contains its source is reported as circular. A `toJSON()` that returns `undefined` for an array entry is rejected like an `undefined` entry. Remote wrappers send calls without a timeout, because the callback may still be running in the other window; teardown rejects them, and `rejectRemoteCalls` rejects this bridge's in-flight calls to a host whose document was replaced. `endRemoteSession` rejects calls to a window whose host session ended, including calls not yet dispatched, and makes later wrapper calls to it reject until `resumeRemoteSession`. While calls to a window are pending, `watchRemoteCall` counts them and `scheduleLivenessCheck` asks that window every 10 s, on a `<call channel>_liveness` request answered by the same source guard, whether it still listens; an unanswered check rejects the window's pending calls unless they belong to a newer watch, so a document that went away without teardown cannot leave them waiting forever. The constructor requires a source guard; there is no permissive default.

Local callback admission rejects snapshots over 500 functions without evicting. Batch ownership records new IDs for rollback before delivery; an uncertain delivery keeps references within a 1,000-entry pool. Append-mode peer relays have a cumulative 500-reference bound. Verified reconnect cleanup runs inside the consumer props queue before bootstrap serialization: it releases strong registrations and keeps the weak IDs of props the new document already acknowledged.

- **O:** `isSafeObjectKey`, `FunctionBridge.retainLocalFunction`, `FunctionBridge.findRemoteWrapper`, `FunctionBridge.evictOldestRemote`, `FunctionBridge.assertLocalCapacity`, `FunctionBridge.clearBatch`, `FunctionBridge.createRemoteWrapper`, `FunctionBridge.isFunctionRef`, `FunctionBridge.removeLocal`, `FunctionBridge.startBatch`, `FunctionBridge.staleLocalIds`, `FunctionBridge.resumeRemoteSession`, `FunctionBridge.livenessMessageName`, `FunctionBridge.clearRemote`, `serializeFunctions`, `enterStack`, `serializeConvertedValue`, `serializeArray`, `serializeRecord`, `deserializeFunctions`, `createFunctionRef`.
- **I:** `FunctionBridge.constructor`, `FunctionBridge.serialize`, `FunctionBridge.rejectRemoteCalls`, `FunctionBridge.endRemoteSession`, `FunctionBridge.scheduleLivenessCheck`, `FunctionBridge.deserialize`, `FunctionBridge.createRemoteWrapper.wrapper`, `FunctionBridge.setupCallHandler`, `FunctionBridge.finishBatch`, `FunctionBridge.abortBatch`, `FunctionBridge.clearLocal`, `FunctionBridge.destroy`.
- **M:** `FunctionBridge.watchRemoteCall`.
- **O callbacks:** `FunctionBridge.setupCallHandler.callback@383`, `FunctionBridge.setupCallHandler.callback@409`, `FunctionBridge.watchRemoteCall.callback@311`, `FunctionBridge.staleLocalIds.callback@503`.
- **I callbacks:** `deserializeFunctions.callback@726`, `FunctionBridge.scheduleLivenessCheck.callback@325`.
- **M callbacks:** `FunctionBridge.scheduleLivenessCheck.callback@325.callback@335`, `FunctionBridge.scheduleLivenessCheck.callback@325.callback@339`.
- **Retained rationale —** `FunctionBridge.scheduleLivenessCheck.callback@325.callback@335`, `FunctionBridge.scheduleLivenessCheck.callback@325.callback@339`: Each settles one check with one guard that its watch is still current and one call, rescheduling or rejecting, so a check from a finished watch neither continues the loop nor rejects calls a newer watch tracks.
- **Retained rationale —** `FunctionBridge.watchRemoteCall`: It creates a window's watch and schedules its first liveness check when none exists, counts the call, and returns the release closure; the watch entry, the counter and the first schedule are one transition.

Evidence: [messaging](_index.md#evidence-messaging); typecheck.

### [communication/messenger.ts](../../packages/forgeframe/src/communication/messenger.ts)

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

Evidence: [messaging](_index.md#evidence-messaging); typecheck.

### [communication/protocol.ts](../../packages/forgeframe/src/communication/protocol.ts)

Envelope framing and decoding are operations. `serializeMessage` (**I**) prefixes the envelope's JSON from the shared `stringifyForWire`, so a value JSON cannot encode rejects as `VALIDATION` with the encoder's error as `cause`. Malformed messages decode to null. An error response carries `code` only for an error ForgeFrame raised (`wireErrorCode`); a non-string `code` makes the message malformed.

- **O:** `deserializeMessage`, `createRequestMessage`, `createResponseMessage`.
- **I:** `serializeMessage`.

Evidence: [messaging](_index.md#evidence-messaging); typecheck.

### [communication/types.ts](../../packages/forgeframe/src/communication/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [messaging](_index.md#evidence-messaging); typecheck.
