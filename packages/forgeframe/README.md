# ForgeFrame

[![npm version](https://img.shields.io/npm/v/forgeframe.svg)](https://www.npmjs.com/package/forgeframe)
[![GitHub Release](https://img.shields.io/github/v/release/jshsmth/ForgeFrame)](https://github.com/jshsmth/ForgeFrame/releases)

A TypeScript-first framework for embedding cross-domain iframes and popups with seamless communication. Pass data and callbacks across domains for payment forms, auth widgets, third-party integrations, and micro-frontends. Zero runtime dependencies with an ESM build.

## Used By

<table cellpadding="16">
  <tr>
    <td align="center" bgcolor="#050505">
      <a href="https://www.tyrohealth.com/">
        <img src="https://www.tyrohealth.com/wp-content/themes/tyro/assets/img/tyro-health-logo.png" alt="Tyro Health" width="180">
      </a>
    </td>
  </tr>
</table>

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
- [API Reference](#api-reference)
- [TypeScript](#typescript)
- [Browser Support](#browser-support)

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

initHost(paymentProps, allowedConsumerDomains);
const { amount, onSuccess, close } = window.hostProps;

document.getElementById('total')!.textContent = `$${amount}`;
document.getElementById('pay-btn')!.onclick = async () => {
  await onSuccess({ transactionId: 'TXN_123' });
  await close();
};
```

That's it! ForgeFrame handles all the cross-domain communication automatically.
Before reading `window.hostProps` directly, call `initHost(propDefinitions, allowedConsumerDomains)` as shown in [Host Init with initHost](#host-init-with-inithost).
For intentionally open widgets, omit `allowedConsumerDomains`; for payment, auth, or account flows, use an allowlist.

---

## Step-by-Step Guide

### 1. Define a Component

> **`Consumer`**

Components are defined using `ForgeFrame.create()`. This creates a reusable component factory.

```typescript
import ForgeFrame, { prop } from 'forgeframe';

interface LoginProps {
  email?: string;
  onLogin: (user: { id: number; name: string }) => void;
  onCancel?: () => void;
}

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
- **`dimensions`**: Width and height of the iframe
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

initHost(loginProps, allowedConsumerDomains);
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
- **Host init**: Call `initHost(propDefinitions, allowedConsumerDomains)` before the first direct `window.hostProps` read. Use `allowedConsumerDomains` for security-sensitive embeds; omit it only for intentionally open widgets. If your host defines a component with `ForgeFrame.create(...)`, that component path still initializes the host runtime automatically.
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
    onSubmit: prop.function<(data: FormData) => void>(),
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
| `.default(value)` | Sets a default value (or factory function) |

### Schema Types

| Type | Factory | Methods |
|------|---------|---------|
| String | `prop.string()` | `.min()`, `.max()`, `.length()`, `.email()`, `.url()`, `.uuid()`, `.pattern()`, `.trim()`, `.nonempty()` |
| Number | `prop.number()` | `.min()`, `.max()`, `.int()`, `.positive()`, `.negative()`, `.nonnegative()` |
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
| `serialization` | Choose how object props are transferred: `JSON` (default), `BASE64`, or `DOTIFY` |
| `queryParam` / `bodyParam` | Include the prop in the host page's initial HTTP request |

- Use `sameDomain` for values that should never be exposed during cross-origin bootstrap.
- `DOTIFY` safely preserves nested object keys that contain separators such as `.`, `&`, or `=`.

### Passing Props via URL or POST Body (Advanced)

Use prop definition flags to include specific values in the host page's initial HTTP request:

```typescript
const Checkout = ForgeFrame.create({
  tag: 'checkout',
  url: 'https://payments.example.com/checkout',
  props: {
    sessionToken: { schema: prop.string(), queryParam: true }, // ?sessionToken=...
    csrf: { schema: prop.string(), bodyParam: true }, // POST body field "csrf"
    userId: { schema: prop.string(), bodyParam: 'user_id' }, // custom body field name
  },
});
```

- `queryParam`: appends to the URL query string for initial load.
- `bodyParam`: sends values in a hidden form `POST` for initial load (iframe and popup).
- `bodyParam` only affects the initial navigation; later `updateProps()` uses postMessage.
- Object values are JSON-stringified. Function and `undefined` values are skipped.
- Most apps do not need this unless the host server requires initial URL/body parameters.

### Updating Props

Props can be updated after rendering.

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

Built-in `window.hostProps` names are reserved. Consumer props with names such as
`uid`, `tag`, `close`, `focus`, `resize`, `show`, `hide`, `onProps`, `onError`,
`getConsumer`, `getConsumerDomain`, `export`, `consumer`, `getPeerInstances`, and
`children` are kept in `hostProps.consumer.props`, but they do not override the
top-level ForgeFrame methods and metadata exposed on `window.hostProps`.

---

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

initHost();
const { email, onLogin, close, resize } = window.hostProps!;
```

### Host Init with initHost

`initHost(propDefinitions?, allowedConsumerDomains?)` is required when your host bundle reads `window.hostProps` directly.
It consumes the initial ForgeFrame `window.name` payload, clears that payload after a successful parse, validates props when definitions are provided, and attaches `window.hostProps`.

Supported host boot patterns:
- Call `initHost(propDefinitions, allowedConsumerDomains)` during host startup, then read `window.hostProps`.
- Call `initHost(propDefinitions)` or `initHost()` only for hosts that are intentionally embeddable by any consumer origin.
- Define the host with `ForgeFrame.create(...)` and let component creation initialize the host runtime.

Use `initHost()` when:
- You read `window.hostProps` directly.
- Your host boot flow delays the first `window.hostProps` access (for example: lazy-loaded modules, async startup, or gated initialization).
- You want deterministic init timing in tests or instrumentation.
- You need the host side to enforce which consumer domains may embed or message it.

### Available Methods

```typescript
const props = window.hostProps;

props.email;
props.onLogin(user);
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

### Auto-Resize

Automatically resize based on host content.

```typescript
const AutoResizeComponent = ForgeFrame.create({
  tag: 'auto-resize',
  url: 'https://widgets.stripe.com/component',
  autoResize: { height: true, width: false, element: '.content' },
});
```

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
initHost(secureProps, [
  'https://myapp.com',
  'https://*.myapp.com',
  /^https:\/\/.*\.trusted\.com$/,
]);
```

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
const { children } = window.hostProps;
children.CardField({ onValid: () => {} }).render('#card-container');
```

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
ForgeFrame.initHost(props?, allowedConsumers?) // Required before direct window.hostProps access
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

```typescript
interface ComponentOptions<P> {
  tag: string;
  url: string | ((props: P) => string);
  dimensions?: { width?: number | string; height?: number | string } | ((props: P) => { width?: number | string; height?: number | string });
  autoResize?: { width?: boolean; height?: boolean; element?: string };
  props?: PropsDefinition<P>;
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
  children?: (opts: { props: P }) => Record<string, ForgeFrameComponent>;
}
```

### Instance Methods

```typescript
const instance = MyComponent(props);

await instance.render(container, context?)   // Render into a container (container is required)
await instance.renderTo(window, container?)  // Supports only current window; throws for other windows
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
  onSubmit: (data: FormData) => void;
}

const hostProps = {
  name: prop.string(),
  onSubmit: prop.function<(data: FormData) => void>(),
};

const allowedConsumerDomains = ['https://app.example.com'];

declare global {
  interface Window {
    hostProps?: HostProps<MyProps>;
  }
}

initHost(hostProps, allowedConsumerDomains);
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

## License

MIT
