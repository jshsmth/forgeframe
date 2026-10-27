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
│      │  const { amount, onSuccess }                 │           │
│      │    = await host.ready;                       │           │
│      │                                              │           │
│      │  // The user enters card details and pays    │           │
│      │  onSuccess({ paymentId: 'xyz', amount });    │           │
│      │  host.close();                               │           │
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
- [Host Window API](#host-window-api)
- [Templates (Advanced)](#templates-advanced)
- [React Integration (Optional)](#react-integration-optional)
- [Advanced Features](#advanced-features)
- [Errors](#errors)
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
  const { amount, onSuccess } = await host.ready;

  document.getElementById('total')!.textContent = `$${amount}`;
  document.getElementById('pay-btn')!.onclick = async () => {
    await onSuccess({ transactionId: 'TXN_123' });
    await host.close();
  };
}
```

The host starts with `initHost(Component, { consumerOrigins })`, reads its props from `await host.ready`, and calls controls such as `close()` on the `host` handle; see [Host Init with initHost](#host-init-with-inithost). `consumerOrigins` is required. List the consumer origins for payment, auth, or account flows, and pass `'*'` only for widgets that any site may embed. `initHost()` returns `null` when the page is not opened by ForgeFrame.

---

## Step-by-Step Guide

### 1. Define a Component

> **`Consumer`**

`create()` returns a reusable component factory. Export it so the host page can import the same definition.

```typescript
// login-form.ts
import { create, prop, type PropsOf } from 'forgeframe';

export const LoginForm = create({
  tag: 'login-form',
  url: 'https://auth.example.com/login',
  dimensions: { width: 400, height: 350 },
  props: {
    email: prop.string().optional(),
    onLogin: prop.function<(user: { id: number; name: string }) => void>(),
    onCancel: prop.function<() => void>().optional(),
  },
  exports: prop.object({
    reset: prop.function<() => void>(),
  }),
});

export type LoginProps = PropsOf<typeof LoginForm>;
```

<details>
<summary>Explanation</summary>

- **`tag`** (required): unique identifier for the component.
- **`url`** (required): URL of the host page.
- **`dimensions`**: width and height of the iframe or popup. Iframes accept CSS units. Popups accept numbers, numeric strings, or `px` strings; any other unit falls back to 500 pixels when opening, or to the current size when resizing.
- **`props`**: schemas for the props passed to the host. TypeScript infers the props from them: `onLogin` is required, so `LoginForm()` without props does not compile.
- **`exports`**: a schema for what the host passes to `host.export()`. It types `instance.exports`, and the consumer rejects exports that do not match.
- **`PropsOf<typeof LoginForm>`**: reads the props type back from the component; see [TypeScript](#typescript).

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
  const { email, onLogin, onCancel } = await host.ready;

  if (email) (document.getElementById('email') as HTMLInputElement).value = email;

  document.getElementById('login-form')!.onsubmit = async (e) => {
    e.preventDefault();
    await onLogin({
      id: 1,
      name: 'John Doe',
    });
    await host.close();
  };

  document.getElementById('cancel')!.onclick = async () => {
    await onCancel?.();
    await host.close();
  };
}
```

<details>
<summary>Explanation</summary>

- **`initHost(LoginForm, { consumerOrigins })`**: starts the host runtime. It validates the incoming props with the component's schemas and infers their types, so the host needs no separate props interface. `consumerOrigins` lists the consumer origins that may embed this page; `'*'` allows any. It returns `null` when the page is not opened by ForgeFrame.
- **`await host.ready`**: resolves to the consumer's props, and only those. Read props only after it resolves.
- **`host.close()`**: closes the iframe or popup. Every host control lives on the `host` handle, so a prop may use any name except `then` and `children`.
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

Subscribe to lifecycle events through `instance.event`. `on()` and `once()` return an unsubscribe function, and each handler receives a typed payload.

```typescript
const instance = LoginForm({ /* props */ });

instance.event.on('rendered', () => console.log('Login form is ready'));
instance.event.on('close', () => console.log('Login form closing'));
const stop = instance.event.on('error', (err) => console.error('Error:', err.message));
instance.event.on('exports', (exports) => console.log('Host exports:', exports));

await instance.render('#container');
stop();
```

A render emits `render`, then `rendered`. A close emits `close`, then `closed`.

| Event | Payload | Emitted when |
|-------|---------|--------------|
| `render` | none | Rendering starts, after props are validated and the container is resolved, before any iframe, popup, or placeholder exists. Calling `close()` here stops the render |
| `rendered` | none | The host initialized and the component is visible. `render()` has already resolved, so a listener may call `close()` |
| `close` | none | Closing starts, from `close()`, the host's `close()`, or the user closing the popup |
| `closed` | none | Teardown finished. Always the last event; it also follows a failed render, without `close`, except a `POPUP_BLOCKED` one, which leaves the instance open |
| `error` | `Error` | The handshake timed out (`INIT_TIMEOUT`), an export failed the `exports` schema (`VALIDATION`), or the host called `host.reportError()` (a plain `Error` with the host's message). Failures ForgeFrame detects are [`ForgeFrameError`](#errors)s |
| `props` | props | A props update was committed and, when a host is connected, acknowledged |
| `resize` | `Dimensions` | A resize from the consumer or the host was applied |
| `focus` | none | A focus request was applied to a mounted iframe or an open popup |
| `exports` | exports | The host called `host.export()`; `instance.exports` already holds the value |

Only ForgeFrame emits these events: `instance.event` has no `emit`, `off`, or `removeAllListeners`. Subscribing to any other name throws, and the removed v1 names (`prerender`, `prerendered`, `display`, `destroy`) name their replacement. After `closed`, ForgeFrame removes every listener; later subscriptions are accepted and never called.

Handlers run synchronously in registration order, and a handler registered twice keeps its first registration. A handler added during an emission first runs on the next emission, so a `once()` handler can rearm itself. A handler removed before its turn is skipped; if it is re-registered during the same emission, it waits for the next one. An unsubscribe function removes only the registration it created. Thrown errors and rejected promises are caught and logged.

To use exports as soon as they arrive:

```typescript
const exports = instance.exports ?? (await new Promise((resolve) => instance.event.once('exports', resolve)));
```

Declared props are never called by ForgeFrame, so a prop named `onClose` or `onError` is an ordinary callback for the host to call.

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
    config: prop.object({ locale: prop.string() }),
    items: prop.array(prop.string()),
    position: prop.tuple(prop.number(), prop.number()),
    onSubmit: prop.function<(data: { email: string }) => void>(),
    nickname: prop.string().optional(),
    theme: prop.string().default('light'),
    email: prop.string().email(),
    age: prop.number().min(0).max(120),
    username: prop.string().min(3).max(20),
    slug: prop.string().pattern(/^[a-z0-9-]+$/),
    status: prop.enum(['pending', 'active', 'completed']),
    tags: prop.array(prop.string()),
    scores: prop.array(prop.number().min(0).max(100)),
    metadata: prop.record(prop.string()),
    themeId: prop.union(prop.string(), prop.number()),
    user: prop.object({
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
| `name`, `count`, `enabled`, `config`, `items` | Basic types: string, number, boolean, object, array. Objects take their shape and arrays their item schema |
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
| `tags` | `prop.array(prop.string())` validates each array item |
| `scores` | Array items can have their own validation chain |
| `metadata` | `prop.record(...)` validates dictionary values by key |
| `themeId` | `prop.union(...)` accepts any of several schemas |
| `user` | `prop.object({...})` defines nested object structure |

A prop is required exactly when its schema rejects `undefined`: `name` is required, `nickname` is optional, and `theme` falls back to `'light'`. The same rule applies to the object form below and on the host, and a missing value always fails with the schema's message, such as `Validation failed: name: Required`.

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
| Array | `prop.array(itemSchema)` | `.min()`, `.max()`, `.nonempty()` |
| Tuple | `prop.tuple(...schemas)` | - |
| Object | `prop.object({...})` | `.strict()` |
| Record | `prop.record(schema)` | - |
| Enum | `prop.enum([...])` | - |
| Literal | `prop.literal(value)` | - |
| Union | `prop.union(...schemas)` | - |
| Any | `prop.any<T>()` | - |

Validation rules:

- Refinements accumulate: `prop.string().email().pattern(/@corp\.com$/)` requires both, and `.min(5).nonempty()` still requires 5 characters. Length checks run first, then URL syntax, then patterns; number integer checks run before bounds. The first failed rule is reported.
- `prop.number()` rejects `NaN`, `Infinity`, and `-Infinity`, which JSON would otherwise turn into `null`.
- `prop.string().url()` requires a parseable absolute HTTP(S) URL and returns the string unchanged. It composes with `.pattern()`; only `.trim()` changes the returned string.
- `prop.object(shape)` and `prop.array(item)` require their shape or item schema. For a value you deliberately do not check, use `prop.any<T>()`; the type parameter only types the value, and it accepts any defined value at runtime.
- Object schemas validate own fields only. An omitted field is `undefined`, so optional fields and defaults work for names such as `constructor` and `toString`, and inherited values are never treated as input.
- Enum values, object shapes, and the item and branch arrays passed to `prop.tuple()` and `prop.union()` are copied when the schema is created. Changing the original array or object later does not affect the schema or the clones made by `.optional()`, `.nullable()`, and `.default()`.
- `Date` props and exports accept dates created in another window, and record schemas accept plain objects from another window; class instances are rejected.
- Literal and enum errors describe the rejected input without calling its `toJSON()`, so a later `prop.union()` branch can still accept it.

#### Arrays in props and exports

Arrays delivered to the host, including nested arrays, must not contain `undefined` entries or sparse holes, because JSON would turn them into `null`. Use `null` with a nullable item schema, such as `prop.array(prop.string().nullable())`, or an item default, such as `prop.array(prop.string().default('fallback'))`. Standalone schema validation still accepts optional entries, and props withheld by `sendToHost` or `deliverTo` are not checked.

ForgeFrame reads each indexed entry directly, so arrays with a null prototype or an overridden `map` method deliver their actual entries. Normalized arrays are checked before the host opens or an update is committed, so a rejected update keeps the previous snapshot. Values produced by a custom `toJSON()` (including a computed `toJSON` property) are checked during delivery, after commitment. A `toJSON` field that is not a function is ordinary data.

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

Use the object form when a prop needs transport rules in addition to validation. The schema still decides whether the prop is required and what its default is; the other fields only control how the value reaches the host.

```typescript
import { create, prop } from 'forgeframe';

const SecureWidget = create({
  tag: 'secure-widget',
  url: 'https://widgets.example.com/secure',
  props: {
    secret: {
      schema: prop.string(),
      deliverTo: 'same-origin',
    },
    partnerToken: {
      schema: prop.string(),
      deliverTo: ['https://pay.example.com', /^https:\/\/[a-z]+\.partner\.example$/],
    },
    auditId: {
      schema: prop.string().optional(),
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
| `schema` | Required. Validates the prop, decides whether it is required, and supplies its default |
| `sendToHost` | Skip sending the prop to the host when set to `false`. Must be a boolean |
| `deliverTo` | Restrict which hosts receive the prop. `'same-origin'` delivers only after the loaded host is verified to share the consumer's origin, so the value is never in `window.name` or the initial query/POST request. An [origin matcher](#origin-security) delivers only to matching host origins; `create()` rejects an empty array, an empty or blank origin, and `'same-origin'` mixed into an array |
| `queryParam` / `bodyParam` | Include the prop in the host page's initial HTTP request: `true` uses the prop key, a string names the parameter, and `false` is the same as omitting it. Two props cannot share a parameter name, and neither option combines with `deliverTo: 'same-origin'` |

A wrapped definition accepts only these fields, so a misspelled option such as `deliverto` fails to compile and `create()` rejects it, instead of silently delivering the prop to every host.

`auditId` above is optional only because its schema is `.optional()`. Without it, `{ schema: prop.string(), queryParam: true }` is required, exactly like `prop.string()`.

Transforms and refinements belong in the schema, such as `prop.string().trim()` or a Zod `.refine()`, and cross-prop rules belong in the component's `validate({ props })` option. To compute a value from other inputs, compute it before calling the factory or `updateProps()`.

Each prop has one schema, and that schema must accept its own output unchanged. ForgeFrame runs it on the value you pass, then validates the normalized value again with the same schema at the consumer's trust boundaries and on the host, and rejects a value that comes back changed. Idempotent transforms such as `prop.string().trim()`, coercions such as `z.coerce.number()`, refinements and defaults all qualify, in the direct and the wrapped form, and for `sendToHost: false` props too. A transform that changes the type (string to number, string to `Date`), or that changes an already-normalized value again (such as dollars to cents), does not: `create()` reports it at compile time when props are inferred, and `render()` or `updateProps()` rejects it at runtime. To keep a convenient call site:

- Pass the type the host should receive: `z.number()`, and convert before calling the factory or `updateProps()`.
- Accept both forms in one schema: `z.coerce.number()`, or `z.union([z.iso.datetime(), z.date()]).transform((value) => new Date(value))`, whose `Date` output is valid input.
- Keep the raw type and convert it in the host after reading the prop.

```typescript
import { z } from 'zod';

const AmountComponent = create({
  tag: 'amount-component',
  url: 'https://widgets.example.com/amount',
  props: {
    amount: z.coerce.number().finite().default(1),
  },
});

AmountComponent({ amount: '2' }); // Host receives the number 2
AmountComponent(); // Host receives the default, 1
```

`prop.*` defaults that are arrays, plain objects or `Date`s are copied for every use, so instances never share them. Other schema libraries may return the same default object to every instance; pass a factory such as `z.array(z.string()).default(() => [])` when a default is mutated.

A host evaluates `sendToHost` and `deliverTo` itself, with its own origin and the verified consumer origin, to decide which props it expects. Props it is not meant to receive are neither required nor accepted: a cross-origin host can share definitions that include a required `'same-origin'` secret, and fields for those props, or for `sendToHost: false` props, are discarded from bootstrap and update snapshots before decoding or validation, even if a stale or misconfigured consumer sends them. Discarded values never reach `await host.ready` or prop notifications. The same applies to fields the host does not declare at all, including entries set to `undefined`, so no unvalidated value enters host state. Only a tag-agnostic `initHost({ consumerOrigins })` host without `props` keeps every field, unvalidated.

Component and React-wrapper types are inferred from the schemas. The factory input can be wider than the host props, because defaults make keys optional and coercions accept more types; read it with `InputOf<typeof C>` and the props with `PropsOf<typeof C>` (see [TypeScript](#typescript)). Definition types such as `PropsDefinition<P>` are typed by the props alone, so a defaulted schema fits without an input type.

Transport notes:

- Use `deliverTo: 'same-origin'` for values that must never be exposed during cross-origin bootstrap.
- Props always cross as JSON through the function bridge. Callbacks at any depth arrive as remote functions and `Date` values arrive as `Date`s, at bootstrap, on every update, and in `host.export(...)`. A value JSON cannot encode, such as a `BigInt` or a cycle, rejects with a `VALIDATION` error; for a `BigInt` its `cause` is the encoder's `TypeError`. In the first render's props, `render()` rejects with that error as soon as the host asks for its props, instead of waiting for `initTimeout`. An error your own `toJSON()` throws reaches you unchanged.
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
- `Date` values are sent as ISO strings and other object values are JSON-stringified. Functions, `undefined`, `null`, and invalid dates are skipped. To send a custom encoding, pass the encoded string as its own prop, or build the URL in a `url(props)` function with a `hostOrigins` allowlist.
- Iframe containers must be attached to the document when rendering, so a `bodyParam` POST always targets the rendered frame.
- `sendToHost` and `deliverTo` also apply to query and body parameters, matched against the pinned host URL's origin. Same-origin status is verified only after the host loads, so `deliverTo: 'same-origin'` props are never in the initial request.
- Never put credentials, bearer tokens, session identifiers, or sensitive personal data in `queryParam`. URLs leak through browser history, referrers, analytics, and server logs.

### Updating Props

`updateProps()` works before, during and after rendering. Each update runs one sequence: merge the patch, run the schemas (which apply their defaults), check that each schema accepts its own output unchanged, run the component's `validate`, check the URL and origin, commit, deliver to the host, then notify. It resolves once the update is committed and, when a host is connected, acknowledged.

A patch is shallow, and `undefined` means "not supplied", the same as in the factory input:

| Patch entry for prop `x` | Consumer and host see |
|---|---|
| `x` left out | `x` unchanged |
| a value, including `null` | that value |
| `undefined`, schema has a default | the default, evaluated again (a callback default too) |
| `undefined`, optional without a default | no value: the host has no `x` key in its props or the `onProps` payload |
| `undefined`, required | the update rejects with the schema's message, and nothing changes |

In TypeScript, `updateProps()` takes a `PropsPatch`: it accepts declared props only, and `undefined` only for optional and defaulted props, so resetting a required prop with an object literal or a precisely typed patch is a compile-time error, as it is in the factory input. A patch typed `Partial<Input>` still compiles and meets the runtime rejection above, as JavaScript callers do. Generic code that forwards a patch for a generic `I` types it as `PropsPatch<I, Partial<I>>`; a plain `Partial<I>` parameter no longer compiles there.

Updates run in call order across the whole lifecycle, including updates requested from a schema transform, the component's `validate`, a `url` function or a lifecycle listener:

- **Before `render()`:** `render()` waits for them, so the initial query/body parameters and bootstrap props use their result.
- **While `render()` is pending:** they wait for the render to settle. The host starts with the snapshot the render began with, then receives each update as its own `onProps` notification, and each update's `props` event fires after `rendered`. An invalid update rejects on its own; the render and later updates continue. If the render fails before anything opened, the updates apply locally and the next `render()` includes them. That covers invalid props or options, a component `validate` rejection, a URL that is invalid or outside `hostOrigins`, and a missing or detached container. A blocked popup also leaves the instance open, so the updates apply locally and a fallback `render(container, 'iframe')` includes them. If it fails after that, or `close()` cancels it, they reject with a `CLOSED` [`ForgeFrameError`](#errors) whose `cause` is the render's own failure, so you can tell them apart from a later close.
- **After `close()` starts:** new and queued updates reject with `CLOSED`, without running validation or prop callbacks.

Do not `await` an update inside code the render waits on, such as a consumer callback the host calls before it sends INIT. The update waits behind the render, so the render stalls until `initTimeout` rejects it with `INIT_TIMEOUT`. Start the update without awaiting it, or await it after `render()` resolves.

```typescript
const instance = MyComponent({ name: 'Initial', theme: 'dark' });
const rendering = instance.render('#container');
const updating = instance.updateProps({ name: 'Updated' }); // the host starts with 'Initial', then receives 'Updated'
await Promise.all([rendering, updating]);
await instance.updateProps({ theme: undefined }); // back to the schema default
```

The host receives updates through `onProps`, which returns an unsubscribe function. A subscriber registered before `ready` resolves also receives the bootstrap snapshot:

```typescript
const stop = host.onProps((newProps) => {
  console.log('Props updated:', newProps);
});
stop();
```

`newProps` has the same shape as `await host.ready`: the consumer's props, without controls. The object `ready` resolved to is updated in place as well.

Subscribers run in registration order after props are committed. A subscriber added or re-registered during a notification waits for the next update, and a subscription cancelled before its turn is skipped. A stale cancellation handle cannot cancel a later registration of the same callback. Thrown errors and rejected promises are caught and logged. Async subscribers are not awaited, so they do not delay other subscribers or the update acknowledgement.

Two prop names are reserved, and `create()` and `initHost()` reject them (a definition with either name also fails to compile): `then`, because a props object with a `then` function would make `await host.ready` treat it as a promise and never settle, and `children`, so React JSX children never reach a host. A host without `props` drops fields with these names. Every other name is free, including `close` or `resize`, because host controls live on the `host` handle.

### Cross-Window Callback Values

A callback implementation may return synchronously, but calling it from the other window always returns a promise. This applies to callbacks in `await host.ready`, `onProps` snapshots, and `instance.exports`. The exported `RemoteValue<T>` type describes this remote view, including callbacks nested in objects and arrays.

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
const host = initHost(Counter, { consumerOrigins });
if (host) {
  const props = await host.ready;
  const count = await props.getCount();
}
```

Callback arguments and results are JSON-serialized. Pass plain objects, arrays, strings, finite numbers, booleans, and `null`; a callback may return `undefined` for no result. Convert `Date` values to ISO strings and copy plain fields out of `FormData` before the call. Functions in arguments or results are not bridged, and cyclic or `BigInt` results reject with a serialization error. Prop snapshots and `host.export(...)` are different: they bridge functions and preserve `Date` values.

`RemoteValue<T>` types this contract for synchronous signatures: a `Date` result is typed as its ISO string, and a parameter that JSON would change, such as a `Date`, is typed `never`, so the call does not compile. Promise-returning signatures keep their declared types, so declare them with JSON-compatible arguments and results.

Remote calls have no timeout. A call waits until the callback in the other window settles, so a slow step such as a payment confirmation is never reported as failed while it is still running. The call rejects only with the callback's own error, or when the connection ends: the instance closes, the host is destroyed, or the host document reconnects. After the host is destroyed, calls to its exports reject until a host initializes again in that window. While a call is pending, ForgeFrame checks every 10 seconds that the other window still answers, so a call into a page that navigated away or closed without teardown rejects within about 20 seconds. To bound a wait, race the call with your own timer, and remember that the callback may still finish in the other window.

## Host Window API

In a host window, `initHost()` returns a `host` handle with the host controls, and `await host.ready` resolves to the consumer's props alone. Both are typed from the component passed to `initHost`; see [Typing the host](#typing-the-host).

Props come from another origin. Render received strings with `textContent` or other DOM text properties, never by interpolating them into HTML.

In iframe mode, ForgeFrame sets `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` unless the consumer component sets the `sandbox` option. A string is written as-is and must include `allow-scripts` and `allow-same-origin`; `sandbox: false` writes no sandbox attribute. `attributes` may not set `sandbox` in any letter case. Popups are never sandboxed, because `window.open()` cannot apply one. See [Sandbox](#sandbox).

### Host Init with initHost

`initHost()` is the only way to start the host runtime. It reads channel metadata from `window.name`, checks the consumer origin against `consumerOrigins`, requests the initial props through origin-checked messaging, and validates them. It has two forms:

- `initHost(Component, { consumerOrigins, autoInit? })` takes the component returned by `create()`. It validates props with the component's schemas, infers their types, and throws if the window was opened for another component's tag.
- `initHost({ props?, consumerOrigins, autoInit? })` accepts a window opened for any tag, for hosts that serve many components. `props` are host prop definitions, and the host receives only the props they declare; without them, every delivered field is kept, unvalidated. With shared prop definitions, this form also keeps `create()` and the consumer runtime out of a size-sensitive host bundle.

`consumerOrigins` is required in both forms; omitting it throws in every environment, before `initHost()` looks for a consumer, so a host page cannot ship open by accident. It takes a string, a `RegExp`, or an array of them (see [Origin Security](#origin-security)). Pass `'*'` only for a host that any site may embed. An empty array allows none, so configuration that resolves to no origins fails closed. A disallowed consumer makes `initHost()` throw before any props are requested.

`initHost()` returns a frozen `Host` handle:

| Member | Description |
|--------|-------------|
| `ready` | Resolves to the consumer's props once its verified bootstrap has passed validation. The object keeps its identity, and later updates are applied to it |
| `uid`, `tag` | This instance's identifiers |
| `consumerOrigin` | The consumer origin, checked against `consumerOrigins` before any props are requested and verified by the bootstrap once `ready` resolves |
| `close()`, `focus()`, `resize()`, `show()`, `hide()` | Host controls; see [Available Methods](#available-methods). They work before `ready` resolves |
| `export()`, `reportError()`, `getPeerInstances()` | Talk back to the consumer |
| `onProps(handler)` | Observes prop updates; returns an unsubscribe function |
| `init()` | Sends INIT when `autoInit` is `false`; see [Deferring INIT](#deferring-init) |
| `destroy()` | Tears down the host and tells the consumer the session ended |
| `on('error', handler)`, `once('error', handler)` | Observes host errors; returns an unsubscribe function |

`initHost()` returns `null` without browser globals, outside a ForgeFrame window, for malformed channel metadata, or when the page has no parent or opener to talk to, so the page can also render standalone. Arguments are checked first, in every environment: a missing `consumerOrigins`, an unknown option, a v1 call shape such as `initHost(definitions, origins)`, or a bare `initHost()` throws, even on a standalone page or the server. In a window opened by a consumer on another ForgeFrame major version, `initHost()` throws a `VERSION_MISMATCH` error that names the consumer's version and sends that consumer nothing; upgrade consumer and host together. A window that only keeps such a name, with no parent or opener left, gets `null`.

Only one host can be active in a window. A second `initHost()` call throws while a host is starting or running. Call `host.destroy()` before starting again; a later `initHost()` creates a fresh runtime from the retained channel metadata. A start whose `ready` rejects releases the host before your rejection handler runs, so the handler can call `initHost()` again.

`create()` never starts a host, even in a window opened for its tag.

`isHost()` returns `true` when a host runtime is active in this window, or when `window.name` holds a decodable ForgeFrame payload of any protocol version. A payload from an older or newer ForgeFrame counts, so the page reaches `initHost()` and its upgrade error instead of rendering standalone. It returns `false` outside a browser and for a name that has the ForgeFrame prefix but no valid payload, where `initHost()` returns `null`. It stays `true` after `destroy()`, because the channel metadata is kept for a re-start.

Only channel metadata stays in `window.name`, so reloads and later host documents can reconnect and receive the latest props. Browser policies that clear window names across sites can prevent reconnection.

`host.on('error')` reports each failed start once, always with a [`ForgeFrameError`](#errors). A schema rejection reports its `VALIDATION` error. Any other failure, such as a failed BOOTSTRAP request or an invalid bootstrap response, reports an error whose message starts with `Failed to initialize host component:`, whose `cause` is the original failure, and whose code is the cause's, as INIT delivery failures do. A BOOTSTRAP or INIT request the consumer never answers is `INIT_TIMEOUT`. For a schema rejection, `host.ready` rejects with the same error; for a prefixed start-up error, it rejects with that error's `cause`, which has the same code. It rejects with `CLOSED` when the host is destroyed before bootstrap completes. When the consumer cannot send its first-render props, such as a `BigInt`, BOOTSTRAP fails and `host.ready` rejects with the consumer's `VALIDATION` error. INIT is sent after `ready` resolves, so a failed INIT reaches only the `error` event.

If the host's schemas reject the consumer's props, `ready` rejects and the host tells the consumer why. The consumer keeps waiting, so a same-page `initHost()` retry can still connect without any error being reported; if none succeeds, `render()` rejects at its `initTimeout` with `INIT_TIMEOUT`, whose message includes `Host initialization failed: ...` and whose `cause` is the host's error with its code, such as `VALIDATION`. The consumer's single `error` event carries the same error.

`host.destroy()` can be called more than once. The old handle's controls reject afterwards, and destroying a stale host never affects a newer one.

#### Deferring INIT

By default the host sends INIT as soon as `ready` resolves, which resolves the consumer's `render()`. To prepare the frame first, for example to hide or resize it, pass `autoInit: false` and call `host.init()` when ready:

```typescript
const host = initHost(LoginForm, { consumerOrigins, autoInit: false });
if (host) {
  await host.ready;
  await host.hide();
  host.init();
}
```

`init()` returns nothing and is safe to call twice, before `ready` resolves (INIT then waits for it), or after `destroy()`. It sends nothing if `ready` rejects. INIT delivery failures are reported through `host.on('error')`. If the host never calls `init()`, the consumer's `render()` rejects at its `initTimeout` with `INIT_TIMEOUT`. Reading props never sends INIT.

A tag-agnostic host types its props from its definitions, keyed by the props it receives:

```typescript
const amountProps = {
  amount: z.number().finite().default(1),
} satisfies PropsDefinition<{ amount: number }>;

const host = initHost({ props: amountProps, consumerOrigins });
```

### Available Methods

```typescript
import { initHost } from 'forgeframe';
import { LoginForm } from './login-form';

const host = initHost(LoginForm, { consumerOrigins: ['https://app.example.com'] });
if (host) {
  const props = await host.ready;

  props.email;
  await props.onLogin({ id: 1, name: 'Ada' });

  host.uid;
  host.tag;
  host.consumerOrigin;

  await host.close();
  await host.focus();
  await host.resize({ width: 500, height: 400 });
  await host.show();
  await host.hide();

  const stop = host.onProps((newProps) => { /* handle updates */ });
  await host.reportError(new Error('Something failed'));
  await host.export({ reset: () => undefined });

  const peers = await host.getPeerInstances();
  stop();
}
```

Peer discovery is opt-in. A component that sets `peers: 'same-origin'` in `create()` lets its hosts discover peers and is listed to other hosts verified at the same origin as its own host. Without `peers`, its instances are never listed, and its hosts' `getPeerInstances()` rejects with an error naming the component and the option. Peers are other instances rendered by the same consumer; `allTags: true` adds other component tags, still only those that set `peers`. To let hosts on other origins, such as sibling subdomains, discover a component's instances, set `peers` to an origin matcher instead of `'same-origin'`. Admission is one-way: the matcher on the listed component decides who may see it. Hosts with an opaque origin, such as sandboxed frames without `allow-same-origin`, neither discover peers nor are listed as peers, even when a matcher matches. `getPeerInstances()` resolves to `PeerInfo[]`, each with `uid`, `tag`, and `exports`. A peer whose host is still loading is listed without exports; call `getPeerInstances()` again once it is ready. Peer exports keep data, `Date` values, and nested methods; methods return promises and are relayed through the consumer. Method references survive unrelated prop updates. After a peer replaces its exports or reconnects, its old methods reject, so call `getPeerInstances()` again. Discovery counts toward the relay limit in [Callback Capacity](#callback-capacity).

<details>
<summary>Method Reference</summary>

| Member | Description |
|--------|-------------|
| `props.email`, `props.onLogin` | Your custom props and callbacks, from `await host.ready` |
| `uid`, `tag` | This instance's identifiers |
| `close()` | Close the component |
| `focus()` | Request focus for iframe/popup; resolves once this window has focus, or after a short wait, so the host can then focus its own element. It resolves without waiting when the consumer page has no focus to pass on |
| `resize()` | Resize the component |
| `show()`, `hide()` | Toggle visibility |
| `onProps()` | Listen for prop updates (returns an unsubscribe function) |
| `reportError()` | Report an error to the consumer, which emits it on its `error` event |
| `export()` | Export methods/data to consumer |
| `consumerOrigin` | The consumer origin (a read-only string), verified once `ready` resolves |
| `getPeerInstances()` | Get peer component instances from the same consumer and host origin; requires `peers` on this host's component |

</details>

### Exporting Data to Consumer

The host can export data and methods for the consumer to call. Describe them with the component's `exports` schema, which types both sides and is checked on every export.

> **`Shared definition`**

```typescript
export const MyComponent = create({
  tag: 'my-component',
  url: 'https://widgets.example.com/form',
  exports: prop.object({
    validate: prop.function<() => boolean>(),
    getFormData: prop.function<() => { email: string }>(),
  }),
});
```

> **`Host`**

```typescript
const host = initHost(MyComponent, { consumerOrigins });
if (host) {
  await host.export({
    validate: () => document.querySelector('form')!.checkValidity(),
    getFormData: () => ({
      email: document.querySelector<HTMLInputElement>('#email')!.value,
    }),
  });
}
```

> **`Consumer`**

```typescript
const instance = MyComponent();
await instance.render('#container');

const isValid = await instance.exports?.validate(); // Promise<boolean>
const data = await instance.exports?.getFormData();
```

`export()` is the one way to send data to the consumer; it bridges functions and `Date` values, and exported methods always return promises on the consumer. To push events instead, call a callback prop the consumer passed in.

The consumer validates each export against `exports` before it replaces `instance.exports` and emits `exports`. An invalid export keeps the previous exports, rejects the host's `export()` with a `VALIDATION` error carrying the schema's message, and emits that error on the consumer. The host releases the callbacks of the rejected export. A host started with `initHost(MyComponent, ...)` checks its exports before sending them, so the rejection happens at the host's call site; the tag-agnostic `initHost({ consumerOrigins })` has no exports schema and leaves the check to the consumer. The schema validates only: like a prop schema, it must return a valid value unchanged, so transforms are rejected. Describe methods with `prop.function()`, because Zod's `z.function()` returns a wrapper rather than the exported function, and keep unknown keys (Zod objects strip them unless declared loose). Without `exports`, exports are `unknown` and not validated.

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

React support lives in its own entry point, `forgeframe/react`. It needs `react` (16.8 or later; the tests run React 19), which is an optional peer dependency, so projects without React install nothing extra. The root `forgeframe` entry contains no React code and its types reference no React types. TypeScript resolves the subpath through the package `exports` map, so set `moduleResolution` to `bundler`, `node16` or `nodenext`; `node` (`node10`) resolution cannot find `forgeframe/react`.

### Basic Usage

```tsx
import { useRef, useState } from 'react';
import { create, prop } from 'forgeframe';
import { createReactComponent, type ReactInstance } from 'forgeframe/react';

const LoginComponent = create({
  tag: 'login',
  url: 'https://auth.example.com/login',
  dimensions: { width: 400, height: 350 },
  props: {
    email: prop.string().optional(),
    onLogin: prop.function<(user: { id: number; name: string }) => void>(),
  },
  exports: prop.object({ reset: prop.function<() => void>() }),
});

const Login = createReactComponent(LoginComponent);

function App() {
  const [user, setUser] = useState<{ id: number; name: string } | null>(null);
  const login = useRef<ReactInstance<{ reset: () => void }>>(null);

  return (
    <div>
      <h1>My App</h1>
      <Login
        email="user@example.com"
        onLogin={(loggedInUser) => setUser(loggedInUser)}
        onRendered={() => console.log('Ready')}
        onError={(err) => console.error(err)}
        onClose={() => console.log('Closed')}
        instanceRef={login}
        className="login-frame"
        style={{ border: '1px solid #ccc' }}
      />
      <button onClick={() => login.current?.exports?.reset()}>Reset</button>
    </div>
  );
}
```

`createReactComponent(Component)` takes only the component. React DevTools shows the wrapper as `ForgeFrame(<tag>)`, here `ForgeFrame(login)`. Annotate a wrapper with `ReactComponentOf<typeof LoginComponent>`.

### React Props

The React component accepts your component props alongside these wrapper props:

| Prop | Type | Description |
|------|------|-------------|
| `onRendered` | `() => void` | Called once the instance has rendered, right after `instanceRef` receives it |
| `onError` | `(err: Error) => void` | The instance's `error` event, plus construction, render, and prop-sync failures. Library failures are [`ForgeFrameError`s](#errors); branch on `err.code`, such as `POPUP_BLOCKED` |
| `onClose` | `() => void` | The instance's `close` event: the host or the user closed it, `instanceRef.current.close()` was called, or the wrapper unmounted or changed `context` |
| `context` | `'iframe' \| 'popup'` | Render mode; changing it closes the instance and renders a new one |
| `instanceRef` | `React.Ref<ReactInstance<Exports>>` | Receives the rendered instance, and `null` when it closes, the wrapper unmounts, `context` changes, or rendering fails. Accepts a ref object or a callback ref |
| `className` | `string` | Container CSS class |
| `style` | `React.CSSProperties` | Container inline styles |
| `ref` | `React.Ref<HTMLDivElement>` | Access the wrapper's container element. It is attached during React's commit, so a parent's `useLayoutEffect` can read it, and React 19 callback-ref cleanups run on unmount |

The handle `instanceRef` receives (`ReactInstance<Exports>`) has the instance's `uid`, `exports`, `event` (`on` and `once`, including the `exports` event), `resize()`, `focus()`, `show()`, `hide()` and `close()`. It has no `render()` or `updateProps()`: the wrapper renders the instance and sends prop changes itself. It is set only after `render()` resolves, so every method works on it; while the frame loads it is `null`.

These names are reserved: `createReactComponent` throws a `VALIDATION` error for a component that declares a prop named `onRendered`, `onError`, `onClose`, `context`, `instanceRef`, `className`, `style`, `ref` or `key` (React keeps `ref` and `key` for itself). Give such a prop another name, such as `onHostClose`.

Removing a prop from your JSX resets it exactly as `updateProps({ key: undefined })` does, and passing `undefined` counts as leaving the prop out, so `theme={dark ? 'dark' : undefined}` sends no update when it switches between the two. Commits made while the frame is still loading reach the host in order once it has started. After the instance closes, prop changes are not sent until a new instance renders (change `context` or the React `key`).

Construction and render failures go to `onError` and are shown inside the wrapper; sibling React content is unaffected, and the container ref stays attached. To recover, change `context` (which creates a fresh instance) or change the wrapper's React `key` to remount it.

### Server rendering, React Server Components and Preact

- **Server rendering:** importing `forgeframe/react` has no side effects. On the server the wrapper renders only its container `div`; effects do not run, so no instance is created until the client hydrates.
- **React Server Components:** the wrapper uses hooks, so render it inside a client component (a file with `"use client"`).
- **Preact:** alias `react` to `preact/compat` in your bundler (for example `resolve.alias: { react: 'preact/compat' }` in Vite).

---

## Advanced Features

### Popup Windows

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

### Origin Security

Every trust decision is explicit, and `'*'` is the visible opt-in for "any origin".

Each option takes origins: a scheme, host and port, such as `https://app.example.com`. A bare host such as `example.com` never matches an origin, so it is rejected.

- `hostOrigins` is consumer-side trust: the host origins the consumer will render and message. A static `url` trusts its own origin when `hostOrigins` is omitted. A function `url` requires `hostOrigins`, and every URL it returns must match; `create()` throws without it, so a URL built from props, a query string or tenant data can never point the consumer at an unlisted origin. `hostOrigins: '*'` with a function `url` trusts any http(s) origin the function returns.
- `consumerOrigins`, passed to `initHost()`, is host-side trust: the consumer origins that may embed and initialize the host. It is required; `'*'` admits any http(s) consumer, and the host still binds the exact origin the browser verified, so `host.consumerOrigin` and outbound messages use that origin.
- `peers` decides whether, and to which host origins, a component's instances are listed for peer discovery.
- Use `hostOrigins` and `consumerOrigins` together for payment, auth, account, and other sensitive workflows.

Each accepts a string, a `RegExp`, or an array mixing them, including a readonly `as const` array. A string is an exact origin, or `'*'` alone, which matches any origin. The only wildcard is a leading `*.` in the host, which stands for one or more labels: `'https://*.example.com'` matches `https://app.example.com` and `https://a.b.example.com`, but not `https://example.com`, `https://evilexample.com` or `http://app.example.com`, and the scheme and port must match exactly. Any other `*`, such as `'https://*example.com'`, `'https://app.example.com*'` or `'https://api.*.example.com'`, a pattern without a scheme, such as `'*.example.com'`, one with a path, such as `'https://app.example.com/'`, and an exact origin in a form browsers never report, such as `'https://App.example.com'` or `'https://example.com:443'`, throw a `VALIDATION` error that names the form to write. Use a `RegExp` for anything more flexible. Empty or blank strings, `null`, and other values throw, so a missing setting such as `process.env.CONSUMER_ORIGIN || ''` cannot silently trust every origin. An empty array throws for `hostOrigins`, `peers`, and `deliverTo`, where it could never match; for `consumerOrigins` it is valid and admits no consumer, so configuration that resolves to nothing fails closed.

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

#### Sandbox

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

### Pre-render Checks

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

### Nested Components

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

## Errors

Every error ForgeFrame raises is a `ForgeFrameError` with a `code`. Branch on the code: the message is for people and may change in any release. The standard `cause` holds the underlying failure, when there is one. Errors thrown by your own code, such as remote callbacks, templates, URL and dimension functions, and lifecycle listeners, reach you unchanged. The exception is the component's `validate` option, whose rejection becomes `VALIDATION` with the thrown value as `cause`.

```typescript
import { ForgeFrameError } from 'forgeframe';

try {
  await instance.render('#container', 'popup');
} catch (error) {
  if (!(error instanceof ForgeFrameError)) throw error;
  switch (error.code) {
    case 'POPUP_BLOCKED': showAllowPopupsHint(); break;
    case 'INIT_TIMEOUT': showRetry(); break;
    case 'CANCELLED': break; // your own close() interrupted the render
    default: report(error);
  }
}
```

| Code | Meaning | Raised by |
|---|---|---|
| `POPUP_BLOCKED` | The browser refused to open the popup | `render()` |
| `INIT_TIMEOUT` | The initial handshake did not complete in time. On the consumer this is the `initTimeout` wait; when the host reported why it failed, the message includes the reason and `cause` holds it. On the host, the consumer never answered BOOTSTRAP or INIT | `render()`, the consumer and host `error` events, `host.ready` |
| `VALIDATION` | Invalid options, props, arguments or calls, including a second `render()` with different arguments; values that cannot cross windows, such as a `BigInt` or a cycle (for a `BigInt`, the encoder's `TypeError` is the `cause`) | `create()`, `initHost()`, `render()`, `updateProps()`, `resize()` of a cross-origin popup, the host's `export()` and `resize()`, `host.ready` |
| `VERSION_MISMATCH` | The other window runs a ForgeFrame version that cannot talk to this one: a consumer from another major version, or a request this version has no handler for | `initHost()`, any request to the other window |
| `ORIGIN_REJECTED` | A trust policy refused an origin or a window: a URL outside `hostOrigins`, a consumer outside `consumerOrigins`, a host origin change after render, a call from an unexpected window | `render()`, `updateProps()`, `initHost()` |
| `CANCELLED` | Your own `close()`, or an unmount by the React wrapper, interrupted `render()` | `render()` |
| `CLOSED` | The instance, the host or the other window is gone or no longer answering, including the host's `close()` or the user closing the popup during `render()`, a retired callback reference, and an acknowledgement that timed out after initialization. An update rejected because its render failed has that failure as `cause` | `render()` and `updateProps()` after close, remote calls, host controls, `host.ready` |
| `CAPACITY` | A size limit was reached: 500 distinct callbacks per snapshot, the 1,000-reference recovery pool, the 500-reference peer relay, or the `window.name` payload size | `render()`, `updateProps()`, remote calls, `getPeerInstances()` |

Codes cross windows: a prop update the host rejects arrives as `VALIDATION`, as a local rejection does. A remote callback that throws reaches the caller as a plain `Error` with its message and no code, because the failure is the application's. An error the host reports with `host.reportError()` is also a plain `Error`.

---

## Versioning

ForgeFrame follows semantic versioning for its public API. Breaking changes ship only in a new major version; minor and patch releases add features and fix bugs without breaking existing callers. Error message text is not part of the API: branch on `ForgeFrameError.code` (see [Errors](#errors)). Read the [GitHub release notes](https://github.com/jshsmth/ForgeFrame/releases) before upgrading.

In 2.x:

- Minor releases may add error codes, lifecycle events, options and host controls. Existing failures keep their codes, so give every `switch` on `error.code` a `default` branch. A peer that receives a code its version does not know sees a plain `Error` with the message.
- A newer 2.x side may send a request an older 2.x side does not know; the older side answers `VERSION_MISMATCH` at once instead of timing out, so a feature the other side lacks fails fast. Run the same 2.x version on both sides when you can.
- Minimum supported versions (browsers, Node.js for tooling, TypeScript) move only in a minor release, and the release notes say so. 2.0.0 needs TypeScript 5.0 or later.

Upgrading:

- **From 1.x:** follow [Migrating from v1 to v2](#migrating-from-v1-to-v2). Install the same 2.x version in the consumer and the host and deploy them together. A v2 host's `initHost()` throws an upgrade error when a 1.x consumer embeds it, and a v2 consumer's handshake timeout says to check that both sides run the same ForgeFrame major version when a 1.x host cannot start.
- **From 1.0.x:** read the [1.1.0 release notes](https://github.com/jshsmth/ForgeFrame/releases/tag/v1.1.0) first; the migration guide starts from 1.1.0.
- **From 0.x:** upgrade straight to 2.x with the migration guide. A v2 host refuses 0.x consumers the same way it refuses 1.x consumers.

---

## Migrating from v1 to v2

This guide starts from ForgeFrame 1.1.0. Each section lists what changed, with the v1 form, the v2 form and what to do. TypeScript reports most of these changes at compile time, and a JavaScript caller that still passes a removed option gets a `VALIDATION` error that names its replacement.

### Upgrade consumer and host together

ForgeFrame 2 uses bootstrap protocol 3, and a v2 host accepts only v2 consumers. Install the same 2.x version in the consumer and host projects, rebuild both, and deploy them together. If you cannot deploy both at once, serve the v2 host at a new URL and point the v2 consumer at it while 1.x consumers keep using the old URL. The v1 staged upgrade ("deploy hosts first") no longer works.

A mixed deploy fails fast with a clear error instead of misbehaving:

| Consumer | Host | What happens |
|---|---|---|
| 1.x (or 0.x) | 2.x | The host's `initHost()` throws a `VERSION_MISMATCH` error that names the consumer's ForgeFrame version and says to upgrade the consumer and host to ForgeFrame 2 together. Nothing is sent to the consumer, whose `render()` times out. |
| 2.x | 1.x | The 1.x host cannot read the v2 channel metadata and never starts. The consumer's `render()` rejects with `INIT_TIMEOUT` after `initTimeout`, and the message says to check that consumer and host run the same ForgeFrame major version. |

`window.name` now holds only channel metadata (uid, tag, protocol, context and consumer origin). v1 never stored application data there either, so nothing needs converting.

TypeScript projects that use React support need `moduleResolution` set to `bundler`, `node16` or `nodenext`. The React adapter is published only as the `forgeframe/react` subpath export, which `node` (`node10`) resolution cannot find.

After upgrading, test both sides together: create and render, prop updates, callbacks in both directions, exports, reconnecting after a host reload, teardown, popups, and React mounts if you use them.

### Upgrade checklist

Work through these in order. The first three affect every integration; test after each step.

1. [Use named imports](#named-imports-only).
2. [Start the host with `initHost(Component, { consumerOrigins })`, read props from `await host.ready`, and call controls on the `host` handle](#host-start-up-and-props).
3. [List allowed origins](#secure-defaults): `consumerOrigins` on the host, and `hostOrigins` for a function `url`.
4. [Opt peers in and move the sandbox option](#secure-defaults).
5. [Replace `on*` lifecycle props with events](#lifecycle-events).
6. [Let the schema decide whether a prop is required and its default](#prop-definitions), and review [prop updates](#prop-updates).
7. [Apply the renames and switch error handling to codes](#naming-and-errors).
8. [Import React support from `forgeframe/react`](#react-forgeframereact).
9. [Update type imports and drop explicit type arguments](#types-and-inference).
10. [Remove the serialization option](#props-are-always-json) and the [zoid-era APIs](#removed-zoid-era-apis).

### Named imports only

The `ForgeFrame` object is gone, both as the default export and as the named `import { ForgeFrame } from 'forgeframe'`; import each function by name.

```typescript
// v1
import ForgeFrame from 'forgeframe';
ForgeFrame.create({ ... });

// v2
import { create } from 'forgeframe';
create({ ... });
// or: import * as ForgeFrame from 'forgeframe'
```

### Host start-up and props

A host starts only through `initHost()`, which requires a consumer allowlist, and reads its props only from `await host.ready`. Host controls such as `close()` and `resize()` moved from the props object to the `host` handle, so `ready` resolves to the consumer's props alone. `create()` no longer starts or configures a host.

```typescript
// v1: positional arguments, props and controls read from window.hostProps
await initHost(paymentProps, ['https://shop.example.com'])?.ready;
const { amount, onSuccess, close } = window.hostProps;

// v2: start from the shared component, await its props, call controls on host
const host = initHost(PaymentForm, { consumerOrigins: ['https://shop.example.com'] });
if (!host) {
  renderStandalone(); // not opened by ForgeFrame
} else {
  const { amount, onSuccess } = await host.ready;
  // later: await host.close();
}
// or, without a shared component:
// initHost({ props: paymentProps, consumerOrigins: ['https://shop.example.com'] })
```

| Area | v1 | v2 | What to do |
|---|---|---|---|
| Starting the host | `initHost(propDefinitions, allowedConsumerDomains)`, a bare `initHost()`, or a host started by `create()` | `initHost(Component, { consumerOrigins })`, or `initHost({ props, consumerOrigins })` without a shared component | Call `initHost()` once with the component and the allowlist |
| Allowlist on the component | `create({ ..., allowedConsumerDomains })` | `create()` throws for it | Move the origins to `initHost(Component, { consumerOrigins })` |
| Open widgets | `initHost(definitions)` with no allowlist | `consumerOrigins` is required | Pass `consumerOrigins: '*'` |
| Reading props | `window.hostProps.amount`, `getHostProps()`, `Component.hostProps`, `host.getProps()`, `host.hostProps` | `(await host.ready).amount`; the object keeps its identity and receives later updates | Await `host.ready` before reading props |
| Host controls | `hostProps.close()`, `focus()`, `resize()`, `show()`, `hide()`, `export()`, `onProps()`, `reportError()`, `getPeerInstances()`, `uid`, `tag`, `consumerOrigin` on the props object | The same members on the `host` handle that `initHost()` returns; `await host.ready` holds only the consumer's props | Call `host.close()` and so on; pass `host` to helpers that need controls |
| Consumer window and snapshot | `hostProps.getConsumer()`, `hostProps.consumer.props` | Removed. The props a host receives are `await host.ready`; a host never gets the consumer's `Window` | Read props from `ready`, and talk to the consumer through callback props |
| Reserved prop names | 15 built-in names (`close`, `resize`, `consumer`, ...) could not be props | Only `then` and `children` are reserved, at compile time and at runtime; a prop may be called `close` | None, unless a prop was named `then` |
| `Window` augmentation | `declare global { interface Window { hostProps: HostProps<P> } }` | Not needed | Delete it; types come from `initHost(Component, ...)`. Use `HostPropsOf<typeof C>` and `HostOf<typeof C>` for helper parameters |
| `hostProps` setter | `host.hostProps = replacement` | Removed with `host.hostProps` | Delete the assignment |
| Host prop definitions | A definition of a reserved built-in name was silently dropped | `initHost({ props })` checks definitions as `create()` does: it throws for `then` or `children`, an unknown wrapped option, and `props` that are not a definitions object | Rename the prop |
| Deferred INIT | `initHost(defs, origins, { deferInit: true })`, then `host.flushInit()` or the first read of `window.hostProps` | `initHost(Component, { consumerOrigins, autoInit: false })`, then `host.init()`; `deferInit` throws a migration error | Call `host.init()` when the host is ready to show |
| A second `initHost()` | Replaced the schema or allowlist | Throws while a host is active | Pass the final definitions to the single call; to restart, call `host.destroy()` and then `initHost(...)` |
| Host internals | `host.event.on('props', fn)`, `host.getInitError()`, `host.flushInit()` | `host.onProps(fn)` and `host.on('error', fn)`, which return an unsubscribe function, and `host.init()` | See [Lifecycle events](#lifecycle-events) |
| Host detection | `isEmbedded()`, `Component.isHost()`, `Component.isEmbedded()` | `isHost()` | Replace the call |
| `isHost()` | True whenever `window.name` started with the ForgeFrame prefix, even for a malformed payload | True when a host is active or `window.name` holds a decodable ForgeFrame payload of any protocol version; false for a malformed payload; stays true after `host.destroy()` | None for most hosts |
| `canRenderTo` | `await Component.canRenderTo(win)` | Removed; it always returned `win === window` | Delete the check |

Deferred INIT, before and after:

```typescript
// v1
const host = initHost(definitions, origins, { deferInit: true });
await host.ready;
await host.hostProps.hide();
host.flushInit();

// v2
const host = initHost(Component, { consumerOrigins, autoInit: false });
await host.ready;
await host.hide();
host.init();
```

### Secure defaults

Allowlists are required, peers are opt-in, and the sandbox is a first-class option.

| Area | v1 | v2 | What to do |
|---|---|---|---|
| Host allowlist | `initHost` accepted any http(s) consumer when no allowlist was passed | `consumerOrigins` is required in every `initHost` form; `'*'` admits any http(s) consumer | Pass your consumer origins; pass `'*'` only for hosts meant to be embedded anywhere |
| Function URLs | `url: (props) => ...` without `domain` trusted any http(s) origin it returned | `create()` throws unless `hostOrigins` (v1 `domain`) is set when `url` is a function | Add the host origins the function may return, or `'*'` to keep the v1 behaviour |
| Peer discovery | On for every component at the same verified origin; `peerDomains` admitted other origins | Off unless the component sets `peers: 'same-origin'` or `peers: <matcher>`; `peerDomains` and `peers: true` throw; a host whose component lacks `peers` gets a rejection from `getPeerInstances()` | Add `peers` to every component whose hosts call `getPeerInstances()` and to every component they should find; move `peerDomains` values into `peers` |
| Exact origins | Entries such as `https://Shop.example.com`, `https://example.com:443` or `https://user@example.com` were accepted and never matched | `hostOrigins`, `consumerOrigins`, `peers` and `deliverTo` throw `VALIDATION`, naming the origin browsers report | Write origins as browsers report them: lowercase host, no default port, no userinfo |
| Origin wildcards | `*` matched any characters anywhere, so `https://*example.com` matched `https://evilexample.com`, and `*.example.com` without a scheme also matched `http://` | `*` stands only for leading host labels, as in `https://*.example.com`, and every pattern except `'*'` needs a scheme and no path; other wildcards throw | Rewrite patterns as `https://*.example.com`, or use a `RegExp` |
| Cross-tag discovery | `getPeerInstances({ anyConsumer: true })` | `getPeerInstances({ allTags: true })`; `anyConsumer` rejects | Rename the option |
| Peer type | `SiblingInfo` | `PeerInfo` | Rename the import |
| Sandbox | `attributes.sandbox`; `false` kept the default | Top-level `sandbox: string \| false`; a string must include `allow-scripts` and `allow-same-origin`; `false` writes no sandbox attribute; `attributes.sandbox` throws | Move a string value from `attributes.sandbox` to `sandbox`. Delete `attributes.sandbox: false`, which kept the default in 1.1; `sandbox: false` now removes the sandbox, so use it only to opt out |
| Opaque origins | A `'*'` or match-all `domain` matched a sandboxed host's `"null"` origin before the handshake failed | No matcher admits an opaque origin | Keep `allow-same-origin` in any custom sandbox |
| Undeclared host fields | A host kept fields it did not declare, and fields of `undefined` definition entries, unvalidated | A host with `props` keeps only the props it declares; only a tag-agnostic host without `props` keeps every field | Declare every prop the host reads, with `prop.any()` for a deliberately unchecked one |
| Empty matchers | `domain: []`, `peerDomains: []` and `deliverTo: []` were accepted and matched nothing | `hostOrigins: []`, `peers: []` and `deliverTo: []` throw; `consumerOrigins: []` still admits no consumer | Remove the option, or list the origins |
| Static iframe attributes | `name`, `src` and `srcdoc` in a static `attributes` object rejected `render()` | `create()` throws for them, and for `sandbox`; a computed `attributes` function is still checked at render | Remove the attribute |
| `ComponentOptions` type | An interface | A type alias over `ComponentBaseOptions` and the `url`/`hostOrigins` union `ComponentUrlOptions`, so it can no longer be augmented by declaration merging; `Partial<ComponentOptions>` spreads over the union | Use `ComponentBaseOptions` for options other than `url` and `hostOrigins` |

### Lifecycle events

Lifecycle runs only through typed events. Instances no longer have hidden built-in props, and ForgeFrame never calls a declared prop.

```typescript
// v1: lifecycle callbacks passed as hidden props
const instance = Checkout({ amount, onRendered, onClose, onError });

// v2: events on the instance
const instance = Checkout({ amount });
instance.event.on('rendered', onRendered);
instance.event.on('close', onClose);
instance.event.on('error', onError);
```

| Area | v1 | v2 | What to do |
|---|---|---|---|
| Hidden lifecycle props | `onRendered`, `onClose`, `onError`, `onDisplay`, `onRender`, `onPrerender`, `onPrerendered`, `onDestroy`, `onResize`, `onFocus` and `onProps` passed to the factory | Ignored unless declared as props; ForgeFrame never calls them | Subscribe with `instance.event.on(...)` |
| A host-facing callback named `onClose` | ForgeFrame also called it on every close | An ordinary prop, called only when the host calls it | None, unless you relied on the extra call |
| Render events | `prerender` or `prerendered`, then `display` | `render`, which fires once before any frame or placeholder exists, and `rendered`, which fires once | Rename the event |
| Teardown event | `destroy` | `closed` | Rename the event |
| Unknown event names and handlers | `on()` accepted any name and handler | An unknown or removed event name, or a handler that is not a function, throws `VALIDATION`; a removed name's message names its replacement | Fix the name or the handler |
| Removing handlers | `instance.event.off('close', fn)` or `instance.event.removeAllListeners()` | `on()` and `once()` return an unsubscribe function; ForgeFrame removes every listener after `closed` | Keep the returned function and call it |
| Emitting | `instance.event.emit('close')` | Removed | Call `instance.close()` |
| Waiting for exports | Polling `instance.exports` | `instance.event.once('exports', fn)`; the payload equals `instance.exports` | Subscribe to `exports` |
| Template focus | `TemplateContext.focus()` returned a promise | It is synchronous and returns `void` | Drop any `await` or `.then()` on it |
| CSP nonce | `Checkout({ cspNonce })`, which also sent the nonce to the host | `create({ ..., cspNonce })`; never sent to the host; custom templates read `TemplateContext.cspNonce` | Move it to the component options |
| `timeout` and `dimensions` as props | `Checkout({ timeout, dimensions })`, which was ignored | Component options only | Set them on `create()` |
| Host prop subscription | `const { cancel } = hostProps.onProps(fn); cancel();` | `const stop = host.onProps(fn); stop();`; `fn` gets the same props shape as `ready` | Call the returned function |
| Reporting a host error | `await hostProps.onError(err)` | `await host.reportError(err)`; `onError` is now an ordinary prop name | Rename the call |
| Host props event | `host.on('props', fn)` | `host.onProps(fn)` | Subscribe with `host.onProps()` |
| `rendered` timing | Before `render()` resolved; a listener that closed the instance made `render()` reject | After `render()` resolves, so a listener may close the instance | None |
| Event types | `EventEmitterInterface` | `EventSubscriber<ComponentEvents<Props, Exports>>` for `instance.event` and `HostEvents` for the host; the `EVENT` constants are gone (see [Types and inference](#types-and-inference)) | Use the new types and plain event names |

### Prop definitions

The schema is now the only source of a prop's presence, default and value; the object form only adds transport options. `create()` and `initHost()` throw for a removed option and name its replacement.

| Area | v1 | v2 | What to do |
|---|---|---|---|
| Required wrapped prop | `id: { schema: prop.string(), required: true }` | `id: prop.string()` | Drop `required` |
| Wrapped prop that was implicitly optional | `ref: { schema: prop.string(), queryParam: true }` (optional) | Required unless the schema accepts `undefined` | Write `ref: { schema: prop.string().optional(), queryParam: true }` |
| Wrapped literal default | `{ schema: prop.string(), default: 'light' }` | `prop.string().default('light')` | Move the default into the schema |
| Wrapped callback default | `{ schema: prop.function(), default: () => onCancel }` | `prop.function().default(() => onCancel)` | Move the default into the schema |
| Computed fallback | `{ schema, value: (ctx) => ... }` or `default: (ctx) => ...` | Removed | Compute the value before calling the factory or `updateProps()` |
| Decorator | `{ schema: prop.string(), decorate: ({ value }) => value.trim() }` | Removed | Use `prop.string().trim()`, or a schema transform that accepts its own output |
| Host decorator | `{ schema, hostDecorate: ({ value }) => ... }` | Removed | Transform on the host after receipt, or pass a separate derived prop |
| Per-prop validator | `{ schema, validate: ({ value }) => ... }` | Removed | Use a schema refinement (for example Zod `.refine`), or the component's `validate({ props })` for cross-prop rules |
| Alias | `email: { schema: prop.string(), alias: 'userEmail' }` with `Widget({ userEmail })` | Removed | Declare `email: prop.string()` and call `Widget({ email: legacy.userEmail })` |
| Same-origin only | `{ schema, sameDomain: true }` | `{ schema, deliverTo: 'same-origin' }` | Rename the option |
| Listed host origins | `{ schema, trustedDomains: ['https://a.example'] }` | `{ schema, deliverTo: 'https://a.example' }`, a `RegExp`, or an array | Rename the option |
| Withheld props on a shared host | A host required a `sameDomain` prop it never received | A host that shares definitions with a `deliverTo` prop does not require it when it is withheld from the host's origin, and discards the field if a consumer sends it anyway | None |
| Unknown wrapped options | Ignored, so `{ schema, deliverto: 'same-origin' }` silently sent the prop to every host | A compile error, and `create()` and `initHost()` throw `VALIDATION` naming the field | Fix the spelling or remove the field |
| Parameter clashes | Two props with the same `queryParam` or `bodyParam` name overwrote each other; a parameter on a `sameDomain` prop was never sent | Both throw at `create()`; `sendToHost` must be a boolean | Rename one parameter; drop the parameter from a `deliverTo: 'same-origin'` prop |
| Encoded query or body value | `queryParam: ({ value }) => encode(value)` | `queryParam` and `bodyParam` take `true` or a parameter name | Pass the encoded string as its own prop with `queryParam: 'name'`, or build the URL in a `url(props)` function |
| Shapeless object | `prop.object()` or `prop.object<Config>()` | `prop.object({ ... })` | Give the shape, use `prop.record(...)` for dictionaries, or `prop.any<Config>()` when deliberately unchecked |
| Shaped object | `prop.object().shape({ ... })` | `prop.object({ ... })` | Pass the shape directly |
| Array items | `prop.array().of(prop.string())` | `prop.array(prop.string())` | Pass the item schema directly |
| Itemless array | `prop.array()` or `prop.array<T>()` | `prop.array(itemSchema)` | Give the item schema, or use `prop.any<T[]>()` |
| Prop context | `PropContext` (`props`, `close`, `focus`, `onError`, `container`, `uid`, `tag`) | Removed | Compute values outside the definition |
| Missing-value error | `Prop "id" is required but was not provided` for the object form | Always the schema's message, such as `Validation failed: id: Required` | Branch on the `VALIDATION` code, not the message |
| Getter-defined prop entry | Read when props were normalized | `create()` and `initHost()` throw | Declare entries as plain fields |
| `outputSchema` option | A validation-only schema for normalized values | Removed; `create()` and `initHost()` throw for it. Each prop has one schema, which must accept its own output | Rewrite type-changing schemas as below |
| Type-changing schema | `{ schema: z.string().transform(Number), outputSchema: z.number() }` | One schema for the type the host receives | Pass `z.number()`, accept both forms with `z.coerce.number()`, or convert in the host |
| String to `Date` | `{ schema: z.string().transform((s) => new Date(s)), outputSchema: z.date() }` | One schema | Use `prop.date()` and pass a `Date`; or `z.union([z.iso.datetime(), z.date()]).transform((v) => new Date(v))`; or keep `prop.string()` and call `new Date(props.startsAt)` in the host |
| Same-type, non-idempotent transform | `{ schema: z.number().transform((n) => n * 100), outputSchema: z.number() }` | Rejected, because the schema changes its own output | Convert before calling the factory or `updateProps()`, or in the host |
| Required input whose output may be `undefined` | `{ schema: z.string().transform((v) => v \|\| undefined), outputSchema: z.string().optional() }` | One schema | Use `z.string().optional()` and pass `value \|\| undefined`, or keep `z.string()` and treat `''` as empty in the host |
| Consumer-only transform | `{ schema: z.string().transform((href) => new URL(href)), outputSchema: z.instanceof(URL), sendToHost: false }` | One schema | Use `{ schema: z.url(), sendToHost: false }` and compute `new URL(props.target)` inside `url(props)` |

### Prop updates

| Area | v1 | v2 | What to do |
|---|---|---|---|
| `updateProps()` while `render()` is pending | Rejects with "Cannot update props while the component is rendering" | Queued; applied in call order after the render settles; resolves when the host acknowledges; rejects with `CLOSED`, whose `cause` is the render's failure, if the render fails and closes the instance | Remove `await render()` sequencing or catch-and-retry code written for that error |
| An update in flight when the host reloads | Waited for the 10-second acknowledgement timeout, then rejected, although the new host had read its props | Resolves as soon as the new host document connects, because the new host's bootstrap snapshot carries it | None |
| Updates from `render` listeners, `url` functions and `validate` during render | Rejected | Queued like any other update | Do not `await` such an update inside code the render waits on, such as a callback the host calls before INIT: it waits behind the render and stalls until `initTimeout`. Start it without awaiting, or await it after `render()` resolves |
| `undefined` in an update | Reset to the fallback (undocumented; the React docs said `undefined` stays data) | The documented rule: the schema default, no value, or a validation error for a required prop | To leave a prop unchanged, leave its key out |
| React: removing a prop vs passing `undefined` | Same host result through an internal reset marker | Same result, documented; switching between the two sends no update | None |
| `null` in an update | A value | A value | None |

```typescript
const instance = Checkout({ amount: 10, theme: 'dark' });
const rendering = instance.render('#checkout');
const updating = instance.updateProps({ amount: 12 }); // the host starts with 10, then receives 12
await Promise.all([rendering, updating]);
await instance.updateProps({ theme: undefined }); // back to the schema default
```

### Naming and errors

Origins are called origins everywhere, and every error ForgeFrame raises is a `ForgeFrameError` with a `code`. See [Errors](#errors) for the codes.

| Area | v1 | v2 | What to do |
|---|---|---|---|
| Consumer host allowlist | `domain` | `hostOrigins` | Rename the option; values are origins such as `https://pay.example.com`, and a bare host such as `pay.example.com` now throws. The host's allowlist is `consumerOrigins` on `initHost()` (see [Host start-up and props](#host-start-up-and-props)) |
| Matcher type | `DomainMatcher` | `OriginMatcher` | Rename the type import |
| Consumer origin in the host | `hostProps.getConsumerDomain()` | `host.consumerOrigin`, a read-only property | Read it from the handle |
| Handshake timeout | `timeout` | `initTimeout` | Rename; remote callbacks still have no timeout |
| Default context | `defaultContext` | `context` | Rename |
| Removed names | Ignored or accepted | `domain`, `timeout` and `defaultContext` throw a `VALIDATION` error naming the replacement | Rename the option |
| Popup blocked | `err instanceof PopupOpenError`, and the instance closed | `err instanceof ForgeFrameError && err.code === 'POPUP_BLOCKED'`; the instance stays open, so `render(container, 'iframe')` can retry on it | Replace the check; close the instance yourself if you do not retry |
| Version mismatch | A 1.x host refused other payloads with a plain error | `VERSION_MISMATCH` for a consumer from another major version, and as the reply to a request the other side does not know | Branch on the code |
| Unsendable values | A `BigInt` or a cycle rejected with a raw `TypeError` | `VALIDATION`; for a `BigInt`, the `TypeError` is the `cause` | Branch on the code |
| A second `render()` | Returned the first render's promise, whatever its arguments | Joins the first render when the arguments match; rejects `VALIDATION` when the container or context differs | Await the first render, or close the instance before rendering elsewhere |
| Matching messages | `err.message.includes('timed out')`, `'not allowed'`, `'closed before rendering completed'`, `'callback limit'` | `err.code === 'INIT_TIMEOUT'`, `'ORIGIN_REJECTED'`, `'CANCELLED'`, `'CAPACITY'` | Switch on `code`; message text is not a contract and now says "origin" where it said "domain" |
| Host `error` event | An `Error`, or sometimes `{ type: 'init_failed', message, error }` | Always an `Error`; start-up failures are `ForgeFrameError`s with the underlying failure in `cause`, and that underlying failure rejects `host.ready` with the same code | Read `err.code` and `err.cause` |
| Component `validate` | Its error reached `render()` unchanged | `VALIDATION`, with your error as `cause` | Read `err.cause` for your own error |
| DOM methods | `await instance.show()`, and the same for `hide`, `focus` and `resize`, returned promises | They return `void` and finish before they return | `await` still works; replace `.then()` and `.catch()` chains, and catch `resize()` errors with `try`/`catch` |
| `resize` with nothing mounted | Emitted `resize` | Emits nothing, as `focus` does | Listen for `resize` only once rendered |
| Invalid URL at render | Closed the instance | Rejects `render()` and leaves the instance open | Fix the props with `updateProps()` and render again |

### React: `forgeframe/react`

| Area | v1 | v2 | What to do |
|---|---|---|---|
| Import | `import { createReactComponent } from 'forgeframe'` | `import { createReactComponent } from 'forgeframe/react'` | Change the import; `react` is an optional peer dependency that React apps already have |
| Module resolution | Any `moduleResolution` | `bundler`, `node16` or `nodenext`, which read the package `exports` map | Update `tsconfig.json` if it uses `node` or `node10` |
| Factory | `createReactComponent(Component, { React })` | `createReactComponent(Component)` | Drop the second argument; passing one throws a `VALIDATION` error |
| Curried factory | `withReactComponent(React)(Component)` | Removed | Call `createReactComponent(Component)` for each component |
| Instance access | Not available (the `ref` is the container `div`) | The `instanceRef` prop receives a handle after render and `null` when it goes away | Use it for `exports`, `resize()`, `focus()`, `show()`, `hide()`, `close()` and events |
| Types | `ReactComponentProps<P>` (unused generic), `ReactComponentType<P, E>`, `ReactDriverOptions` | `ReactComponentProps<Exports>`, `ReactComponentOf<typeof C>`, `ReactInstance<Exports>`; `style` is `React.CSSProperties` | Import the types from `forgeframe/react` |
| DevTools name | `ForgeFrame(Component)` | `ForgeFrame(<tag>)` | Update snapshot tests that include the display name |
| Reserved names | A component prop named like a wrapper prop was silently not forwarded | `createReactComponent` throws a `VALIDATION` error | Rename the component prop (for example `onHostClose`) |
| `onRendered` timing | On the instance's `rendered` event | After `render()` resolves, right after `instanceRef` is set | None |
| A render failure | Could reach `onError` twice (the `error` event and the rejected render), plus a `CLOSED` error for each prop change held during that render | Reported once | None |
| Preact | `createReactComponent(C, { React: preactCompat })` | Alias `react` to `preact/compat` in your bundler | Configure the alias |

### Types and inference

`create()` has one signature and takes no type arguments: props, factory input and exports are inferred from the schemas, and calling a factory without props fails to compile when a prop is required. Renamed types fail loudly instead of reinterpreting their parameters.

| Area | v1 | v2 | What to do |
|---|---|---|---|
| Explicit props type | `create<LoginProps>({ ... })` | `create({ ... })` | Derive the type with `type LoginProps = PropsOf<typeof LoginForm>`, or check definitions with `props: { ... } satisfies PropsDefinition<LoginProps>` |
| Explicit exports type | `create<Props, Exports>({ ... })` | `create({ ..., exports: prop.object({ ... }) })` | Declare an `exports` schema; read the type with `ExportsOf<typeof C>` |
| Input and alias generics | `create<P, X, I, SchemaInputs>`, `ConsumerPropsInput`, `ConsumerPropsUpdate` | Removed; the input is inferred | Use `InputOf<typeof C>` |
| Component type | `ForgeFrameComponent<P, X, I, RequireProps, SchemaInputs>` | `Component<Props, Input, Exports, HostProps>` | Use `typeof C`, or `<C extends AnyComponent>` for a generic helper. A hand-written `Component<P, I, X>` or `Component<P>` rejects a component with `sendToHost: false` or `deliverTo` props, because its host props differ; pass them as the fourth argument |
| Instance type | `ForgeFrameComponentInstance<P, X, I, SchemaInputs>` | `ComponentInstance<Props, Input, Exports>` | Rename the type |
| Host props type | `HostProps<P>` with a hand-written `P`, including the controls | `HostPropsOf<typeof C>` for the props and `HostOf<typeof C>` for the handle; `HostProps` and `HostPropsBuiltins` are removed. The host type leaves out `sendToHost: false` props and makes `deliverTo` props optional, for inline and `satisfies` definitions (see [Typing the host](#typing-the-host)) | Derive them from the component; stop reading withheld props on the host, and check `deliverTo` props before use |
| Annotated definition maps | `const defs: PropsDefinition<P> = { ... }` | Still supported; the component's input is `P`, so a missing or mistyped prop fails to compile | None |
| Definition types | `PropsDefinition<P, I>`, `HostPropsDefinition<P, I>`, `PropDefinition<Output, Input>`, `ComponentOptions<P, SchemaInputs>`, `InitHostOptions<P, SchemaInputs>` | `PropsDefinition<P>` (for host definitions too), `PropDefinition<Output>`, `ComponentOptions<P>`, `InitHostOptions<P>` | Drop the input parameter and replace `HostPropsDefinition` with `PropsDefinition`; defaulted schemas fit without it |
| Host typing | `initHost<P, SchemaInputs>({ props, consumerOrigins })` | `initHost(Component, { consumerOrigins })` infers the props; the tag-agnostic form infers them from `props` | Drop the type arguments |
| Definition map keys | `PropsDefinition<P>` entries were optional | Every key of `P` needs an entry, so `satisfies` reports a missing definition | Declare an optional prop with an optional schema |
| Inference types | `InferPropsDefinition<D>`, `InferPropsDefinitionInput<D>` | `InferProps<D>`, `InferPropsInput<D>` | Rename the types |
| `instance.exports` | Writable in the types | `readonly` | Do not assign it; the host sets it with `host.export()` |
| Schema output type | `InferSchemaOutput<S>` | `StandardSchemaV1.InferOutput<S>` (and `StandardSchemaV1.InferInput<S>`) | Rename the type |
| Removed types | `SchemaPropDefinition`, `PropDefinitionEntry`, `Prop`, `ChildrenDefinition`, `ConsumerNamespace`, `EligibilityResult`, `ForgeFrameComponentReference` | Removed | Use `PropDefinition`, `PropsDefinition`, `InferProps` and `typeof prop`; delete the others' imports |
| Schema classes | `import { StringSchema } from 'forgeframe'`, `new StringSchema()`, `x instanceof ObjectSchema` | Exported as types only | `import type { StringSchema } from 'forgeframe'`; build with `prop.string()`; no `instanceof` |
| Schema detection | `isStandardSchema(value)` | Removed | Check `'~standard' in value` yourself, or let ForgeFrame validate |
| Context constants | `CONTEXT.POPUP` | `'popup'` (type `ContextType`) | Use the string |
| Event constants | `EVENT.RENDERED` | `'rendered'` (type `EventType`) | Use the string |
| Exports validation | Not validated | Validated against `exports`: a host started with `initHost(Component)` rejects invalid exports in `export()` before sending them; for a tag-agnostic host the consumer rejects them, keeps the previous exports and emits `error`, and the host's `export()` rejects with `VALIDATION` | Declare an `exports` schema that matches what the host exports |
| `hostProps.export()` type | `export<X>(exports: X)` | `host.export()`, typed by the component's `exports` schema; any value without one | Drop the type argument |
| React generics | `createReactComponent<P, X, E, I, RequireProps, SchemaInputs>` | `createReactComponent<typeof C>`, normally inferred; wrapper props come from `InputOf<typeof C>` | Drop the type arguments; see [React](#react-forgeframereact) |
| Enum literal types | `prop.enum(['a', 'b'])` could widen to `string` under a contextual type | Always `'a' \| 'b'` | None |

### Props are always JSON

ForgeFrame 2 sends every prop as JSON through the function bridge. The `serialization` prop option and its `BASE64` and `DOTIFY` formats, `PROP_SERIALIZATION` and `SerializationType` are gone, and `create()` or `initHost()` throws if a definition still sets `serialization`. Callbacks at any depth are still bridged, and `Date` values still arrive as `Date`s.

| Area | v1 | v2 | What to do |
|---|---|---|---|
| `serialization` option | `serialization: PROP_SERIALIZATION.BASE64` or `DOTIFY` | Removed; `create()` and `initHost()` throw for it | Remove the option; base64- or dot-encoded values now arrive as the same JSON values |
| Encoded query parameter | The host read a base64- or dot-encoded parameter | The parameter carries the plain value | Read the plain value, or pass your own encoded string as a separate prop with `queryParam: 'name'` |
| `toJSON()` with DOTIFY | Not applied to the root object or to nested plain objects, so fields a class hid were sent, and a plain object's own `toJSON` arrived as a callable field | Applied, as `JSON.stringify` does | Check what the host receives; stop reading hidden fields or calling a delivered `toJSON` |
| An array's `toJSON()` | Called by BASE64 at any depth, and by DOTIFY for arrays inside objects | Not called; the entries are sent | Convert such arrays before passing them |
| `JSON.rawJSON()` values | Delivered as the value their text represents in BASE64 | Delivered as the value their text represents, as native JSON does | None |
| A prop whose `toJSON()` returns `undefined` | Omitted | Omitted | None |

### Removed zoid-era APIs

Each of these duplicated another API. TypeScript reports every removed member and option, and `create()` throws a migration error if a JavaScript caller still passes `eligible` or `children`.

| Area | v1 | v2 | What to do |
|---|---|---|---|
| `renderTo` | `await instance.renderTo(window, '#container', 'popup')` | Removed | `await instance.render('#container', 'popup')` |
| `clone()` | `const copy = instance.clone()` | Removed | Call the factory again with the props you want: `Component({ ...currentProps })` |
| `destroy(instance)` | `await destroy(instance)` | Removed | `await instance.close()` |
| `destroyByTag(tag)` | `await destroyByTag('payment-form')` | Removed | `await Promise.all(PaymentForm.instances.map((i) => i.close()))` |
| `destroyAll()` | `await destroyAll()` | `await closeAll()`: closes every live instance, resolves once all have closed, and rejects with an `AggregateError` after the others finish if any close fails | Rename the call |
| `eligible` and `isEligible()` | `create({ ..., eligible: ({ props }) => ({ eligible: !!props.userId, reason: 'Log in' }) })` | Removed | Throw from `validate: ({ props }) => { if (!props.userId) throw new Error('Log in'); }`, and check the same condition before calling `render()` |
| `instance.state` and `ctx.state` | `instance.state.step = 2` | Removed | Keep per-instance state in your own code, such as a `WeakMap` keyed by the instance or a closure |
| `hostProps.consumer.export()` | `await hostProps.consumer.export({ token })`, read on the consumer through a cast | Removed with `hostProps.consumer` | `await host.export({ token })` and read `instance.exports`, or call a consumer callback prop |
| Nested `children` | `create({ ..., children: () => ({ CardField }) })`, then `hostProps.children.CardField({...}).render('#card')` in the host | Removed; `children` stays a reserved prop name | Import the child component in the parent host and render it there; the child host page calls `initHost(CardField, { consumerOrigins: ['https://parent-host.example'] })` |
| Mutating `Component.instances` | `Component.instances.splice(0)` | `instances` returns a new frozen snapshot on each read | Close instances with `close()` or `closeAll()`, then read `instances` again |

---

## API Reference

### Exports

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

### Component Options

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

### Instance Methods

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

### Instance Lifecycle

- **URL resolution.** Relative component URLs resolve against `document.baseURI`, including any `<base href>`. `render()` validates and pins the absolute URL before loading callbacks run and uses it for navigation and prop delivery checks, so changing the document base during a callback cannot redirect the initial request.
- **Closing during render.** Calling `close()` while `render()` is in flight cancels the render, removes its loading and host elements, and stops any iframe or popup that has not opened yet. The render promise rejects with a `CANCELLED` [`ForgeFrameError`](#errors); when the host's `close()` or the user closing the popup ends the render instead, it rejects with `CLOSED`.
- **Repeated close.** Repeated or reentrant `close()` calls wait for the same operation, including deregistration and the `closed` event; `close`, `closed` and cleanup run once. If a failed render already started destruction, `close()` waits for that teardown without emitting `close`.

### Iframe Styles and Loading

Numeric `style` values become pixels, except for unitless CSS properties, which stay numbers; custom property names are case-sensitive. While the host loads, ForgeFrame conceals the iframe; lazy iframes stay in layout so they can load. After initialization it restores configured `display`, `visibility`, `opacity`, and `transition` styles without its default fade overriding them. `show()` and `hide()` calls take precedence over configured visibility.

---

## TypeScript

ForgeFrame is written in TypeScript. `create()` takes no type arguments: props, factory input and exports are inferred from the `props` and `exports` schemas, and the props argument is required exactly when a prop schema rejects `undefined`.

```typescript
import {
  create,
  initHost,
  prop,
  type Component,
  type AnyComponent,      // Constrains generics that accept any component
  type ComponentInstance,
  type PropsOf,
  type InputOf,
  type ExportsOf,
  type HostPropsOf,
  type HostOf,
  type PropsDefinition,
  type PropDefinition,
  type InferProps,
  type InferPropsInput,
  type InferHostProps,
  type ComponentOptions,
  type ComponentBaseOptions,
  type ComponentUrlOptions,
  type Host,
  type InitHostOptions,
  ForgeFrameError,
  type ForgeFrameErrorCode, // 'POPUP_BLOCKED' | 'INIT_TIMEOUT' | ... | 'CAPACITY'; keep a default branch
  type OriginMatcher,
  type RemoteValue,
  type StandardSchemaV1,
  type StandardSchemaV1Props,
  type DefaultedSchemaOutput, // What .default() infers; declaration files name it
  type StringSchema,      // Schema classes are types; build schemas with prop.*
  type ObjectSchema,
  type InferObjectShape,  // What prop.object() infers; declaration files name it
  type InferObjectInputShape,
  type ContextType,       // 'iframe' | 'popup'
  type EventType,         // 'render' | 'rendered' | ... | 'exports'
  type ComponentEvents,
  type EventHandler,
  type EventSubscriber,
  type HostEvents,
  type TemplateContext,
  type Dimensions,
  type GetPeerInstancesOptions,
  type PeerInfo,
} from 'forgeframe';

import {
  createReactComponent,
  type ReactComponentOf,     // ReactComponentOf<typeof C>: the wrapper's React type
  type ReactComponentProps,  // The wrapper's own props
  type ReactInstance,        // What instanceRef receives
} from 'forgeframe/react';
```

### Typing helpers

Read the pieces of a component back from `typeof Component`:

| Helper | Type |
|---|---|
| `PropsOf<typeof C>` | The normalized props, as the consumer holds them |
| `InputOf<typeof C>` | What the factory and `updateProps()` accept; wider than the props for defaults and coercions |
| `ExportsOf<typeof C>` | The `exports` schema's output, or `unknown` |
| `HostPropsOf<typeof C>` | What `await host.ready` resolves to: the props as the host receives them, without `sendToHost: false` props and with `deliverTo` props optional |
| `HostOf<typeof C>` | The `host` handle `initHost(C, ...)` returns, with `export()` typed by the exports schema |

`Component<Props, Input = Props, Exports = unknown, HostProps = Props>` and `ComponentInstance<Props, Input = Props, Exports = unknown>` annotate factories and instances, and `AnyComponent` constrains a generic that accepts any component (`<C extends AnyComponent>`). Prefer `typeof C` and `AnyComponent`: `HostProps` defaults to `Props`, so a `Component<P, I, X>` annotation or a `<P>(c: Component<P>)` helper rejects a component with `sendToHost: false` or `deliverTo` props; `instance.exports` is `RemoteValue<Exports>`, whose methods return promises. For a schema's own types, use `StandardSchemaV1.InferOutput<typeof schema>` and `StandardSchemaV1.InferInput<typeof schema>`.

To start from a hand-written interface, check the definitions against it with `satisfies`. `PropsDefinition<P>` needs an entry for every key of `P`, and each schema's output must match: a required key rejects a schema that may produce `undefined`. Give an optional key an optional schema too; a required schema there still type-checks, but the inferred props then make the key required.

```typescript
import { create, prop, type PropsDefinition } from 'forgeframe';

interface LoginProps {
  email: string;
  rememberMe: boolean;
  onLogin: (user: { id: string }) => void;
}

const loginProps = {
  email: prop.string().email(),
  rememberMe: prop.boolean().default(false),
  onLogin: prop.function<(user: { id: string }) => void>(),
} satisfies PropsDefinition<LoginProps>; // A missing or mistyped entry is a compile error

export const LoginForm = create({
  tag: 'login-form',
  url: 'https://auth.example.com/login',
  props: loginProps,
});
```

Definitions built at runtime, such as from configuration, can be typed as `PropsDefinition<MyProps>`, and `create()` infers `MyProps` from them, both as the props and as the factory input. A single entry typed as `PropDefinition<T>` or `StandardSchemaV1<unknown, T>` works the same way: `T` is both its prop type and its input, so the prop stays required unless `T` includes `undefined`. An annotation widens each entry's options to `sendToHost?: boolean` and `deliverTo?`, so the host type counts every annotated prop as delivered (see [Typing the host](#typing-the-host)). When definitions withhold props from the host, check them with `satisfies` instead. A Zod annotation such as `z.ZodType<User>` declares its input as `unknown`, so the prop becomes optional and accepts any value; write `z.ZodType<User, User>` to keep it required and typed.

### Typing the host

`initHost(Component, ...)` infers the host props and the `export()` type from the component, so the host needs no `Window` augmentation or separate interface. Annotate helpers that receive the props with `HostPropsOf<typeof Component>`, and helpers that need controls with `HostOf<typeof Component>`. The tag-agnostic `initHost({ props, consumerOrigins })` infers the props from the definitions it is given, as `InferHostProps<D>`.

For inline and `satisfies` definitions, the host type matches what the host receives. A `sendToHost: false` prop is left out, so calling it does not compile. A prop with a `deliverTo` option is optional, because whether this host receives it depends on its origin; check it before use.

The host type reads these options from the definitions' literal types, which inline definitions and `satisfies` keep. An entry or map annotated as `PropDefinition<T>` or `PropsDefinition<P>` has only `sendToHost?: boolean` and `deliverTo?`, so its props are typed as delivered: a `sendToHost: false` prop stays in the host type, although it is `undefined` on the host. Use `satisfies PropsDefinition<P>` (or `satisfies PropDefinition<T>` per entry) for definitions with withheld or `deliverTo` props.

```typescript
import { initHost, type HostOf, type HostPropsOf } from 'forgeframe';
import { MyComponent } from './my-component';

async function submit(
  host: HostOf<typeof MyComponent>,
  props: HostPropsOf<typeof MyComponent>,
) {
  await props.onSubmit({ email: 'user@example.com' });
  await host.close();
}

const host = initHost(MyComponent, { consumerOrigins: ['https://app.example.com'] });
if (host) {
  const props = await host.ready; // HostPropsOf<typeof MyComponent>
  props.name;
  await host.resize({ width: 400, height: 300 });
  await submit(host, props);
}
```

The object `ready` resolves to keeps its identity, so references you keep see later updates. The `host` handle is frozen.

---

## Browser Support

ForgeFrame ships ES2022 output and uses `Object.hasOwn`, so it needs Chrome 93, Firefox 92, Safari 15.4 or later. Transpile and polyfill the package in your build pipeline for older targets. Its type declarations need TypeScript 5.0 or later, with `moduleResolution` set to `bundler`, `node16` or `nodenext`.

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

- The package has two entries, built together so they share one copy of the core: `packages/forgeframe/src/index.ts` (`forgeframe`) defines the public exports, and `src/react.ts` (`forgeframe/react`) exports the React adapter. Other source barrels are internal.
- `core/component.ts` owns component factories and instance tracking. `core/consumer.ts` coordinates rendering, the prop pipeline, and transport; `core/host/` owns host bootstrap, the `Host` handle and the host's props.
- `communication/` owns request/response messaging and callback bridging. Transports hold their peer window and validate browser-provided sources and origins.
- `props/` owns schemas, normalization, and serialization. Each prop has one schema that must accept its own output unchanged, so every trust boundary revalidates normalized props with that same schema.
- `render/` owns iframe and popup resources and templates; `drivers/` holds the optional React adapter, published only through `forgeframe/react`. `packages/playground/` exercises the library as consumer and host.

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
| `npm run build && npm run typecheck:package` | ESM output and both entries' emitted declarations under NodeNext resolution |
| `npm run size` | Minified and gzipped size of each published entry (`forgeframe` and `forgeframe/react`, each with the shared chunks it imports) against its budgets in `packages/forgeframe/scripts/check-bundle-size.mjs`; run after `npm run build` |
| `npm run build:playground` | Consumer and host production builds |
| `npm run test:package` | Pack and install the built library in an isolated project; verify both entries' ESM imports, `require()` through the `default` condition, and NodeNext consumer types (root types checked before React is installed, and again with TypeScript 5.0, which it downloads); compile every README TypeScript example outside the migration guide. Mark a block that is not meant to compile with `<!-- readme-check: skip -->` on the line before it |
| `npm run release:check` | Lint, types, tests once with coverage, builds, bundle size, dependency audit, package dry run, and installed-package checks; does not publish |

See the [test index](https://github.com/jshsmth/ForgeFrame/blob/main/packages/forgeframe/tests/README.md) for suite selection and single-file commands. jsdom tests do not replace browser testing of cross-origin navigation, popup blockers, or visual behavior. `npm audit` needs registry access; if the audit service fails, the release check is incomplete even when the local checks pass.

Install browser engines with `npx playwright install chromium firefox webkit` before running `npm run test:browser`. CI installs their system dependencies and runs all three engines on Node 24. A release needs both the local checks and hosted CI to pass. WebKit covers the Safari engine, not physical Safari or devices.

Edit documentation in the root `README.md`. The library build copies it to `packages/forgeframe/README.md` for npm; commit the refreshed copy and do not edit it directly. TypeScript generates the declarations under `dist/`, and `scripts/fix-dts-imports.mjs` adjusts them for NodeNext consumers; do not edit them by hand.

### Release Workflow

Version preparation and publication are separate. The Release workflow publishes from CI through [npm trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token is stored and the package gets a provenance attestation.

1. Run `npm run version:patch`, `version:minor`, or `version:major` to update workspace metadata and the lockfile only. For an explicit version, use `npm version 2.0.1 -w forgeframe --no-git-tag-version`. These commands do not commit, tag, publish, or push. npm 11 re-indents `package-lock.json` with tabs; re-serialize it with 2-space indentation before committing.
2. Run `npm run release:check` and `npm run test:browser`, review the changes, and commit the intended release source and metadata. Verify hosted CI for that commit before releasing.
3. Create the matching annotated Git tag, such as `v2.0.1`, on that commit. Keep the working tree clean so the published files match the tagged source.
4. Push the release commit and its specific tag explicitly. The Release workflow runs in three jobs, each with only the permissions it needs. The verify job checks that the tag matches the package version, runs `npm run release:check` and the browser suite in all three engines, and packs the package; it has no npm or write access. The publish job, the only one that can authenticate to npm, publishes that tarball with `npm publish <tarball> --provenance --tag <dist-tag>`. The last job creates the GitHub release notes. Manual workflow runs must select the matching tag.

A version with a pre-release component, such as `2.1.0-beta.1`, publishes under the `next` dist-tag and its GitHub release is marked as a pre-release, so `npm install forgeframe` keeps resolving to the latest final version; install a pre-release with `npm install forgeframe@next`. Any other version publishes under `latest`. `packages/forgeframe/scripts/release-dist-tag.mjs` makes that choice. Moving `next` after a final release (`npm dist-tag add forgeframe@<version> next`) needs the owner's npm login, because trusted publishing authenticates only the workflow's publish.

If the workflow fails before anything reaches npm, fix the problem through a normal pull request, then recreate the tag on the fixed commit or use the next pre-release number. If npm published but a later step failed, do not publish again: create the GitHub release by hand from the tag. A published version number can never be reused; fix a bad release with a new patch version and deprecate the bad one if necessary.

Trusted publishing needs a one-time setup on npmjs.com: in the `forgeframe` package settings, add a trusted publisher for this GitHub repository with the workflow file `release.yml`. `npm run release` still publishes from a local machine after `npm run release:check`, without the browser suite, and that copy has no provenance.

There are no `release:patch`, `release:minor`, or `release:major` scripts, because workspace versioning does not create commits or tags. `npm run release:check` verifies locally without publishing or pushing.

---

## License

MIT
