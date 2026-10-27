/**
 * Multi-instance routing regressions for the shared ForgeFrame message channel.
 */
import { afterEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { FunctionBridge } from "@/communication/bridge";
import { Messenger } from "@/communication/messenger";
import {
	createRequestMessage,
	createResponseMessage,
	deserializeMessage,
	serializeMessage,
} from "@/communication/protocol";
import type { Message } from "@/communication/types";
import { createFrameWindow } from "../frame-window";
import { requireValue } from "../require-value";

const HOST_ORIGIN = "https://shared-host.example.com";
const CONSUMER_ORIGIN = "https://consumer.example.com";

function dispatchRequest(
	request: ReturnType<typeof createRequestMessage>,
	source: Window,
): void {
	window.dispatchEvent(
		new MessageEvent("message", {
			data: serializeMessage(request),
			origin: HOST_ORIGIN,
			source,
		}),
	);
}

type PostMessage = MockInstance<Window["postMessage"]>;

/** A real window whose `postMessage` is recorded instead of delivered. */
function createRecordingWindow(): { win: Window; postMessage: PostMessage } {
	const win = createFrameWindow();
	const postMessage = vi.spyOn(win, "postMessage").mockImplementation(() => {});
	return { win, postMessage };
}

function readMessage(postMessage: PostMessage): Message {
	const response = deserializeMessage(postMessage.mock.calls[0]?.[0]);
	if (!response) {
		throw new Error("Expected a ForgeFrame message");
	}
	return response;
}

function dispatchWindowMessage(
	target: Window,
	message: Message,
	origin: string,
	source: Window,
): void {
	target.dispatchEvent(
		new MessageEvent("message", {
			data: serializeMessage(message),
			origin,
			source,
		}),
	);
}

function createLinkedWindows(): {
	consumerWindow: Window;
	consumerPostMessage: PostMessage;
	hostWindow: Window;
	hostPostMessage: PostMessage;
} {
	const consumerWindow = createFrameWindow();
	const hostWindow = createFrameWindow();

	const consumerPostMessage = vi
		.spyOn(consumerWindow, "postMessage")
		.mockImplementation((data: unknown) => {
			const message = deserializeMessage(data);
			if (message) {
				dispatchWindowMessage(consumerWindow, message, HOST_ORIGIN, hostWindow);
			}
		});
	const hostPostMessage = vi
		.spyOn(hostWindow, "postMessage")
		.mockImplementation((data: unknown) => {
			const message = deserializeMessage(data);
			if (message) {
				dispatchWindowMessage(
					hostWindow,
					message,
					CONSUMER_ORIGIN,
					consumerWindow,
				);
			}
		});

	return { consumerWindow, consumerPostMessage, hostWindow, hostPostMessage };
}

describe("Messenger instance routing", () => {
	const messengers: Messenger[] = [];
	const bridges: FunctionBridge[] = [];

	afterEach(() => {
		for (const bridge of bridges) {
			bridge.destroy();
		}
		for (const messenger of messengers) {
			messenger.destroy();
		}
		bridges.length = 0;
		messengers.length = 0;
	});

	function createMessenger(
		uid: string,
		win: Window = window,
		domain = window.location.origin,
		trustedDomain = HOST_ORIGIN,
	): Messenger {
		const messenger = new Messenger(uid, win, domain, trustedDomain);
		messengers.push(messenger);
		return messenger;
	}

	it("should serialize the component channel UID on outgoing messages", () => {
		const messenger = createMessenger("intended-instance");
		const { win: targetWindow, postMessage } = createRecordingWindow();

		messenger.post(targetWindow, HOST_ORIGIN, "routed", {});

		const request = readMessage(postMessage);
		expect(request.source).toEqual({
			uid: "intended-instance",
			domain: window.location.origin,
		});
	});

	it("should let only the matching component channel handle and answer a request", async () => {
		const unrelatedMessenger = createMessenger("unrelated-instance");
		const intendedMessenger = createMessenger("intended-instance");
		const unrelatedHandler = vi.fn().mockReturnValue({ result: "unrelated" });
		const intendedHandler = vi.fn().mockReturnValue({ result: "intended" });
		unrelatedMessenger.on("routed", unrelatedHandler);
		intendedMessenger.on("routed", intendedHandler);

		const { win: sourceWindow, postMessage } = createRecordingWindow();
		dispatchRequest(
			createRequestMessage(
				"routed-request",
				"routed",
				{},
				{ uid: "intended-instance", domain: HOST_ORIGIN },
			),
			sourceWindow,
		);
		await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce());

		expect(intendedHandler).toHaveBeenCalledOnce();
		expect(unrelatedHandler).not.toHaveBeenCalled();
		expect(readMessage(postMessage).data).toEqual({ result: "intended" });
	});

	it("should resolve one intended callback round trip when bridges share a window and origin", async () => {
		const { consumerWindow, consumerPostMessage, hostWindow, hostPostMessage } =
			createLinkedWindows();
		const unrelatedMessenger = createMessenger(
			"unrelated-instance",
			consumerWindow,
			CONSUMER_ORIGIN,
		);
		const intendedMessenger = createMessenger(
			"intended-instance",
			consumerWindow,
			CONSUMER_ORIGIN,
		);
		const hostMessenger = createMessenger(
			"intended-instance",
			hostWindow,
			HOST_ORIGIN,
			CONSUMER_ORIGIN,
		);
		// Source admission is covered by bridge tests; this test isolates responses.
		const acceptAnySource = () => true;
		const unrelatedBridge = new FunctionBridge(
			unrelatedMessenger,
			acceptAnySource,
		);
		const intendedBridge = new FunctionBridge(
			intendedMessenger,
			acceptAnySource,
		);
		const hostBridge = new FunctionBridge(hostMessenger, acceptAnySource);
		bridges.push(unrelatedBridge, intendedBridge, hostBridge);

		let resolveCallback: ((result: string) => void) | undefined;
		const callback = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					resolveCallback = resolve;
				}),
		);
		const ref = intendedBridge.serialize(callback);
		const remoteCallback = hostBridge.deserialize(
			ref,
			consumerWindow,
			CONSUMER_ORIGIN,
		);

		const resultPromise = Promise.resolve(remoteCallback("payload"));
		const request = readMessage(consumerPostMessage);
		dispatchWindowMessage(
			hostWindow,
			createResponseMessage(request.id, "unrelated-result", {
				uid: "unrelated-instance",
				domain: CONSUMER_ORIGIN,
			}),
			CONSUMER_ORIGIN,
			consumerWindow,
		);

		let settled = false;
		void resultPromise.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);

		requireValue(resolveCallback)("intended-result");

		expect(callback).toHaveBeenCalledWith("payload");
		await expect(resultPromise).resolves.toBe("intended-result");
		expect(consumerPostMessage).toHaveBeenCalledOnce();
		expect(hostPostMessage).toHaveBeenCalledOnce();
	});
});
