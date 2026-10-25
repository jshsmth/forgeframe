/**
 * Branch coverage tests for `@/core/host` internals.
 *
 * Covers deferred init branches, hostProps fallback behavior, init failure capture, and environment guard paths.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { type MessageHandler, Messenger } from "@/communication/messenger";
import { CONTEXT, EVENT, MESSAGE_NAME, PROTOCOL_VERSION } from "@/constants";
import {
	clearHostInstance,
	getHost,
	HostComponent,
	initHost,
	isEmbedded,
} from "@/core/host";
import * as hostSecurity from "@/core/host/security";
import * as namePayload from "@/window/name-payload";
import { buildWindowName } from "@/window/name-payload";
import type { HostComponentRef, WindowNamePayload } from "@/window/types";
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
	deferInit = true,
	consumerWindow = window,
}: {
	payload?: WindowNamePayload;
	deferInit?: boolean;
	consumerWindow?: Window;
} = {}): HostComponent<Record<string, unknown>> {
	vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
		consumerWindow,
	);

	return new HostComponent(payload, {}, undefined, deferInit);
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
	delete (window as unknown as { hostProps?: unknown }).hostProps;
});

describe("Host branch coverage and edge paths", () => {
	it("should flush init in constructor when deferInit is false", async () => {
		const sendSpy = vi
			.spyOn(Messenger.prototype, "send")
			.mockResolvedValueOnce({ props: {} })
			.mockResolvedValue(undefined);

		await createHost({ deferInit: false }).ready;

		await vi.waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(2));
		const [bootstrapCall, initCall] = sendSpy.mock.calls;
		const [targetWindow, targetDomain, name, data] =
			requireValue(bootstrapCall);
		expect([targetWindow, targetDomain, name]).toEqual([
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

	it("should only flush deferred init once when hostProps is accessed repeatedly in the same tick", async () => {
		const host = await createBootstrappedHost();
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

		void (window as unknown as { hostProps?: unknown }).hostProps;
		void (window as unknown as { hostProps?: unknown }).hostProps;

		await vi.waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(1));
		await Promise.resolve();
		expect(sendSpy).toHaveBeenCalledTimes(1);
	});

	it("should update internal hostProps when window.hostProps is set", () => {
		const host = createHost();
		const replacement = {
			...host.hostProps,
			amount: 77,
		};

		(
			window as unknown as {
				hostProps: typeof replacement;
			}
		).hostProps = replacement;

		expect(host.getProps()).toBe(replacement);
		expect(host.getProps().amount).toBe(77);
	});

	it("should fall back to direct hostProps assignment when defineProperty fails", () => {
		const originalDefineProperty = Object.defineProperty;
		vi.spyOn(Object, "defineProperty").mockImplementation((obj, key, attrs) => {
			if (obj === window && key === "hostProps") {
				throw new Error("Cannot define hostProps");
			}
			return originalDefineProperty(obj, key, attrs as PropertyDescriptor);
		});

		const host = createHost();
		const exposedProps = (window as unknown as { hostProps?: unknown })
			.hostProps;

		expect(exposedProps).toBeDefined();
		expect(exposedProps).toBe(host.hostProps);
	});

	it("should capture init failures and expose init error state", async () => {
		const host = await createBootstrappedHost();
		const error = new Error("init send failed");
		const sendSpy = vi
			.spyOn(
				(
					host as unknown as {
						messenger: { send: (...args: unknown[]) => Promise<unknown> };
					}
				).messenger,
				"send",
			)
			.mockRejectedValue(error);
		const eventSpy = vi.spyOn(host.event, "emit");
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		host.flushInit();
		await vi.waitFor(() => expect(host.getInitError()).toBe(error));

		expect(sendSpy).toHaveBeenCalledWith(
			window,
			window.location.origin,
			MESSAGE_NAME.INIT,
			{ sessionId: expect.any(String) },
			undefined,
			undefined,
		);
		expect(eventSpy).toHaveBeenCalledWith(
			EVENT.ERROR,
			expect.objectContaining({
				type: "init_failed",
				error,
			}),
		);
		expect(host.getInitError()).toBe(error);
		expect(consoleSpy).toHaveBeenCalledWith(
			"Failed to send init message:",
			error,
		);
	});

	it("should unsubscribe onProps handlers when cancel is called", async () => {
		const host = await createBootstrappedHost();
		const propsHandler = (
			host as unknown as { messenger: { handlers: Map<string, DirectHandler> } }
		).messenger.handlers.get(MESSAGE_NAME.PROPS);
		const onPropsSpy = vi.fn();

		const subscription = host.hostProps.onProps(onPropsSpy);
		subscription.cancel();
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
			anyConsumer: true,
		});

		expect(siblings).toEqual([]);
		expect(sendSpy).toHaveBeenCalledWith(
			window,
			window.location.origin,
			MESSAGE_NAME.GET_SIBLINGS,
			{ options: { anyConsumer: true } },
		);
	});

	it("should warn and skip nested components that fail creation", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const invalidChildren: Record<string, HostComponentRef> = {
			BrokenChild: {
				tag: "InvalidTag",
				url: "https://host.example.com/broken",
			},
		};

		const host = await createBootstrappedHost({
			props: {},
			children: invalidChildren,
		});

		expect(host.hostProps.children).toBeUndefined();
		expect(warnSpy).toHaveBeenCalledWith(
			'Nested component "BrokenChild" (InvalidTag) must be registered in the host bundle before hostProps is initialized',
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

		const host = initHost();

		expect(host).toBeNull();
	});

	it("should fail soft when consumer window cannot be resolved", () => {
		window.name = buildWindowName(createPayload());
		const addEventListenerSpy = vi.spyOn(window, "addEventListener");
		const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockImplementation(() => {
			throw new Error("Could not resolve consumer window");
		});

		const host = initHost();
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

	it("should log and return null when ForgeFrame payload parsing fails", () => {
		window.name = "__forgeframe__not-valid-base64";
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const host = initHost();

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

		const host = initHost(undefined, undefined, { deferInit: true });

		expect(host).not.toBeNull();
		expect(getHost()).toBe(host);
	});

	it("should delegate isEmbedded() to ForgeFrame window detection", () => {
		vi.spyOn(namePayload, "isForgeFrameWindow").mockReturnValue(true);
		expect(isEmbedded()).toBe(true);
	});
});
