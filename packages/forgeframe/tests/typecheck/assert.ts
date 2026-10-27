/**
 * Type-level assertions shared by the type tests.
 *
 * `IsEqual` is exact: `any`, `readonly` and optional modifiers all count, so
 * an inferred type that collapses to `any` fails instead of passing an
 * assignability check in both directions.
 */

/** Whether `A` and `B` are the same type. */
export type IsEqual<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;

/** Compiles only when `T` is `true`. */
export type Assert<T extends true> = T;

/**
 * Flattens an intersection into one object type, so `IsEqual` compares its
 * members. It drops call signatures, so use it on object types only.
 */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

// IsEqual rejects any on either side; if this stops compiling, the helper lets any through.
// biome-ignore lint/suspicious/noExplicitAny: this checks that IsEqual rejects any.
type AnyComparisons = IsEqual<any, string> | IsEqual<string, any>;
export const anyIsNotEqual: Assert<IsEqual<AnyComparisons, false>> = true;
