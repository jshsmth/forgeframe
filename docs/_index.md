---
name: docs
title: ForgeFrame development wiki
desc: Current architecture, state ownership, callable responsibilities, and test boundaries.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-10-28T00:03:58Z
---

# ForgeFrame development wiki

[[architecture/_index|architecture/]]: Consumer and host state ownership, transport contracts, and lifecycle flows.

[[callables/_index|callables/]]: Runtime callable responsibilities, IOSP classifications, and boundary test evidence.

***

Use [architecture](architecture/_index.md) for subsystem ownership and render/bootstrap,
props, callback, and React flows; it also links one page per flow. Use the [callable reference](callables/_index.md)
when changing individual runtime operations or selecting their boundary tests;
it links one page per subsystem, so open only the one you need.

Public usage, contributor commands, and wiki setup live in the
[root README](../README.md). Suite selection and fixture conventions live in the
[test index](../packages/forgeframe/tests/README.md). This wiki describes the
current implementation; completed audit reports and temporary work logs belong
in Git history.
