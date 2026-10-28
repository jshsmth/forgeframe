---
name: architecture
title: ForgeFrame architecture
desc: Consumer and host state ownership, transport contracts, and lifecycle flows.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-10-28T00:03:58Z
---

# ForgeFrame architecture

[[_index|..]]

[[architecture/design-rules|design-rules]]: IOSP design rules for operations, integrations, and policy placement.

[[architecture/lifecycle|lifecycle]]: Close and teardown order, deregistration, and event subscription and dispatch rules.

[[architecture/messages|messages]]: Message admission, request handling, and the function bridge's identity, capacity, and codec rules.

[[architecture/ownership|ownership]]: Each subsystem's entry points and the state and work it owns.

[[architecture/playground|playground]]: The company payment demo and the diagnostic playground.

[[architecture/props-pipeline|props-pipeline]]: The serialized props update sequence, from patch merge to host delivery and notification.

[[architecture/react|react]]: The React wrapper's effect order, instanceRef handle, and commit synchronization.

[[architecture/render-bootstrap|render-bootstrap]]: The render sequence, verified host bootstrap, loading, and visibility.

[[architecture/serialization|serialization]]: Cross-realm values, JSON conversion, caller-data snapshots, and event payload types.

***

ForgeFrame has two runtimes: the **consumer** is the outer embedding app, and the **host** is the embedded iframe or popup. The package has two public entrypoints with named exports only: `packages/forgeframe/src/index.ts` (`forgeframe`) and `src/react.ts` (`forgeframe/react`, the React adapter). One library build emits both, so modules they share, such as the component registry and `ForgeFrameError`, are emitted once in a shared chunk and exist once per page; the root entry contains no React code. Importing either entrypoint does not start a browser runtime: a host starts only through `initHost()`. Without browser globals, `isHost()` returns false and a well-formed `initHost()` call returns null; malformed `initHost()` arguments still throw.

Open only the page for the flow you are changing.
