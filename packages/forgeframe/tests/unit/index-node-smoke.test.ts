/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(async () => {
	const { clearComponents } = await import("@/core/component");
	clearComponents();
	vi.resetModules();
});

describe("Index node smoke", () => {
	it("should import the public entrypoint and expose the stable root API without browser globals", async () => {
		expect("window" in globalThis).toBe(false);

		const publicEntrypoint = await import("@/index");
		const {
			PopupOpenError,
			VERSION,
			create,
			createReactComponent,
			initHost,
			isHost,
			prop,
			withReactComponent,
		} = publicEntrypoint;

		for (const removed of [
			"default",
			"ForgeFrame",
			"getHostProps",
			"isEmbedded",
			"PROP_SERIALIZATION",
			// Literal unions and type-only schema classes replace these values.
			"CONTEXT",
			"EVENT",
			"isStandardSchema",
			"PropSchema",
			"StringSchema",
			"ObjectSchema",
		]) {
			expect(publicEntrypoint).not.toHaveProperty(removed);
		}
		expect(typeof PopupOpenError).toBe("function");
		expect(typeof VERSION).toBe("string");
		expect(typeof prop.string).toBe("function");
		expect(typeof createReactComponent).toBe("function");
		expect(typeof withReactComponent).toBe("function");
		expect(isHost()).toBe(false);

		const AbsoluteUrlComponent = create({
			tag: "node-absolute-component",
			url: "https://example.com/host.html",
		});
		create({
			tag: "node-relative-component",
			url: "/host.html",
		});

		expect(
			initHost(AbsoluteUrlComponent, {
				consumerOrigins: "https://consumer.example.com",
			}),
		).toBeNull();
		expect(initHost({ consumerOrigins: "*" })).toBeNull();
		// Argument checks run before the environment check.
		expect(() => (initHost as () => unknown)()).toThrow(
			"initHost(Component, { consumerOrigins })",
		);
		expect(() =>
			initHost(AbsoluteUrlComponent, {} as { consumerOrigins: string }),
		).toThrow("consumerOrigins");
	});

	it("should reject malformed string urls without browser globals", async () => {
		const { create } = await import("@/index");

		expect(() =>
			create({
				tag: "node-invalid-component",
				url: "http://",
			}),
		).toThrow("Invalid component URL");
	});
});
