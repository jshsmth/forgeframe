import { describe, expect, it } from "vitest";
import {
	definedInputKeys,
	mergeNormalizedPatch,
	mergePropPatch,
	selectNormalizationKeys,
	selectUpdateDeliveryOrigin,
} from "@/core/consumer/prop-update";

describe("canonical prop snapshot preparation", () => {
	it("removes a key whose patch value is undefined without mutating either input", () => {
		const previous = { count: 3, label: "old", untouched: true };
		const patch = { count: undefined, label: null };
		const next = mergePropPatch(previous, patch);
		expect(Object.hasOwn(next, "count")).toBe(false);
		expect(next).toEqual({ label: null, untouched: true });
		expect(previous).toEqual({ count: 3, label: "old", untouched: true });
		expect(patch).toEqual({ count: undefined, label: null });
	});

	it("selects defined own values, including false and null, except excluded keys", () => {
		const props = Object.assign(Object.create({ inherited: 1 }), {
			omitted: undefined,
			zero: 0,
			no: false,
			empty: null,
			patched: "new",
		});
		expect(definedInputKeys(props)).toEqual(
			new Set(["zero", "no", "empty", "patched"]),
		);
		expect(definedInputKeys(props, new Set(["patched", "zero"]))).toEqual(
			new Set(["no", "empty"]),
		);
	});

	it("normalizes every patched key, including reset ones, or everything after a construction failure", () => {
		const patch = { title: "next", theme: undefined };
		expect(selectNormalizationKeys(patch, false)).toEqual(
			new Set(["title", "theme"]),
		);
		expect(selectNormalizationKeys(patch, true)).toBeUndefined();
	});

	it("overlays normalized values, including reset ones, without mutating the current snapshot", () => {
		const current = { title: "old", theme: "dark", note: "kept" };
		const next = mergeNormalizedPatch(current, {
			theme: "light",
			title: undefined,
		});
		expect(next).toEqual({ title: undefined, theme: "light", note: "kept" });
		expect(Object.hasOwn(next, "title")).toBe(true);
		expect(current).toEqual({ title: "old", theme: "dark", note: "kept" });
	});

	it("delivers to the host origin once rendered and to the URL origin before", () => {
		expect(
			selectUpdateDeliveryOrigin(true, "https://host.example", "https://next"),
		).toBe("https://host.example");
		expect(
			selectUpdateDeliveryOrigin(false, "https://host.example", "https://next"),
		).toBe("https://next");
		expect(selectUpdateDeliveryOrigin(true, null, "https://next")).toBe(
			"https://next",
		);
	});
});
