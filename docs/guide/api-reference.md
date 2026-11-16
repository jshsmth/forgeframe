---
name: guide/api-reference
title: API Reference
desc: Package exports, component options, instance methods, lifecycle, and iframe styles.
tags: []
sources: []
created: 2026-11-16T03:15:22Z
updated: 2026-11-16T03:15:22Z
---

# API Reference

A summary of the package's exports, component options and instance methods. Error codes are listed in the [README](../../README.md#errors).

## Exports

ForgeFrame 2 has named exports only. Use `import * as ForgeFrame from 'forgeframe'` if you prefer a namespace.

```typescript
import {
  create,               // Create a component
  closeAll,             // Close every live instance
  initHost,             // Start the host runtime; await host.ready before reading props
  isHost,               // Whether a host is active or this window holds a ForgeFrame payload
  prop,                 // Prop schema builders
  ForgeFrameError,      // The error ForgeFrame raises; branch on error.code
  VERSION,              // Library version
} from 'forgeframe';

import {
  createReactComponent, // React adapter; see React Integration
} from 'forgeframe/react';
```

## Component Options

Each `props` entry is either a Standard Schema or a `PropDefinition` object that wraps a schema with transport options (`sendToHost`, `deliverTo`, `queryParam`, `bodyParam`). At runtime an entry set to `undefined` is treated as omitted, so the prop is neither normalized nor sent; the types expect a schema for every entry, so declare an optional prop with an optional schema instead. Contexts and event names are plain strings (`'iframe'`, `'popup'`, `'rendered'`), typed as `ContextType` and `EventType`.

```typescript
interface ComponentOptions<P> {
  tag: string;
  url: string | ((props: P) => string);
  dimensions?: { width?: number | string; height?: number | string } | ((props: P) => { width?: number | string; height?: number | string });
  props?: PropsDefinition<P>;
  exports?: StandardSchemaV1;  // What the host exports; types instance.exports and is validated
  context?: 'iframe' | 'popup'; // Default context; render(container, context) overrides it
  containerTemplate?: (ctx: TemplateContext<P>) => HTMLElement | null;
  prerenderTemplate?: (ctx: TemplateContext<P>) => HTMLElement | null;
  hostOrigins?: OriginMatcher; // Consumer-side trusted host origins; required when url is a function
  peers?: 'same-origin' | OriginMatcher; // Opt in to peer discovery; a matcher also admits those host origins
  sandbox?: string | false;    // Iframe sandbox; omitted keeps the default, false writes none
  validate?: (opts: { props: P }) => void;
  attributes?: IframeAttributes | ((props: P) => IframeAttributes); // never sandbox
  style?: IframeStyles | ((props: P) => IframeStyles);
  initTimeout?: number;        // Handshake bound in ms (default 10000); remote callbacks have no timeout
  cspNonce?: string;           // Nonce for the default spinner's <style>; never sent to the host
}
```

## Instance Methods

<!-- readme-check: skip -->
```typescript
const instance = MyComponent(props);

await instance.render(container, context?)   // Render into a container (container is required); POPUP_BLOCKED leaves it open
await instance.close()                       // Close and destroy
instance.focus()                             // Focus; synchronous
instance.resize({ width, height })           // Resize; synchronous, throws VALIDATION for a cross-origin popup
instance.show()                              // Show; synchronous
instance.hide()                              // Hide; synchronous
await instance.updateProps(newProps)         // Merge a patch; undefined resets a prop; queued while rendering

instance.uid                                 // Unique ID
instance.event                               // Subscribe with on() and once()
instance.exports                             // Host exports (read-only)

MyComponent.instances                        // Frozen snapshot of live instances, in creation order
await closeAll()                             // Close every live instance of every component
```

## Instance Lifecycle

- **URL resolution.** Relative component URLs resolve against `document.baseURI`, including any `<base href>`. `render()` validates and pins the absolute URL before loading callbacks run and uses it for navigation and prop delivery checks, so changing the document base during a callback cannot redirect the initial request.
- **Closing during render.** Calling `close()` while `render()` is in flight cancels the render, removes its loading and host elements, and stops any iframe or popup that has not opened yet. The render promise rejects with a `CANCELLED` [`ForgeFrameError`](../../README.md#errors); when the host's `close()` or the user closing the popup ends the render instead, it rejects with `CLOSED`.
- **Repeated close.** Repeated or reentrant `close()` calls wait for the same operation, including deregistration and the `closed` event; `close`, `closed` and cleanup run once. If a failed render already started destruction, `close()` waits for that teardown without emitting `close`.

## Iframe Styles and Loading

Numeric `style` values become pixels, except for unitless CSS properties, which stay numbers; custom property names are case-sensitive. While the host loads, ForgeFrame conceals the iframe; lazy iframes stay in layout so they can load. After initialization it restores configured `display`, `visibility`, `opacity`, and `transition` styles without its default fade overriding them. `show()` and `hide()` calls take precedence over configured visibility.
