import { PropSchema } from './base';
import {
  AnySchema,
  BooleanSchema,
  DateSchema,
  FunctionSchema,
  NumberSchema,
  StringSchema,
} from './primitives';
import {
  ArraySchema,
  ObjectSchema,
  RecordSchema,
  TupleSchema,
} from './composite';
import {
  EnumSchema,
  LiteralSchema,
  UnionSchema,
} from './literals';

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
 *   tags: prop.array().of(prop.string()).default([]),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends (...args: any[]) => any = (...args: any[]) => any,
  >(): FunctionSchema<T> => new FunctionSchema<T>(),

  /**
   * Creates an array schema.
   *
   * @typeParam T - Array item type.
   * @returns A new array schema.
   */
  array: <T = unknown>(): ArraySchema<T> => new ArraySchema<T>(),

  /**
   * Creates a tuple schema with fixed positional item types.
   *
   * @typeParam S - Tuple of item schemas.
   * @param schemas - Positional item schemas.
   * @returns A new tuple schema.
   */
  tuple: <S extends readonly PropSchema<unknown>[]>(
    ...schemas: S
  ): TupleSchema<S> => new TupleSchema(schemas),

  /**
   * Creates an object schema.
   *
   * @typeParam T - Object type.
   * @returns A new object schema.
   */
  object: <T extends object = Record<string, unknown>>(): ObjectSchema<T> =>
    new ObjectSchema<T>(),

  /**
   * Creates a record schema for string-keyed objects.
   *
   * @typeParam T - Record value type.
   * @param schema - Schema used to validate each record value.
   * @returns A new record schema.
   */
  record: <T>(schema: PropSchema<T>): RecordSchema<T> => new RecordSchema(schema),

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
  union: <S extends readonly [PropSchema<unknown>, ...PropSchema<unknown>[]]>(
    ...schemas: S
  ): UnionSchema<S> => new UnionSchema(schemas),

  /**
   * Creates a schema that accepts any value.
   *
   * @returns A new schema that accepts any value.
   */
  any: (): AnySchema => new AnySchema(),
} as const;

/**
 * Type alias for the prop factory namespace.
 *
 * @public
 */
export type Prop = typeof prop;
