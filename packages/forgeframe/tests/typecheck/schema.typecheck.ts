/**
 * Type-level assertions for Standard Schema typings in `@/props/schema`.
 *
 * Covers the `StandardSchemaV1.InferInput`/`InferOutput` helpers, issue/path
 * segment type contracts, success/failure result constraints, metadata typing,
 * and the schema classes, which the public entry exports as types only.
 */
import { z } from "zod";
import {
	type StandardSchemaV1 as PublicStandardSchemaV1,
	prop,
	type StringSchema,
} from "@/index";
import type {
	StandardSchemaV1,
	StandardSchemaV1FailureResult,
	StandardSchemaV1Issue,
	StandardSchemaV1PathSegment,
	StandardSchemaV1SuccessResult,
	StandardSchemaV1Types,
} from "@/props/schema";
import type { Assert, IsEqual } from "./assert";

type ExampleSchema = StandardSchemaV1<
	{ rawEmail: string },
	{ email: string; normalized: boolean }
>;

export const assertInferInput: Assert<
	IsEqual<StandardSchemaV1.InferInput<ExampleSchema>, { rawEmail: string }>
> = true;

export const assertInferOutput: Assert<
	IsEqual<
		StandardSchemaV1.InferOutput<ExampleSchema>,
		{ email: string; normalized: boolean }
	>
> = true;

// The public helpers replace InferSchemaOutput, for any Standard Schema.
const userSchema = z.object({ name: z.string() });
export const assertPublicInferOutput: Assert<
	IsEqual<
		PublicStandardSchemaV1.InferOutput<typeof userSchema>,
		{ name: string }
	>
> = true;
const countSchema = prop.number().optional();
export const assertPropInferInput: Assert<
	IsEqual<
		PublicStandardSchemaV1.InferInput<typeof countSchema>,
		number | undefined
	>
> = true;

// Schema classes name a schema's type; prop.* builds them.
const emailSchema: StringSchema = prop.string().email();
void emailSchema;

type PublicApi = typeof import("@/index");
// @ts-expect-error schema classes are type-only exports; build schemas with prop.*
type StringSchemaValue = PublicApi["StringSchema"];
// @ts-expect-error isStandardSchema is internal; check '~standard' in value yourself
type IsStandardSchemaValue = PublicApi["isStandardSchema"];
// @ts-expect-error CONTEXT was removed; write 'iframe' or 'popup' (ContextType)
type ContextValue = PublicApi["CONTEXT"];
// @ts-expect-error EVENT was removed; write event names such as 'rendered' (EventType)
type EventValue = PublicApi["EVENT"];
// @ts-expect-error InferSchemaOutput was removed; use StandardSchemaV1.InferOutput
type RemovedInferSchemaOutput = import("@/index").InferSchemaOutput<
	typeof userSchema
>;
// @ts-expect-error Prop was removed; use typeof prop
type RemovedProp = import("@/index").Prop;
export type RemovedValueExports = [
	StringSchemaValue,
	IsStandardSchemaValue,
	ContextValue,
	EventValue,
	RemovedInferSchemaOutput,
	RemovedProp,
];

export const issueWithMixedPathSegments: StandardSchemaV1Issue = {
	message: "Invalid email",
	path: ["users", { index: 0 }, { key: "email" }],
	code: "invalid_email",
	input: 123,
};

export const issueWithoutPath: StandardSchemaV1Issue = {
	message: "Missing value",
};

export const validPathSegmentByKey: StandardSchemaV1PathSegment = { key: "x" };
export const validPathSegmentByIndex: StandardSchemaV1PathSegment = {
	index: 1,
};
export const validPathSegmentEmpty: StandardSchemaV1PathSegment = {};

// @ts-expect-error index must be a number when provided
export const invalidPathSegment: StandardSchemaV1PathSegment = { index: "1" };

export const successResult: StandardSchemaV1SuccessResult<string> = {
	value: "ok",
	issues: undefined,
};

export const failureResult: StandardSchemaV1FailureResult = {
	issues: [{ message: "Not ok" }],
	value: undefined,
};

export const invalidFailureResult: StandardSchemaV1FailureResult = {
	issues: [{ message: "Not ok" }],
	// @ts-expect-error failure result value cannot be a concrete value
	value: "not-undefined",
};

export const schemaTypesMetadata: StandardSchemaV1Types<string, number> = {
	input: "",
	output: 0,
};
