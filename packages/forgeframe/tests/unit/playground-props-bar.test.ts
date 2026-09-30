import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elements } from "../../../playground/consumer/elements";
import { renderPropsBar } from "../../../playground/consumer/props-bar";
import {
	currentPropValues,
	resetPropValues,
} from "../../../playground/consumer/state";

vi.mock("../../../playground/consumer/logger", () => ({ log: vi.fn() }));

beforeEach(() => {
	elements.propsBar = document.createElement("div");
	document.body.append(elements.propsBar);
});
afterEach(() => {
	resetPropValues();
	document.body.replaceChildren();
});

describe("playground prop editor", () => {
	it("preserves quoted names and HTML-like values as text", async () => {
		const key = 'display"name';
		const value = '<img src=x onerror="alert(1)">';
		renderPropsBar({
			tag: "editor",
			url: "https://example.com",
			props: { [key]: { type: "string", default: value } },
		});
		expect(elements.propsBar.querySelector("img")).toBeNull();
		const input = elements.propsBar.querySelector("input");
		expect(input?.value).toBe(value);
		expect(input?.dataset.prop).toBe(key);
		if (!input) throw new Error("Missing prop input");
		input.value = 'updated "value"';
		elements.propsBar
			.querySelector<HTMLButtonElement>("button[data-update-prop]")
			?.click();
		await Promise.resolve();
		expect(currentPropValues[key]).toBe(input.value);
	});

	it.each([
		{
			type: "array",
			value: [1, "two"],
			edited: '[3,"four"]',
			expected: [3, "four"],
		},
		{
			type: "object",
			value: { count: 1 },
			edited: '{"count":2}',
			expected: { count: 2 },
		},
	])("edits $type values as JSON", ({ type, value, edited, expected }) => {
		renderPropsBar({
			tag: "editor",
			url: "https://example.com",
			props: { data: { type, default: value } },
		});
		const input = elements.propsBar.querySelector("input");
		if (!input) throw new Error("Missing prop input");
		expect(input.value).toBe(JSON.stringify(value));
		input.value = edited;
		input.dispatchEvent(new Event("change"));
		expect(currentPropValues.data).toEqual(expected);
		input.value = "invalid JSON";
		input.dispatchEvent(new Event("change"));
		expect(currentPropValues.data).toEqual(expected);
	});

	it("keeps invalid numbers out of the current snapshot", () => {
		renderPropsBar({
			tag: "editor",
			url: "https://example.com",
			props: { count: { type: "number", default: 5 } },
		});
		const input = elements.propsBar.querySelector("input");
		if (!input) throw new Error("Missing prop input");
		input.value = "";
		input.dispatchEvent(new Event("change"));
		expect(currentPropValues.count).toBe(5);
	});
});
