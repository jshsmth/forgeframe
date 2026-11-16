---
name: guide/advanced
title: Advanced Features
desc: Popup windows, origin security and sandboxing, pre-render checks, and nested components.
tags: []
sources: []
created: 2026-11-16T03:15:22Z
updated: 2026-11-16T03:15:22Z
---

# Advanced Features

This page covers rendering in a popup, the origin and sandbox trust options, checks that run before a render, and components nested inside a host.

## Popup Windows

Pass `'popup'` to `render()`, or set `context: 'popup'` on the component. If the browser blocks the popup, `render()` rejects with `POPUP_BLOCKED` and leaves the instance open, so you can fall back to an iframe on the same instance:

```typescript
try {
  await instance.render('#container', 'popup');
} catch (error) {
  if (!(error instanceof ForgeFrameError) || error.code !== 'POPUP_BLOCKED')
    throw error;
  await instance.render('#container', 'iframe');
}

const PopupComponent = create({
  tag: 'popup-component',
  url: 'https://widgets.example.com/popup',
  context: 'popup',
});
```

After the popup initializes, ForgeFrame removes the loading content, including custom prerender content, and the default loading wrapper from the consumer mount. Caller-owned elements and custom container-template shells stay.

Browsers do not let one origin resize another origin's window. For a popup that is not open, `instance.resize()` does nothing. For a cross-origin popup, `instance.resize()` throws a `VALIDATION` error at the call, without emitting `resize`; call `host.resize()` from the host instead, which resizes the popup's own window and then notifies the consumer. Browsers can still ignore resize requests, for example for a popup opened as a tab.

## Origin Security

Every trust decision is explicit, and `'*'` is the visible opt-in for "any origin".

Each option takes origins: a scheme, host and port, such as `https://app.example.com`. A bare host such as `example.com` never matches an origin, so it is rejected.

- `hostOrigins` is consumer-side trust: the host origins the consumer will render and message. A static `url` trusts its own origin when `hostOrigins` is omitted. A function `url` requires `hostOrigins`, and every URL it returns must match; `create()` throws without it, so a URL built from props, a query string or tenant data can never point the consumer at an unlisted origin. `hostOrigins: '*'` with a function `url` trusts any http(s) origin the function returns.
- `consumerOrigins`, passed to `initHost()`, is host-side trust: the consumer origins that may embed and initialize the host. It is required; `'*'` admits any http(s) consumer, and the host still binds the exact origin the browser verified, so `host.consumerOrigin` and outbound messages use that origin.
- `peers` decides whether, and to which host origins, a component's instances are listed for peer discovery.
- Use `hostOrigins` and `consumerOrigins` together for payment, auth, account, and other sensitive workflows.

Each accepts a string, a `RegExp`, or an array mixing them, including a readonly `as const` array. A string is an exact origin, or `'*'` alone, which matches any origin. The only wildcard is a leading `*.` in the host, which stands for one or more labels: `'https://*.example.com'` matches `https://app.example.com` and `https://a.b.example.com`, but not `https://example.com`, `https://evilexample.com` or `http://app.example.com`, and the scheme and port must match exactly. Any other `*`, such as `'https://*example.com'`, `'https://app.example.com*'` or `'https://api.*.example.com'`, a pattern without a scheme, such as `'*.example.com'`, one with a path, such as `'https://app.example.com/'`, and an exact origin or wildcard in a form browsers never report, such as `'https://App.example.com'`, `'https://example.com:443'` or `'https://*.example.com:443'`, throw a `VALIDATION` error that names the form to write. Use a `RegExp` for anything more flexible, and anchor it at both ends with `^` and `$`: an unanchored `/https:\/\/example\.com/` also matches `https://example.com.evil.com`. Empty or blank strings, `null`, and other values throw, so a missing setting such as `process.env.CONSUMER_ORIGIN || ''` cannot silently trust every origin. An empty array throws for `hostOrigins`, `peers`, and `deliverTo`, where it could never match; for `consumerOrigins` it is valid and admits no consumer, so configuration that resolves to nothing fails closed.

No matcher, including `'*'` or a match-all `RegExp`, ever admits an opaque (`"null"`) origin, such as a document sandboxed without `allow-same-origin`. Every opaque document serializes the same way, so the origin cannot identify a peer.

```typescript
// secure-component.ts, shared by the consumer and the host
export const SecureComponent = create({
  tag: 'secure',
  url: 'https://secure.example.com/widget',
  props: {
    accountId: prop.string(),
    onComplete: prop.function<(result: { ok: true }) => void>(),
  },
  hostOrigins: 'https://secure.example.com',
});

// A URL computed from props needs the host origins it may return
export const TenantWidget = create({
  tag: 'tenant-widget',
  url: (props) => `https://${props.tenant}.widgets.example.com/embed`,
  hostOrigins: 'https://*.widgets.example.com',
  props: { tenant: prop.string().pattern(/^[a-z0-9-]+$/) },
});
```

On the host page, pass the component and the consumer allowlist to `initHost`:

```typescript
const host = initHost(SecureComponent, {
  consumerOrigins: [
    'https://app.example.com',
    'https://*.app.example.com',
    /^https:\/\/[a-z0-9-]+\.partner\.example$/,
  ],
});

// A widget meant to be embedded anywhere says so explicitly
const publicHost = initHost(PublicWidget, { consumerOrigins: '*' });
```

The host verifies the consumer by requiring a response from the expected parent or opener window at its exact origin. Verification works with `Referrer-Policy: no-referrer` and after full-page host navigation. If the origin is not allowed, `initHost()` throws `ORIGIN_REJECTED` before any props are requested, and the consumer's `render()` rejects at its `initTimeout` with `INIT_TIMEOUT`; if the consumer cannot complete the handshake, `ready` rejects. The allowlist belongs to the host that enforces it, so `create()` throws if it still receives the v1 host allowlist option. As defence in depth, a host can also send a `Content-Security-Policy: frame-ancestors` header; ForgeFrame does not set it.

### Sandbox

The `sandbox` component option sets the iframe's sandbox attribute:

| `sandbox` | Iframe attribute |
|---|---|
| Omitted | `allow-scripts allow-same-origin allow-forms allow-popups` |
| A string | Written as given. It must include `allow-scripts`, because the host runs script to call `initHost()`, and `allow-same-origin`, because without it the host has an opaque origin that no allowlist admits. Other tokens are left to the browser |
| `false` | No sandbox attribute |

```typescript
const Checkout = create({
  tag: 'checkout',
  url: 'https://pay.example.com/checkout',
  sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox',
});
```

`create()` throws for any other value, and for `attributes.sandbox` in any letter case; a computed `attributes` function that returns `sandbox` rejects `render()` before an iframe is created. Popups are never sandboxed, because `window.open()` cannot apply a sandbox; a component that sets `sandbox` renders popups without one and without a warning. The default combines `allow-scripts` and `allow-same-origin`, which lets a same-origin host remove its own sandbox, so it protects only against a cross-origin host.

## Pre-render Checks

The component `validate` option is the single gate before rendering. `render()` runs schema validation and then `validate({ props })` before it resolves the URL or creates an iframe or popup; throw to stop the render. `updateProps()` runs `validate` on the next props too.

```typescript
const FeatureComponent = create({
  tag: 'feature',
  url: 'https://widgets.example.com/feature',
  props: { userId: prop.string().optional() },
  validate: ({ props }) => {
    if (!props.userId) throw new Error('User must be logged in');
  },
});

await FeatureComponent({ userId: currentUser?.id }).render('#container');
```

## Nested Components

A host page renders child components the same way a consumer does: it imports the child's definition and calls it. The child page starts its own host and allows the parent host's origin.

> **`Parent host`**

```typescript
import { initHost } from 'forgeframe';
import { CardField } from './shared/card-field';
import { Checkout } from './shared/checkout';

const host = initHost(Checkout, { consumerOrigins: ['https://shop.example.com'] });
if (host) {
  await host.ready;
  await CardField({ onValid: () => {} }).render('#card-container');
}
```

> **`Child host page`**

```typescript
import { initHost } from 'forgeframe';
import { CardField } from './shared/card-field';

// The child's consumer is the parent host page.
const host = initHost(CardField, { consumerOrigins: ['https://checkout.example.com'] });
```

The child keeps its real types and schemas, and like any component it may use a function `url`.
