---
name: guide/typescript
title: TypeScript
desc: Type inference from schemas, typing helpers, and typing the host.
tags: []
sources: []
created: 2026-11-16T03:15:22Z
updated: 2026-11-16T03:15:22Z
---

# TypeScript

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

## Typing helpers

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

## Typing the host

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
