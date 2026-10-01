# ForgeFrame

[![npm version](https://img.shields.io/npm/v/forgeframe.svg)](https://www.npmjs.com/package/forgeframe)
[![GitHub Release](https://img.shields.io/github/v/release/jshsmth/ForgeFrame)](https://github.com/jshsmth/ForgeFrame/releases)

A TypeScript-first framework for embedding cross-domain iframes and popups with seamless communication. Pass data and callbacks across domains for payment forms, auth widgets, third-party integrations, and micro-frontends. Zero runtime dependencies with an ESM build.

## Used By

<a href="https://www.tyrohealth.com/">
  <img src="https://raw.githubusercontent.com/jshsmth/forgeframe/main/docs/assets/tyro-health-used-by.png" alt="Tyro Health" width="220">
</a>

### Terminology

ForgeFrame involves two sides:

**Consumer** — The outer app that renders the iframe and passes props into it

**Host** — The inner app running inside the iframe that receives props via `window.hostProps`

#### Real-world example

Imagine a payment company (like Stripe) wants to let merchants embed a checkout form:

| | Consumer | Host |
|--|----------|------|
| **Who builds it** | Merchant (e.g., `shop.com`) | Payment company (e.g., `stripe.com`) |
| **What they do** | Embeds the checkout, receives `onSuccess` | Provides the checkout UI, calls `onSuccess` when paid |
| **Their domain** | `shop.com` | `stripe.com` |

```
┌─────────────────────────────────────────────────────────────────┐
│  Consumer (merchant's site - shop.com)                          │
│                                                                 │
│  Checkout({ amount: 99, onSuccess: (payment) => {               │
│    // Payment complete! Fulfill the order                       │
│  }}).render('#checkout-container');                             │
│                         │                                       │
│                         ▼                                       │
│      ┌──────────────────────────────────────────────┐           │
│      │  Host (payment form - stripe.com)            │           │
│      │                                              │           │
│      │  const { amount, onSuccess, close }          │           │
│      │    = window.hostProps;                       │           │
│      │                                              │           │
│      │  // User enters card, pays...                │           │
│      │  onSuccess({ paymentId: 'xyz', amount });    │           │
│      │  close();                                    │           │
│      └──────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

#### Which side are you building?

| If you want to... | You're building the... |
|-------------------|------------------------|
| Embed someone else's component into your app | **Consumer** |
| Build a component/widget for others to embed | **Host** |
| Build both sides (e.g., your own micro-frontends) | **Both** |

---

## Table of Contents

- [Installation](#installation)
- [Start Here (Most Users)](#start-here-most-users)
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
- [Migrating from pre-v1 to v1](#migrating-from-pre-v1-to-v1)
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

## Start Here (Most Users)

Use this path for typical integrations:

1. Follow [Quick Start](#quick-start) to get a working component.
2. Use [Step-by-Step Guide](#step-by-step-guide) to add typed props and callbacks.
3. Use [Props System](#props-system) and [Host Window API (hostProps)](#host-window-api-hostprops) as your primary references.
4. Treat sections marked **Advanced** as optional unless you specifically need them.

---

## Quick Start

> **`Consumer`**

```typescript
import ForgeFrame, { prop } from 'forgeframe';

const PaymentForm = ForgeFrame.create({
  tag: 'payment-form',
  url: 'https://checkout.stripe.com/payment',
  dimensions: { width: 400, height: 300 },
  props: {
    amount: prop.number(),
    onSuccess: prop.function<(txn: { transactionId: string }) => void>(),
  },
});

const payment = PaymentForm({
  amount: 99.99,
  onSuccess: (txn) => console.log('Payment complete:', txn),
});

await payment.render('#payment-container');
```

> **`Host`**

```typescript
import { initHost, prop, type HostProps } from 'forgeframe';

interface PaymentProps {
  amount: number;
  onSuccess: (txn: { transactionId: string }) => void;
}

const paymentProps = {
  amount: prop.number(),
  onSuccess: prop.function<(txn: { transactionId: string }) => void>(),
};

const allowedConsumerDomains = ['https://shop.example.com'];

declare global {
  interface Window {
    hostProps: HostProps<PaymentProps>;
  }
}

await initHost(paymentProps, allowedConsumerDomains)?.ready;
const { amount, onSuccess, close } = window.hostProps;

document.getElementById('total')!.textContent = `$${amount}`;
document.getElementById('pay-btn')!.onclick = async () => {
  await onSuccess({ transactionId: 'TXN_123' });
  await close();
};
```

That's it! ForgeFrame handles all the cross-domain communication automatically.
Before reading props, await `initHost(propDefinitions, allowedConsumerDomains)?.ready` as shown in [Host Init with initHost](#host-init-with-inithost).
For intentionally open widgets, omit `allowedConsumerDomains`; for payment, auth, or account flows, use an allowlist.

---

## Step-by-Step Guide

### 1. Define a Component

> **`Consumer`**

Components are defined using `ForgeFrame.create()`. This creates a reusable component factory.

```typescript
import ForgeFrame, { prop } from 'forgeframe';

type LoginProps = {
  email?: string;
  onLogin: (user: { id: number; name: string }) => void;
  onCancel?: () => void;
};

const LoginForm = ForgeFrame.create<LoginProps>({
  tag: 'login-form',
  url: 'https://auth.stripe.com/login',
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

- **`tag`** (required): Unique identifier for the component
- **`url`** (required): URL of the host page to embed
- **`dimensions`**: Width and height of the iframe or popup. Iframes accept CSS units; popups accept numbers, numeric strings, or `px` strings. Other CSS units use the popup fallback of 500 pixels per dimension (or the current size during resize).
- **`props`**: Schema definitions for props passed to the host

</details>

### 2. Create the Host Page

> **`Host`**

The host page runs inside the iframe at the URL you specified. It receives props via `window.hostProps`.

```typescript
import { initHost, prop, type HostProps } from 'forgeframe';

interface LoginProps {
  email?: string;
  onLogin: (user: { id: number; name: string }) => void;
  onCancel?: () => void;
}

const loginProps = {
  email: prop.string().optional(),
  onLogin: prop.function<(user: { id: number; name: string }) => void>(),
  onCancel: prop.function().optional(),
};

const allowedConsumerDomains = ['https://app.example.com'];

declare global {
  interface Window {
    hostProps: HostProps<LoginProps>;
  }
}

await initHost(loginProps, allowedConsumerDomains)?.ready;
const { email, onLogin, onCancel, close } = window.hostProps;

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
```

<details>
<summary>Explanation</summary>

- **`HostProps<LoginProps>`**: Combines your props with built-in methods (`close`, `resize`, etc.)
- **Host init**: Await `initHost(propDefinitions, allowedConsumerDomains)?.ready` before reading props. Use `allowedConsumerDomains` for security-sensitive embeds; omit it only for intentionally open widgets. If your host defines a component with `ForgeFrame.create(...)`, that component path still initializes the host runtime automatically.
- **`window.hostProps`**: Contains all props passed from the consumer plus built-in methods
- **`close()`**: Built-in method to close the iframe/popup

</details>

### 3. Render the Component

> **`Consumer`**

Back in your consumer app, create an instance with props and render it.

```typescript
const login = LoginForm({
  email: 'user@example.com',
  onLogin: (user) => console.log('User logged in:', user),
  onCancel: () => console.log('Login cancelled'),
});

await login.render('#login-container');
```

Calling `close()` while `render()` is still in flight cancels the render, removes
its loading and host artifacts, and prevents any not-yet-opened iframe or popup
from opening. The render promise rejects with
`Component "<tag>" was closed before rendering completed`.

Relative component URLs use `document.baseURI`, including any `<base href>` in
the consumer page. Rendering validates and pins the resolved absolute URL before
loading callbacks run; that same destination is used for navigation and prop
delivery checks. Changing the document base during a callback cannot redirect
the initial request.

### 4. Handle Events

> **`Consumer`**

Subscribe to lifecycle events for better control.

```typescript
const instance = LoginForm({ /* props */ });

instance.event.on('rendered', () => console.log('Login form is ready'));
instance.event.on('close', () => console.log('Login form closed'));
instance.event.on('error', (err) => console.error('Error:', err));
instance.event.on('resize', (dimensions) => console.log('New size:', dimensions));

await instance.render('#container');
```

**Available Events:**

| Event | Description |
|-------|-------------|
| `render` | Rendering started |
| `rendered` | Fully rendered and initialized |
| `prerender` | Prerender (loading) started |
| `prerendered` | Prerender complete |
| `display` | Component became visible |
| `close` | Component is closing |
| `destroy` | Component destroyed |
| `error` | An error occurred |
| `props` | Props were updated |
| `resize` | Component was resized |
| `focus` | Component received focus |

If all you need is embed + typed props + callbacks, you can stop here and use the API reference as needed.

---

## Props System

ForgeFrame uses a fluent, Zod-like schema API for defining props. All schemas implement [Standard Schema](https://standardschema.dev/), enabling seamless integration with external validation libraries.

### Defining Props

Props define what data can be passed to your component.

```typescript
import ForgeFrame, { prop } from 'forgeframe';

const MyComponent = ForgeFrame.create({
  tag: 'my-component',
  url: 'https://widgets.stripe.com/component',
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
| `onSubmit` | Functions are automatically serialized for cross-domain calls |
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
| `themeId` | `prop.union(...)` preserves type-safe multi-type props |
| `user` | `.shape({...})` defines nested object structure |

</details>

### Prop Schema Methods

All schemas support these base methods:

| Method | Description |
|--------|-------------|
| `.optional()` | Makes the prop optional (accepts `undefined`) |
| `.nullable()` | Accepts `null` values |
| `.default(value)` | Sets a non-callable default value or a factory that returns the default |

Function defaults use a factory that returns the callback. ForgeFrame evaluates the factory when the input is omitted; it does not invoke the returned callback during default resolution. Invalid callback factory results fail schema validation. Optional/nullable schemas continue to accept their declared presence values.

```typescript
const onCancel = () => console.log('Cancelled');
const callbackSchema = prop.function<() => void>().default(() => onCancel);
```

For integrations upgrading from 1.0.1, replace direct callback defaults such as `.default(onCancel)` with `.default(() => onCancel)`. The stricter types now reject previously ambiguous callback defaults. Capacity exhaustion now produces an explicit error instead of silently breaking older callbacks.

### Callback Capacity

Each delivered props or exports snapshot supports up to **500 distinct callbacks** per bridge. Reusing the same callback in multiple fields counts once. Oversized snapshots reject without evicting existing callable references. Successful updates retire callbacks absent from the new snapshot after acknowledgement.

During replacement, the previous snapshot remains callable while new references are staged. A serialization failure removes only new registrations. A delivery failure may occur after the receiver installed the new snapshot, so both old and potentially delivered references remain callable within a **1,000-reference recovery pool**. Once that pool is full, additions reject until an acknowledged retry using retained callbacks, a new host session, or teardown releases capacity. Transport failures retain the existing consumer snapshot commitment behavior; they do not roll back local props.

Peer discovery uses a separate relay registry with a cumulative **500-reference** limit for the requesting host session. Repeated discovery reuses retained identities and preserves held peer snapshots; an overflowing discovery rejects as a whole. Reconnection clears old relay identities. Source export replacement still retires the original exported callbacks.

### Schema Types

Enum schemas retain the allowed values supplied at creation. Changing the original array does not change validation or the constraints retained by `.optional()`, `.nullable()`, and `.default()`.

Shaped object schemas validate own fields. An omitted field is treated as `undefined`, so optional fields and defaults work even for names such as `constructor` and `toString`; inherited values are not supplied as schema inputs.

Arrays sent as props or exports require defined entries after normalization. `undefined` entries and sparse holes are rejected instead of silently becoming `null`, including in nested arrays. Use `prop.string().nullable()` with `null`, or an item default such as `prop.array().of(prop.string().default('fallback'))`. Standalone schema validation still accepts optional array entries; props excluded by `sendToHost`, `sameDomain`, or `trustedDomains` retain their local values.

Ordinary normalized prop arrays are checked before opening the host or committing an update, so a rejected update preserves the previous snapshot. Values produced by `hostDecorate` or custom `toJSON()` encoders (including computed encoder properties) are checked during delivery; those failures retain the existing consumer snapshot commitment. A non-callable `toJSON` field is ordinary data. DOTIFY traverses root own properties and nested plain objects directly, invoking JSON encoders only on encoded leaves. Use BASE64 when a root object's `toJSON()` should determine its delivered value; an encoder returning `undefined` omits that prop. Literal and enum rejection messages format arbitrary inputs without invoking their JSON encoders, allowing later union branches to validate them.

`prop.string().url()` requires a parseable absolute HTTP(S) URL and preserves the supplied string. It composes with `.pattern()` and `.trim()`; trimming changes the returned string only when requested.

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

### Using Standard Schema Libraries

ForgeFrame accepts any [Standard Schema](https://standardschema.dev/) compliant library (Zod, Valibot, ArkType, etc.):

```typescript
import ForgeFrame from 'forgeframe';
import { z } from 'zod';
import * as v from 'valibot';

const MyComponent = ForgeFrame.create({
  tag: 'my-component',
  url: 'https://widgets.stripe.com/component',
  props: {
    email: z.string().email(),
    user: z.object({ name: z.string(), role: z.enum(['admin', 'user']) }),
    count: v.pipe(v.number(), v.minValue(0)),
  },
});
```

Note: ForgeFrame runs schema validation synchronously. Schemas with async `~standard.validate` are not supported.

`prop.number()` rejects `NaN`, `Infinity`, and `-Infinity`. Nonfinite initial values and updates fail validation before delivery, preventing JSON transport from silently converting them to `null`. This tightens previously accepted nonfinite inputs.

### Advanced Prop Definitions

Use the object form when a prop needs transport rules in addition to validation.

```typescript
import ForgeFrame, { prop, PROP_SERIALIZATION } from 'forgeframe';

const SecureWidget = ForgeFrame.create({
  tag: 'secure-widget',
  url: 'https://widgets.example.com/secure',
  props: {
    profile: {
      schema: prop.object(),
      serialization: PROP_SERIALIZATION.DOTIFY,
    },
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
| `sameDomain` | Only deliver the prop after the loaded host is verified to be same-origin. It is not included in the initial bootstrap payload |
| `trustedDomains` | Only send the prop to matching host domains |
| `serialization` | Choose how object props are transferred: `JSON` (default), `BASE64`, or `DOTIFY`; all three bridge nested callbacks and preserve `Date` values |
| `queryParam` / `bodyParam` | Include the prop in the host page's initial HTTP request |
| `alias` | Accept a backwards-compatible input name. Alias links through other defined props resolve transitively; an explicitly supplied canonical key wins at that level. Only own input properties count as supplied values |
| `outputSchema` | Validate the normalized value again at consumer and host trust boundaries without transforming it |

Wrapped `default` and `value` fallbacks are schema inputs. ForgeFrame validates
and transforms them before any decorator, validator, URL, or transport callback
can observe the normalized output. A default configured directly on the schema
remains a schema-owned output.

When an input schema changes the value's type, wrap it and provide an
`outputSchema`, including when `sendToHost` is `false`. The input schema parses
consumer values and fallbacks; the output schema independently checks the
normalized value before consumer routing callbacks or host trust boundaries
use it. Output schemas are validation-only and must not transform their input.

```typescript
import { z } from 'zod';

const AmountComponent = ForgeFrame.create({
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

Direct schemas remain the concise form when the same schema can validate its
normalized output unchanged. A type-changing transform must use the wrapped
form above. A same-type but non-idempotent transform must also declare an
`outputSchema`; otherwise the host rejects the changed value rather than
silently trusting it.

TypeScript consumers can model alias inputs separately from the canonical props received by the host:

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

const Widget = ForgeFrame.create<
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

Factories, prop updates, and React wrappers accept either the canonical schema
input shape or the configured alternate input shape. Normalized host props are
not treated as consumer inputs when a schema transform changes their type.

The alternate input type may also be a subset of the canonical props when one
canonical key doubles as another prop's alias.

`required: true` requires a consumer input, not a defined normalized output. If
a valid input can transform to `undefined`, its `outputSchema` must explicitly
accept `undefined`; the host then treats that as a valid normalized result.

Definitions with `sendToHost: false` validate consumer input only. Shared host definitions exclude these fields from bootstrap and update validation, so a required local prop does not prevent host initialization. Origin restrictions on delivered props continue to apply.

Prefer inferred component and React-wrapper types. If you explicitly annotate
an aliased component whose schema inputs differ from its host props, supply the
canonical schema-input type as the fifth `ForgeFrameComponent` generic, after
the required-props flag (or the fourth `ForgeFrameComponentInstance` generic).
React wrappers normally infer this; with explicit wrapper type arguments, it is
the sixth generic.

- Use `sameDomain` for values that should never be exposed during cross-origin bootstrap.
- `DOTIFY` safely preserves nested object keys that contain separators such as `.`, `&`, or `=`.
- Ordinary objects with transport-like marker fields and additional user fields remain data in all three serialization modes.

Date props and exports preserve genuine dates created in another browser window. Record schemas also accept ordinary dictionaries from another window while continuing to reject class instances. Numeric iframe styles use pixels for lengths and retain numbers for unitless CSS properties; custom property names remain case-sensitive.

### Passing Props via URL or POST Body (Advanced)

Use prop definition flags to include specific values in the host page's initial HTTP request:

```typescript
const Checkout = ForgeFrame.create({
  tag: 'checkout',
  url: 'https://payments.example.com/checkout',
  props: {
    checkoutId: { schema: prop.string(), queryParam: true }, // ?checkoutId=...
    requestNonce: { schema: prop.string(), bodyParam: true }, // POST body field
    userId: { schema: prop.string(), bodyParam: 'user_id' }, // custom body field name
  },
});
```

- `queryParam`: appends to the URL query string before any `#fragment`, preserving existing query parameters and fragment text.
- `bodyParam`: sends values in a hidden form `POST` for initial load (iframe and popup).
- Custom POST field names may include `submit`, `remove`, and `appendChild`; these names do not interfere with submission or cleanup.
- `bodyParam` only affects the initial navigation; later `updateProps()` uses postMessage.
- Object values are JSON-stringified. Function and `undefined` values are skipped.
- Never put credentials, bearer tokens, session identifiers, or sensitive personal data in `queryParam`; URLs commonly leak through browser history, referrers, analytics, and server logs.
- `sendToHost`, `sameDomain`, and `trustedDomains` are enforced for query and body parameters as well as postMessage props. Because same-origin status is not verified until the host loads, `sameDomain` props are never included in the initial request.
- Most apps do not need this unless the host server requires initial URL/body parameters.

### Updating Props

Props can be updated after rendering. Once `close()` starts, new and queued updates reject; queued updates do not start validation or emit prop callbacks after teardown.

Updates also work before rendering and run in order, including updates requested
inside decorators or validators. Rendering waits for updates already queued so
initial query/body parameters and bootstrap props use the resulting snapshot.
New updates requested while rendering remain rejected.

```typescript
const instance = MyComponent({ name: 'Initial' });
await instance.render('#container');
await instance.updateProps({ name: 'Updated' });
```

The host receives updates via `onProps`:

```typescript
window.hostProps.onProps((newProps) => {
  console.log('Props updated:', newProps);
});
```

Host subscribers are invoked in registration order after props are committed.
Thrown errors and rejected promises are caught and logged. Async subscribers are
not awaited, so their work does not delay other subscribers or update acknowledgements.

Built-in `window.hostProps` names are reserved. Consumer props with names such as
`uid`, `tag`, `close`, `focus`, `resize`, `show`, `hide`, `onProps`, `onError`,
`getConsumer`, `getConsumerDomain`, `export`, `consumer`, `getPeerInstances`, and
`children` are kept in `hostProps.consumer.props`, but they do not override the
top-level ForgeFrame methods and metadata exposed on `window.hostProps`.

---

### Cross-window callback values

A callback implementation may return synchronously, but calling it from the other window always returns a promise. This applies to callbacks in `hostProps`, `hostProps.consumer.props`, `onProps` snapshots, and methods in `instance.exports`. The exported `RemoteValue<T>` type describes that remote view, including callbacks nested in objects and arrays.

For generic or overloaded callbacks, declare every call signature with a `Promise` return type and use an async implementation. This preserves TypeScript's overloads and relationships between arguments and results; automatic conversion of synchronous signatures cannot preserve those relationships.

```typescript
// Consumer definition: the local implementation can be synchronous.
const Counter = ForgeFrame.create({
  tag: 'counter',
  url: 'https://widgets.example.com/counter',
  props: { getCount: prop.function<() => number>() },
});
const counter = Counter({ getCount: () => 42 });
await counter.render('#container');

// Host: use await even though getCount's local implementation returns a number.
const count = await window.hostProps.getCount();
```

Callback arguments and results use JSON serialization. Pass plain objects, arrays, strings, finite numbers, booleans, and `null`; a callback may also return `undefined` for no result. Convert `Date` values to ISO strings and extract plain fields from `FormData` before calling a remote function. Functions passed as arguments or returned by callbacks are not bridged. Cyclic objects and `BigInt` results reject with a serialization error. This differs from prop snapshots and `hostProps.export(...)`, which explicitly bridge functions and preserve `Date` values.

## Host Window API (hostProps)

In host windows, `window.hostProps` provides access to props and control methods.

When rendering in iframe mode, ForgeFrame applies a default sandbox of
`allow-scripts allow-same-origin allow-forms allow-popups` unless you explicitly
set `attributes.sandbox` on the consumer component. An explicit `sandbox` value is
used as-is.

### TypeScript Setup

```typescript
import { initHost, type HostProps } from 'forgeframe';

interface MyProps {
  email: string;
  onLogin: (user: { id: number }) => void;
}

declare global {
  interface Window {
    hostProps?: HostProps<MyProps>;
  }
}

await initHost()?.ready;
const { email, onLogin, close, resize } = window.hostProps!;
```

### Host Init with initHost

`initHost(propDefinitions?, allowedConsumerDomains?)` is required when your host bundle reads `window.hostProps` directly.
It reads channel metadata from `window.name`, requests initial props through origin-checked messaging, validates the received props, and attaches `window.hostProps`. Await the returned host's `ready` promise before reading consumer props or nested children. Initialization errors reject `ready`.

Only channel metadata remains in `window.name`, allowing reloads and subsequent host documents to reconnect and receive the latest props. Browser policies that clear window names across sites can still prevent reconnection. `initHost()` returns `null` outside a ForgeFrame host window; handle that case if the page also supports standalone use.

Calling the returned host's `destroy()` disposes its runtime and removes `window.hostProps`. When the channel metadata is still available, a later `initHost()` creates a fresh runtime; await its new `ready` promise before using props or controls.

Supported host boot patterns:

- Call `initHost(propDefinitions, allowedConsumerDomains)` during host startup, await the returned host's `ready`, then read `window.hostProps`.
- Call `initHost(propDefinitions)` or `initHost()` only for hosts that are intentionally embeddable by any consumer origin.
- Define the host with `ForgeFrame.create(...)` and let component creation initialize the host runtime, then await `initHost()?.ready` before reading props.

When a shared definition uses a type-changing schema, carry both the normalized
host props and schema-input shapes through `HostPropsDefinition` and `initHost`.
This keeps the required normalized `outputSchema` visible to TypeScript:

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

await initHost<AmountProps, AmountInputs>(amountProps, allowedConsumerDomains)?.ready;
```

Use `initHost()` when:
- You read `window.hostProps` directly.
- Your host boot flow delays the first `window.hostProps` access (for example: lazy-loaded modules, async startup, or gated initialization).
- You want deterministic init timing in tests or instrumentation.
- You need the host side to enforce which consumer domains may embed or message it.

### Available Methods

```typescript
const props = window.hostProps;

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

Peer exports preserve data, `Date` values, and nested methods. Methods return promises and are relayed through the shared consumer. Cached methods survive unrelated prop updates. Rediscover peers after a sibling replaces its exports or reconnects; retired methods reject. Peer discovery uses the same bounded function registries as other callbacks.

<details>
<summary>Method Reference</summary>

| Method | Description |
|--------|-------------|
| `email`, `onLogin` | Your custom props and callbacks |
| `uid`, `tag` | Built-in identifiers |
| `close()` | Close the component |
| `focus()` | Request focus for iframe/popup |
| `resize()` | Resize the component |
| `show()`, `hide()` | Toggle visibility |
| `onProps()` | Listen for prop updates (returns `{ cancel() }`) |
| `onError()` | Report errors to consumer |
| `export()` | Export methods/data to consumer |
| `getConsumer()` | Get consumer window reference |
| `getConsumerDomain()` | Get consumer origin |
| `consumer.props` | Access consumer's props |
| `consumer.export()` | Send data to consumer from host context |
| `getPeerInstances()` | Get peer component instances from the same consumer |
| `children` | Nested component factories provided by consumer (if configured) |

</details>

### Exporting Data to Consumer

Host components can export methods/data for the consumer to use.

> **`Host`**

```typescript
await window.hostProps.export({
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

Use this section only when you need custom containers/loading UI beyond the default behavior.

### Container Template

Customize how the component container is rendered. Perfect for modals.

```typescript
const ModalComponent = ForgeFrame.create({
  tag: 'modal',
  url: 'https://widgets.stripe.com/modal',
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

Customize the loading state shown while the host loads.

```typescript
const MyComponent = ForgeFrame.create({
  tag: 'my-component',
  url: 'https://widgets.stripe.com/component',

  prerenderTemplate: ({ doc, dimensions }) => {
    const loader = doc.createElement('div');
    loader.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: ${dimensions.width}px;
        height: ${dimensions.height}px;
        background: #f5f5f5;
      ">
        <span>Loading...</span>
      </div>
    `;
    return loader.firstElementChild as HTMLElement;
  },
});
```

---

## React Integration (Optional)

### Basic Usage

```tsx
import React, { useState } from 'react';
import ForgeFrame, { prop, createReactComponent } from 'forgeframe';

const LoginComponent = ForgeFrame.create({
  tag: 'login',
  url: 'https://auth.stripe.com/login',
  dimensions: { width: 400, height: 350 },
  props: {
    email: prop.string().optional(),
    onLogin: prop.function<(user: { id: number; name: string }) => void>(),
  },
});

const Login = createReactComponent(LoginComponent, { React });

function App() {
  const [user, setUser] = useState(null);

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

The React component accepts all your component props plus:

| Prop | Type | Description |
|------|------|-------------|
| `onRendered` | `() => void` | Called when component is ready |
| `onError` | `(err: Error) => void` | Called on error |
| `onClose` | `() => void` | Called when closed |
| `context` | `'iframe' \| 'popup'` | Render mode |
| `className` | `string` | Container CSS class |
| `style` | `CSSProperties` | Container inline styles |
| `ref` | `React.Ref<HTMLDivElement>` | Access the wrapper's container element |

Construction and render failures are reported through `onError` and shown inside the wrapper without removing sibling React content. Changing `context` creates a fresh instance and can recover from a render failure; changing the wrapper's React `key` explicitly remounts it. The container ref stays attached while the error is displayed.

### Factory Pattern

For multiple components, use `withReactComponent`:

```tsx
import { withReactComponent } from 'forgeframe';

const createComponent = withReactComponent(React);

const LoginReact = createComponent(LoginComponent);
const PaymentReact = createComponent(PaymentComponent);
const ProfileReact = createComponent(ProfileComponent);
```

---

## Advanced Features

Most integrations can skip this section initially and return only when a specific requirement appears.

### Popup Windows

Render as a popup instead of iframe.

```typescript
await instance.render('#container', 'popup');

const PopupComponent = ForgeFrame.create({
  tag: 'popup-component',
  url: 'https://widgets.stripe.com/popup',
  defaultContext: 'popup',
});
```

After the popup initializes, ForgeFrame removes its loading content and default
loading wrapper from the consumer mount. Caller-owned elements and custom
container-template shells remain; custom prerender content is removed as it is
for iframe rendering.

### Domain Security

Restrict which domains can embed or communicate.
String domain patterns support `*` wildcards (for example, `'https://*.myapp.com'`), and arrays can mix strings and `RegExp`.

- `domain` is consumer-side trust: it restricts which host origins the consumer will message.
- `allowedConsumerDomains` is host-side trust: it restricts which consumer origins may embed and initialize the host.
- Use both for payment, auth, account, or other sensitive workflows.

```typescript
const secureProps = {
  accountId: prop.string(),
  onComplete: prop.function<(result: { ok: true }) => void>(),
};

const SecureComponent = ForgeFrame.create({
  tag: 'secure',
  url: 'https://secure.stripe.com/widget',
  props: secureProps,
  domain: 'https://secure.stripe.com',
  allowedConsumerDomains: [
    'https://myapp.com',
    'https://*.myapp.com',
    /^https:\/\/.*\.trusted\.com$/,
  ],
});
```

On the host page, pass the same host prop definitions and the consumer allowlist into `initHost`:

```typescript
await initHost(secureProps, [
  'https://myapp.com',
  'https://*.myapp.com',
  /^https:\/\/.*\.trusted\.com$/,
])?.ready;
```

The host verifies the consumer through a response from the expected parent/opener window and exact origin. This works with `no-referrer` and after full-page host navigation. An invalid origin or a consumer that cannot complete the verified handshake prevents initialization.

ForgeFrame 1.x follows semantic versioning for its public API. Review the migration guide and GitHub release notes before upgrading from a pre-v1 release; upgrade consumer and host bundles together when adopting changed wire behavior.

### Eligibility Checks

Conditionally allow rendering.

```typescript
const FeatureComponent = ForgeFrame.create({
  tag: 'feature',
  url: 'https://widgets.stripe.com/feature',
  eligible: ({ props }) => {
    if (!props.userId) return { eligible: false, reason: 'User must be logged in' };
    return { eligible: true };
  },
});

if (instance.isEligible()) {
  await instance.render('#container');
}
```

### Nested Components

Define nested components that can be rendered from within the host.

> **`Consumer`**

```typescript
const ContainerComponent = ForgeFrame.create({
  tag: 'container',
  url: 'https://widgets.stripe.com/container',
  children: () => ({
    CardField: CardFieldComponent,
    CVVField: CVVFieldComponent,
  }),
});
```

> **`Host`**

```typescript
// Import or define the same child factories before initializing hostProps.
// Their schemas remain executable code and are never JSON-serialized.
import { CardFieldComponent, CVVFieldComponent } from './child-components';

await initHost(containerPropDefinitions, allowedConsumerDomains)?.ready;
const { children } = window.hostProps;
children.CardField({ onValid: () => {} }).render('#card-container');
```

Each child tag must be registered in the host bundle before `hostProps` is initialized. Current hosts resolve executable validators, defaults, decorators, and regular expressions from that local registry instead of reconstructing them from JSON. Child metadata arrives through the verified bootstrap response. Nested child URLs must remain static strings.

---

## Migrating from pre-v1 to v1

This guide covers the published `0.2.0` release and earlier `0.x` integrations. The stable v1 release starts at `1.0.1`: npm permanently reserves `1.0.0` from an earlier publication that was removed. Install the same stable v1 version in both consumer and host projects, rebuild their bundles, and exercise create/render, prop updates, callbacks, exports, reconnects, and teardown before releasing them. The public package remains a single ESM entrypoint: import from `forgeframe`; internal source paths are not public APIs. Global script-tag or CommonJS consumers must use an ESM-aware build.

### Upgrade checklist

1. Await host readiness before reading initial props, children, or shared-factory `hostProps`:

   ```typescript
   import { initHost } from 'forgeframe';

   const host = initHost(propDefinitions, allowedConsumerDomains);
   if (!host) throw new Error('This page must be opened by ForgeFrame');
   await host.ready;
   const props = host.hostProps;
   ```

   Apply this to every host startup path, including hosts that also define the shared component. After a failed bootstrap, `initHost()` can retry on the same page; a successful retry refreshes the factory's props and controls.

2. Remove `undefined` array entries and sparse holes from deliverable props and exports. Use `null` with a nullable item schema or a defined item default. For example, replace `prop.array().of(prop.string().optional())` plus `[undefined]` with `prop.array().of(prop.string().nullable())` plus `[null]`, or with `prop.array().of(prop.string().default('fallback'))`. Item defaults run before transport admission. Standalone schema validation and props withheld by delivery policy still allow optional entries.
3. Check number props for `NaN` or infinities; `prop.number()` admits only finite values. Check URL schemas for absolute HTTP(S) URLs; `.url()` composes with `.pattern()` and preserves input spelling unless `.trim()` is requested.
4. Review callbacks and host exports as asynchronous remote calls. Await their returned promises, including nested methods. For generic or overloaded callbacks, declare promise-returning signatures and use async implementations. Callback arguments/results must be JSON-compatible; convert Dates to ISO strings. Props and `hostProps.export()` preserve Dates and bridge functions explicitly.
5. Run your host with its intended consumer origin allowlist. `domain` controls consumer trust in the host; `allowedConsumerDomains` controls host trust in consumers. They serve different sides of the integration.

### API, configuration, and behavior changes

| Area | v1 contract | Required action |
|------|-------------|-----------------|
| Array transport | Deliverable normalized arrays reject undefined entries and holes, including nested arrays, before opening a host or committing an update. Arrays produced by host decorators or custom JSON encoders are checked during delivery. | Supply defined entries or item defaults. Admission failures preserve the previous snapshot; delivery failures keep the committed consumer snapshot, as other transport failures do. |
| Ordinary object records | Objects resembling function, Date, BASE64, DOTIFY, or escaped-record markers remain ordinary data, including when extra undefined fields disappear on the wire or custom JSON encoders change the final record shape. | Upgrade both bundles to use the record escaping codec. Do not construct or interpret internal wire wrappers yourself. |
| DOTIFY omission | JSON encoders returning undefined omit their leaf, and nested objects emptied by omission remain empty objects. | Remove reliance on the old literal `"undefined"` leaf value or disappearance of emptied branches. Use explicit strings or null when those values are intended. |
| Schema inputs and outputs | Explicit undefined differs from omission. Defaults/decorators run in definition order; own properties supply schema fields. Normalized values are revalidated at trust boundaries without applying transforms again. Type-changing input schemas require a validation-only `outputSchema`, including for local props. | Match definitions and host schemas to normalized outputs. Give type-changing schemas an `outputSchema` that validates without transforming. Model alternate input keys through the component input generic. |
| Component URLs | Static and computed destinations must resolve to HTTP(S) and match `domain`. Relative URLs resolve against the document base; rendered updates cannot change the host origin. | Use valid destinations and an explicit trust policy; create a new instance when switching origins. |
| Runtime configuration | Options must be an object; tags are lowercase strings; URLs are strings or functions; contexts are iframe or popup; timeouts are finite numbers from 0 through 2147483647 ms. | Correct invalid JavaScript configuration instead of relying on coercion or browser timer overflow. |
| Rendering and updates | `render()` and `renderTo()` require a container; cross-window render targets are unsupported. Concurrent renders share one operation. Updates serialize in FIFO order and reject while rendering. | Pass a container, await render, and await updates. Close old instances before replacing them. |
| Initial query/POST props | `sendToHost`, `sameDomain`, and `trustedDomains` govern delivery. Same-domain-only values are withheld from the initial navigation request. Custom converters retain their definition receiver. | Verify server bootstrap fields; keep secrets out of URLs and deliver protected data after verified bootstrap. |
| Iframe configuration | ForgeFrame owns `name`, `src`, and `srcdoc`; resizing updates the default clipping wrapper. | Remove those custom attributes and use `url`. Custom templates remain responsible for their own layout. |
| Nested components | Children are resolved through factories registered in the host bundle, preserving executable schemas rather than shipping them as JSON. Child URLs must be static strings. | Import or define every child before `initHost()`; remove computed child URLs. |
| Removed earlier options | The unused `autoResize` option and `AutoResizeOptions` export are absent. | Remove them; use explicit consumer or host resizing. |
| Server rendering | Package imports and component declarations are safe without browser globals. `isHost()`/`isEmbedded()` return false, `initHost()` returns null, and `getHostProps()` returns undefined. | Keep instance creation and rendering in browser lifecycle code. |
| Remote errors | Messages cross the bridge; remote stack traces do not. Invalid message envelopes are ignored. | Capture detailed diagnostics in the originating window; do not depend on remote stacks. |
| React adapter | Committed props synchronize per mounted instance; removed keys reset to their fallback. Obsolete or failed work cannot overwrite a newer mount. | Pass committed values and handle update errors through the adapter's error callback. Avoid mutating existing prop objects in place. |

### Bootstrap and data formats

v1 continues to use bootstrap protocol 2. Only channel metadata persists in `window.name`; props and child references arrive through a handshake that verifies the expected window and exact origin. This prevents a redirected host from reading props through the window name and supports reconnection after reload or navigation.

Upgrade both bundles together where possible. For staged upgrades, deploy hosts first: v1 hosts retain the legacy consumer reader for this migration, while v1 consumers require secure bootstrap and reject older hosts that cannot complete it. This reader remains intentionally bounded to host startup; the consumer must also be upgraded to obtain redirect protection. Marker-shaped records use a new escaped-record envelope, and DOTIFY uses prefixed, JSON-framed path arrays. Do not share such payloads with older decoders. No persisted application data needs conversion unless your application has stored internal ForgeFrame transport payloads; regenerate those from original application values with v1.

### Development and release tooling

Run `npm ci` with a supported Node version, then `npm run release:check` and `npm run test:browser`. The release check validates lint/formatting, types, coverage, library and playground builds, emitted declarations, dependency audit, package contents, and a clean installed-package runtime/type smoke check. Browser checks run Chromium, Firefox, and WebKit separately.

The old `release:patch`, `release:minor`, and `release:major` helpers are absent. Use `version:patch`, `version:minor`, or `version:major` for metadata preparation, commit the validated source, then explicitly tag and publish using the release workflow below. Versioning does not create commits or tags, and GitHub release creation does not publish to npm.

---

## API Reference

### ForgeFrame Object

```typescript
import ForgeFrame, { prop } from 'forgeframe';

ForgeFrame.create(options)        // Create a component
ForgeFrame.destroy(instance)      // Destroy an instance
ForgeFrame.destroyByTag(tag)      // Destroy all instances of a tag
ForgeFrame.destroyAll()           // Destroy all instances
ForgeFrame.isHost()               // Check if in host context
ForgeFrame.isEmbedded()           // Alias for isHost() - more intuitive naming
ForgeFrame.initHost(props?, allowedConsumerDomains?) // Await the returned host.ready before reading props
ForgeFrame.getHostProps()         // Get hostProps in host context
ForgeFrame.isStandardSchema(val)  // Check if value is a Standard Schema

ForgeFrame.prop                   // Prop schema builders (also exported as `prop`)
ForgeFrame.PROP_SERIALIZATION     // Prop serialization constants
ForgeFrame.CONTEXT                // Context constants (IFRAME, POPUP)
ForgeFrame.EVENT                  // Event name constants
ForgeFrame.PopupOpenError         // Popup blocker/open failures
ForgeFrame.VERSION                // Library version
```

### Component Options

`props` accepts direct Standard Schemas for concise definitions or full
`PropDefinition` objects when transport, alias, and lifecycle options are needed.

```typescript
interface ComponentOptions<P, I = P, SchemaInputs = I> {
  tag: string;
  url: string | ((props: P) => string);
  dimensions?: { width?: number | string; height?: number | string } | ((props: P) => { width?: number | string; height?: number | string });
  props?: PropsDefinition<P, SchemaInputs>;
  defaultContext?: 'iframe' | 'popup';
  containerTemplate?: (ctx: TemplateContext<P>) => HTMLElement | null;
  prerenderTemplate?: (ctx: TemplateContext<P>) => HTMLElement | null;
  domain?: DomainMatcher;                 // Consumer-side trusted host origins
  allowedConsumerDomains?: DomainMatcher; // Host-side allowed consumer origins
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

---

## TypeScript

ForgeFrame is written in TypeScript and exports all types.

```typescript
import ForgeFrame, {
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
  type HostProps,
  type StandardSchemaV1,
  type TemplateContext,
  type Dimensions,
  type EventHandler,
  type GetPeerInstancesOptions,
} from 'forgeframe';
```

### Typing Host hostProps

```typescript
import { initHost, prop, type HostProps } from 'forgeframe';

interface MyProps {
  name: string;
  onSubmit: (data: { email: string }) => void;
}

const hostProps = {
  name: prop.string(),
  onSubmit: prop.function<(data: { email: string }) => void>(),
};

const allowedConsumerDomains = ['https://app.example.com'];

declare global {
  interface Window {
    hostProps?: HostProps<MyProps>;
  }
}

await initHost(hostProps, allowedConsumerDomains)?.ready;
window.hostProps!.name;
window.hostProps!.onSubmit;
window.hostProps!.close;
window.hostProps!.resize;
```

---

## Browser Support

ForgeFrame ships ES2022 output. Use modern evergreen browsers or transpile the package for older targets in your consumer build pipeline.

**Note:** Internet Explorer is not supported. If you require IE-era compatibility, use [Zoid](https://github.com/krakenjs/zoid).

---

## Developing ForgeFrame

Use Node.js 24.15.0 or newer in the Node.js 24 line for local development; CI also checks Node.js 22.22.2 or newer in the Node.js 22 line. Node.js 26 and newer are also supported by the development tools. These minimum versions are required by jsdom 30 and apply to repository tooling. Run commands from the repository root:

```bash
npm ci
npm run dev
```

The playground starts the consumer at `https://localhost:5173` and the host at `https://localhost:5174`. Both use the library source directly, so a separate library build is unnecessary during development. The HTTPS setup uses `vite-plugin-mkcert` and may prompt to trust its local certificate authority on first use.

To run locally over HTTP without certificate setup:

```bash
FORGEFRAME_SKIP_MKCERT=1 VITE_HOST_URL=http://localhost:5174/ FORGEFRAME_PLAYGROUND_OPEN=0 npm run dev
```

Then open `http://localhost:5173`. The `/tests` page contains browser scenarios for iframe/popup handshakes, prop updates, callbacks, and lifecycle behavior. Use `npm run dev:consumer` or `npm run dev:host` to start the two servers separately. Set `VITE_HOST_URL` when the host runs at another address.

### Architecture and ownership

The playground displays cross-window prop values, identity fields, and log messages as text. When building a host UI, use `textContent` for received strings rather than interpolating them into HTML.

Read the [architecture guide](https://github.com/jshsmth/ForgeFrame/blob/main/docs/architecture.md) for state ownership and render/bootstrap, props, callback, and React flows. The [callable reference](https://github.com/jshsmth/ForgeFrame/blob/main/docs/iosp-review.md) classifies runtime responsibilities and links their boundary tests.

- `packages/forgeframe/src/index.ts` defines the public package exports. Other source barrels are internal; the package exposes no subpath imports.
- `core/component.ts` owns component factories and instance tracking. `core/consumer.ts` coordinates rendering, the prop pipeline, and transport; `core/host/` owns host bootstrap and `hostProps`.
- `communication/` owns request/response messaging and callback bridging. Transports retain their peer window directly and validate browser-provided sources and origins.
- `props/` owns schemas, normalization, and serialization. Schema input and normalized output are different contracts: repeated validation at trust boundaries protects mutated props and must not blindly reapply transformations.
- `render/` owns iframe/popup resources and templates; `drivers/` contains the optional React adapter. `packages/playground/` exercises the library as a consumer and host.

### Project wiki

Current project knowledge lives in the [development wiki](https://github.com/jshsmth/ForgeFrame/blob/main/docs/_index.md). It uses [Plasma Wiki](https://docs.plasma.ai/wiki/guide/index.html) to maintain Markdown metadata and navigation, with a dedicated GitHub Actions check for generated-index drift and wiki lint issues.

Install Python 3.11 or newer and the pinned CLI with `uv tool install plasma-wiki==1.4.0` (or `pipx install plasma-wiki==1.4.0`). Run `wiki map --path docs` to browse topics, `wiki search --path docs "callback"` for ranked lookup, and `wiki read architecture --path docs` to read a page. You can also read the Markdown files directly on GitHub or in an editor.

Edit page bodies and authored metadata such as `title` and `desc`. Run `npm run docs:update` after adding, moving, or editing pages, then `npm run docs:check` before committing. The generator owns names, timestamps, headings, and index link blocks above `***`; index prose belongs below that delimiter. The existing image assets are excluded from indexing. This setup needs no Obsidian vault, plugins, or executable wiki hooks.

Wiki tooling is a contributor dependency, separate from the npm package and its release checks. The Documentation workflow installs the same pinned CLI and checks without modifying files.

### Checks

Development uses TypeScript 7 and Biome with its default formatting and recommended lint rules. Run `npm ci` to install the pinned workspace tools; npm scripts use the local `tsc` and `biome` executables. Generated builds, coverage, and the npm lockfile are excluded from Biome. Markdown, YAML, and TOML are not formatted by these commands.

For VS Code, use the official Biome extension (`biomejs.biome`) for supported files and the TypeScript 7 language-service extension (`TypeScriptTeam.native-preview`) for native compiler editor support. Other editors should use their Biome and TypeScript 7 LSP integrations. The compiler upgrade is development tooling; it does not require consumers to upgrade to TypeScript 7.

Biome retains its recommended severities. Tests and playground bindings use explicit value guards so missing fixtures or elements fail instead of silently skipping assertions or actions. Intentional React effect signatures, prototype-safety fixtures, and CSS precedence overrides have local suppressions with explanations.

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
| `npm run build:playground` | Consumer and host production builds |
| `npm run test:package` | Pack and install the built library in an isolated project; verify ESM imports and NodeNext consumer types |
| `npm run release:check` | Lint, types, tests once with coverage, builds, dependency audit, package dry run, and installed-package checks; does not publish |

See the [test index](https://github.com/jshsmth/ForgeFrame/blob/main/packages/forgeframe/tests/README.md) for suite selection and single-file commands. jsdom checks do not replace browser testing of cross-origin navigation, popup blockers, or visual behavior. `npm audit` requires registry access; an audit service failure leaves the release check incomplete even when local checks pass.

Install browser engines with `npx playwright install chromium firefox webkit`
before running `npm run test:browser`. CI installs their system dependencies and
runs all three engines on Node 24. Local checks and hosted CI must both pass
before release readiness is established. WebKit covers the Safari engine;
physical Safari/device acceptance remains separate.

Edit the root `README.md` for documentation changes. The library build copies it to `packages/forgeframe/README.md` for npm publication; do not edit that copy separately. Commit the refreshed copy with documentation changes. Declaration files under `dist/` are generated by TypeScript and adjusted by `scripts/fix-dts-imports.mjs` for NodeNext consumers; do not edit them by hand.

### Release workflow

Version preparation and publication are separate:

1. Run `npm run version:patch`, `version:minor`, or `version:major` to update workspace metadata and the lockfile only. For an explicit version, use `npm version 1.0.2 -w forgeframe --no-git-tag-version`. These commands do not commit, tag, publish, or push.
2. Run `npm run release:check` and `npm run test:browser`, review the changes, and commit the intended release source and metadata. Verify hosted CI for that commit before releasing.
3. Create the matching Git tag, such as `v1.0.2`, on that commit. Keep the working tree clean so the published files match the tagged source.
4. Run `npm run release` to publish. The publishable workspace owns `prepublishOnly`, so both this command and `npm publish -w forgeframe` run the full checks before publication.
5. Push the release commit and its specific tag explicitly. The GitHub workflow requires the tag to match the package version, validates it, and creates release notes; it does not publish to npm. Manual workflow runs must select the matching tag.

The former `release:patch`, `release:minor`, and `release:major` helpers were removed because workspace versioning does not create the commits or tags those helpers assumed. Use `npm run release:check` for local verification without publishing or pushing.

---

## License

MIT
