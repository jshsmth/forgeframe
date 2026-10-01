/**
 * Integration tests covering host control channels and routing guards.
 *
 * Verifies that host builtins operate through the real messaging pipeline and
 * that spoofed or untrusted message sources are rejected.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_NAME } from "@/constants";
import { create, EVENT, prop } from "@/index";
import type { Dimensions, PropsDefinition } from "@/types";
import {
	createIframeIntegrationHarness,
	dispatchForgeFrameRequest,
	type IframeIntegrationHarness,
	readLastPostedMessageData,
} from "./helpers";

type ControlProps = {
	label: string;
};

const CONTROL_PROP_DEFINITIONS: PropsDefinition<ControlProps> = {
	label: { schema: prop.string(), required: true },
};

describe("Host controls and routing integration", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	it.each([
		["opacity", { opacity: 0.5 }, "0.5", ""],
		["display", { display: "none" }, "", ""],
		["visibility", { visibility: "hidden" }, "", ""],
		["transition", { transition: "opacity 2s" }, "", "opacity 2s"],
	] as const)(
		"applies show requested before iframe creation with configured %s",
		async (property, style, opacity, transition) => {
			harness = createIframeIntegrationHarness();
			const container = document.createElement("div");
			document.body.append(container);
			const instance = create({
				tag: `integration-prerender-show-${property}`,
				url: "https://host.example.com/widget",
				attributes: { loading: "lazy" },
				style,
			})();
			instance.event.on(EVENT.PRERENDER, () => instance.show());
			const rendering = instance.render(container);
			const { iframe } = await harness.bootstrapIframeHost(container);
			await rendering;
			expect(iframe.style.display).toBe("");
			expect(iframe.style.visibility).toBe("visible");
			expect(iframe.style.opacity).toBe(opacity);
			expect(iframe.style.transition).toBe(transition);
		},
	);

	it.each([
		[["show", "hide"], "none", "hidden"],
		[["hide", "show"], "", "visible"],
		[["show", "hide", "show"], "", "visible"],
	] as const)(
		"preserves the last visibility request before iframe creation: %s",
		async (controls, display, visibility) => {
			harness = createIframeIntegrationHarness();
			const container = document.createElement("div");
			document.body.append(container);
			const instance = create({
				tag: `integration-prerender-controls-${controls.join("-")}`,
				url: "https://host.example.com/widget",
				style: {
					display: "none",
					visibility: "hidden",
					opacity: 0.5,
					transition: "opacity 2s",
				},
			})();
			instance.event.on(EVENT.PRERENDER, () => {
				for (const control of controls) void instance[control]();
			});
			const rendering = instance.render(container);
			const { iframe } = await harness.bootstrapIframeHost(container);
			await rendering;
			expect(iframe.style.display).toBe(display);
			expect(iframe.style.visibility).toBe(visibility);
			expect(iframe.style.opacity).toBe("0.5");
			expect(iframe.style.transition).toBe("opacity 2s");
		},
	);

	it("preserves an acknowledged host hide while initial rendering completes", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const Component = create({
			tag: "integration-hide-during-initialization",
			url: "https://host.example.com/widget",
		});
		const instance = Component();
		const rendered = vi.fn();
		instance.event.on(EVENT.RENDERED, rendered);
		const rendering = instance.render(container);
		const { host, iframe } = await harness.bootstrapIframeHost(container);
		await host.ready;
		await host.hostProps.hide();
		expect(iframe.style.display).toBe("none");
		await rendering;
		expect(rendered).toHaveBeenCalledOnce();
		expect(iframe.style.display).toBe("none");
		expect(iframe.style.visibility).toBe("hidden");
		await host.hostProps.show();
		expect(iframe.style.display).toBe("");
		expect(iframe.style.visibility).toBe("visible");
	});

	it("rejects oversized exports without replacing acknowledged exports", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = { label: prop.string() };
		const Component = create({
			tag: "integration-export-capacity",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ label: "exporter" });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		const methods = Object.fromEntries(
			Array.from({ length: 500 }, (_, index) => [`m${index}`, () => index]),
		);
		await harness.withHostGlobalsAsync(() => hostProps.export(methods));
		const first = instance.exports as Record<string, () => Promise<number>>;
		await expect(first.m0?.()).resolves.toBe(0);
		const oversized = Object.fromEntries(
			Array.from({ length: 501 }, (_, index) => [
				`m${index}`,
				() => index + 1000,
			]),
		);
		await expect(
			harness.withHostGlobalsAsync(() => hostProps.export(oversized)),
		).rejects.toThrow("500 distinct callback limit");
		expect(instance.exports).toBe(first);
		await expect(first.m0?.()).resolves.toBe(0);
		await expect(first.m499?.()).resolves.toBe(499);
		await harness.withHostGlobalsAsync(() =>
			hostProps.export({ next: () => 42 }),
		);
		const next = instance.exports as { next: () => Promise<number> };
		await expect(next.next()).resolves.toBe(42);
		await expect(first.m0?.()).rejects.toThrow("not found");
	});

	it("captures exported array entries once and rejects missing entries before replacing exports", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const Component = create<
			Record<string, unknown>,
			{ values: string[]; run: () => number }
		>({
			tag: "integration-export-array-accessors",
			url: "https://host.example.com/widget",
		});
		const instance = Component();
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(container);
		await rendering;
		let reads = 0;
		const values: string[] = [];
		Object.defineProperty(values, "0", {
			enumerable: true,
			get: () => (++reads === 1 ? "captured" : undefined),
		});
		await hostProps.export({ values, run: () => 42 });
		const previous = instance.exports;
		if (!previous) throw new Error("Missing captured exports");
		expect(reads).toBe(1);
		expect(previous.values).toEqual(["captured"]);
		const missing: unknown[] = [];
		Object.defineProperty(missing, "0", { get: () => undefined });
		await expect(
			hostProps.export({ values: missing, run: () => 100 }),
		).rejects.toThrow("undefined array entry");
		expect(instance.exports).toBe(previous);
		await expect(previous.run()).resolves.toBe(42);
		await hostProps.export({ values: ["recovered"], run: () => 7 });
		expect(instance.exports?.values).toEqual(["recovered"]);
		await expect(instance.exports?.run()).resolves.toBe(7);
		await expect(previous.run()).rejects.toThrow("not found");
	});

	it("rolls back peer registrations when final response encoding fails", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const Component = create({
			tag: "integration-peer-message-encoding",
			url: "https://host.example.com/widget",
		});
		const requester = Component();
		const sibling = Component();
		const initial = () => 42;
		sibling.exports = { initial };
		const rendering = requester.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(container);
		await rendering;
		const peers = await hostProps.getPeerInstances();
		const held = peers[0]?.exports as { initial: () => Promise<number> };
		const failedMethods = Object.fromEntries(
			Array.from({ length: 499 }, (_, index) => [`m${index}`, () => index]),
		);
		sibling.exports = { initial, ...failedMethods, metadata: 1n };
		await expect(hostProps.getPeerInstances()).rejects.toThrow(/serializ/i);
		await expect(held.initial()).resolves.toBe(42);
		sibling.exports = { initial, fresh: () => 7 };
		const recovered = await hostProps.getPeerInstances();
		const methods = recovered[0]?.exports as {
			initial: () => Promise<number>;
			fresh: () => Promise<number>;
		};
		await expect(methods.initial()).resolves.toBe(42);
		await expect(methods.fresh()).resolves.toBe(7);
		await expect(held.initial()).resolves.toBe(42);
	});

	it("recovers export callback capacity after final message encoding fails", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const Component = create<
			Record<string, unknown>,
			Record<string, () => number>
		>({
			tag: "integration-export-message-encoding",
			url: "https://host.example.com/widget",
		});
		const instance = Component();
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(container);
		await rendering;
		const methods = Object.fromEntries(
			Array.from({ length: 500 }, (_, index) => [`m${index}`, () => index]),
		);
		await hostProps.export(methods);
		const previous = instance.exports;
		if (!previous) throw new Error("Missing initial exports");
		const replacement = Object.fromEntries(
			Array.from({ length: 500 }, (_, index) => [
				`m${index}`,
				() => index + 500,
			]),
		);

		await expect(
			hostProps.export({ ...replacement, metadata: 1n }),
		).rejects.toThrow(/BigInt/);
		expect(instance.exports).toBe(previous);
		await expect(previous.m0?.()).resolves.toBe(0);
		await expect(previous.m499?.()).resolves.toBe(499);
		await hostProps.export({ fresh: () => 1001 });
		const current = instance.exports;
		if (!current) throw new Error("Missing replacement exports");
		await expect(current.fresh?.()).resolves.toBe(1001);
		await expect(previous.m0?.()).rejects.toThrow("not found");
	});

	it("preserves held peer methods when discovery exceeds cumulative relay capacity", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = { label: prop.string() };
		const Component = create({
			tag: "integration-peer-capacity",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const requester = Component({ label: "requester" });
		const sibling = Component({ label: "sibling" });
		const initial = () => 42;
		sibling.exports = { initial };
		const rendering = requester.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		const peers = await harness.withHostGlobalsAsync(() =>
			hostProps.getPeerInstances(),
		);
		const held = peers[0]?.exports as { initial: () => Promise<number> };
		await expect(held.initial()).resolves.toBe(42);
		sibling.exports = {
			initial,
			...Object.fromEntries(
				Array.from({ length: 500 }, (_, index) => [`m${index}`, () => index]),
			),
		};
		await expect(
			harness.withHostGlobalsAsync(() => hostProps.getPeerInstances()),
		).rejects.toThrow("500 distinct callback limit");
		await expect(held.initial()).resolves.toBe(42);
		sibling.exports = { initial, next: () => 7 };
		const recovered = await harness.withHostGlobalsAsync(() =>
			hostProps.getPeerInstances(),
		);
		const methods = recovered[0]?.exports as {
			initial: () => Promise<number>;
			next: () => Promise<number>;
		};
		await expect(methods.initial()).resolves.toBe(42);
		await expect(methods.next()).resolves.toBe(7);
	});

	it("should deliver host builtins through the real iframe messaging pipeline", async () => {
		harness = createIframeIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const onClose = vi.fn();
		const onFocus = vi.fn();
		const onResize = vi.fn();
		const onError = vi.fn();
		const errorEvent = vi.fn();

		const ControlsComponent = create<ControlProps>({
			tag: "integration-host-controls-component",
			url: "https://host.example.com/widget",
			props: CONTROL_PROP_DEFINITIONS,
		});

		const initialProps = {
			label: "Primary",
			onClose,
			onFocus,
			onResize,
			onError,
		};
		const instance = ControlsComponent(initialProps);
		instance.event.on(EVENT.ERROR, errorEvent);

		const sibling = ControlsComponent({ label: "Sibling" });
		sibling.exports = { peer: "sibling" };

		const renderPromise = instance.render(container);
		const { hostProps, iframe } = await harness.bootstrapIframeHost(
			container,
			CONTROL_PROP_DEFINITIONS,
		);

		await expect(renderPromise).resolves.toBeUndefined();

		const resizeDimensions: Dimensions = { width: 320, height: 240 };
		await harness.withHostGlobalsAsync(() =>
			hostProps.resize(resizeDimensions),
		);
		expect(iframe.style.width).toBe("320px");
		expect(iframe.style.height).toBe("240px");
		expect(onResize).toHaveBeenCalledWith(resizeDimensions);

		await harness.withHostGlobalsAsync(() => hostProps.hide());
		expect(iframe.style.display).toBe("none");
		expect(iframe.style.visibility).toBe("hidden");

		await harness.withHostGlobalsAsync(() => hostProps.show());
		expect(iframe.style.display).toBe("");
		expect(iframe.style.visibility).toBe("visible");

		await harness.withHostGlobalsAsync(() => hostProps.focus());
		expect(onFocus).toHaveBeenCalledTimes(1);

		await harness.withHostGlobalsAsync(() =>
			hostProps.onError(new Error("host-side integration error")),
		);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "host-side integration error" }),
		);
		expect(errorEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "host-side integration error",
			}),
		);

		await harness.withHostGlobalsAsync(() =>
			hostProps.export({
				ready: true,
				ping: (value: string) => `pong:${value}`,
			}),
		);
		const exported = instance.exports as {
			ready: boolean;
			ping: (value: string) => Promise<string>;
		};
		expect(exported.ready).toBe(true);
		await expect(exported.ping("live")).resolves.toBe("pong:live");

		await harness.withHostGlobalsAsync(() =>
			hostProps.consumer.export({ ping: true }),
		);
		expect(
			(instance as unknown as { consumerExports?: unknown }).consumerExports,
		).toEqual({ ping: true });

		await expect(
			harness.withHostGlobalsAsync(() => hostProps.getPeerInstances()),
		).resolves.toEqual([
			{
				uid: sibling.uid,
				tag: "integration-host-controls-component",
				exports: { peer: "sibling" },
			},
		]);

		await harness.withHostGlobalsAsync(() => hostProps.close());

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(container.querySelector("iframe")).toBeNull();
	});

	it("should reject untrusted and spoofed windows on both consumer and host runtimes", async () => {
		harness = createIframeIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const ControlsComponent = create<ControlProps>({
			tag: "integration-routing-guards-component",
			url: "https://host.example.com/widget",
			props: CONTROL_PROP_DEFINITIONS,
		});

		const instance = ControlsComponent({ label: "Original" });

		const renderPromise = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			CONTROL_PROP_DEFINITIONS,
		);

		await expect(renderPromise).resolves.toBeUndefined();

		const evilHostWindow = { postMessage: vi.fn() } as unknown as Window;
		dispatchForgeFrameRequest({
			targetWindow: harness.consumerWindow,
			sourceWindow: evilHostWindow,
			origin: "https://evil.example.com",
			name: MESSAGE_NAME.EXPORT,
			data: { ready: "evil" },
			claimedUid: hostProps.uid,
			claimedDomain: harness.hostOrigin,
		});
		await harness.flushMessages();

		expect(instance.exports).toBeUndefined();
		expect(
			(evilHostWindow as unknown as { postMessage: ReturnType<typeof vi.fn> })
				.postMessage,
		).not.toHaveBeenCalled();

		const spoofedTrustedHostWindow = {
			postMessage: vi.fn(),
		} as unknown as Window;
		dispatchForgeFrameRequest({
			targetWindow: harness.consumerWindow,
			sourceWindow: spoofedTrustedHostWindow,
			origin: harness.hostOrigin,
			name: MESSAGE_NAME.EXPORT,
			data: { ready: "spoofed-host" },
			claimedUid: hostProps.uid,
			claimedDomain: harness.hostOrigin,
		});
		await harness.flushMessages();

		expect(instance.exports).toBeUndefined();
		expect(readLastPostedMessageData(spoofedTrustedHostWindow)).toEqual({
			success: false,
		});

		const serializedProps = { label: "Spoofed" };

		const evilConsumerWindow = { postMessage: vi.fn() } as unknown as Window;
		dispatchForgeFrameRequest({
			targetWindow: harness.hostWindow,
			sourceWindow: evilConsumerWindow,
			origin: "https://evil.example.com",
			name: MESSAGE_NAME.PROPS,
			data: serializedProps,
			claimedUid: hostProps.uid,
			claimedDomain: harness.consumerOrigin,
		});
		await harness.flushMessages();

		expect(hostProps.label).toBe("Original");
		expect(
			(
				evilConsumerWindow as unknown as {
					postMessage: ReturnType<typeof vi.fn>;
				}
			).postMessage,
		).not.toHaveBeenCalled();

		const spoofedTrustedConsumerWindow = {
			postMessage: vi.fn(),
		} as unknown as Window;
		dispatchForgeFrameRequest({
			targetWindow: harness.hostWindow,
			sourceWindow: spoofedTrustedConsumerWindow,
			origin: harness.consumerOrigin,
			name: MESSAGE_NAME.PROPS,
			data: serializedProps,
			claimedUid: hostProps.uid,
			claimedDomain: harness.consumerOrigin,
		});
		await harness.flushMessages();

		expect(hostProps.label).toBe("Original");
		expect(readLastPostedMessageData(spoofedTrustedConsumerWindow)).toEqual({
			success: false,
		});
	});
});
