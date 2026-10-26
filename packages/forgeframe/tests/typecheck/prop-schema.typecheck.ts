/**
 * Type-level assertions for ForgeFrame's built-in prop schema builders.
 *
 * Covers output and input inference for primitive, object, tuple, array,
 * record, and union schemas, including nested optional/default values.
 */
import { prop } from "@/props/prop";
import type { InferInput, InferOutput } from "@/props/schema";

type IsEqual<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;

type Assert<T extends true> = T;

const _unionSchema = prop.union(prop.string(), prop.number());
const _optionalUnionSchema = _unionSchema.optional();
const _branchOptionalUnionSchema = prop.union(
	prop.string(),
	prop.number().optional(),
);
const _branchNullableUnionSchema = prop.union(
	prop.string(),
	prop.number().nullable(),
);
const _recordSchema = prop.record(prop.number());
const _defaultedRecordSchema = _recordSchema.default({});
const _dateSchema = prop.date();
const _tupleSchema = prop.tuple(prop.string(), prop.number());
const _emptyTupleSchema = prop.tuple();
const _nestedObjectSchema = prop.object({
	requiredField: prop.boolean(),
	defaultedField: prop.string().default("default"),
	optionalField: prop.number().optional(),
});
const _defaultedTupleSchema = prop.tuple(
	prop.string().default("default"),
	prop.number().optional(),
);
const _defaultedArraySchema = prop.array(prop.string().default("default"));
const _defaultedValueRecordSchema = prop.record(prop.number().default(0));
const _defaultedBranchUnionSchema = prop.union(
	prop.string(),
	prop.number().default(0),
);
const _anySchema = prop.any();

export const assertUnionOutput: Assert<
	IsEqual<InferOutput<typeof _unionSchema>, string | number>
> = true;

export const assertOptionalUnionOutput: Assert<
	IsEqual<InferOutput<typeof _optionalUnionSchema>, string | number | undefined>
> = true;

export const assertBranchOptionalUnionOutput: Assert<
	IsEqual<
		InferOutput<typeof _branchOptionalUnionSchema>,
		string | number | undefined
	>
> = true;

export const assertBranchNullableUnionOutput: Assert<
	IsEqual<
		InferOutput<typeof _branchNullableUnionSchema>,
		string | number | null
	>
> = true;

export const assertRecordOutput: Assert<
	IsEqual<InferOutput<typeof _recordSchema>, Record<string, number>>
> = true;

export const assertDefaultedRecordOutput: Assert<
	IsEqual<InferOutput<typeof _defaultedRecordSchema>, Record<string, number>>
> = true;

const _optionalDefaultedSchema = prop.number().optional().default(0);
const _optionalUndefinedDefaultSchema = prop
	.function<() => void>()
	.optional()
	.default(() => undefined);

export const assertOptionalDefaultedOutput: Assert<
	IsEqual<InferOutput<typeof _optionalDefaultedSchema>, number>
> = true;

export const assertOptionalDefaultedInput: Assert<
	IsEqual<InferInput<typeof _optionalDefaultedSchema>, number | undefined>
> = true;

export const assertOptionalUndefinedDefaultOutput: Assert<
	IsEqual<
		InferOutput<typeof _optionalUndefinedDefaultSchema>,
		(() => void) | undefined
	>
> = true;

export const assertDateOutput: Assert<
	IsEqual<InferOutput<typeof _dateSchema>, Date>
> = true;

export const assertTupleOutput: Assert<
	IsEqual<InferOutput<typeof _tupleSchema>, [string, number]>
> = true;

export const assertEmptyTupleOutput: Assert<
	IsEqual<InferOutput<typeof _emptyTupleSchema>, []>
> = true;

const nestedObjectInput: InferInput<typeof _nestedObjectSchema> = {
	requiredField: true,
};
const nestedObjectOutput: InferOutput<typeof _nestedObjectSchema> = {
	requiredField: true,
	defaultedField: "default",
};
// @ts-expect-error Defaults make the normalized output field required.
const outputWithoutDefault: InferOutput<typeof _nestedObjectSchema> = {
	requiredField: true,
};
// @ts-expect-error A field that cannot produce undefined stays required.
const outputWithoutRequired: InferOutput<typeof _nestedObjectSchema> = {
	defaultedField: "default",
};

const _optionalOutputObject = prop.object({
	optionalBranch: prop.union(prop.string(), prop.number().optional()),
	nullable: prop.string().nullable(),
});
const optionalBranchOutput: InferOutput<typeof _optionalOutputObject> = {
	nullable: null,
};
// @ts-expect-error Accepting null does not allow an output field to be omitted.
const missingNullableOutput: InferOutput<typeof _optionalOutputObject> = {};

const _readonlyObjectSchema = prop.object({
	required: prop.string(),
	optional: prop.string().optional(),
} as const);
declare const readonlyOutput: InferOutput<typeof _readonlyObjectSchema>;
// @ts-expect-error Existing readonly shape modifiers are retained.
readonlyOutput.required = "changed";
// @ts-expect-error Optionality does not remove readonly shape modifiers.
readonlyOutput.optional = "changed";
const defaultedTupleInput: InferInput<typeof _defaultedTupleSchema> = [
	undefined,
	undefined,
];
const defaultedArrayInput: InferInput<typeof _defaultedArraySchema> = [
	undefined,
];
const defaultedValueRecordInput: InferInput<
	typeof _defaultedValueRecordSchema
> = { first: undefined };
const defaultedBranchUnionInput: InferInput<
	typeof _defaultedBranchUnionSchema
> = undefined;
const anyInput: InferInput<typeof _anySchema> = null;
void nestedObjectInput;
void nestedObjectOutput;
void outputWithoutDefault;
void outputWithoutRequired;
void optionalBranchOutput;
void missingNullableOutput;
void defaultedTupleInput;
void defaultedArrayInput;
void defaultedValueRecordInput;
void defaultedBranchUnionInput;
void anyInput;

// @ts-expect-error object inputs retain fields without defaults
const invalidNestedObjectInput: InferInput<typeof _nestedObjectSchema> = {};
void invalidNestedObjectInput;

// @ts-expect-error prop.any() input excludes undefined
const invalidAnyInput: InferInput<typeof _anySchema> = undefined;
void invalidAnyInput;

// prop.any<T>() types a deliberately unchecked value.
type Config = { theme: string };
export const assertTypedAnyOutput: Assert<
	IsEqual<InferOutput<ReturnType<typeof prop.any<Config>>>, Config>
> = true;
export const assertTypedAnyArrayInput: Assert<
	IsEqual<InferInput<ReturnType<typeof prop.any<Config[]>>>, Config[]>
> = true;
export const assertShapedObjectOutput: Assert<
	IsEqual<
		InferOutput<typeof _nestedObjectSchema>,
		{ requiredField: boolean; defaultedField: string } & {
			optionalField?: number | undefined;
		}
	>
> = true;
export const assertItemArrayOutput: Assert<
	IsEqual<InferOutput<typeof _defaultedArraySchema>, string[]>
> = true;

// @ts-expect-error prop.object() requires a shape; use prop.any<T>() instead
prop.object();
// @ts-expect-error prop.object<T>() without a shape is no longer an assertion
prop.object<Config>();
// @ts-expect-error prop.array() requires an item schema
prop.array();
// @ts-expect-error prop.array<T>() without an item schema is no longer an assertion
prop.array<string>();
// @ts-expect-error .shape() was removed; pass the shape to prop.object(shape)
prop.object({}).shape({});
// @ts-expect-error .of() was removed; pass the item schema to prop.array(item)
prop.array(prop.string()).of(prop.number());

// Callable outputs always use factories, including widened fluent builders.
const callback = (value: number): string => String(value);
const callbackSchema = prop.function<typeof callback>().default(() => callback);
const nestedCallbacks = prop.object({ callback: callbackSchema });
const callbackInput: InferInput<typeof nestedCallbacks> = {};
const callbackOutput: InferOutput<typeof nestedCallbacks> = { callback };
const callbackResult: string = callbackOutput.callback(1);
prop
	.function<typeof callback>()
	.optional()
	.nullable()
	.default(() => callback);
prop.function<typeof callback>().nullable().default(null);
prop
	.function<typeof callback>()
	.optional()
	.default(() => undefined);
// @ts-expect-error A callback value is not a default factory.
prop.function<typeof callback>().default(callback);
// @ts-expect-error A direct no-op callback returns void rather than a callback.
prop.function<() => void>().default(() => {});
// @ts-expect-error Optional chaining does not admit direct callback values.
prop.function<typeof callback>().optional().default(callback);
// @ts-expect-error Nullable chaining does not admit direct callback values.
prop.function<typeof callback>().nullable().default(callback);
// @ts-expect-error Chaining after a default retains the factory requirement.
callbackSchema.optional().nullable().default(callback);
// @ts-expect-error Defaults do not change the callback's return type.
const invalidCallbackResult: number = callbackOutput.callback(1);
void callbackInput;
void callbackResult;
void invalidCallbackResult;
