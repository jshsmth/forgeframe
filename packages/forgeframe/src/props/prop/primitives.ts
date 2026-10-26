import { isDate } from "../../utils/realm-values";
import type { StandardSchemaV1Result } from "../schema";
import {
	addSchemaCheck,
	findFailedSchemaCheck,
	formatDateForMessage,
	getValueKind,
	PropSchema,
	type SchemaCheck,
	testRegExpStateless,
	validateDateBound,
} from "./base";

/** Checks absolute HTTP(S) URL syntax without normalizing the schema output. */
function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

/** String refinements run length checks, then URL syntax, then patterns. */
const STRING_LENGTH_RANK = 0;
const STRING_URL_RANK = 1;
const STRING_PATTERN_RANK = 2;

/** Number refinements run integer checks, then lower bounds, then upper bounds. */
const NUMBER_INTEGER_RANK = 0;
const NUMBER_LOWER_BOUND_RANK = 1;
const NUMBER_UPPER_BOUND_RANK = 2;

/** Date refinements run lower bounds, then upper bounds. */
const DATE_LOWER_BOUND_RANK = 0;
const DATE_UPPER_BOUND_RANK = 1;

/**
 * Schema for string props with optional validation constraints.
 *
 * @remarks
 * String schemas can trim values before validation and can enforce length,
 * pattern, email, URL, and UUID constraints. Constraints accumulate, so
 * `.email().pattern(...)` requires both.
 *
 * @public
 */
export class StringSchema extends PropSchema<string> {
	/** @internal */
	private _checks: readonly SchemaCheck<string>[] = [];
	/** @internal */
	private _trim = false;

	/** @internal */
	protected _validate(value: unknown): StandardSchemaV1Result<string> {
		if (typeof value !== "string") {
			return { issues: [{ message: `Expected string, got ${typeof value}` }] };
		}

		const str = this._trim ? value.trim() : value;
		const issue = findFailedSchemaCheck(this._checks, str);
		return issue ? { issues: [issue] } : { value: str };
	}

	/** @internal */
	protected _clone(): StringSchema {
		const clone = this._copyBaseTo(new StringSchema());
		clone._checks = this._checks;
		clone._trim = this._trim;
		return clone;
	}

	/** @internal */
	private _withCheck(check: SchemaCheck<string>): StringSchema {
		const clone = this._clone();
		clone._checks = addSchemaCheck(this._checks, check);
		return clone;
	}

	/**
	 * Requires a minimum string length.
	 *
	 * @param length - Minimum number of characters.
	 * @returns A cloned string schema with the minimum length constraint.
	 */
	min(length: number): StringSchema {
		return this._withCheck({
			rank: STRING_LENGTH_RANK,
			message: `String must be at least ${length} characters`,
			test: (value) => value.length >= length,
		});
	}

	/**
	 * Requires a maximum string length.
	 *
	 * @param length - Maximum number of characters.
	 * @returns A cloned string schema with the maximum length constraint.
	 */
	max(length: number): StringSchema {
		return this._withCheck({
			rank: STRING_LENGTH_RANK,
			message: `String must be at most ${length} characters`,
			test: (value) => value.length <= length,
		});
	}

	/**
	 * Requires an exact string length.
	 *
	 * @param length - Exact number of characters.
	 * @returns A cloned string schema with matching minimum and maximum length constraints.
	 */
	length(length: number): StringSchema {
		return this.min(length).max(length);
	}

	/**
	 * Requires the string to match a regular expression.
	 *
	 * @param regex - Pattern to match.
	 * @param message - Optional custom error message.
	 * @returns A cloned string schema with the pattern constraint.
	 */
	pattern(regex: RegExp, message?: string): StringSchema {
		return this._withCheck({
			rank: STRING_PATTERN_RANK,
			message: message || `String must match pattern ${regex}`,
			test: (value) => testRegExpStateless(regex, value),
		});
	}

	/**
	 * Validates the string as an email address.
	 *
	 * @returns A cloned string schema with an email pattern constraint.
	 */
	email(): StringSchema {
		return this.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address");
	}

	/**
	 * Validates the string as an HTTP or HTTPS URL.
	 *
	 * @returns A cloned string schema requiring a parseable absolute HTTP(S) URL.
	 */
	url(): StringSchema {
		return this._withCheck({
			rank: STRING_URL_RANK,
			message: "Invalid URL",
			test: isHttpUrl,
		});
	}

	/**
	 * Validates the string as a UUID.
	 *
	 * @returns A cloned string schema with a UUID pattern constraint.
	 */
	uuid(): StringSchema {
		return this.pattern(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
			"Invalid UUID",
		);
	}

	/**
	 * Trims leading and trailing whitespace before validation.
	 *
	 * @returns A cloned string schema that validates and returns the trimmed value.
	 */
	trim(): StringSchema {
		const clone = this._clone();
		clone._trim = true;
		return clone;
	}

	/**
	 * Requires a non-empty string.
	 *
	 * @returns A cloned string schema that also requires at least 1 character.
	 */
	nonempty(): StringSchema {
		return this.min(1);
	}
}

/**
 * Schema for number props with optional validation constraints.
 *
 * @remarks
 * Number schemas reject nonfinite values and can enforce range constraints or
 * integer-only values. Constraints accumulate, so `.min(10).positive()`
 * requires both.
 *
 * @public
 */
export class NumberSchema extends PropSchema<number> {
	/** @internal */
	private _checks: readonly SchemaCheck<number>[] = [];

	/** @internal */
	protected _validate(value: unknown): StandardSchemaV1Result<number> {
		if (typeof value !== "number") {
			return { issues: [{ message: `Expected number, got ${typeof value}` }] };
		}
		if (Number.isNaN(value)) {
			return { issues: [{ message: "Expected number, got NaN" }] };
		}
		if (!Number.isFinite(value)) {
			return { issues: [{ message: "Expected finite number" }] };
		}
		const issue = findFailedSchemaCheck(this._checks, value);
		return issue ? { issues: [issue] } : { value };
	}

	/** @internal */
	protected _clone(): NumberSchema {
		const clone = this._copyBaseTo(new NumberSchema());
		clone._checks = this._checks;
		return clone;
	}

	/** @internal */
	private _withCheck(check: SchemaCheck<number>): NumberSchema {
		const clone = this._clone();
		clone._checks = addSchemaCheck(this._checks, check);
		return clone;
	}

	/**
	 * Requires a minimum number value.
	 *
	 * @param n - Minimum value, inclusive.
	 * @returns A cloned number schema with the minimum value constraint.
	 */
	min(n: number): NumberSchema {
		return this._withCheck({
			rank: NUMBER_LOWER_BOUND_RANK,
			message: `Number must be >= ${n}`,
			test: (value) => value >= n,
		});
	}

	/**
	 * Requires a maximum number value.
	 *
	 * @param n - Maximum value, inclusive.
	 * @returns A cloned number schema with the maximum value constraint.
	 */
	max(n: number): NumberSchema {
		return this._withCheck({
			rank: NUMBER_UPPER_BOUND_RANK,
			message: `Number must be <= ${n}`,
			test: (value) => value <= n,
		});
	}

	/**
	 * Requires an integer value.
	 *
	 * @returns A cloned number schema that accepts only integers.
	 */
	int(): NumberSchema {
		return this._withCheck({
			rank: NUMBER_INTEGER_RANK,
			message: "Expected integer",
			test: Number.isInteger,
		});
	}

	/**
	 * Requires a positive value greater than zero.
	 *
	 * @returns A cloned number schema with a positive-value constraint.
	 */
	positive(): NumberSchema {
		return this._withCheck({
			rank: NUMBER_LOWER_BOUND_RANK,
			message: "Number must be > 0",
			test: (value) => value > 0,
		});
	}

	/**
	 * Requires a value greater than or equal to zero.
	 *
	 * @returns A cloned number schema with a non-negative constraint.
	 */
	nonnegative(): NumberSchema {
		return this.min(0);
	}

	/**
	 * Requires a negative value less than zero.
	 *
	 * @returns A cloned number schema with a negative-value constraint.
	 */
	negative(): NumberSchema {
		return this._withCheck({
			rank: NUMBER_UPPER_BOUND_RANK,
			message: "Number must be < 0",
			test: (value) => value < 0,
		});
	}
}

/**
 * Schema for `Date` props with optional range constraints.
 *
 * @remarks
 * Date schemas accept only valid `Date` instances. String timestamps and
 * numeric timestamps must be converted to `Date` before validation. Range
 * constraints accumulate.
 *
 * @public
 */
export class DateSchema extends PropSchema<Date> {
	/** @internal */
	private _checks: readonly SchemaCheck<number>[] = [];

	/** @internal */
	protected _validate(value: unknown): StandardSchemaV1Result<Date> {
		if (!isDate(value)) {
			return {
				issues: [{ message: `Expected Date, got ${getValueKind(value)}` }],
			};
		}

		const time = value.getTime();
		if (Number.isNaN(time)) {
			return { issues: [{ message: "Expected valid Date" }] };
		}

		const issue = findFailedSchemaCheck(this._checks, time);
		return issue ? { issues: [issue] } : { value };
	}

	/** @internal */
	protected _clone(): DateSchema {
		const clone = this._copyBaseTo(new DateSchema());
		clone._checks = this._checks;
		return clone;
	}

	/** @internal */
	private _withCheck(check: SchemaCheck<number>): DateSchema {
		const clone = this._clone();
		clone._checks = addSchemaCheck(this._checks, check);
		return clone;
	}

	/**
	 * Requires the date to be on or after the provided value.
	 *
	 * @param date - Minimum date, inclusive.
	 * @returns A cloned date schema with the minimum date constraint.
	 *
	 * @throws Error if `date` is an invalid `Date`.
	 */
	min(date: Date): DateSchema {
		const minTime = validateDateBound(date, "min");
		return this._withCheck({
			rank: DATE_LOWER_BOUND_RANK,
			message: `Date must be on or after ${formatDateForMessage(new Date(minTime))}`,
			test: (time) => time >= minTime,
		});
	}

	/**
	 * Requires the date to be on or before the provided value.
	 *
	 * @param date - Maximum date, inclusive.
	 * @returns A cloned date schema with the maximum date constraint.
	 *
	 * @throws Error if `date` is an invalid `Date`.
	 */
	max(date: Date): DateSchema {
		const maxTime = validateDateBound(date, "max");
		return this._withCheck({
			rank: DATE_UPPER_BOUND_RANK,
			message: `Date must be on or before ${formatDateForMessage(new Date(maxTime))}`,
			test: (time) => time <= maxTime,
		});
	}
}

/**
 * Schema for boolean props.
 *
 * @public
 */
export class BooleanSchema extends PropSchema<boolean> {
	/** @internal */
	protected _validate(value: unknown): StandardSchemaV1Result<boolean> {
		if (typeof value !== "boolean") {
			return { issues: [{ message: `Expected boolean, got ${typeof value}` }] };
		}

		return { value };
	}

	/** @internal */
	protected _clone(): BooleanSchema {
		return this._copyBaseTo(new BooleanSchema());
	}
}

/**
 * Schema for function props.
 *
 * @typeParam T - Function type signature accepted by this schema.
 *
 * @public
 */
export class FunctionSchema<
	// biome-ignore lint/suspicious/noExplicitAny: Generic callbacks must accept arbitrary argument and return types.
	T extends (...args: any[]) => any = (...args: any[]) => any,
> extends PropSchema<T> {
	/** Checks factory outputs without invoking the returned callback or applying the default again. */
	protected _validateInput(value: unknown): StandardSchemaV1Result<T> {
		if (value === undefined && this._default !== undefined) {
			const fallback = this._getDefaultValue();
			if (
				(fallback === null && this._nullable) ||
				(fallback === undefined && this._optional)
			) {
				return { value: fallback };
			}
			return this._validate(fallback);
		}
		return super._validateInput(value);
	}

	/** @internal */
	protected _validate(value: unknown): StandardSchemaV1Result<T> {
		if (typeof value !== "function") {
			return {
				issues: [{ message: `Expected function, got ${typeof value}` }],
			};
		}

		return { value: value as T };
	}

	/** @internal */
	protected _clone(): FunctionSchema<T> {
		return this._copyBaseTo(new FunctionSchema<T>());
	}
}

/**
 * Schema that accepts any value.
 *
 * @remarks
 * Accepts null by default since "any" means any value.
 *
 * @public
 */
export class AnySchema<T = NonNullable<unknown> | null> extends PropSchema<
	T,
	T
> {
	constructor() {
		super();
		this._nullable = true;
	}

	/** @internal */
	protected _validate(value: unknown): StandardSchemaV1Result<T> {
		return { value: value as T };
	}

	/** @internal */
	protected _clone(): AnySchema<T> {
		return this._copyBaseTo(new AnySchema<T>());
	}
}
