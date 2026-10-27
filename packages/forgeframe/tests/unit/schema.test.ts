/**
 * Unit tests for Standard Schema utilities and schema-aware props validation.
 *
 * Covers schema shape detection, validation success/failure formatting, async schema guardrails, and normalizeProps integration.
 */
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { normalizeProps } from "@/props/normalize";
import { prop } from "@/props/prop";
import {
	isStandardSchema,
	type StandardSchemaV1,
	validateWithSchema,
} from "@/props/schema";
import type { PropsDefinition } from "@/types";
import { forgeFrameError } from "../forgeframe-error";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Creates a mock Standard Schema for testing purposes.
 */
function createMockSchema<T>(
	validator: (value: unknown) =>
		| { value: T }
		| {
				issues: Array<{
					message: string;
					path?: Array<PropertyKey | { key?: PropertyKey; index?: number }>;
				}>;
		  },
): StandardSchemaV1<unknown, T> {
	return {
		"~standard": {
			version: 1,
			vendor: "test",
			validate: validator,
		},
	};
}

/**
 * Creates an async mock schema that returns a Promise.
 */
function createAsyncMockSchema<T>(
	validator: (
		value: unknown,
	) => { value: T } | { issues: Array<{ message: string }> },
): StandardSchemaV1<unknown, T> {
	return {
		"~standard": {
			version: 1,
			vendor: "test-async",
			validate: (value: unknown) => Promise.resolve(validator(value)),
		},
	};
}

// ============================================================================
// isStandardSchema Tests
// ============================================================================

describe("isStandardSchema", () => {
	it("should identify valid Standard Schema objects", () => {
		const schema = createMockSchema(() => ({ value: "test" }));
		expect(isStandardSchema(schema)).toBe(true);
	});

	it("should reject null", () => {
		expect(isStandardSchema(null)).toBe(false);
	});

	it("should reject undefined", () => {
		expect(isStandardSchema(undefined)).toBe(false);
	});

	it("should reject primitives", () => {
		expect(isStandardSchema("string")).toBe(false);
		expect(isStandardSchema(123)).toBe(false);
		expect(isStandardSchema(true)).toBe(false);
	});

	it("should reject empty objects", () => {
		expect(isStandardSchema({})).toBe(false);
	});

	it("should reject objects without ~standard property", () => {
		expect(isStandardSchema({ version: 1, vendor: "test" })).toBe(false);
	});

	it("should reject objects with wrong version", () => {
		expect(
			isStandardSchema({
				"~standard": {
					version: 2,
					vendor: "test",
					validate: () => ({ value: "test" }),
				},
			}),
		).toBe(false);
	});

	it("should reject objects without validate function", () => {
		expect(
			isStandardSchema({
				"~standard": {
					version: 1,
					vendor: "test",
				},
			}),
		).toBe(false);
	});

	it("should reject objects without vendor string", () => {
		expect(
			isStandardSchema({
				"~standard": {
					version: 1,
					validate: () => ({ value: "test" }),
				},
			}),
		).toBe(false);

		expect(
			isStandardSchema({
				"~standard": {
					version: 1,
					vendor: 123,
					validate: () => ({ value: "test" }),
				},
			}),
		).toBe(false);
	});

	it("should reject objects with null ~standard", () => {
		expect(isStandardSchema({ "~standard": null })).toBe(false);
	});
});

// ============================================================================
// validateWithSchema Tests
// ============================================================================

describe("validateWithSchema", () => {
	it("should return the value on successful validation", () => {
		const schema = createMockSchema<string>((v) => ({
			value: String(v),
		}));
		const result = validateWithSchema(schema, "hello", "testProp");
		expect(result).toBe("hello");
	});

	it("should return transformed value when schema transforms", () => {
		const schema = createMockSchema<string>((v) => ({
			value: String(v).toUpperCase(),
		}));
		const result = validateWithSchema(schema, "hello", "testProp");
		expect(result).toBe("HELLO");
	});

	it("should throw on validation failure", () => {
		const schema = createMockSchema(() => ({
			issues: [{ message: "Invalid value" }],
		}));
		expect(() => validateWithSchema(schema, "bad", "testProp")).toThrow(
			forgeFrameError(
				"VALIDATION",
				"Validation failed: testProp: Invalid value",
			),
		);
	});

	it("should format multiple issues", () => {
		const schema = createMockSchema(() => ({
			issues: [{ message: "Error 1" }, { message: "Error 2" }],
		}));
		expect(() => validateWithSchema(schema, "bad", "testProp")).toThrow(
			forgeFrameError(
				"VALIDATION",
				"Validation failed: testProp: Error 1; testProp: Error 2",
			),
		);
	});

	it("should format nested paths", () => {
		const schema = createMockSchema(() => ({
			issues: [{ message: "Invalid", path: ["user", "email"] }],
		}));
		expect(() => validateWithSchema(schema, {}, "config")).toThrow(
			forgeFrameError(
				"VALIDATION",
				"Validation failed: config.user.email: Invalid",
			),
		);
	});

	it("should format paths with PathSegment objects", () => {
		const schema = createMockSchema(() => ({
			issues: [{ message: "Invalid", path: [{ key: "items" }, { key: "0" }] }],
		}));
		expect(() => validateWithSchema(schema, {}, "data")).toThrow(
			forgeFrameError("VALIDATION", "Validation failed: data.items.0: Invalid"),
		);
	});

	it("should format paths with PathSegment index objects", () => {
		const schema = createMockSchema(() => ({
			issues: [{ message: "Invalid", path: [{ key: "items" }, { index: 0 }] }],
		}));
		expect(() => validateWithSchema(schema, {}, "data")).toThrow(
			forgeFrameError("VALIDATION", "Validation failed: data.items.0: Invalid"),
		);
	});

	it("should throw clear error for async schemas", () => {
		const schema = createAsyncMockSchema(() => ({ value: "test" }));
		expect(() => validateWithSchema(schema, "value", "asyncProp")).toThrow(
			forgeFrameError("VALIDATION", 'Prop "asyncProp" uses an async schema'),
		);
		expect(() => validateWithSchema(schema, "value", "asyncProp")).toThrow(
			forgeFrameError(
				"VALIDATION",
				"ForgeFrame only supports synchronous schema validation",
			),
		);
	});

	it("rejects promises returned by schemas from another realm", () => {
		const result: Promise<{ value: string }> = runInNewContext(
			'Promise.resolve({ value: "parsed" })',
		);
		const schema: StandardSchemaV1<unknown, string> = {
			"~standard": {
				version: 1,
				vendor: "foreign-realm",
				validate: () => result,
			},
		};
		expect(result).not.toBeInstanceOf(Promise);
		expect(() => validateWithSchema(schema, "input", "name")).toThrow(
			forgeFrameError("VALIDATION", "uses an async schema"),
		);
		const nestedSchema = prop.string();
		vi.spyOn(nestedSchema["~standard"], "validate").mockReturnValue(result);
		expect(() =>
			prop
				.object({ name: nestedSchema })
				["~standard"].validate({ name: "input" }),
		).toThrow(
			forgeFrameError("VALIDATION", "Async schema validation is not supported"),
		);
	});

	it.each(["native", "foreign"])(
		"observes rejected %s schema promises at top-level and nested boundaries",
		async (realm) => {
			const rejected = (): Promise<{ value: string }> =>
				realm === "foreign"
					? runInNewContext('Promise.reject(new Error("Async schema failure"))')
					: Promise.reject(new Error("Async schema failure"));
			const schema: StandardSchemaV1<unknown, string> = {
				"~standard": {
					version: 1,
					vendor: "async-rejection",
					validate: rejected,
				},
			};
			expect(() => validateWithSchema(schema, "input", "name")).toThrow(
				forgeFrameError("VALIDATION", "uses an async schema"),
			);
			const nested = prop.string();
			const validate = vi
				.spyOn(nested["~standard"], "validate")
				.mockImplementation(rejected);
			try {
				expect(() =>
					prop.object({ name: nested })["~standard"].validate({
						name: "input",
					}),
				).toThrow(
					forgeFrameError(
						"VALIDATION",
						"Async schema validation is not supported",
					),
				);
				// Vitest reports any unobserved rejection after this event-loop turn.
				await new Promise<void>((resolve) => setTimeout(resolve, 0));
			} finally {
				validate.mockRestore();
			}
		},
	);
});

// ============================================================================
// normalizeProps with Schema Integration Tests
// ============================================================================

/** Normalizes `props` in place, as the consumer does for a component's inputs. */
function validateProps<P extends Record<string, unknown>>(
	props: P,
	definitions: PropsDefinition<P>,
): void;
function validateProps(props: object, definitions: object): void {
	Object.assign(
		props,
		normalizeProps(props as Record<string, unknown>, definitions),
	);
}

describe("normalizeProps with schema", () => {
	it("should validate using schema instead of type", () => {
		const schema = createMockSchema<string>((v) => {
			if (typeof v === "string" && v.includes("@")) {
				return { value: v };
			}
			return { issues: [{ message: "Must be an email" }] };
		});

		const definitions: PropsDefinition<{ email: string }> = {
			email: { schema },
		};

		// Valid email
		expect(() =>
			validateProps({ email: "user@example.com" }, definitions),
		).not.toThrow();

		// Invalid email
		expect(() => validateProps({ email: "invalid" }, definitions)).toThrow(
			forgeFrameError("VALIDATION", "Must be an email"),
		);
	});

	it("should store transformed value from schema", () => {
		const schema = createMockSchema<string>((v) => ({
			value: String(v).toLowerCase(),
		}));

		const definitions: PropsDefinition<{ name: string }> = {
			name: { schema },
		};

		const props = { name: "UPPERCASE" };
		validateProps(props, definitions);

		expect(props.name).toBe("uppercase");
	});

	it("should require a prop exactly when its schema rejects undefined", () => {
		const required = createMockSchema<string>((v) =>
			v === undefined
				? { issues: [{ message: "Required" }] }
				: { value: String(v) },
		);
		const lenient = createMockSchema<string>((v) => ({ value: String(v) }));

		expect(() =>
			normalizeProps({ name: undefined }, { name: { schema: required } }),
		).toThrow(
			forgeFrameError("VALIDATION", "Validation failed: name: Required"),
		);
		expect(() =>
			normalizeProps({ name: undefined }, { name: { schema: lenient } }),
		).not.toThrow();
	});

	it("should run the schema for an omitted prop", () => {
		const validateFn = vi.fn(() => ({ value: "test" }));
		const schema: StandardSchemaV1<unknown, string> = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: validateFn,
			},
		};

		const definitions: PropsDefinition<{ name?: string }> = {
			name: { schema },
		};

		const props = {} as { name?: string };
		validateProps(props, definitions);
		expect(validateFn).toHaveBeenCalledWith(undefined);
		expect(props.name).toBe("test");
	});

	it("should reject a schema that changes its own output", () => {
		// Each run prefixes the value, so the output does not validate unchanged.
		const schema = createMockSchema<string>((v) => ({
			value: `processed: ${v}`,
		}));

		const definitions: PropsDefinition<{ value: string }> = {
			value: { schema },
		};

		expect(() => validateProps({ value: "42" }, definitions)).toThrow(
			forgeFrameError(
				"VALIDATION",
				"Validation failed: value: the prop schema must accept its own output unchanged, because ForgeFrame validates delivered values with the same schema; the schema changed the value.",
			),
		);
	});
});

// ============================================================================
// Prop Schema API Tests
// ============================================================================

describe("prop schema API", () => {
	it("should work with direct prop schemas", () => {
		const definitions: PropsDefinition<{ name: string; age: number }> = {
			name: prop.string(),
			age: prop.number(),
		};

		// Valid props
		expect(() =>
			validateProps({ name: "test", age: 25 }, definitions),
		).not.toThrow();

		// Invalid type
		expect(() => normalizeProps({ name: 123, age: 25 }, definitions)).toThrow(
			forgeFrameError("VALIDATION", "Expected string"),
		);
	});

	it("should work with required validation", () => {
		const definitions: PropsDefinition<{ name: string }> = {
			name: { schema: prop.string() },
		};

		expect(() => normalizeProps({ name: undefined }, definitions)).toThrow(
			forgeFrameError("VALIDATION", "Validation failed: name: Required"),
		);
	});

	it("should allow mixing custom schema and prop schemas", () => {
		const customSchema = createMockSchema<{ id: string }>((v) => {
			if (typeof v === "object" && v !== null && "id" in v) {
				return { value: v as { id: string } };
			}
			return { issues: [{ message: "Must have id" }] };
		});

		const definitions: PropsDefinition<{
			user: { id: string };
			callback: () => void;
		}> = {
			user: { schema: customSchema },
			callback: prop.function(),
		};

		const callback = vi.fn();
		expect(() =>
			validateProps({ user: { id: "123" }, callback }, definitions),
		).not.toThrow();
	});
});
