import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearComponents, create, destroyAll } from "@/core/component";
import { ConsumerComponent } from "@/core/consumer";
import { HOST_PROPS_BUILTIN_KEYS } from "@/core/host/builtin-keys";
import { createDeferred } from "@/utils/promise";
import { elements } from "../../../playground/consumer/elements";
import { log } from "../../../playground/consumer/logger";
import {
	renderPropsBar,
	setOnConfigChange,
} from "../../../playground/consumer/props-bar";
import {
	createModalTemplate,
	renderComponent,
} from "../../../playground/consumer/renderer";
import {
	componentCache,
	currentConfig,
	currentPropValues,
	propInputDrafts,
	recordRunningConfiguration,
	resetPropValues,
	runningConfiguration,
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
	it.each([...HOST_PROPS_BUILTIN_KEYS])(
		"rejects reserved host-control name %s without changing configuration",
		(name) => {
			const config = {
				tag: "reserved-editor",
				url: "https://example.com",
				props: {},
			};
			setCurrentConfig(config);
			const changed = vi.fn();
			setOnConfigChange(changed);
			renderPropsBar(config);
			const input =
				elements.propsBar.querySelector<HTMLInputElement>("#new-prop-name");
			if (!input) throw new Error("Missing Add Prop input");
			input.value = name;
			elements.propsBar
				.querySelector<HTMLButtonElement>("#btn-confirm-add")
				?.click();
			expect(currentConfig.props).toEqual({});
			expect(Object.hasOwn(currentPropValues, name)).toBe(false);
			expect(changed).not.toHaveBeenCalled();
			expect(log).toHaveBeenLastCalledWith(
				"A non-reserved prop name is required",
				"error",
			);
		},
	);

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
	it.each([
		{
			label: "a newer valid draft",
			nextText: "2",
			expectedValue: 2,
			valid: true,
			fieldError: false,
			summary: "Draft changes pending",
		},
		{
			label: "a newer incomplete draft",
			nextText: "",
			expectedValue: 1,
			valid: false,
			fieldError: false,
			summary: "Draft contains incomplete or invalid values",
		},
		{
			label: "the unchanged submitted draft",
			nextText: "1",
			expectedValue: 1,
			valid: true,
			fieldError: true,
			summary: "Draft contains invalid values",
		},
	])(
		"associates a rejected update with its submitted text, preserving $label",
		async ({ nextText, expectedValue, valid, fieldError, summary }) => {
			const config = {
				tag: "pending-editor",
				url: "https://example.com",
				props: { count: { type: "number", default: 0 } },
			};
			setCurrentConfig(config);
			const target = create<Record<string, unknown>>({
				tag: config.tag,
				url: config.url,
			})({ count: 0 });
			setInstance(target);
			recordRunningConfiguration("iframe", "embedded", { count: 0 });
			const status = document.createElement("p");
			status.id = "configuration-summary";
			document.body.append(status);
			const pending = createDeferred<void>();
			const update = vi
				.spyOn(target, "updateProps")
				.mockReturnValue(pending.promise);
			renderPropsBar(config);
			const input = elements.propsBar.querySelector("input[data-prop]");
			const button = elements.propsBar.querySelector<HTMLButtonElement>(
				"button[data-update-prop]",
			);
			if (!(input instanceof HTMLInputElement) || !button)
				throw new Error("Missing prop controls");
			input.value = "1";
			input.dispatchEvent(new Event("input"));
			button.click();
			expect(update).toHaveBeenCalledWith({ count: 1 });
			expect(button.disabled).toBe(true);
			input.value = nextText;
			input.dispatchEvent(new Event("input"));
			pending.reject(new Error("Submitted update rejected"));
			await vi.waitFor(() => expect(button.disabled).toBe(false));
			expect(input.value).toBe(nextText);
			expect(currentPropValues.count).toBe(expectedValue);
			expect(propInputDrafts.count).toEqual({ text: nextText, valid });
			expect(runningConfiguration?.props.count).toBe("0");
			expect(input.getAttribute("aria-invalid")).toBe(String(fieldError));
			expect(status.textContent).toContain(summary);
			const error = elements.propsBar.querySelector(".field-error");
			if (fieldError)
				expect(error?.textContent).toContain("Submitted update rejected");
			else expect(error?.textContent).toBe("");
			expect(log).toHaveBeenLastCalledWith(
				"Could not update count: Error: Submitted update rejected",
				"error",
			);
		},
	);
	it("clears a rejected Apply error while typing an invalid draft and validates the new draft on change", async () => {
		const config = {
			tag: "rejected-editor",
			url: "https://example.com",
			props: { count: { type: "number", default: 0 } },
		};
		setCurrentConfig(config);
		const target = create<Record<string, unknown>>({
			tag: config.tag,
			url: config.url,
		})({ count: 0 });
		setInstance(target);
		recordRunningConfiguration("iframe", "embedded", { count: 0 });
		const status = document.createElement("p");
		status.id = "configuration-summary";
		document.body.append(status);
		const update = vi
			.spyOn(target, "updateProps")
			.mockRejectedValue(new Error("Submitted update rejected"));
		renderPropsBar(config);
		const input = elements.propsBar.querySelector("input[data-prop]");
		const button = elements.propsBar.querySelector<HTMLButtonElement>(
			"button[data-update-prop]",
		);
		if (!(input instanceof HTMLInputElement) || !button)
			throw new Error("Missing prop controls");
		input.value = "1";
		input.dispatchEvent(new Event("input"));
		button.click();
		await vi.waitFor(() => expect(button.disabled).toBe(false));
		const error = elements.propsBar.querySelector(".field-error");
		expect(error?.textContent).toContain("Submitted update rejected");
		expect(input.getAttribute("aria-invalid")).toBe("true");
		const logCount = vi.mocked(log).mock.calls.length;
		input.value = "";
		input.dispatchEvent(new Event("input"));
		expect(error?.textContent).toBe("");
		expect(input.getAttribute("aria-invalid")).toBe("false");
		expect(propInputDrafts.count).toEqual({ text: "", valid: false });
		expect(currentPropValues.count).toBe(1);
		expect(runningConfiguration?.props.count).toBe("0");
		expect(status.textContent).toContain(
			"Draft contains incomplete or invalid values",
		);
		expect(log).toHaveBeenCalledTimes(logCount);
		input.dispatchEvent(new Event("change"));
		expect(error?.textContent).toContain("Expected a finite number");
		expect(error?.textContent).not.toContain("Submitted update rejected");
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(update).toHaveBeenCalledTimes(1);
	});
	it("logs the submitted value after an update succeeds while preserving a newer draft", async () => {
		const config = {
			tag: "pending-editor",
			url: "https://example.com",
			props: { count: { type: "number", default: 0 } },
		};
		setCurrentConfig(config);
		const target = create<Record<string, unknown>>({
			tag: config.tag,
			url: config.url,
		})({ count: 0 });
		setInstance(target);
		recordRunningConfiguration("iframe", "embedded", { count: 0 });
		const status = document.createElement("p");
		status.id = "configuration-summary";
		document.body.append(status);
		const pending = createDeferred<void>();
		const update = vi
			.spyOn(target, "updateProps")
			.mockReturnValue(pending.promise);
		renderPropsBar(config);
		const input = elements.propsBar.querySelector("input[data-prop]");
		const button = elements.propsBar.querySelector<HTMLButtonElement>(
			"button[data-update-prop]",
		);
		if (!(input instanceof HTMLInputElement) || !button)
			throw new Error("Missing prop controls");
		input.value = "1";
		input.dispatchEvent(new Event("input"));
		button.click();
		expect(update).toHaveBeenCalledWith({ count: 1 });
		expect(button.disabled).toBe(true);
		input.value = "2";
		input.dispatchEvent(new Event("input"));
		pending.resolve();
		await vi.waitFor(() => expect(button.disabled).toBe(false));
		expect(log).toHaveBeenLastCalledWith("Updated count to: 1", "info");
		expect(runningConfiguration?.props.count).toBe("1");
		expect(input.value).toBe("2");
		expect(currentPropValues.count).toBe(2);
		expect(propInputDrafts.count).toEqual({ text: "2", valid: true });
		expect(status.textContent).toContain("Draft changes pending");
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
