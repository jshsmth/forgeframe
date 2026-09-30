import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hostRuntime = vi.hoisted(() => ({
	create: vi.fn(),
	initHost: vi.fn(),
	isHost: vi.fn(),
}));
vi.mock("forgeframe", () => ({
	...hostRuntime,
	prop: { string: () => ({ optional: () => ({}) }) },
}));
vi.mock("../../../playground/consumer/elements", () => ({
	elements: {
		get eventLog() {
			return document.getElementById("event-log");
		},
	},
}));

beforeEach(() => {
	vi.resetModules();
	document.body.innerHTML = '<div id="app"></div><div id="event-log"></div>';
});
afterEach(() => {
	Reflect.deleteProperty(window, "hostProps");
	document.body.replaceChildren();
});

describe("playground cross-window text", () => {
	it("renders prop names, values and identity as text and keeps updates and controls", async () => {
		const markup = '<img src="missing" data-injected="yes"> & <svg></svg>';
		const key = 'extra" data-injected="key"><svg>';
		const onProps = vi.fn();
		const onGreet = vi.fn();
		const exported = vi.fn().mockResolvedValue(undefined);
		const props = {
			name: markup,
			count: 7,
			[key]: markup,
			tag: markup,
			uid: markup,
			getConsumerDomain: () => markup,
			onProps,
			onGreet,
			export: exported,
		};
		Object.defineProperty(window, "hostProps", {
			configurable: true,
			value: props,
		});
		hostRuntime.initHost.mockReturnValue({ ready: Promise.resolve() });
		hostRuntime.isHost.mockReturnValue(true);
		await import("../../../playground/host/main");
		await vi.waitFor(() => expect(onProps).toHaveBeenCalledOnce());
		expect(
			document.querySelector("[data-injected], img, svg[data-injected]"),
		).toBeNull();
		expect(document.getElementById(`prop-${key}`)?.textContent).toBe(markup);
		expect(
			Array.from(
				document.querySelectorAll(".props-grid dt"),
				(node) => node.textContent,
			),
		).toContain(key);
		expect(document.querySelector(".badge")?.textContent).toBe(markup);
		expect(document.getElementById("host-uid")?.textContent).toBe(
			`${markup.slice(0, 12)}...`,
		);
		expect(document.getElementById("consumer-domain")?.textContent).toBe(
			markup,
		);
		const update = '<b data-injected="update">updated</b>';
		props.name = update;
		onProps.mock.calls[0]?.[0]({ name: update });
		expect(document.getElementById("prop-name")?.textContent).toBe(update);
		expect(document.querySelector("[data-injected]")).toBeNull();
		document.getElementById("btn-greet")?.click();
		expect(onGreet).toHaveBeenCalledWith(`Hello! Name: ${update}, Count: 7`);
		document.getElementById("btn-export")?.click();
		expect(exported).toHaveBeenCalledWith(
			expect.objectContaining({ data: { name: update, count: 7 } }),
		);
	});

	it("logs markup and entities literally with the existing spans and ordering", async () => {
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		const { log, clearLog } = await import(
			"../../../playground/consumer/logger"
		);
		const messages = [
			'<img src="missing" data-injected="yes">',
			'&lt;svg&gt; & "quoted"',
		];
		log(messages[0], "error");
		log(messages[1], "success");
		expect(document.querySelector("[data-injected], img, svg")).toBeNull();
		expect(
			Array.from(
				document.querySelectorAll(".log-entry .message"),
				(node) => node.textContent,
			),
		).toEqual(messages);
		expect(document.querySelectorAll(".log-entry .time")).toHaveLength(2);
		expect(document.querySelector(".log-entry")?.className).toBe(
			"log-entry error",
		);
		clearLog();
		expect(document.getElementById("event-log")?.childElementCount).toBe(0);
	});
});
