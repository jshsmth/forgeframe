/**
 * Unit tests for render template helpers in `@/render/templates`.
 *
 * Covers DOM template creation, dimension/style application, spinner style injection, and fade/swap transition helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyDimensions,
	createStyleElement,
	defaultContainerTemplate,
	defaultPrerenderTemplate,
	fadeIn,
	fadeOut,
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

	describe("createStyleElement", () => {
		it("should create a style element with CSS content", () => {
			const css = ".my-class { color: red; }";
			const style = createStyleElement(document, css);

			expect(style.tagName).toBe("STYLE");
			expect(style.textContent).toBe(css);
		});

		it("should apply nonce when provided", () => {
			const css = ".my-class { color: blue; }";
			const nonce = "security-nonce";
			const style = createStyleElement(document, css, nonce);

			expect(style.getAttribute("nonce")).toBe(nonce);
		});

		it("should not set nonce attribute when not provided", () => {
			const css = ".my-class { color: green; }";
			const style = createStyleElement(document, css);

			expect(style.hasAttribute("nonce")).toBe(false);
		});
	});

	describe("fadeIn", () => {
		it("should transition opacity from 0 to 1", async () => {
			const element = document.createElement("div");
			element.style.opacity = "1";

			const fadePromise = fadeIn(element, 100);

			// After fadeIn is called, opacity should be set to 1 (after reflow trigger)
			// The function sets opacity to 0, forces reflow, then sets to 1
			expect(element.style.opacity).toBe("1");

			vi.advanceTimersByTime(100);
			await fadePromise;
		});

		it("should have final opacity of 1", async () => {
			const element = document.createElement("div");

			const fadePromise = fadeIn(element, 100);

			// After reflow trigger, opacity should be 1
			expect(element.style.opacity).toBe("1");

			vi.advanceTimersByTime(100);
			await fadePromise;

			expect(element.style.opacity).toBe("1");
		});

		it("should set an opacity transition with the provided fadeIn duration", async () => {
			const element = document.createElement("div");

			const fadePromise = fadeIn(element, 200);

			expect(element.style.transition).toContain("opacity");
			expect(element.style.transition).toContain("200ms");

			vi.advanceTimersByTime(200);
			await fadePromise;
		});

		it("should resolve fadeIn after the provided duration elapses", async () => {
			const element = document.createElement("div");
			let resolved = false;

			fadeIn(element, 150).then(() => {
				resolved = true;
			});

			expect(resolved).toBe(false);

			vi.advanceTimersByTime(100);
			await Promise.resolve();
			expect(resolved).toBe(false);

			vi.advanceTimersByTime(50);
			await Promise.resolve();
			expect(resolved).toBe(true);
		});

		it("should use default duration of 200ms", async () => {
			const element = document.createElement("div");

			const fadePromise = fadeIn(element);

			expect(element.style.transition).toContain("200ms");

			vi.advanceTimersByTime(200);
			await fadePromise;
		});
	});

	describe("fadeOut", () => {
		it("should set opacity to 0", async () => {
			const element = document.createElement("div");
			element.style.opacity = "1";

			const fadePromise = fadeOut(element, 100);

			expect(element.style.opacity).toBe("0");

			vi.advanceTimersByTime(100);
			await fadePromise;
		});

		it("should set an opacity transition with the provided fadeOut duration", async () => {
			const element = document.createElement("div");

			const fadePromise = fadeOut(element, 300);

			expect(element.style.transition).toContain("opacity");
			expect(element.style.transition).toContain("300ms");

			vi.advanceTimersByTime(300);
			await fadePromise;
		});

		it("should resolve fadeOut after the provided duration elapses", async () => {
			const element = document.createElement("div");
			let resolved = false;

			fadeOut(element, 100).then(() => {
				resolved = true;
			});

			expect(resolved).toBe(false);

			vi.advanceTimersByTime(100);
			await Promise.resolve();
			expect(resolved).toBe(true);
		});

		it("should use default duration of 200ms", async () => {
			const element = document.createElement("div");

			const fadePromise = fadeOut(element);

			expect(element.style.transition).toContain("200ms");

			vi.advanceTimersByTime(200);
			await fadePromise;
		});
	});

	describe("swapPrerenderContent", () => {
		it("should fade out and remove prerender element", async () => {
			const container = document.createElement("div");
			const prerender = document.createElement("div");
			const actual = document.createElement("div");

			container.appendChild(prerender);

			const swapPromise = swapPrerenderContent(container, prerender, actual);

			// Advance through fadeOut (150ms)
			vi.advanceTimersByTime(150);
			await Promise.resolve();

			// Prerender should be removed
			expect(container.contains(prerender)).toBe(false);

			// Advance through fadeIn (150ms)
			vi.advanceTimersByTime(150);
			await swapPromise;
		});

		it("should set actual element to visible", async () => {
			const container = document.createElement("div");
			const actual = document.createElement("div");
			actual.style.display = "none";
			actual.style.visibility = "hidden";

			const swapPromise = swapPrerenderContent(container, null, actual);

			// Should reset display and visibility
			expect(actual.style.display).toBe("");
			expect(actual.style.visibility).toBe("visible");

			vi.advanceTimersByTime(150);
			await swapPromise;
		});

		it("should fade in actual element", async () => {
			const container = document.createElement("div");
			const actual = document.createElement("div");

			const swapPromise = swapPrerenderContent(container, null, actual);

			vi.advanceTimersByTime(150);
			await swapPromise;

			// After fade in completes, opacity should be 1
			expect(actual.style.opacity).toBe("1");
		});

		it("should work without prerender element", async () => {
			const container = document.createElement("div");
			const actual = document.createElement("div");

			const swapPromise = swapPrerenderContent(container, null, actual);

			// Should only need fadeIn time (no fadeOut)
			vi.advanceTimersByTime(150);
			await swapPromise;

			expect(actual.style.opacity).toBe("1");
		});
	});
});
