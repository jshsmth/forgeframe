import { describe, expect, it } from "vitest";
import {
	definedInputKeys,
	invalidatePatchedKeys,
	mergePropPatch,
	PROP_RESET,
} from "@/core/consumer/prop-update";

describe("canonical prop snapshot preparation", () => {
	it("distinguishes omission reset from a supplied undefined without mutating the previous snapshot", () => {
		const previous = { count: 3, label: "old", untouched: true };
		const next = mergePropPatch(previous, {
			count: PROP_RESET,
			label: undefined,
		});
		expect(Object.hasOwn(next, "count")).toBe(false);
		expect(Object.hasOwn(next, "label")).toBe(true);
		expect(next).toEqual({ label: undefined, untouched: true });
		expect(previous).toEqual({ count: 3, label: "old", untouched: true });
	});

	it("invalidates reset and cleared keys but retains evidence for untouched values", () => {
		const previous = new Set(["count", "label", "untouched"]);
		expect(
			invalidatePatchedKeys(previous, { count: PROP_RESET, label: undefined }),
		).toEqual(new Set(["untouched"]));
		expect(previous.size).toBe(3);
	});

	it("selects only defined own values, including false and null", () => {
		const props = Object.assign(Object.create({ inherited: 1 }), {
			omitted: undefined,
			zero: 0,
			no: false,
			empty: null,
		});
		expect(
			definedInputKeys(props, [
				"inherited",
				"omitted",
				"zero",
				"no",
				"empty",
				"missing",
			]),
		).toEqual(new Set(["zero", "no", "empty"]));
	});
});
