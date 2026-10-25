/**
 * Integration tests for consumer lifecycle events across a real host.
 *
 * Covers popup event order and focus, the `exports` event across re-exports
 * and reconnection, declared props named like removed lifecycle callbacks,
 * and the `cspNonce` option staying on the consumer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Messenger } from "@/communication/messenger";
import { getHost } from "@/core/host/bootstrap";
import { create, EVENT, prop } from "@/index";
import {
	createIframeIntegrationHarness,
	createPopupIntegrationHarness,
	type IframeIntegrationHarness,
	type PopupIntegrationHarness,
} from "./helpers";

const HOST_URL = "https://host.example.com/widget";

describe("Lifecycle events integration", () => {
	let harness: IframeIntegrationHarness | PopupIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	it("emits render, rendered, focus, close and closed once each for a popup", async () => {
		const popupHarness = createPopupIntegrationHarness();
		harness = popupHarness;
		const container = document.createElement("div");
		document.body.append(container);
		const instance = create({
			tag: "integration-popup-events",
			url: HOST_URL,
		})();
		const events: string[] = [];
		for (const name of [
			EVENT.RENDER,
			EVENT.RENDERED,
			EVENT.FOCUS,
			EVENT.CLOSE,
			EVENT.CLOSED,
		] as const) {
			instance.event.on(name, () => {
				events.push(name);
			});
		}

		const rendering = instance.render(container, "popup");
		const { hostProps } = await popupHarness.bootstrapPopupHost();
		await rendering;
		await popupHarness.withHostGlobalsAsync(() => hostProps.focus());
		await instance.close();

		expect(events).toEqual([
			EVENT.RENDER,
			EVENT.RENDERED,
			EVENT.FOCUS,
			EVENT.CLOSE,
			EVENT.CLOSED,
		]);
	});

	it("emits closed without close when a failed render tears the instance down", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const failure = new Error("Expected template failure");
		const instance = create({
			tag: "integration-failed-render-events",
			url: HOST_URL,
			prerenderTemplate: () => {
				throw failure;
			},
		})();
		const events: string[] = [];
		for (const name of [EVENT.RENDER, EVENT.CLOSE, EVENT.CLOSED] as const) {
			instance.event.on(name, () => {
				events.push(name);
			});
		}

		await expect(instance.render(container)).rejects.toBe(failure);

		expect(events).toEqual([EVENT.RENDER, EVENT.CLOSED]);
		expect(container.querySelector("iframe")).toBeNull();
	});

	it("emits exports after instance.exports is set, again on re-export, and not on reconnect", async () => {
		const iframeHarness = createIframeIntegrationHarness();
		harness = iframeHarness;
		const container = document.createElement("div");
		document.body.append(container);
		const instance = create<Record<string, never>, { version: number }>({
			tag: "integration-exports-event",
			url: HOST_URL,
		})();
		const received: Array<{ payload: unknown; current: unknown }> = [];
		instance.event.on(EVENT.EXPORTS, (payload) => {
			received.push({ payload, current: instance.exports });
		});
		const rendering = instance.render(container);
		const { host, hostProps } =
			await iframeHarness.bootstrapIframeHost(container);
		await rendering;

		await iframeHarness.withHostGlobalsAsync(() =>
			hostProps.export({ version: 1 }),
		);
		await iframeHarness.withHostGlobalsAsync(() =>
			hostProps.export({ version: 2 }),
		);
		expect(received).toEqual([
			{ payload: { version: 1 }, current: { version: 1 } },
			{ payload: { version: 2 }, current: { version: 2 } },
		]);

		// A replaced document reconnects without running host teardown.
		const { messenger } = getHost() as unknown as { messenger: Messenger };
		vi.spyOn(messenger, "post").mockImplementation(() => {});
		iframeHarness.withHostGlobals(() => host.destroy());
		const nextHost = iframeHarness.bootstrapHost();
		if (!nextHost) throw new Error("Expected host reinitialization");
		const nextProps = await nextHost.ready;
		await iframeHarness.flushMessages();
		expect(instance.exports).toBeUndefined();
		expect(received).toHaveLength(2);

		await iframeHarness.withHostGlobalsAsync(() =>
			nextProps.export({ version: 3 }),
		);
		expect(received.at(-1)).toEqual({
			payload: { version: 3 },
			current: { version: 3 },
		});
	});

	it("sends declared props named like removed callbacks and never calls them itself", async () => {
		const iframeHarness = createIframeIntegrationHarness();
		harness = iframeHarness;
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = {
			onClose: prop.function<() => void>(),
			onError: prop.function<(message: string) => void>(),
			onRendered: prop.function<() => void>(),
		};
		const callbacks = {
			onClose: vi.fn(),
			onError: vi.fn(),
			onRendered: vi.fn(),
		};
		const instance = create({
			tag: "integration-declared-lifecycle-names",
			url: HOST_URL,
			props: definitions,
		})(callbacks);
		const rendering = instance.render(container);
		const { hostProps } = await iframeHarness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;

		await iframeHarness.withHostGlobalsAsync(() => hostProps.onError("bad"));
		expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith("bad");
		await instance.close();

		expect(callbacks.onClose).not.toHaveBeenCalled();
		expect(callbacks.onRendered).not.toHaveBeenCalled();
	});

	it("applies cspNonce to the spinner style and never sends it to the host", async () => {
		const iframeHarness = createIframeIntegrationHarness();
		harness = iframeHarness;
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = { label: prop.string() };
		const instance = create({
			tag: "integration-csp-nonce",
			url: HOST_URL,
			props: definitions,
			cspNonce: "consumer-nonce",
		})({ label: "pay", cspNonce: "prop-nonce" } as { label: string });
		const rendering = instance.render(container);
		const { hostProps, iframe } = await iframeHarness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;

		const nonces = [...document.querySelectorAll("style")].map(
			(style) => style.nonce,
		);
		expect(nonces).toContain("consumer-nonce");
		expect(nonces).not.toContain("prop-nonce");
		expect(iframe.name).not.toContain("nonce");
		expect(hostProps).not.toHaveProperty("cspNonce");
		expect(hostProps.consumer.props).toEqual({ label: "pay" });
	});
});
