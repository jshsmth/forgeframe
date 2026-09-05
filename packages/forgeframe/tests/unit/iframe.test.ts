/**
 * Unit tests for `@/render/iframe`.
 *
 * Covers iframe creation/destruction, visibility and sizing helpers, and attribute handling.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createIframe,
	createPrerenderIframe,
	destroyIframe,
	focusIframe,
	hideIframe,
	resizeIframe,
	showIframe,
} from "@/render/iframe";

describe("createIframe", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	it("should create iframe with correct attributes", () => {
		const iframe = createIframe({
			url: "https://example.com/widget",
			name: "test-iframe",
			container,
			dimensions: { width: 400, height: 300 },
		});

		expect(iframe.tagName).toBe("IFRAME");
		expect(iframe.name).toBe("test-iframe");
		expect(iframe.src).toBe("https://example.com/widget");
		expect(iframe.style.width).toBe("400px");
		expect(iframe.style.height).toBe("300px");
	});

	it("should set default security attributes", () => {
		const iframe = createIframe({
			url: "https://example.com",
			name: "test-iframe",
			container,
			dimensions: { width: 100, height: 100 },
		});

		expect(iframe.getAttribute("frameborder")).toBe("0");
		expect(iframe.getAttribute("allowtransparency")).toBe("true");
		expect(iframe.getAttribute("scrolling")).toBe("auto");
		expect(iframe.getAttribute("sandbox")).toBe(
			"allow-scripts allow-same-origin allow-forms allow-popups",
		);
	});

	it("should apply custom attributes", () => {
		const iframe = createIframe({
			url: "https://example.com",
			name: "test-iframe",
			container,
			dimensions: { width: 100, height: 100 },
			attributes: {
				allow: "payment",
				title: "Payment Widget",
				sandbox: "allow-scripts allow-forms",
			},
		});

		expect(iframe.getAttribute("allow")).toBe("payment");
		expect(iframe.getAttribute("title")).toBe("Payment Widget");
		expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-forms");
	});

	it.each(["name", "src", "srcdoc"])(
		"should reject the reserved %s bootstrap attribute",
		(attribute) => {
			expect(() =>
				createIframe({
					url: "https://example.com",
					name: "trusted-bootstrap",
					container,
					dimensions: { width: 100, height: 100 },
					attributes: { [attribute]: "attacker-controlled" },
				}),
			).toThrow(`Iframe attribute "${attribute}" is managed by ForgeFrame`);
		},
	);

	it("should preserve an explicit empty sandbox attribute", () => {
		const iframe = createIframe({
			url: "https://example.com",
			name: "test-iframe",
			container,
			dimensions: { width: 100, height: 100 },
			attributes: {
				sandbox: "",
			},
		});

		expect(iframe.getAttribute("sandbox")).toBe("");
	});

	it("should apply custom styles", () => {
		const iframe = createIframe({
			url: "https://example.com",
			name: "test-iframe",
			container,
			dimensions: { width: 100, height: 100 },
			style: {
				marginTop: 8,
				borderRadius: "12px",
			},
		});

		expect(iframe.style.getPropertyValue("margin-top")).toBe("8px");
		expect(iframe.style.getPropertyValue("border-radius")).toBe("12px");
	});

	it("should handle boolean attributes", () => {
		const iframe = createIframe({
			url: "https://example.com",
			name: "test-iframe",
			container,
			dimensions: { width: 100, height: 100 },
			attributes: {
				allowfullscreen: true,
			},
		});

		expect(iframe.hasAttribute("allowfullscreen")).toBe(true);
	});

	it("should skip undefined attributes", () => {
		const iframe = createIframe({
			url: "https://example.com",
			name: "test-iframe",
			container,
			dimensions: { width: 100, height: 100 },
			attributes: {
				title: undefined as unknown as string,
			},
		});

		expect(iframe.hasAttribute("title")).toBe(false);
	});

	it("should handle string dimensions", () => {
		const iframe = createIframe({
			url: "https://example.com",
			name: "test-iframe",
			container,
			dimensions: { width: "100%", height: "auto" },
		});

		expect(iframe.style.width).toBe("100%");
		expect(iframe.style.height).toBe("auto");
	});

	it("should append iframe to container", () => {
		const iframe = createIframe({
			url: "https://example.com",
			name: "test-iframe",
			container,
			dimensions: { width: 100, height: 100 },
		});

		expect(container.contains(iframe)).toBe(true);
	});
});

describe("createPrerenderIframe", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	it("should create prerender iframe with srcdoc", () => {
		const iframe = createPrerenderIframe(container, {
			width: 200,
			height: 150,
		});

		expect(iframe.tagName).toBe("IFRAME");
		expect(iframe.name).toBe("__forgeframe_prerender__");
		expect(iframe.srcdoc).toContain("<!DOCTYPE html>");
	});

	it("should apply dimensions", () => {
		const iframe = createPrerenderIframe(container, {
			width: 200,
			height: 150,
		});

		expect(iframe.style.width).toBe("200px");
		expect(iframe.style.height).toBe("150px");
	});

	it("should set default attributes", () => {
		const iframe = createPrerenderIframe(container, {
			width: 100,
			height: 100,
		});

		expect(iframe.getAttribute("frameborder")).toBe("0");
		expect(iframe.getAttribute("allowtransparency")).toBe("true");
		expect(iframe.getAttribute("scrolling")).toBe("no");
	});
});

describe("destroyIframe", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	it("should remove iframe from DOM", () => {
		const iframe = createIframe({
			url: "about:blank",
			name: "test",
			container,
			dimensions: { width: 100, height: 100 },
		});

		expect(container.contains(iframe)).toBe(true);

		destroyIframe(iframe);

		expect(container.contains(iframe)).toBe(false);
	});

	it("should set src to about:blank", () => {
		const iframe = createIframe({
			url: "https://example.com",
			name: "test",
			container,
			dimensions: { width: 100, height: 100 },
		});

		destroyIframe(iframe);

		expect(iframe.src).toContain("about:blank");
	});

	it("should not throw for already removed iframe", () => {
		const iframe = document.createElement("iframe");
		// Not attached to DOM

		expect(() => destroyIframe(iframe)).not.toThrow();
	});
});

describe("resizeIframe", () => {
	it("should update iframe dimensions", () => {
		const iframe = document.createElement("iframe");
		iframe.style.width = "100px";
		iframe.style.height = "100px";

		resizeIframe(iframe, { width: 500, height: 400 });

		expect(iframe.style.width).toBe("500px");
		expect(iframe.style.height).toBe("400px");
	});

	it("should handle string dimensions", () => {
		const iframe = document.createElement("iframe");

		resizeIframe(iframe, { width: "80%", height: "50vh" });

		expect(iframe.style.width).toBe("80%");
		expect(iframe.style.height).toBe("50vh");
	});

	it("should handle partial dimensions", () => {
		const iframe = document.createElement("iframe");
		iframe.style.width = "100px";
		iframe.style.height = "100px";

		resizeIframe(iframe, { width: 200 });

		expect(iframe.style.width).toBe("200px");
		expect(iframe.style.height).toBe("100px");
	});
});

describe("showIframe", () => {
	it("should make iframe visible", () => {
		const iframe = document.createElement("iframe");
		iframe.style.display = "none";
		iframe.style.visibility = "hidden";

		showIframe(iframe);

		expect(iframe.style.display).toBe("");
		expect(iframe.style.visibility).toBe("visible");
	});
});

describe("hideIframe", () => {
	it("should hide iframe", () => {
		const iframe = document.createElement("iframe");
		iframe.style.display = "";
		iframe.style.visibility = "visible";

		hideIframe(iframe);

		expect(iframe.style.display).toBe("none");
		expect(iframe.style.visibility).toBe("hidden");
	});
});

describe("focusIframe", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	it("should call focus on iframe", () => {
		const iframe = document.createElement("iframe");
		container.appendChild(iframe);
		const focusSpy = vi.spyOn(iframe, "focus");

		focusIframe(iframe);

		expect(focusSpy).toHaveBeenCalled();
	});

	it("should not throw on cross-origin error", () => {
		const iframe = document.createElement("iframe");
		vi.spyOn(iframe, "focus").mockImplementation(() => {
			throw new Error("Cross-origin");
		});

		expect(() => focusIframe(iframe)).not.toThrow();
	});
});
