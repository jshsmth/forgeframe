/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
});

describe("Component definitions across runtime transitions", () => {
	it("should defer domain validation for relative URLs until a browser can resolve them", async () => {
		const { clearComponents, create } = await import("@/core/component");

		expect(() =>
			create({
				tag: "relative-node-component",
				url: "/host.html",
				hostOrigins: "https://allowed.example.com",
			}),
		).not.toThrow();

		expect(() =>
			create({
				tag: "absolute-node-component",
				url: "https://blocked.example.com/host.html",
				hostOrigins: "https://allowed.example.com",
			}),
		).toThrow(
			`Component URL origin "https://blocked.example.com" is not allowed by the component's hostOrigins.`,
		);

		clearComponents();
	});
});
