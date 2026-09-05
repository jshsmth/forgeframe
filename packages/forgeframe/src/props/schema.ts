/**
 * Standard Schema V1 type definitions and validation utilities.
 *
 * @remarks
 * These types enable integration with Standard Schema-compliant validation
 * libraries such as Zod, Valibot, ArkType, and others. Types are copied from
 * the official @standard-schema/spec package to maintain zero dependencies.
 *
 * @see https://standardschema.dev/
 *
 * @packageDocumentation
 */

// ============================================================================
// Standard Schema V1 Types
// ============================================================================

/**
 * The Standard Schema V1 interface.
 *
 * @remarks
 * Any schema library implementing this interface can be used with ForgeFrame's
 * prop validation system. The `~standard` property contains the schema metadata
 * and validation function.
 *
 * @typeParam Input - The input type the schema accepts
 * @typeParam Output - The output type after validation/transformation
 *
 * @example
 * ```typescript
 * // Zod schemas implement StandardSchemaV1
 * import { z } from 'zod';
 * const schema: StandardSchemaV1<string, string> = z.string().email();
 * ```
 *
 * @public
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
	readonly "~standard": StandardSchemaV1Props<Input, Output>;
}

/**
 * The properties of the `~standard` key on a Standard Schema.
 *
 * @typeParam Input - The input type the schema accepts
 * @typeParam Output - The output type after validation/transformation
 *
 * @public
 */
export interface StandardSchemaV1Props<Input = unknown, Output = Input> {
	/** The version of the Standard Schema specification (always 1) */
	readonly version: 1;
	/** The name of the schema library (e.g., "zod", "valibot", "arktype") */
	readonly vendor: string;
	/** Optional type metadata for input and output types */
	readonly types?: StandardSchemaV1Types<Input, Output> | undefined;
	/** Validates an unknown value and returns a result */
	readonly validate: (
		value: unknown,
	) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>;
}

/**
 * Type metadata for Standard Schema input and output types.
 *
 * @remarks
 * This is optional metadata used for type inference. The actual values
 * are typically `undefined` at runtime - they exist purely for TypeScript.
 *
 * @typeParam Input - The input type
 * @typeParam Output - The output type
 *
 * @public
 */
export interface StandardSchemaV1Types<Input = unknown, Output = Input> {
	/** The input type (for type inference only) */
	readonly input: Input;
	/** The output type (for type inference only) */
	readonly output: Output;
}

/**
 * The result of a Standard Schema validation.
 *
 * @typeParam Output - The output type on success
 *
 * @public
 */
export type StandardSchemaV1Result<Output> =
	| StandardSchemaV1SuccessResult<Output>
	| StandardSchemaV1FailureResult;

/**
 * A successful validation result containing the validated/transformed value.
 *
 * @typeParam Output - The output type
 *
 * @public
 */
export interface StandardSchemaV1SuccessResult<Output> {
	/** The validated and potentially transformed value */
	readonly value: Output;
	/** Undefined on success */
	readonly issues?: undefined;
}

/**
 * A failed validation result containing validation issues.
 *
 * @public
 */
export interface StandardSchemaV1FailureResult {
	/** Array of validation issues */
	readonly issues: ReadonlyArray<StandardSchemaV1Issue>;
	/** Undefined on failure */
	readonly value?: undefined;
}

/**
 * A validation issue from a Standard Schema.
 *
 * @public
 */
export interface StandardSchemaV1Issue {
	/** Human-readable error message */
	readonly message: string;
	/** Path to the invalid value (for nested objects/arrays) */
	readonly path?: ReadonlyArray<PropertyKey | StandardSchemaV1PathSegment>;
	/** Optional machine-readable error code */
	readonly code?: string | undefined;
	/** The input value that caused this issue */
	readonly input?: unknown;
}

/**
 * A path segment for nested validation issues.
 *
 * @public
 */
export interface StandardSchemaV1PathSegment {
	/** The property key in an object path segment */
	readonly key?: PropertyKey | undefined;
	/** The numeric index in an array path segment */
	readonly index?: number | undefined;
}

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Infers the input type from a Standard Schema.
 *
 * @typeParam Schema - The Standard Schema type
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * const schema = z.string().email();
 * type Input = InferInput<typeof schema>; // string
 * ```
 *
 * @public
 */
export type InferInput<Schema extends StandardSchemaV1> =
	Schema extends StandardSchemaV1<infer I, unknown> ? I : never;

/**
 * Infers the output type from a Standard Schema.
 *
 * @typeParam Schema - The Standard Schema type
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * const schema = z.string().transform(s => s.length);
 * type Output = InferOutput<typeof schema>; // number
 * ```
 *
 * @public
 */
export type InferOutput<Schema extends StandardSchemaV1> =
	Schema extends StandardSchemaV1<unknown, infer O> ? O : never;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Type guard to check if a value is a Standard Schema.
 *
 * @param value - The value to check
 * @returns True if the value implements StandardSchemaV1
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const schema = z.string();
 * if (isStandardSchema(schema)) {
 *   // schema is StandardSchemaV1
 * }
 * ```
 *
 * @public
 */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
	return (
		typeof value === "object" &&
		value !== null &&
		"~standard" in value &&
		typeof (value as StandardSchemaV1)["~standard"] === "object" &&
		(value as StandardSchemaV1)["~standard"] !== null &&
		(value as StandardSchemaV1)["~standard"].version === 1 &&
		typeof (value as StandardSchemaV1)["~standard"].vendor === "string" &&
		typeof (value as StandardSchemaV1)["~standard"].validate === "function"
	);
}

/**
 * Validates a value using a Standard Schema (synchronous only).
 *
 * @remarks
 * This function only supports synchronous validation. If the schema returns
 * a Promise, an error is thrown with instructions to use a sync schema.
 *
 * @typeParam T - The expected output type
 * @param schema - The Standard Schema to validate with
 * @param value - The value to validate
 * @param propName - The prop name (for error messages)
 * @returns The validated and potentially transformed value
 * @throws Error if validation fails or schema is async
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const schema = z.string().email();
 * const email = validateWithSchema(schema, 'user@example.com', 'email');
 * // email is typed as string
 * ```
 *
 * @internal
 */
export function validateWithSchema<T>(
	schema: StandardSchemaV1<unknown, T>,
	value: unknown,
	propName: string,
): T {
	const result = schema["~standard"].validate(value);

	if (result instanceof Promise) {
		throw new Error(
			`Prop "${propName}" uses an async schema. ForgeFrame only supports synchronous ` +
				`schema validation. Please use a synchronous schema or remove async operations ` +
				`(like database lookups) from your schema definition.`,
		);
	}

	if (result.issues) {
		const messages = result.issues.map((issue) => {
			const path = formatIssuePath(issue.path, propName);
			return `${path}: ${issue.message}`;
		});
		throw new Error(`Validation failed: ${messages.join("; ")}`);
	}

	return result.value;
}

/**
 * Formats an issue path for error messages.
 *
 * @param path - The issue path from the schema
 * @param propName - The root prop name
 * @returns Formatted path string
 *
 * @internal
 */
function formatIssuePath(
	path: ReadonlyArray<PropertyKey | StandardSchemaV1PathSegment> | undefined,
	propName: string,
): string {
	if (!path || path.length === 0) {
		return propName;
	}

	const segments = path.map((segment) => {
		if (typeof segment === "object" && segment !== null) {
			if ("key" in segment && segment.key !== undefined) {
				return String(segment.key);
			}
			if ("index" in segment && typeof segment.index === "number") {
				return String(segment.index);
			}
		}
		return String(segment);
	});

	return `${propName}.${segments.join(".")}`;
}
