/**
 * @packageDocumentation
 * Props handling module for ForgeFrame.
 *
 * @remarks
 * This module handles prop normalization, validation, serialization, and
 * deserialization for cross-domain component communication.
 */

export {
	getPropsForHost,
	propsToBodyParams,
	propsToQueryParams,
} from "./normalize";
// The emitted declaration of the default `ForgeFrame` object names the schema
// classes through this module, so keep them exported here.
export {
	AnySchema,
	ArraySchema,
	BooleanSchema,
	DateSchema,
	EnumSchema,
	FunctionSchema,
	LiteralSchema,
	NumberSchema,
	ObjectSchema,
	PropSchema,
	RecordSchema,
	StringSchema,
	TupleSchema,
	UnionSchema,
} from "./prop";
export { isStandardSchema } from "./schema";
export { serializeProps } from "./serialize";
