/**
 * Type-level assertions for Standard Schema typings in `#internal/props/schema`.
 *
 * Covers `InferInput`/`InferOutput`, issue/path segment type contracts, success/failure result constraints, and metadata typing.
 */
import type {
  InferInput,
  InferOutput,
  StandardSchemaV1,
  StandardSchemaV1FailureResult,
  StandardSchemaV1Issue,
  StandardSchemaV1PathSegment,
  StandardSchemaV1SuccessResult,
  StandardSchemaV1Types,
} from '#internal/props/schema';

type IsEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends <
  T,
>() => T extends B ? 1 : 2
  ? true
  : false;

type Assert<T extends true> = T;

type ExampleSchema = StandardSchemaV1<
  { rawEmail: string },
  { email: string; normalized: boolean }
>;

export const assertInferInput: Assert<
  IsEqual<InferInput<ExampleSchema>, { rawEmail: string }>
> = true;

export const assertInferOutput: Assert<
  IsEqual<InferOutput<ExampleSchema>, { email: string; normalized: boolean }>
> = true;

export const issueWithMixedPathSegments: StandardSchemaV1Issue = {
  message: 'Invalid email',
  path: ['users', { index: 0 }, { key: 'email' }],
  code: 'invalid_email',
  input: 123,
};

export const issueWithoutPath: StandardSchemaV1Issue = {
  message: 'Missing value',
};

export const validPathSegmentByKey: StandardSchemaV1PathSegment = { key: 'x' };
export const validPathSegmentByIndex: StandardSchemaV1PathSegment = {
  index: 1,
};
export const validPathSegmentEmpty: StandardSchemaV1PathSegment = {};

// @ts-expect-error index must be a number when provided
export const invalidPathSegment: StandardSchemaV1PathSegment = { index: '1' };

export const successResult: StandardSchemaV1SuccessResult<string> = {
  value: 'ok',
  issues: undefined,
};

export const failureResult: StandardSchemaV1FailureResult = {
  issues: [{ message: 'Not ok' }],
  value: undefined,
};

// @ts-expect-error failure result value cannot be a concrete value
export const invalidFailureResult: StandardSchemaV1FailureResult = { issues: [{ message: 'Not ok' }], value: 'not-undefined' };

export const schemaTypesMetadata: StandardSchemaV1Types<string, number> = {
  input: '',
  output: 0,
};
