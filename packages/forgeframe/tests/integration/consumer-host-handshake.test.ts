/**
 * Integration test covering the primary iframe happy path.
 *
 * Exercises `create()`, `instance.render()`, `initHost()`, and the real INIT
 * handshake across separate consumer and host windows.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { deserializeMessage } from "@/communication/protocol";
import { getHost } from "@/core/host/bootstrap";
import { create, prop } from "@/index";
import type {
	ComponentBaseOptions,
	ComponentOptions,
	ComponentUrlOptions,
	PropsDefinition,
} from "@/types";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

type HandshakeProps = {
	amount: number;
	message: string;
};

const HANDSHAKE_PROP_DEFINITIONS: PropsDefinition<HandshakeProps> = {
	amount: { schema: prop.number() },
	message: { schema: prop.string() },
};

describe("Consumer/host handshake integration", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	it("rejects render() before creating a frame when the component validate throws", async () => {
		harness = createIframeIntegrationHarness();
		const Component = create({
			tag: "validate-gate-component",
			url: "https://host.example.com/widget",
			props: { amount: prop.number() },
			validate: ({ props }) => {
				if (props.amount < 0) throw new Error("Amount must be positive");
			},
		});
		const container = document.createElement("div");
		document.body.append(container);

		await expect(Component({ amount: -1 }).render(container)).rejects.toThrow(
			"Amount must be positive",
		);
		expect(container.querySelector("iframe")).toBeNull();
	});

	it("bootstraps with props only and exposes consumer.props without export", async () => {
		harness = createIframeIntegrationHarness();
		const definitions = { amount: prop.number() };
		const Component = create({
			tag: "bootstrap-props-only",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const container = document.createElement("div");
		document.body.append(container);
		const instance = Component({ amount: 1 });
		const posted = vi.spyOn(harness.hostWindow, "postMessage");
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await expect(rendering).resolves.toBeUndefined();

		const bootstrapResponses = posted.mock.calls
			.map(([data]) => deserializeMessage(data))
			.filter(
				(message) =>
					message?.type === "response" &&
					typeof message.data === "object" &&
					message.data !== null &&
					"props" in message.data,
			);
		expect(bootstrapResponses).toHaveLength(1);
		expect(bootstrapResponses[0]?.data).toEqual({
			props: { amount: 1 },
		});
		expect(Object.hasOwn(hostProps, "children")).toBe(false);
		expect(Object.keys(hostProps.consumer)).toEqual(["props"]);
		expect(hostProps.consumer.props).toEqual({ amount: 1 });

		const consumer = hostProps.consumer;
		await instance.updateProps({ amount: 2 });
		expect(hostProps.consumer).toBe(consumer);
		expect(hostProps.consumer.props).toEqual({ amount: 2 });
	});

	it("initializes a fresh host after public teardown and clears stale host props", async () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "host-public-teardown",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const container = document.createElement("div");
		document.body.append(container);
		const instance = Component({ title: "initial" });
		const rendering = instance.render(container);
		const { host } = await activeHarness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		activeHarness.withHostGlobals(() => host.destroy());
		expect(getHost()).toBeNull();
		await expect(host.hostProps.hide()).rejects.toThrow();
		const nextHost = activeHarness.bootstrapHost(definitions);
		if (!nextHost) throw new Error("Expected host reinitialization");
		expect(nextHost).not.toBe(host);
		expect(nextHost.hostProps).not.toBe(host.hostProps);
		await nextHost.ready;
		// Destroying the stale host again leaves its replacement working.
		activeHarness.withHostGlobals(() => host.destroy());
		expect(activeHarness.getHostProps()).toBe(nextHost.hostProps);
		expect(Object.hasOwn(activeHarness.hostWindow, "hostProps")).toBe(false);
		await expect(
			instance.updateProps({ title: "updated" }),
		).resolves.toBeUndefined();
		expect(nextHost.hostProps.title).toBe("updated");
		await expect(nextHost.hostProps.hide()).resolves.toBeUndefined();
		expect(container.querySelector("iframe")?.style.display).toBe("none");
	});

	it("reports the host's validation error once, at the initialization timeout", async () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		const Component = create({
			tag: "host-bootstrap-validation-failure",
			url: "https://host.example.com/widget",
			props: { amount: prop.number() },
			timeout: 300,
		});
		const container = document.createElement("div");
		document.body.append(container);
		const instance = Component({ amount: 5 });
		const errors: string[] = [];
		instance.event.on("error", (error) => {
			errors.push((error as Error).message);
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const rendering = instance.render(container);
		void rendering.catch(() => {});
		activeHarness.attachHostToIframe(
			await activeHarness.waitForIframe(container),
		);

		const host = activeHarness.bootstrapHost({ amount: prop.string() });
		if (!host) throw new Error("Expected a host");
		await expect(host.ready).rejects.toThrow("Expected string, got number");
		const hostReason =
			"Host initialization failed: Validation failed: amount: Expected string, got number";
		await expect(rendering).rejects.toThrow(
			`did not initialize within 300ms. ${hostReason}`,
		);
		expect(errors).toEqual([
			expect.stringContaining(`did not initialize within 300ms. ${hostReason}`),
		]);
	});

	it("accepts a same-page host retry after reporting the failed validation", async () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		const Component = create({
			tag: "host-bootstrap-validation-retry",
			url: "https://host.example.com/widget",
			props: { amount: prop.number() },
		});
		const container = document.createElement("div");
		document.body.append(container);
		const instance = Component({ amount: 5 });
		const errors = vi.fn();
		instance.event.on("error", errors);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const rendering = instance.render(container);
		activeHarness.attachHostToIframe(
			await activeHarness.waitForIframe(container),
		);

		const failed = activeHarness.bootstrapHost({ amount: prop.string() });
		await expect(failed?.ready).rejects.toThrow("Expected string, got number");
		// The failed start released the host before this handler ran.
		expect(getHost()).toBeNull();
		await activeHarness.flushMessages();
		const retried = activeHarness.bootstrapHost({ amount: prop.number() });
		if (!retried) throw new Error("Expected the retried host");
		await retried.ready;
		await expect(rendering).resolves.toBeUndefined();
		expect(retried.hostProps.amount).toBe(5);
		// A recovered handshake reports no failure.
		expect(errors).not.toHaveBeenCalled();
	});

	it("rejects host definitions that use the removed serialization option before starting a host", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const Component = create({
			tag: "removed-serialization-host",
			url: "https://host.example.com/widget",
			props: { profile: prop.any<Record<string, unknown>>() },
		});
		const rendering = Component({ profile: { name: "initial" } }).render(
			container,
		);
		harness.attachHostToIframe(await harness.waitForIframe(container));
		// A JavaScript host module can still pass the removed option.
		const legacyDefinitions = {
			profile: {
				schema: prop.any<Record<string, unknown>>(),
				serialization: "json",
			},
		};
		expect(() => harness?.bootstrapHost(legacyDefinitions)).toThrow(
			'Prop "profile" uses the removed "serialization" option. ForgeFrame 2 always sends props as JSON; remove the option.',
		);
		expect(getHost()).toBeNull();

		const host = harness.bootstrapHost({
			profile: prop.any<Record<string, unknown>>(),
		});
		if (!host) throw new Error("Expected the corrected host to initialize");
		await host.ready;
		await rendering;
		expect(host.hostProps.profile).toEqual({ name: "initial" });
	});

	it("rejects oversized bootstrap metadata before installing a host and accepts a valid retry", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const Component = create({
			tag: "oversized-bootstrap-admission",
			url: "https://host.example.com/widget",
			props: { title: prop.string() },
		});
		const instance = Component({ title: "safe" });
		const render = instance.render(container);
		// Cleanup may cancel this render if an admission assertion fails.
		void render.catch(() => {});
		const iframe = await harness.waitForIframe(container);
		harness.attachHostToIframe(iframe);
		const validName = harness.hostWindow.name;
		const prefix = "__forgeframe__";
		const metadata = JSON.parse(
			decodeURIComponent(atob(validName.slice(prefix.length))),
		);
		harness.hostWindow.name =
			prefix +
			btoa(
				encodeURIComponent(
					JSON.stringify({ ...metadata, padding: "x".repeat(32 * 1024) }),
				),
			);
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(harness.bootstrapHost({ title: prop.string() })).toBeNull();
		expect(getHost()).toBeNull();
		harness.hostWindow.name = validName;
		const host = harness.bootstrapHost({
			title: prop.string(),
		});
		if (!host)
			throw new Error("Expected the valid retry to initialize the host");
		await host.ready;
		await expect(render).resolves.toBeUndefined();
		expect(host.hostProps.title).toBe("safe");
		expect(container.querySelector("iframe")).toBe(iframe);
	});

	it("should resolve render() after initHost() completes the iframe INIT handshake", async () => {
		harness = createIframeIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const HandshakeComponent = create({
			tag: "integration-handshake-component",
			url: "https://host.example.com/widget",
			props: HANDSHAKE_PROP_DEFINITIONS,
		});

		const instance = HandshakeComponent({
			amount: 7,
			message: "ForgeFrame ready",
		});
		const renderedSpy = vi.fn();
		instance.event.once("rendered", renderedSpy);

		const renderPromise = instance.render(container);
		const { host, hostProps } = await harness.bootstrapIframeHost(
			container,
			HandshakeComponent,
		);

		await expect(renderPromise).resolves.toBeUndefined();

		// ready resolves to the live props object; no window global is defined.
		expect(hostProps).toBe(host.hostProps);
		expect(Object.hasOwn(harness.hostWindow, "hostProps")).toBe(false);
		expect(hostProps.amount).toBe(7);
		expect(hostProps.message).toBe("ForgeFrame ready");
		expect(hostProps.consumer.props).toEqual({
			amount: 7,
			message: "ForgeFrame ready",
		});

		expect(typeof hostProps.uid).toBe("string");
		expect(hostProps.tag).toBe("integration-handshake-component");
		expect(typeof hostProps.close).toBe("function");
		expect(typeof hostProps.focus).toBe("function");
		expect(typeof hostProps.resize).toBe("function");
		expect(typeof hostProps.show).toBe("function");
		expect(typeof hostProps.hide).toBe("function");
		expect(typeof hostProps.onProps).toBe("function");
		expect(typeof hostProps.reportError).toBe("function");
		expect(typeof hostProps.export).toBe("function");
		expect(Object.keys(hostProps.consumer)).toEqual(["props"]);
		expect(typeof hostProps.getPeerInstances).toBe("function");
		expect(hostProps.getConsumer()).toBe(harness.consumerWindow);
		expect(hostProps.getConsumerDomain()).toBe(harness.consumerOrigin);

		await expect(
			instance.updateProps({
				amount: 8,
				message: "ForgeFrame updated",
			}),
		).resolves.toBeUndefined();

		expect(hostProps.amount).toBe(8);
		expect(hostProps.message).toBe("ForgeFrame updated");
		expect(hostProps.consumer.props).toEqual({
			amount: 8,
			message: "ForgeFrame updated",
		});

		expect(renderedSpy).toHaveBeenCalledTimes(1);
	});
});

describe("Prop updates requested during render", () => {
	let harness: IframeIntegrationHarness | null = null;
	type Props = { amount: number };
	const definitions = { amount: prop.number() };

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	/** Starts a host on the rendered iframe, recording every notification. */
	async function startRecordingHost(
		container: ParentNode,
		options?: { autoInit?: boolean },
	) {
		const activeHarness = harness as IframeIntegrationHarness;
		const iframe = await activeHarness.waitForIframe(container);
		activeHarness.attachHostToIframe(iframe);
		const host = activeHarness.bootstrapHost(definitions, options);
		if (!host) throw new Error("Expected a host");
		const notifications: unknown[] = [];
		host.hostProps.onProps((props) => notifications.push(props.amount));
		return { host, notifications };
	}

	function setup(
		options: Partial<ComponentBaseOptions<Props>> &
			Partial<ComponentUrlOptions<Props>> = {},
	) {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const Component = create({
			tag: `render-hold-${Math.random().toString(36).slice(2)}`,
			url: "https://host.example.com/widget",
			props: definitions,
			...(options as Partial<ComponentBaseOptions<Props>>),
		} as ComponentOptions<Props>);
		return { Component, container };
	}

	it("delivers updates requested right after render() in call order, after the initial snapshot", async () => {
		const { Component, container } = setup();
		const instance = Component({ amount: 1 });
		const order: string[] = [];
		instance.event.on("rendered", () => {
			order.push("rendered");
		});
		instance.event.on("props", (props) => {
			order.push(`props ${props.amount}`);
		});

		const rendering = instance.render(container);
		const second = instance.updateProps({ amount: 2 });
		const third = instance.updateProps({ amount: 3 });
		const { host, notifications } = await startRecordingHost(container);
		const ready = await host.ready;
		expect(ready.amount).toBe(1);

		await rendering;
		await second;
		expect(host.hostProps.amount).toBeGreaterThanOrEqual(2);
		await third;
		expect(host.hostProps.amount).toBe(3);
		expect(notifications).toEqual([1, 2, 3]);
		expect(order).toEqual(["rendered", "props 2", "props 3"]);
	});

	it("queues updates from a render listener, a url function and the component validate", async () => {
		const updates: Promise<void>[] = [];
		let instance: ReturnType<ReturnType<typeof create>> | undefined;
		const queued = new Set<number>();
		const queueOnce = (amount: number) => {
			if (!instance || queued.has(amount)) return;
			queued.add(amount);
			updates.push(instance.updateProps({ amount }));
		};
		let rendering = false;
		const { Component, container } = setup({
			url: () => {
				if (rendering) queueOnce(3);
				return "https://host.example.com/widget";
			},
			domain: "https://host.example.com",
			validate: () => {
				if (rendering) queueOnce(2);
			},
		});
		instance = Component({ amount: 1 });
		instance.event.once("render", () => queueOnce(4));
		rendering = true;

		const render = instance.render(container);
		const { host, notifications } = await startRecordingHost(container);
		expect((await host.ready).amount).toBe(1);
		await render;
		await Promise.all(updates);
		expect(notifications).toEqual([1, 2, 3, 4]);
		expect(host.hostProps.amount).toBe(4);
	});

	it("rejects an invalid queued update on its own after the render", async () => {
		const { Component, container } = setup();
		const instance = Component({ amount: 1 });
		const rendering = instance.render(container);
		const invalid = instance.updateProps({ amount: "two" as never });
		const valid = instance.updateProps({ amount: 3 });
		const { host, notifications } = await startRecordingHost(container);
		await expect(rendering).resolves.toBeUndefined();
		await expect(invalid).rejects.toThrow("Validation failed: amount");
		await valid;
		expect(host.hostProps.amount).toBe(3);
		expect(notifications).toEqual([1, 3]);
	});

	it("rejects a queued update that changes the URL origin", async () => {
		const { Component, container } = setup({
			url: (props) =>
				props.amount === 2
					? "https://other.example.com/widget"
					: "https://host.example.com/widget",
			domain: ["https://host.example.com", "https://other.example.com"],
		});
		const instance = Component({ amount: 1 });
		const rendering = instance.render(container);
		const moved = instance.updateProps({ amount: 2 });
		const { host } = await startRecordingHost(container);
		await rendering;
		await expect(moved).rejects.toThrow(
			"Cannot change component URL origin after render",
		);
		expect(host.hostProps.amount).toBe(1);
	});

	it("rejects queued updates with the closed error when the handshake times out", async () => {
		const validate = vi.fn();
		const { Component, container } = setup({ timeout: 20, validate });
		const instance = Component({ amount: 1 });
		const rendering = instance.render(container);
		const queued = instance.updateProps({ amount: 2 });
		const queuedRejected = expect(queued).rejects.toThrow(
			"Cannot update props after the component has closed",
		);
		await expect(rendering).rejects.toThrow();
		await queuedRejected;
		expect(validate).toHaveBeenCalledTimes(1);
	});

	it("applies an update from a rendered listener after the updates queued during render", async () => {
		const { Component, container } = setup();
		const instance = Component({ amount: 1 });
		let fromRendered: Promise<void> | undefined;
		instance.event.once("rendered", () => {
			fromRendered = instance.updateProps({ amount: 3 });
		});
		const rendering = instance.render(container);
		const queued = instance.updateProps({ amount: 2 });
		const { host, notifications } = await startRecordingHost(container);
		await rendering;
		await queued;
		await fromRendered;
		expect(notifications).toEqual([1, 2, 3]);
		expect(host.hostProps.amount).toBe(3);
	});

	it("runs held updates as unrendered updates after a retryable render failure", async () => {
		const { Component, container } = setup();
		const instance = Component({ amount: 1 });
		const earlier = instance.updateProps({ amount: 2 });
		const failed = instance.render("#missing-container");
		const held = instance.updateProps({ amount: 3 });
		let heldSettled = false;
		void held.then(() => {
			heldSettled = true;
		});
		await earlier;
		expect(heldSettled).toBe(false);
		await expect(failed).rejects.toThrow();
		await held;

		const rendering = instance.render(container);
		const { host, notifications } = await startRecordingHost(container);
		await rendering;
		expect((await host.ready).amount).toBe(3);
		expect(notifications).toEqual([3]);
	});

	it("delivers held updates only after host.init() when the host defers INIT", async () => {
		const { Component, container } = setup();
		const instance = Component({ amount: 1 });
		const rendering = instance.render(container);
		const queued = instance.updateProps({ amount: 2 });
		let queuedSettled = false;
		void queued.then(() => {
			queuedSettled = true;
		});
		const { host, notifications } = await startRecordingHost(container, {
			autoInit: false,
		});
		expect((await host.ready).amount).toBe(1);
		await harness?.flushMessages();
		expect(queuedSettled).toBe(false);
		expect(notifications).toEqual([1]);

		host.init();
		await rendering;
		await queued;
		expect(notifications).toEqual([1, 2]);
	});
});
