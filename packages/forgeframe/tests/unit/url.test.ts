import { describe, expect, it } from "vitest";
import { appendComponentQuery, resolveComponentHostUrl } from "@/utils/url";

describe("Component navigation URLs", () => {
	it.each([
		[
			"https://host.example/widget#checkout",
			"https://host.example/widget?order=123#checkout",
		],
		[
			"https://host.example/widget?mode=a#checkout",
			"https://host.example/widget?mode=a&order=123#checkout",
		],
		["/widget#checkout?step=2", "/widget?order=123#checkout?step=2"],
		["/widget#", "/widget?order=123#"],
		[
			"/widget?order=old&signature=a%20b%2Fc#step",
			"/widget?order=old&signature=a%20b%2Fc&order=123#step",
		],
	])(
		"should append parameters before the fragment of %s",
		(input, expected) => {
			expect(appendComponentQuery(input, "order=123")).toBe(expected);
		},
	);

	it("should preserve encoded generated parameters and an unchanged empty query", () => {
		const input = "/widget?signature=a%20b#step?mode=1";
		expect(appendComponentQuery(input, "")).toBe(input);
		expect(appendComponentQuery(input, "value=a%26b%3Dc")).toBe(
			"/widget?signature=a%20b&value=a%26b%3Dc#step?mode=1",
		);
	});

	it.each([
		["widget", "https://host.example/nested/widget"],
		["/widget", "https://host.example/widget"],
		["//other.example/widget", "https://other.example/widget"],
		["https://other.example/widget", "https://other.example/widget"],
	])(
		"should resolve %s against the supplied navigation base",
		(input, expected) => {
			expect(
				resolveComponentHostUrl(input, "https://host.example/nested/page").href,
			).toBe(expected);
		},
	);
});
