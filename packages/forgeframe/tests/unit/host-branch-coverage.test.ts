/**
 * Branch coverage tests for `@/core/host` internals.
 *
 * Covers INIT timing branches, init failure reporting, and environment guard paths.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { type MessageHandler, Messenger } from "@/communication/messenger";
import { CONTEXT, MESSAGE_NAME, PROTOCOL_VERSION } from "@/constants";
import {
	clearHostInstance,
	getHost,
	HostComponent,
	initHost,
} from "@/core/host";
import * as hostSecurity from "@/core/host/security";
import { ForgeFrameError } from "@/errors";
import { buildWindowName } from "@/window/name-payload";
import type { WindowNamePayload } from "@/window/types";
import { requireValue } from "../require-value";

type HandlerSource = Parameters<MessageHandler>[1];
type DirectHandler = (data: unknown, source: HandlerSource) => unknown;

const originalWindowName = window.name;

/**
 * Builds current-protocol channel metadata with stable defaults for branch-path tests.
 */
function createPayload(
	overrides: Partial<WindowNamePayload> = {},
): WindowNamePayload {
	return {
		uid: "host-internal-uid",
		tag: "host-internal-component",
		protocolVersion: PROTOCOL_VERSION,
		context: CONTEXT.IFRAME,
		consumerDomain: "https://consumer.example.com",
		...overrides,
	};
}

/**
 * Creates a host instance with a controllable consumer window resolver.
 */
function createHost({
	payload = createPayload(),
	autoInit = false,
	consumerWindow = window,
}: {
	payload?: WindowNamePayload;
	autoInit?: boolean;
	consumerWindow?: Window;
} = {}): HostComponent<Record<string, unknown>> {
	vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
		consumerWindow,
	);

	return new HostComponent(payload, {
		props: "unchecked",
		consumerOrigins: "*",
		autoInit,
	});
}

/**
 * Creates a deferred host and waits for its stubbed bootstrap response.
 */
async function createBootstrappedHost(
	bootstrap: { props: Record<string, unknown> } & Record<string, unknown> = {
		props: { amount: 10 },
	},
): Promise<HostComponent<Record<string, unknown>>> {
	vi.spyOn(Messenger.prototype, "send").mockResolvedValueOnce(bootstrap);
	const host = createHost();
	await host.ready;
	vi.mocked(Messenger.prototype.send).mockRestore();
	return host;
}

function createMessageSource(
	windowRef: Window,
	domain = "https://consumer.example.com",
): HandlerSource {
	return {
		uid: "consumer-source",
		domain,
		window: windowRef,
	};
}

afterEach(() => {
	clearHostInstance();
	vi.restoreAllMocks();
	window.name = originalWindowName;
});

describe("Host branch coverage and edge paths", () => {
	it("sends INIT after the bootstrap by default", async () => {
		const sendSpy = vi
			.spyOn(Messenger.prototype, "send")
			.mockResolvedValueOnce({ props: {} })
			.mockResolvedValue(undefined);

		await createHost({ autoInit: true }).ready;

		await vi.waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(2));
		const [bootstrapCall, initCall] = sendSpy.mock.calls;
		const [targetWindow, targetOrigin, name, data] =
			requireValue(bootstrapCall);
		expect([targetWindow, targetOrigin, name]).toEqual([
			window,
			window.location.origin,
			MESSAGE_NAME.BOOTSTRAP,
		]);
		const { sessionId } = data as { sessionId: string };
		expect(initCall).toEqual([
			window,
			window.location.origin,
			MESSAGE_NAME.INIT,
			{ sessionId },
			undefined,
			undefined,
		]);
	});

	it.each([
		{ autoInit: true, failure: "an invalid response" },
		{ autoInit: false, failure: "an invalid response" },
		{ autoInit: true, failure: "a failed request" },
		{ autoInit: false, failure: "a failed request" },
	] as const)(
		"reports a bootstrap with $failure once on the error event (autoInit: $autoInit)",
		async ({ autoInit, failure }) => {
			window.name = buildWindowName(createPayload());
			vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);
			const send = vi.spyOn(Messenger.prototype, "send");
			if (failure === "a failed request")
				send.mockRejectedValueOnce(new Error("Consumer did not respond"));
			else send.mockResolvedValueOnce(undefined);
			vi.spyOn(console, "error").mockImplementation(() => {});
			const host = requireValue(
				initHost({ consumerOrigins: window.location.origin, autoInit }),
			);
			const errors: unknown[] = [];
			host.on("error", (payload) => {
				errors.push(payload);
			});
			if (!autoInit) host.init();

			await expect(host.ready).rejects.toThrow();
			await Promise.resolve();

			const reason =
				failure === "a failed request"
					? "Consumer did not respond"
					: "Invalid consumer bootstrap response";
			expect(errors).toHaveLength(1);
			expect(errors[0]).toBeInstanceOf(Error);
			expect(errors[0]).toMatchObject({
				message: `Failed to initialize host component: ${reason}`,
				cause: expect.objectContaining({ message: reason }),
			});
		},
	);

	it("reports INIT delivery failures on the host error event", async () => {
		window.name = buildWindowName(createPayload());
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);
		// The messenger rejects an unacknowledged INIT as CLOSED.
		const error = new ForgeFrameError(
			"CLOSED",
			'Message "forgeframe_init" timed out after 10000ms',
		);
		const sendSpy = vi
			.spyOn(Messenger.prototype, "send")
			.mockResolvedValueOnce({ props: {} })
			.mockRejectedValue(error);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const host = requireValue(
			initHost({ consumerOrigins: window.location.origin, autoInit: false }),
		);
		const errors: unknown[] = [];
		host.on("error", (payload) => {
			errors.push(payload);
		});

		await host.ready;
		host.init();
		await vi.waitFor(() => expect(errors).toHaveLength(1));

		expect(sendSpy).toHaveBeenLastCalledWith(
			window,
			window.location.origin,
			MESSAGE_NAME.INIT,
			{ sessionId: expect.any(String) },
			undefined,
			undefined,
		);
		expect(errors[0]).toBeInstanceOf(ForgeFrameError);
		expect(errors[0]).toMatchObject({
			code: "INIT_TIMEOUT",
			message: expect.stringContaining(
				"Failed to initialize host component: The consumer did not complete the handshake",
			),
			cause: { code: "INIT_TIMEOUT", cause: error },
		});
		expect(consoleSpy).toHaveBeenCalledWith(
			"Failed to send init message:",
			error,
		);
	});

	it("should unsubscribe onProps handlers through the returned function", async () => {
		const host = await createBootstrappedHost();
		const propsHandler = (
			host as unknown as { messenger: { handlers: Map<string, DirectHandler> } }
		).messenger.handlers.get(MESSAGE_NAME.PROPS);
		const onPropsSpy = vi.fn();

		const unsubscribe = host.hostProps.onProps(onPropsSpy);
		unsubscribe();
		requireValue(propsHandler)({ amount: 50 }, createMessageSource(window));

		expect(onPropsSpy).not.toHaveBeenCalled();
	});

	it("should return an empty siblings array when messenger responds with undefined", async () => {
		const host = createHost();
		const sendSpy = vi
			.spyOn(
				(
					host as unknown as {
						messenger: { send: (...args: unknown[]) => Promise<unknown> };
					}
				).messenger,
				"send",
			)
			.mockResolvedValue(undefined);

		const siblings = await host.hostProps.getPeerInstances({
			allTags: true,
		});

		expect(siblings).toEqual([]);
		expect(sendSpy).toHaveBeenCalledWith(
			window,
			window.location.origin,
			MESSAGE_NAME.GET_PEERS,
			{ options: { allTags: true } },
		);
	});

	it("should ignore repeated destroy calls after first cleanup", () => {
		const host = createHost();
		const messengerDestroySpy = vi.spyOn(
			(
				host as unknown as {
					messenger: { destroy: () => void };
				}
			).messenger,
			"destroy",
		);
		const bridgeDestroySpy = vi.spyOn(
			(
				host as unknown as {
					bridge: { destroy: () => void };
				}
			).bridge,
			"destroy",
		);

		host.destroy();
		host.destroy();

		expect(messengerDestroySpy).toHaveBeenCalledTimes(1);
		expect(bridgeDestroySpy).toHaveBeenCalledTimes(1);
	});

	it("should return null when initHost is called outside ForgeFrame context", () => {
		window.name = "standalone-window";

		const host = initHost({ consumerOrigins: "*" });

		expect(host).toBeNull();
	});

	it("should fail soft when consumer window cannot be resolved", () => {
		window.name = buildWindowName(createPayload());
		const addEventListenerSpy = vi.spyOn(window, "addEventListener");
		const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockImplementation(() => {
			throw new ForgeFrameError("CLOSED", "Could not resolve consumer window");
		});

		const host = initHost({ consumerOrigins: "*" });
		const messageAddCount = addEventListenerSpy.mock.calls.filter(
			([eventName]) => eventName === "message",
		).length;
		const messageRemoveCount = removeEventListenerSpy.mock.calls.filter(
			([eventName]) => eventName === "message",
		).length;

		expect(host).toBeNull();
		expect(getHost()).toBeNull();
		expect(messageAddCount).toBe(0);
		expect(messageRemoveCount).toBe(messageAddCount);
	});

	it("should rethrow unexpected errors while looking for an older payload's consumer", () => {
		window.name = buildWindowName({
			...createPayload(),
			protocolVersion: PROTOCOL_VERSION - 1,
		});
		const unexpected = new Error("Window access failed");
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockImplementation(() => {
			throw unexpected;
		});

		expect(() => initHost({ consumerOrigins: "*" })).toThrow(unexpected);
		expect(getHost()).toBeNull();
	});

	it("should log and return null when ForgeFrame payload parsing fails", () => {
		window.name = "__forgeframe__not-valid-base64";
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const host = initHost({ consumerOrigins: "*" });

		expect(host).toBeNull();
		expect(consoleSpy).toHaveBeenCalledWith(
			"Failed to parse ForgeFrame payload from window.name",
		);
	});

	it("should expose active instance through getHost()", () => {
		const payload = createPayload({
			uid: "get-host-uid",
			tag: "get-host-component",
		});
		window.name = buildWindowName(payload);
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		const host = initHost({ consumerOrigins: "*", autoInit: false });

		expect(host).not.toBeNull();
		expect(getHost()?.hostProps).toBe(host?.hostProps);
	});
});
