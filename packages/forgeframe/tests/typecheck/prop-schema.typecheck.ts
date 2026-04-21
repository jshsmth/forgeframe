/**
 * Type-level assertions for ForgeFrame's built-in prop schema builders.
 *
 * Covers inference for union, record, date, and tuple schemas, plus
 * optional/default chaining on top of those inferred outputs.
 */
import { prop } from '@/props/prop';
import type { InferOutput } from '@/props/schema';

type IsEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends <
  T,
>() => T extends B ? 1 : 2
  ? true
  : false;

type Assert<T extends true> = T;

const _unionSchema = prop.union(prop.string(), prop.number());
const _optionalUnionSchema = _unionSchema.optional();
const _branchOptionalUnionSchema = prop.union(
  prop.string(),
  prop.number().optional()
);
const _branchNullableUnionSchema = prop.union(
  prop.string(),
  prop.number().nullable()
);
const _recordSchema = prop.record(prop.number());
const _defaultedRecordSchema = _recordSchema.default({});
const _dateSchema = prop.date();
const _tupleSchema = prop.tuple(prop.string(), prop.number());
const _emptyTupleSchema = prop.tuple();

export const assertUnionOutput: Assert<
  IsEqual<InferOutput<typeof _unionSchema>, string | number>
> = true;

export const assertOptionalUnionOutput: Assert<
  IsEqual<InferOutput<typeof _optionalUnionSchema>, string | number | undefined>
> = true;

export const assertBranchOptionalUnionOutput: Assert<
  IsEqual<InferOutput<typeof _branchOptionalUnionSchema>, string | number | undefined>
> = true;

export const assertBranchNullableUnionOutput: Assert<
  IsEqual<InferOutput<typeof _branchNullableUnionSchema>, string | number | null>
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
