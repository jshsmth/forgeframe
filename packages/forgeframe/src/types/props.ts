/**
 * Shared public prop-system types.
 */

import type {
	InferInput,
	InferOutput,
	StandardSchemaV1,
} from "../props/schema";
import type { DomainMatcher } from "./utility";

/**
 * Host origins a prop is delivered to.
 *
 * @remarks
 * `'same-origin'` delivers only to a host verified to share the consumer's
 * origin, so the prop never appears in the initial URL or POST body. A
 * {@link DomainMatcher} delivers to the host origins it admits.
 *
 * @public
 */
export type PropDelivery = "same-origin" | DomainMatcher;

/**
 * Transport options of a wrapped prop definition.
 *
 * @typeParam Output - The normalized prop value exposed after validation
 * @typeParam Input - The value accepted by the schema
 *
 * @remarks
 * The schema alone decides whether the prop is required and what its default
 * is; these options only control how the value reaches the host.
 *
 * @example
 * ```typescript
 * import { prop } from 'forgeframe';
 *
 * const propDef: PropDefinition<string> = {
 *   schema: prop.string().min(1),
 *   queryParam: 'ref',
 * };
 * ```
 *
 * @internal
 */
interface PropDefinitionOptions<Output = unknown, Input = Output> {
	/**
	 * Standard Schema that validates the prop and supplies its default.
	 *
	 * @remarks
	 * Accepts any StandardSchemaV1-compliant schema including ForgeFrame's
	 * built-in `prop.*` schemas, Zod, Valibot, ArkType, and others. The prop is
	 * required exactly when this schema rejects `undefined`.
	 *
	 * @example
	 * ```typescript
	 * import { prop } from 'forgeframe';
	 * import { z } from 'zod';
	 *
	 * const props = {
	 *   ref: { schema: prop.string().optional(), queryParam: true },
	 *   email: { schema: z.string().email(), bodyParam: 'user_email' },
	 * };
	 * ```
	 *
	 * @see https://standardschema.dev/
	 */
	schema: StandardSchemaV1<Input, Output>;

	/** Whether to send this prop to the host window (default: true) */
	sendToHost?: boolean;
	/** Host origins that receive this prop; every host when omitted */
	deliverTo?: PropDelivery;

	/**
	 * Pass the prop as a URL query parameter: `true` uses the prop key, a
	 * string names the parameter, and `false` is the same as omitting it.
	 */
	queryParam?: boolean | string;
	/**
	 * Pass the prop as a POST body parameter: `true` uses the prop key, a
	 * string names the parameter, and `false` is the same as omitting it.
	 */
	bodyParam?: boolean | string;
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
 * @typeParam Input - The value accepted by the schema
 *
 * @public
 */
export type PropDefinition<
	Output = unknown,
	Input = Output,
> = PropDefinitionOptions<Output, Input> &
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
 * declarations. Use {@link PropDefinition} when transport options are also
 * required.
 *
 * @public
 */
export type PropDefinitionEntry<Output = unknown, Input = Output> =
	| PropDefinition<Output, Input>
	| DirectPropSchema<Input, Output>;

/**
 * Map of prop names to their definitions.
 *
 * @typeParam P - The normalized props type for the component
 * @typeParam I - Canonical schema input types keyed like the normalized props
 *
 * @public
 */
export type PropsDefinition<P, I = P> = {
	[K in keyof P]?: PropDefinitionEntry<P[K], K extends keyof I ? I[K] : P[K]>;
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

/** Extracts the schema of a direct or wrapped prop-definition entry. @internal */
type PropDefinitionSchema<D> = D extends StandardSchemaV1
	? D
	: D extends { schema: infer Schema extends StandardSchemaV1 }
		? Schema
		: never;

/** Infers the normalized value produced by a prop-definition entry. @internal */
type InferPropDefinitionValue<D> =
	PropDefinitionSchema<D> extends StandardSchemaV1<unknown, infer Output>
		? Output
		: unknown;

/** Infers the value accepted by a prop-definition entry. @internal */
type InferPropDefinitionInput<D> =
	PropDefinitionSchema<D> extends StandardSchemaV1<infer Input, unknown>
		? Input
		: unknown;

/** Keys whose schemas can produce `undefined`. @internal */
type OptionalPropDefinitionKeys<D extends Record<string, unknown>> = {
	[K in keyof D]-?: undefined extends InferPropDefinitionValue<D[K]>
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
 * @remarks
 * A key is optional exactly when its schema's output can be `undefined`.
 *
 * @typeParam D - A map of prop names to schema-backed definitions.
 * @public
 */
export type InferPropsDefinition<D extends Record<string, unknown>> = {
	[K in RequiredPropDefinitionKeys<D>]: InferPropDefinitionValue<D[K]>;
} & {
	[K in OptionalPropDefinitionKeys<D>]?: InferPropDefinitionValue<D[K]>;
};

/** Keys whose schemas accept `undefined` as input. @internal */
type OptionalPropDefinitionInputKeys<D extends Record<string, unknown>> = {
	[K in keyof D]-?: undefined extends InferPropDefinitionInput<D[K]>
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
 * input. A key is optional exactly when its schema accepts `undefined`, so the
 * compiler and the runtime agree on which props are required.
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
export type SchemaPropDefinition<S extends StandardSchemaV1> = DistributiveOmit<
	PropDefinition<InferOutput<S>, InferInput<S>>,
	"schema"
> & {
	schema: S;
};

// Re-export StandardSchemaV1 for convenience
export type { StandardSchemaV1 } from "../props/schema";
