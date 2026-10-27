---
name: callables/entrypoints
title: Entry point and type modules
desc: Package entry points, constants, errors, events, and type-only modules with their IOSP classifications.
tags: []
sources: []
created: 2026-10-27T21:30:00Z
updated: 2026-10-27T21:30:00Z
---

# Entry point and type modules

Classifications use the legend and evidence groups in the [callable reference index](_index.md). Update an entry when its callable changes, and run the suites its evidence names.

### [constants.ts](../../packages/forgeframe/src/constants.ts)

The `VERSION` initializer validates the injected build value. Other entries are immutable protocol constants.

- **O callbacks:** `callback@130`.

Evidence: [contract](_index.md#evidence-contract); typecheck.

### [errors.ts](../../packages/forgeframe/src/errors.ts)

`ForgeFrameError` and the `ForgeFrameErrorCode` literal union. The constructor sets `name` and the read-only `code` and passes `cause` to `Error`. The wire helpers are the only place codes cross windows: `wireErrorCode` reads the code to send with an error response, `isForgeFrameErrorCode` admits only the eight known codes, and `errorFromWire` rebuilds a received error; a code this version does not know arrives as a plain `Error`, which is the documented 2.x policy for codes added in later minors. `hasErrorCode` is the one code check used by policy, such as the export-rejection and payload-capacity classifications. `errorFromWire` and the consumer transport's `readHostError` are both **O**: each chooses between two constructions of one received error.

- **O:** `ForgeFrameError.constructor`, `isForgeFrameErrorCode`, `wireErrorCode`, `hasErrorCode`, `errorFromWire`.

Evidence: [naming-and-errors.test](../../packages/forgeframe/tests/integration/naming-and-errors.test.ts), [messaging](_index.md#evidence-messaging), [contract](_index.md#evidence-contract); typecheck.

### [events/emitter.ts](../../packages/forgeframe/src/events/emitter.ts)

Each runtime keeps its emitter private; callers get the frozen `on`/`once` facade from `createEventSubscriber`, which rejects names outside the supplied set and non-function handlers before registering, so nobody outside the owning runtime can emit or remove other listeners. Listener storage keeps one registration token per handler and event, as DOM listeners do: registering a handler again keeps the first registration. Each returned unsubscribe function removes only the registration it created, so a stale handle cannot remove a newer registration of the same handler, and it also cancels a pending `once`. Emission runs each supplied observer in isolation, from a registration snapshot, in subscription order, and skips registrations removed before their turn. A `once` registration is removed immediately before its observer runs. New or replaced registrations wait for the next emission, so a rearmed `once` observer cannot loop within one dispatch. `dispose` clears every listener at the end of teardown and makes later registrations inert.

- **O:** `EventEmitter.register`, `EventEmitter.register.callback@84`, `EventEmitter.register.callback@94`, `EventEmitter.removeRegistration`, `EventEmitter.invokeHandler`, `EventEmitter.dispose`, `createEventSubscriber`, `createEventSubscriber.assertKnown`.
- **I:** `EventEmitter.on`, `EventEmitter.once`, `EventEmitter.emit`, `createEventSubscriber.on`, `createEventSubscriber.once`.
- **O callbacks:** `EventEmitter.invokeHandler.callback@159`.

Evidence: [consumer](_index.md#evidence-consumer), [component-events.test](../../packages/forgeframe/tests/unit/component-events.test.ts), [host](_index.md#evidence-host); typecheck.

### [index.ts](../../packages/forgeframe/src/index.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables. The `forgeframe` entrypoint has named exports only and no React exports.

Evidence: [contract](_index.md#evidence-contract); typecheck.

### [types.ts](../../packages/forgeframe/src/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [contract](_index.md#evidence-contract); typecheck.

### [types/events.ts](../../packages/forgeframe/src/types/events.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [contract](_index.md#evidence-contract); typecheck.

### [types/props.ts](../../packages/forgeframe/src/types/props.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables. The public definition types are `PropsDefinition`, `PropDefinition`, `InferProps` and `InferPropsInput`.

Evidence: [contract](_index.md#evidence-contract); typecheck.

### [types/runtime.ts](../../packages/forgeframe/src/types/runtime.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables. `Component`, `ComponentInstance`, the `PropsOf`/`InputOf`/`ExportsOf`/`HostPropsOf` helpers, and the inference-only option types that `create()` checks entries and the `exports` schema with.

Evidence: [contract](_index.md#evidence-contract); typecheck.

### [types/templates.ts](../../packages/forgeframe/src/types/templates.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [contract](_index.md#evidence-contract); typecheck.

### [types/utility.ts](../../packages/forgeframe/src/types/utility.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [contract](_index.md#evidence-contract); typecheck.
