---
name: guide/host-api
title: Host Window API
desc: initHost(), the host handle and its controls, deferred init, and exporting data to the consumer.
tags: []
sources: []
created: 2026-11-16T03:15:22Z
updated: 2026-11-16T03:15:22Z
---

# Host Window API

In a host window, `initHost()` returns a `host` handle with the host controls, and `await host.ready` resolves to the consumer's props alone. Both are typed from the component passed to `initHost`; see [Typing the host](typescript.md#typing-the-host).

Props come from another origin. Render received strings with `textContent` or other DOM text properties, never by interpolating them into HTML.

In iframe mode, ForgeFrame sets `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` unless the consumer component sets the `sandbox` option. A string is written as-is and must include `allow-scripts` and `allow-same-origin`; `sandbox: false` writes no sandbox attribute. `attributes` may not set `sandbox` in any letter case. Popups are never sandboxed, because `window.open()` cannot apply one. See [Sandbox](advanced.md#sandbox).

## Host Init with initHost

`initHost()` is the only way to start the host runtime. It reads channel metadata from `window.name`, checks the consumer origin against `consumerOrigins`, requests the initial props through origin-checked messaging, and validates them. It has two forms:

- `initHost(Component, { consumerOrigins, autoInit? })` takes the component returned by `create()`. It validates props with the component's schemas, infers their types, and throws if the window was opened for another component's tag.
- `initHost({ props?, consumerOrigins, autoInit? })` accepts a window opened for any tag, for hosts that serve many components. `props` are host prop definitions, and the host receives only the props they declare; without them, every delivered field is kept, unvalidated. With shared prop definitions, this form also keeps `create()` and the consumer runtime out of a size-sensitive host bundle.

`consumerOrigins` is required in both forms; omitting it throws in every environment, before `initHost()` looks for a consumer, so a host page cannot ship open by accident. It takes a string, a `RegExp`, or an array of them (see [Origin Security](advanced.md#origin-security)). Pass `'*'` only for a host that any site may embed. An empty array allows none, so configuration that resolves to no origins fails closed. A disallowed consumer makes `initHost()` throw before any props are requested.

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

`host.on('error')` reports each failed start once, always with a [`ForgeFrameError`](../../README.md#errors). A schema rejection reports its `VALIDATION` error. Any other failure, such as a failed BOOTSTRAP request or an invalid bootstrap response, reports an error whose message starts with `Failed to initialize host component:`, whose `cause` is the original failure, and whose code is the cause's, as INIT delivery failures do. A BOOTSTRAP or INIT request the consumer never answers is `INIT_TIMEOUT`. For a schema rejection, `host.ready` rejects with the same error; for a prefixed start-up error, it rejects with that error's `cause`, which has the same code. It rejects with `CLOSED` when the host is destroyed before bootstrap completes. When the consumer cannot send its first-render props, such as a `BigInt`, BOOTSTRAP fails and `host.ready` rejects with the consumer's `VALIDATION` error. INIT is sent after `ready` resolves, so a failed INIT reaches only the `error` event.

If the host's schemas reject the consumer's props, `ready` rejects and the host tells the consumer why. The consumer keeps waiting, so a same-page `initHost()` retry can still connect without any error being reported; if none succeeds, `render()` rejects at its `initTimeout` with `INIT_TIMEOUT`, whose message includes `Host initialization failed: ...` and whose `cause` is the host's error with its code, such as `VALIDATION`. The consumer's single `error` event carries the same error.

`host.destroy()` can be called more than once. The old handle's controls reject afterwards, and destroying a stale host never affects a newer one.

### Deferring INIT

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

## Available Methods

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

Peer discovery is opt-in. A component that sets `peers: 'same-origin'` in `create()` lets its hosts discover peers and is listed to other hosts verified at the same origin as its own host. Without `peers`, its instances are never listed, and its hosts' `getPeerInstances()` rejects with an error naming the component and the option. Peers are other instances rendered by the same consumer; `allTags: true` adds other component tags, still only those that set `peers`. To let hosts on other origins, such as sibling subdomains, discover a component's instances, set `peers` to an origin matcher instead of `'same-origin'`. Admission is one-way: the matcher on the listed component decides who may see it. Hosts with an opaque origin, such as sandboxed frames without `allow-same-origin`, neither discover peers nor are listed as peers, even when a matcher matches. `getPeerInstances()` resolves to `PeerInfo[]`, each with `uid`, `tag`, and `exports`. A peer whose host is still loading is listed without exports; call `getPeerInstances()` again once it is ready. Peer exports keep data, `Date` values, and nested methods; methods return promises and are relayed through the consumer. Method references survive unrelated prop updates. After a peer replaces its exports or reconnects, its old methods reject, so call `getPeerInstances()` again. Discovery counts toward the relay limit in [Callback Capacity](props.md#callback-capacity).

<details>
<summary>Method Reference</summary>

| Member | Description |
|--------|-------------|
| `props.email`, `props.onLogin` | Your custom props and callbacks, from `await host.ready` |
| `uid`, `tag` | This instance's identifiers |
| `close()` | Close the component |
| `focus()` | Request focus for iframe/popup; resolves once this window has focus, or after a short wait, so the host can then focus its own element. It resolves without waiting when the consumer page has no focus to pass on. WebKit ignores `focus()` on elements in a cross-origin iframe until that frame has user activation, which can arrive a few frames later, so check `document.activeElement` and retry if the focus must land |
| `resize()` | Resize the component |
| `show()`, `hide()` | Toggle visibility |
| `onProps()` | Listen for prop updates (returns an unsubscribe function) |
| `reportError()` | Report an error to the consumer, which emits it on its `error` event |
| `export()` | Export methods/data to consumer |
| `consumerOrigin` | The consumer origin (a read-only string), verified once `ready` resolves |
| `getPeerInstances()` | Get peer component instances from the same consumer and host origin; requires `peers` on this host's component |

</details>

## Exporting Data to Consumer

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
