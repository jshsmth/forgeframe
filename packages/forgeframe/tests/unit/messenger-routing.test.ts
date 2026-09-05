/**
 * Multi-instance routing regressions for the shared ForgeFrame message channel.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { FunctionBridge } from "@/communication/bridge";
import { Messenger } from "@/communication/messenger";
import {
	createRequestMessage,
	createResponseMessage,
	deserializeMessage,
	serializeMessage,
} from "@/communication/protocol";
import type { Message } from "@/communication/types";

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

function readMessage(source: Window): Message {
	const postMessage = (
		source as unknown as { postMessage: ReturnType<typeof vi.fn> }
	).postMessage;
	const serialized = postMessage.mock.calls[0]?.[0] as string;
	const response = deserializeMessage(serialized);
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
	(target as unknown as EventTarget).dispatchEvent(
		new MessageEvent("message", {
			data: serializeMessage(message),
			origin,
			source,
		}),
	);
}

function createLinkedWindows(): {
	consumerWindow: Window;
	hostWindow: Window;
} {
	const consumerWindow = new EventTarget() as unknown as Window;
	const hostWindow = new EventTarget() as unknown as Window;

	Object.defineProperty(consumerWindow, "postMessage", {
		value: vi.fn((data: string) => {
			const message = deserializeMessage(data);
			if (message) {
				dispatchWindowMessage(consumerWindow, message, HOST_ORIGIN, hostWindow);
			}
		}),
	});
	Object.defineProperty(hostWindow, "postMessage", {
		value: vi.fn((data: string) => {
			const message = deserializeMessage(data);
			if (message) {
				dispatchWindowMessage(
					hostWindow,
					message,
					CONSUMER_ORIGIN,
					consumerWindow,
				);
			}
		}),
	});

	return { consumerWindow, hostWindow };
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
		const targetWindow = { postMessage: vi.fn() } as unknown as Window;

		messenger.post(targetWindow, HOST_ORIGIN, "routed", {});

		const request = readMessage(targetWindow);
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

		const sourceWindow = { postMessage: vi.fn() } as unknown as Window;
		dispatchRequest(
			createRequestMessage(
				"routed-request",
				"routed",
				{},
				{ uid: "intended-instance", domain: HOST_ORIGIN },
			),
			sourceWindow,
		);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(intendedHandler).toHaveBeenCalledOnce();
		expect(unrelatedHandler).not.toHaveBeenCalled();
		expect(sourceWindow.postMessage).toHaveBeenCalledOnce();
		expect(readMessage(sourceWindow).data).toEqual({ result: "intended" });
	});

	it("should resolve one intended callback round trip when bridges share a window and origin", async () => {
		const { consumerWindow, hostWindow } = createLinkedWindows();
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
		const unrelatedBridge = new FunctionBridge(unrelatedMessenger);
		const intendedBridge = new FunctionBridge(intendedMessenger);
		const hostBridge = new FunctionBridge(hostMessenger);
		bridges.push(unrelatedBridge, intendedBridge, hostBridge);

		let resolveCallback!: (result: string) => void;
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

		const resultPromise = remoteCallback("payload");
		const request = readMessage(consumerWindow);
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

		resolveCallback("intended-result");

		expect(callback).toHaveBeenCalledWith("payload");
		await expect(resultPromise).resolves.toBe("intended-result");
		expect(consumerWindow.postMessage).toHaveBeenCalledOnce();
		expect(hostWindow.postMessage).toHaveBeenCalledOnce();
	});
});
