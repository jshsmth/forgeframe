/**
 * Interoperability tests for Standard Schema support in `@/props/schema`.
 *
 * Covers minimal schema shape acceptance, object path segments, and optional metadata handling.
 */
import { describe, expect, it } from "vitest";
import {
	isStandardSchema,
	type StandardSchemaV1,
	validateWithSchema,
} from "@/props/schema";

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
