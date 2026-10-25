# ForgeFrame

[![npm version](https://img.shields.io/npm/v/forgeframe.svg)](https://www.npmjs.com/package/forgeframe)
[![GitHub Release](https://img.shields.io/github/v/release/jshsmth/ForgeFrame)](https://github.com/jshsmth/ForgeFrame/releases)

A TypeScript library for embedding cross-domain iframes and popups. The embedding page passes typed data and callbacks to a page on another origin, such as a payment form, sign-in widget, third-party integration, or micro-frontend. No runtime dependencies; ships as an ESM build.

## Used By

<a href="https://www.tyrohealth.com/">
  <img src="https://raw.githubusercontent.com/jshsmth/forgeframe/main/docs/assets/tyro-health-used-by.png" alt="Tyro Health" width="220">
</a>

## Terminology

Every integration has two sides:

- **Consumer**: the outer app. It renders the iframe or popup and passes props into it.
- **Host**: the inner app running in the iframe or popup. It starts with `initHost()` and reads those props from `await host.ready`.

For example, a payment provider lets merchants embed its checkout form:

| | Consumer | Host |
|--|----------|------|
| **Built by** | The merchant | The payment provider |
| **Origin** | `https://shop.example.com` | `https://pay.example.com` |
| **Role** | Embeds the checkout and handles `onSuccess` | Renders the checkout UI and calls `onSuccess` after payment |

```
┌─────────────────────────────────────────────────────────────────┐
│  Consumer (merchant site, shop.example.com)                     │
│                                                                 │
│  Checkout({ amount: 99, onSuccess: (payment) => {               │
│    // Fulfill the order                                         │
│  }}).render('#checkout-container');                             │
│                         │                                       │
│                         ▼                                       │
│      ┌──────────────────────────────────────────────┐           │
│      │  Host (payment form, pay.example.com)        │           │
│      │                                              │           │
│      │  const { amount, onSuccess, close }          │           │
│      │    = await host.ready;                       │           │
│      │                                              │           │
│      │  // The user enters card details and pays    │           │
│      │  onSuccess({ paymentId: 'xyz', amount });    │           │
│      │  close();                                    │           │
│      └──────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

| If you want to... | You build the... |
|-------------------|------------------|
| Embed another team's or company's component in your app | **Consumer** |
| Build a component or widget for others to embed | **Host** |
| Build both sides, such as your own micro-frontends | **Both** |

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Step-by-Step Guide](#step-by-step-guide)
  - [1. Define a Component](#1-define-a-component)
  - [2. Create the Host Page](#2-create-the-host-page)
  - [3. Render the Component](#3-render-the-component)
  - [4. Handle Events](#4-handle-events)
- [Props System](#props-system)
- [Host Window API (hostProps)](#host-window-api-hostprops)
- [Templates (Advanced)](#templates-advanced)
- [React Integration (Optional)](#react-integration-optional)
- [Advanced Features](#advanced-features)
- [Versioning](#versioning)
- [Migrating from v1 to v2](#migrating-from-v1-to-v2)
- [API Reference](#api-reference)
- [TypeScript](#typescript)
- [Browser Support](#browser-support)
- [Developing ForgeFrame](#developing-forgeframe)

---

## Installation

```bash
npm install forgeframe
```

---

## Quick Start

> **`Consumer`**

Define the component once, in a module that the consumer and the host both import.

```typescript
// payment-form.ts
import { create, prop } from 'forgeframe';

export const PaymentForm = create({
  tag: 'payment-form',
  url: 'https://pay.example.com/checkout',
  dimensions: { width: 400, height: 300 },
  props: {
    amount: prop.number(),
    onSuccess: prop.function<(txn: { transactionId: string }) => void>(),
  },
});
```

```typescript
import { PaymentForm } from './payment-form';

const payment = PaymentForm({
  amount: 99.99,
  onSuccess: (txn) => console.log('Payment complete:', txn),
});

await payment.render('#payment-container');
```

> **`Host`**

```typescript
import { initHost } from 'forgeframe';
import { PaymentForm } from './payment-form';

const host = initHost(PaymentForm, {
  consumerOrigins: ['https://shop.example.com'],
});

if (host) {
  const { amount, onSuccess, close } = await host.ready;

  document.getElementById('total')!.textContent = `$${amount}`;
  document.getElementById('pay-btn')!.onclick = async () => {
    await onSuccess({ transactionId: 'TXN_123' });
    await close();
  };
}
```

The host starts with `initHost(Component, { consumerOrigins })` and reads its props from `await host.ready`; see [Host Init with initHost](#host-init-with-inithost). `consumerOrigins` is required. List the consumer origins for payment, auth, or account flows, and pass `'*'` only for widgets that any site may embed. `initHost()` returns `null` when the page is not opened by ForgeFrame.

---

## Step-by-Step Guide

### 1. Define a Component

> **`Consumer`**

`create()` returns a reusable component factory. Export it so the host page can import the same definition.

```typescript
import { create, prop } from 'forgeframe';

type LoginProps = {
  email?: string;
  onLogin: (user: { id: number; name: string }) => void;
  onCancel?: () => void;
};

export const LoginForm = create<LoginProps>({
  tag: 'login-form',
  url: 'https://auth.example.com/login',
  dimensions: { width: 400, height: 350 },
  props: {
    email: prop.string().optional(),
    onLogin: prop.function<(user: { id: number; name: string }) => void>(),
    onCancel: prop.function().optional(),
  },
});
```

<details>
<summary>Explanation</summary>

- **`tag`** (required): unique identifier for the component.
- **`url`** (required): URL of the host page.
- **`dimensions`**: width and height of the iframe or popup. Iframes accept CSS units. Popups accept numbers, numeric strings, or `px` strings; any other unit falls back to 500 pixels when opening, or to the current size when resizing.
- **`props`**: schemas for the props passed to the host.

</details>

### 2. Create the Host Page

> **`Host`**

The host page is served at the component's `url`. It starts the host runtime with `initHost()` and reads its props from `host.ready`.

```typescript
import { initHost } from 'forgeframe';
import { LoginForm } from './login-form';

const host = initHost(LoginForm, {
  consumerOrigins: ['https://app.example.com'],
});

if (host) {
  const { email, onLogin, onCancel, close } = await host.ready;

  if (email) document.getElementById('email')!.value = email;

  document.getElementById('login-form')!.onsubmit = async (e) => {
    e.preventDefault();
    await onLogin({
      id: 1,
      name: 'John Doe',
    });
    await close();
  };

  document.getElementById('cancel')!.onclick = async () => {
    await onCancel?.();
    await close();
  };
}
```

<details>
<summary>Explanation</summary>

- **`initHost(LoginForm, { consumerOrigins })`**: starts the host runtime. It validates the incoming props with the component's schemas and infers their types, so the host needs no separate props interface. `consumerOrigins` lists the consumer origins that may embed this page; `'*'` allows any. It returns `null` when the page is not opened by ForgeFrame.
- **`await host.ready`**: resolves to the consumer's props plus the built-in methods. Read props only after it resolves.
- **`close()`**: closes the iframe or popup.
- Defining a component with `create()` never starts a host, so importing the shared definition has no side effects.

</details>

### 3. Render the Component

> **`Consumer`**

In the consumer app, create an instance with props and render it.

```typescript
const login = LoginForm({
  email: 'user@example.com',
  onLogin: (user) => console.log('User logged in:', user),
  onCancel: () => console.log('Login cancelled'),
});

await login.render('#login-container');
```

See [Instance Lifecycle](#instance-lifecycle) for URL resolution and for closing an instance during rendering.

### 4. Handle Events

> **`Consumer`**

Subscribe to lifecycle events through `instance.event`.

```typescript
const instance = LoginForm({ /* props */ });

instance.event.on('rendered', () => console.log('Login form is ready'));
instance.event.on('close', () => console.log('Login form closed'));
instance.event.on('error', (err) => console.error('Error:', err));
instance.event.on('resize', (dimensions) => console.log('New size:', dimensions));

await instance.render('#container');
```

Rendering emits `prerender`, `prerendered`, `render`, `rendered`, and `display`, in that order.

| Event | Emitted when |
|-------|--------------|
| `prerender` | The loading placeholder starts rendering |
| `prerendered` | The loading placeholder is in place |
| `render` | The iframe or popup starts opening |
| `rendered` | The host has loaded and initialized |
| `display` | The component is visible |
| `close` | The component starts closing |
| `destroy` | The component has been destroyed |
| `error` | An error occurs |
| `props` | Props are updated |
| `resize` | The component is resized |
| `focus` | The component receives focus |

Handlers run synchronously in registration order. A handler added during an emission first runs on the next emission, so a `once()` handler can rearm itself. A handler removed before its turn, individually or by bulk removal, is skipped; if it is re-registered during the same emission, it waits for the next one.

---

## Props System

Props are declared with the fluent `prop` schema builders. Every `prop` schema implements [Standard Schema](https://standardschema.dev/), and props also accept schemas from any Standard Schema library.

### Defining Props

```typescript
import { create, prop } from 'forgeframe';

const MyComponent = create({
  tag: 'my-component',
  url: 'https://widgets.example.com/component',
  props: {
    name: prop.string(),
    count: prop.number(),
    createdAt: prop.date(),
    enabled: prop.boolean(),
    config: prop.object(),
    items: prop.array(),
    position: prop.tuple(prop.number(), prop.number()),
    onSubmit: prop.function<(data: { email: string }) => void>(),
    nickname: prop.string().optional(),
    theme: prop.string().default('light'),
    email: prop.string().email(),
    age: prop.number().min(0).max(120),
    username: prop.string().min(3).max(20),
    slug: prop.string().pattern(/^[a-z0-9-]+$/),
    status: prop.enum(['pending', 'active', 'completed']),
    tags: prop.array().of(prop.string()),
    scores: prop.array().of(prop.number().min(0).max(100)),
    metadata: prop.record(prop.string()),
    themeId: prop.union(prop.string(), prop.number()),
    user: prop.object().shape({
      name: prop.string(),
      email: prop.string().email(),
      age: prop.number().optional(),
    }),
  },
});
```

<details>
<summary>Explanation</summary>

| Prop | Description |
|------|-------------|
| `name`, `count`, `enabled`, `config`, `items` | Basic types: string, number, boolean, object, array |
| `createdAt` | `prop.date()` validates real `Date` instances |
| `position` | `prop.tuple(...)` validates fixed positional arrays |
| `onSubmit` | Functions are bridged so the host can call them across origins |
| `nickname` | `.optional()` makes the prop accept `undefined` |
| `theme` | `.default('light')` provides a fallback value |
| `email` | `.email()` validates email format |
| `age` | `.min(0).max(120)` constrains the range |
| `username` | `.min(3).max(20)` constrains string length |
| `slug` | `.pattern(/.../)` validates against a regex |
| `status` | `prop.enum([...])` restricts to specific values |
| `tags` | `.of(prop.string())` validates each array item |
| `scores` | Array items can have their own validation chain |
| `metadata` | `prop.record(...)` validates dictionary values by key |
| `themeId` | `prop.union(...)` accepts any of several schemas |
| `user` | `.shape({...})` defines nested object structure |

</details>

### Prop Schema Methods

All schemas support these base methods:

| Method | Description |
|--------|-------------|
| `.optional()` | Makes the prop optional (accepts `undefined`) |
| `.nullable()` | Accepts `null` |
| `.default(value)` | Sets a non-callable default value, or a factory that returns the default |

A function prop's default must be a factory that returns the callback. ForgeFrame calls the factory when the input is omitted and validates its result; it never calls the returned callback while resolving the default.

A default replaces `undefined` input, so the output type of `.optional().default(x)` excludes `undefined` unless the default itself can be `undefined`.

```typescript
const onCancel = () => console.log('Cancelled');
const callbackSchema = prop.function<() => void>().default(() => onCancel);
```

### Callback Capacity

Each delivered props or exports snapshot can hold up to **500 distinct callbacks** per bridge; a callback used in several fields counts once. A larger snapshot is rejected, and callbacks already delivered stay callable. After the host acknowledges an update, callbacks missing from the new snapshot are retired.

During an update, the previous snapshot stays callable while new references are staged. If serialization fails, only the new registrations are removed. If delivery fails, the host may already have installed the new snapshot, so old and possibly delivered references both stay callable in a **1,000-reference recovery pool**. When that pool is full, new callbacks are rejected until an acknowledged retry that reuses retained callbacks, a new host session, or teardown frees capacity. A transport failure does not roll back the consumer's committed props.

Peer discovery uses a separate relay registry with a cumulative **500-reference** limit per requesting host session. Repeated discovery reuses retained identities and keeps peer snapshots the host already holds; a discovery that would exceed the limit is rejected as a whole. Reconnection clears old relay identities. When a peer replaces its exports, its original exported callbacks are retired.

### Schema Types

| Type | Factory | Methods |
|------|---------|---------|
| String | `prop.string()` | `.min()`, `.max()`, `.length()`, `.email()`, `.url()`, `.uuid()`, `.pattern()`, `.trim()`, `.nonempty()` |
| Finite number | `prop.number()` | `.min()`, `.max()`, `.int()`, `.positive()`, `.negative()`, `.nonnegative()` |
| Date | `prop.date()` | `.min()`, `.max()` |
| Boolean | `prop.boolean()` | - |
| Function | `prop.function<T>()` | - |
| Array | `prop.array()` | `.of(schema)`, `.min()`, `.max()`, `.nonempty()` |
| Tuple | `prop.tuple(...schemas)` | - |
| Object | `prop.object()` | `.shape({...})`, `.strict()` |
| Record | `prop.record(schema)` | - |
| Enum | `prop.enum([...])` | - |
| Literal | `prop.literal(value)` | - |
| Union | `prop.union(...schemas)` | - |
| Any | `prop.any()` | - |

Validation rules:

- Refinements accumulate: `prop.string().email().pattern(/@corp\.com$/)` requires both, and `.min(5).nonempty()` still requires 5 characters. Length checks run first, then URL syntax, then patterns; number integer checks run before bounds. The first failed rule is reported.
- `prop.number()` rejects `NaN`, `Infinity`, and `-Infinity`, which JSON would otherwise turn into `null`.
- `prop.string().url()` requires a parseable absolute HTTP(S) URL and returns the string unchanged. It composes with `.pattern()`; only `.trim()` changes the returned string.
- Shaped object schemas validate own fields only. An omitted field is `undefined`, so optional fields and defaults work for names such as `constructor` and `toString`, and inherited values are never treated as input.
- Enum values, object shapes, and the item and branch arrays passed to `prop.tuple()` and `prop.union()` are copied when the schema is created. Changing the original array or object later does not affect the schema or the clones made by `.optional()`, `.nullable()`, and `.default()`.
- `Date` props and exports accept dates created in another window, and record schemas accept plain objects from another window; class instances are rejected.
- Literal and enum errors describe the rejected input without calling its `toJSON()`, so a later `prop.union()` branch can still accept it.

#### Arrays in props and exports

Arrays delivered to the host, including nested arrays, must not contain `undefined` entries or sparse holes, because JSON would turn them into `null`. Use `null` with a nullable item schema, such as `prop.array().of(prop.string().nullable())`, or an item default, such as `prop.array().of(prop.string().default('fallback'))`. Standalone schema validation still accepts optional entries, and props withheld by `sendToHost`, `sameDomain`, or `trustedDomains` are not checked.

ForgeFrame reads each indexed entry directly, so arrays with a null prototype or an overridden `map` method deliver their actual entries. Normalized arrays are checked before the host opens or an update is committed, so a rejected update keeps the previous snapshot. Values produced by `hostDecorate` or a custom `toJSON()` (including a computed `toJSON` property) are checked during delivery, after commitment. A `toJSON` field that is not a function is ordinary data.

### Using Standard Schema Libraries

ForgeFrame accepts any [Standard Schema](https://standardschema.dev/) compliant library (Zod, Valibot, ArkType, etc.):

```typescript
import { create } from 'forgeframe';
import { z } from 'zod';
import * as v from 'valibot';

const MyComponent = create({
  tag: 'my-component',
  url: 'https://widgets.example.com/component',
  props: {
    email: z.string().email(),
    user: z.object({ name: z.string(), role: z.enum(['admin', 'user']) }),
    count: v.pipe(v.number(), v.minValue(0)),
  },
});
```

Validation is synchronous. If a schema's `~standard.validate` returns a promise, ForgeFrame throws an error naming the prop and handles the promise so its rejection is not reported as unhandled.

### Advanced Prop Definitions

Use the object form when a prop needs transport rules in addition to validation.

```typescript
import { create, prop } from 'forgeframe';

const SecureWidget = create({
  tag: 'secure-widget',
  url: 'https://widgets.example.com/secure',
  props: {
    secret: {
      schema: prop.string(),
      sameDomain: true,
    },
    auditId: {
      schema: prop.string(),
      queryParam: true,
    },
    internalState: {
      schema: prop.any(),
      sendToHost: false,
    },
  },
});
```

| Option | Description |
|--------|-------------|
| `sendToHost` | Skip sending the prop to the host when set to `false` |
| `sameDomain` | Only deliver the prop after the loaded host is verified to be same-origin. It is never in `window.name` or the initial query/POST request; a verified same-origin host receives it in the bootstrap snapshot and later updates |
| `trustedDomains` | Only send the prop to matching host domains |
| `queryParam` / `bodyParam` | Include the prop in the host page's initial HTTP request |
| `alias` | Accept an alternate input name, such as a legacy name. Aliases can chain through other defined props; at each level, an explicitly supplied canonical key wins. Only own input properties count as supplied |
| `outputSchema` | Validate the normalized value again at consumer and host trust boundaries without transforming it |

In a wrapped definition, `default` and `value` fallbacks are schema inputs: ForgeFrame validates and transforms them before any decorator, validator, URL, or transport callback sees the normalized value. A `.default()` set on the schema itself is already a schema output. A function `default` is called as a factory with the prop context, so wrap a callback default as `default: () => onCancel`; the types reject `default: onCancel`, as they do for `.default()`.

When an input schema changes the value's type, use the wrapped form with an `outputSchema`, even when `sendToHost` is `false`. The input schema parses consumer values and fallbacks; the output schema checks the normalized value before consumer routing callbacks or host trust boundaries use it. Output schemas only validate; they must not transform.

```typescript
import { z } from 'zod';

const AmountComponent = create({
  tag: 'amount-component',
  url: 'https://widgets.example.com/amount',
  props: {
    amount: {
      schema: z.string().transform(Number),
      outputSchema: z.number().finite(),
      default: '1',
    },
  },
});

AmountComponent({ amount: '2' }); // Host receives the validated number 2
```

Pass a schema directly when it accepts its own normalized output unchanged. A type-changing transform needs the wrapped form above, and so does a same-type transform that is not idempotent: without an `outputSchema`, the host rejects the changed value.

To type alias inputs separately from the canonical props the host receives:

```typescript
type WidgetProps = {
  email: string;
};

type LegacyWidgetInput = {
  userEmail: string;
};

type WidgetSchemaInputs = {
  email: string;
};

const Widget = create<
  WidgetProps,
  unknown,
  LegacyWidgetInput,
  WidgetSchemaInputs
>({
  tag: 'legacy-widget',
  url: 'https://widgets.example.com/legacy',
  props: {
    email: { schema: prop.string(), required: true, alias: 'userEmail' },
  },
});

Widget({ userEmail: 'user@example.com' });
Widget({ email: 'user@example.com' });
```

Factories, prop updates, and React wrappers accept either the canonical schema-input shape or the alternate input shape. When a transform changes a prop's type, normalized host props are not accepted as consumer input. The alternate input type can be a subset of the canonical props when a canonical key doubles as another prop's alias.

`required: true` requires a consumer input, not a defined normalized output. If a valid input can transform to `undefined`, its `outputSchema` must accept `undefined`, and the host then treats `undefined` as a valid result.

A `sendToHost: false` definition validates consumer input only. Hosts that share the definition discard the field from received bootstrap and update snapshots before decoding or validation, even if a stale consumer sends it. A required local prop does not block host initialization, and discarded values never reach `hostProps`, `hostProps.consumer.props`, or prop notifications. Origin restrictions still apply to delivered props.

Prefer inferred component and React-wrapper types. When you explicitly annotate an aliased component whose schema inputs differ from its host props, pass the canonical schema-input type as the fifth `ForgeFrameComponent` generic (after the required-props flag) or the fourth `ForgeFrameComponentInstance` generic. React wrappers infer it; with explicit wrapper type arguments, it is the sixth generic.

Transport notes:

- Use `sameDomain` for values that must never be exposed during cross-origin bootstrap.
- Props always cross as JSON through the function bridge. Callbacks at any depth arrive as remote functions and `Date` values arrive as `Date`s, at bootstrap, on every update, and in `hostProps.export(...)`.
- Ordinary objects that contain transport marker fields stay ordinary data.
- An object's `toJSON()` result is delivered instead of its fields, as native JSON does, so a class can hide fields such as tokens. A root `toJSON()` that returns `undefined` omits the prop. A `URL` arrives as its `href`, and boxed primitives such as `new String('ab')` arrive unboxed. A boxed primitive whose prototype was set to `null` is not unboxed: it is sent as an ordinary record of its own fields.
- Arrays are read entry by entry, and an array's `toJSON()` is not called.
- A `JSON.rawJSON()` value arrives as the value its text represents, as `JSON.stringify` writes it. Consumer schemas validate the raw value itself, so return it from a custom `toJSON()` or pass it under a schema that accepts it, such as `prop.any()`.

### Passing Props via URL or POST Body (Advanced)

Use these flags only when the host server needs values in its initial HTTP request:

```typescript
const Checkout = create({
  tag: 'checkout',
  url: 'https://payments.example.com/checkout',
  props: {
    checkoutId: { schema: prop.string(), queryParam: true }, // ?checkoutId=...
    requestNonce: { schema: prop.string(), bodyParam: true }, // POST body field
    userId: { schema: prop.string(), bodyParam: 'user_id' }, // custom body field name
  },
});
```

- `queryParam` appends the value to the query string before any `#fragment`, keeping existing parameters and the fragment.
- `bodyParam` sends the value in a hidden-form `POST` when the iframe or popup first loads. Later `updateProps()` calls use postMessage.
- POST field names such as `submit`, `remove`, and `appendChild` do not interfere with submission or cleanup.
- `Date` values are sent as ISO strings and other object values are JSON-stringified. Functions, `undefined`, `null`, and invalid dates are skipped.
- Iframe containers must be attached to the document when rendering, so a `bodyParam` POST always targets the rendered frame.
- `sendToHost`, `sameDomain`, and `trustedDomains` also apply to query and body parameters. Same-origin status is verified only after the host loads, so `sameDomain` props are never in the initial request.
- Never put credentials, bearer tokens, session identifiers, or sensitive personal data in `queryParam`. URLs leak through browser history, referrers, analytics, and server logs.

### Updating Props

`updateProps()` works before and after rendering. Updates run in order, including updates requested inside decorators or validators. Rendering waits for queued updates, so the initial query/body parameters and bootstrap props use their result; updates requested while rendering are rejected. Once `close()` starts, new and queued updates are rejected without running validation or prop callbacks.

```typescript
const instance = MyComponent({ name: 'Initial' });
await instance.render('#container');
await instance.updateProps({ name: 'Updated' });
```

The host receives updates through `onProps`, or through `host.on('props', handler)`, which also receives the bootstrap snapshot:

```typescript
const props = await host.ready;
props.onProps((newProps) => {
  console.log('Props updated:', newProps);
});
```

Subscribers run in registration order after props are committed. A subscriber added or re-registered during a notification waits for the next update, and a subscription cancelled before its turn is skipped. A stale cancellation handle cannot cancel a later registration of the same callback. Thrown errors and rejected promises are caught and logged. Async subscribers are not awaited, so they do not delay other subscribers or the update acknowledgement.

Built-in `hostProps` names are reserved. A consumer prop named `uid`, `tag`, `close`, `focus`, `resize`, `show`, `hide`, `onProps`, `onError`, `getConsumer`, `getConsumerDomain`, `export`, `consumer`, `getPeerInstances`, or `children` is available only in `hostProps.consumer.props`; it does not replace the built-in on `hostProps`.

### Cross-Window Callback Values

A callback implementation may return synchronously, but calling it from the other window always returns a promise. This applies to callbacks in `hostProps`, `hostProps.consumer.props`, `onProps` snapshots, and `instance.exports`. The exported `RemoteValue<T>` type describes this remote view, including callbacks nested in objects and arrays.

Declare every signature of a generic or overloaded callback with a `Promise` return type and use an async implementation. The automatic conversion of synchronous signatures cannot preserve overloads or the relationship between argument and result types.

```typescript
// Consumer definition: the local implementation can be synchronous.
const Counter = create({
  tag: 'counter',
  url: 'https://widgets.example.com/counter',
  props: { getCount: prop.function<() => number>() },
});
const counter = Counter({ getCount: () => 42 });
await counter.render('#container');

// Host: use await even though getCount's local implementation returns a number.
const props = await initHost(Counter, { consumerOrigins }).ready;
const count = await props.getCount();
```

Callback arguments and results are JSON-serialized. Pass plain objects, arrays, strings, finite numbers, booleans, and `null`; a callback may return `undefined` for no result. Convert `Date` values to ISO strings and copy plain fields out of `FormData` before the call. Functions in arguments or results are not bridged, and cyclic or `BigInt` results reject with a serialization error. Prop snapshots and `hostProps.export(...)` are different: they bridge functions and preserve `Date` values.

`RemoteValue<T>` types this contract for synchronous signatures: a `Date` result is typed as its ISO string, and a parameter that JSON would change, such as a `Date`, is typed `never`, so the call does not compile. Promise-returning signatures keep their declared types, so declare them with JSON-compatible arguments and results.

Remote calls have no timeout. A call waits until the callback in the other window settles, so a slow step such as a payment confirmation is never reported as failed while it is still running. The call rejects only with the callback's own error, or when the connection ends: the instance closes, the host is destroyed, or the host document reconnects. After the host is destroyed, calls to its exports reject until a host initializes again in that window. While a call is pending, ForgeFrame checks every 10 seconds that the other window still answers, so a call into a page that navigated away or closed without teardown rejects within about 20 seconds. To bound a wait, race the call with your own timer, and remember that the callback may still finish in the other window.

## Host Window API (hostProps)

In a host window, the object that `await host.ready` resolves to holds the consumer's props and the host control methods. `host.hostProps` is the same live object. Its types are inferred from the component passed to `initHost`; see [Typing Host hostProps](#typing-host-hostprops).

Props come from another origin. Render received strings with `textContent` or other DOM text properties, never by interpolating them into HTML.

In iframe mode, ForgeFrame sets `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` unless the consumer component sets `attributes.sandbox` (in any letter case, such as `Sandbox`), which is used as-is. A `false` value writes no attribute, so the default still applies.

### Host Init with initHost

`initHost()` is the only way to start the host runtime. It reads channel metadata from `window.name`, checks the consumer origin against `consumerOrigins`, requests the initial props through origin-checked messaging, and validates them. It has two forms:

- `initHost(Component, { consumerOrigins, autoInit? })` takes the component returned by `create()`. It validates props with the component's schemas, infers their types, and throws if the window was opened for another component's tag.
- `initHost({ props?, consumerOrigins, autoInit? })` accepts a window opened for any tag, for hosts that serve many components. `props` are host prop definitions; without them, delivered props are not validated. With shared prop definitions, this form also keeps `create()` and the consumer runtime out of a size-sensitive host bundle.

`consumerOrigins` is required. It takes a string, a `RegExp`, or an array of them (see [Domain Security](#domain-security)). `'*'` allows any consumer origin, and an empty array allows none. A disallowed consumer makes `initHost()` throw before any props are requested.

`initHost()` returns a `Host` object:

| Member | Description |
|--------|-------------|
| `ready` | Resolves to the host props once the consumer's verified bootstrap has passed validation |
| `hostProps` | The same live object. It holds only the built-in controls until `ready` resolves, and later updates are applied to it |
| `init()` | Sends INIT when `autoInit` is `false`; see [Deferring INIT](#deferring-init) |
| `destroy()` | Tears down the host and tells the consumer the session ended |
| `on('props' \| 'error', handler)` | Observes committed consumer props (the bootstrap snapshot, then every update) or host errors; returns an unsubscribe function |

`initHost()` returns `null` without browser globals, outside a ForgeFrame window, for malformed channel metadata, or when the page has no parent or opener to talk to, so the page can also render standalone. Arguments are checked first, in every environment: a missing `consumerOrigins`, an unknown option, a v1 call shape such as `initHost(definitions, origins)`, or a bare `initHost()` throws, even on a standalone page or the server. In a window opened by a consumer on another ForgeFrame major version, `initHost()` throws an error that names the consumer's version and sends that consumer nothing; upgrade consumer and host together. A window that only keeps such a name, with no parent or opener left, gets `null`.

Only one host can be active in a window. A second `initHost()` call throws while a host is starting or running. Call `host.destroy()` before starting again; a later `initHost()` creates a fresh runtime from the retained channel metadata. A start whose `ready` rejects releases the host before your rejection handler runs, so the handler can call `initHost()` again.

`create()` never starts a host, even in a window opened for its tag.

`isHost()` reports whether this window carries ForgeFrame channel metadata. It stays `true` for malformed metadata, where `initHost()` returns `null`, and after `destroy()`, because the metadata is kept for reconnection.

Only channel metadata stays in `window.name`, so reloads and later host documents can reconnect and receive the latest props. Browser policies that clear window names across sites can prevent reconnection.

If the host's schemas reject the consumer's props, `ready` rejects and the host tells the consumer why. The consumer keeps waiting, so a same-page `initHost()` retry can still connect without any error being reported; if none succeeds, `render()` rejects at its `timeout`, and its single `error` event and `onError` call include `Host initialization failed: ...`.

`host.destroy()` can be called more than once. Controls on the old `hostProps` reject afterwards, and destroying a stale host never affects a newer one.

#### Deferring INIT

By default the host sends INIT as soon as `ready` resolves, which resolves the consumer's `render()`. To prepare the frame first, for example to hide or resize it, pass `autoInit: false` and call `host.init()` when ready:

```typescript
const host = initHost(LoginForm, { consumerOrigins, autoInit: false });
if (host) {
  const props = await host.ready;
  await props.hide();
  host.init();
}
```

`init()` returns nothing and is safe to call twice, before `ready` resolves (INIT then waits for it), or after `destroy()`. It sends nothing if `ready` rejects. INIT delivery failures are reported through `host.on('error')`. If the host never calls `init()`, the consumer's `render()` rejects at its `timeout`. Reading `hostProps` never sends INIT.

When a tag-agnostic host uses a type-changing schema, pass both the normalized host props and the schema-input shapes to `HostPropsDefinition` and `initHost`, so TypeScript requires the normalized `outputSchema`:

```typescript
type AmountProps = { amount: number };
type AmountInputs = { amount: string };

const amountProps = {
  amount: {
    schema: z.string().transform(Number),
    outputSchema: z.number(),
    required: true,
  },
} satisfies HostPropsDefinition<AmountProps, AmountInputs>;

const host = initHost<AmountProps, AmountInputs>({
  props: amountProps,
  consumerOrigins,
});
```

### Available Methods

```typescript
const props = await host.ready;

props.email;
await props.onLogin(user);
props.uid;
props.tag;

await props.close();
await props.focus();
await props.resize({ width: 500, height: 400 });
await props.show();
await props.hide();

const { cancel } = props.onProps((newProps) => { /* handle updates */ });
await props.onError(new Error('Something failed'));
await props.export({ validate: () => true });

props.getConsumer();
props.getConsumerDomain();
props.consumer.props;
await props.consumer.export(data);

const peers = await props.getPeerInstances();
cancel();
```

Peers are other instances rendered by the same consumer whose hosts it verified at the requesting host's origin; `anyConsumer: true` adds other component tags at that origin. To let hosts on other origins, such as sibling subdomains, discover a component's instances, list those origins in its `peerDomains` option. Hosts with an opaque origin, such as sandboxed frames without `allow-same-origin`, neither discover peers nor are listed as peers, even when `peerDomains` match. A peer whose host is still loading is listed without exports; call `getPeerInstances()` again once it is ready. Peer exports keep data, `Date` values, and nested methods; methods return promises and are relayed through the consumer. Method references survive unrelated prop updates. After a peer replaces its exports or reconnects, its old methods reject, so call `getPeerInstances()` again. Discovery counts toward the relay limit in [Callback Capacity](#callback-capacity).

<details>
<summary>Method Reference</summary>

| Method | Description |
|--------|-------------|
| `email`, `onLogin` | Your custom props and callbacks |
| `uid`, `tag` | Built-in identifiers |
| `close()` | Close the component |
| `focus()` | Request focus for iframe/popup; resolves once this window has focus, or after a short wait, so the host can then focus its own element. It resolves without waiting when the consumer page has no focus to pass on |
| `resize()` | Resize the component |
| `show()`, `hide()` | Toggle visibility |
| `onProps()` | Listen for prop updates (returns `{ cancel() }`) |
| `onError()` | Report errors to consumer |
| `export()` | Export methods/data to consumer |
| `getConsumer()` | Get consumer window reference |
| `getConsumerDomain()` | Get consumer origin |
| `consumer.props` | Access consumer's props |
| `consumer.export()` | Send data to consumer from host context |
| `getPeerInstances()` | Get peer component instances from the same consumer and host origin |
| `children` | Nested component factories provided by consumer (if configured) |

</details>

### Exporting Data to Consumer

The host can export data and methods for the consumer to call.

> **`Host`**

```typescript
await host.hostProps.export({
  validate: () => document.getElementById('form').checkValidity(),
  getFormData: () => ({ email: document.getElementById('email').value }),
});
```

> **`Consumer`**

```typescript
const instance = MyComponent({ /* props */ });
await instance.render('#container');

const isValid = await instance.exports.validate();
const data = await instance.exports.getFormData();
```

---

## Templates (Advanced)

### Container Template

`containerTemplate` builds the element that wraps the iframe, such as a modal overlay.

```typescript
const ModalComponent = create({
  tag: 'modal',
  url: 'https://widgets.example.com/modal',
  dimensions: { width: 500, height: 400 },

  containerTemplate: ({ doc, frame, prerenderFrame, close }) => {
    const overlay = doc.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '1000',
    });
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    const modal = doc.createElement('div');
    Object.assign(modal.style, { background: 'white', borderRadius: '8px', overflow: 'hidden' });

    const closeBtn = doc.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.onclick = () => close();
    modal.appendChild(closeBtn);

    const body = doc.createElement('div');
    if (prerenderFrame) body.appendChild(prerenderFrame);
    if (frame) body.appendChild(frame);
    modal.appendChild(body);

    overlay.appendChild(modal);
    return overlay;
  },
});
```

### Prerender Template

`prerenderTemplate` builds the placeholder shown while the host loads.

```typescript
const toCssSize = (value?: string | number) =>
  typeof value === 'number' ? `${value}px` : (value ?? '');

const MyComponent = create({
  tag: 'my-component',
  url: 'https://widgets.example.com/component',

  prerenderTemplate: ({ doc, dimensions }) => {
    const loader = doc.createElement('div');
    Object.assign(loader.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: toCssSize(dimensions.width),
      height: toCssSize(dimensions.height),
      background: '#f5f5f5',
    });
    loader.textContent = 'Loading...';
    return loader;
  },
});
```

---

## React Integration (Optional)

### Basic Usage

```tsx
import React, { useState } from 'react';
import { create, prop, createReactComponent } from 'forgeframe';

const LoginComponent = create({
  tag: 'login',
  url: 'https://auth.example.com/login',
  dimensions: { width: 400, height: 350 },
  props: {
    email: prop.string().optional(),
    onLogin: prop.function<(user: { id: number; name: string }) => void>(),
  },
});

const Login = createReactComponent(LoginComponent, { React });

function App() {
  const [user, setUser] = useState<{ id: number; name: string } | null>(null);

  return (
    <div>
      <h1>My App</h1>
      <Login
        email="user@example.com"
        onLogin={(loggedInUser) => setUser(loggedInUser)}
        onRendered={() => console.log('Ready')}
        onError={(err) => console.error(err)}
        onClose={() => console.log('Closed')}
        className="login-frame"
        style={{ border: '1px solid #ccc' }}
      />
    </div>
  );
}
```

### React Props

The React component accepts your component props alongside these wrapper props:

| Prop | Type | Description |
|------|------|-------------|
| `onRendered` | `() => void` | Called when component is ready |
| `onError` | `(err: Error) => void` | Called on error |
| `onClose` | `() => void` | Called when closed |
| `context` | `'iframe' \| 'popup'` | Render mode |
| `className` | `string` | Container CSS class |
| `style` | `CSSProperties` | Container inline styles |
| `ref` | `React.Ref<HTMLDivElement>` | Access the wrapper's container element. It is attached during React's commit, so a parent's `useLayoutEffect` can read it, and React 19 callback-ref cleanups run on unmount |

The adapter reserves these names and does not forward them as component props. Give a callback the host must receive a different name, such as `onHostClose`, and do not make a reserved name a required custom prop.

Construction and render failures go to `onError` and are shown inside the wrapper; sibling React content is unaffected, and the container ref stays attached. To recover, change `context` (which creates a fresh instance) or change the wrapper's React `key` to remount it.

### Factory Pattern

To wrap several components with the same React instance, use `withReactComponent`:

```tsx
import { withReactComponent } from 'forgeframe';

const createComponent = withReactComponent(React);

const LoginReact = createComponent(LoginComponent);
const PaymentReact = createComponent(PaymentComponent);
const ProfileReact = createComponent(ProfileComponent);
```

---

## Advanced Features

### Popup Windows

Pass `'popup'` to `render()`, or set `defaultContext: 'popup'` on the component.

```typescript
await instance.render('#container', 'popup');

const PopupComponent = create({
  tag: 'popup-component',
  url: 'https://widgets.example.com/popup',
  defaultContext: 'popup',
});
```

After the popup initializes, ForgeFrame removes the loading content, including custom prerender content, and the default loading wrapper from the consumer mount. Caller-owned elements and custom container-template shells stay.

Browsers do not let one origin resize another origin's window. For a popup that is not open, `instance.resize()` does nothing. For a cross-origin popup, `instance.resize()` rejects without emitting `resize`; call `hostProps.resize()` from the host instead, which resizes the popup's own window and then notifies the consumer. Browsers can still ignore resize requests, for example for a popup opened as a tab.

### Domain Security

- `domain` is consumer-side trust: the host origins the consumer will render and message.
- `consumerOrigins`, passed to `initHost()`, is host-side trust: the consumer origins that may embed and initialize the host.
- Use both for payment, auth, account, and other sensitive workflows.

Both accept a string, a `RegExp`, or an array mixing them. Strings support `*` wildcards, such as `'https://*.example.com'`, and `'*'` alone matches any origin. Empty or blank strings, `null`, and other values throw, so a missing setting such as `process.env.CONSUMER_ORIGIN || ''` cannot silently trust every origin. An empty array is valid and admits no origin. `peerDomains` follows the same rules.

```typescript
// secure-component.ts, shared by the consumer and the host
export const SecureComponent = create({
  tag: 'secure',
  url: 'https://secure.example.com/widget',
  props: {
    accountId: prop.string(),
    onComplete: prop.function<(result: { ok: true }) => void>(),
  },
  domain: 'https://secure.example.com',
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
```

The host verifies the consumer by requiring a response from the expected parent or opener window at its exact origin. Verification works with `Referrer-Policy: no-referrer` and after full-page host navigation. If the origin is not allowed, `initHost()` throws before any props are requested; if the consumer cannot complete the handshake, `ready` rejects. The allowlist belongs to the host that enforces it, so `create()` throws if it still receives the removed `allowedConsumerDomains` option.

### Eligibility Checks

`eligible` decides whether an instance may render.

```typescript
const FeatureComponent = create({
  tag: 'feature',
  url: 'https://widgets.example.com/feature',
  props: { userId: prop.string().optional() },
  eligible: ({ props }) => {
    if (!props.userId) return { eligible: false, reason: 'User must be logged in' };
    return { eligible: true };
  },
});

const instance = FeatureComponent({ userId: currentUser?.id });
if (instance.isEligible()) {
  await instance.render('#container');
}
```

### Nested Components

`children` exposes component factories that the host can render from inside the iframe or popup.

> **`Consumer`**

```typescript
const ContainerComponent = create({
  tag: 'container',
  url: 'https://widgets.example.com/container',
  children: () => ({
    CardField: CardFieldComponent,
    CVVField: CVVFieldComponent,
  }),
});
```

> **`Host`**

```typescript
// Import or define the same child factories before calling initHost().
// Their schemas remain executable code and are never JSON-serialized.
import { initHost } from 'forgeframe';
import { CardFieldComponent, CVVFieldComponent } from './child-components';
import { ContainerComponent } from './container-component';

const host = initHost(ContainerComponent, { consumerOrigins });
if (host) {
  const { children } = await host.ready;
  children.CardField({ onValid: () => {} }).render('#card-container');
}
```

A child window's consumer is the host page that renders it, so the child page's own `initHost()` must allow that host page's origin in `consumerOrigins`. Register every child tag in the host bundle before `initHost()`. The host takes validators, defaults, decorators, and regular expressions from its own registered factories; only child metadata arrives, through the verified bootstrap response. Child URLs must be static strings. Child names are used verbatim, including `__proto__`.

---

## Versioning

ForgeFrame 1.x follows semantic versioning for its public API. Read the [GitHub release notes](https://github.com/jshsmth/ForgeFrame/releases) before upgrading, and upgrade consumer and host bundles together when a release changes wire behavior.

- **From 1.x to 2.x:** upgrade the consumer and host together; a v2 host refuses consumers on ForgeFrame 0.x or 1.x. See [Migrating from v1 to v2](#migrating-from-v1-to-v2).
- **From 1.0.4:** review these behavior changes. Remote callbacks no longer time out after 10 seconds; add your own timer where you need one. `instance.resize()` rejects for a cross-origin popup; resize it from the host with `hostProps.resize()`. JSON props and exports deliver a value's `toJSON()` result. Schema refinements such as `.email().pattern()` now all apply. Empty or blank `domain`, `allowedConsumerDomains`, and `peerDomains` strings throw. Query and body parameters send dates as ISO strings and skip `null`. Iframe renders require an attached container. The factory's `isHost()` and `hostProps` no longer start a host, and defining a component logs host startup errors instead of throwing them. Hosts with an opaque origin are no longer listed as peers. `attributes.sandbox: false` now keeps the default iframe sandbox instead of removing it. Event `once()` registrations follow DOM listener rules: `off()` cancels them, and registering a handler twice keeps one registration.
- **From 1.0.1:** function prop defaults must use the factory form. Replace `.default(onCancel)` with `.default(() => onCancel)`; the types reject the direct form. Exceeding [callback capacity](#callback-capacity) rejects with an explicit error instead of silently breaking older callbacks.

---

## Migrating from v1 to v2

### Upgrade consumer and host together

**Upgrade consumer and host together.** ForgeFrame 2 uses bootstrap protocol 3. A v2 host accepts only v2 consumers. When a page embedded by a ForgeFrame 0.x or 1.x consumer calls `initHost()`, it throws an error that names the consumer's version and tells you to upgrade both. A 1.x host cannot start for a v2 consumer, so the v2 consumer reports its handshake timeout. The v1 staged upgrade ("deploy hosts first") no longer works. Deploy consumer and host together, or serve the v2 host at a new URL and point the v2 consumer at it while 1.x consumers keep using the old URL. `window.name` now holds only channel metadata (uid, tag, protocol, context and consumer origin). v1 never stored application data there either, so nothing needs converting.

### Host start-up and props

A host now starts only through `initHost()`, which requires a consumer allowlist, and reads its props only from `await host.ready`.

**Positional `initHost(propDefinitions, allowedConsumerDomains)`.** Before:

```typescript
await initHost(paymentProps, ['https://shop.example.com'])?.ready;
const { amount, onSuccess } = window.hostProps;
```

After:

```typescript
const host = initHost(PaymentForm, { consumerOrigins: ['https://shop.example.com'] });
if (!host) renderStandalone();
else {
  const { amount, onSuccess } = await host.ready;
}
// or, without a shared component:
// initHost({ props: paymentProps, consumerOrigins: ['https://shop.example.com'] })
```

**A bare `initHost()`, or a host started by `create()`.** Before:

```typescript
const PaymentForm = create({ ..., allowedConsumerDomains: ['https://shop.example.com'] });
await initHost()?.ready;
```

After: `create()` no longer starts or configures a host, and it throws if it receives `allowedConsumerDomains`.

```typescript
const PaymentForm = create({ ... });
const host = initHost(PaymentForm, { consumerOrigins: ['https://shop.example.com'] });
```

**Open widgets that omitted the allowlist.** Before: `initHost(definitions)`. After: `initHost(Component, { consumerOrigins: '*' })`.

**Reading props.** Before: `window.hostProps.amount`, `getHostProps()`, `Component.hostProps` or `host.getProps()`. After: `(await host.ready).amount`, or `host.hostProps.amount` once `ready` has resolved.

**`Window` augmentation.** Before:

```typescript
declare global { interface Window { hostProps: HostProps<P> } }
```

After: delete it. Types are inferred from `initHost(Component, ...)`, and `HostProps<P>` remains for helper parameters.

**The `hostProps` setter.** Before: `host.hostProps = replacement`. After: removed; `hostProps` is a read-only, live object.

**Deferred INIT.** Before:

```typescript
const host = initHost(definitions, origins, { deferInit: true });
await host.ready;
await host.hostProps.hide();
host.flushInit(); // or the first read of window.hostProps
```

After:

```typescript
const host = initHost(Component, { consumerOrigins, autoInit: false });
const props = await host.ready;
await props.hide();
host.init();
```

**Reconfiguring with a second `initHost()`.** Before: the second call replaced the schema or allowlist. After: it throws while a host is active. Pass the final definitions to the single call; to restart, call `host.destroy()` and then `initHost(...)`.

**Host internals.** Before: `host.event.on('props', fn)`, `host.getInitError()`, `host.flushInit()`. After: `host.on('props', fn)` and `host.on('error', fn)`, which return an unsubscribe function, and `host.init()`.

**Host detection.** Before: `isEmbedded()`, `Component.isHost()`, `Component.isEmbedded()`. After: `isHost()`.

**`canRenderTo`.** Before: `await Component.canRenderTo(win)`. After: removed; it always returned `win === window`.

### Named exports only

Before:

```typescript
import ForgeFrame from 'forgeframe';
ForgeFrame.create(...);
```

After:

```typescript
import { create } from 'forgeframe';
create(...);
// or: import * as ForgeFrame from 'forgeframe'
```

---

## API Reference

### Exports

ForgeFrame 2 has named exports only. Use `import * as ForgeFrame from 'forgeframe'` if you prefer a namespace.

```typescript
import {
  create,               // Create a component
  destroy,              // Destroy an instance
  destroyByTag,         // Destroy all instances of a tag
  destroyAll,           // Destroy all instances
  initHost,             // Start the host runtime; await host.ready before reading props
  isHost,               // Whether this window carries ForgeFrame channel metadata
  isStandardSchema,     // Check if value is a Standard Schema
  prop,                 // Prop schema builders
  CONTEXT,              // Context constants (IFRAME, POPUP)
  EVENT,                // Event name constants
  PopupOpenError,       // Popup blocker/open failures
  VERSION,              // Library version
  createReactComponent, // React adapter
  withReactComponent,   // React adapter factory
} from 'forgeframe';
```

### Component Options

Each `props` entry is either a Standard Schema or a full `PropDefinition` object with transport, alias, and lifecycle options. An entry set to `undefined` is treated as omitted, so built-in defaults and delivery rules apply.

```typescript
interface ComponentOptions<P, I = P, SchemaInputs = I> {
  tag: string;
  url: string | ((props: P) => string);
  dimensions?: { width?: number | string; height?: number | string } | ((props: P) => { width?: number | string; height?: number | string });
  props?: PropsDefinition<P, SchemaInputs>;
  defaultContext?: 'iframe' | 'popup';
  containerTemplate?: (ctx: TemplateContext<P>) => HTMLElement | null;
  prerenderTemplate?: (ctx: TemplateContext<P>) => HTMLElement | null;
  domain?: DomainMatcher;      // Consumer-side trusted host origins
  peerDomains?: DomainMatcher; // Other host origins that may discover these instances as peers
  eligible?: (opts: { props: P }) => { eligible: boolean; reason?: string };
  validate?: (opts: { props: P }) => void;
  attributes?: IframeAttributes | ((props: P) => IframeAttributes);
  style?: IframeStyles | ((props: P) => IframeStyles);
  timeout?: number;
  children?: (opts: { props: P }) => Record<string, ForgeFrameComponentReference>;
}
```

### Instance Methods

```typescript
const instance = MyComponent(props);

await instance.render(container, context?)   // Render into a container (container is required)
await instance.renderTo(window, container)   // Supports only current window; throws for other windows
await instance.close()                       // Close and destroy
await instance.focus()                       // Focus
await instance.resize({ width, height })     // Resize
await instance.show()                        // Show
await instance.hide()                        // Hide
await instance.updateProps(newProps)         // Update props (normalized + validated)
instance.clone()                             // Clone with same props
instance.isEligible()                        // Check eligibility

instance.uid                                 // Unique ID
instance.event                               // Event emitter
instance.state                               // Mutable state
instance.exports                             // Host exports
```

### Instance Lifecycle

- **URL resolution.** Relative component URLs resolve against `document.baseURI`, including any `<base href>`. `render()` validates and pins the absolute URL before loading callbacks run and uses it for navigation and prop delivery checks, so changing the document base during a callback cannot redirect the initial request.
- **Closing during render.** Calling `close()` while `render()` is in flight cancels the render, removes its loading and host elements, and stops any iframe or popup that has not opened yet. The render promise rejects with `Component "<tag>" was closed before rendering completed`.
- **Repeated close.** Repeated or reentrant `close()` calls wait for the same operation, including deregistration and destruction notifications; close events and cleanup run once. If a failed render already started destruction, `close()` waits for that teardown without emitting another close event.

### Iframe Styles and Loading

Numeric `style` values become pixels, except for unitless CSS properties, which stay numbers; custom property names are case-sensitive. While the host loads, ForgeFrame conceals the iframe; lazy iframes stay in layout so they can load. After initialization it restores configured `display`, `visibility`, `opacity`, and `transition` styles without its default fade overriding them. `show()` and `hide()` calls take precedence over configured visibility.

---

## TypeScript

ForgeFrame is written in TypeScript and exports all types.

```typescript
import {
  create,
  initHost,
  prop,
  PropSchema,
  StringSchema,
  NumberSchema,
  BooleanSchema,
  FunctionSchema,
  ArraySchema,
  ObjectSchema,
  createReactComponent,
  withReactComponent,
  type ComponentOptions,
  type ForgeFrameComponent,
  type ForgeFrameComponentInstance,
  type Host,
  type HostProps,
  type InitHostOptions,
  type StandardSchemaV1,
  type TemplateContext,
  type Dimensions,
  type EventHandler,
  type GetPeerInstancesOptions,
} from 'forgeframe';
```

### Typing Host hostProps

`initHost(Component, ...)` infers the host props from the component, so the host needs no `Window` augmentation or separate interface. Annotate helpers that receive the props with `HostProps<P>`.

```typescript
import { initHost, type HostProps } from 'forgeframe';
import { MyComponent, type MyProps } from './my-component';

function submit(props: HostProps<MyProps>) {
  return props.onSubmit({ email: 'user@example.com' });
}

const host = initHost(MyComponent, { consumerOrigins: ['https://app.example.com'] });
if (host) {
  const props = await host.ready; // HostProps<MyProps>
  props.name;
  props.close;
  props.resize;
  await submit(props);
}
```

`host.hostProps` is read-only and keeps its identity, so references you keep see later updates.

---

## Browser Support

ForgeFrame ships ES2022 output. Use modern evergreen browsers or transpile the package for older targets in your consumer build pipeline.

**Note:** Internet Explorer is not supported. If you require IE-era compatibility, use [Zoid](https://github.com/krakenjs/zoid).

---

## Developing ForgeFrame

Repository tooling needs Node.js 22.23.4 or later 22.x, 24.22.1 or later 24.x, or 26.12.1 and newer. These minimums include the October 2026 Node.js security fixes and satisfy jsdom 30. Use Node.js 24 locally; CI also tests on Node.js 22 and 26. Run commands from the repository root:

```bash
npm ci
npm run dev
```

The playground serves the consumer at `https://localhost:5173` and the host at `https://localhost:5174`. Both import the library source, so no library build is needed. HTTPS uses `vite-plugin-mkcert`, which may ask you to trust its local certificate authority on first run.

To run over HTTP without certificates:

```bash
FORGEFRAME_SKIP_MKCERT=1 VITE_HOST_URL=http://localhost:5174/ FORGEFRAME_PLAYGROUND_OPEN=0 npm run dev
```

Then open `http://localhost:5173`. The `/tests` page runs browser scenarios for iframe and popup handshakes, prop updates, callbacks, and lifecycle behavior. `npm run dev:consumer` and `npm run dev:host` start the two servers separately; set `VITE_HOST_URL` when the host runs at another address.

The **Company demo** button opens `/company`, a fictional Pip Veterinary invoice portal that takes payment through the fictional Harbor Pay provider on the host's `/payment.html`. Pick one of three AUD invoices and pay in a modal iframe or a popup with the prepared demo card details. The outcome selector approves immediately or declines the first attempt and approves the retry. Closing the payment window leaves the invoice unpaid; a successful payment returns a receipt and marks only that invoice paid. **Reset demo** or a page refresh restores the sample invoices. All payment processing and company and customer data are simulated; there is no backend.

**Experience** shows the clinic's payment journey. **Technical** keeps the same app running and adds its origins, live props, lifecycle events, and callback arguments and acknowledgements. Its source tabs show the consumer, host, shared contract, merchant acceptance rules, and provider simulation, with TSDoc on ownership, initialization, cancellation, and callback return values. The host waits for the consumer's `onResult` acknowledgement before closing.

For a custom deployment, set `VITE_HOST_URL` in the consumer build and `VITE_CONSUMER_URL` in the host build; the payment host allowlists that consumer origin. By default it allows the local consumer on port 5173 with the host page's protocol. Consumer builds generate a static `/company/index.html`; host builds include `/payment.html`.

### Architecture and Ownership

The [architecture guide](https://github.com/jshsmth/ForgeFrame/blob/main/docs/architecture.md) covers state ownership and the render/bootstrap, props, callback, and React flows. The [callable reference](https://github.com/jshsmth/ForgeFrame/blob/main/docs/iosp-review.md) classifies runtime responsibilities and links their boundary tests.

- `packages/forgeframe/src/index.ts` defines the public exports. Other source barrels are internal; the package has no subpath exports.
- `core/component.ts` owns component factories and instance tracking. `core/consumer.ts` coordinates rendering, the prop pipeline, and transport; `core/host/` owns host bootstrap and `hostProps`.
- `communication/` owns request/response messaging and callback bridging. Transports hold their peer window and validate browser-provided sources and origins.
- `props/` owns schemas, normalization, and serialization. Schema input and normalized output are separate contracts: trust boundaries revalidate normalized props without reapplying transforms.
- `render/` owns iframe and popup resources and templates; `drivers/` holds the optional React adapter. `packages/playground/` exercises the library as consumer and host.

### Project Wiki

Contributor knowledge lives in the [development wiki](https://github.com/jshsmth/ForgeFrame/blob/main/docs/_index.md), managed with [Plasma Wiki](https://docs.plasma.ai/wiki/guide/index.html). The CLI generates page metadata and index navigation, and a GitHub Actions check fails on stale indexes or wiki lint issues.

Install Python 3.11 or newer and the pinned CLI with `uv tool install plasma-wiki==1.8.0` (or `pipx install plasma-wiki==1.8.0`). Browse with `wiki map --path docs`, search with `wiki search --path docs "callback"`, and read a page with `wiki read architecture --path docs`. The pages are plain Markdown and can also be read directly.

Edit page bodies and authored metadata such as `title` and `desc`. The CLI owns `name`, timestamps, headings, and the index link blocks above `***`; put index prose below that line. After adding, moving, or editing pages, run `npm run docs:update`, then `npm run docs:check` before committing. Image assets are excluded from indexing. No Obsidian vault, plugins, or wiki hooks are needed.

The wiki CLI is a contributor tool, separate from the npm package and its release checks. The Documentation workflow installs the same pinned version and runs the checks without modifying files.

### Checks

Development uses TypeScript 7 and Biome with default formatting and recommended lint rules. `npm ci` installs the pinned tools, and npm scripts run the local `tsc` and `biome`. Biome skips generated builds, coverage, and the npm lockfile, and does not format Markdown, YAML, or TOML.

In VS Code, use the Biome extension (`biomejs.biome`) and the TypeScript 7 language service (`TypeScriptTeam.native-preview`); in other editors, use their Biome and TypeScript 7 LSP integrations. Consumers of the package do not need TypeScript 7.

Tests and playground bindings use explicit value guards, so a missing fixture or element fails instead of silently skipping an assertion or action. Intentional React effect signatures, prototype-safety fixtures, and CSS precedence overrides have local Biome suppressions with explanations.

| Command | What it checks |
|---------|----------------|
| `npm run lint` | Biome lint, formatting, and import checks across source and supported configuration files |
| `npm run lint:fix` | Apply Biome formatting, import organization, and safe lint fixes |
| `npm run format` / `npm run format:check` | Write / check Biome formatting |
| `npm run check:ci` | Non-writing Biome checks for CI |
| `npm run docs:check` | Pinned Plasma Wiki version, generated-index freshness, and wiki lint |
| `npm run docs:update` | Regenerate wiki metadata and indexes after documentation edits |
| `npm run typecheck` | Library source, compile-time API contracts, and playground types |
| `npm run test:run` | Unit and integration tests in jsdom, plus Node-specific suites |
| `npm run test:coverage` | The same tests with coverage thresholds enforced |
| `npm run test:browser` | Cross-origin iframe and popup regressions in Chromium, Firefox, and WebKit |
| `npm run build && npm run typecheck:package` | ESM output and emitted declarations under NodeNext resolution |
| `npm run size` | Minified and gzipped size of the built bundle against its budgets in `packages/forgeframe/scripts/check-bundle-size.mjs`; run after `npm run build` |
| `npm run build:playground` | Consumer and host production builds |
| `npm run test:package` | Pack and install the built library in an isolated project; verify ESM imports and NodeNext consumer types |
| `npm run release:check` | Lint, types, tests once with coverage, builds, bundle size, dependency audit, package dry run, and installed-package checks; does not publish |

See the [test index](https://github.com/jshsmth/ForgeFrame/blob/main/packages/forgeframe/tests/README.md) for suite selection and single-file commands. jsdom tests do not replace browser testing of cross-origin navigation, popup blockers, or visual behavior. `npm audit` needs registry access; if the audit service fails, the release check is incomplete even when the local checks pass.

Install browser engines with `npx playwright install chromium firefox webkit` before running `npm run test:browser`. CI installs their system dependencies and runs all three engines on Node 24. A release needs both the local checks and hosted CI to pass. WebKit covers the Safari engine, not physical Safari or devices.

Edit documentation in the root `README.md`. The library build copies it to `packages/forgeframe/README.md` for npm; commit the refreshed copy and do not edit it directly. TypeScript generates the declarations under `dist/`, and `scripts/fix-dts-imports.mjs` adjusts them for NodeNext consumers; do not edit them by hand.

### Release Workflow

Version preparation and publication are separate. The Release workflow publishes from CI through [npm trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token is stored and the package gets a provenance attestation.

1. Run `npm run version:patch`, `version:minor`, or `version:major` to update workspace metadata and the lockfile only. For an explicit version, use `npm version 1.0.2 -w forgeframe --no-git-tag-version`. These commands do not commit, tag, publish, or push.
2. Run `npm run release:check` and `npm run test:browser`, review the changes, and commit the intended release source and metadata. Verify hosted CI for that commit before releasing.
3. Create the matching Git tag, such as `v1.0.2`, on that commit. Keep the working tree clean so the published files match the tagged source.
4. Push the release commit and its specific tag explicitly. The Release workflow checks that the tag matches the package version, runs the browser suite in all three engines, and publishes with `npm publish -w forgeframe --provenance`, whose `prepublishOnly` runs `npm run release:check` first. It then creates the GitHub release notes. Manual workflow runs must select the matching tag.

Trusted publishing needs a one-time setup on npmjs.com: in the `forgeframe` package settings, add a trusted publisher for this GitHub repository with the workflow file `release.yml`. `npm run release` still publishes from a local machine with the same checks, but that copy has no provenance.

There are no `release:patch`, `release:minor`, or `release:major` scripts, because workspace versioning does not create commits or tags. `npm run release:check` verifies locally without publishing or pushing.

---

## License

MIT
