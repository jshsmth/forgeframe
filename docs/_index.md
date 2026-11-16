---
name: docs
title: ForgeFrame wiki
desc: User guides, plus the contributor architecture, callable responsibilities, and test boundaries.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-11-16T03:15:39Z
---

# ForgeFrame wiki

[[architecture/_index|architecture/]]: Consumer and host state ownership, transport contracts, and lifecycle flows.

[[callables/_index|callables/]]: Runtime callable responsibilities, IOSP classifications, and boundary test evidence.

[[developing|developing]]: Local setup, the playground, source layout, wiki maintenance, checks, and the release workflow.

[[guide/_index|guide/]]: Reference guides for using ForgeFrame, covering props, the host API, templates, React, security, TypeScript, and migration.

***

The wiki serves two audiences.

**Using ForgeFrame:** the [user guide](guide/_index.md) holds the reference pages for props, the host API, templates, React, security and other advanced features, TypeScript, the API reference and the v1 migration guide. Installation, the quick start, error codes and versioning live in the [root README](../README.md).

**Contributing to ForgeFrame:** start with [Developing ForgeFrame](developing.md) for setup, checks, wiki maintenance and the release workflow. Use [architecture](architecture/_index.md) for subsystem ownership and render/bootstrap, props, callback, and React flows; it also links one page per flow. Use the [callable reference](callables/_index.md) when changing individual runtime operations or selecting their boundary tests; it links one page per subsystem, so open only the one you need.

Suite selection and fixture conventions live in the [test index](../packages/forgeframe/tests/README.md). The contributor pages describe the current implementation; completed audit reports and temporary work logs belong in Git history.
