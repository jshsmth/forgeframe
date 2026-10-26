/**
 * Unit tests for `@/render/iframe`.
 *
 * Covers iframe element configuration and destruction, visibility and sizing helpers, and attribute handling.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createIframeElement,
	destroyIframe,
	focusIframe,
	hideIframe,
	resizeIframe,
	showIframe,
} from "@/render/iframe";

describe("createIframeElement", () => {
	it("should create an unattached iframe with its name and dimensions", () => {
		const iframe = createIframeElement({
			name: "test-iframe",
			dimensions: { width: 400, height: 300 },
			sandbox: null,
		});

		expect(iframe.tagName).toBe("IFRAME");
		expect(iframe.name).toBe("test-iframe");
		expect(iframe.hasAttribute("src")).toBe(false);
		expect(iframe.isConnected).toBe(false);
		expect(iframe.style.width).toBe("400px");
		expect(iframe.style.height).toBe("300px");
	});

	it("should set default frame attributes", () => {
		const iframe = createIframeElement({
			name: "test-iframe",
			dimensions: { width: 100, height: 100 },
			sandbox: null,
		});

		expect(iframe.getAttribute("frameborder")).toBe("0");
		expect(iframe.getAttribute("allowtransparency")).toBe("true");
		expect(iframe.getAttribute("scrolling")).toBe("auto");
	});

	it("should apply custom attributes", () => {
		const iframe = createIframeElement({
			name: "test-iframe",
			dimensions: { width: 100, height: 100 },
			sandbox: null,
			attributes: {
				allow: "payment",
				title: "Payment Widget",
			},
		});

		expect(iframe.getAttribute("allow")).toBe("payment");
		expect(iframe.getAttribute("title")).toBe("Payment Widget");
	});

	it.each(["name", "src", "srcdoc"])(
		"should reject the reserved %s bootstrap attribute",
		(attribute) => {
			expect(() =>
				createIframeElement({
					name: "trusted-bootstrap",
					dimensions: { width: 100, height: 100 },
					sandbox: null,
					attributes: { [attribute]: "attacker-controlled" },
				}),
			).toThrow(`Iframe attribute "${attribute}" is managed by ForgeFrame`);
		},
	);

	it.each(["sandbox", "Sandbox", "SANDBOX"])(
		"rejects a %s attribute and points to the sandbox option",
		(attribute) => {
			expect(() =>
				createIframeElement({
					name: "test-iframe",
					dimensions: { width: 100, height: 100 },
					attributes: { [attribute]: "allow-scripts" },
					sandbox: null,
				}),
			).toThrow(
				`Iframe attribute "${attribute}" is not allowed; set the component's sandbox option instead`,
			);
		},
	);

	it("writes the resolved sandbox verbatim, or none for null", () => {
		const sandboxed = createIframeElement({
			name: "test-iframe",
			dimensions: { width: 100, height: 100 },
			sandbox: "allow-scripts allow-same-origin",
		});
		const unsandboxed = createIframeElement({
			name: "test-iframe",
			dimensions: { width: 100, height: 100 },
			sandbox: null,
		});

		expect(sandboxed.getAttribute("sandbox")).toBe(
			"allow-scripts allow-same-origin",
		);
		expect(unsandboxed.hasAttribute("sandbox")).toBe(false);
	});

	it("should apply custom styles", () => {
		const iframe = createIframeElement({
			name: "test-iframe",
			dimensions: { width: 100, height: 100 },
			sandbox: null,
			style: {
				borderRadius: "12px",
			},
		});

		expect(iframe.style.getPropertyValue("border-radius")).toBe("12px");
	});

	it("should preserve unitless numeric styles and case-sensitive CSS variables", () => {
		const iframe = createIframeElement({
			name: "styled-frame",
			dimensions: { width: 100, height: 100 },
			sandbox: null,
			style: {
				zIndex: 10,
				lineHeight: 1.5,
				"--brandColor": "red",
				"--scaleFactor": 2,
				borderColor: "var(--brandColor)",
			},
		});

		expect(iframe.style.zIndex).toBe("10");
		expect(iframe.style.lineHeight).toBe("1.5");
		expect(iframe.style.getPropertyValue("--brandColor")).toBe("red");
		expect(iframe.style.getPropertyValue("--scaleFactor")).toBe("2");
		expect(iframe.style.borderColor).toBe("var(--brandColor)");
	});

	it("should skip undefined attributes", () => {
		const iframe = createIframeElement({
			name: "test-iframe",
			dimensions: { width: 100, height: 100 },
			sandbox: null,
			attributes: {
				title: undefined as unknown as string,
			},
		});

		expect(iframe.hasAttribute("title")).toBe(false);
	});

	it("should handle string dimensions", () => {
		const iframe = createIframeElement({
			name: "test-iframe",
			dimensions: { width: "100%", height: "auto" },
			sandbox: null,
		});

		expect(iframe.style.width).toBe("100%");
		expect(iframe.style.height).toBe("auto");
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

	function appendIframe(url: string): HTMLIFrameElement {
		const iframe = createIframeElement({
			name: "test",
			dimensions: { width: 100, height: 100 },
			sandbox: null,
		});
		container.appendChild(iframe);
		iframe.src = url;
		return iframe;
	}

	it("should remove iframe from DOM", () => {
		const iframe = appendIframe("about:blank");

		expect(container.contains(iframe)).toBe(true);

		destroyIframe(iframe);

		expect(container.contains(iframe)).toBe(false);
	});

	it("should set src to about:blank", () => {
		const iframe = appendIframe("https://example.com");

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
