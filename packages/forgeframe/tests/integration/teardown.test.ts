/**
 * Integration tests for consumer teardown across a real host.
 *
 * Covers the consumer's `message` listeners, the popup close watcher, and
 * host requests that arrive after `close()`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_NAME } from "@/constants";
import { create } from "@/index";
import * as popupWindow from "@/render/popup";
import {
	createIframeIntegrationHarness,
	createPopupIntegrationHarness,
	dispatchForgeFrameRequest,
	type IframeIntegrationHarness,
	type PopupIntegrationHarness,
} from "./helpers";

const HOST_URL = "https://host.example.com/widget";

describe("Consumer teardown", () => {
	let harness: IframeIntegrationHarness | PopupIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
	});

	it("removes every message listener it added and the iframe on close()", async () => {
		const iframeHarness = createIframeIntegrationHarness();
		harness = iframeHarness;
		const container = document.createElement("div");
		document.body.append(container);
		const added = vi.spyOn(iframeHarness.consumerWindow, "addEventListener");
		const removed = vi.spyOn(
			iframeHarness.consumerWindow,
			"removeEventListener",
		);
		const Component = create({ tag: "teardown-listeners", url: HOST_URL });
		const instance = Component();

		const rendering = instance.render(container);
		await iframeHarness.bootstrapIframeHost(container);
		await rendering;
		await instance.close();

		const messageListeners = (spy: typeof added) =>
			spy.mock.calls
				.filter(([type]) => type === "message")
				.map(([, listener]) => listener);
		const addedListeners = messageListeners(added);
		expect(addedListeners).not.toHaveLength(0);
		expect(messageListeners(removed)).toHaveLength(addedListeners.length);
		expect(messageListeners(removed)).toEqual(
			expect.arrayContaining(addedListeners),
		);
		expect(container.querySelector("iframe")).toBeNull();
		expect(Component.instances).toHaveLength(0);
	});

	it("answers host requests until close() and ignores them afterwards", async () => {
		const iframeHarness = createIframeIntegrationHarness();
		harness = iframeHarness;
		const container = document.createElement("div");
		document.body.append(container);
		const instance = create({ tag: "teardown-requests", url: HOST_URL })();
		const resized = vi.fn();
		instance.event.on("resize", resized);
		const rendering = instance.render(container);
		await iframeHarness.bootstrapIframeHost(container);
		await rendering;
		const replies = vi.spyOn(iframeHarness.hostWindow, "postMessage");
		const requestResize = () =>
			dispatchForgeFrameRequest({
				targetWindow: iframeHarness.consumerWindow,
				sourceWindow: iframeHarness.hostWindow,
				origin: iframeHarness.hostOrigin,
				name: MESSAGE_NAME.RESIZE,
				data: { width: 200, height: 100 },
				claimedUid: instance.uid,
			});

		requestResize();
		await vi.waitFor(() => expect(replies).toHaveBeenCalledOnce());
		expect(resized).toHaveBeenCalledOnce();

		await instance.close();
		replies.mockClear();
		requestResize();
		await iframeHarness.flushMessages();

		expect(replies).not.toHaveBeenCalled();
		expect(resized).toHaveBeenCalledOnce();
	});

	it("stops watching a popup for closure on close()", async () => {
		const popupHarness = createPopupIntegrationHarness();
		harness = popupHarness;
		const container = document.createElement("div");
		document.body.append(container);
		const watchPopupClose = popupWindow.watchPopupClose;
		const stops: Array<ReturnType<typeof vi.fn>> = [];
		vi.spyOn(popupWindow, "watchPopupClose").mockImplementation(
			(popup, onClose) => {
				const stop = vi.fn(watchPopupClose(popup, onClose));
				stops.push(stop);
				return stop;
			},
		);
		const instance = create({ tag: "teardown-popup", url: HOST_URL })();

		const rendering = instance.render(container, "popup");
		await popupHarness.bootstrapPopupHost();
		await rendering;
		expect(stops).toHaveLength(1);
		expect(stops[0]).not.toHaveBeenCalled();

		await instance.close();

		expect(stops[0]).toHaveBeenCalledOnce();
	});
});
