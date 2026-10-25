/**
 * Integration tests for explicit host start-up.
 *
 * Exercises public `initHost()` against a real consumer render: argument
 * checks, the consumer allowlist, the component and tag-agnostic forms, the
 * single-start rule, `autoInit: false`, and the narrow `Host` object.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { deserializeMessage } from "@/communication/protocol";
import { MESSAGE_NAME } from "@/constants";
import { deleteRegisteredComponent } from "@/core/component-registry";
import { getHost } from "@/core/host/bootstrap";
import { HOST_PROPS_BUILTIN_KEYS } from "@/core/host/builtin-keys";
import { create, EVENT, initHost, isHost, prop } from "@/index";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

const HOST_URL = "https://host.example.com/widget";

describe("Explicit host start-up", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	/**
	 * Renders a consumer instance into a fresh container and attaches the
	 * harness host window to its iframe, without starting a host.
	 */
	async function renderConsumer(
		activeHarness: IframeIntegrationHarness,
		options: { tag: string; timeout?: number },
		props: Record<string, unknown> = { amount: 10 },
	) {
		const Component = create({
			tag: options.tag,
			url: HOST_URL,
			props: { amount: prop.number() },
			timeout: options.timeout,
		});
		const container = document.createElement("div");
		document.body.append(container);
		const instance = Component(props as { amount: number });
		const rendering = instance.render(container);
		// Cleanup may cancel this render if an assertion fails first.
		void rendering.catch(() => {});
		const iframe = await activeHarness.waitForIframe(container);
		activeHarness.attachHostToIframe(iframe);
		return { Component, instance, rendering, iframe };
	}

	/** Records the names of messages the host sends to the consumer window. */
	function recordMessagesToConsumer(
		activeHarness: IframeIntegrationHarness,
	): string[] {
		const names: string[] = [];
		const forward = activeHarness.consumerWindow.postMessage.bind(
			activeHarness.consumerWindow,
		);
		vi.spyOn(activeHarness.consumerWindow, "postMessage").mockImplementation(
			(data, origin) => {
				const name = deserializeMessage(data)?.name;
				if (name) names.push(name);
				forward(data, origin as string);
			},
		);
		return names;
	}

	/** Reports whether a promise has settled after pending messages flush. */
	async function isSettled(
		activeHarness: IframeIntegrationHarness,
		promise: Promise<unknown>,
	): Promise<boolean> {
		let settled = false;
		void promise.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			},
		);
		await activeHarness.flushMessages();
		return settled;
	}

	it("never starts a host when create() runs in a matching host window", async () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		const tag = "create-starts-nothing";
		const { rendering } = await renderConsumer(activeHarness, { tag });
		const sent = recordMessagesToConsumer(activeHarness);
		// Model a separate host bundle that defines the same tag.
		deleteRegisteredComponent(tag);

		const HostSide = activeHarness.withHostGlobals(() =>
			create({ tag, url: HOST_URL, props: { amount: prop.number() } }),
		);
		expect(await isSettled(activeHarness, rendering)).toBe(false);
		expect(sent).not.toContain(MESSAGE_NAME.BOOTSTRAP);
		expect(getHost()).toBeNull();
		expect(activeHarness.withHostGlobals(() => isHost())).toBe(true);

		const host = activeHarness.bootstrapHost(HostSide);
		if (!host) throw new Error("Expected an explicit host");
		await expect(host.ready).resolves.toBe(host.hostProps);
		await expect(rendering).resolves.toBeUndefined();
		expect(host.hostProps.amount).toBe(10);
	});

	describe("argument checks", () => {
		it.each([
			{
				label: "a bare call",
				call: () => (initHost as (...args: unknown[]) => unknown)(),
				message: "initHost(Component, { consumerOrigins })",
			},
			{
				label: "a missing consumerOrigins",
				call: (component: unknown) =>
					(initHost as (...args: unknown[]) => unknown)(component, {}),
				message: "initHost() requires consumerOrigins",
			},
			{
				label: "an invalid matcher",
				call: (component: unknown) =>
					(initHost as (...args: unknown[]) => unknown)(component, {
						consumerOrigins: " ",
					}),
				message: "initHost() consumerOrigins must be a non-empty origin string",
			},
			{
				label: "an unknown option",
				call: (component: unknown) =>
					(initHost as (...args: unknown[]) => unknown)(component, {
						consumerOrigins: "*",
						deferInit: true,
					}),
				message: 'initHost() does not accept the "deferInit" option',
			},
			{
				label: "a v1 definitions map",
				call: () =>
					(initHost as (...args: unknown[]) => unknown)({
						amount: prop.number(),
					}),
				message: 'initHost() does not accept the "amount" option',
			},
			{
				label: "the v1 positional allowlist",
				call: () =>
					(initHost as (...args: unknown[]) => unknown)(
						{ amount: prop.number() },
						["https://consumer.example.com"],
					),
				message: "initHost() no longer takes a positional allowlist",
			},
			{
				label: "props passed with a component",
				call: (component: unknown) =>
					(initHost as (...args: unknown[]) => unknown)(component, {
						consumerOrigins: "*",
						props: {},
					}),
				message: "initHost(Component, options) does not take props",
			},
			{
				label: "a function that is not a component",
				call: () =>
					(initHost as (...args: unknown[]) => unknown)(() => undefined, {
						consumerOrigins: "*",
					}),
				message: "initHost() expects a component returned by create()",
			},
			{
				label: "a non-boolean autoInit",
				call: (component: unknown) =>
					(initHost as (...args: unknown[]) => unknown)(component, {
						consumerOrigins: "*",
						autoInit: "no",
					}),
				message: "initHost() autoInit must be a boolean",
			},
			{
				label: "a third positional argument",
				call: (component: unknown) =>
					(initHost as (...args: unknown[]) => unknown)(
						component,
						{ consumerOrigins: "*" },
						{ deferInit: true },
					),
				message: "initHost() takes a component and one options object",
			},
			{
				label: "props that are not a definitions object",
				call: () =>
					(initHost as (...args: unknown[]) => unknown)({
						consumerOrigins: "*",
						props: [prop.number()],
					}),
				message: "initHost() props must be a prop definitions object",
			},
		])("rejects $label before sending anything", async ({ call, message }) => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component } = await renderConsumer(activeHarness, {
				tag: "argument-checks",
			});
			const sent = recordMessagesToConsumer(activeHarness);

			expect(() =>
				activeHarness.withHostGlobals(() => call(Component)),
			).toThrow(message);
			await activeHarness.flushMessages();
			expect(sent).toEqual([]);
			expect(getHost()).toBeNull();
		});
	});

	describe("consumer allowlist", () => {
		it("throws for a disallowed consumer origin without sending BOOTSTRAP, then accepts a corrected retry", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component, rendering } = await renderConsumer(activeHarness, {
				tag: "allowlist-rejection",
			});
			const sent = recordMessagesToConsumer(activeHarness);

			expect(() =>
				activeHarness.bootstrapHost(Component, {
					consumerOrigins: ["https://other-consumer.example.com"],
				}),
			).toThrow(
				`Consumer domain "${activeHarness.consumerOrigin}" is not allowed`,
			);
			await activeHarness.flushMessages();
			expect(sent).toEqual([]);
			expect(getHost()).toBeNull();

			const host = activeHarness.bootstrapHost(Component);
			await host?.ready;
			await expect(rendering).resolves.toBeUndefined();
		});

		it("admits no consumer with an empty array", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component } = await renderConsumer(activeHarness, {
				tag: "allowlist-empty",
			});
			const sent = recordMessagesToConsumer(activeHarness);

			expect(() =>
				activeHarness.bootstrapHost(Component, { consumerOrigins: [] }),
			).toThrow("is not allowed");
			await activeHarness.flushMessages();
			expect(sent).toEqual([]);
		});

		it("admits any consumer with '*'", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component, rendering } = await renderConsumer(activeHarness, {
				tag: "allowlist-any",
			});

			const host = activeHarness.bootstrapHost(Component, {
				consumerOrigins: "*",
			});
			await expect(host?.ready).resolves.toMatchObject({ amount: 10 });
			await expect(rendering).resolves.toBeUndefined();
		});
	});

	describe("component form", () => {
		it("holds only built-ins until ready resolves to the same live object", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component, instance, rendering } = await renderConsumer(
				activeHarness,
				{ tag: "component-form-ready" },
			);

			const host = activeHarness.bootstrapHost(Component);
			if (!host) throw new Error("Expected a host");
			const { hostProps } = host;
			expect(Object.keys(hostProps).sort()).toEqual(
				[...HOST_PROPS_BUILTIN_KEYS].sort(),
			);
			expect(hostProps.amount).toBeUndefined();

			await expect(host.ready).resolves.toBe(hostProps);
			await rendering;
			expect(hostProps.amount).toBe(10);
			await instance.updateProps({ amount: 11 });
			expect(host.hostProps).toBe(hostProps);
			expect(hostProps.amount).toBe(11);
		});

		it("validates the bootstrap with the component's schemas", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const tag = "component-form-validation";
			const { instance, rendering } = await renderConsumer(activeHarness, {
				tag,
				timeout: 300,
			});
			const errors: string[] = [];
			instance.event.on(EVENT.ERROR, (error) => {
				errors.push((error as Error).message);
			});
			vi.spyOn(console, "error").mockImplementation(() => {});
			deleteRegisteredComponent(tag);
			const StrictHostSide = create({
				tag,
				url: HOST_URL,
				props: { amount: prop.number().min(100) },
			});

			const host = activeHarness.bootstrapHost(StrictHostSide);
			await expect(host?.ready).rejects.toThrow("Number must be >= 100");
			expect(getHost()).toBeNull();
			const hostReason =
				"Host initialization failed: Validation failed: amount: Number must be >= 100";
			await expect(rendering).rejects.toThrow(
				`did not initialize within 300ms. ${hostReason}`,
			);
			expect(errors).toEqual([expect.stringContaining(hostReason)]);
		});

		it("retries on the same page after a failed start", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const tag = "component-form-retry";
			const { Component, rendering } = await renderConsumer(activeHarness, {
				tag,
			});
			vi.spyOn(console, "error").mockImplementation(() => {});
			deleteRegisteredComponent(tag);
			const StrictHostSide = create({
				tag,
				url: HOST_URL,
				props: { amount: prop.number().min(100) },
			});

			const failed = activeHarness.bootstrapHost(StrictHostSide);
			await expect(failed?.ready).rejects.toThrow("Number must be >= 100");
			await activeHarness.flushMessages();

			const retried = activeHarness.bootstrapHost(Component);
			if (!retried) throw new Error("Expected the retried host");
			await expect(retried.ready).resolves.toBe(retried.hostProps);
			await expect(rendering).resolves.toBeUndefined();
			expect(retried.hostProps.amount).toBe(10);
		});

		it("throws for a window opened for another tag, then accepts the right component", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component, rendering } = await renderConsumer(activeHarness, {
				tag: "tag-mismatch-consumer",
			});
			const Other = create({ tag: "tag-mismatch-other", url: HOST_URL });
			const sent = recordMessagesToConsumer(activeHarness);

			expect(() => activeHarness.bootstrapHost(Other)).toThrow(
				'initHost() received component "tag-mismatch-other", but this window was opened for "tag-mismatch-consumer"',
			);
			await activeHarness.flushMessages();
			expect(sent).toEqual([]);
			expect(getHost()).toBeNull();

			const host = activeHarness.bootstrapHost(Component);
			await host?.ready;
			await expect(rendering).resolves.toBeUndefined();
		});
	});

	describe("single start", () => {
		it("throws for a second initHost() while the first is bootstrapping and once it is ready", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component, rendering } = await renderConsumer(activeHarness, {
				tag: "single-start",
			});

			const host = activeHarness.bootstrapHost(Component);
			if (!host) throw new Error("Expected a host");
			const activeError =
				"A ForgeFrame host is already active in this window; call destroy() first";
			expect(() => activeHarness.bootstrapHost(Component)).toThrow(activeError);
			expect(() => activeHarness.bootstrapHost()).toThrow(activeError);

			await host.ready;
			await rendering;
			expect(() => activeHarness.bootstrapHost(Component)).toThrow(activeError);
			expect(activeHarness.getHostProps()).toBe(host.hostProps);
		});
	});

	describe("autoInit: false", () => {
		it("holds INIT until init(), and lets an acknowledged hide() land first", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component, rendering, iframe } = await renderConsumer(
				activeHarness,
				{ tag: "auto-init-false" },
			);
			const sent = recordMessagesToConsumer(activeHarness);

			const host = activeHarness.bootstrapHost(Component, { autoInit: false });
			if (!host) throw new Error("Expected a deferred host");
			const props = await host.ready;
			for (let read = 0; read < 3; read += 1) void host.hostProps.amount;
			expect(await isSettled(activeHarness, rendering)).toBe(false);
			expect(sent).not.toContain(MESSAGE_NAME.INIT);

			await props.hide();
			expect(iframe.style.display).toBe("none");

			host.init();
			await expect(rendering).resolves.toBeUndefined();
			expect(iframe.style.display).toBe("none");
			host.init();
			await activeHarness.flushMessages();
			expect(sent.filter((name) => name === MESSAGE_NAME.INIT)).toHaveLength(1);
		});

		it("sends INIT once ready resolves when init() is called first", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component, rendering } = await renderConsumer(activeHarness, {
				tag: "auto-init-early",
			});
			const sent = recordMessagesToConsumer(activeHarness);

			const host = activeHarness.bootstrapHost(Component, { autoInit: false });
			if (!host) throw new Error("Expected a deferred host");
			host.init();
			expect(sent).not.toContain(MESSAGE_NAME.INIT);
			await host.ready;
			await expect(rendering).resolves.toBeUndefined();
			expect(sent.filter((name) => name === MESSAGE_NAME.INIT)).toHaveLength(1);
		});

		it("sends nothing from init() after destroy()", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component } = await renderConsumer(activeHarness, {
				tag: "auto-init-destroyed",
			});
			const sent = recordMessagesToConsumer(activeHarness);

			const host = activeHarness.bootstrapHost(Component, { autoInit: false });
			if (!host) throw new Error("Expected a deferred host");
			await host.ready;
			activeHarness.withHostGlobals(() => host.destroy());
			host.init();
			await activeHarness.flushMessages();
			expect(sent).not.toContain(MESSAGE_NAME.INIT);
		});

		it("lets render() time out when the host never calls init()", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component, rendering } = await renderConsumer(activeHarness, {
				tag: "auto-init-never",
				timeout: 200,
			});

			const host = activeHarness.bootstrapHost(Component, { autoInit: false });
			await host?.ready;
			await expect(rendering).rejects.toThrow(
				"did not initialize within 200ms",
			);
		});
	});

	describe("Host object", () => {
		it("exposes only the documented members and defines no window global", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component, rendering } = await renderConsumer(activeHarness, {
				tag: "narrow-host",
			});

			const host = activeHarness.bootstrapHost(Component);
			if (!host) throw new Error("Expected a host");
			expect(Object.hasOwn(activeHarness.hostWindow, "hostProps")).toBe(false);
			expect(Object.keys(host).sort()).toEqual([
				"destroy",
				"hostProps",
				"init",
				"on",
				"ready",
			]);
			for (const internal of [
				"flushInit",
				"getProps",
				"applyHostConfiguration",
				"getInitError",
				"event",
			]) {
				expect(internal in host).toBe(false);
			}
			expect(() =>
				(host.on as (event: string, handler: () => void) => unknown)(
					"resize",
					() => {},
				),
			).toThrow('Host.on() supports the "props" and "error" events');

			await host.ready;
			await rendering;
			expect(Object.hasOwn(activeHarness.hostWindow, "hostProps")).toBe(false);
			activeHarness.withHostGlobals(() => host.destroy());
			expect(Object.hasOwn(activeHarness.hostWindow, "hostProps")).toBe(false);
		});

		it("delivers committed props to on('props') until unsubscribed", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component, instance, rendering } = await renderConsumer(
				activeHarness,
				{ tag: "host-on-props" },
			);

			const host = activeHarness.bootstrapHost(Component);
			if (!host) throw new Error("Expected a host");
			const received: unknown[] = [];
			const unsubscribe = host.on("props", (props) => {
				received.push(props);
			});
			await host.ready;
			await rendering;
			await instance.updateProps({ amount: 11 });
			unsubscribe();
			await instance.updateProps({ amount: 12 });

			expect(received).toEqual([{ amount: 10 }, { amount: 11 }]);
		});

		it("reports an INIT delivery failure on on('error')", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component } = await renderConsumer(activeHarness, {
				tag: "host-on-error",
			});
			vi.spyOn(console, "error").mockImplementation(() => {});

			const host = activeHarness.bootstrapHost(Component, { autoInit: false });
			if (!host) throw new Error("Expected a deferred host");
			const errors: unknown[] = [];
			host.on("error", (error) => {
				errors.push(error);
			});
			await host.ready;
			const forward = activeHarness.consumerWindow.postMessage.bind(
				activeHarness.consumerWindow,
			);
			vi.spyOn(activeHarness.consumerWindow, "postMessage").mockImplementation(
				(data, origin) => {
					if (deserializeMessage(data)?.name === MESSAGE_NAME.INIT)
						throw new Error("consumer unavailable");
					forward(data, origin as string);
				},
			);

			host.init();
			await vi.waitFor(() => expect(errors).toHaveLength(1));
			expect(errors[0]).toMatchObject({
				type: "init_failed",
				message: "Failed to initialize host component: consumer unavailable",
			});
		});
	});
});
