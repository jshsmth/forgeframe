import { describe, expect, it } from "vitest";
import {
	normalizeDimensionToCSS,
	normalizeDimensionToNumber,
} from "@/utils/dimension";

describe("popup pixel dimensions", () => {
	it.each([
		undefined,
		"100%",
		"50vh",
		"2rem",
		"auto",
		"calc(100px + 20px)",
		"500px extra",
		"",
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])("uses the fallback for %s", (value) => {
		expect(normalizeDimensionToNumber(value, 500)).toBe(500);
	});
	it.each([
		[400, 400],
		["400", 400],
		["500px", 500],
		[" 500px ", 500],
		["500.9px", 500],
	])("accepts pixel dimension %s", (value, expected) => {
		expect(normalizeDimensionToNumber(value, 99)).toBe(expected);
	});
	it("preserves CSS units for iframe sizing", () => {
		expect(normalizeDimensionToCSS("100%")).toBe("100%");
		expect(normalizeDimensionToCSS("50vh")).toBe("50vh");
	});
});
