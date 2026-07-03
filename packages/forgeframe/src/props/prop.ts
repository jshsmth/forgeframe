/**
 * @packageDocumentation
 * Lightweight prop schema builders for ForgeFrame.
 *
 * @remarks
 * This module provides a fluent, Zod-like API for defining prop schemas.
 * All schemas implement StandardSchemaV1, enabling seamless integration with
 * ForgeFrame's validation pipeline and compatibility with external schema
 * libraries.
 */

export {
  PropSchema,
} from './prop/base';

export {
  AnySchema,
  BooleanSchema,
  DateSchema,
  FunctionSchema,
  NumberSchema,
  StringSchema,
} from './prop/primitives';

export {
  ArraySchema,
  ObjectSchema,
  RecordSchema,
  TupleSchema,
  type InferObjectShape,
} from './prop/composite';

export {
  EnumSchema,
  LiteralSchema,
  UnionSchema,
} from './prop/literals';

export {
  prop,
  type Prop,
} from './prop/factory';
