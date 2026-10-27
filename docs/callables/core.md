---
name: callables/core
title: Core component callables
desc: Component factory, registry, instance index, and render-context callables with their IOSP classifications and boundary tests.
tags: []
sources: []
created: 2026-10-27T21:30:00Z
updated: 2026-10-27T21:30:00Z
---

# Core component callables

Classifications use the legend and evidence groups in the [callable reference index](_index.md). Update an entry when its callable changes, and run the suites its evidence names.

### [core/component-instance-index.ts](../../packages/forgeframe/src/core/component-instance-index.ts)

Index mutation and snapshots are cohesive state operations. This module is the only active-instance index. Indexed instances expose their verified and opened host origins and their component's `peers` setting for peer scoping.

- **O:** `indexComponentInstance`, `removeIndexedComponentInstance`, `clearIndexedInstancesByTag`, `clearIndexedInstances`, `getComponentInstancesByTag`, `getIndexedComponentInstances`.

Evidence: [consumer](_index.md#evidence-consumer); typecheck.

### [core/component-registry.ts](../../packages/forgeframe/src/core/component-registry.ts)

Registration, lookups, snapshots, and deletion are state operations. The registry owns component metadata.

- **O:** `registerComponent`, `hasRegisteredComponent`, `getRegisteredComponent`, `getComponentOptions`, `deleteRegisteredComponent`, `clearRegisteredComponents`.

Evidence: [consumer](_index.md#evidence-consumer); typecheck.

### [core/component.ts](../../packages/forgeframe/src/core/component.ts)

`create` has one inference-only signature: props, factory input and exports types come from the schemas, so the runtime body handles plain records. Declaration policy receives options, including origin-matcher validation, so empty or blank matcher strings and strings without a scheme throw; static URL context selection receives the observed origin. Factory construction is an integration. `create` keeps its own copy of the options and validates the copy; `copyPropDefinitions` (**O**) then copies the checked definitions map and each wrapped entry, so later changes to the caller's objects cannot bypass validation. Defining a component never starts or configures a host: the module does not import the host runtime, and `initHost(Component, ...)` reads the registered options instead. An owner callback removes factory and index identities before the `closed` event; no public listener takes part, so user code cannot affect the bookkeeping. The `instances` getter (`create.get`) is an **O** state snapshot that returns a new frozen copy of the factory list on each read. `closeAll` is an integration over the global instance index: it snapshots every live instance, closes them concurrently, and collects failures into one `AggregateError` after every close settles.

`validateComponentOptions` composes the declaration checks before registration, each an **O** over supplied options without browser or registry access: `assertNoRemovedComponentOptions` (first, so a renamed option is reported by its new name), `assertComponentFields` (tag and URL shape, `hostOrigins` required when `url` is a function, `initTimeout`, and the optional non-empty `cspNonce`), `assertComponentMatchers` (the `hostOrigins` and `peers` matchers, empty arrays rejected; `peers` is `"same-origin"` or a matcher; `true` throws a rename error and `false` names how to keep discovery off), the `context` check through the shared `resolveRenderContext` (so `create()` and `render()` apply one rule), `assertSandboxOption`, `assertIframeAttributeNames` for static `attributes`, the shared `assertPropDefinitionsObject`, `assertExportsSchema` (the optional `exports` option is a Standard Schema), then `validateStaticComponentUrl` and the duplicate-tag rule. Every declaration error is a `VALIDATION` `ForgeFrameError`. `assertPropDefinitionsObject` (in `core/host/reserved-props.ts`, shared with `initHost()`) treats `undefined` entries as omitted, matching normalization, rejects `then` and `children`, and applies the shared prop-definition checks (getter entries, removed and unknown options including `outputSchema`, a missing `schema`, `deliverTo`, `sendToHost`, and parameter names and their clashes); `component.test.ts` covers both cases. `assertNoRemovedComponentOptions` reads one name-to-replacement table and throws a migration error naming the replacement for the removed `allowedConsumerDomains`, `eligible`, `children` and `peerDomains` options and the renamed `domain`, `timeout` and `defaultContext`.

- **O:** `assertComponentFields`, `assertNoRemovedComponentOptions`, `staticUrlValidationContext`, `removeTrackedInstance`, `copyPropDefinitions`, `create.get`.
- **I:** `validateStaticComponentUrl`, `create`, `create.untrackInstance`, `create.createTrackedInstance`, `getComponent`, `closeAll`, `unregisterComponent`, `clearComponents`.
- **M:** `create.trackInstance`, `validateComponentOptions`, `assertExportsSchema`, `assertComponentMatchers`.
- **O callbacks:** `closeAll.callback@415`.
- **I callbacks:** `create.Component`, `closeAll.callback@413`.
- **Retained rationale —** `create.trackInstance`: The factory-local guard, list append and index update share one lifetime. Keep this short ownership adapter next to construction; removal bookkeeping is named separately.
- **Retained rationale —** `assertExportsSchema`: It is the shared `isStandardSchema` predicate and the one throw it guards; a wrapper around the predicate would add nothing.
- **Retained rationale —** `assertComponentMatchers`: It applies the shared `assertOriginMatcher` to `hostOrigins` and `peers`, plus the one boolean `peers` rule that only this option has (`true` was renamed `"same-origin"`, `false` is never valid); naming that rule would wrap a single type check.
- **Retained rationale —** `validateComponentOptions`: It sequences the declaration checks and the static-URL check, plus one duplicate-tag rule over the registry and the `context` check, which calls `resolveRenderContext` only for its throw and discards the result; each rule is one line, and naming it would only wrap a `has` check or a call.

Evidence: [consumer](_index.md#evidence-consumer); typecheck.

### [core/render-context.ts](../../packages/forgeframe/src/core/render-context.ts)

`resolveRenderContext` selects a requested context or the fallback and checks that it is `"iframe"` or `"popup"`, raising `VALIDATION` with the caller's label otherwise. `create()` checks the `context` option and `render()` resolves its argument through it, so both apply one rule.

- **O:** `resolveRenderContext`.

Evidence: [consumer](_index.md#evidence-consumer); typecheck.

### [core/index.ts](../../packages/forgeframe/src/core/index.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [consumer](_index.md#evidence-consumer); typecheck.
