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
			const error = normalizeError(value);
			expect(error.message).toBe("Unknown error");
			expect(error.cause).toBe(value);
		}
	});

	it("keeps a thrown value that is not an Error as the cause", () => {
		const error = normalizeError("plain failure");
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe("plain failure");
		expect(error.cause).toBe("plain failure");
	});
});
