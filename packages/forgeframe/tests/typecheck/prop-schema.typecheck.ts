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
const _nestedObjectSchema = prop.object().shape({
	requiredField: prop.boolean(),
	defaultedField: prop.string().default("default"),
	optionalField: prop.number().optional(),
});
const _defaultedTupleSchema = prop.tuple(
	prop.string().default("default"),
	prop.number().optional(),
);
const _defaultedArraySchema = prop.array().of(prop.string().default("default"));
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

const _optionalOutputObject = prop.object().shape({
	optionalBranch: prop.union(prop.string(), prop.number().optional()),
	nullable: prop.string().nullable(),
});
const optionalBranchOutput: InferOutput<typeof _optionalOutputObject> = {
	nullable: null,
};
// @ts-expect-error Accepting null does not allow an output field to be omitted.
const missingNullableOutput: InferOutput<typeof _optionalOutputObject> = {};

const _readonlyObjectSchema = prop.object().shape({
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

// Callable outputs always use factories, including widened fluent builders.
const callback = (value: number): string => String(value);
const callbackSchema = prop.function<typeof callback>().default(() => callback);
const nestedCallbacks = prop.object().shape({ callback: callbackSchema });
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
