/**
 * @packageDocumentation
 * Lightweight prop schema builders for ForgeFrame.
 *
 * @remarks
 * This module provides a fluent, Zod-like API for defining prop schemas.
 * All schemas implement StandardSchemaV1, enabling seamless integration
 * with ForgeFrame's validation pipeline and compatibility with external
 * schema libraries.
 *
 * @example
 * ```typescript
 * import ForgeFrame, { prop } from 'forgeframe';
 *
 * const MyComponent = ForgeFrame.create({
 *   tag: 'my-component',
 *   url: '/component',
 *   props: {
 *     name: prop.string(),
 *     count: prop.number().default(0),
 *     onSubmit: prop.function<(data: unknown) => void>().optional(),
 *   },
 * });
 * ```
 */

import type {
  StandardSchemaV1,
  StandardSchemaV1Props,
  StandardSchemaV1Result,
  StandardSchemaV1Issue,
} from './schema';

function testRegExpStateless(pattern: RegExp, value: string): boolean {
  if (pattern.global || pattern.sticky) {
    const stateless = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
    return stateless.test(value);
  }

  return pattern.test(value);
}

function validateSchemaSync<T>(
  schema: StandardSchemaV1<unknown, T>,
  value: unknown
): StandardSchemaV1Result<T> {
  const result = schema['~standard'].validate(value);

  if (result instanceof Promise) {
    throw new Error(
      'Async schema validation is not supported. Use synchronous schemas.'
    );
  }

  return result;
}

function prependIssuePath(
  issues: ReadonlyArray<StandardSchemaV1Issue>,
  segment: PropertyKey
): StandardSchemaV1Issue[] {
  return issues.map((issue: StandardSchemaV1Issue) => ({
    ...issue,
    path: [segment, ...(issue.path || [])],
  }));
}

function getValueKind(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }

  if (value === null) {
    return 'null';
  }

  if (value instanceof Date) {
    return 'Date';
  }

  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function formatDateForMessage(date: Date): string {
  return Number.isNaN(date.getTime()) ? 'Invalid Date' : date.toISOString();
}

function validateDateBound(date: Date, method: 'min' | 'max'): number {
  const time = date.getTime();

  if (Number.isNaN(time)) {
    throw new Error(`prop.date().${method}() requires a valid Date`);
  }

  return time;
}

type InferSchemaValue<S extends PropSchema<unknown>> =
  S extends PropSchema<infer U> ? U : never;

type InferUnionSchemaOutput<
  S extends readonly [PropSchema<unknown>, ...PropSchema<unknown>[]],
> = InferSchemaValue<S[number]>;

type InferTupleShape<S extends readonly PropSchema<unknown>[]> = {
  -readonly [K in keyof S]: InferSchemaValue<S[K]>;
};

// ============================================================================
// Base Schema Class
// ============================================================================

/**
 * Abstract base class for all prop schemas.
 *
 * @remarks
 * Implements StandardSchemaV1 for compatibility with ForgeFrame's validation
 * system and external schema libraries like Zod, Valibot, and ArkType.
 *
 * @typeParam T - The output type after validation
 *
 * @public
 */
export abstract class PropSchema<T> implements StandardSchemaV1<unknown, T> {
  /** @internal */
  protected _optional = false;
  /** @internal */
  protected _nullable = false;
  /** @internal */
  protected _default?: T | (() => T);

  /**
   * StandardSchemaV1 implementation.
   * @internal
   */
  readonly '~standard': StandardSchemaV1Props<unknown, T> = {
    version: 1,
    vendor: 'forgeframe',
    validate: (value: unknown): StandardSchemaV1Result<T> => {
      if (value === null) {
        if (this._nullable) {
          return { value: null as T };
        }
        return { issues: [{ message: 'Expected a value, got null' }] };
      }

      if (value === undefined) {
        if (this._default !== undefined) {
          const defaultVal =
            typeof this._default === 'function'
              ? (this._default as () => T)()
              : this._default;
          return { value: defaultVal };
        }
        if (this._optional) {
          return { value: undefined as T };
        }
        return { issues: [{ message: 'Required' }] };
      }

      return this._validate(value);
    },
  };

  /**
   * Validates a non-undefined value.
   * @internal
   */
  protected abstract _validate(value: unknown): StandardSchemaV1Result<T>;

  /**
   * Marks this prop as optional.
   *
   * @returns Schema that accepts undefined
   *
   * @example
   * ```typescript
   * props: {
   *   nickname: prop.string().optional(),
   * }
   * ```
   */
  optional(): PropSchema<T | undefined> {
    const clone = this._clone();
    clone._optional = true;
    return clone as PropSchema<T | undefined>;
  }

  /**
   * Marks this prop as nullable (accepts null).
   *
   * @returns Schema that accepts null
   *
   * @example
   * ```typescript
   * props: {
   *   middleName: prop.string().nullable(),
   * }
   * ```
   */
  nullable(): PropSchema<T | null> {
    const clone = this._clone();
    clone._nullable = true;
    return clone as PropSchema<T | null>;
  }

  /**
   * Sets a default value for this prop.
   *
   * @param value - Default value or function returning default
   * @returns Schema with default value
   *
   * @example
   * ```typescript
   * props: {
   *   count: prop.number().default(0),
   *   id: prop.string().default(() => crypto.randomUUID()),
   * }
   * ```
   */
  default(value: T | (() => T)): PropSchema<T> {
    const clone = this._clone();
    clone._default = value;
    return clone;
  }

  /**
   * Creates a shallow clone of this schema.
   * @internal
   */
  protected abstract _clone(): PropSchema<T>;
}

// ============================================================================
// String Schema
// ============================================================================

/**
 * Schema for string props with optional validation constraints.
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
      return {
        issues: [{ message: `Expected string, got ${typeof value}` }],
      };
    }

    const str = this._trim ? value.trim() : value;

    if (this._minLength !== undefined && str.length < this._minLength) {
      return {
        issues: [
          { message: `String must be at least ${this._minLength} characters` },
        ],
      };
    }
    if (this._maxLength !== undefined && str.length > this._maxLength) {
      return {
        issues: [
          { message: `String must be at most ${this._maxLength} characters` },
        ],
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
    const clone = new StringSchema();
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._default = this._default;
    clone._minLength = this._minLength;
    clone._maxLength = this._maxLength;
    clone._pattern = this._pattern;
    clone._patternMessage = this._patternMessage;
    clone._trim = this._trim;
    return clone;
  }

  /**
   * Requires minimum string length.
   *
   * @param length - Minimum number of characters
   *
   * @example
   * ```typescript
   * name: prop.string().min(2)
   * ```
   */
  min(length: number): StringSchema {
    const clone = this._clone();
    clone._minLength = length;
    return clone;
  }

  /**
   * Requires maximum string length.
   *
   * @param length - Maximum number of characters
   *
   * @example
   * ```typescript
   * bio: prop.string().max(500)
   * ```
   */
  max(length: number): StringSchema {
    const clone = this._clone();
    clone._maxLength = length;
    return clone;
  }

  /**
   * Requires exact string length.
   *
   * @param length - Exact number of characters required
   *
   * @example
   * ```typescript
   * code: prop.string().length(6)
   * ```
   */
  length(length: number): StringSchema {
    const clone = this._clone();
    clone._minLength = length;
    clone._maxLength = length;
    return clone;
  }

  /**
   * Requires string to match a regex pattern.
   *
   * @param regex - Pattern to match
   * @param message - Optional custom error message
   *
   * @example
   * ```typescript
   * slug: prop.string().pattern(/^[a-z0-9-]+$/, 'Invalid slug format')
   * ```
   */
  pattern(regex: RegExp, message?: string): StringSchema {
    const clone = this._clone();
    clone._pattern = regex;
    clone._patternMessage = message;
    return clone;
  }

  /**
   * Validates as email address.
   *
   * @example
   * ```typescript
   * email: prop.string().email()
   * ```
   */
  email(): StringSchema {
    return this.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address');
  }

  /**
   * Validates as URL.
   *
   * @example
   * ```typescript
   * website: prop.string().url()
   * ```
   */
  url(): StringSchema {
    return this.pattern(/^https?:\/\/.+/, 'Invalid URL');
  }

  /**
   * Validates as UUID.
   *
   * @example
   * ```typescript
   * id: prop.string().uuid()
   * ```
   */
  uuid(): StringSchema {
    return this.pattern(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'Invalid UUID'
    );
  }

  /**
   * Trims whitespace from both ends of the string.
   *
   * @remarks
   * The trimmed value is used for validation and returned as the result.
   *
   * @example
   * ```typescript
   * name: prop.string().trim()
   * username: prop.string().trim().min(3)
   * ```
   */
  trim(): StringSchema {
    const clone = this._clone();
    clone._trim = true;
    return clone;
  }

  /**
   * Requires non-empty string (at least 1 character).
   *
   * @example
   * ```typescript
   * title: prop.string().nonempty()
   * ```
   */
  nonempty(): StringSchema {
    const clone = this._clone();
    clone._minLength = 1;
    return clone;
  }
}

// ============================================================================
// Number Schema
// ============================================================================

/**
 * Schema for number props with optional validation constraints.
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
      return {
        issues: [{ message: `Expected number, got ${typeof value}` }],
      };
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
    const clone = new NumberSchema();
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._default = this._default;
    clone._min = this._min;
    clone._max = this._max;
    clone._int = this._int;
    return clone;
  }

  /**
   * Requires minimum value.
   *
   * @param n - Minimum value (inclusive)
   *
   * @example
   * ```typescript
   * age: prop.number().min(0)
   * ```
   */
  min(n: number): NumberSchema {
    const clone = this._clone();
    clone._min = n;
    return clone;
  }

  /**
   * Requires maximum value.
   *
   * @param n - Maximum value (inclusive)
   *
   * @example
   * ```typescript
   * rating: prop.number().max(5)
   * ```
   */
  max(n: number): NumberSchema {
    const clone = this._clone();
    clone._max = n;
    return clone;
  }

  /**
   * Requires integer value.
   *
   * @example
   * ```typescript
   * count: prop.number().int()
   * ```
   */
  int(): NumberSchema {
    const clone = this._clone();
    clone._int = true;
    return clone;
  }

  /**
   * Requires positive number (> 0).
   *
   * @example
   * ```typescript
   * price: prop.number().positive()
   * ```
   */
  positive(): NumberSchema {
    const clone = this._clone();
    clone._min = Number.MIN_VALUE;
    return clone;
  }

  /**
   * Requires non-negative number (>= 0).
   *
   * @example
   * ```typescript
   * quantity: prop.number().nonnegative()
   * ```
   */
  nonnegative(): NumberSchema {
    const clone = this._clone();
    clone._min = 0;
    return clone;
  }

  /**
   * Requires negative number (< 0).
   *
   * @example
   * ```typescript
   * debt: prop.number().negative()
   * ```
   */
  negative(): NumberSchema {
    const clone = this._clone();
    clone._max = -Number.MIN_VALUE;
    return clone;
  }
}

// ============================================================================
// Date Schema
// ============================================================================

/**
 * Schema for `Date` props with optional range constraints.
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
      return {
        issues: [{ message: `Expected Date, got ${getValueKind(value)}` }],
      };
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
    const clone = new DateSchema();
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._default = this._default;
    clone._minTime = this._minTime;
    clone._maxTime = this._maxTime;
    return clone;
  }

  /**
   * Requires the date to be on or after the provided value.
   *
   * @param date - Minimum date (inclusive)
   *
   * @example
   * ```typescript
   * startsAt: prop.date().min(new Date('2026-01-01T00:00:00.000Z'))
   * ```
   */
  min(date: Date): DateSchema {
    const clone = this._clone();
    clone._minTime = validateDateBound(date, 'min');
    return clone;
  }

  /**
   * Requires the date to be on or before the provided value.
   *
   * @param date - Maximum date (inclusive)
   *
   * @example
   * ```typescript
   * endsAt: prop.date().max(new Date('2026-12-31T23:59:59.999Z'))
   * ```
   */
  max(date: Date): DateSchema {
    const clone = this._clone();
    clone._maxTime = validateDateBound(date, 'max');
    return clone;
  }
}

// ============================================================================
// Boolean Schema
// ============================================================================

/**
 * Schema for boolean props.
 *
 * @public
 */
export class BooleanSchema extends PropSchema<boolean> {
  /** @internal */
  protected _validate(value: unknown): StandardSchemaV1Result<boolean> {
    if (typeof value !== 'boolean') {
      return {
        issues: [{ message: `Expected boolean, got ${typeof value}` }],
      };
    }
    return { value };
  }

  /** @internal */
  protected _clone(): BooleanSchema {
    const clone = new BooleanSchema();
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._default = this._default;
    return clone;
  }
}

// ============================================================================
// Function Schema
// ============================================================================

/**
 * Schema for function props.
 *
 * @typeParam T - Function type
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
      return {
        issues: [{ message: `Expected function, got ${typeof value}` }],
      };
    }
    return { value: value as T };
  }

  /** @internal */
  protected _clone(): FunctionSchema<T> {
    const clone = new FunctionSchema<T>();
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._default = this._default;
    return clone;
  }
}

// ============================================================================
// Array Schema
// ============================================================================

/**
 * Schema for array props with optional item validation.
 *
 * @typeParam T - Array item type
 *
 * @public
 */
export class ArraySchema<T = unknown> extends PropSchema<T[]> {
  /** @internal */
  private _itemSchema?: PropSchema<T>;
  /** @internal */
  private _minLength?: number;
  /** @internal */
  private _maxLength?: number;

  /** @internal */
  protected _validate(value: unknown): StandardSchemaV1Result<T[]> {
    if (!Array.isArray(value)) {
      return {
        issues: [{ message: `Expected array, got ${typeof value}` }],
      };
    }
    if (this._minLength !== undefined && value.length < this._minLength) {
      return {
        issues: [
          { message: `Array must have at least ${this._minLength} items` },
        ],
      };
    }
    if (this._maxLength !== undefined && value.length > this._maxLength) {
      return {
        issues: [
          { message: `Array must have at most ${this._maxLength} items` },
        ],
      };
    }

    if (this._itemSchema) {
      const validated: T[] = [];
      for (let i = 0; i < value.length; i++) {
        const result = validateSchemaSync(this._itemSchema, value[i]);
        if (result.issues) {
          return {
            issues: prependIssuePath(result.issues, i),
          };
        }
        validated.push(result.value);
      }
      return { value: validated };
    }

    return { value: value as T[] };
  }

  /** @internal */
  protected _clone(): ArraySchema<T> {
    const clone = new ArraySchema<T>();
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._default = this._default as T[] | (() => T[]) | undefined;
    clone._itemSchema = this._itemSchema;
    clone._minLength = this._minLength;
    clone._maxLength = this._maxLength;
    return clone;
  }

  /**
   * Specifies the schema for array items.
   *
   * @typeParam U - Item type
   * @param schema - Schema for validating each item
   *
   * @example
   * ```typescript
   * tags: prop.array().of(prop.string())
   * scores: prop.array().of(prop.number().min(0).max(100))
   * ```
   */
  of<U>(schema: PropSchema<U>): ArraySchema<U> {
    const clone = new ArraySchema<U>();
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._itemSchema = schema;
    clone._minLength = this._minLength;
    clone._maxLength = this._maxLength;
    return clone;
  }

  /**
   * Requires minimum array length.
   *
   * @param length - Minimum number of items
   *
   * @example
   * ```typescript
   * items: prop.array().min(1)
   * ```
   */
  min(length: number): ArraySchema<T> {
    const clone = this._clone();
    clone._minLength = length;
    return clone;
  }

  /**
   * Requires maximum array length.
   *
   * @param length - Maximum number of items
   *
   * @example
   * ```typescript
   * selections: prop.array().max(5)
   * ```
   */
  max(length: number): ArraySchema<T> {
    const clone = this._clone();
    clone._maxLength = length;
    return clone;
  }

  /**
   * Requires non-empty array.
   *
   * @example
   * ```typescript
   * options: prop.array().nonempty()
   * ```
   */
  nonempty(): ArraySchema<T> {
    return this.min(1);
  }
}

// ============================================================================
// Tuple Schema
// ============================================================================

/**
 * Schema for tuple props with fixed-length positional validation.
 *
 * @typeParam S - Tuple of item schema definitions
 *
 * @public
 */
export class TupleSchema<
  S extends readonly PropSchema<unknown>[] = [],
> extends PropSchema<InferTupleShape<S>> {
  /** @internal */
  private _itemSchemas: S;

  constructor(schemas: S) {
    super();
    this._itemSchemas = schemas;
  }

  /** @internal */
  protected _validate(value: unknown): StandardSchemaV1Result<InferTupleShape<S>> {
    if (!Array.isArray(value)) {
      return {
        issues: [{ message: `Expected tuple, got ${getValueKind(value)}` }],
      };
    }

    if (value.length !== this._itemSchemas.length) {
      return {
        issues: [
          {
            message: `Expected tuple of length ${this._itemSchemas.length}, got ${value.length}`,
          },
        ],
      };
    }

    const validated = [] as unknown as InferTupleShape<S>;

    for (let i = 0; i < this._itemSchemas.length; i++) {
      const result = validateSchemaSync(this._itemSchemas[i], value[i]);
      if (result.issues) {
        return {
          issues: prependIssuePath(result.issues, i),
        };
      }

      validated[i] = result.value as InferTupleShape<S>[number];
    }

    return { value: validated };
  }

  /** @internal */
  protected _clone(): TupleSchema<S> {
    const clone = new TupleSchema(this._itemSchemas);
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._default = this._default;
    return clone;
  }
}

// ============================================================================
// Object Schema
// ============================================================================

/**
 * Infers the output type from an object shape definition.
 * @public
 */
export type InferObjectShape<S extends Record<string, PropSchema<unknown>>> = {
  [K in keyof S]: S[K] extends PropSchema<infer U> ? U : never;
};

/**
 * Schema for object props with optional shape validation.
 *
 * @typeParam T - Object type
 *
 * @public
 */
export class ObjectSchema<T extends object = Record<string, unknown>> extends PropSchema<T> {
  /** @internal */
  private _shape?: Record<string, PropSchema<unknown>>;
  /** @internal */
  private _strict = false;

  /** @internal */
  protected _validate(value: unknown): StandardSchemaV1Result<T> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {
        issues: [
          {
            message: `Expected object, got ${Array.isArray(value) ? 'array' : typeof value}`,
          },
        ],
      };
    }

    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    if (this._shape) {
      if (this._strict) {
        const shapeKeys = new Set(Object.keys(this._shape));
        for (const key of Object.keys(obj)) {
          if (!shapeKeys.has(key)) {
            return {
              issues: [{ message: `Unknown key: ${key}`, path: [key] }],
            };
          }
        }
      }

      for (const [key, schema] of Object.entries(this._shape)) {
        const fieldResult = validateSchemaSync(schema, obj[key]);
        if (fieldResult.issues) {
          return {
            issues: prependIssuePath(fieldResult.issues, key),
          };
        }
        result[key] = fieldResult.value;
      }

      if (!this._strict) {
        for (const key of Object.keys(obj)) {
          if (!(key in this._shape)) {
            result[key] = obj[key];
          }
        }
      }

      return { value: result as T };
    }

    return { value: value as T };
  }

  /** @internal */
  protected _clone(): ObjectSchema<T> {
    const clone = new ObjectSchema<T>();
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._default = this._default;
    clone._shape = this._shape;
    clone._strict = this._strict;
    return clone;
  }

  /**
   * Defines the shape of the object with field schemas.
   *
   * @typeParam S - Shape definition type
   * @param shape - Object mapping field names to schemas
   *
   * @example
   * ```typescript
   * user: prop.object().shape({
   *   name: prop.string(),
   *   age: prop.number().optional(),
   * })
   * ```
   */
  shape<S extends Record<string, PropSchema<unknown>>>(
    shape: S
  ): ObjectSchema<InferObjectShape<S>> {
    const clone = new ObjectSchema<InferObjectShape<S>>();
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._shape = shape;
    clone._strict = this._strict;
    return clone;
  }

  /**
   * Rejects objects with unknown keys.
   *
   * @example
   * ```typescript
   * config: prop.object().shape({ debug: prop.boolean() }).strict()
   * ```
   */
  strict(): ObjectSchema<T> {
    const clone = this._clone();
    clone._strict = true;
    return clone;
  }
}

// ============================================================================
// Record Schema
// ============================================================================

/**
 * Schema for string-keyed record objects with value validation.
 *
 * @typeParam T - Record value type
 *
 * @public
 */
export class RecordSchema<T = unknown> extends PropSchema<Record<string, T>> {
  /** @internal */
  private _valueSchema: PropSchema<T>;

  constructor(schema: PropSchema<T>) {
    super();
    this._valueSchema = schema;
  }

  /** @internal */
  protected _validate(value: unknown): StandardSchemaV1Result<Record<string, T>> {
    if (!isPlainObject(value)) {
      return {
        issues: [
          { message: `Expected record object, got ${getValueKind(value)}` },
        ],
      };
    }

    const validated: Record<string, T> = {};

    for (const [key, entry] of Object.entries(value)) {
      const result = validateSchemaSync(this._valueSchema, entry);
      if (result.issues) {
        return {
          issues: prependIssuePath(result.issues, key),
        };
      }

      validated[key] = result.value;
    }

    return { value: validated };
  }

  /** @internal */
  protected _clone(): RecordSchema<T> {
    const clone = new RecordSchema(this._valueSchema);
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._default = this._default as
      | Record<string, T>
      | (() => Record<string, T>)
      | undefined;
    return clone;
  }
}

// ============================================================================
// Literal Schema
// ============================================================================

/**
 * Schema for literal value props.
 *
 * @typeParam T - Literal type
 *
 * @public
 */
export class LiteralSchema<T extends string | number | boolean> extends PropSchema<T> {
  /** @internal */
  private _value: T;

  constructor(value: T) {
    super();
    this._value = value;
  }

  /** @internal */
  protected _validate(value: unknown): StandardSchemaV1Result<T> {
    if (value !== this._value) {
      return {
        issues: [{ message: `Expected ${JSON.stringify(this._value)}, got ${JSON.stringify(value)}` }],
      };
    }
    return { value: value as T };
  }

  /** @internal */
  protected _clone(): LiteralSchema<T> {
    const clone = new LiteralSchema(this._value);
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._default = this._default;
    return clone;
  }
}

// ============================================================================
// Enum Schema
// ============================================================================

/**
 * Schema for enum/union value props.
 *
 * @typeParam T - Union of allowed values
 *
 * @public
 */
export class EnumSchema<T extends string | number> extends PropSchema<T> {
  /** @internal */
  private _values: readonly T[];
  /** @internal */
  private _valueSet: ReadonlySet<T>;

  constructor(values: readonly T[]) {
    super();
    this._values = values;
    this._valueSet = new Set(values);
  }

  /** @internal */
  protected _validate(value: unknown): StandardSchemaV1Result<T> {
    if (!this._valueSet.has(value as T)) {
      return {
        issues: [
          {
            message: `Expected one of [${this._values.map((v) => JSON.stringify(v)).join(', ')}], got ${JSON.stringify(value)}`,
          },
        ],
      };
    }
    return { value: value as T };
  }

  /** @internal */
  protected _clone(): EnumSchema<T> {
    const clone = new EnumSchema(this._values);
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._default = this._default;
    return clone;
  }
}

// ============================================================================
// Union Schema
// ============================================================================

/**
 * Schema that accepts values matching any one of several sub-schemas.
 *
 * @typeParam S - Tuple of union branch schemas
 *
 * @public
 */
export class UnionSchema<
  S extends readonly [PropSchema<unknown>, ...PropSchema<unknown>[]],
> extends PropSchema<InferUnionSchemaOutput<S>> {
  /** @internal */
  private _schemas: S;

  constructor(schemas: S) {
    super();

    if (schemas.length === 0) {
      throw new Error('prop.union() requires at least one schema');
    }

    this._schemas = schemas;
  }

  /** @internal */
  protected _validate(value: unknown): StandardSchemaV1Result<InferUnionSchemaOutput<S>> {
    const issues: StandardSchemaV1Issue[] = [];

    for (const schema of this._schemas) {
      const result = validateSchemaSync(schema, value);
      if (!result.issues) {
        return { value: result.value as InferUnionSchemaOutput<S> };
      }

      issues.push(...result.issues);
    }

    return { issues };
  }

  /** @internal */
  protected _clone(): UnionSchema<S> {
    const clone = new UnionSchema(this._schemas);
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._default = this._default;
    return clone;
  }
}

// ============================================================================
// Any Schema
// ============================================================================

/**
 * Schema that accepts any value.
 *
 * @remarks
 * Accepts null by default since "any" means any value.
 *
 * @public
 */
export class AnySchema extends PropSchema<unknown> {
  constructor() {
    super();
    this._nullable = true;
  }

  /** @internal */
  protected _validate(value: unknown): StandardSchemaV1Result<unknown> {
    return { value };
  }

  /** @internal */
  protected _clone(): AnySchema {
    const clone = new AnySchema();
    clone._optional = this._optional;
    clone._nullable = this._nullable;
    clone._default = this._default;
    return clone;
  }
}

// ============================================================================
// Prop Factory Namespace
// ============================================================================

/**
 * Factory functions for creating prop schemas.
 *
 * @remarks
 * Use these functions to define props with a fluent, chainable API.
 * All schemas implement StandardSchemaV1 and integrate seamlessly with
 * ForgeFrame's validation system.
 *
 * @example
 * ```typescript
 * import ForgeFrame, { prop } from 'forgeframe';
 *
 * const MyComponent = ForgeFrame.create({
 *   tag: 'my-component',
 *   url: '/component',
 *   props: {
 *     // Required string
 *     name: prop.string(),
 *
 *     // Number with default
 *     count: prop.number().default(0),
 *
 *     // Optional email
 *     email: prop.string().email().optional(),
 *
 *     // Function callback
 *     onSubmit: prop.function<(data: { ok: boolean }) => void>(),
 *
 *     // Array of strings
 *     tags: prop.array().of(prop.string()),
 *
 *     // Nested object
 *     config: prop.object().shape({
 *       theme: prop.enum(['light', 'dark']).default('light'),
 *       debug: prop.boolean().default(false),
 *     }),
 *   },
 * });
 * ```
 *
 * @public
 */
export const prop = {
  /**
   * Creates a string schema.
   *
   * @example
   * ```typescript
   * prop.string()
   * prop.string().min(1).max(100)
   * prop.string().email()
   * prop.string().url()
   * prop.string().pattern(/^[a-z]+$/)
   * ```
   */
  string: (): StringSchema => new StringSchema(),

  /**
   * Creates a number schema.
   *
   * @example
   * ```typescript
   * prop.number()
   * prop.number().min(0).max(100)
   * prop.number().int()
   * prop.number().positive()
   * ```
   */
  number: (): NumberSchema => new NumberSchema(),

  /**
   * Creates a date schema.
   *
   * @example
   * ```typescript
   * prop.date()
   * prop.date().min(new Date('2026-01-01T00:00:00.000Z'))
   * prop.date().max(new Date('2026-12-31T23:59:59.999Z'))
   * ```
   */
  date: (): DateSchema => new DateSchema(),

  /**
   * Creates a boolean schema.
   *
   * @example
   * ```typescript
   * prop.boolean()
   * prop.boolean().default(false)
   * ```
   */
  boolean: (): BooleanSchema => new BooleanSchema(),

  /**
   * Creates a function schema.
   *
   * @typeParam T - Function type signature
   *
   * @example
   * ```typescript
   * prop.function()
   * prop.function<() => void>()
   * prop.function<(data: { id: string }) => Promise<void>>()
   * ```
   */
  function: <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends (...args: any[]) => any = (...args: any[]) => any,
  >(): FunctionSchema<T> => new FunctionSchema<T>(),

  /**
   * Creates an array schema.
   *
   * @typeParam T - Array item type
   *
   * @example
   * ```typescript
   * prop.array()
   * prop.array().of(prop.string())
   * prop.array().of(prop.number()).min(1).max(10)
   * ```
   */
  array: <T = unknown>(): ArraySchema<T> => new ArraySchema<T>(),

  /**
   * Creates a tuple schema with fixed positional item types.
   *
   * @typeParam S - Tuple of item schemas
   *
   * @example
   * ```typescript
   * prop.tuple()
   * prop.tuple(prop.string(), prop.number())
   * prop.tuple(prop.number(), prop.number(), prop.number(), prop.number())
   * ```
   */
  tuple: <S extends readonly PropSchema<unknown>[]>(
    ...schemas: S
  ): TupleSchema<S> => new TupleSchema(schemas),

  /**
   * Creates an object schema.
   *
   * @typeParam T - Object type
   *
   * @example
   * ```typescript
   * prop.object()
   * prop.object().shape({
   *   name: prop.string(),
   *   age: prop.number().optional(),
   * })
   * prop.object().shape({ key: prop.string() }).strict()
   * ```
   */
  object: <T extends object = Record<string, unknown>>(): ObjectSchema<T> =>
    new ObjectSchema<T>(),

  /**
   * Creates a record schema for validating string-keyed objects.
   *
   * @typeParam T - Record value type
   * @param schema - Schema used to validate each record value
   *
   * @example
   * ```typescript
   * prop.record(prop.string())
   * prop.record(prop.number().nonnegative())
   * ```
   */
  record: <T>(schema: PropSchema<T>): RecordSchema<T> => new RecordSchema(schema),

  /**
   * Creates a literal schema for exact value matching.
   *
   * @param value - The exact value to match
   *
   * @example
   * ```typescript
   * prop.literal('active')
   * prop.literal(42)
   * prop.literal(true)
   * ```
   */
  literal: <T extends string | number | boolean>(value: T): LiteralSchema<T> =>
    new LiteralSchema(value),

  /**
   * Creates an enum schema for a set of allowed values.
   *
   * @param values - Array of allowed values
   *
   * @example
   * ```typescript
   * prop.enum(['pending', 'active', 'completed'])
   * prop.enum([1, 2, 3])
   * ```
   */
  enum: <T extends string | number>(values: readonly T[]): EnumSchema<T> =>
    new EnumSchema(values),

  /**
   * Creates a union schema that accepts any matching branch.
   *
   * @typeParam S - Tuple of branch schemas
   * @param schemas - One or more schemas to try in order
   *
   * @example
   * ```typescript
   * prop.union(prop.string(), prop.number())
   * prop.union(
   *   prop.literal('auto'),
   *   prop.object().shape({ mode: prop.string() })
   * )
   * ```
   */
  union: <S extends readonly [PropSchema<unknown>, ...PropSchema<unknown>[]]>(
    ...schemas: S
  ): UnionSchema<S> => new UnionSchema(schemas),

  /**
   * Creates a schema that accepts any value.
   *
   * @remarks
   * Use sparingly - prefer typed schemas when possible.
   *
   * @example
   * ```typescript
   * prop.any()
   * ```
   */
  any: (): AnySchema => new AnySchema(),
} as const;

/**
 * Type alias for the prop factory namespace.
 * @public
 */
export type Prop = typeof prop;
