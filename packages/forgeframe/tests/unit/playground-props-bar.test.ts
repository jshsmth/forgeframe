import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearComponents, destroyAll } from "@/core/component";
import { ConsumerComponent } from "@/core/consumer";
import { elements } from "../../../playground/consumer/elements";
import { renderPropsBar } from "../../../playground/consumer/props-bar";
import {
	createModalTemplate,
	renderComponent,
} from "../../../playground/consumer/renderer";
import {
	componentCache,
	currentPropValues,
	resetPropValues,
	setCurrentConfig,
	setInstance,
} from "../../../playground/consumer/state";

vi.mock("../../../playground/consumer/logger", () => ({
	log: vi.fn(),
	setStatus: vi.fn(),
	setButtonsEnabled: vi.fn(),
}));

beforeEach(() => {
	elements.propsBar = document.createElement("div");
	document.body.append(elements.propsBar);
});
afterEach(async () => {
	await destroyAll();
	clearComponents();
	componentCache.clear();
	setInstance(null);
	vi.restoreAllMocks();
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
	it("renders typed editor values without converting composites or callbacks to strings", async () => {
		const config = {
			tag: "typed-editor",
			url: "https://example.com",
			props: {
				items: { type: "array", required: true, default: [1] },
				record: { type: "object", required: true, default: { count: 2 } },
				onRun: { type: "function", required: true },
			},
		};
		setCurrentConfig(config);
		renderPropsBar(config);
		let eligible = false;
		const render = vi
			.spyOn(ConsumerComponent.prototype, "render")
			.mockImplementation(async function (
				this: ConsumerComponent<Record<string, unknown>>,
			) {
				eligible = this.isEligible();
			});
		await renderComponent();
		expect(render).toHaveBeenCalledOnce();
		expect(eligible).toBe(true);
		expect(currentPropValues.items).toEqual([1]);
		expect(currentPropValues.record).toEqual({ count: 2 });
		expect(currentPropValues.onRun).toBeTypeOf("function");
	});
	it("refreshes cached modal definitions when the prop configuration changes", () => {
		const config = {
			tag: "modal-editor",
			url: "https://example.com",
			props: { first: { type: "string" } },
		};
		const first = createModalTemplate(config);
		expect(createModalTemplate(config)).toBe(first);
		const changed = createModalTemplate({
			...config,
			props: { second: { type: "number" } },
		});
		expect(changed).not.toBe(first);
		expect(
			changed({
				second: 2,
				onGreet: () => {},
				onClose: () => {},
				onError: () => {},
			}).isEligible(),
		).toBe(true);
	});
});
