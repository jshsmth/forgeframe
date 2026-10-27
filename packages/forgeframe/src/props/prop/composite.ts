import { ForgeFrameError } from "../../errors";
import type { StandardSchemaV1Issue, StandardSchemaV1Result } from "../schema";
import type {
	InferSchemaInput,
	InferSchemaValue,
	InferTupleInputShape,
	InferTupleShape,
} from "./base";
import {
	addSchemaCheck,
	assertNestedSchema,
	defineDataProperty,
	findFailedSchemaCheck,
	getValueKind,
	isPlainObject,
	PropSchema,
	prependIssuePath,
	type SchemaCheck,
	validateSchemaSync,
} from "./base";

/** Array length refinements run minimums, then maximums. */
const ARRAY_MIN_LENGTH_RANK = 0;
const ARRAY_MAX_LENGTH_RANK = 1;

/**
 * Schema for array props whose items are validated by an item schema.
 *
 * @remarks
 * Create it with `prop.array(item)`. Use `prop.any<T[]>()` for an array whose
 * items are deliberately unchecked.
 *
 * @typeParam T - Normalized array item type.
 * @typeParam I - Array item input type.
 *
 * @public
 */
export class ArraySchema<T = unknown, I = T> extends PropSchema<T[], I[]> {
	/** @internal */
	private _itemSchema: PropSchema<T, I>;
	/** @internal */
	private _checks: readonly SchemaCheck<number>[] = [];

	constructor(item: PropSchema<T, I>) {
		super();
		assertNestedSchema(
			item,
			"prop.array(item) requires an item schema. Use prop.any<T[]>() for an array whose items are deliberately unchecked.",
		);
		this._itemSchema = item;
	}

	/** @internal */
	protected _validate(value: unknown): StandardSchemaV1Result<T[]> {
		const issues = checkArrayConstraints(value, this._checks);
		if (issues) return { issues };

		return validateArrayItems(value as unknown[], this._itemSchema);
	}

	/** @internal */
	protected _clone(): ArraySchema<T, I> {
		const clone = this._copyBaseTo(new ArraySchema<T, I>(this._itemSchema));
		clone._checks = this._checks;
		return clone;
	}

	/** @internal */
	private _withCheck(check: SchemaCheck<number>): ArraySchema<T, I> {
		const clone = this._clone();
		clone._checks = addSchemaCheck(this._checks, check);
		return clone;
	}

	/**
	 * Requires a minimum array length.
	 *
	 * @param length - Minimum number of items.
	 * @returns A cloned array schema with the minimum length constraint.
	 */
	min(length: number): ArraySchema<T, I> {
		return this._withCheck({
			rank: ARRAY_MIN_LENGTH_RANK,
			message: `Array must have at least ${length} items`,
			test: (itemCount) => itemCount >= length,
		});
	}

	/**
	 * Requires a maximum array length.
	 *
	 * @param length - Maximum number of items.
	 * @returns A cloned array schema with the maximum length constraint.
	 */
	max(length: number): ArraySchema<T, I> {
		return this._withCheck({
			rank: ARRAY_MAX_LENGTH_RANK,
			message: `Array must have at most ${length} items`,
			test: (itemCount) => itemCount <= length,
		});
	}

	/**
	 * Requires a non-empty array.
	 *
	 * @returns A cloned array schema that also requires at least 1 item.
	 */
	nonempty(): ArraySchema<T, I> {
		return this.min(1);
	}
}

/**
 * Schema for tuple props with fixed-length positional validation.
 *
 * @remarks
 * Tuple schemas validate both the array length and each positional item schema.
 *
 * @typeParam S - Tuple of item schema definitions.
 *
 * @public
 */
export class TupleSchema<
	S extends readonly PropSchema<unknown, unknown>[] = [],
> extends PropSchema<InferTupleShape<S>, InferTupleInputShape<S>> {
	/** @internal */
	private _itemSchemas: S;

	constructor(schemas: S) {
		super();
		// Copy own positions, so a shadowed iterator or null prototype cannot
		// change the snapshot, while retaining the caller's inferred tuple shape.
		const items: S = Object.assign([], schemas);
		for (let index = 0; index < items.length; index++) {
			assertNestedSchema(
				items[index],
				`prop.tuple() requires a schema at position ${index}. Use prop.any() for a value that is deliberately unchecked.`,
			);
		}
		this._itemSchemas = items;
	}

	/** @internal */
	protected _validate(
		value: unknown,
	): StandardSchemaV1Result<InferTupleShape<S>> {
		const issues = checkTupleConstraints(value, this._itemSchemas.length);
		if (issues) return { issues };

		return validateTupleItems(value as unknown[], this._itemSchemas);
	}

	/** @internal */
	protected _clone(): TupleSchema<S> {
		return this._copyBaseTo(new TupleSchema(this._itemSchemas));
	}
}

/**
 * Infers the output type from an object shape definition.
 *
 * @remarks
 * Exported so declaration files can name the type `prop.object()` returns.
 *
 * @typeParam S - Object shape definition.
 *
 * @public
 */
export type InferObjectShape<
	S extends Record<string, PropSchema<unknown, unknown>>,
> = {
	[K in keyof S as K extends OptionalObjectOutputKeys<S>
		? never
		: K]: InferSchemaValue<S[K]>;
} & {
	[K in keyof S as K extends OptionalObjectOutputKeys<S>
		? K
		: never]?: InferSchemaValue<S[K]>;
};

/** Keys whose normalized field values can be omitted. @internal */
type OptionalObjectOutputKeys<
	S extends Record<string, PropSchema<unknown, unknown>>,
> = {
	[K in keyof S]-?: undefined extends InferSchemaValue<S[K]> ? K : never;
}[keyof S];

/** Keys whose field schemas accept omission. @internal */
type OptionalObjectInputKeys<
	S extends Record<string, PropSchema<unknown, unknown>>,
> = {
	[K in keyof S]-?: undefined extends InferSchemaInput<S[K]> ? K : never;
}[keyof S];

/** Keys whose field schemas require an input value. @internal */
type RequiredObjectInputKeys<
	S extends Record<string, PropSchema<unknown, unknown>>,
> = Exclude<keyof S, OptionalObjectInputKeys<S>>;

/**
 * Infers the accepted input object from an object shape definition.
 *
 * @remarks
 * Exported so declaration files can name the type `prop.object()` returns.
 *
 * @typeParam S - Object shape definition.
 * @public
 */
export type InferObjectInputShape<
	S extends Record<string, PropSchema<unknown, unknown>>,
> = {
	[K in RequiredObjectInputKeys<S>]: InferSchemaInput<S[K]>;
} & {
	[K in OptionalObjectInputKeys<S>]?: InferSchemaInput<S[K]>;
};

/**
 * Schema for object props whose fields are validated by a shape.
 *
 * @remarks
 * Create it with `prop.object(shape)`. Unknown keys are preserved; use
 * {@link ObjectSchema.strict} to reject keys that are not in the shape. Use
 * `prop.record(value)` for dictionaries, or `prop.any<T>()` for an object that
 * is deliberately unchecked.
 *
 * @typeParam T - Normalized object type.
 * @typeParam I - Object input type.
 *
 * @public
 */
export class ObjectSchema<
	T extends object = Record<string, unknown>,
	I extends object = T,
> extends PropSchema<T, I> {
	/** @internal */
	private _shape: Record<string, PropSchema<unknown, unknown>>;
	/** @internal */
	private _strict = false;

	constructor(shape: Record<string, PropSchema<unknown, unknown>>) {
		super();
		if (typeof shape !== "object" || shape === null || Array.isArray(shape)) {
			throw new ForgeFrameError(
				"VALIDATION",
				"prop.object(shape) requires a shape. Use prop.record(value) for dictionaries, or prop.any<T>() for an object that is deliberately unchecked.",
			);
		}
		for (const [field, schema] of Object.entries(shape)) {
			assertNestedSchema(
				schema,
				`prop.object(shape) requires a schema for "${field}". Use prop.any() for a field that is deliberately unchecked.`,
			);
		}
		this._shape = { ...shape };
	}

	/** @internal */
	protected _validate(value: unknown): StandardSchemaV1Result<T> {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return {
				issues: [
					{
						message: `Expected object, got ${Array.isArray(value) ? "array" : typeof value}`,
					},
				],
			};
		}

		const obj = value as Record<string, unknown>;
		const unknownKey = findUnknownObjectKey(obj, this._shape, this._strict);
		if (unknownKey !== undefined)
			return {
				issues: [{ message: `Unknown key: ${unknownKey}`, path: [unknownKey] }],
			};
		return validateObjectFields<T>(obj, {}, this._shape, this._strict);
	}

	/** @internal */
	protected _clone(): ObjectSchema<T, I> {
		const clone = this._copyBaseTo(new ObjectSchema<T, I>(this._shape));
		clone._strict = this._strict;
		return clone;
	}

	/**
	 * Rejects objects with keys not present in the configured shape.
	 *
	 * @returns A cloned object schema that rejects unknown keys.
	 */
	strict(): ObjectSchema<T, I> {
		const clone = this._clone();
		clone._strict = true;
		return clone;
	}
}

/**
 * Schema for string-keyed record objects with value validation.
 *
 * @remarks
 * Record schemas accept plain objects and validate every enumerable string-keyed
 * value with the supplied value schema.
 *
 * @typeParam T - Normalized record value type.
 * @typeParam I - Record value input type.
 *
 * @public
 */
export class RecordSchema<T = unknown, I = T> extends PropSchema<
	Record<string, T>,
	Record<string, I>
> {
	/** @internal */
	private _valueSchema: PropSchema<T, I>;

	constructor(schema: PropSchema<T, I>) {
		super();
		assertNestedSchema(
			schema,
			"prop.record(value) requires a value schema. Use prop.any<Record<string, T>>() for a record whose values are deliberately unchecked.",
		);
		this._valueSchema = schema;
	}

	/** @internal */
	protected _validate(
		value: unknown,
	): StandardSchemaV1Result<Record<string, T>> {
		const issues = checkRecordInput(value);
		if (issues) return { issues };

		return validateRecordEntries(
			value as Record<string, unknown>,
			this._valueSchema,
		);
	}

	/** @internal */
	protected _clone(): RecordSchema<T, I> {
		return this._copyBaseTo(new RecordSchema(this._valueSchema));
	}
}

/** Composes nested schemas after outer shape constraints pass. */
function validateArrayItems<T, I>(
	value: unknown[],
	itemSchema: PropSchema<T, I>,
): StandardSchemaV1Result<T[]> {
	const validated: T[] = [];
	for (let i = 0; i < value.length; i++) {
		const result = validateSchemaSync(itemSchema, value[i]);
		if (result.issues) {
			return { issues: prependIssuePath(result.issues, i) };
		}
		validated.push(result.value);
	}

	return { value: validated };
}

/** Composes nested schemas after outer shape constraints pass. */
function validateTupleItems<S extends readonly PropSchema<unknown, unknown>[]>(
	value: unknown[],
	itemSchemas: S,
): StandardSchemaV1Result<InferTupleShape<S>> {
	const validated: unknown[] = [];

	for (const [i, itemSchema] of itemSchemas.entries()) {
		const result = validateSchemaSync(itemSchema, value[i]);
		if (result.issues) {
			return { issues: prependIssuePath(result.issues, i) };
		}

		validated[i] = result.value;
	}

	// Each item was validated by its schema, so the array has the tuple's shape.
	return { value: validated as InferTupleShape<S> };
}

/** Decides strict-key policy without executing child schemas. */
function findUnknownObjectKey(
	obj: Record<string, unknown>,
	shape: Record<string, PropSchema<unknown, unknown>>,
	strict: boolean,
): string | undefined {
	if (!strict) return undefined;
	const shapeKeys = new Set(Object.keys(shape));
	return Object.keys(obj).find((key) => !shapeKeys.has(key));
}

/** Composes field schemas and assembles their output in definition order. */
function validateObjectFields<T>(
	obj: Record<string, unknown>,
	result: Record<string, unknown>,
	shape: Record<string, PropSchema<unknown, unknown>>,
	strict: boolean,
): StandardSchemaV1Result<T> {
	for (const [key, schema] of Object.entries(shape)) {
		const fieldResult = validateSchemaSync(
			schema,
			Object.hasOwn(obj, key) ? obj[key] : undefined,
		);
		if (fieldResult.issues) {
			return { issues: prependIssuePath(fieldResult.issues, key) };
		}
		if (fieldResult.value !== undefined || Object.hasOwn(obj, key)) {
			defineDataProperty(result, key, fieldResult.value);
		}
	}

	if (!strict) {
		for (const key of Object.keys(obj)) {
			if (!Object.hasOwn(shape, key)) {
				defineDataProperty(result, key, obj[key]);
			}
		}
	}

	return { value: result as T };
}

/** Composes nested schemas after outer shape constraints pass. */
function validateRecordEntries<T, I>(
	value: Record<string, unknown>,
	valueSchema: PropSchema<T, I>,
): StandardSchemaV1Result<Record<string, T>> {
	const validated: Record<string, T> = {};

	for (const [key, entry] of Object.entries(value)) {
		const result = validateSchemaSync(valueSchema, entry);
		if (result.issues) {
			return { issues: prependIssuePath(result.issues, key) };
		}

		defineDataProperty(validated as Record<string, unknown>, key, result.value);
	}

	return { value: validated };
}

/** Checks outer constraints without executing a nested schema. */
function checkArrayConstraints(
	value: unknown,
	lengthChecks: readonly SchemaCheck<number>[],
): ReadonlyArray<StandardSchemaV1Issue> | null {
	if (!Array.isArray(value)) {
		return [{ message: `Expected array, got ${typeof value}` }];
	}
	const issue = findFailedSchemaCheck(lengthChecks, value.length);
	return issue ? [issue] : null;
}

/** Checks outer constraints without executing a nested schema. */
function checkTupleConstraints(
	value: unknown,
	length: number,
): ReadonlyArray<StandardSchemaV1Issue> | null {
	if (!Array.isArray(value)) {
		return [{ message: `Expected tuple, got ${getValueKind(value)}` }];
	}

	if (value.length !== length) {
		return [
			{
				message: `Expected tuple of length ${length}, got ${value.length}`,
			},
		];
	}

	return null;
}

/** Checks outer constraints without executing a nested schema. */
function checkRecordInput(
	value: unknown,
): ReadonlyArray<StandardSchemaV1Issue> | null {
	if (!isPlainObject(value)) {
		return [{ message: `Expected record object, got ${getValueKind(value)}` }];
	}

	return null;
}
