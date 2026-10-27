/**
 * Unit tests for render template helpers in `@/render/templates`.
 *
 * Covers DOM template creation, dimension/style application, spinner style injection, and the prerender swap transition.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyDimensions,
	defaultContainerTemplate,
	defaultPrerenderTemplate,
	swapPrerenderContent,
} from "@/render/templates";
import type { Dimensions, TemplateContext } from "@/types";

describe("render template helpers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		document.getElementById("forgeframe-spinner-style")?.remove();
	});

	afterEach(() => {
		vi.useRealTimers();
		document.getElementById("forgeframe-spinner-style")?.remove();
	});

	describe("defaultContainerTemplate", () => {
		it("should create a container div with correct attributes", () => {
			const ctx: TemplateContext<Record<string, unknown>> = {
				doc: document,
				context: "iframe",
				container: document.createElement("div"),
				frame: null,
				prerenderFrame: null,
				close: async () => {},
				focus: async () => {},
				dimensions: { width: 400, height: 300 },
				uid: "test-uid-123",
				tag: "my-component",
				props: {},
			};

			const container = defaultContainerTemplate(ctx);

			expect(container.tagName).toBe("DIV");
			expect(container.id).toBe("forgeframe-container-test-uid-123");
			expect(container.getAttribute("data-forgeframe-tag")).toBe(
				"my-component",
			);
		});

		it("should apply numeric dimensions as pixels", () => {
			const ctx: TemplateContext<Record<string, unknown>> = {
				doc: document,
				context: "iframe",
				container: document.createElement("div"),
				frame: null,
				prerenderFrame: null,
				close: async () => {},
				focus: async () => {},
				dimensions: { width: 400, height: 300 },
				uid: "test-uid",
				tag: "test",
				props: {},
			};

			const container = defaultContainerTemplate(ctx);

			expect(container.style.width).toBe("400px");
			expect(container.style.height).toBe("300px");
		});

		it("should apply string dimensions as-is", () => {
			const ctx: TemplateContext<Record<string, unknown>> = {
				doc: document,
				context: "iframe",
				container: document.createElement("div"),
				frame: null,
				prerenderFrame: null,
				close: async () => {},
				focus: async () => {},
				dimensions: { width: "100%", height: "50vh" },
				uid: "test-uid",
				tag: "test",
				props: {},
			};

			const container = defaultContainerTemplate(ctx);

			expect(container.style.width).toBe("100%");
			expect(container.style.height).toBe("50vh");
		});

		it("should apply correct base styles", () => {
			const ctx: TemplateContext<Record<string, unknown>> = {
				doc: document,
				context: "iframe",
				container: document.createElement("div"),
				frame: null,
				prerenderFrame: null,
				close: async () => {},
				focus: async () => {},
				dimensions: { width: 400, height: 300 },
				uid: "test-uid",
				tag: "test",
				props: {},
			};

			const container = defaultContainerTemplate(ctx);

			expect(container.style.display).toBe("inline-block");
			expect(container.style.position).toBe("relative");
			expect(container.style.overflow).toBe("hidden");
		});
	});

	describe("defaultPrerenderTemplate", () => {
		it("should create a wrapper with spinner", () => {
			const ctx: TemplateContext<Record<string, unknown>> & {
				cspNonce?: string;
			} = {
				doc: document,
				context: "iframe",
				container: document.createElement("div"),
				frame: null,
				prerenderFrame: null,
				close: async () => {},
				focus: async () => {},
				dimensions: { width: 400, height: 300 },
				uid: "test-uid",
				tag: "test",
				props: {},
			};

			const wrapper = defaultPrerenderTemplate(ctx);

			expect(wrapper.tagName).toBe("DIV");
			expect(wrapper.children.length).toBe(1); // spinner
		});

		it("should apply dimensions to wrapper", () => {
			const ctx: TemplateContext<Record<string, unknown>> = {
				doc: document,
				context: "iframe",
				container: document.createElement("div"),
				frame: null,
				prerenderFrame: null,
				close: async () => {},
				focus: async () => {},
				dimensions: { width: 500, height: 400 },
				uid: "test-uid",
				tag: "test",
				props: {},
			};

			const wrapper = defaultPrerenderTemplate(ctx);

			expect(wrapper.style.width).toBe("500px");
			expect(wrapper.style.height).toBe("400px");
		});

		it("should have correct positioning styles", () => {
			const ctx: TemplateContext<Record<string, unknown>> = {
				doc: document,
				context: "iframe",
				container: document.createElement("div"),
				frame: null,
				prerenderFrame: null,
				close: async () => {},
				focus: async () => {},
				dimensions: { width: 400, height: 300 },
				uid: "test-uid",
				tag: "test",
				props: {},
			};

			const wrapper = defaultPrerenderTemplate(ctx);

			expect(wrapper.style.position).toBe("absolute");
			expect(wrapper.style.top).toBe("0px");
			expect(wrapper.style.left).toBe("0px");
			expect(wrapper.style.zIndex).toBe("100");
		});

		it("should apply CSP nonce to style element when provided", () => {
			const ctx: TemplateContext<Record<string, unknown>> & {
				cspNonce?: string;
			} = {
				doc: document,
				context: "iframe",
				container: document.createElement("div"),
				frame: null,
				prerenderFrame: null,
				close: async () => {},
				focus: async () => {},
				dimensions: { width: 400, height: 300 },
				uid: "test-uid",
				tag: "test",
				props: {},
				cspNonce: "my-nonce-123",
			};

			const wrapper = defaultPrerenderTemplate(ctx);
			const styleElement = document.getElementById("forgeframe-spinner-style");

			expect(styleElement?.getAttribute("nonce")).toBe("my-nonce-123");
			expect(wrapper.querySelector("style")).toBeNull();
		});

		it("should replace existing spinner style when nonce changes", () => {
			const staleStyle = document.createElement("style");
			staleStyle.id = "forgeframe-spinner-style";
			staleStyle.textContent =
				"@keyframes forgeframe-spin { to { transform: rotate(360deg); } }";
			document.head.appendChild(staleStyle);

			const ctx: TemplateContext<Record<string, unknown>> & {
				cspNonce?: string;
			} = {
				doc: document,
				context: "iframe",
				container: document.createElement("div"),
				frame: null,
				prerenderFrame: null,
				close: async () => {},
				focus: async () => {},
				dimensions: { width: 400, height: 300 },
				uid: "test-uid",
				tag: "test",
				props: {},
				cspNonce: "fresh-nonce",
			};

			defaultPrerenderTemplate(ctx);

			const styleElements = document.querySelectorAll(
				"#forgeframe-spinner-style",
			);
			expect(styleElements).toHaveLength(1);
			expect(styleElements[0]?.getAttribute("nonce")).toBe("fresh-nonce");
		});

		it("should include keyframe animation in style", () => {
			const ctx: TemplateContext<Record<string, unknown>> = {
				doc: document,
				context: "iframe",
				container: document.createElement("div"),
				frame: null,
				prerenderFrame: null,
				close: async () => {},
				focus: async () => {},
				dimensions: { width: 400, height: 300 },
				uid: "test-uid",
				tag: "test",
				props: {},
			};

			defaultPrerenderTemplate(ctx);
			const styleElement = document.getElementById("forgeframe-spinner-style");

			expect(styleElement?.textContent).toContain("@keyframes forgeframe-spin");
		});

		it("should inject spinner keyframes once per document", () => {
			const ctx: TemplateContext<Record<string, unknown>> = {
				doc: document,
				context: "iframe",
				container: document.createElement("div"),
				frame: null,
				prerenderFrame: null,
				close: async () => {},
				focus: async () => {},
				dimensions: { width: 400, height: 300 },
				uid: "first",
				tag: "test",
				props: {},
			};

			defaultPrerenderTemplate(ctx);
			defaultPrerenderTemplate({ ...ctx, uid: "second" });

			const styleElements = document.querySelectorAll(
				"#forgeframe-spinner-style",
			);
			expect(styleElements).toHaveLength(1);
		});
	});

	describe("applyDimensions", () => {
		it("should apply width and height to element", () => {
			const element = document.createElement("div");
			const dimensions: Dimensions = { width: 200, height: 150 };

			applyDimensions(element, dimensions);

			expect(element.style.width).toBe("200px");
			expect(element.style.height).toBe("150px");
		});

		it("should apply only width when height is undefined", () => {
			const element = document.createElement("div");
			element.style.height = "100px";
			const dimensions: Dimensions = { width: 200 };

			applyDimensions(element, dimensions);

			expect(element.style.width).toBe("200px");
			expect(element.style.height).toBe("100px"); // unchanged
		});

		it("should apply only height when width is undefined", () => {
			const element = document.createElement("div");
			element.style.width = "100px";
			const dimensions: Dimensions = { height: 200 };

			applyDimensions(element, dimensions);

			expect(element.style.width).toBe("100px"); // unchanged
			expect(element.style.height).toBe("200px");
		});

		it("should handle string dimensions", () => {
			const element = document.createElement("div");
			const dimensions: Dimensions = { width: "50%", height: "auto" };

			applyDimensions(element, dimensions);

			expect(element.style.width).toBe("50%");
			expect(element.style.height).toBe("auto");
		});
	});

	describe("swapPrerenderContent", () => {
		it("should fade out and remove prerender element before revealing content", async () => {
			const container = document.createElement("div");
			const prerender = document.createElement("div");
			const actual = document.createElement("div");
			prerender.style.opacity = "1";
			actual.style.display = "none";

			container.append(prerender, actual);

			const swapPromise = swapPrerenderContent(prerender, actual, () => true);

			expect(prerender.style.opacity).toBe("0");
			expect(prerender.style.transition).toBe("opacity 150ms ease-out");
			expect(actual.style.display).toBe("none");

			await vi.advanceTimersByTimeAsync(149);
			expect(container.contains(prerender)).toBe(true);

			await vi.advanceTimersByTimeAsync(1);

			expect(container.contains(prerender)).toBe(false);
			expect(actual.style.display).toBe("");

			vi.advanceTimersByTime(150);
			await swapPromise;
		});

		it("should set actual element to visible", async () => {
			const actual = document.createElement("div");
			actual.style.display = "none";
			actual.style.visibility = "hidden";

			const swapPromise = swapPrerenderContent(null, actual, () => true);

			// Should reset display and visibility
			expect(actual.style.display).toBe("");
			expect(actual.style.visibility).toBe("visible");

			vi.advanceTimersByTime(150);
			await swapPromise;
		});

		it("should fade in actual element and resolve after the fade duration", async () => {
			const actual = document.createElement("div");
			let resolved = false;

			void swapPrerenderContent(null, actual, () => true).then(() => {
				resolved = true;
			});

			// Should only need fadeIn time (no fadeOut)
			expect(actual.style.opacity).toBe("1");
			expect(actual.style.transition).toBe("opacity 150ms ease-in");

			await vi.advanceTimersByTimeAsync(149);
			expect(resolved).toBe(false);

			await vi.advanceTimersByTimeAsync(1);
			expect(resolved).toBe(true);
		});

		it("should leave the content hidden when shouldShow declines after the fade out", async () => {
			const prerender = document.createElement("div");
			const actual = document.createElement("div");
			actual.style.display = "none";
			let show = true;

			const swapPromise = swapPrerenderContent(prerender, actual, () => show);
			show = false;

			vi.advanceTimersByTime(150);
			await swapPromise;

			expect(prerender.isConnected).toBe(false);
			expect(actual.style.display).toBe("none");
			expect(actual.style.opacity).toBe("");
		});
	});
});
