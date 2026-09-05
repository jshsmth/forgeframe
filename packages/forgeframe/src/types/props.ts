/**
 * Shared public prop-system types.
 */

import type { SerializationType } from "../constants";
import type {
	InferInput,
	InferOutput,
	StandardSchemaV1,
} from "../props/schema";
import type { DomainMatcher } from "./utility";

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
 * @typeParam Output - The normalized prop value exposed after validation
 * @typeParam P - The props type for the component
 * @typeParam Input - The value accepted by the schema and explicit fallbacks
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
 * @internal
 */
interface PropDefinitionOptions<
	Output = unknown,
	P = Record<string, unknown>,
	Input = Output,
> {
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
	schema?: StandardSchemaV1<Input, Output>;

	/** Whether the prop is required */
	required?: boolean;
	/** Schema input used when the caller omits the prop */
	default?: Input | ((ctx: PropContext<P>) => Input);
	/** Function that computes a schema input when the caller omits the prop */
	value?: (ctx: PropContext<P>) => Input;

	/** Whether to send this prop to the host window (default: true) */
	sendToHost?: boolean;
	/** Only deliver after the loaded host is verified to be same-origin */
	sameDomain?: boolean;
	/** List of trusted domains that can receive this prop */
	trustedDomains?: DomainMatcher[];

	/** Serialization strategy for cross-domain transfer */
	serialization?: SerializationType;
	/** Pass prop via URL query parameter */
	queryParam?: boolean | string | ((opts: { value: Output }) => string);
	/** Pass prop via POST body parameter */
	bodyParam?: boolean | string | ((opts: { value: Output }) => string);

	/** Validate the prop value (throw to reject) */
	validate?: (opts: { value: Output; props: P }) => void;
	/** Transform the prop value in consumer context */
	decorate?: (opts: { value: Output; props: P }) => Output;
	/** Transform the prop value in host context */
	hostDecorate?: (opts: { value: Output; props: P }) => Output;

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

/** Defines how an already-normalized value is checked at trust boundaries. @internal */
type NormalizedOutputSchemaRequirement<Input, Output> = [Output] extends [Input]
	? {
			/**
			 * Validation-only schema for normalized values used after input parsing.
			 *
			 * @remarks
			 * ForgeFrame requires this schema when the input schema's output cannot
			 * be accepted by that same input schema. It must validate without
			 * changing the normalized value.
			 */
			outputSchema?: StandardSchemaV1<Output, Output>;
		}
	: {
			/**
			 * Validation-only schema for normalized values used after input parsing.
			 *
			 * @remarks
			 * This is required when the input schema changes the value's type,
			 * including for consumer-only props. It must validate without changing
			 * the normalized value.
			 */
			outputSchema: StandardSchemaV1<Output, Output>;
		};

/**
 * Definition for a single component prop.
 *
 * @typeParam Output - The normalized prop value exposed after validation
 * @typeParam P - The props type for the component
 * @typeParam Input - The value accepted by the schema and explicit fallbacks
 *
 * @public
 */
export type PropDefinition<
	Output = unknown,
	P = Record<string, unknown>,
	Input = Output,
> = PropDefinitionOptions<Output, P, Input> &
	NormalizedOutputSchemaRequirement<Input, Output>;

/** A direct schema that can safely revalidate its normalized output. @internal */
type DirectPropSchema<Input, Output> = [Output] extends [Input]
	? StandardSchemaV1<Input, Output>
	: never;

/** Applies `Omit` independently to each member of a union. @internal */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
	? Omit<T, K>
	: never;

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
	Output = unknown,
	P = Record<string, unknown>,
	Input = Output,
> = PropDefinition<Output, P, Input> | DirectPropSchema<Input, Output>;

/**
 * Map of prop names to their definitions.
 *
 * @typeParam P - The normalized props type for the component
 * @typeParam I - Canonical schema input types keyed like the normalized props
 *
 * @public
 */
export type PropsDefinition<P, I = P> = {
	[K in keyof P]?: PropDefinitionEntry<
		P[K],
		P,
		K extends keyof I ? I[K] : P[K]
	>;
};

/**
 * Prop definitions consumed by the host after values have been normalized.
 *
 * @remarks
 * Host code only observes normalized outputs, but retaining the schema input
 * shape lets TypeScript require an `outputSchema` for type-changing schemas.
 * Use the second type parameter when those inputs differ from `P`.
 *
 * @typeParam P - The normalized props exposed to host code
 * @typeParam I - The corresponding schema input types
 * @public
 */
export type HostPropsDefinition<P, I = P> = PropsDefinition<P, I>;

/** Resolves the value returned by a wrapped `value` callback. @internal */
type InferPropDefinitionValueResult<Value> = Value extends (
	...args: never[]
) => infer Result
	? Result
	: never;

/** Resolves a wrapped literal or factory default. @internal */
type InferPropDefinitionDefaultResult<Default> = Default extends (
	...args: never[]
) => infer Result
	? Result
	: Default;

/** Resolves the fallback used when a wrapped `value` callback is absent. @internal */
type InferPropDefinitionDefault<D> = D extends { default: infer Default }
	? InferPropDefinitionDefaultResult<Default>
	: undefined;

/** Resolves every value that wrapped metadata can produce for omission. @internal */
type InferPropDefinitionMetadataValue<D> = D extends { value: infer Value }
	?
			| InferPropDefinitionValueResult<Exclude<Value, undefined>>
			| (undefined extends Value ? InferPropDefinitionDefault<D> : never)
	: InferPropDefinitionDefault<D>;

/** Whether wrapped metadata guarantees a defined value for omission. @internal */
type WrappedPropDefinitionMetadataProducesValue<D> = [
	InferPropDefinitionMetadataValue<D>,
] extends [never]
	? false
	: undefined extends InferPropDefinitionMetadataValue<D>
		? false
		: true;

/** Whether a wrapped schema accepts omission and guarantees a defined output. @internal */
type WrappedPropDefinitionSchemaProducesValue<D> = D extends {
	schema: StandardSchemaV1<infer Input, infer Output>;
}
	? undefined extends Input
		? undefined extends Output
			? false
			: true
		: false
	: false;

/** Whether omitting a wrapped prop is guaranteed to produce a defined value. @internal */
type WrappedPropDefinitionOmissionProducesValue<D> =
	WrappedPropDefinitionMetadataProducesValue<D> extends true
		? true
		: WrappedPropDefinitionSchemaProducesValue<D>;

/** Whether a wrapped definition guarantees a normalized property. @internal */
type WrappedPropDefinitionProducesValue<D> = D extends { required: true }
	? true
	: WrappedPropDefinitionOmissionProducesValue<D>;

/** Infers the normalized value produced by a prop-definition entry. @internal */
type InferPropDefinitionValue<D> =
	D extends StandardSchemaV1<unknown, infer Output>
		? Output
		: D extends { schema: StandardSchemaV1<unknown, infer Output> }
			? Output
			: unknown;

/** Infers the value accepted by a prop-definition entry. @internal */
type InferPropDefinitionInput<D> =
	D extends StandardSchemaV1<infer Input, unknown>
		? Input
		: D extends { schema: StandardSchemaV1<infer Input, unknown> }
			? D extends { required: true }
				? Exclude<Input, undefined>
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
		: D extends { required: true }
			? WrappedPropDefinitionOmissionProducesValue<D> extends true
				? true
				: false
			: true;

/** Keys whose definitions accept omission as input. @internal */
type OptionalPropDefinitionInputKeys<D extends Record<string, unknown>> = {
	[K in keyof D]-?: IsOptionalPropDefinitionInput<D[K]> extends true
		? K
		: never;
}[keyof D];

/** Keys whose schemas require an input value. @internal */
type RequiredPropDefinitionInputKeys<D extends Record<string, unknown>> =
	Exclude<keyof D, OptionalPropDefinitionInputKeys<D>>;

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
 * // Equivalent to a PropDefinition whose input and output are inferred
 * // independently from userSchema.
 * ```
 *
 * @public
 */
export type SchemaPropDefinition<
	S extends StandardSchemaV1,
	P = Record<string, unknown>,
> = DistributiveOmit<
	PropDefinition<InferOutput<S>, P, InferInput<S>>,
	"schema"
> & {
	schema: S;
};

// Re-export StandardSchemaV1 for convenience
export type { StandardSchemaV1 } from "../props/schema";
