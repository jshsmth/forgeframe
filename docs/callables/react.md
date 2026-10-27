---
name: callables/react
title: React driver callables
desc: React adapter callables for lifecycle and prop synchronization with their IOSP classifications and boundary tests.
tags: []
sources: []
created: 2026-10-27T21:30:00Z
updated: 2026-10-27T22:13:25Z
---

# React driver callables

Classifications use the legend and evidence groups in the [callable reference index](_index.md). Update an entry when its callable changes, and run the suites its evidence names.

### [drivers/react.ts](../../packages/forgeframe/src/drivers/react.ts)

The wrapper imports React's own APIs; its type parameter is the component, its props come from `InputOf` of the component plus `ReactComponentProps<ExportsOf<C>>`, and its internal mount state uses the untyped `ComponentInstance`. `assertReactComponentArguments` reads the component's options from the registry once and applies the call-shape rules (no second argument, a ForgeFrame component, no reserved wrapper prop names, read through the shared `hasOwnDeclaredField` own-field rule as `create()` reads them, so an `undefined` entry counts as omitted), each a `VALIDATION` error; its tag names the wrapper. `splitWrapperProps` separates the wrapper's own props from the forwarded ones by the one reserved-name list (which also reserves React's `key`), the mount state comes from `createMountState`, and `containerElementProps` is the container's presentation policy (error or default layout, the caller's `style` winning). Hooks are unconditional and keep their order. Hook callbacks coordinate the lifecycle and queue helpers through the mount state ref. The container's ref is a callback created by `createContainerRef` and memoized per forwarded ref by `createContainerRefCache`, so a render React discards cannot replace a committed ref's callback, and React attaches and forwards the element during commit, before layout effects. The callback records the element and forwards it through the lifecycle module's `assignRef`, the one ref writer; a forwarded callback's React 19 cleanup replaces the `null` call on detach. The prop-sync effect's error observer drops a held update's `CLOSED` rejection while the render has not completed and the error carries the failed render's error as `cause` (`isHeldUpdateCancellation`).

- **O:** `splitWrapperProps`, `containerElementProps`, `createContainerRef`.
- **M:** `assertReactComponentArguments`, `createContainerRefCache`.
- **Retained rationale —** `createContainerRefCache`: the memo is the operation, and calling the `createContainerRef` factory is what it memoizes; its returned lookup callback is the same mix.
- **Retained rationale —** `assertReactComponentArguments`: It reads the registry's options once and applies three short call-shape rules to them; a separate lookup step would only pass the options through.
- **I:** `reportReactError`, `createReactComponent`, `createReactComponent.ForgeFrameComponent`, `createReactComponent.ForgeFrameComponent.callback@373.onError`.
- **O callbacks:** `createReactComponent.ForgeFrameComponent.callback@373.onRendered`, `createReactComponent.ForgeFrameComponent.callback@373.onClose`, `assertReactComponentArguments.callback@183`, `assertReactComponentArguments.callback@189`, `reportReactError.callback@284`, `createContainerRef.callback@268.callback@272`, `createReactComponent.ForgeFrameComponent.callback@366`.
- **M callbacks:** `createContainerRefCache.callback@244`.
- **I callbacks:** `createContainerRef.callback@268`, `createReactComponent.ForgeFrameComponent.callback@373`, `createReactComponent.ForgeFrameComponent.callback@393`, `createReactComponent.ForgeFrameComponent.callback@397`, `createReactComponent.ForgeFrameComponent.callback@397.callback@403`, `createReactComponent.ForgeFrameComponent.callback@397.callback@404`.

Evidence: [react](_index.md#evidence-react); typecheck.

### [drivers/react/lifecycle.ts](../../packages/forgeframe/src/drivers/react/lifecycle.ts)

Creating the mount state, sync state and the instance handle, selecting the current identity, recognizing a held update's cancellation (a `CLOSED` error whose `cause` the core set to the failed render's error), and writing a ref are operations. `createInstanceHandle` builds the frozen `instanceRef` handle; its methods delegate to the instance and its `exports` getter reads it live. `publishHandle`, `unpublishHandle` and `retargetHandle` move the handle between the mount state and the `instanceRef` target; the ref write runs through `callReactCallback`, so a throwing callback ref is logged and render completion still calls `onRendered`, and close still calls `onClose`. `callReactCallback` runs a wrapper callback and logs a throw or a rejected promise, so lifecycle work continues. Mounting sequences construction, observer registration, render completion (publish the handle, then `onRendered`), and cleanup. Promise callbacks discard results for obsolete mounts before applying state; a render failure already reported on the `error` event is not reported again.

- **O:** `isHeldUpdateCancellation`, `createMountState`, `isCurrentSyncState`, `createPropSyncState`, `createInstanceHandle`, `createInstanceHandle.exports`, `assignRef`, `callReactCallback`, `callReactCallback.log`.
- **I:** `createInstanceHandle.close`, `createInstanceHandle.focus`, `createInstanceHandle.resize`, `createInstanceHandle.show`, `createInstanceHandle.hide`, `clearRef`, `mountReactInstance`.
- **M:** `publishHandle`, `unpublishHandle`, `retargetHandle`.
- **Retained rationale —** `publishHandle`, `unpublishHandle`: each makes one transition of the published-handle state and writes the target through `assignRef` or `clearRef`, isolated by `callReactCallback`; splitting would separate a field write from the ref write it records. `retargetHandle`: it sequences `unpublishHandle` and `publishHandle` around the one `target` field write they depend on.
- **O callbacks:** `mountReactInstance.callback@270.callback@271`.
- **I callbacks:** `publishHandle.callback@148`, `unpublishHandle.callback@162` (each calls `assignRef` or `clearRef` for `callReactCallback`; the first records the returned cleanup), `mountReactInstance.callback@250`, `mountReactInstance.callback@243`, `mountReactInstance.callback@256`, `mountReactInstance.callback@262`, `mountReactInstance.callback@270`. Their single state writes (`reported.add`, `syncState.rendered`, releasing `syncState`) record where the sequence is; the error callback's record lets the render rejection skip a second report.

Evidence: [react](_index.md#evidence-react); typecheck.

### [drivers/react/prop-sync.ts](../../packages/forgeframe/src/drivers/react/prop-sync.ts)

Comparison, shallow snapshots, omission resets, and queue acknowledgement and failure transitions are explicit operations. Draining composes them around `updateProps` and checks identity at each await. There is no render gate: the core holds updates made during `render()`.

- **O:** `shallowEqualProps`, `deactivatePropSyncState`, `snapshotProps`, `buildPropUpdate`, `failPropUpdate`, `acknowledgePropUpdate`.
- **I:** `drainPropUpdates`.
- **O callbacks:** `snapshotProps.callback@76`.
- **M:** `enqueuePropSnapshot`.
- **Retained rationale —** `enqueuePropSnapshot`: Comparison chooses either one pending retry flag or an appended prepared payload. This short queue adapter keeps equivalent-commit behavior readable; comparison, reset construction and failure transitions are separate operations.

Evidence: [react](_index.md#evidence-react); typecheck.

### [react.ts](../../packages/forgeframe/src/react.ts)

**Contract only:** re-exports. The `forgeframe/react` entrypoint exports `createReactComponent` and the types `ReactComponentOf`, `ReactComponentProps` and `ReactInstance`; it is built with the root entry in one library build, so both share one core.

Evidence: [react](_index.md#evidence-react), [contract](_index.md#evidence-contract); typecheck.
