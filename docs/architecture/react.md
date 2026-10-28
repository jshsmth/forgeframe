---
name: architecture/react
title: React commit flow
desc: The React wrapper's effect order, instanceRef handle, and commit synchronization.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-10-28T00:00:00Z
---

# React commit flow

The hook wrapper updates callback refs and its latest-props ref, mounts an instance for the current context with those props, moves the `instanceRef` handle to a changed `instanceRef` prop, and observes committed props, in that effect order. The container element's ref is a callback created once per forwarded ref, so React attaches and forwards the element during commit, before layout effects, and a forwarded callback's React 19 cleanup replaces its `null` call.

`instanceRef` receives a frozen handle (`uid`, a live `exports` getter, `event`, `close`, `focus`, `resize`, `show`, `hide`; no `render` or `updateProps`) only after the current mount's `render()` resolves, immediately before `onRendered`. It is cleared before `onClose` when that instance closes (by the host, the user, the handle or cleanup), when the wrapper unmounts or `context` remounts it, and is never set after a failed render. Only the current mount writes it; a callback ref's React 19 cleanup replaces its `null` call, and a callback ref that throws is logged like the other wrapper callbacks, so `onRendered` and `onClose` still run. A render failure that also arrives on the `error` event is reported to `onError` once.

Each mounted instance has its own sync state. Commits produce shallow snapshots without `undefined`-valued keys, so passing `undefined` and omitting a prop are the same commit, and send `undefined` for previously known keys that are now omitted, which resets them in core. A failed equivalent pending commit requests one retry; successful acknowledgements advance the FIFO. There is no render gate: a commit during `render()` is sent at once and the core holds it until the render settles; if the render fails, the held update's `CLOSED` rejection is not reported, because the render failure is. Draining checks the current instance identity around every await, so failed or obsolete work cannot update a new mount's refs or queue. Cleanup deactivates the queue before closing and unsubscribing.
