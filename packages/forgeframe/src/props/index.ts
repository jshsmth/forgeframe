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
} from "./definitions";

export {
	getPropsForHost,
	normalizeProps,
	propsToBodyParams,
	propsToQueryParams,
	validateProps,
} from "./normalize";
export {
	AnySchema,
	ArraySchema,
	BooleanSchema,
	DateSchema,
	EnumSchema,
	FunctionSchema,
	type InferObjectInputShape,
	type InferObjectShape,
	LiteralSchema,
	NumberSchema,
	ObjectSchema,
	type Prop,
	PropSchema,
	prop,
	RecordSchema,
	StringSchema,
	TupleSchema,
	UnionSchema,
} from "./prop";

export {
	type InferInput,
	type InferOutput,
	isStandardSchema,
	type StandardSchemaV1,
	type StandardSchemaV1FailureResult,
	type StandardSchemaV1Issue,
	type StandardSchemaV1PathSegment,
	type StandardSchemaV1Props,
	type StandardSchemaV1Result,
	type StandardSchemaV1SuccessResult,
	type StandardSchemaV1Types,
	validateWithSchema,
} from "./schema";
export {
	deserializeProps,
	serializeProps,
} from "./serialize";
