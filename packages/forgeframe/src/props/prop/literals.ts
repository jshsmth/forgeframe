import type {
  StandardSchemaV1Issue,
  StandardSchemaV1Result,
} from '../schema';
import type { InferUnionSchemaOutput } from './base';
import {
  PropSchema,
  validateSchemaSync,
} from './base';

/**
 * Schema for literal value props.
 *
 * @remarks
 * Literal schemas accept only the exact string, number, or boolean value supplied
 * to `prop.literal()`.
 *
 * @typeParam T - Literal type.
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
        issues: [
          { message: `Expected ${JSON.stringify(this._value)}, got ${JSON.stringify(value)}` },
        ],
      };
    }

    return { value: value as T };
  }

  /** @internal */
  protected _clone(): LiteralSchema<T> {
    return this._copyBaseTo(new LiteralSchema(this._value));
  }
}

/**
 * Schema for enum/union value props.
 *
 * @remarks
 * Enum schemas accept one of the provided string or number values.
 *
 * @typeParam T - Union of allowed values.
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
    return this._copyBaseTo(new EnumSchema(this._values));
  }
}

/**
 * Schema that accepts values matching any one of several sub-schemas.
 *
 * @remarks
 * Branches are tried in order and the first successful branch provides the
 * returned value. `null` and `undefined` are passed to branches unless the union
 * itself is marked nullable, optional, or defaulted.
 *
 * @typeParam S - Tuple of union branch schemas.
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
  protected _validateInput(
    value: unknown
  ): StandardSchemaV1Result<InferUnionSchemaOutput<S>> {
    if (value === null) {
      if (this._nullable) {
        return { value: null as InferUnionSchemaOutput<S> };
      }

      return this._validate(value);
    }

    if (value === undefined) {
      if (this._default !== undefined) {
        return { value: this._getDefaultValue() as InferUnionSchemaOutput<S> };
      }

      if (this._optional) {
        return { value: undefined as InferUnionSchemaOutput<S> };
      }

      return this._validate(value);
    }

    return this._validate(value);
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
    return this._copyBaseTo(new UnionSchema(this._schemas));
  }
}
