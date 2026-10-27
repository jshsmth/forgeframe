---
name: callables/render
title: Render callables
desc: Iframe, popup, and template rendering callables with their IOSP classifications and boundary tests.
tags: []
sources: []
created: 2026-10-27T21:30:00Z
updated: 2026-10-27T21:30:00Z
---

# Render callables

Classifications use the legend and evidence groups in the [callable reference index](_index.md). Update an entry when its callable changes, and run the suites its evidence names.

### [render/iframe-configuration.ts](../../packages/forgeframe/src/render/iframe-configuration.ts)

CSS key/value encoding, boolean HTML-attribute representation, attribute-name policy and the sandbox decision use only supplied data. Custom property names keep their case, unitless numeric styles stay numbers, and other numeric values become pixels. `assertIframeAttributeNames` folds names as HTML does (a non-object, such as an `attributes` function before it runs, has none to check): `name`, `src` and `srcdoc` are managed by ForgeFrame, and `sandbox` must use the component option; `create()` checks static `attributes`, and the element factory checks computed ones before an element exists. `assertSandboxOption` accepts omission, `false`, or a token string that contains `allow-scripts` and `allow-same-origin` (ASCII-whitespace split, case-insensitive). `resolveIframeSandbox` maps the option to the default tokens, the given string, or `null` for no attribute.

- **O:** `encodeIframeStyle`, `encodeIframeAttribute`, `assertIframeAttributeNames`, `assertSandboxOption`, `resolveIframeSandbox`.

Evidence: [render](_index.md#evidence-render), [iframe-configuration.test](../../packages/forgeframe/tests/unit/iframe-configuration.test.ts); typecheck.

### [render/iframe.ts](../../packages/forgeframe/src/render/iframe.ts)

Attribute names are checked before element creation. Dimensions use the shared `applyDimensions` from `render/templates.ts`. Style and attribute decisions use supplied data; applying them keeps write order. The element factory writes the sandbox it is given, as `resolveIframeSandbox` decided it, or none for `null`; it makes no sandbox decision itself.

- **O:** `destroyIframe`, `showIframe`, `hideIframe`, `focusIframe`, `applySandbox`.
- **I:** `createIframeElement`, `resizeIframe`, `applyStyles`, `applyAttributes`.

Evidence: [render](_index.md#evidence-render); typecheck.

### [render/popup-layout.ts](../../packages/forgeframe/src/render/popup-layout.ts)

Geometry, window features, and capped polling-delay growth use explicit screen and dimension data.

- **O:** `buildPopupFeatures`, `nextPopupPollInterval`.

Evidence: [render](_index.md#evidence-render), [popup-layout.test](../../packages/forgeframe/tests/unit/popup-layout.test.ts); typecheck.

### [render/popup.ts](../../packages/forgeframe/src/render/popup.ts)

Opening coordinates geometry with the browser action; a `null` window and the module-private `isPopupBlocked` heuristics both make it throw a `POPUP_BLOCKED` `ForgeFrameError`, and a window that only looked blocked is closed first, so it is never left open and untracked. `resizePopup` reports `false` when the browser denies access to another origin's window. Polling is one timer resource with a supplied `onClose` callback; its cancellation closure only clears the owned timer.

- **O:** `closePopup`, `focusPopup`, `isPopupBlocked`, `watchPopupClose`, `watchPopupClose.invokeCallback`, `watchPopupClose.check`, `resizePopup`.
- **I:** `openPopup`.
- **O callbacks:** `watchPopupClose.callback@267`.

Evidence: [render](_index.md#evidence-render); typecheck.

### [render/templates.ts](../../packages/forgeframe/src/render/templates.ts)

DOM creation, style insertion, fade scheduling, and dimension writes are cohesive browser operations. Swap coordinates the module-private fade operations and checks the caller's visibility request after the loading content fades.

- **O:** `ensureSpinnerKeyframes`, `defaultContainerTemplate`, `defaultPrerenderTemplate`, `fadeIn`, `fadeOut`.
- **I:** `swapPrerenderContent`.
- **M:** `applyDimensions`.
- **O callbacks:** `fadeIn.callback@211`, `fadeOut.callback@250`.
- **Retained rationale —** `applyDimensions`: Keep the two dimension guards beside their style writes; the shared dimension conversion is already isolated.

Evidence: [render](_index.md#evidence-render); typecheck.
