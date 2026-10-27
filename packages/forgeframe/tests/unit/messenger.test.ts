/**
 * Unit tests for `@/communication/messenger`.
 *
 * Covers request/response flows, timeout and teardown behavior, message filtering, and trusted-domain enforcement semantics.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Messenger } from "@/communication/messenger";
import {
	createRequestMessage,
	createResponseMessage,
	deserializeMessage,
	serializeMessage,
} from "@/communication/protocol";
import { MESSAGE_TYPE } from "@/constants";
import { forgeFrameError } from "../forgeframe-error";
import { createFrameWindow } from "../frame-window";

type SourceWindow = Window & { postMessage: ReturnType<typeof vi.fn> };

describe("Messenger", () => {
	let messenger: Messenger;
	let mockWindow: Window;
	let messageListeners: Set<(event: MessageEvent) => void>;

	beforeEach(() => {
		messageListeners = new Set();

		mockWindow = Object.assign(createFrameWindow(), {
			addEventListener: vi.fn(
				(event: string, listener: (event: MessageEvent) => void) => {
					if (event === "message") {
						messageListeners.add(listener);
					}
				},
			),
			removeEventListener: vi.fn(
				(event: string, listener: (event: MessageEvent) => void) => {
					if (event === "message") {
						messageListeners.delete(listener);
					}
				},
			),
			postMessage: vi.fn(),
		});

		// Create messenger with trusted domains for testing
		messenger = new Messenger("test-uid", mockWindow, "https://consumer.com", [
			"https://host.com",
			"https://target.com",
			"https://sender.com",
			"https://example.com",
		]);
	});

	afterEach(() => {
		vi.useRealTimers();
		messenger.destroy();
	});

	/**
	 * A window that can receive replies, as every real message source can.
	 * The messenger drops sources without `postMessage` before any other
	 * check, so a negative test with such a source would pass vacuously.
	 * Admission and handler calls are synchronous, as is the reply to a
	 * request without a handler; a handler's reply posts after a microtask,
	 * so assert it with `vi.waitFor`.
	 */
	function createSourceWindow(): SourceWindow {
		return Object.assign(createFrameWindow(), { postMessage: vi.fn() });
	}

	function dispatchMessage(
		data: unknown,
		source: Window | null,
		origin = "https://host.com",
	) {
		const event = new MessageEvent("message", {
			data,
			source,
			origin,
		});

		for (const listener of messageListeners) {
			listener(event);
		}
	}

	describe("constructor", () => {
		it("should setup message listener", () => {
			expect(mockWindow.addEventListener).toHaveBeenCalledWith(
				"message",
				expect.any(Function),
			);
		});

		it("does not trust other opaque documents when its own origin is opaque", () => {
			const opaque = new Messenger("opaque-uid", mockWindow, "null");
			const handler = vi.fn(() => ({ ok: true }));
			opaque.on("probe", handler);
			try {
				dispatchMessage(
					serializeMessage(
						createRequestMessage(
							"opaque-request",
							"probe",
							{},
							{
								uid: "opaque-uid",
								domain: "null",
							},
						),
					),
					createSourceWindow(),
					"null",
				);
				expect(handler).not.toHaveBeenCalled();

				// An origin it is told to trust still reaches the handler.
				opaque.addTrustedOrigin("https://host.com");
				dispatchMessage(
					serializeMessage(
						createRequestMessage(
							"trusted-request",
							"probe",
							{},
							{ uid: "opaque-uid", domain: "https://host.com" },
						),
					),
					createSourceWindow(),
				);
				expect(handler).toHaveBeenCalledOnce();
			} finally {
				opaque.destroy();
			}
		});

		it.each([
			["'*'", "*"],
			["a match-all RegExp", /.*/],
		] as const)(
			"never trusts an opaque origin, even through %s",
			async (_label, trusted) => {
				const open = new Messenger(
					"open-uid",
					mockWindow,
					"https://consumer.com",
					trusted,
				);
				const handler = vi.fn(() => ({ ok: true }));
				open.on("probe", handler);
				try {
					dispatchMessage(
						serializeMessage(
							createRequestMessage(
								"opaque-wildcard-request",
								"probe",
								{},
								{ uid: "open-uid", domain: "null" },
							),
						),
						createSourceWindow(),
						"null",
					);
					await Promise.resolve();
					expect(handler).not.toHaveBeenCalled();
				} finally {
					open.destroy();
				}
			},
		);

		it("defers its listener until listen() and attaches it once", () => {
			const deferredWindow = Object.assign(createFrameWindow(), {
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			});
			const deferred = new Messenger(
				"deferred-uid",
				deferredWindow,
				"https://consumer.com",
				undefined,
				false,
			);
			expect(deferredWindow.addEventListener).not.toHaveBeenCalled();
			deferred.listen();
			deferred.listen();
			expect(deferredWindow.addEventListener).toHaveBeenCalledOnce();
			deferred.destroy();
			deferred.listen();
			expect(deferredWindow.addEventListener).toHaveBeenCalledOnce();
		});
	});

	describe("send", () => {
		let targetWindow: Window;

		beforeEach(() => {
			targetWindow = createSourceWindow();
		});

		it("should send message via postMessage", async () => {
			vi.useFakeTimers();

			const sendPromise = messenger.send(
				targetWindow,
				"https://target.com",
				"greeting",
				{ name: "World" },
			);

			expect(targetWindow.postMessage).toHaveBeenCalledWith(
				expect.stringContaining("forgeframe:"),
				"https://target.com",
			);

			// Simulate response
			const sentMessage = JSON.parse(
				(
					targetWindow.postMessage as ReturnType<typeof vi.fn>
				).mock.calls[0][0].slice("forgeframe:".length),
			);

			const response = createResponseMessage(
				sentMessage.id,
				{ greeting: "Hello, World!" },
				{ uid: "test-uid", domain: "https://target.com" },
			);

			dispatchMessage(
				serializeMessage(response),
				targetWindow,
				"https://target.com",
			);

			const result = await sendPromise;
			expect(result).toEqual({ greeting: "Hello, World!" });
		});

		it("should timeout if no response", async () => {
			vi.useFakeTimers();

			const sendPromise = messenger.send(
				targetWindow,
				"https://target.com",
				"test",
				{},
				100,
			);

			vi.advanceTimersByTime(100);

			await expect(sendPromise).rejects.toThrow(
				forgeFrameError("CLOSED", "timed out"),
			);
		});

		it("should throw if messenger is destroyed", async () => {
			messenger.destroy();

			await expect(
				messenger.send(targetWindow, "https://target.com", "test"),
			).rejects.toThrow(
				forgeFrameError("CLOSED", "Messenger has been destroyed"),
			);
		});

		it("stops a send when JSON conversion destroys the messenger", async () => {
			vi.useFakeTimers();
			await expect(
				messenger.send(targetWindow, "https://target.com", "test", {
					toJSON() {
						messenger.destroy();
						return { converted: true };
					},
				}),
			).rejects.toThrow(forgeFrameError("CLOSED", "Messenger destroyed"));
			expect(targetWindow.postMessage).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});

		it("should propagate errors from response", async () => {
			vi.useFakeTimers();

			const sendPromise = messenger.send(
				targetWindow,
				"https://target.com",
				"errorTest",
			);

			const sentMessage = JSON.parse(
				(
					targetWindow.postMessage as ReturnType<typeof vi.fn>
				).mock.calls[0][0].slice("forgeframe:".length),
			);

			const response = createResponseMessage(
				sentMessage.id,
				null,
				{ uid: "test-uid", domain: "https://target.com" },
				new Error("Handler failed"),
			);

			dispatchMessage(
				serializeMessage(response),
				targetWindow,
				"https://target.com",
			);

			await expect(sendPromise).rejects.toThrow("Handler failed");
		});

		it("should ignore responses from unexpected source windows", async () => {
			const sendPromise = messenger.send(
				targetWindow,
				"https://target.com",
				"sourceCheck",
			);

			const sentMessage = JSON.parse(
				(
					targetWindow.postMessage as ReturnType<typeof vi.fn>
				).mock.calls[0][0].slice("forgeframe:".length),
			);

			const spoofedResponse = createResponseMessage(
				sentMessage.id,
				{ from: "spoofed" },
				{ uid: "test-uid", domain: "https://target.com" },
			);
			const spoofedWindow = createSourceWindow();
			dispatchMessage(
				serializeMessage(spoofedResponse),
				spoofedWindow,
				"https://target.com",
			);

			const trustedResponse = createResponseMessage(
				sentMessage.id,
				{ from: "trusted" },
				{ uid: "test-uid", domain: "https://target.com" },
			);
			dispatchMessage(
				serializeMessage(trustedResponse),
				targetWindow,
				"https://target.com",
			);

			await expect(sendPromise).resolves.toEqual({ from: "trusted" });
		});

		it("should ignore responses from unexpected origins for fixed target domains", async () => {
			const sendPromise = messenger.send(
				targetWindow,
				"https://target.com",
				"originCheck",
			);

			const sentMessage = JSON.parse(
				(
					targetWindow.postMessage as ReturnType<typeof vi.fn>
				).mock.calls[0][0].slice("forgeframe:".length),
			);

			const wrongOriginResponse = createResponseMessage(
				sentMessage.id,
				{ from: "wrong-origin" },
				{ uid: "test-uid", domain: "https://host.com" },
			);
			dispatchMessage(
				serializeMessage(wrongOriginResponse),
				targetWindow,
				"https://host.com",
			);

			const trustedResponse = createResponseMessage(
				sentMessage.id,
				{ from: "trusted-origin" },
				{ uid: "test-uid", domain: "https://target.com" },
			);
			dispatchMessage(
				serializeMessage(trustedResponse),
				targetWindow,
				"https://target.com",
			);

			await expect(sendPromise).resolves.toEqual({ from: "trusted-origin" });
		});

		it.each(["*", "/", "target.com", ""])(
			'should reject the non-URL target "%s" before posting',
			async (targetOrigin) => {
				await expect(
					messenger.send(targetWindow, targetOrigin, "invalidTarget"),
				).rejects.toThrow(
					forgeFrameError(
						"VALIDATION",
						`Cannot send "invalidTarget": target origin "${targetOrigin}" is not an absolute URL`,
					),
				);

				expect(targetWindow.postMessage).not.toHaveBeenCalled();
				// Bracket access reads the private map with its real type.
				expect(messenger["pending"].size).toBe(0);
			},
		);

		it.each(["data:text/plain,hi", "about:blank"])(
			'should reject the opaque-origin target "%s" before posting',
			async (targetOrigin) => {
				await expect(
					messenger.send(targetWindow, targetOrigin, "opaqueTarget"),
				).rejects.toThrow(
					forgeFrameError(
						"ORIGIN_REJECTED",
						`Cannot send "opaqueTarget": target origin "${targetOrigin}" is opaque`,
					),
				);

				expect(targetWindow.postMessage).not.toHaveBeenCalled();
				// Bracket access reads the private map with its real type.
				expect(messenger["pending"].size).toBe(0);
			},
		);

		it("should normalize URL-like targetOrigin values when matching response origins", async () => {
			const sendPromise = messenger.send(
				targetWindow,
				"https://TARGET.com/path/to/page?foo=bar#hash",
				"normalizedOrigin",
			);

			const [serialized, targetOrigin] = (
				targetWindow.postMessage as ReturnType<typeof vi.fn>
			).mock.calls[0];
			expect(targetOrigin).toBe("https://target.com");
			const sentMessage = JSON.parse(serialized.slice("forgeframe:".length));

			const response = createResponseMessage(
				sentMessage.id,
				{ ok: "normalized" },
				{ uid: "test-uid", domain: "https://target.com" },
			);
			dispatchMessage(
				serializeMessage(response),
				targetWindow,
				"https://target.com",
			);

			await expect(sendPromise).resolves.toEqual({ ok: "normalized" });
		});

		it("should cleanup pending request when postMessage throws", async () => {
			const postMessageError = new Error("postMessage blocked");
			targetWindow = Object.assign(createFrameWindow(), {
				postMessage: vi.fn(() => {
					throw postMessageError;
				}),
			});

			await expect(
				messenger.send(targetWindow, "https://target.com", "throwing-send"),
			).rejects.toThrow("postMessage blocked");

			expect(messenger["pending"].size).toBe(0);
		});
	});

	describe("rejectPending", () => {
		it("rejects only pending requests of the named type sent to that window", async () => {
			const replaced = createSourceWindow();
			const other = createSourceWindow();
			const settled = (promise: Promise<unknown>) =>
				promise.then(
					() => "resolved",
					(error: Error) => error.message,
				);
			const replacedCall = settled(
				messenger.send(replaced, "https://host.com", "call", {}, null),
			);
			const replacedProps = settled(
				messenger.send(replaced, "https://host.com", "props", {}, null),
			);
			const otherCall = settled(
				messenger.send(other, "https://host.com", "call", {}, null),
			);
			let laterSettled = false;
			void Promise.all([replacedProps, otherCall]).then(() => {
				laterSettled = true;
			});

			messenger.rejectPending("call", replaced, new Error("Host reconnected"));

			await expect(replacedCall).resolves.toBe("Host reconnected");
			await Promise.resolve();
			expect(laterSettled).toBe(false);
			messenger.destroy();
			await expect(replacedProps).resolves.toBe("Messenger destroyed");
			await expect(otherCall).resolves.toBe("Messenger destroyed");
		});
	});

	describe("resolvePending", () => {
		it("resolves only pending requests of the named type sent to that window", async () => {
			const replaced = createSourceWindow();
			const props = messenger.send(
				replaced,
				"https://host.com",
				"props",
				{},
				null,
			);
			const call = messenger
				.send(replaced, "https://host.com", "call", {}, null)
				.catch((error: Error) => error.message);
			messenger.resolvePending("props", replaced, { success: true });
			await expect(props).resolves.toEqual({ success: true });
			messenger.destroy();
			await expect(call).resolves.toBe("Messenger destroyed");
		});
	});

	describe("post", () => {
		it("should send one-way message without waiting", () => {
			const targetWindow = createSourceWindow();

			messenger.post(targetWindow, "https://target.com", "notify", {
				event: "update",
			});

			expect(targetWindow.postMessage).toHaveBeenCalledWith(
				expect.stringContaining("forgeframe:"),
				"https://target.com",
			);
		});

		it("should throw if messenger is destroyed", () => {
			messenger.destroy();

			const targetWindow = createSourceWindow();

			expect(() =>
				messenger.post(targetWindow, "https://target.com", "test"),
			).toThrow(forgeFrameError("CLOSED", "Messenger has been destroyed"));
		});

		it.each(["*", "/", "target.com"])(
			'should reject the non-URL target "%s" before posting',
			(targetOrigin) => {
				const targetWindow = createSourceWindow();

				expect(() =>
					messenger.post(targetWindow, targetOrigin, "notify"),
				).toThrow(
					forgeFrameError(
						"VALIDATION",
						`Cannot send "notify": target origin "${targetOrigin}" is not an absolute URL`,
					),
				);
				expect(targetWindow.postMessage).not.toHaveBeenCalled();
			},
		);

		it("should reject an opaque-origin target before posting", () => {
			const targetWindow = createSourceWindow();

			expect(() =>
				messenger.post(targetWindow, "data:text/plain,hi", "notify"),
			).toThrow(
				forgeFrameError(
					"ORIGIN_REJECTED",
					'Cannot send "notify": target origin "data:text/plain,hi" is opaque',
				),
			);
			expect(targetWindow.postMessage).not.toHaveBeenCalled();
		});
	});

	describe("on", () => {
		it("should register handler for message type", () => {
			const handler = vi.fn().mockReturnValue({ result: "ok" });

			messenger.on("testMessage", handler);

			const sourceWindow = createSourceWindow();

			const request = createRequestMessage(
				"req-1",
				"testMessage",
				{ input: "data" },
				{
					uid: "test-uid",
					domain: "https://sender.com",
				},
			);

			dispatchMessage(
				serializeMessage(request),
				sourceWindow,
				"https://sender.com",
			);

			expect(handler).toHaveBeenCalledWith(
				{ input: "data" },
				{ uid: "test-uid", domain: "https://sender.com", window: sourceWindow },
			);
		});

		it("should return unsubscribe function", async () => {
			const handler = vi.fn();

			const unsubscribe = messenger.on("testMessage", handler);
			const sourceWindow = createSourceWindow();
			const request = createRequestMessage(
				"req-1",
				"testMessage",
				{},
				{
					uid: "test-uid",
					domain: "https://example.com",
				},
			);

			dispatchMessage(serializeMessage(request), sourceWindow);
			expect(handler).toHaveBeenCalledOnce();
			await vi.waitFor(() =>
				expect(sourceWindow.postMessage).toHaveBeenCalledOnce(),
			);

			unsubscribe();
			dispatchMessage(serializeMessage(request), sourceWindow);

			expect(handler).toHaveBeenCalledOnce();
			// The request now has no handler, so it gets the unsupported reply.
			await vi.waitFor(() =>
				expect(sourceWindow.postMessage).toHaveBeenCalledTimes(2),
			);
			const reply = deserializeMessage(
				sourceWindow.postMessage.mock.calls[1]?.[0],
			);
			expect(reply?.error).toMatchObject({ code: "VERSION_MISMATCH" });
		});

		it("should send response back to source", async () => {
			const handler = vi.fn().mockReturnValue({ response: "data" });

			messenger.on("testMessage", handler);

			const targetWindow = createSourceWindow();

			const request = createRequestMessage(
				"req-1",
				"testMessage",
				{},
				{
					uid: "test-uid",
					domain: "https://sender.com",
				},
			);

			dispatchMessage(
				serializeMessage(request),
				targetWindow,
				"https://sender.com",
			);

			await vi.waitFor(() =>
				expect(targetWindow.postMessage).toHaveBeenCalledWith(
					expect.stringContaining("forgeframe:"),
					"https://sender.com",
				),
			);

			// Parse the response
			const responseStr = (targetWindow.postMessage as ReturnType<typeof vi.fn>)
				.mock.calls[0][0];
			const responseData = JSON.parse(responseStr.slice("forgeframe:".length));

			expect(responseData.type).toBe(MESSAGE_TYPE.RESPONSE);
			expect(responseData.data).toEqual({ response: "data" });
		});

		it("should send error response on handler failure", async () => {
			const handler = vi.fn().mockRejectedValue(new Error("Handler error"));

			messenger.on("testMessage", handler);

			const targetWindow = createSourceWindow();

			const request = createRequestMessage(
				"req-1",
				"testMessage",
				{},
				{
					uid: "test-uid",
					domain: "https://sender.com",
				},
			);

			dispatchMessage(
				serializeMessage(request),
				targetWindow,
				"https://sender.com",
			);

			await vi.waitFor(() =>
				expect(targetWindow.postMessage).toHaveBeenCalledOnce(),
			);
			const responseStr = (targetWindow.postMessage as ReturnType<typeof vi.fn>)
				.mock.calls[0][0];
			const responseData = JSON.parse(responseStr.slice("forgeframe:".length));

			expect(responseData.error).toEqual({ message: "Handler error" });
		});

		it("preserves immediate synchronous failures and one-await successful responses", async () => {
			messenger.on("syncError", () => {
				throw new Error("sync failure");
			});
			messenger.on("syncResult", () => 42);
			const sourceWindow = createSourceWindow();
			const { postMessage } = sourceWindow;
			const source = { uid: "test-uid", domain: "https://sender.com" };
			dispatchMessage(
				serializeMessage(
					createRequestMessage("error", "syncError", {}, source),
				),
				sourceWindow,
				"https://sender.com",
			);
			expect(postMessage).toHaveBeenCalledTimes(1);
			dispatchMessage(
				serializeMessage(
					createRequestMessage("result", "syncResult", {}, source),
				),
				sourceWindow,
				"https://sender.com",
			);
			expect(postMessage).toHaveBeenCalledTimes(1);
			await Promise.resolve();
			expect(postMessage).toHaveBeenCalledTimes(2);
		});
	});

	describe("message filtering", () => {
		it("should ignore messages from same window", () => {
			const handler = vi.fn();
			messenger.on("test", handler);

			const request = createRequestMessage(
				"req-1",
				"test",
				{},
				{
					uid: "test-uid",
					domain: "https://example.com",
				},
			);

			// Source is the same as messenger window
			dispatchMessage(serializeMessage(request), mockWindow);

			expect(handler).not.toHaveBeenCalled();
			expect(mockWindow.postMessage).not.toHaveBeenCalled();

			dispatchMessage(serializeMessage(request), createSourceWindow());
			expect(handler).toHaveBeenCalledOnce();
		});

		it("should ignore non-ForgeFrame messages", () => {
			const handler = vi.fn();
			messenger.on("test", handler);

			const sourceWindow = createSourceWindow();
			dispatchMessage("not a forgeframe message", sourceWindow);
			dispatchMessage({ type: "other" }, sourceWindow);

			expect(handler).not.toHaveBeenCalled();
			expect(sourceWindow.postMessage).not.toHaveBeenCalled();
		});

		it("answers a request without a handler with VERSION_MISMATCH", () => {
			const targetWindow = createSourceWindow();

			const request = createRequestMessage(
				"req-1",
				"unknownMessage",
				{},
				{
					uid: "test-uid",
					domain: "https://example.com",
				},
			);

			dispatchMessage(serializeMessage(request), targetWindow);

			// A newer peer's request fails fast with a coded reply.
			const [reply] = vi.mocked(targetWindow.postMessage).mock.calls[0] ?? [];
			const response = deserializeMessage(reply);
			expect(response?.type).toBe("response");
			expect(response?.id).toBe("req-1");
			expect(response?.error).toMatchObject({
				code: "VERSION_MISMATCH",
				message: expect.stringContaining('"unknownMessage" request'),
			});
		});
	});

	describe("origin validation", () => {
		it("should reject messages from untrusted origins", () => {
			const handler = vi.fn();
			messenger.on("test", handler);

			const request = createRequestMessage(
				"req-1",
				"test",
				{ data: "value" },
				{
					uid: "test-uid",
					domain: "https://malicious.com",
				},
			);

			const sourceWindow = createSourceWindow();
			dispatchMessage(
				serializeMessage(request),
				sourceWindow,
				"https://malicious.com",
			);

			expect(handler).not.toHaveBeenCalled();
			expect(sourceWindow.postMessage).not.toHaveBeenCalled();

			// The same request from a trusted origin reaches the handler.
			dispatchMessage(serializeMessage(request), sourceWindow);
			expect(handler).toHaveBeenCalledOnce();
		});

		it("should ignore a trusted message whose source cannot receive replies", () => {
			const handler = vi.fn();
			messenger.on("test", handler);
			const request = serializeMessage(
				createRequestMessage(
					"req-1",
					"test",
					{},
					{ uid: "test-uid", domain: "https://host.com" },
				),
			);

			dispatchMessage(request, null);
			dispatchMessage(request, {} as Window);
			expect(handler).not.toHaveBeenCalled();

			dispatchMessage(request, createSourceWindow());
			expect(handler).toHaveBeenCalledOnce();
		});

		it("should accept messages from trusted origins", () => {
			const handler = vi.fn().mockReturnValue({ ok: true });
			messenger.on("test", handler);

			const request = createRequestMessage(
				"req-1",
				"test",
				{ data: "value" },
				{
					uid: "test-uid",
					domain: "https://host.com",
				},
			);

			// Dispatch from a trusted origin
			dispatchMessage(
				serializeMessage(request),
				createSourceWindow(),
				"https://host.com",
			);

			expect(handler).toHaveBeenCalled();
		});

		it("should use event origin instead of claimed message source domain", () => {
			const handler = vi.fn().mockReturnValue({ ok: true });
			messenger.on("test", handler);

			const sourceWindow = createSourceWindow();
			const request = createRequestMessage(
				"req-1",
				"test",
				{ data: "value" },
				{
					uid: "test-uid",
					domain: "https://spoofed.example.com",
				},
			);

			dispatchMessage(
				serializeMessage(request),
				sourceWindow,
				"https://host.com",
			);

			expect(handler).toHaveBeenCalledWith(
				{ data: "value" },
				{ uid: "test-uid", domain: "https://host.com", window: sourceWindow },
			);
		});

		it("should expose the browser-verified source window to handlers", () => {
			const handler = vi.fn().mockReturnValue({ ok: true });
			messenger.on("source-window", handler);

			const sourceWindow = createSourceWindow();
			const request = createRequestMessage(
				"req-source-window",
				"source-window",
				{},
				{
					uid: "test-uid",
					domain: "https://host.com",
				},
			);

			dispatchMessage(
				serializeMessage(request),
				sourceWindow,
				"https://host.com",
			);

			expect(handler).toHaveBeenCalledWith(
				{},
				expect.objectContaining({
					uid: "test-uid",
					domain: "https://host.com",
					window: sourceWindow,
				}),
			);
		});

		it("should allow adding trusted domains dynamically", () => {
			const handler = vi.fn().mockReturnValue({ ok: true });
			messenger.on("test", handler);

			const request = createRequestMessage(
				"req-1",
				"test",
				{ data: "value" },
				{
					uid: "test-uid",
					domain: "https://new-trusted.com",
				},
			);

			// Initially untrusted
			dispatchMessage(
				serializeMessage(request),
				createSourceWindow(),
				"https://new-trusted.com",
			);
			expect(handler).not.toHaveBeenCalled();

			// Add trust
			messenger.addTrustedOrigin("https://new-trusted.com");

			// Now should work
			dispatchMessage(
				serializeMessage(request),
				createSourceWindow(),
				"https://new-trusted.com",
			);
			expect(handler).toHaveBeenCalled();
		});

		it("should stop trusting a dynamically added string domain after removal", () => {
			const handler = vi.fn().mockReturnValue({ ok: true });
			messenger.on("test-remove-string", handler);

			const request = createRequestMessage(
				"req-rm-1",
				"test-remove-string",
				{},
				{
					uid: "test-uid",
					domain: "https://remove-string.com",
				},
			);
			const source = createSourceWindow();

			messenger.addTrustedOrigin("https://remove-string.com");
			dispatchMessage(
				serializeMessage(request),
				source,
				"https://remove-string.com",
			);
			expect(handler).toHaveBeenCalledTimes(1);

			messenger.removeTrustedOrigin("https://remove-string.com");
			dispatchMessage(
				serializeMessage(request),
				source,
				"https://remove-string.com",
			);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("should stop trusting wildcard domains after wildcard removal", () => {
			const handler = vi.fn().mockReturnValue({ ok: true });
			messenger.on("test-remove-wildcard", handler);

			const request = createRequestMessage(
				"req-rm-2",
				"test-remove-wildcard",
				{},
				{
					uid: "test-uid",
					domain: "https://api.remove-wildcard.com",
				},
			);
			const source = createSourceWindow();

			messenger.addTrustedOrigin("https://*.remove-wildcard.com");
			dispatchMessage(
				serializeMessage(request),
				source,
				"https://api.remove-wildcard.com",
			);
			expect(handler).toHaveBeenCalledTimes(1);

			messenger.removeTrustedOrigin("https://*.remove-wildcard.com");
			dispatchMessage(
				serializeMessage(request),
				source,
				"https://api.remove-wildcard.com",
			);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("should remove mixed trusted domains when removed as an array", () => {
			const handler = vi.fn().mockReturnValue({ ok: true });
			messenger.on("test-remove-array", handler);

			const regexOrigin = /^https:\/\/.*\.remove-array\.com$/;
			messenger.addTrustedOrigin(["https://remove-array.com", regexOrigin]);

			const source = createSourceWindow();
			const stringRequest = createRequestMessage(
				"req-rm-3",
				"test-remove-array",
				{},
				{ uid: "test-uid", domain: "https://remove-array.com" },
			);
			const regexRequest = createRequestMessage(
				"req-rm-4",
				"test-remove-array",
				{},
				{
					uid: "test-uid",
					domain: "https://sub.remove-array.com",
				},
			);

			dispatchMessage(
				serializeMessage(stringRequest),
				source,
				"https://remove-array.com",
			);
			dispatchMessage(
				serializeMessage(regexRequest),
				source,
				"https://sub.remove-array.com",
			);
			expect(handler).toHaveBeenCalledTimes(2);

			messenger.removeTrustedOrigin(["https://remove-array.com", regexOrigin]);
			dispatchMessage(
				serializeMessage(stringRequest),
				source,
				"https://remove-array.com",
			);
			dispatchMessage(
				serializeMessage(regexRequest),
				source,
				"https://sub.remove-array.com",
			);
			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("should support RegExp patterns for trusted domains", () => {
			// Create new messenger with RegExp pattern
			const regexMessenger = new Messenger(
				"regex-uid",
				mockWindow,
				"https://consumer.com",
				/^https:\/\/.*\.trusted\.com$/,
			);

			const handler = vi.fn().mockReturnValue({ ok: true });
			regexMessenger.on("test", handler);

			const request = createRequestMessage(
				"req-1",
				"test",
				{},
				{
					uid: "regex-uid",
					domain: "https://sub.trusted.com",
				},
			);

			dispatchMessage(
				serializeMessage(request),
				createSourceWindow(),
				"https://sub.trusted.com",
			);

			expect(handler).toHaveBeenCalled();

			regexMessenger.destroy();
		});

		it("should handle global RegExp trusted domain patterns consistently", () => {
			const trustedPattern = /trusted-global\.com$/g;
			const regexMessenger = new Messenger(
				"regex-global-uid",
				mockWindow,
				"https://consumer.com",
				trustedPattern,
			);

			const handler = vi.fn().mockReturnValue({ ok: true });
			regexMessenger.on("test", handler);

			const request = createRequestMessage(
				"req-1",
				"test",
				{},
				{
					uid: "regex-global-uid",
					domain: "https://trusted-global.com",
				},
			);
			const sourceWindow = createSourceWindow();

			dispatchMessage(
				serializeMessage(request),
				sourceWindow,
				"https://trusted-global.com",
			);
			dispatchMessage(
				serializeMessage(request),
				sourceWindow,
				"https://trusted-global.com",
			);

			expect(handler).toHaveBeenCalledTimes(2);

			regexMessenger.destroy();
		});

		it("should support wildcard string patterns for trusted domains", () => {
			const wildcardMessenger = new Messenger(
				"wildcard-uid",
				mockWindow,
				"https://consumer.com",
				"https://*.trusted.com",
			);

			const handler = vi.fn().mockReturnValue({ ok: true });
			wildcardMessenger.on("test", handler);

			const request = createRequestMessage(
				"req-1",
				"test",
				{},
				{
					uid: "wildcard-uid",
					domain: "https://api.trusted.com",
				},
			);

			dispatchMessage(
				serializeMessage(request),
				createSourceWindow(),
				"https://api.trusted.com",
			);

			expect(handler).toHaveBeenCalled();

			wildcardMessenger.destroy();
		});

		it("should support mixed string and RegExp patterns in trusted domain arrays", () => {
			const mixedMessenger = new Messenger(
				"mixed-uid",
				mockWindow,
				"https://consumer.com",
				["https://trusted.com", /^https:\/\/.*\.trusted-regex\.com$/],
			);

			const handler = vi.fn().mockReturnValue({ ok: true });
			mixedMessenger.on("test", handler);

			const request = createRequestMessage(
				"req-1",
				"test",
				{},
				{
					uid: "mixed-uid",
					domain: "https://sub.trusted-regex.com",
				},
			);

			dispatchMessage(
				serializeMessage(request),
				createSourceWindow(),
				"https://sub.trusted-regex.com",
			);

			expect(handler).toHaveBeenCalled();

			mixedMessenger.destroy();
		});
	});

	describe("origin pattern rejection", () => {
		it.each([
			{
				pattern: "https://*.trusted.com",
				origin: "https://evil.com",
			},
			{
				pattern: "https://*.trusted.com",
				origin: "https://trusted.com.evil.com",
			},
			{ pattern: "https://*.trusted.com", origin: "https://trusted.com" },
			{
				pattern: "https://*.trusted.com",
				origin: "http://api.trusted.com",
			},
			{ pattern: /^https:\/\/.*\.trusted\.com$/, origin: "https://evil.com" },
			{
				pattern: /^https:\/\/.*\.trusted\.com$/,
				origin: "https://trusted.com.evil.com",
			},
		])("$pattern does not admit $origin", ({ pattern, origin }) => {
			const patternMessenger = new Messenger(
				"pattern-uid",
				mockWindow,
				"https://consumer.com",
				pattern,
			);
			const handler = vi.fn();
			patternMessenger.on("test", handler);
			const sourceWindow = createSourceWindow();
			const request = serializeMessage(
				createRequestMessage(
					"req-1",
					"test",
					{},
					{ uid: "pattern-uid", domain: origin },
				),
			);

			try {
				dispatchMessage(request, sourceWindow, origin);

				expect(handler).not.toHaveBeenCalled();
				expect(sourceWindow.postMessage).not.toHaveBeenCalled();

				// A matching origin with the same request reaches the handler.
				dispatchMessage(request, sourceWindow, "https://api.trusted.com");
				expect(handler).toHaveBeenCalledOnce();
			} finally {
				patternMessenger.destroy();
			}
		});
	});

	describe("destroy", () => {
		it("should remove message listener", () => {
			messenger.destroy();

			expect(mockWindow.removeEventListener).toHaveBeenCalledWith(
				"message",
				expect.any(Function),
			);
		});

		it("should reject all pending requests", async () => {
			vi.useFakeTimers();

			const targetWindow = createSourceWindow();

			const sendPromise = messenger.send(
				targetWindow,
				"https://target.com",
				"test",
			);

			messenger.destroy();

			await expect(sendPromise).rejects.toThrow(
				forgeFrameError("CLOSED", "Messenger destroyed"),
			);
		});

		it("should be idempotent", () => {
			messenger.destroy();
			messenger.destroy();

			// Should only remove listener once
			expect(mockWindow.removeEventListener).toHaveBeenCalledTimes(1);
		});

		it("should stop handling requests and refuse new messages", async () => {
			const handler = vi.fn(() => ({ ok: true }));
			const source = createSourceWindow();
			const targetWindow = createSourceWindow();
			messenger.on("test", handler);
			const request = serializeMessage(
				createRequestMessage(
					"after-destroy",
					"test",
					{},
					{ uid: "test-uid", domain: "https://host.com" },
				),
			);
			dispatchMessage(request, source);
			expect(handler).toHaveBeenCalledOnce();
			await vi.waitFor(() => expect(source.postMessage).toHaveBeenCalledOnce());

			messenger.destroy();
			dispatchMessage(request, source);

			expect(handler).toHaveBeenCalledOnce();
			expect(source.postMessage).toHaveBeenCalledOnce();
			await expect(
				messenger.send(targetWindow, "https://target.com", "test"),
			).rejects.toThrow(
				forgeFrameError("CLOSED", "Messenger has been destroyed"),
			);
			expect(() =>
				messenger.post(targetWindow, "https://target.com", "test"),
			).toThrow(forgeFrameError("CLOSED", "Messenger has been destroyed"));
		});
	});
});
