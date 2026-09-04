import type { StandardSchemaV1Result } from '../schema';
import {
  formatDateForMessage,
  getValueKind,
  PropSchema,
  testRegExpStateless,
  validateDateBound,
} from './base';

/**
 * Schema for string props with optional validation constraints.
 *
 * @remarks
 * String schemas can trim values before validation and can enforce length,
 * pattern, email, URL, and UUID constraints.
 *
 * @public
 */
export class StringSchema extends PropSchema<string> {
  /** @internal */
  private _minLength?: number;
  /** @internal */
  private _maxLength?: number;
  /** @internal */
  private _pattern?: RegExp;
  /** @internal */
  private _patternMessage?: string;
  /** @internal */
  private _trim = false;

  /** @internal */
  protected _validate(value: unknown): StandardSchemaV1Result<string> {
    if (typeof value !== 'string') {
      return { issues: [{ message: `Expected string, got ${typeof value}` }] };
    }

    const str = this._trim ? value.trim() : value;

    if (this._minLength !== undefined && str.length < this._minLength) {
      return {
        issues: [{ message: `String must be at least ${this._minLength} characters` }],
      };
    }
    if (this._maxLength !== undefined && str.length > this._maxLength) {
      return {
        issues: [{ message: `String must be at most ${this._maxLength} characters` }],
      };
    }
    if (this._pattern && !testRegExpStateless(this._pattern, str)) {
      return {
        issues: [
          {
            message:
              this._patternMessage ||
              `String must match pattern ${this._pattern}`,
          },
        ],
      };
    }

    return { value: str };
  }

  /** @internal */
  protected _clone(): StringSchema {
    const clone = this._copyBaseTo(new StringSchema());
    clone._minLength = this._minLength;
    clone._maxLength = this._maxLength;
    clone._pattern = this._pattern;
    clone._patternMessage = this._patternMessage;
    clone._trim = this._trim;
    return clone;
  }

  /**
   * Requires a minimum string length.
   *
   * @param length - Minimum number of characters.
   * @returns A cloned string schema with the minimum length constraint.
   */
  min(length: number): StringSchema {
    const clone = this._clone();
    clone._minLength = length;
    return clone;
  }

  /**
   * Requires a maximum string length.
   *
   * @param length - Maximum number of characters.
   * @returns A cloned string schema with the maximum length constraint.
   */
  max(length: number): StringSchema {
    const clone = this._clone();
    clone._maxLength = length;
    return clone;
  }

  /**
   * Requires an exact string length.
   *
   * @param length - Exact number of characters.
   * @returns A cloned string schema with matching minimum and maximum length constraints.
   */
  length(length: number): StringSchema {
    const clone = this._clone();
    clone._minLength = length;
    clone._maxLength = length;
    return clone;
  }

  /**
   * Requires the string to match a regular expression.
   *
   * @param regex - Pattern to match.
   * @param message - Optional custom error message.
   * @returns A cloned string schema with the pattern constraint.
   */
  pattern(regex: RegExp, message?: string): StringSchema {
    const clone = this._clone();
    clone._pattern = regex;
    clone._patternMessage = message;
    return clone;
  }

  /**
   * Validates the string as an email address.
   *
   * @returns A cloned string schema with an email pattern constraint.
   */
  email(): StringSchema {
    return this.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address');
  }

  /**
   * Validates the string as an HTTP or HTTPS URL.
   *
   * @returns A cloned string schema with a URL pattern constraint.
   */
  url(): StringSchema {
    return this.pattern(/^https?:\/\/.+/, 'Invalid URL');
  }

  /**
   * Validates the string as a UUID.
   *
   * @returns A cloned string schema with a UUID pattern constraint.
   */
  uuid(): StringSchema {
    return this.pattern(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'Invalid UUID'
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
   * @returns A cloned string schema with a minimum length of 1.
   */
  nonempty(): StringSchema {
    const clone = this._clone();
    clone._minLength = 1;
    return clone;
  }
}

/**
 * Schema for number props with optional validation constraints.
 *
 * @remarks
 * Number schemas reject `NaN` and can enforce inclusive range constraints or
 * integer-only values.
 *
 * @public
 */
export class NumberSchema extends PropSchema<number> {
  /** @internal */
  private _min?: number;
  /** @internal */
  private _max?: number;
  /** @internal */
  private _int = false;

  /** @internal */
  protected _validate(value: unknown): StandardSchemaV1Result<number> {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return { issues: [{ message: `Expected number, got ${typeof value}` }] };
    }
    if (this._int && !Number.isInteger(value)) {
      return { issues: [{ message: 'Expected integer' }] };
    }
    if (this._min !== undefined && value < this._min) {
      return { issues: [{ message: `Number must be >= ${this._min}` }] };
    }
    if (this._max !== undefined && value > this._max) {
      return { issues: [{ message: `Number must be <= ${this._max}` }] };
    }

    return { value };
  }

  /** @internal */
  protected _clone(): NumberSchema {
    const clone = this._copyBaseTo(new NumberSchema());
    clone._min = this._min;
    clone._max = this._max;
    clone._int = this._int;
    return clone;
  }

  /**
   * Requires a minimum number value.
   *
   * @param n - Minimum value, inclusive.
   * @returns A cloned number schema with the minimum value constraint.
   */
  min(n: number): NumberSchema {
    const clone = this._clone();
    clone._min = n;
    return clone;
  }

  /**
   * Requires a maximum number value.
   *
   * @param n - Maximum value, inclusive.
   * @returns A cloned number schema with the maximum value constraint.
   */
  max(n: number): NumberSchema {
    const clone = this._clone();
    clone._max = n;
    return clone;
  }

  /**
   * Requires an integer value.
   *
   * @returns A cloned number schema that accepts only integers.
   */
  int(): NumberSchema {
    const clone = this._clone();
    clone._int = true;
    return clone;
  }

  /**
   * Requires a positive value greater than zero.
   *
   * @returns A cloned number schema with a positive-value constraint.
   */
  positive(): NumberSchema {
    const clone = this._clone();
    clone._min = Number.MIN_VALUE;
    return clone;
  }

  /**
   * Requires a value greater than or equal to zero.
   *
   * @returns A cloned number schema with a non-negative constraint.
   */
  nonnegative(): NumberSchema {
    const clone = this._clone();
    clone._min = 0;
    return clone;
  }

  /**
   * Requires a negative value less than zero.
   *
   * @returns A cloned number schema with a negative-value constraint.
   */
  negative(): NumberSchema {
    const clone = this._clone();
    clone._max = -Number.MIN_VALUE;
    return clone;
  }
}

/**
 * Schema for `Date` props with optional range constraints.
 *
 * @remarks
 * Date schemas accept only valid `Date` instances. String timestamps and
 * numeric timestamps must be converted to `Date` before validation.
 *
 * @public
 */
export class DateSchema extends PropSchema<Date> {
  /** @internal */
  private _minTime?: number;
  /** @internal */
  private _maxTime?: number;

  /** @internal */
  protected _validate(value: unknown): StandardSchemaV1Result<Date> {
    if (!(value instanceof Date)) {
      return { issues: [{ message: `Expected Date, got ${getValueKind(value)}` }] };
    }

    const time = value.getTime();
    if (Number.isNaN(time)) {
      return { issues: [{ message: 'Expected valid Date' }] };
    }

    if (this._minTime !== undefined && time < this._minTime) {
      return {
        issues: [
          {
            message: `Date must be on or after ${formatDateForMessage(new Date(this._minTime))}`,
          },
        ],
      };
    }

    if (this._maxTime !== undefined && time > this._maxTime) {
      return {
        issues: [
          {
            message: `Date must be on or before ${formatDateForMessage(new Date(this._maxTime))}`,
          },
        ],
      };
    }

    return { value };
  }

  /** @internal */
  protected _clone(): DateSchema {
    const clone = this._copyBaseTo(new DateSchema());
    clone._minTime = this._minTime;
    clone._maxTime = this._maxTime;
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
    const clone = this._clone();
    clone._minTime = validateDateBound(date, 'min');
    return clone;
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
    const clone = this._clone();
    clone._maxTime = validateDateBound(date, 'max');
    return clone;
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
    if (typeof value !== 'boolean') {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends (...args: any[]) => any = (...args: any[]) => any,
> extends PropSchema<T> {
  /** @internal */
  protected _validate(value: unknown): StandardSchemaV1Result<T> {
    if (typeof value !== 'function') {
      return { issues: [{ message: `Expected function, got ${typeof value}` }] };
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
export class AnySchema extends PropSchema<
  NonNullable<unknown> | null,
  NonNullable<unknown> | null
> {
  constructor() {
    super();
    this._nullable = true;
  }

  /** @internal */
  protected _validate(
    value: unknown
  ): StandardSchemaV1Result<NonNullable<unknown> | null> {
    return { value: value as NonNullable<unknown> | null };
  }

  /** @internal */
  protected _clone(): AnySchema {
    return this._copyBaseTo(new AnySchema());
  }
}
