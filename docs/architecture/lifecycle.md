---
name: architecture/lifecycle
title: Lifecycle and teardown
desc: Close and teardown order, deregistration, and event subscription and dispatch rules.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-10-28T00:00:00Z
---

# Lifecycle and teardown

- Consumer teardown owns factory and index deregistration through the callback the factory passes to each instance; no public listener takes part. Deregistration runs before `closed`, the last event, after which the emitter is disposed: later subscriptions are accepted and never called.
- `close()` installs a shared completion promise before `close` is emitted, and destruction installs its own. Repeated and reentrant close requests wait for that operation, including deregistration and `closed`, without repeating cleanup or events. A close that arrives during failed-render cleanup waits for the destruction already in progress; that path emits `closed` without `close`.
- Each runtime's emitter is private. `instance.event` and the host's `on`/`once` are frozen facades that subscribe only to known names; removed v1 names throw with their replacement. Nobody outside the runtime can emit or remove another caller's listeners.
- Each handler has one registration per event, as with DOM listeners: registering it again keeps the first registration, and a returned unsubscribe removes only the registration it created, including a pending `once`.
- Event dispatch snapshots subscribed handlers and their registration identities before invoking them. Subscriptions added during dispatch wait for the next emission; listeners removed before their turn are skipped, including after cancellation and re-registration. A `once` observer can rearm itself without being invoked twice in one emission.
- `focus` is emitted only when a focus request reaches a mounted iframe or an open popup. `exports` is emitted after `instance.exports` is replaced by a verified EXPORT that passed the `exports` schema; a reconnection clears `exports` silently. The `cspNonce` component option reaches only templates, never props.
