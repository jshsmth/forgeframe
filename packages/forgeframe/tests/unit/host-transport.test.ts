/**
 * Unit tests for `@/core/host/transport`.
 *
 * Covers deferred init scheduling guards, the INIT and GET_PEERS wire shapes,
 * init failure normalization, props handler filtering, and idempotent teardown.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTEXT, MESSAGE_NAME } from "@/constants";
import { HostTransport } from "@/core/host/transport";
import type { HostTransportOptions } from "@/core/host/types";
import { EventEmitter } from "@/events/emitter";
import type { HostEvents } from "@/types";
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
	context = CONTEXT.IFRAME,
	consumerOrigin = "https://consumer.example.com",
	getConsumerOrigin,
	beforeInit = () => Promise.resolve(),
	consumerWindow = { postMessage: vi.fn() } as unknown as Window,
}: Partial<HostTransportOptions> = {}) {
	const event = new EventEmitter<HostEvents>();
	const options: HostTransportOptions = {
		uid,
		context,
		event,
		consumerWindow,
		consumerOrigin,
		getConsumerOrigin: getConsumerOrigin ?? (() => consumerOrigin),
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

	it("sends INIT once, after bootstrap settles, and never after destroy", async () => {
		const bootstrap = createDeferred<void>();
		const { transport, consumerWindow } = createTransport({
			beforeInit: () => bootstrap.promise,
		});
		const sendSpy = vi
			.spyOn(transport.messenger, "send")
			.mockResolvedValue(undefined);

		transport.sendInitOnce();
		transport.sendInitOnce();
		await flushMicrotasks();
		expect(sendSpy).not.toHaveBeenCalled();

		bootstrap.resolve();
		await vi.waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(1));
		expect(sendSpy).toHaveBeenCalledWith(
			consumerWindow,
			"https://consumer.example.com",
			MESSAGE_NAME.INIT,
			{ sessionId: expect.any(String) },
			undefined,
			undefined,
		);

		const destroyed = createTransport();
		const destroyedSendSpy = vi
			.spyOn(destroyed.transport.messenger, "send")
			.mockResolvedValue(undefined);
		destroyed.transport.destroy();
		destroyed.transport.sendInitOnce();
		await flushMicrotasks();

		expect(destroyedSendSpy).not.toHaveBeenCalled();
	});

	it("does not report an INIT rejected by routine teardown as a failure", async () => {
		const pendingSend = createDeferred<unknown>();
		const { transport, event } = createTransport();
		const sendSpy = vi
			.spyOn(transport.messenger, "send")
			.mockReturnValue(pendingSend.promise);
		const onError = vi.fn();
		event.on("error", onError);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		transport.sendInitOnce();
		await vi.waitFor(() => expect(sendSpy).toHaveBeenCalledOnce());
		transport.destroy();
		pendingSend.reject(new Error("Messenger destroyed"));
		await flushMicrotasks();

		expect(consoleSpy).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
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
		const errors: Error[] = [];
		event.on("error", (error) => {
			errors.push(error);
		});
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		transport.sendInitOnce();
		await vi.waitFor(() => expect(errors).toHaveLength(1));

		expect(sendSpy).toHaveBeenCalledTimes(1);
		expect(errors[0]).toBeInstanceOf(Error);
		expect(errors[0]).toMatchObject({
			message: "Failed to initialize host component: init send failed",
			cause: expect.objectContaining({ message: "init send failed" }),
		});
		expect(consoleSpy).toHaveBeenCalledWith(
			"Failed to send init message:",
			"init send failed",
		);
	});

	it("should return sibling results from the messenger and fall back to an empty array", async () => {
		let activeDomain = "https://consumer.example.com";
		const { transport, consumerWindow } = createTransport({
			getConsumerOrigin: () => activeDomain,
		});
		const sendSpy = vi.spyOn(transport.messenger, "send");

		sendSpy.mockResolvedValueOnce([
			{ uid: "peer-1", tag: "host-transport-component", open: true },
		]);

		await expect(
			transport.getPeerInstances({ allTags: true }),
		).resolves.toEqual([
			{ uid: "peer-1", tag: "host-transport-component", open: true },
		]);

		expect(sendSpy).toHaveBeenLastCalledWith(
			consumerWindow,
			"https://consumer.example.com",
			MESSAGE_NAME.GET_PEERS,
			{ options: { allTags: true } },
		);

		activeDomain = "https://updated.example.com";
		sendSpy.mockResolvedValueOnce(undefined);

		await expect(transport.getPeerInstances()).resolves.toEqual([]);
		expect(sendSpy).toHaveBeenLastCalledWith(
			consumerWindow,
			"https://updated.example.com",
			MESSAGE_NAME.GET_PEERS,
			{ options: undefined },
		);
	});

	it.each([
		[
			{ anyConsumer: true },
			'getPeerInstances() option "anyConsumer" was renamed. Use { allTags: true } to include other component tags.',
		],
		[{ allTags: "yes" }, "getPeerInstances() allTags must be a boolean"],
		[null, "getPeerInstances() options must be an object"],
	])(
		"rejects invalid peer options %j before sending",
		async (options, message) => {
			const { transport } = createTransport();
			const sendSpy = vi.spyOn(transport.messenger, "send");

			await expect(
				transport.getPeerInstances(options as never),
			).rejects.toThrow(message);
			expect(sendSpy).not.toHaveBeenCalled();
		},
	);

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
