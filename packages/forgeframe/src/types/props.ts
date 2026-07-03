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
  schema?: StandardSchemaV1<unknown, T>;

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

  /** Alternative name for the prop */
  alias?: string;
}

/**
 * Map of prop names to their definitions.
 *
 * @typeParam P - The props type for the component
 *
 * @public
 */
export type PropsDefinition<P> = {
  [K in keyof P]?: PropDefinition<P[K], P>;
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
