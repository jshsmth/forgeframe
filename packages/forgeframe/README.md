# ForgeFrame

[![npm version](https://img.shields.io/npm/v/forgeframe.svg)](https://www.npmjs.com/package/forgeframe)
[![GitHub Release](https://img.shields.io/github/v/release/jshsmth/forgeframe)](https://github.com/jshsmth/forgeframe/releases)

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

The host starts with `initHost(Component, { consumerOrigins })`, reads its props from `await host.ready`, and calls controls such as `close()` on the `host` handle; see [Host Init with initHost](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/host-api.md#host-init-with-inithost). `consumerOrigins` is required. List the consumer origins for payment, auth, or account flows, and pass `'*'` only for widgets that any site may embed. `initHost()` returns `null` when the page is not opened by ForgeFrame.

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
- **`PropsOf<typeof LoginForm>`**: reads the props type back from the component; see [TypeScript](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/typescript.md).

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
import { LoginForm } from './login-form';

const login = LoginForm({
  email: 'user@example.com',
  onLogin: (user) => console.log('User logged in:', user),
  onCancel: () => console.log('Login cancelled'),
});

await login.render('#login-container');
```

See [Instance Lifecycle](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/api-reference.md#instance-lifecycle) for URL resolution and for closing an instance during rendering.

### 4. Handle Events

> **`Consumer`**

Subscribe to lifecycle events through `instance.event`. `on()` and `once()` return an unsubscribe function, and each handler receives a typed payload.

```typescript
import { LoginForm } from './login-form';

const instance = LoginForm({ onLogin: (user) => console.log('Signed in:', user.name) });

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

The [React guide](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/react.md) covers the wrapper props, the `instanceRef` handle, how prop changes reach the host, error recovery, server rendering, React Server Components and Preact.

---

## Origin Security

`initHost()` requires `consumerOrigins`, and a component with a function `url` requires `hostOrigins`. [Origin Security](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/advanced.md#origin-security) defines both options and covers the matcher syntax, verification and the iframe sandbox.

---

## Documentation

The reference guides live in the repository's [docs wiki](https://github.com/jshsmth/forgeframe/blob/main/docs/_index.md):

| Guide | What it covers |
|-------|----------------|
| [Props System](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/props.md) | Prop schemas and their methods, Standard Schema libraries, defaults and other advanced definitions, URL and POST body props, updating props, and callback values |
| [Host Window API](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/host-api.md) | `initHost()`, the `host` handle and its controls, deferred init, peer discovery, and exporting data to the consumer |
| [Templates](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/templates.md) | Container and prerender templates for custom wrappers and loading states |
| [React Integration](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/react.md) | Wrapper props, the `instanceRef` handle, prop syncing, server rendering, React Server Components and Preact |
| [Advanced Features](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/advanced.md) | Popup windows, origin security and the iframe sandbox, pre-render checks, and nested components |
| [TypeScript](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/typescript.md) | Type inference from schemas, the typing helpers, and typing the host |
| [API Reference](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/api-reference.md) | Exports, component options, instance methods, instance lifecycle, and iframe styles and loading |
| [Migrating from v1 to v2](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/migrating-v1-to-v2.md) | Every v1 to v2 change, with the v1 form, the v2 form and what to do |
| [Developing ForgeFrame](https://github.com/jshsmth/forgeframe/blob/main/docs/developing.md) | Repository setup, the playground, checks, the project wiki, and the release workflow |

---

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

ForgeFrame follows semantic versioning for its public API. Breaking changes ship only in a new major version; minor and patch releases add features and fix bugs without breaking existing callers. Error message text is not part of the API: branch on `ForgeFrameError.code` (see [Errors](#errors)). Read the [GitHub release notes](https://github.com/jshsmth/forgeframe/releases) before upgrading.

In 2.x:

- Minor releases may add error codes, lifecycle events, options and host controls. Existing failures keep their codes, so give every `switch` on `error.code` a `default` branch. A peer that receives a code its version does not know sees a plain `Error` with the message.
- A newer 2.x side may send a request an older 2.x side does not know; the older side answers `VERSION_MISMATCH` at once instead of timing out, so a feature the other side lacks fails fast. Run the same 2.x version on both sides when you can.
- Minimum supported versions (browsers, Node.js for tooling, TypeScript) move only in a minor release, and the release notes say so. 2.0.0 needs TypeScript 5.0 or later.
- A minor or patch release may tighten a type so that code which already failed at runtime stops compiling, as 2.1.0 did for `updateProps()` with `undefined` for a required prop. Runtime behavior that worked keeps working.

Upgrading:

- **From 1.x:** follow [Migrating from v1 to v2](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/migrating-v1-to-v2.md). Install the same 2.x version in the consumer and the host and deploy them together. A v2 host's `initHost()` throws an upgrade error when a 1.x consumer embeds it, and a v2 consumer's handshake timeout says to check that both sides run the same ForgeFrame major version when a 1.x host cannot start.
- **From 1.0.x:** read the [1.1.0 release notes](https://github.com/jshsmth/forgeframe/releases/tag/v1.1.0) first; the migration guide starts from 1.1.0.
- **From 0.x:** upgrade straight to 2.x with the migration guide. A v2 host refuses 0.x consumers the same way it refuses 1.x consumers.

---

## Migrating from v1 to v2

The [migration guide](https://github.com/jshsmth/forgeframe/blob/main/docs/guide/migrating-v1-to-v2.md) starts from ForgeFrame 1.1.0 and lists each change with the v1 form, the v2 form and what to do. Upgrade the consumer and the host together.

---

## Browser Support

ForgeFrame ships ES2022 output and uses `Object.hasOwn`, so it needs Chrome 93, Firefox 92, Safari 15.4 or later. Transpile and polyfill the package in your build pipeline for older targets. Its type declarations need TypeScript 5.0 or later, with `moduleResolution` set to `bundler`, `node16` or `nodenext`.

**Note:** Internet Explorer is not supported. If you require IE-era compatibility, use [Zoid](https://github.com/krakenjs/zoid).

---

## Developing ForgeFrame

[Developing ForgeFrame](https://github.com/jshsmth/forgeframe/blob/main/docs/developing.md) covers repository setup, the playground, the checks, the project wiki and the release workflow. The [architecture guide](https://github.com/jshsmth/forgeframe/blob/main/docs/architecture/_index.md) and [callable reference](https://github.com/jshsmth/forgeframe/blob/main/docs/callables/_index.md) describe the implementation.

---

## License

MIT
