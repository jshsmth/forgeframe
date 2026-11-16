---
name: guide/migrating-v1-to-v2
title: Migrating from v1 to v2
desc: Every v1 to v2 change, with the v1 form, the v2 form, and what to do.
tags: []
sources: []
created: 2026-11-16T03:15:22Z
updated: 2026-11-16T03:15:22Z
---

# Migrating from v1 to v2

This guide starts from ForgeFrame 1.1.0. Each section lists what changed, with the v1 form, the v2 form and what to do. TypeScript reports most of these changes at compile time, and a JavaScript caller that still passes a removed option gets a `VALIDATION` error that names its replacement.

## Upgrade consumer and host together

ForgeFrame 2 uses bootstrap protocol 3, and a v2 host accepts only v2 consumers. Install the same 2.x version in the consumer and host projects, rebuild both, and deploy them together. If you cannot deploy both at once, serve the v2 host at a new URL and point the v2 consumer at it while 1.x consumers keep using the old URL. The v1 staged upgrade ("deploy hosts first") no longer works.

A mixed deploy fails fast with a clear error instead of misbehaving:

| Consumer | Host | What happens |
|---|---|---|
| 1.x (or 0.x) | 2.x | The host's `initHost()` throws a `VERSION_MISMATCH` error that names the consumer's ForgeFrame version and says to upgrade the consumer and host to ForgeFrame 2 together. Nothing is sent to the consumer, whose `render()` times out. |
| 2.x | 1.x | The 1.x host cannot read the v2 channel metadata and never starts. The consumer's `render()` rejects with `INIT_TIMEOUT` after `initTimeout`, and the message says to check that consumer and host run the same ForgeFrame major version. |

`window.name` now holds only channel metadata (uid, tag, protocol, context and consumer origin). v1 never stored application data there either, so nothing needs converting.

TypeScript projects that use React support need `moduleResolution` set to `bundler`, `node16` or `nodenext`. The React adapter is published only as the `forgeframe/react` subpath export, which `node` (`node10`) resolution cannot find.

After upgrading, test both sides together: create and render, prop updates, callbacks in both directions, exports, reconnecting after a host reload, teardown, popups, and React mounts if you use them.

## Upgrade checklist

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

## Named imports only

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

## Host start-up and props

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

## Secure defaults

Allowlists are required, peers are opt-in, and the sandbox is a first-class option.

| Area | v1 | v2 | What to do |
|---|---|---|---|
| Host allowlist | `initHost` accepted any http(s) consumer when no allowlist was passed | `consumerOrigins` is required in every `initHost` form; `'*'` admits any http(s) consumer | Pass your consumer origins; pass `'*'` only for hosts meant to be embedded anywhere |
| Function URLs | `url: (props) => ...` without `domain` trusted any http(s) origin it returned | `create()` throws unless `hostOrigins` (v1 `domain`) is set when `url` is a function | Add the host origins the function may return, or `'*'` to keep the v1 behaviour |
| Peer discovery | On for every component at the same verified origin; `peerDomains` admitted other origins | Off unless the component sets `peers: 'same-origin'` or `peers: <matcher>`; `peerDomains` and `peers: true` throw; a host whose component lacks `peers` gets a rejection from `getPeerInstances()` | Add `peers` to every component whose hosts call `getPeerInstances()` and to every component they should find; move `peerDomains` values into `peers` |
| Exact origins | Entries such as `https://Shop.example.com`, `https://example.com:443` or `https://user@example.com` were accepted and never matched | `hostOrigins`, `consumerOrigins`, `peers` and `deliverTo` throw `VALIDATION`, naming the origin browsers report | Write origins as browsers report them: lowercase host, no default port, no userinfo |
| Origin wildcards | `*` matched any characters anywhere, so `https://*example.com` matched `https://evilexample.com`, and `*.example.com` without a scheme also matched `http://` | `*` stands only for leading host labels, as in `https://*.example.com`, and every pattern except `'*'` needs a scheme and no path; other wildcards throw | Rewrite patterns as `https://*.example.com`, or use a `RegExp` anchored with `^` and `$` |
| Cross-tag discovery | `getPeerInstances({ anyConsumer: true })` | `getPeerInstances({ allTags: true })`; `anyConsumer` rejects | Rename the option |
| Peer type | `SiblingInfo` | `PeerInfo` | Rename the import |
| Sandbox | `attributes.sandbox`; `false` kept the default | Top-level `sandbox: string \| false`; a string must include `allow-scripts` and `allow-same-origin`; `false` writes no sandbox attribute; `attributes.sandbox` throws | Move a string value from `attributes.sandbox` to `sandbox`. Delete `attributes.sandbox: false`, which kept the default in 1.1; `sandbox: false` now removes the sandbox, so use it only to opt out |
| Opaque origins | A `'*'` or match-all `domain` matched a sandboxed host's `"null"` origin before the handshake failed | No matcher admits an opaque origin | Keep `allow-same-origin` in any custom sandbox |
| Undeclared host fields | A host kept fields it did not declare, and fields of `undefined` definition entries, unvalidated | A host with `props` keeps only the props it declares; only a tag-agnostic host without `props` keeps every field | Declare every prop the host reads, with `prop.any()` for a deliberately unchecked one |
| Empty matchers | `domain: []`, `peerDomains: []` and `deliverTo: []` were accepted and matched nothing | `hostOrigins: []`, `peers: []` and `deliverTo: []` throw; `consumerOrigins: []` still admits no consumer | Remove the option, or list the origins |
| Static iframe attributes | `name`, `src` and `srcdoc` in a static `attributes` object rejected `render()` | `create()` throws for them, and for `sandbox`; a computed `attributes` function is still checked at render | Remove the attribute |
| `ComponentOptions` type | An interface | A type alias over `ComponentBaseOptions` and the `url`/`hostOrigins` union `ComponentUrlOptions`, so it can no longer be augmented by declaration merging; `Partial<ComponentOptions>` spreads over the union | Use `ComponentBaseOptions` for options other than `url` and `hostOrigins` |

## Lifecycle events

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

## Prop definitions

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

## Prop updates

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

## Naming and errors

Origins are called origins everywhere, and every error ForgeFrame raises is a `ForgeFrameError` with a `code`. See [Errors](../../README.md#errors) for the codes.

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

## React: `forgeframe/react`

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

## Types and inference

`create()` has one signature and takes no type arguments: props, factory input and exports are inferred from the schemas, and calling a factory without props fails to compile when a prop is required. Renamed types fail loudly instead of reinterpreting their parameters.

| Area | v1 | v2 | What to do |
|---|---|---|---|
| Explicit props type | `create<LoginProps>({ ... })` | `create({ ... })` | Derive the type with `type LoginProps = PropsOf<typeof LoginForm>`, or check definitions with `props: { ... } satisfies PropsDefinition<LoginProps>` |
| Explicit exports type | `create<Props, Exports>({ ... })` | `create({ ..., exports: prop.object({ ... }) })` | Declare an `exports` schema; read the type with `ExportsOf<typeof C>` |
| Input and alias generics | `create<P, X, I, SchemaInputs>`, `ConsumerPropsInput`, `ConsumerPropsUpdate` | Removed; the input is inferred | Use `InputOf<typeof C>` |
| Component type | `ForgeFrameComponent<P, X, I, RequireProps, SchemaInputs>` | `Component<Props, Input, Exports, HostProps>` | Use `typeof C`, or `<C extends AnyComponent>` for a generic helper. A hand-written `Component<P, I, X>` or `Component<P>` rejects a component with `sendToHost: false` or `deliverTo` props, because its host props differ; pass them as the fourth argument |
| Instance type | `ForgeFrameComponentInstance<P, X, I, SchemaInputs>` | `ComponentInstance<Props, Input, Exports>` | Rename the type |
| Host props type | `HostProps<P>` with a hand-written `P`, including the controls | `HostPropsOf<typeof C>` for the props and `HostOf<typeof C>` for the handle; `HostProps` and `HostPropsBuiltins` are removed. The host type leaves out `sendToHost: false` props and makes `deliverTo` props optional, for inline and `satisfies` definitions (see [Typing the host](typescript.md#typing-the-host)) | Derive them from the component; stop reading withheld props on the host, and check `deliverTo` props before use |
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

## Props are always JSON

ForgeFrame 2 sends every prop as JSON through the function bridge. The `serialization` prop option and its `BASE64` and `DOTIFY` formats, `PROP_SERIALIZATION` and `SerializationType` are gone, and `create()` or `initHost()` throws if a definition still sets `serialization`. Callbacks at any depth are still bridged, and `Date` values still arrive as `Date`s.

| Area | v1 | v2 | What to do |
|---|---|---|---|
| `serialization` option | `serialization: PROP_SERIALIZATION.BASE64` or `DOTIFY` | Removed; `create()` and `initHost()` throw for it | Remove the option; base64- or dot-encoded values now arrive as the same JSON values |
| Encoded query parameter | The host read a base64- or dot-encoded parameter | The parameter carries the plain value | Read the plain value, or pass your own encoded string as a separate prop with `queryParam: 'name'` |
| `toJSON()` with DOTIFY | Not applied to the root object or to nested plain objects, so fields a class hid were sent, and a plain object's own `toJSON` arrived as a callable field | Applied, as `JSON.stringify` does | Check what the host receives; stop reading hidden fields or calling a delivered `toJSON` |
| An array's `toJSON()` | Called by BASE64 at any depth, and by DOTIFY for arrays inside objects | Not called; the entries are sent | Convert such arrays before passing them |
| `JSON.rawJSON()` values | Delivered as the value their text represents in BASE64 | Delivered as the value their text represents, as native JSON does | None |
| A prop whose `toJSON()` returns `undefined` | Omitted | Omitted | None |

## Removed zoid-era APIs

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
