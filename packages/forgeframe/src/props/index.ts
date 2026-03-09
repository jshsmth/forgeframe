/**
 * @packageDocumentation
 * Props handling module for ForgeFrame.
 *
 * @remarks
 * This module handles prop normalization, validation, serialization, and
 * deserialization for cross-domain component communication.
 */

export {
  BUILTIN_PROP_DEFINITIONS,
  type BuiltinProps,
} from './definitions';

export {
  normalizeProps,
  validateProps,
  getPropsForHost,
  propsToQueryParams,
  propsToBodyParams,
} from './normalize';

export {
  serializeProps,
  deserializeProps,
} from './serialize';

export { cloneProps } from './clone';

export {
  isStandardSchema,
  validateWithSchema,
  type StandardSchemaV1,
  type StandardSchemaV1Props,
  type StandardSchemaV1Result,
  type StandardSchemaV1SuccessResult,
  type StandardSchemaV1FailureResult,
  type StandardSchemaV1Issue,
  type StandardSchemaV1PathSegment,
  type StandardSchemaV1Types,
  type InferInput,
  type InferOutput,
} from './schema';

export {
  prop,
  PropSchema,
  StringSchema,
  NumberSchema,
  BooleanSchema,
  FunctionSchema,
  ArraySchema,
  ObjectSchema,
  LiteralSchema,
  EnumSchema,
  AnySchema,
  type Prop,
  type InferObjectShape,
} from './prop';
