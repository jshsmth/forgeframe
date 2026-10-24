/**
 * Unit tests for `@/core/host/transport`.
 *
 * Covers trusted-domain updates, deferred init scheduling guards, init failure
 * normalization, props handler filtering, and idempotent teardown behavior.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTEXT, EVENT, MESSAGE_NAME } from "@/constants";
import { HostTransport } from "@/core/host/transport";
import type { HostTransportOptions } from "@/core/host/types";
import { EventEmitter } from "@/events/emitter";
import { createDeferred } from "@/utils/promise";
import { requireValue } from "../require-value";

type PropsHandlerSource = {
	uid: string;
	domain: string;
	window: Window;
};

const createdTransports: HostTransport[] = [];

function createTransport({
	uid = "host-transport-uid",
	tag = "host-transport-component",
	context = CONTEXT.IFRAME,
	consumerDomain = "https://consumer.example.com",
	getConsumerDomain,
	deferInit = true,
	beforeInit,
	consumerWindow = { postMessage: vi.fn() } as unknown as Window,
}: Partial<HostTransportOptions> = {}) {
	const event = new EventEmitter();
	const options: HostTransportOptions = {
		uid,
		tag,
		context,
		event,
		consumerWindow,
		consumerDomain,
		getConsumerDomain: getConsumerDomain ?? (() => consumerDomain),
		deferInit,
		beforeInit,
	};

	const transport = new HostTransport(options);
	createdTransports.push(transport);

	return { transport, event, consumerWindow };
}

function getPropsHandler(transport: HostTransport) {
	return (
		transport.messenger as unknown as {
			handlers: Map<
				string,
				(data: unknown, source: PropsHandlerSource) => unknown
			>;
		}
	).handlers.get(MESSAGE_NAME.PROPS);
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

afterEach(() => {
	while (createdTransports.length > 0) {
		requireValue(createdTransports.pop()).destroy();
	}
	vi.restoreAllMocks();
});

describe("HostTransport", () => {
	it("acknowledges validated PROPS while bootstrap is pending to avoid a queue dependency cycle", async () => {
		const ready = createDeferred<void>();
		const { transport, consumerWindow } = createTransport({
			beforeInit: () => ready.promise,
		});
		const applySerializedProps = vi.fn(() => ({ success: true as const }));
		transport.registerPropsHandler({
			isConsumerSource: (source) => source.window === consumerWindow,
			applySerializedProps,
		});
		const response = Promise.resolve(
			getPropsHandler(transport)?.(
				{ amount: 42 },
				{
					uid: "host-transport-uid",
					domain: "https://consumer.example.com",
					window: consumerWindow,
				},
			),
		);
		expect(applySerializedProps).toHaveBeenCalledWith({ amount: 42 });
		await expect(response).resolves.toEqual({ success: true });
		ready.resolve();
	});

	it("should reject untrusted prop sources and apply serialized props for the consumer source", () => {
		const { transport, consumerWindow } = createTransport();
		const isConsumerSource = vi.fn(
			(source: PropsHandlerSource) => source.window === consumerWindow,
		);
		const applySerializedProps = vi.fn(() => ({ success: true as const }));

		transport.registerPropsHandler({
			isConsumerSource,
			applySerializedProps,
		});

		const handler = getPropsHandler(transport);
		const foreignWindow = { postMessage: vi.fn() } as unknown as Window;
		const payload = { amount: 42 };

		expect(
			handler?.(payload, {
				uid: "foreign",
				domain: "https://evil.example.com",
				window: foreignWindow,
			}),
		).toEqual({ success: false });
		expect(applySerializedProps).not.toHaveBeenCalled();
		expect(
			handler?.(payload, {
				uid: "navigated",
				domain: window.location.origin,
				window: consumerWindow,
			}),
		).toEqual({ success: false });
		expect(applySerializedProps).not.toHaveBeenCalled();

		expect(
			handler?.(payload, {
				uid: "trusted",
				domain: "https://consumer.example.com",
				window: consumerWindow,
			}),
		).toEqual({ success: true });
		expect(applySerializedProps).toHaveBeenCalledWith(payload);
	});

	it("should update trusted consumer domains only when the previous domain changes", () => {
		const { transport } = createTransport();
		const removeSpy = vi.spyOn(transport.messenger, "removeTrustedDomain");
		const addSpy = vi.spyOn(transport.messenger, "addTrustedDomain");

		transport.updateTrustedConsumerDomain("", "https://next.example.com");
		transport.updateTrustedConsumerDomain(
			"https://same.example.com",
			"https://same.example.com",
		);

		expect(removeSpy).not.toHaveBeenCalled();
		expect(addSpy).not.toHaveBeenCalled();

		transport.updateTrustedConsumerDomain(
			"https://old.example.com",
			"https://new.example.com",
		);

		expect(removeSpy).toHaveBeenCalledTimes(1);
		expect(removeSpy).toHaveBeenCalledWith("https://old.example.com");
		expect(addSpy).toHaveBeenCalledTimes(1);
		expect(addSpy).toHaveBeenCalledWith("https://new.example.com");
	});

	it("should schedule deferred init once and avoid resending after init has flushed", async () => {
		const { transport, consumerWindow } = createTransport({ deferInit: true });
		const sendSpy = vi
			.spyOn(transport.messenger, "send")
			.mockResolvedValue(undefined);

		transport.handleHostPropsAccess();
		transport.handleHostPropsAccess();

		await flushMicrotasks();

		expect(sendSpy).toHaveBeenCalledTimes(1);
		expect(sendSpy).toHaveBeenCalledWith(
			consumerWindow,
			"https://consumer.example.com",
			MESSAGE_NAME.INIT,
			{
				uid: "host-transport-uid",
				tag: "host-transport-component",
			},
			undefined,
			undefined,
		);

		transport.handleHostPropsAccess();
		await flushMicrotasks();

		expect(sendSpy).toHaveBeenCalledTimes(1);
		expect(transport.getInitError()).toBeNull();
	});

	it("should not schedule deferred init when deferInit is disabled or after destroy", async () => {
		const immediate = createTransport({ deferInit: false });
		const immediateSendSpy = vi
			.spyOn(immediate.transport.messenger, "send")
			.mockResolvedValue(undefined);

		immediate.transport.handleHostPropsAccess();
		await flushMicrotasks();

		expect(immediateSendSpy).not.toHaveBeenCalled();

		const destroyed = createTransport({ deferInit: true });
		const destroyedSendSpy = vi
			.spyOn(destroyed.transport.messenger, "send")
			.mockResolvedValue(undefined);

		destroyed.transport.handleHostPropsAccess();
		destroyed.transport.destroy();

		await flushMicrotasks();

		expect(destroyedSendSpy).not.toHaveBeenCalled();
	});

	it("does not report an INIT rejected by routine teardown as a failure", async () => {
		const pendingSend = createDeferred<unknown>();
		const { transport, event } = createTransport();
		vi.spyOn(transport.messenger, "send").mockReturnValue(pendingSend.promise);
		const emitSpy = vi.spyOn(event, "emit");
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		transport.flushInit();
		transport.destroy();
		pendingSend.reject(new Error("Messenger destroyed"));
		await flushMicrotasks();

		expect(consoleSpy).not.toHaveBeenCalled();
		expect(emitSpy).not.toHaveBeenCalledWith(EVENT.ERROR, expect.anything());
		expect(transport.getInitError()).toBeNull();
	});

	it("resolves focus() once the window receives focus, or after a bounded wait", async () => {
		const { transport } = createTransport();
		vi.spyOn(transport.messenger, "send").mockResolvedValue(undefined);
		const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			let focused = false;
			const delivered = transport.focus().then(() => {
				focused = true;
			});
			await flushMicrotasks();
			expect(focused).toBe(false);
			window.dispatchEvent(new FocusEvent("focus"));
			await delivered;

			focused = false;
			const bounded = transport.focus().then(() => {
				focused = true;
			});
			await flushMicrotasks();
			expect(focused).toBe(false);
			await vi.advanceTimersByTimeAsync(500);
			await bounded;

			hasFocus.mockReturnValue(true);
			await transport.focus();
		} finally {
			vi.useRealTimers();
		}
	});

	it("resolves focus() without waiting when the consumer page reports no focus", async () => {
		const { transport } = createTransport();
		vi.spyOn(transport.messenger, "send").mockResolvedValue({
			success: true,
			focused: false,
		});
		vi.spyOn(document, "hasFocus").mockReturnValue(false);
		const waited = vi.spyOn(window, "addEventListener");

		await transport.focus();
		expect(waited).not.toHaveBeenCalledWith("focus", expect.any(Function));
	});

	it("should normalize non-Error init failures, emit lifecycle errors, and log the original value", async () => {
		const { transport, event } = createTransport();
		const sendSpy = vi
			.spyOn(transport.messenger, "send")
			.mockRejectedValue("init send failed");
		const emitSpy = vi.spyOn(event, "emit");
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		transport.flushInit();
		await flushMicrotasks();

		expect(sendSpy).toHaveBeenCalledTimes(1);
		expect(transport.getInitError()).toBeInstanceOf(Error);
		expect(transport.getInitError()?.message).toBe("init send failed");
		expect(emitSpy).toHaveBeenCalledWith(
			EVENT.ERROR,
			expect.objectContaining({
				type: "init_failed",
				message: "Failed to initialize host component: init send failed",
				error: expect.any(Error),
			}),
		);
		expect(consoleSpy).toHaveBeenCalledWith(
			"Failed to send init message:",
			"init send failed",
		);
	});

	it("should return sibling results from the messenger and fall back to an empty array", async () => {
		let activeDomain = "https://consumer.example.com";
		const { transport, consumerWindow } = createTransport({
			getConsumerDomain: () => activeDomain,
		});
		const sendSpy = vi.spyOn(transport.messenger, "send");

		sendSpy.mockResolvedValueOnce([
			{ uid: "peer-1", tag: "host-transport-component", open: true },
		]);

		await expect(
			transport.getPeerInstances({ anyConsumer: true }),
		).resolves.toEqual([
			{ uid: "peer-1", tag: "host-transport-component", open: true },
		]);

		expect(sendSpy).toHaveBeenLastCalledWith(
			consumerWindow,
			"https://consumer.example.com",
			MESSAGE_NAME.GET_SIBLINGS,
			{
				uid: "host-transport-uid",
				tag: "host-transport-component",
				options: { anyConsumer: true },
			},
		);

		activeDomain = "https://updated.example.com";
		sendSpy.mockResolvedValueOnce(undefined);

		await expect(transport.getPeerInstances()).resolves.toEqual([]);
		expect(sendSpy).toHaveBeenLastCalledWith(
			consumerWindow,
			"https://updated.example.com",
			MESSAGE_NAME.GET_SIBLINGS,
			{
				uid: "host-transport-uid",
				tag: "host-transport-component",
				options: undefined,
			},
		);
	});

	it("should serialize overlapping function export batches in call order", async () => {
		const { transport } = createTransport();
		const firstSend = createDeferred<void>();
		const secondSend = createDeferred<void>();
		const sendSpy = vi.spyOn(transport.messenger, "send");
		sendSpy
			.mockImplementationOnce(() => firstSend.promise)
			.mockImplementationOnce(() => secondSend.promise);

		const firstExport = transport.exportData({ first: () => "first" });
		const secondExport = transport.exportData({ second: () => "second" });
		await flushMicrotasks();

		expect(sendSpy).toHaveBeenCalledTimes(1);
		expect(sendSpy.mock.calls[0]?.[2]).toBe(MESSAGE_NAME.EXPORT);

		firstSend.resolve();
		await firstExport;
		await flushMicrotasks();

		expect(sendSpy).toHaveBeenCalledTimes(2);
		expect(sendSpy.mock.calls[1]?.[2]).toBe(MESSAGE_NAME.EXPORT);

		secondSend.resolve();
		await expect(secondExport).resolves.toBeUndefined();
	});

	it("should continue queued exports after an earlier export fails", async () => {
		const { transport } = createTransport();
		const sendSpy = vi.spyOn(transport.messenger, "send");
		sendSpy
			.mockRejectedValueOnce(new Error("first export failed"))
			.mockResolvedValueOnce(undefined);

		const firstExport = transport.exportData({ first: () => "first" });
		const secondExport = transport.exportData({ second: () => "second" });

		await expect(firstExport).rejects.toThrow("first export failed");
		await expect(secondExport).resolves.toBeUndefined();
		expect(sendSpy).toHaveBeenCalledTimes(2);
	});

	it("should destroy the messenger and bridge only once", () => {
		const { transport } = createTransport();
		const messengerDestroySpy = vi.spyOn(transport.messenger, "destroy");
		const bridgeDestroySpy = vi.spyOn(transport.bridge, "destroy");

		transport.destroy();
		transport.destroy();

		expect(messengerDestroySpy).toHaveBeenCalledTimes(1);
		expect(bridgeDestroySpy).toHaveBeenCalledTimes(1);
	});
});
