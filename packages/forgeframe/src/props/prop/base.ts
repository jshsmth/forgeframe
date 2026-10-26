import { isDate, isPlainObject } from "../../utils/realm-values";

export { isPlainObject } from "../../utils/realm-values";

import {
	isAsyncSchemaResult,
	isStandardSchema,
	type StandardSchemaV1,
	type StandardSchemaV1Issue,
	type StandardSchemaV1Props,
	type StandardSchemaV1Result,
} from "../schema";

export function testRegExpStateless(pattern: RegExp, value: string): boolean {
	if (pattern.global || pattern.sticky) {
		const stateless = new RegExp(
			pattern.source,
			pattern.flags.replace(/[gy]/g, ""),
		);
		return stateless.test(value);
	}

	return pattern.test(value);
}

export function validateSchemaSync<T>(
	schema: StandardSchemaV1<unknown, T>,
	value: unknown,
): StandardSchemaV1Result<T> {
	const result = schema["~standard"].validate(value);

	if (isAsyncSchemaResult(result)) {
		throw new Error(
			"Async schema validation is not supported. Use synchronous schemas.",
		);
	}

	return result;
}

export function prependIssuePath(
	issues: ReadonlyArray<StandardSchemaV1Issue>,
	segment: PropertyKey,
): StandardSchemaV1Issue[] {
	return issues.map((issue: StandardSchemaV1Issue) => ({
		...issue,
		path: [segment, ...(issue.path || [])],
	}));
}

export function getValueKind(value: unknown): string {
	if (Array.isArray(value)) {
		return "array";
	}

	if (value === null) {
		return "null";
	}

	if (isDate(value)) {
		return "Date";
	}

	return typeof value;
}

export function formatDateForMessage(date: Date): string {
	return Number.isNaN(date.getTime()) ? "Invalid Date" : date.toISOString();
}

export function defineDataProperty(
	target: Record<string, unknown>,
	key: string,
	value: unknown,
): void {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		writable: true,
		value,
	});
}

export function validateDateBound(date: Date, method: "min" | "max"): number {
	const time = date.getTime();

	if (Number.isNaN(time)) {
		throw new Error(`prop.date().${method}() requires a valid Date`);
	}

	return time;
}

/**
 * One schema refinement. Refinements accumulate: checks run by rank, then in
 * the order they were added, and the first failure is reported.
 * @internal
 */
export interface SchemaCheck<T> {
	rank: number;
	message: string;
	test: (value: T) => boolean;
}

/** Adds a refinement without replacing earlier refinements of the same kind. @internal */
export function addSchemaCheck<T>(
	checks: readonly SchemaCheck<T>[],
	check: SchemaCheck<T>,
): readonly SchemaCheck<T>[] {
	return [...checks, check].sort((a, b) => a.rank - b.rank);
}

/** Finds the first failed refinement for a value of the schema's base type. @internal */
export function findFailedSchemaCheck<T>(
	checks: readonly SchemaCheck<T>[],
	value: T,
): StandardSchemaV1Issue | undefined {
	const failed = checks.find((check) => !check.test(value));
	return failed && { message: failed.message };
}

export type InferSchemaValue<S extends PropSchema<unknown, unknown>> =
	S extends PropSchema<infer Output, unknown> ? Output : never;

export type InferSchemaInput<S extends PropSchema<unknown, unknown>> =
	S extends PropSchema<unknown, infer Input> ? Input : never;

export type InferUnionSchemaOutput<
	S extends readonly [
		PropSchema<unknown, unknown>,
		...PropSchema<unknown, unknown>[],
	],
> = InferSchemaValue<S[number]>;

export type InferUnionSchemaInput<
	S extends readonly [
		PropSchema<unknown, unknown>,
		...PropSchema<unknown, unknown>[],
	],
> = InferSchemaInput<S[number]>;

export type InferTupleShape<S extends readonly PropSchema<unknown, unknown>[]> =
	{
		-readonly [K in keyof S]: InferSchemaValue<S[K]>;
	};

export type InferTupleInputShape<
	S extends readonly PropSchema<unknown, unknown>[],
> = {
	-readonly [K in keyof S]: InferSchemaInput<S[K]>;
};

/**
 * Output of a schema with a default: `undefined` input is replaced, so
 * `undefined` remains only when the default value itself can be `undefined`.
 * @internal
 */
export type DefaultedSchemaOutput<T, D> =
	| Exclude<T, undefined>
	| (undefined extends D ? undefined : never);

/**
 * Selects a presence action without evaluating defaults or nested schemas.
 * A default takes precedence over optionality for `undefined`. Union schemas
 * delegate unhandled `null` and `undefined` to their members instead of rejecting early.
 * @internal
 */
export function selectSchemaPresence(
	value: unknown,
	optional: boolean,
	nullable: boolean,
	hasDefault: boolean,
	union = false,
): "validate" | "default" | "null" | "undefined" | "missing" | "invalid-null" {
	if (value === null)
		return nullable ? "null" : union ? "validate" : "invalid-null";
	if (value !== undefined) return "validate";
	if (hasDefault) return "default";
	if (optional) return "undefined";
	return union ? "validate" : "missing";
}

/**
 * Executes only the selected presence action, calling at most one supplied callback.
 * Default values are returned directly without passing through `validate`.
 * @internal
 */
export function validateSchemaPresence<T>(
	decision: ReturnType<typeof selectSchemaPresence>,
	value: unknown,
	getDefault: () => T,
	validate: (value: unknown) => StandardSchemaV1Result<T>,
): StandardSchemaV1Result<T> {
	switch (decision) {
		case "default":
			return { value: getDefault() };
		case "null":
			return { value: null as T };
		case "undefined":
			return { value: undefined as T };
		case "missing":
			return { issues: [{ message: "Required" }] };
		case "invalid-null":
			return { issues: [{ message: "Expected a value, got null" }] };
		case "validate":
			return validate(value);
	}
}

/**
 * Copies array, plain-object and `Date` defaults, so instances never share a
 * default value. Shared and cyclic references are copied once, keeping the
 * default's shape. Other values, such as class instances, are returned as is.
 * @internal
 */
export function copyDefaultValue<T>(value: T): T {
	return copyDefaultEntry(value, new WeakMap()) as T;
}

/** Copies one default entry, reusing the copy of an object seen before. */
function copyDefaultEntry(
	value: unknown,
	copies: WeakMap<object, unknown>,
): unknown {
	if (typeof value !== "object" || value === null) return value;
	if (copies.has(value)) return copies.get(value);
	if (isDate(value)) {
		const copy = new Date(value.getTime());
		copies.set(value, copy);
		return copy;
	}
	if (Array.isArray(value)) {
		const copy: unknown[] = new Array(value.length);
		copies.set(value, copy);
		for (let index = 0; index < value.length; index += 1) {
			if (index in value) copy[index] = copyDefaultEntry(value[index], copies);
		}
		return copy;
	}
	if (isPlainObject(value)) {
		const copy: Record<string, unknown> = {};
		copies.set(value, copy);
		for (const [key, entry] of Object.entries(value)) {
			copy[key] = copyDefaultEntry(entry, copies);
		}
		return copy;
	}
	return value;
}

/**
 * Rejects a missing nested schema when a composite schema is built.
 * @internal
 */
export function assertNestedSchema(schema: unknown, message: string): void {
	if (!isStandardSchema(schema)) throw new TypeError(message);
}

/**
 * Abstract base class for all ForgeFrame prop schemas.
 *
 * @remarks
 * Prop schemas are immutable builders. Methods such as {@link PropSchema.optional},
 * {@link PropSchema.nullable}, and {@link PropSchema.default} return cloned
 * schemas instead of mutating the original instance.
 *
 * @typeParam T - The output type after validation.
 * @typeParam I - The input type accepted before validation.
 *
 * @public
 */
export abstract class PropSchema<T, I = T> implements StandardSchemaV1<I, T> {
	/** @internal */
	protected _optional = false;
	/** @internal */
	protected _nullable = false;
	/** @internal */
	protected _default?: T | (() => T);

	/** @internal */
	readonly "~standard": StandardSchemaV1Props<I, T> = {
		version: 1,
		vendor: "forgeframe",
		validate: (value: unknown): StandardSchemaV1Result<T> =>
			this._validateInput(value),
	};

	/** @internal */
	protected abstract _validate(value: unknown): StandardSchemaV1Result<T>;

	/** @internal */
	protected _getDefaultValue(): T {
		return typeof this._default === "function"
			? (this._default as () => T)()
			: copyDefaultValue(this._default as T);
	}

	/** @internal */
	protected _validateInput(value: unknown): StandardSchemaV1Result<T> {
		return validateSchemaPresence(
			selectSchemaPresence(
				value,
				this._optional,
				this._nullable,
				this._default !== undefined,
			),
			value,
			() => this._getDefaultValue(),
			(input) => this._validate(input),
		);
	}

	/**
	 * Marks this prop as optional.
	 *
	 * @returns A cloned schema that accepts `undefined`.
	 */
	optional(): PropSchema<T | undefined, I | undefined> {
		const clone = this._clone();
		clone._optional = true;
		return clone as PropSchema<T | undefined, I | undefined>;
	}

	/**
	 * Marks this prop as nullable.
	 *
	 * @returns A cloned schema that accepts `null`.
	 */
	nullable(): PropSchema<T | null, I | null> {
		const clone = this._clone();
		clone._nullable = true;
		return clone as PropSchema<T | null, I | null>;
	}

	/**
	 * Sets a default value for this prop.
	 *
	 * @remarks
	 * The default replaces `undefined` input, so the output excludes `undefined`
	 * unless the default itself can be `undefined`, even after `.optional()`.
	 *
	 * Array, plain-object and `Date` defaults are copied for each use, so
	 * instances never share them.
	 *
	 * @param value - Non-callable default value or a factory that returns the default value.
	 * Function defaults must use a factory, for example `.default(() => callback)`.
	 * @returns A cloned schema that uses the default when input is `undefined`.
	 */
	default<D extends Exclude<T, (...args: never[]) => unknown>>(
		value: D,
	): PropSchema<DefaultedSchemaOutput<T, D>, I | undefined>;
	default<D extends T>(
		value: () => D,
	): PropSchema<DefaultedSchemaOutput<T, D>, I | undefined>;
	default(value: T | (() => T)): PropSchema<unknown, I | undefined> {
		const clone = this._clone();
		clone._default = value;
		return clone;
	}

	/** @internal */
	protected abstract _clone(): PropSchema<T, I>;

	/** @internal */
	protected _copyBaseTo<S extends PropSchema<unknown, unknown>>(clone: S): S {
		clone._optional = this._optional;
		clone._nullable = this._nullable;
		clone._default = this._default;
		return clone;
	}
}
