---
name: guide
title: ForgeFrame user guide
desc: Reference guides for using ForgeFrame, covering props, the host API, templates, React, security, TypeScript, and migration.
tags: []
sources: []
created: 2026-11-16T03:15:22Z
updated: 2026-11-16T03:15:22Z
---

# ForgeFrame user guide

[[_index|..]]

[[guide/advanced|advanced]]: Popup windows, origin security and sandboxing, pre-render checks, and nested components.

[[guide/api-reference|api-reference]]: Package exports, component options, instance methods, lifecycle, and iframe styles.

[[guide/host-api|host-api]]: initHost(), the host handle and its controls, deferred init, and exporting data to the consumer.

[[guide/migrating-v1-to-v2|migrating-v1-to-v2]]: Every v1 to v2 change, with the v1 form, the v2 form, and what to do.

[[guide/props|props]]: Prop schemas, Standard Schema libraries, defaults, URL and body props, updates, and cross-window callback values.

[[guide/react|react]]: React wrapper props, the instanceRef handle, prop syncing, server rendering, Server Components, and Preact.

[[guide/templates|templates]]: Container and prerender templates for custom chrome and loading states.

[[guide/typescript|typescript]]: Type inference from schemas, typing helpers, and typing the host.

***

These pages are for people building a consumer or a host with ForgeFrame. Start with the [root README](../../README.md) for installation, the quick start and the step-by-step guide, then open the page for the topic you need. Error codes and the versioning policy stay in the README.

Every TypeScript example on these pages except the [v1 migration guide](migrating-v1-to-v2.md) is compiled against the packed package by `npm run test:package`; put `<!-- readme-check: skip -->` on the line before a block that is not meant to compile.
