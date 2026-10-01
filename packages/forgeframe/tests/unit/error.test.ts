import { describe, expect, it } from "vitest";
import { normalizeError } from "@/utils/error";

describe("Unknown error normalization", () => {
	it("preserves Error identity and existing string conversion", () => {
		const error = new Error("original");
		expect(normalizeError(error)).toBe(error);
		expect(normalizeError("failure").message).toBe("failure");
		expect(normalizeError(null).message).toBe("null");
	});

	it("provides a stable fallback when coercion or prototype inspection throws", () => {
		const uncoercible = {
			[Symbol.toPrimitive]() {
				throw new Error("coercion failed");
			},
		};
		const uninspectable = new Proxy(
			{},
			{
				getPrototypeOf() {
					throw new Error("inspection failed");
				},
			},
		);
		for (const value of [Object.create(null), uncoercible, uninspectable]) {
			expect(normalizeError(value).message).toBe("Unknown error");
		}
	});
});
