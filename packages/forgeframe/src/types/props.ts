/**
 * Shared public prop-system types.
 */

import type { SerializationType } from '../constants';
import type { StandardSchemaV1, InferOutput } from '../props/schema';
import type { DomainMatcher } from './utility';

/**
 * Context object passed to prop value functions and decorators.
 *
 * @typeParam P - The props type for the component
 *
 * @remarks
 * This context provides access to component state and methods during
 * prop normalization and decoration.
 *
 * @public
 */
export interface PropContext<P> {
  /** Current props values */
  props: P;
  /** Component state object */
  state: Record<string, unknown>;
  /** Close the component */
  close: () => Promise<void>;
  /** Focus the component */
  focus: () => Promise<void>;
  /** Report an error */
  onError: (err: Error) => void;
  /** Container element (null during prerender) */
  container: HTMLElement | null;
  /** Unique instance identifier */
  uid: string;
  /** Component tag name */
  tag: string;
}

/**
 * Definition for a single component prop.
 *
 * @typeParam T - The type of the prop value
 * @typeParam P - The props type for the component
 *
 * @remarks
 * Prop definitions control how individual props are validated, serialized,
 * and passed between consumer and host components.
 *
 * @example
 * ```typescript
 * import { prop } from 'forgeframe';
 *
 * const propDef: PropDefinition<string> = {
 *   schema: prop.string(),
 *   required: true,
 *   default: 'hello',
 *   validate: ({ value }) => {
 *     if (value.length > 100) throw new Error('Too long');
 *   },
 * };
 * ```
 *
 * @public
 */
export interface PropDefinition<T = unknown, P = Record<string, unknown>> {
  /**
   * Standard Schema validator for type checking and validation.
   *
   * @remarks
   * Accepts any StandardSchemaV1-compliant schema including ForgeFrame's
   * built-in `prop.*` schemas, Zod, Valibot, ArkType, and others.
   *
   * @example
   * ```typescript
   * import { prop } from 'forgeframe';
   * import { z } from 'zod';
   *
   * const props = {
   *   // Using ForgeFrame's prop schemas
   *   name: prop.string().min(1),
   *   count: prop.number().default(0),
   *
   *   // Or using Zod schemas
   *   email: { schema: z.string().email(), required: true },
   * };
   * ```
   *
   * @see https://standardschema.dev/
   */
  schema?: StandardSchemaV1<unknown, T | undefined>;

  /** Whether the prop is required */
  required?: boolean;
  /** Default value or function returning default value */
  default?: T | ((ctx: PropContext<P>) => T);
  /** Function to compute the prop value */
  value?: (ctx: PropContext<P>) => T;

  /** Whether to send this prop to the host window (default: true) */
  sendToHost?: boolean;
  /** Only deliver after the loaded host is verified to be same-origin */
  sameDomain?: boolean;
  /** List of trusted domains that can receive this prop */
  trustedDomains?: DomainMatcher[];

  /** Serialization strategy for cross-domain transfer */
  serialization?: SerializationType;
  /** Pass prop via URL query parameter */
  queryParam?: boolean | string | ((opts: { value: T }) => string);
  /** Pass prop via POST body parameter */
  bodyParam?: boolean | string | ((opts: { value: T }) => string);

  /** Validate the prop value (throw to reject) */
  validate?: (opts: { value: T; props: P }) => void;
  /** Transform the prop value in consumer context */
  decorate?: (opts: { value: T; props: P }) => T;
  /** Transform the prop value in host context */
  hostDecorate?: (opts: { value: T; props: P }) => T;

  /**
   * Alternative runtime input name for the prop.
   *
   * @remarks
   * Aliases that reference another defined prop resolve transitively. When an
   * input supplies both an alias and its canonical key, the canonical value
   * wins at that level. TypeScript callers can model alternate input shapes
   * with the third generic accepted by `ForgeFrame.create()`.
   */
  alias?: string;
}

/**
 * A prop entry accepted by {@link PropsDefinition}.
 *
 * @remarks
 * ForgeFrame accepts Standard Schema implementations directly for concise
 * declarations. Use {@link PropDefinition} when transport, alias, or lifecycle
 * options are also required.
 *
 * @public
 */
export type PropDefinitionEntry<
  T = unknown,
  P = Record<string, unknown>,
> = PropDefinition<T, P> | StandardSchemaV1<unknown, T>;

/**
 * Map of prop names to their definitions.
 *
 * @typeParam P - The props type for the component
 *
 * @public
 */
export type PropsDefinition<P> = {
  [K in keyof P]?: PropDefinitionEntry<P[K], P>;
};

/** Whether a wrapped definition guarantees a normalized value. @internal */
type WrappedPropDefinitionProducesValue<D> =
  D extends { default: unknown } | { value: unknown }
    ? true
    : D extends { required: infer Required }
      ? true extends Required
        ? true
        : false
      : false;

/** Infers the normalized value produced by a prop-definition entry. @internal */
type InferPropDefinitionValue<D> =
  D extends StandardSchemaV1<unknown, infer Output>
    ? Output
    : D extends { schema: StandardSchemaV1<unknown, infer Output> }
      ? WrappedPropDefinitionProducesValue<D> extends true
        ? Exclude<Output, undefined>
        : Output
      : unknown;

/** Infers the value accepted by a prop-definition entry. @internal */
type InferPropDefinitionInput<D> =
  D extends StandardSchemaV1<infer Input, unknown>
    ? Input
    : D extends { schema: StandardSchemaV1<infer Input, unknown> }
      ? D extends { required: infer Required }
        ? true extends Required
          ? Exclude<Input, undefined>
          : Input
        : Input
      : unknown;

/** Whether a prop-definition entry can be absent after normalization. @internal */
type IsOptionalPropDefinitionValue<D> =
  D extends StandardSchemaV1<unknown, infer Output>
    ? undefined extends Output
      ? true
      : false
    : WrappedPropDefinitionProducesValue<D> extends true
      ? false
      : true;

/** Keys whose definitions can be absent after normalization. @internal */
type OptionalPropDefinitionKeys<D extends Record<string, unknown>> = {
  [K in keyof D]-?: IsOptionalPropDefinitionValue<D[K]> extends true
    ? K
    : never;
}[keyof D];

/** Keys whose schemas always produce a value. @internal */
type RequiredPropDefinitionKeys<D extends Record<string, unknown>> = Exclude<
  keyof D,
  OptionalPropDefinitionKeys<D>
>;

/**
 * Infers normalized component props from direct or wrapped Standard Schemas.
 *
 * @typeParam D - A map of prop names to schema-backed definitions.
 * @public
 */
export type InferPropsDefinition<D extends Record<string, unknown>> = {
  [K in RequiredPropDefinitionKeys<D>]: InferPropDefinitionValue<D[K]>;
} & {
  [K in OptionalPropDefinitionKeys<D>]?: InferPropDefinitionValue<D[K]>;
};

/** Whether a prop-definition entry accepts omission as input. @internal */
type IsOptionalPropDefinitionInput<D> =
  D extends StandardSchemaV1<infer Input, unknown>
    ? undefined extends Input
      ? true
      : false
    : D extends { default: unknown } | { value: unknown }
      ? true
      : D extends { required: infer Required }
        ? true extends Required
          ? false
          : true
        : true;

/** Keys whose definitions accept omission as input. @internal */
type OptionalPropDefinitionInputKeys<D extends Record<string, unknown>> = {
  [K in keyof D]-?: IsOptionalPropDefinitionInput<D[K]> extends true
    ? K
    : never;
}[keyof D];

/** Keys whose schemas require an input value. @internal */
type RequiredPropDefinitionInputKeys<D extends Record<string, unknown>> = Exclude<
  keyof D,
  OptionalPropDefinitionInputKeys<D>
>;

/**
 * Infers consumer input props from direct or wrapped Standard Schemas.
 *
 * @remarks
 * Unlike {@link InferPropsDefinition}, this type uses each schema's accepted
 * input. Direct schemas determine omission from that input, while wrapped
 * definitions use their `required`, `default`, and `value` options.
 *
 * @typeParam D - A map of prop names to schema-backed definitions.
 * @public
 */
export type InferPropsDefinitionInput<D extends Record<string, unknown>> = {
  [K in RequiredPropDefinitionInputKeys<D>]: InferPropDefinitionInput<D[K]>;
} & {
  [K in OptionalPropDefinitionInputKeys<D>]?: InferPropDefinitionInput<D[K]>;
};

/**
 * Infers the output type from a Standard Schema.
 *
 * @typeParam S - The Standard Schema type
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * const schema = z.object({ name: z.string() });
 * type User = InferSchemaOutput<typeof schema>; // { name: string }
 * ```
 *
 * @public
 */
export type InferSchemaOutput<S extends StandardSchemaV1> = InferOutput<S>;

/**
 * Helper type for creating schema-based prop definitions with full type inference.
 *
 * @typeParam S - The Standard Schema type
 * @typeParam P - The props type for the component
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const userSchema = z.object({ name: z.string(), age: z.number() });
 *
 * type UserPropDef = SchemaPropDefinition<typeof userSchema>;
 * // Equivalent to: PropDefinition<{ name: string; age: number }> with schema
 * ```
 *
 * @public
 */
export type SchemaPropDefinition<
  S extends StandardSchemaV1,
  P = Record<string, unknown>,
> = Omit<PropDefinition<InferOutput<S>, P>, 'type'> & {
  schema: S;
};

// Re-export StandardSchemaV1 for convenience
export type { StandardSchemaV1 } from '../props/schema';
