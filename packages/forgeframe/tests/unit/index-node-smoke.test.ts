/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Matches a ForgeFrameError by name and code. vi.resetModules() gives each
 * test its own ForgeFrameError class, so the shared instanceof matcher cannot
 * apply in this file.
 */
function codedError(code: string, message: string) {
	return expect.objectContaining({
		name: "ForgeFrameError",
		code,
		message: expect.stringContaining(message),
	});
}

afterEach(async () => {
	const { clearComponents } = await import("@/core/component");
	clearComponents();
	vi.resetModules();
});

describe("Index node smoke", () => {
	it("should import the public entrypoint and expose the stable root API without browser globals", async () => {
		expect("window" in globalThis).toBe(false);

		const publicEntrypoint = await import("@/index");
		const { ForgeFrameError, VERSION, create, initHost, isHost, prop } =
			publicEntrypoint;

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
			"PopupOpenError",
			// React moved to forgeframe/react.
			"createReactComponent",
			"withReactComponent",
		]) {
			expect(publicEntrypoint).not.toHaveProperty(removed);
		}
		expect(new ForgeFrameError("CLOSED", "gone")).toMatchObject({
			name: "ForgeFrameError",
			code: "CLOSED",
		});
		expect(typeof VERSION).toBe("string");
		expect(typeof prop.string).toBe("function");
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
			codedError("VALIDATION", "initHost(Component, { consumerOrigins })"),
		);
		expect(() =>
			initHost(AbsoluteUrlComponent, {} as { consumerOrigins: string }),
		).toThrow(codedError("VALIDATION", "consumerOrigins"));
	});

	it("should import the React entry without browser globals and server-render only the container", async () => {
		expect("window" in globalThis).toBe(false);

		const reactEntrypoint = await import("@/react");
		expect(Object.keys(reactEntrypoint)).toEqual(["createReactComponent"]);
		const { create } = await import("@/index");
		const { createElement } = await import("react");
		const { renderToString } = await import("react-dom/server");
		const Component = create({
			tag: "node-react-ssr",
			url: "https://example.com/host.html",
		});
		const Wrapped = reactEntrypoint.createReactComponent(Component);

		const html = renderToString(createElement(Wrapped, { className: "embed" }));

		expect(html).toBe('<div class="embed" style="display:inline-block"></div>');
		expect(Component.instances).toHaveLength(0);
	});

	it("should reject malformed string urls without browser globals", async () => {
		const { create } = await import("@/index");

		expect(() =>
			create({
				tag: "node-invalid-component",
				url: "http://",
			}),
		).toThrow(codedError("VALIDATION", "Invalid component URL"));
	});
});
