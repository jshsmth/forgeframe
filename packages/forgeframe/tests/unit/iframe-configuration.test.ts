import { describe, expect, it } from "vitest";
import {
	encodeIframeAttribute,
	encodeIframeStyle,
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

	it("preserves boolean presence, explicit strings, and omitted attributes", () => {
		expect(encodeIframeAttribute(true)).toBe("");
		expect(encodeIframeAttribute(false)).toBeUndefined();
		expect(encodeIframeAttribute(undefined)).toBeUndefined();
		expect(encodeIframeAttribute("")).toBe("");
		expect(encodeIframeAttribute("allow-scripts")).toBe("allow-scripts");
	});
});
