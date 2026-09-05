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
			default: ForgeFrame,
			ForgeFrame: NamedForgeFrame,
			CONTEXT,
			PopupOpenError,
			VERSION,
			create,
			createReactComponent,
			initHost,
			prop,
			withReactComponent,
		} = publicEntrypoint;

		expect(ForgeFrame).toBe(NamedForgeFrame);
		expect(ForgeFrame.create).toBe(create);
		expect(ForgeFrame.initHost).toBe(initHost);
		expect(ForgeFrame.prop).toBe(prop);
		expect(ForgeFrame.CONTEXT).toBe(CONTEXT);
		expect(ForgeFrame.PopupOpenError).toBe(PopupOpenError);
		expect(ForgeFrame.VERSION).toBe(VERSION);
		expect(typeof createReactComponent).toBe("function");
		expect(typeof withReactComponent).toBe("function");

		const AbsoluteUrlComponent = ForgeFrame.create({
			tag: "node-absolute-component",
			url: "https://example.com/host.html",
		});
		const RelativeUrlComponent = ForgeFrame.create({
			tag: "node-relative-component",
			url: "/host.html",
		});

		expect(AbsoluteUrlComponent.isHost()).toBe(false);
		expect(AbsoluteUrlComponent.isEmbedded()).toBe(false);
		expect(RelativeUrlComponent.isHost()).toBe(false);
		expect(RelativeUrlComponent.isEmbedded()).toBe(false);
	});

	it("should reject malformed string urls without browser globals", async () => {
		const { default: ForgeFrame } = await import("@/index");

		expect(() =>
			ForgeFrame.create({
				tag: "node-invalid-component",
				url: "http://",
			}),
		).toThrow("Invalid component URL");
	});
});
