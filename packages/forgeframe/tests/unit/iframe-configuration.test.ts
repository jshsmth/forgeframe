import { describe, expect, it } from "vitest";
import {
	DEFAULT_IFRAME_SANDBOX,
	encodeIframeAttribute,
	encodeIframeStyle,
	resolveIframeSandbox,
} from "../../src/render/iframe-configuration";

describe("iframe configuration encoding", () => {
	it("retains CSS property conversion and numeric pixel values", () => {
		expect(encodeIframeStyle("marginTop", 12)).toEqual({
			property: "margin-top",
			value: "12px",
		});
		expect(encodeIframeStyle("width", "100%")).toEqual({
			property: "width",
			value: "100%",
		});
	});

	it.each([
		"fontWeight",
		"fontSizeAdjust",
		"mathDepth",
		"shapeImageThreshold",
		"hyphenateLimitChars",
		"initialLetter",
		"readingOrder",
		"flexLineCount",
		"borderImage",
		"maskBorderSlice",
		"WebkitHyphenateLimitLines",
		"WebkitMaskBoxImageSlice",
		"opacity",
		"flexGrow",
		"gridRow",
		"aspectRatio",
		"WebkitLineClamp",
	])("encodes numeric %s without length units", (property) => {
		expect(encodeIframeStyle(property, 2).value).toBe("2");
	});

	it("preserves kebab-case unitless properties", () => {
		expect(encodeIframeStyle("z-index", 10)).toEqual({
			property: "z-index",
			value: "10",
		});
	});

	it("preserves boolean presence, explicit strings, and omitted attributes", () => {
		expect(encodeIframeAttribute(true)).toBe("");
		expect(encodeIframeAttribute(false)).toBeUndefined();
		expect(encodeIframeAttribute(undefined)).toBeUndefined();
		expect(encodeIframeAttribute("")).toBe("");
		expect(encodeIframeAttribute("allow-scripts")).toBe("allow-scripts");
	});
});

describe("resolveIframeSandbox", () => {
	it("uses the default tokens when the option is omitted", () => {
		expect(resolveIframeSandbox(undefined)).toBe(DEFAULT_IFRAME_SANDBOX);
		expect(DEFAULT_IFRAME_SANDBOX).toBe(
			"allow-scripts allow-same-origin allow-forms allow-popups",
		);
	});

	it("keeps a custom string exactly as given", () => {
		expect(resolveIframeSandbox(" allow-scripts  allow-same-origin ")).toBe(
			" allow-scripts  allow-same-origin ",
		);
	});

	it("writes no sandbox for false", () => {
		expect(resolveIframeSandbox(false)).toBeNull();
	});
});
