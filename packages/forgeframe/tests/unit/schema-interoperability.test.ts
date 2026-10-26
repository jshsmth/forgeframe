/**
 * Interoperability tests for Standard Schema support in `@/props/schema`.
 *
 * Covers minimal schema shape acceptance, callable schemas, object path segments, and optional metadata handling.
 */
import { afterEach, describe, expect, it } from "vitest";
import { clearComponents, create } from "@/core/component";
import { normalizeProps } from "@/props/normalize";
import {
	isStandardSchema,
	type StandardSchemaV1,
	validateWithSchema,
} from "@/props/schema";
import type { PropsDefinition } from "@/types";

/** Creates a string schema that is itself callable, as ArkType types are. */
function createCallableStringSchema(): StandardSchemaV1<unknown, string> &
	((value: unknown) => unknown) {
	return Object.assign((value: unknown) => value, {
		"~standard": {
			version: 1 as const,
			vendor: "callable-validator",
			validate: (value: unknown) =>
				typeof value === "string"
					? { value }
					: { issues: [{ message: "Expected string" }] },
		},
	});
}

afterEach(() => {
	clearComponents();
	document.body.innerHTML = "";
});

describe("Standard Schema interoperability", () => {
	it("should accept schema objects without ~standard.types metadata", () => {
		const schema: StandardSchemaV1<unknown, string> = {
			"~standard": {
				version: 1,
				vendor: "custom-validator",
				validate: (value: unknown) => {
					if (typeof value === "string") {
						return { value };
					}

					return {
						issues: [{ message: "Expected string" }],
					};
				},
			},
		};

		expect(isStandardSchema(schema)).toBe(true);
		expect(validateWithSchema(schema, "ok", "name")).toBe("ok");
		expect(() => validateWithSchema(schema, 123, "name")).toThrow(
			"Validation failed: name: Expected string",
		);
	});

	it("should recognize callable schemas and reject plain functions", () => {
		expect(isStandardSchema(createCallableStringSchema())).toBe(true);
		expect(isStandardSchema(() => ({ value: "ok" }))).toBe(false);
	});

	it("should validate callable schemas as direct and wrapped prop definitions", () => {
		const schema = createCallableStringSchema();
		const direct: PropsDefinition<{ name: string }> = {
			name: schema,
		};
		const wrapped: PropsDefinition<{ name: string }> = {
			name: { schema },
		};

		for (const definitions of [direct, wrapped]) {
			expect(() => normalizeProps({ name: "ok" }, definitions)).not.toThrow();
			expect(() =>
				normalizeProps({ name: 42 as unknown as string }, definitions),
			).toThrow("Validation failed: name: Expected string");
			expect(() =>
				normalizeProps({} as { name: string }, definitions),
			).toThrow();
		}
	});

	it("should reject invalid callable-schema props before rendering", async () => {
		const Component = create({
			tag: "callable-schema-render-admission",
			url: "https://host.example.com/widget",
			props: { name: createCallableStringSchema() },
		});
		const container = document.createElement("div");
		document.body.append(container);
		const instance = Component({ name: 42 as unknown as string });

		await expect(instance.render(container)).rejects.toThrow(
			"Validation failed: name: Expected string",
		);
		expect(container.querySelector("iframe")).toBeNull();
	});

	it("should keep supporting object path segments that use only key", () => {
		const pathSchema: StandardSchemaV1 = {
			"~standard": {
				version: 1,
				vendor: "custom-validator",
				validate: () => ({
					issues: [
						{
							message: "Expected email",
							path: [{ key: "users" }, { key: "0" }, { key: "email" }],
						},
					],
				}),
			},
		};

		expect(() => validateWithSchema(pathSchema, {}, "payload")).toThrow(
			"Validation failed: payload.users.0.email: Expected email",
		);
	});

	it("should accept schemas with optional ~standard.types metadata", () => {
		const schemaWithTypes: StandardSchemaV1<string, number> = {
			"~standard": {
				version: 1,
				vendor: "custom-validator",
				types: {
					input: "" as string,
					output: 0 as number,
				},
				validate: (value: unknown) => ({
					value: Number(value),
				}),
			},
		};

		expect(isStandardSchema(schemaWithTypes)).toBe(true);
		expect(validateWithSchema(schemaWithTypes, "42", "value")).toBe(42);
	});
});
