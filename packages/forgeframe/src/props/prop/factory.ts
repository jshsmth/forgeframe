import type { PropSchema } from "./base";
import {
	ArraySchema,
	type InferObjectInputShape,
	type InferObjectShape,
	ObjectSchema,
	RecordSchema,
	TupleSchema,
} from "./composite";
import { EnumSchema, LiteralSchema, UnionSchema } from "./literals";
import {
	AnySchema,
	BooleanSchema,
	DateSchema,
	FunctionSchema,
	NumberSchema,
	StringSchema,
} from "./primitives";

/**
 * Factory functions for creating prop schemas.
 *
 * @remarks
 * Use these functions to define props with a fluent, chainable API.
 * All schemas implement StandardSchemaV1 and integrate with ForgeFrame's
 * validation system.
 *
 * @example
 * ```typescript
 * const props = {
 *   email: prop.string().email(),
 *   rememberMe: prop.boolean().default(false),
 *   tags: prop.array(prop.string()).default([]),
 * };
 * ```
 *
 * @public
 */
export const prop = {
	/**
	 * Creates a string schema.
	 *
	 * @returns A new string schema.
	 */
	string: (): StringSchema => new StringSchema(),

	/**
	 * Creates a number schema.
	 *
	 * @returns A new number schema.
	 */
	number: (): NumberSchema => new NumberSchema(),

	/**
	 * Creates a date schema.
	 *
	 * @returns A new date schema.
	 */
	date: (): DateSchema => new DateSchema(),

	/**
	 * Creates a boolean schema.
	 *
	 * @returns A new boolean schema.
	 */
	boolean: (): BooleanSchema => new BooleanSchema(),

	/**
	 * Creates a function schema.
	 *
	 * @typeParam T - Function type signature.
	 * @returns A new function schema.
	 */
	function: <
		// biome-ignore lint/suspicious/noExplicitAny: Generic callbacks must accept arbitrary argument and return types.
		T extends (...args: any[]) => any = (...args: any[]) => any,
	>(): FunctionSchema<T> => new FunctionSchema<T>(),

	/**
	 * Creates an array schema that validates each item.
	 *
	 * @typeParam T - Normalized item type.
	 * @typeParam I - Item input type.
	 * @param item - Schema used to validate each item.
	 * @returns A new array schema.
	 */
	array: <T, I = T>(item: PropSchema<T, I>): ArraySchema<T, I> =>
		new ArraySchema(item),

	/**
	 * Creates a tuple schema with fixed positional item types.
	 *
	 * @typeParam S - Tuple of item schemas.
	 * @param schemas - Positional item schemas.
	 * @returns A new tuple schema.
	 */
	tuple: <S extends readonly PropSchema<unknown, unknown>[]>(
		...schemas: S
	): TupleSchema<S> => new TupleSchema(schemas),

	/**
	 * Creates an object schema that validates the fields in `shape`.
	 *
	 * @typeParam S - Shape definition type.
	 * @param shape - Object mapping field names to schemas.
	 * @returns A new object schema whose types are inferred from `shape`.
	 */
	object: <S extends Record<string, PropSchema<unknown, unknown>>>(
		shape: S,
	): ObjectSchema<InferObjectShape<S>, InferObjectInputShape<S>> =>
		new ObjectSchema(shape),

	/**
	 * Creates a record schema for string-keyed objects.
	 *
	 * @typeParam T - Normalized record value type.
	 * @typeParam I - Record value input type.
	 * @param schema - Schema used to validate each record value.
	 * @returns A new record schema.
	 */
	record: <T, I = T>(schema: PropSchema<T, I>): RecordSchema<T, I> =>
		new RecordSchema(schema),

	/**
	 * Creates a literal schema for exact value matching.
	 *
	 * @param value - Exact value to match.
	 * @returns A new literal schema.
	 */
	literal: <T extends string | number | boolean>(value: T): LiteralSchema<T> =>
		new LiteralSchema(value),

	/**
	 * Creates an enum schema for a set of allowed values.
	 *
	 * @param values - Allowed values.
	 * @returns A new enum schema.
	 */
	enum: <T extends string | number>(values: readonly T[]): EnumSchema<T> =>
		new EnumSchema(values),

	/**
	 * Creates a union schema that accepts any matching branch.
	 *
	 * @typeParam S - Tuple of branch schemas.
	 * @param schemas - One or more schemas to try in order.
	 * @returns A new union schema.
	 */
	union: <
		S extends readonly [
			PropSchema<unknown, unknown>,
			...PropSchema<unknown, unknown>[],
		],
	>(
		...schemas: S
	): UnionSchema<S> => new UnionSchema(schemas),

	/**
	 * Creates a schema that accepts any defined value without checking it.
	 *
	 * @remarks
	 * Use it for values that are deliberately unchecked. The type parameter
	 * only types the value; nothing validates it at runtime.
	 *
	 * @typeParam T - Type of the accepted value.
	 * @returns A new schema that accepts any defined value.
	 */
	any: <T = NonNullable<unknown> | null>(): AnySchema<T> => new AnySchema<T>(),
} as const;

/**
 * Type alias for the prop factory namespace.
 *
 * @public
 */
export type Prop = typeof prop;
