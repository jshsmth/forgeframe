import type { StandardSchemaV1Result } from '../schema';
import type { InferTupleShape } from './base';
import {
  defineDataProperty,
  getValueKind,
  isPlainObject,
  prependIssuePath,
  PropSchema,
  validateSchemaSync,
} from './base';

/**
 * Schema for array props with optional item validation.
 *
 * @remarks
 * Without an item schema, the array shape is validated and item values are
 * returned as-is. Use {@link ArraySchema.of} to validate each element.
 *
 * @typeParam T - Array item type.
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
      return { issues: [{ message: `Expected array, got ${typeof value}` }] };
    }
    if (this._minLength !== undefined && value.length < this._minLength) {
      return {
        issues: [{ message: `Array must have at least ${this._minLength} items` }],
      };
    }
    if (this._maxLength !== undefined && value.length > this._maxLength) {
      return {
        issues: [{ message: `Array must have at most ${this._maxLength} items` }],
      };
    }

    if (!this._itemSchema) {
      return { value: value as T[] };
    }

    const validated: T[] = [];
    for (let i = 0; i < value.length; i++) {
      const result = validateSchemaSync(this._itemSchema, value[i]);
      if (result.issues) {
        return { issues: prependIssuePath(result.issues, i) };
      }
      validated.push(result.value);
    }

    return { value: validated };
  }

  /** @internal */
  protected _clone(): ArraySchema<T> {
    const clone = this._copyBaseTo(new ArraySchema<T>());
    clone._itemSchema = this._itemSchema;
    clone._minLength = this._minLength;
    clone._maxLength = this._maxLength;
    return clone;
  }

  /**
   * Specifies the schema for array items.
   *
   * @typeParam U - Item type.
   * @param schema - Schema used to validate each item.
   * @returns A cloned array schema with the supplied item schema.
   */
  of<U>(schema: PropSchema<U>): ArraySchema<U> {
    const clone = this._copyPresenceTo(new ArraySchema<U>());
    clone._itemSchema = schema;
    clone._minLength = this._minLength;
    clone._maxLength = this._maxLength;
    return clone;
  }

  /**
   * Requires a minimum array length.
   *
   * @param length - Minimum number of items.
   * @returns A cloned array schema with the minimum length constraint.
   */
  min(length: number): ArraySchema<T> {
    const clone = this._clone();
    clone._minLength = length;
    return clone;
  }

  /**
   * Requires a maximum array length.
   *
   * @param length - Maximum number of items.
   * @returns A cloned array schema with the maximum length constraint.
   */
  max(length: number): ArraySchema<T> {
    const clone = this._clone();
    clone._maxLength = length;
    return clone;
  }

  /**
   * Requires a non-empty array.
   *
   * @returns A cloned array schema with a minimum length of 1.
   */
  nonempty(): ArraySchema<T> {
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
      return { issues: [{ message: `Expected tuple, got ${getValueKind(value)}` }] };
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
        return { issues: prependIssuePath(result.issues, i) };
      }

      validated[i] = result.value as InferTupleShape<S>[number];
    }

    return { value: validated };
  }

  /** @internal */
  protected _clone(): TupleSchema<S> {
    return this._copyBaseTo(new TupleSchema(this._itemSchemas));
  }
}

/**
 * Infers the output type from an object shape definition.
 *
 * @typeParam S - Object shape definition.
 *
 * @public
 */
export type InferObjectShape<S extends Record<string, PropSchema<unknown>>> = {
  [K in keyof S]: S[K] extends PropSchema<infer U> ? U : never;
};

/**
 * Schema for object props with optional shape validation.
 *
 * @remarks
 * By default, shaped object schemas preserve unknown keys. Use
 * {@link ObjectSchema.strict} to reject keys that are not in the configured shape.
 *
 * @typeParam T - Object type.
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

    if (!this._shape) {
      return { value: value as T };
    }

    if (this._strict) {
      const shapeKeys = new Set(Object.keys(this._shape));
      for (const key of Object.keys(obj)) {
        if (!shapeKeys.has(key)) {
          return { issues: [{ message: `Unknown key: ${key}`, path: [key] }] };
        }
      }
    }

    for (const [key, schema] of Object.entries(this._shape)) {
      const fieldResult = validateSchemaSync(schema, obj[key]);
      if (fieldResult.issues) {
        return { issues: prependIssuePath(fieldResult.issues, key) };
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

  /** @internal */
  protected _clone(): ObjectSchema<T> {
    const clone = this._copyBaseTo(new ObjectSchema<T>());
    clone._shape = this._shape;
    clone._strict = this._strict;
    return clone;
  }

  /**
   * Defines the object shape with field schemas.
   *
   * @typeParam S - Shape definition type.
   * @param shape - Object mapping field names to schemas.
   * @returns A cloned object schema whose output type is inferred from `shape`.
   */
  shape<S extends Record<string, PropSchema<unknown>>>(
    shape: S
  ): ObjectSchema<InferObjectShape<S>> {
    const clone = this._copyPresenceTo(new ObjectSchema<InferObjectShape<S>>());
    clone._shape = shape;
    clone._strict = this._strict;
    return clone;
  }

  /**
   * Rejects objects with keys not present in the configured shape.
   *
   * @returns A cloned object schema that rejects unknown keys.
   */
  strict(): ObjectSchema<T> {
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
 * @typeParam T - Record value type.
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
      return { issues: [{ message: `Expected record object, got ${getValueKind(value)}` }] };
    }

    const validated: Record<string, T> = {};

    for (const [key, entry] of Object.entries(value)) {
      const result = validateSchemaSync(this._valueSchema, entry);
      if (result.issues) {
        return { issues: prependIssuePath(result.issues, key) };
      }

      defineDataProperty(validated as Record<string, unknown>, key, result.value);
    }

    return { value: validated };
  }

  /** @internal */
  protected _clone(): RecordSchema<T> {
    return this._copyBaseTo(new RecordSchema(this._valueSchema));
  }
}
