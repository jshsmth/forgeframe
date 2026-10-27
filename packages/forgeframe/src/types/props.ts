/**
 * Shared public prop-system types.
 */

import type { StandardSchemaV1 } from "../props/schema";
import type { OriginMatcher } from "./utility";

/**
 * Host origins a prop is delivered to.
 *
 * @remarks
 * `'same-origin'` delivers only to a host verified to share the consumer's
 * origin, so the prop never appears in the initial URL or POST body. A
 * {@link OriginMatcher} delivers to the host origins it admits.
 *
 * @public
 */
export type PropDelivery = "same-origin" | OriginMatcher;

/**
 * Definition for a single component prop: its schema plus transport options.
 *
 * @typeParam Output - The normalized prop value exposed after validation
 *
 * @remarks
 * The schema alone decides whether the prop is required and what its default
 * is; the other options only control how the value reaches the host. The
 * schema must accept its own output unchanged, because ForgeFrame validates
 * normalized values again with the same schema at later trust boundaries,
 * including on the host.
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
 * @public
 */
export interface PropDefinition<Output = unknown> {
	/**
	 * Standard Schema that validates the prop and supplies its default.
	 *
	 * @remarks
	 * Accepts any StandardSchemaV1-compliant schema including ForgeFrame's
	 * built-in `prop.*` schemas, Zod, Valibot, ArkType, and others. The prop is
	 * required exactly when this schema rejects `undefined`. Its output must be
	 * valid input to the same schema, and validating an output must return it
	 * unchanged: idempotent transforms such as trimming and coercions such as
	 * `z.coerce.number()` qualify, type-changing transforms do not.
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
	schema: StandardSchemaV1<unknown, Output>;

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

/**
 * Reported where a prop schema's output is not valid input to the same schema.
 * @internal
 */
export type SelfAcceptanceError =
	"ForgeFrame: a prop schema's output must be valid input to the same schema";

/**
 * Map of prop names to their definitions: a Standard Schema, or a
 * {@link PropDefinition} when transport options are needed too.
 *
 * @typeParam P - The normalized props type for the component
 *
 * @remarks
 * Every key of `P` needs an entry, so `satisfies PropsDefinition<MyProps>`
 * reports a missing definition. Each entry is checked against the value it
 * produces: a required key rejects a schema whose output may be `undefined`.
 * Give an optional key an optional schema as well; `InferProps` otherwise
 * makes it required. A defaulted or coercing schema fits without
 * a separate input type. TypeScript cannot check here that a schema accepts
 * its own output, so the runtime checks it when props are normalized;
 * `create()` also checks it at compile time.
 *
 * @example
 * ```typescript
 * import { prop, type PropsDefinition } from 'forgeframe';
 *
 * interface LoginProps {
 *   email: string;
 *   rememberMe: boolean;
 *   ref?: string;
 * }
 *
 * const props = {
 *   email: prop.string().email(),
 *   rememberMe: prop.boolean().default(false),
 *   ref: { schema: prop.string().optional(), queryParam: true },
 * } satisfies PropsDefinition<LoginProps>;
 * ```
 *
 * @public
 */
export type PropsDefinition<P> = {
	[K in keyof Required<P>]:
		| PropDefinition<P[K]>
		| StandardSchemaV1<unknown, P[K]>;
};

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

/**
 * The output type of an entry whose schema is typed exactly
 * `StandardSchemaV1<unknown, Output>`, wrapped in a tuple, or `never` for any
 * other entry. Annotating an entry as `PropDefinition<T>`, as
 * `StandardSchemaV1<unknown, T>` or through `PropsDefinition<P>` erases its
 * input type to `unknown`; a concrete schema such as `z.coerce.number()` is
 * never exactly that interface.
 * @internal
 */
type AnnotatedEntryOutput<D> = [PropDefinitionSchema<D>] extends [
	StandardSchemaV1<unknown, infer Output>,
]
	? [StandardSchemaV1<unknown, Output>] extends [PropDefinitionSchema<D>]
		? [Output]
		: never
	: never;

/**
 * Infers the value accepted by a prop-definition entry. An annotated entry
 * accepts its output type, since the annotation keeps no input type.
 * @internal
 */
type InferPropDefinitionInput<D> = [AnnotatedEntryOutput<D>] extends [never]
	? PropDefinitionSchema<D> extends StandardSchemaV1<infer Input, unknown>
		? Input
		: unknown
	: AnnotatedEntryOutput<D>[0];

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
export type InferProps<D extends Record<string, unknown>> = {
	[K in RequiredPropDefinitionKeys<D>]: InferPropDefinitionValue<D[K]>;
} & {
	[K in OptionalPropDefinitionKeys<D>]?: InferPropDefinitionValue<D[K]>;
};

/** Keys declared `sendToHost: false`, which no host receives. @internal */
type WithheldPropDefinitionKeys<D extends Record<string, unknown>> = {
	[K in keyof D]-?: D[K] extends { sendToHost: false } ? K : never;
}[keyof D];

/**
 * Keys a host may not receive: `deliverTo` decides by the host's origin, and a
 * `sendToHost` that is not literally `true` may withhold them.
 * @internal
 */
type ConditionalPropDefinitionKeys<D extends Record<string, unknown>> = {
	[K in keyof D]-?: D[K] extends { deliverTo: unknown }
		? K
		: D[K] extends { sendToHost: true }
			? never
			: D[K] extends { sendToHost: boolean }
				? K
				: never;
}[keyof D];

/** Keys a host always receives with a value. @internal */
type RequiredHostPropDefinitionKeys<D extends Record<string, unknown>> =
	Exclude<
		RequiredPropDefinitionKeys<D>,
		WithheldPropDefinitionKeys<D> | ConditionalPropDefinitionKeys<D>
	>;

/** Keys a host may receive without a value. @internal */
type OptionalHostPropDefinitionKeys<D extends Record<string, unknown>> =
	Exclude<
		OptionalPropDefinitionKeys<D> | ConditionalPropDefinitionKeys<D>,
		WithheldPropDefinitionKeys<D>
	>;

/**
 * Infers the normalized props a host receives from direct or wrapped Standard
 * Schemas.
 *
 * @remarks
 * Unlike {@link InferProps}, which is the consumer's view, this type leaves
 * out props declared `sendToHost: false`, and makes props with a `deliverTo`
 * option optional, because whether a host receives them depends on its
 * origin. It reads the literal options of each entry, so an entry annotated
 * as `PropDefinition<T>`, whose options are optional, counts as delivered.
 *
 * @typeParam D - A map of prop names to schema-backed definitions.
 * @public
 */
export type InferHostProps<D extends Record<string, unknown>> = {
	[K in RequiredHostPropDefinitionKeys<D>]: InferPropDefinitionValue<D[K]>;
} & {
	[K in OptionalHostPropDefinitionKeys<D>]?: InferPropDefinitionValue<D[K]>;
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
 * Unlike {@link InferProps}, this type uses each schema's accepted
 * input. A key is optional exactly when its schema accepts `undefined`, so the
 * compiler and the runtime agree on which props are required.
 *
 * @typeParam D - A map of prop names to schema-backed definitions.
 * @public
 */
export type InferPropsInput<D extends Record<string, unknown>> = {
	[K in RequiredPropDefinitionInputKeys<D>]: InferPropDefinitionInput<D[K]>;
} & {
	[K in OptionalPropDefinitionInputKeys<D>]?: InferPropDefinitionInput<D[K]>;
};

// Re-export StandardSchemaV1 for convenience
export type { StandardSchemaV1, StandardSchemaV1Props } from "../props/schema";
