/**
 * Integration tests covering popup bootstrap behavior.
 *
 * Exercises popup rendering, `window.open()` bootstrap, and host initialization
 * through the real popup messaging pipeline.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { create, ForgeFrameError, prop } from "@/index";
import type { PropsDefinition } from "@/types";
import {
	createPopupIntegrationHarness,
	type PopupIntegrationHarness,
} from "./helpers";

type PopupProps = {
	amount: number;
	message: string;
};

const POPUP_PROP_DEFINITIONS: PropsDefinition<PopupProps> = {
	amount: { schema: prop.number() },
	message: { schema: prop.string() },
};

describe("Popup host handshake integration", () => {
	let harness: PopupIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	it("should resolve render() after initHost() completes the popup handshake", async () => {
		harness = createPopupIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const PopupComponent = create({
			tag: "integration-popup-handshake-component",
			url: "https://host.example.com/widget",
			props: POPUP_PROP_DEFINITIONS,
		});

		const instance = PopupComponent({
			amount: 9,
			message: "Popup ready",
		});

		const renderPromise = instance.render(container, "popup");
		const popupOpen = await harness.waitForPopupOpen();
		const { hostProps } = await harness.bootstrapPopupHost(
			POPUP_PROP_DEFINITIONS,
		);

		await expect(renderPromise).resolves.toBeUndefined();

		expect(popupOpen.url).toBe("https://host.example.com/widget");
		expect(typeof popupOpen.name).toBe("string");
		expect(hostProps.amount).toBe(9);
		expect(hostProps.message).toBe("Popup ready");
		expect(hostProps.consumer.props).toEqual({
			amount: 9,
			message: "Popup ready",
		});
		expect(hostProps.getConsumer()).toBe(harness.consumerWindow);
		expect(hostProps.consumerOrigin).toBe(harness.consumerOrigin);
		expect(container.childElementCount).toBe(0);
		expect(container.isConnected).toBe(true);

		await harness.withHostGlobalsAsync(() => hostProps.export({ ready: true }));

		expect(instance.exports).toEqual({ ready: true });
	});

	it("delivers an update queued during a popup render after the bootstrap snapshot", async () => {
		harness = createPopupIntegrationHarness();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const PopupComponent = create({
			tag: "integration-popup-held-update",
			url: "https://host.example.com/widget",
			props: POPUP_PROP_DEFINITIONS,
			context: "popup",
		});
		const instance = PopupComponent({ amount: 1, message: "first" });
		const rendering = instance.render(container);
		const held = instance.updateProps({ amount: 2 });
		const { host, hostProps } = await harness.bootstrapPopupHost(
			POPUP_PROP_DEFINITIONS,
		);
		expect((await host.ready).amount).toBe(1);
		const notified = vi.fn();
		hostProps.onProps(notified);
		await Promise.all([rendering, held]);
		expect(hostProps.amount).toBe(2);
		expect(notified).toHaveBeenLastCalledWith(
			expect.objectContaining({ amount: 2, message: "first" }),
		);
	});

	it("resizes a cross-origin popup from the host and throws for consumer-initiated resizing", async () => {
		harness = createPopupIntegrationHarness();
		const activeHarness = harness;
		const container = document.createElement("div");
		document.body.appendChild(container);
		const PopupComponent = create({
			tag: "integration-popup-resize-component",
			url: "https://host.example.com/widget",
			props: POPUP_PROP_DEFINITIONS,
		});
		const instance = PopupComponent({ amount: 1, message: "resize" });
		const renderPromise = instance.render(container, "popup");
		const { hostProps } = await activeHarness.bootstrapPopupHost(
			POPUP_PROP_DEFINITIONS,
		);
		await renderPromise;

		// Only the popup's own document may resize it; other origins get a SecurityError.
		const hostResizes: Array<[number, number]> = [];
		let deniedAccesses = 0;
		const fromHost = () => globalThis.window === activeHarness.hostWindow;
		const denyOtherOrigins = <T>(read: () => T) => {
			if (!fromHost()) {
				deniedAccesses++;
				throw new DOMException("Blocked cross-origin access", "SecurityError");
			}
			return read();
		};
		Object.defineProperties(activeHarness.hostWindow, {
			outerWidth: {
				configurable: true,
				get: () => denyOtherOrigins(() => 500),
			},
			outerHeight: {
				configurable: true,
				get: () => denyOtherOrigins(() => 500),
			},
			resizeTo: {
				configurable: true,
				value: (width: number, height: number) =>
					denyOtherOrigins(() => hostResizes.push([width, height])),
			},
		});
		const resized = vi.fn();
		instance.event.on("resize", resized);

		// The refusal is synchronous, at the line that asked for it.
		expect(() => instance.resize({ width: 600, height: 400 })).toThrow(
			expect.objectContaining({
				name: "ForgeFrameError",
				code: "VALIDATION",
				message: expect.stringContaining(
					'Cannot resize the popup for component "integration-popup-resize-component"',
				),
			}),
		);
		expect(resized).not.toHaveBeenCalled();

		// Start the host call with host globals only; the consumer then handles RESIZE.
		const deniedBeforeHostResize = deniedAccesses;
		await activeHarness.withHostGlobals(() =>
			hostProps.resize({ width: 640, height: 480 }),
		);
		expect(hostResizes).toEqual([[640, 480]]);
		// The consumer does not retry a resize the host already applied.
		expect(deniedAccesses).toBe(deniedBeforeHostResize);
		expect(resized).toHaveBeenCalledExactlyOnceWith({
			width: 640,
			height: 480,
		});
	});

	it("should remove popup loading artifacts and close the popup after initialization fails", async () => {
		harness = createPopupIntegrationHarness();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const PopupComponent = create({
			tag: "integration-popup-timeout",
			url: "https://host.example.com/widget",
			initTimeout: 10,
		});
		const instance = PopupComponent({});
		const closeSpy = vi.spyOn(harness.hostWindow, "close");
		const outcome = instance
			.render(container, "popup")
			.catch((error: unknown) => error);
		const popupOpen = await harness.waitForPopupOpen();
		expect(await outcome).toBeInstanceOf(Error);
		expect(container.childElementCount).toBe(0);
		expect(popupOpen).not.toBeNull();
		expect(closeSpy).toHaveBeenCalledOnce();
	});

	it("should reject render() with POPUP_BLOCKED when the browser blocks the popup", async () => {
		harness = createPopupIntegrationHarness();
		harness.blockNextPopup();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const PopupComponent = create({
			tag: "integration-popup-blocked-component",
			url: "https://host.example.com/widget",
		});

		const instance = PopupComponent({});

		const rejection = instance.render(container, "popup");
		await expect(rejection).rejects.toBeInstanceOf(ForgeFrameError);
		await expect(rejection).rejects.toMatchObject({ code: "POPUP_BLOCKED" });
		expect(container.childElementCount).toBe(0);
		expect(harness.getLastPopupOpen()).toBeNull();
	});
});
