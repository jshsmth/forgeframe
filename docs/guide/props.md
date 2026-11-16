---
name: guide/props
title: Props System
desc: Prop schemas, Standard Schema libraries, defaults, URL and body props, updates, and cross-window callback values.
tags: []
sources: []
created: 2026-11-16T03:15:22Z
updated: 2026-11-16T03:15:22Z
---

# Props System

Props are declared with the fluent `prop` schema builders. Every `prop` schema implements [Standard Schema](https://standardschema.dev/), and props also accept schemas from any Standard Schema library.

## Defining Props

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

## Prop Schema Methods

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

## Callback Capacity

Each delivered props or exports snapshot can hold up to **500 distinct callbacks** per bridge; a callback used in several fields counts once. A larger snapshot is rejected, and callbacks already delivered stay callable. After the host acknowledges an update, callbacks missing from the new snapshot are retired.

During an update, the previous snapshot stays callable while new references are staged. If serialization fails, only the new registrations are removed. If delivery fails, the host may already have installed the new snapshot, so old and possibly delivered references both stay callable in a **1,000-reference recovery pool**. When that pool is full, new callbacks are rejected until an acknowledged retry that reuses retained callbacks, a new host session, or teardown frees capacity. A transport failure does not roll back the consumer's committed props.

Peer discovery uses a separate relay registry with a cumulative **500-reference** limit per requesting host session. Repeated discovery reuses retained identities and keeps peer snapshots the host already holds; a discovery that would exceed the limit is rejected as a whole. Reconnection clears old relay identities. When a peer replaces its exports, its original exported callbacks are retired.

## Schema Types

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

### Arrays in props and exports

Arrays delivered to the host, including nested arrays, must not contain `undefined` entries or sparse holes, because JSON would turn them into `null`. Use `null` with a nullable item schema, such as `prop.array(prop.string().nullable())`, or an item default, such as `prop.array(prop.string().default('fallback'))`. Standalone schema validation still accepts optional entries, and props withheld by `sendToHost` or `deliverTo` are not checked.

ForgeFrame reads each indexed entry directly, so arrays with a null prototype or an overridden `map` method deliver their actual entries. Normalized arrays are checked before the host opens or an update is committed, so a rejected update keeps the previous snapshot. Values produced by a custom `toJSON()` (including a computed `toJSON` property) are checked during delivery, after commitment. A `toJSON` field that is not a function is ordinary data.

## Using Standard Schema Libraries

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

## Advanced Prop Definitions

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
| `deliverTo` | Restrict which hosts receive the prop. `'same-origin'` delivers only after the loaded host is verified to share the consumer's origin, so the value is never in `window.name` or the initial query/POST request. An [origin matcher](advanced.md#origin-security) delivers only to matching host origins; `create()` rejects an empty array, an empty or blank origin, and `'same-origin'` mixed into an array |
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

Component and React-wrapper types are inferred from the schemas. The factory input can be wider than the host props, because defaults make keys optional and coercions accept more types; read it with `InputOf<typeof C>` and the props with `PropsOf<typeof C>` (see [TypeScript](typescript.md)). Definition types such as `PropsDefinition<P>` are typed by the props alone, so a defaulted schema fits without an input type.

Transport notes:

- Use `deliverTo: 'same-origin'` for values that must never be exposed during cross-origin bootstrap.
- Props always cross as JSON through the function bridge. Callbacks at any depth arrive as remote functions and `Date` values arrive as `Date`s, at bootstrap, on every update, and in `host.export(...)`. A value JSON cannot encode, such as a `BigInt` or a cycle, rejects with a `VALIDATION` error; for a `BigInt` its `cause` is the encoder's `TypeError`. In the first render's props, `render()` rejects with that error as soon as the host asks for its props, instead of waiting for `initTimeout`. An error your own `toJSON()` throws reaches you unchanged.
- Ordinary objects that contain transport marker fields stay ordinary data.
- An object's `toJSON()` result is delivered instead of its fields, as native JSON does, so a class can hide fields such as tokens. A root `toJSON()` that returns `undefined` omits the prop. A `URL` arrives as its `href`, and boxed primitives such as `new String('ab')` arrive unboxed. A boxed primitive whose prototype was set to `null` is not unboxed: it is sent as an ordinary record of its own fields.
- Arrays are read entry by entry, and an array's `toJSON()` is not called.
- A `JSON.rawJSON()` value arrives as the value its text represents, as `JSON.stringify` writes it. Consumer schemas validate the raw value itself, so return it from a custom `toJSON()` or pass it under a schema that accepts it, such as `prop.any()`.

## Passing Props via URL or POST Body (Advanced)

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

## Updating Props

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
- **While `render()` is pending:** they wait for the render to settle. The host starts with the snapshot the render began with, then receives each update as its own `onProps` notification, and each update's `props` event fires after `rendered`. An invalid update rejects on its own; the render and later updates continue. If the render fails before anything opened, the updates apply locally and the next `render()` includes them. That covers invalid props or options, a component `validate` rejection, a URL that is invalid or outside `hostOrigins`, and a missing or detached container. A blocked popup also leaves the instance open, so the updates apply locally and a fallback `render(container, 'iframe')` includes them. If it fails after that, or `close()` cancels it, they reject with a `CLOSED` [`ForgeFrameError`](../../README.md#errors) whose `cause` is the render's own failure, so you can tell them apart from a later close.
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

## Cross-Window Callback Values

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
