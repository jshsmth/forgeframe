---
name: architecture/design-rules
title: Design rules
desc: IOSP design rules for operations, integrations, and policy placement.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-10-28T00:00:00Z
---

# Design rules

Operations implement cohesive policy, transformations, state transitions, or browser actions. Integrations sequence package-owned behavior. A call to a browser, runtime, or schema API does not by itself require extraction. Keep cohesive recursive algorithms and short local adapters together; do not add an interface or wrapper without a useful responsibility.

Pure policy depends on supplied observations and neutral types and helpers. Browser reads and resource effects belong in browser operations or their coordinating runtime. Internal helpers stay inside their subsystem and are not added to root exports. Schema classes are exported as types only, so `prop.*` is their one constructor; they keep their existing members, decomposed with module-level helpers. `CONTEXT` and `EVENT` are internal constants; the public names are the `ContextType` and `EventType` literal unions.

See the [callable reference](../callables/_index.md) for per-callable classifications and the [test index](../../packages/forgeframe/tests/README.md) for boundary tests. Public contracts are documented in the root README and enforced by the typecheck suites.
