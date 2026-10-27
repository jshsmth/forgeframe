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
import { create, ForgeFrameError, initHost, isHost, prop } from "@/index";
import { forgeFrameError } from "../forgeframe-error";
import { requireValue } from "../require-value";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

const HOST_URL = "https://host.example.com/widget";
const V2_CALL_SHAPE =
	"initHost(Component, { consumerOrigins }) or initHost({ props, consumerOrigins })";
/** initHost() typed loosely, for calls that break its signature on purpose. */
const callInitHost = initHost as (...args: unknown[]) => unknown;

describe("Explicit host start-up", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		// Restore spies first, so cleanup's own restores are not overwritten.
		vi.restoreAllMocks();
		await harness?.cleanup();
		harness = null;
	});

	/**
	 * Renders a consumer instance into a fresh container and attaches the
	 * harness host window to its iframe, without starting a host.
	 */
	async function renderConsumer(
		activeHarness: IframeIntegrationHarness,
		options: { tag: string; initTimeout?: number },
		props: Record<string, unknown> = { amount: 10 },
	) {
		const Component = create({
			tag: options.tag,
			url: HOST_URL,
			props: { amount: prop.number() },
			initTimeout: options.initTimeout,
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
		expect(activeHarness.withHostGlobals(() => isHost())).toBe(true);

		const host = activeHarness.bootstrapHost(HostSide);
		if (!host) throw new Error("Expected an explicit host");
		await expect(rendering).resolves.toBeUndefined();
		expect((await host.ready).amount).toBe(10);
	});

	it("rejects the removed allowedConsumerDomains option in a host bundle", async () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		const tag = "removed-allowlist-host";
		const { rendering } = await renderConsumer(activeHarness, { tag });
		deleteRegisteredComponent(tag);

		expect(() =>
			activeHarness.withHostGlobals(() =>
				create({
					tag,
					url: HOST_URL,
					// A JavaScript host module can still pass the removed option.
					...({
						allowedConsumerDomains: [activeHarness.consumerOrigin],
					} as object),
				}),
			),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Component option "allowedConsumerDomains" was removed. Pass the allowlist to the host instead: initHost(Component, { consumerOrigins }).',
			),
		);
		expect(await isSettled(activeHarness, rendering)).toBe(false);
	});

	describe("argument checks", () => {
		it.each<{
			label: string;
			call: (component: unknown) => unknown;
			message: string;
			/** Set for shared declaration errors, which name the prop instead. */
			namesCallShape?: false;
		}>([
			{
				label: "a bare call",
				call: () => callInitHost(),
				message: "initHost(Component, { consumerOrigins })",
			},
			{
				label: "a missing consumerOrigins",
				call: (component: unknown) => callInitHost(component, {}),
				message: "initHost() requires consumerOrigins",
			},
			{
				label: "an invalid matcher",
				call: (component: unknown) =>
					callInitHost(component, {
						consumerOrigins: " ",
					}),
				message:
					"initHost() consumerOrigins must be a non-empty origin string, a RegExp, or an array of them. Use initHost(Component, { consumerOrigins })",
			},
			{
				label: "an unknown option",
				call: (component: unknown) =>
					callInitHost(component, {
						consumerOrigins: "*",
						autoStart: true,
					}),
				message: 'initHost() does not accept the "autoStart" option',
			},
			{
				label: "a v1 definitions map",
				call: () =>
					callInitHost({
						amount: prop.number(),
					}),
				message: 'initHost() does not accept the "amount" option',
			},
			{
				label: "the v1 positional allowlist",
				call: () =>
					callInitHost({ amount: prop.number() }, [
						"https://consumer.example.com",
					]),
				message: "initHost() no longer takes a positional allowlist",
			},
			{
				label: "props passed with a component",
				call: (component: unknown) =>
					callInitHost(component, {
						consumerOrigins: "*",
						props: {},
					}),
				message: "initHost(Component, options) does not take props",
			},
			{
				label: "a function that is not a component",
				call: () =>
					callInitHost(() => undefined, {
						consumerOrigins: "*",
					}),
				message: "initHost() expects a component returned by create()",
			},
			{
				label: "a non-boolean autoInit",
				call: (component: unknown) =>
					callInitHost(component, {
						consumerOrigins: "*",
						autoInit: "no",
					}),
				message:
					"initHost() autoInit must be a boolean. Use initHost(Component, { consumerOrigins })",
			},
			{
				label: "the removed deferInit option",
				call: (component: unknown) =>
					callInitHost(component, {
						consumerOrigins: "*",
						deferInit: true,
					}),
				message:
					'initHost() option "deferInit" was replaced. Pass autoInit: false, then call host.init() when the host is ready.',
			},
			{
				label: "a third positional argument",
				call: (component: unknown) =>
					callInitHost(
						component,
						{ consumerOrigins: "*" },
						{ deferInit: true },
					),
				message: "initHost() takes a component and one options object",
			},
			{
				label: "props that are not a definitions object",
				call: () =>
					callInitHost({
						consumerOrigins: "*",
						props: [prop.number()],
					}),
				message:
					"initHost() props must be a prop definitions object. Use initHost(Component, { consumerOrigins })",
			},
			{
				label: "props that define a reserved name",
				call: () =>
					callInitHost({
						consumerOrigins: "*",
						// biome-ignore lint/suspicious/noThenProperty: checks the reserved name
						props: { then: prop.function() },
					}),
				message:
					'Prop "then" is reserved by ForgeFrame and cannot be defined as a custom prop',
				namesCallShape: false,
			},
		])(
			"rejects $label before sending anything",
			async ({ call, message, namesCallShape }) => {
				harness = createIframeIntegrationHarness();
				const activeHarness = harness;
				const { Component } = await renderConsumer(activeHarness, {
					tag: "argument-checks",
				});
				const sent = recordMessagesToConsumer(activeHarness);

				expect(() =>
					activeHarness.withHostGlobals(() => call(Component)),
				).toThrow(forgeFrameError("VALIDATION", message));
				if (namesCallShape !== false) {
					expect(() =>
						activeHarness.withHostGlobals(() => call(Component)),
					).toThrow(forgeFrameError("VALIDATION", V2_CALL_SHAPE));
				}
				await activeHarness.flushMessages();
				expect(sent).toEqual([]);
				// No host was left active, so a valid start still works.
				expect(activeHarness.bootstrapHost(Component)).not.toBeNull();
			},
		);
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
				forgeFrameError(
					"ORIGIN_REJECTED",
					`Consumer origin "${activeHarness.consumerOrigin}" is not allowed`,
				),
			);
			await activeHarness.flushMessages();
			expect(sent).toEqual([]);

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
			).toThrow(forgeFrameError("ORIGIN_REJECTED", "is not allowed"));
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
		it("resolves ready to a live props object without host controls", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component, instance, rendering } = await renderConsumer(
				activeHarness,
				{ tag: "component-form-ready" },
			);

			const host = activeHarness.bootstrapHost(Component);
			if (!host) throw new Error("Expected a host");
			expect(typeof host.close).toBe("function");

			const hostProps = await host.ready;
			await rendering;
			expect(hostProps).toEqual({ amount: 10 });
			await instance.updateProps({ amount: 11 });
			expect(await host.ready).toBe(hostProps);
			expect(hostProps).toEqual({ amount: 11 });
		});

		it("validates the bootstrap with the component's schemas", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const tag = "component-form-validation";
			const { instance, rendering } = await renderConsumer(activeHarness, {
				tag,
				initTimeout: 300,
			});
			const errors: string[] = [];
			instance.event.on("error", (error) => {
				errors.push(error.message);
			});
			vi.spyOn(console, "error").mockImplementation(() => {});
			deleteRegisteredComponent(tag);
			const StrictHostSide = create({
				tag,
				url: HOST_URL,
				props: { amount: prop.number().min(100) },
			});

			const host = activeHarness.bootstrapHost(StrictHostSide);
			await expect(host?.ready).rejects.toThrow(
				forgeFrameError("VALIDATION", "Number must be >= 100"),
			);
			const hostReason =
				"Host initialization failed: Validation failed: amount: Number must be >= 100";
			await expect(rendering).rejects.toThrow(
				forgeFrameError(
					"INIT_TIMEOUT",
					`did not initialize within 300ms. ${hostReason}`,
				),
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
			await expect(failed?.ready).rejects.toThrow(
				forgeFrameError("VALIDATION", "Number must be >= 100"),
			);
			await activeHarness.flushMessages();

			const retried = activeHarness.bootstrapHost(Component);
			if (!retried) throw new Error("Expected the retried host");
			await expect(rendering).resolves.toBeUndefined();
			expect((await retried.ready).amount).toBe(10);
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
				forgeFrameError(
					"VALIDATION",
					'initHost() received component "tag-mismatch-other", but this window was opened for "tag-mismatch-consumer"',
				),
			);
			await activeHarness.flushMessages();
			expect(sent).toEqual([]);

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
			expect(() => activeHarness.bootstrapHost(Component)).toThrow(
				forgeFrameError("VALIDATION", activeError),
			);
			expect(() => activeHarness.bootstrapHost()).toThrow(
				forgeFrameError("VALIDATION", activeError),
			);

			await host.ready;
			await rendering;
			expect(() => activeHarness.bootstrapHost(Component)).toThrow(
				forgeFrameError("VALIDATION", activeError),
			);
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
			for (let read = 0; read < 3; read += 1) void props.amount;
			expect(await isSettled(activeHarness, rendering)).toBe(false);
			expect(sent).not.toContain(MESSAGE_NAME.INIT);

			await host.hide();
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
				initTimeout: 200,
			});

			const host = activeHarness.bootstrapHost(Component, { autoInit: false });
			await requireValue(host).ready;
			await expect(rendering).rejects.toThrow(
				forgeFrameError("INIT_TIMEOUT", "did not initialize within 200ms"),
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
				"close",
				"consumerOrigin",
				"destroy",
				"export",
				"focus",
				"getPeerInstances",
				"hide",
				"init",
				"on",
				"onProps",
				"once",
				"ready",
				"reportError",
				"resize",
				"show",
				"tag",
				"uid",
			]);
			expect(Object.isFrozen(host)).toBe(true);
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
				// @ts-expect-error JavaScript callers can pass any event name.
				host.on("resize", () => {}),
			).toThrow(
				new ForgeFrameError(
					"VALIDATION",
					'Host events support "error", not "resize"',
				),
			);
			for (const method of ["on", "once"] as const) {
				expect(() =>
					// @ts-expect-error JavaScript callers can still pass the removed name.
					host[method]("props", () => {}),
				).toThrow(
					new ForgeFrameError(
						"VALIDATION",
						'The host "props" event was removed in ForgeFrame 2; use host.onProps(handler) instead',
					),
				);
			}

			await host.ready;
			await rendering;
			expect(Object.hasOwn(activeHarness.hostWindow, "hostProps")).toBe(false);
			activeHarness.withHostGlobals(() => host.destroy());
			expect(Object.hasOwn(activeHarness.hostWindow, "hostProps")).toBe(false);
		});

		it("delivers committed props to host.onProps() until unsubscribed", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const { Component, instance, rendering } = await renderConsumer(
				activeHarness,
				{ tag: "host-on-props" },
			);

			const host = activeHarness.bootstrapHost(Component);
			if (!host) throw new Error("Expected a host");
			const received: unknown[] = [];
			const unsubscribe = host.onProps((props) => {
				received.push(props);
			});
			await host.ready;
			await rendering;
			await instance.updateProps({ amount: 11 });
			unsubscribe();
			await instance.updateProps({ amount: 12 });

			expect(received).toEqual([{ amount: 10 }, { amount: 11 }]);
		});

		it("reports a rejected start once on on('error'), without an INIT failure", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const tag = "host-on-error-rejected-start";
			await renderConsumer(activeHarness, { tag });
			const consoleError = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			deleteRegisteredComponent(tag);
			const StrictHostSide = create({
				tag,
				url: HOST_URL,
				props: { amount: prop.number().min(100) },
			});

			const host = activeHarness.bootstrapHost(StrictHostSide);
			if (!host) throw new Error("Expected a host");
			const errors: unknown[] = [];
			host.on("error", (error) => {
				errors.push(error);
			});
			await expect(host.ready).rejects.toThrow(
				forgeFrameError("VALIDATION", "Number must be >= 100"),
			);
			await activeHarness.flushMessages();

			expect(errors).toEqual([
				forgeFrameError("VALIDATION", "Number must be >= 100"),
			]);
			expect(errors[0]).not.toHaveProperty(
				"message",
				expect.stringContaining("Failed to initialize host component"),
			);
			expect(consoleError).not.toHaveBeenCalledWith(
				"Failed to send init message:",
				expect.anything(),
			);
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
			expect(errors[0]).toBeInstanceOf(Error);
			expect(errors[0]).toMatchObject({
				message: "Failed to initialize host component: consumer unavailable",
				cause: expect.objectContaining({ message: "consumer unavailable" }),
			});
		});
	});
});
