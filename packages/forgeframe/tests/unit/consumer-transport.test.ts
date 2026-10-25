/**
 * Unit tests for `@/core/consumer/transport`.
 *
 * Covers consumer-side trust rotation, host-domain selection, function-bridge
 * cleanup across failed updates, wait-for-host races, and the bootstrap/INIT
 * handshake.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTEXT, MESSAGE_NAME } from "@/constants";
import type { ConsumerTransportHandlers } from "@/core/consumer/transport";
import { ConsumerTransport } from "@/core/consumer/transport";
import type { NormalizedOptions } from "@/core/consumer/types";
import { prop } from "@/props/prop";
import type { Dimensions, SiblingInfo } from "@/types";
import { createDeferred } from "@/utils/promise";
import { requireValue } from "../require-value";

type TestProps = {
	onReady?: () => void;
	payload?: Record<string, unknown>;
};

type HandlerSource = {
	uid: string;
	domain: string;
	window: Window;
};

type DirectHandler = (data: unknown, source: HandlerSource) => unknown;

const createdTransports: Array<
	ConsumerTransport<TestProps, { ready: boolean }>
> = [];

function createOptions(
	overrides: Partial<NormalizedOptions<TestProps>> = {},
): NormalizedOptions<TestProps> {
	return {
		tag: "consumer-transport-component",
		url: "https://host.example.com/widget",
		props: {
			onReady: { schema: prop.function().optional() },
			payload: { schema: prop.object().optional() },
		},
		defaultContext: CONTEXT.IFRAME,
		dimensions: { width: 320, height: 240 },
		timeout: 50,
		...overrides,
	};
}

function createTransport({
	options = createOptions(),
	resolveUrl = () => "https://host.example.com/widget",
	resolveUrlOrigin = (url: string) =>
		new URL(url, window.location.origin).origin,
}: {
	options?: NormalizedOptions<TestProps>;
	resolveUrl?: () => string;
	resolveUrlOrigin?: (url: string) => string;
} = {}) {
	const transport = new ConsumerTransport<TestProps, { ready: boolean }>(
		"consumer-transport-uid",
		options,
		resolveUrl,
		resolveUrlOrigin,
	);
	createdTransports.push(transport);
	return transport;
}

function getHandler(
	transport: ConsumerTransport<TestProps, { ready: boolean }>,
	name: string,
): DirectHandler | undefined {
	return (
		transport.messenger as unknown as {
			handlers: Map<string, DirectHandler>;
		}
	).handlers.get(name);
}

/** Attaches host content the way open() does: the opened origin is recorded first. */
function attachOpenedHost(
	transport: ConsumerTransport<TestProps, { ready: boolean }>,
	hostWindow: Window,
	origin = "https://host.example.com",
): void {
	transport.openedHostDomain = origin;
	transport.attachHostWindow(hostWindow);
}

/** Invokes a consumer callback the way the host does, through the bridge's CALL handler. */
function callConsumerCallback(
	transport: ConsumerTransport<TestProps, { ready: boolean }>,
	id: string,
	source: HandlerSource,
): unknown {
	return requireValue(getHandler(transport, MESSAGE_NAME.CALL))(
		{ id, args: [] },
		source,
	);
}

/** A replace batch that cannot admit a new callback means the recovery pool is full. */
function expectRecoveryPoolFull(
	transport: ConsumerTransport<TestProps, { ready: boolean }>,
): void {
	transport.bridge.startBatch();
	expect(() => transport.bridge.serialize(() => "probe")).toThrow(
		"recovery pool is full",
	);
	transport.bridge.abortBatch();
}

function createHandlers() {
	return {
		onBootstrap: vi.fn(async () => ({ props: {} })),
		onReconnect: vi.fn(),
		onClose: vi.fn(async () => {}),
		onResize: vi.fn(async (_dimensions: Dimensions) => {}),
		onFocus: vi.fn(async () => {}),
		onShow: vi.fn(async () => {}),
		onHide: vi.fn(async () => {}),
		onError: vi.fn((_error: Error) => {}),
		onExport: vi.fn((_exports: unknown) => {}),
		onConsumerExport: vi.fn((_data: unknown) => {}),
		onGetSiblings: vi.fn(async (_request): Promise<SiblingInfo[]> => []),
	} satisfies ConsumerTransportHandlers<{ ready: boolean }>;
}

afterEach(() => {
	while (createdTransports.length > 0) {
		requireValue(createdTransports.pop()).destroy();
	}
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("ConsumerTransport", () => {
	it("withholds bootstrap from other windows and origins, including the consumer's own origin", async () => {
		const transport = createTransport();
		const hostWindow = { postMessage: vi.fn() } as unknown as Window;
		attachOpenedHost(transport, hostWindow);
		const onBootstrap = vi.fn(async () => ({ props: { secret: "private" } }));
		transport.setupMessageHandlers({ ...createHandlers(), onBootstrap });
		const handler = getHandler(transport, MESSAGE_NAME.BOOTSTRAP);
		if (!handler) throw new Error("Missing bootstrap handler");
		const request = { sessionId: "session" };
		expect(
			await handler(request, {
				uid: "consumer-transport-uid",
				domain: window.location.origin,
				window: hostWindow,
			}),
		).toEqual({ success: false });
		expect(
			await handler(request, {
				uid: "consumer-transport-uid",
				domain: "https://host.example.com",
				window,
			}),
		).toEqual({ success: false });
		expect(onBootstrap).not.toHaveBeenCalled();
		expect(
			await handler(request, {
				uid: "consumer-transport-uid",
				domain: "https://host.example.com",
				window: hostWindow,
			}),
		).toEqual({ props: { secret: "private" } });
	});

	it("releases a full recovery pool only for a verified new bootstrap session", async () => {
		const transport = createTransport();
		const hostWindow = { postMessage: vi.fn() } as unknown as Window;
		attachOpenedHost(transport, hostWindow);
		let rejectBootstrap = false;
		const onBootstrap = async (
			_source: HandlerSource,
			resetLocalReferences: boolean,
		) => {
			if (rejectBootstrap) throw new Error("bootstrap normalization failed");
			return {
				props: transport.serializePropsForHost(
					{
						payload: Object.fromEntries(
							Array.from({ length: 500 }, (_, index) => [
								`c${index}`,
								() => index,
							]),
						),
					},
					createOptions().props,
					{ resetLocalReferences },
				),
			};
		};
		transport.setupMessageHandlers({ ...createHandlers(), onBootstrap });
		const bootstrap = getHandler(transport, MESSAGE_NAME.BOOTSTRAP);
		if (!bootstrap) throw new Error("Missing bootstrap handler");
		const source = {
			uid: "consumer-transport-uid",
			domain: "https://host.example.com",
			window: hostWindow,
		};
		await bootstrap({ sessionId: "first" }, source);
		transport.bridge.startBatch();
		const retained = Array.from({ length: 500 }, (_, index) =>
			transport.bridge.serialize(() => index),
		);
		transport.bridge.finishBatch(true);
		expectRecoveryPoolFull(transport);
		await bootstrap({ sessionId: "spoofed" }, { ...source, window });
		expectRecoveryPoolFull(transport);
		rejectBootstrap = true;
		await expect(bootstrap({ sessionId: "second" }, source)).rejects.toThrow(
			"bootstrap normalization failed",
		);
		expectRecoveryPoolFull(transport);
		await expect(
			callConsumerCallback(transport, requireValue(retained[0]).__id__, source),
		).resolves.toBe(0);
		rejectBootstrap = false;
		await bootstrap({ sessionId: "second" }, source);
		await expect(
			callConsumerCallback(transport, requireValue(retained[0]).__id__, source),
		).rejects.toThrow("not found");
		transport.bridge.startBatch();
		expect(() => transport.bridge.serialize(() => "admitted")).not.toThrow();
		transport.bridge.abortBatch();
	});

	it("requires INIT to match the latest verified bootstrap session", async () => {
		const transport = createTransport();
		const hostWindow = { postMessage: vi.fn() } as unknown as Window;
		attachOpenedHost(transport, hostWindow);
		transport.setupMessageHandlers({
			...createHandlers(),
			onBootstrap: async () => ({ props: {} }),
		});
		const source = {
			uid: "consumer-transport-uid",
			domain: "https://host.example.com",
			window: hostWindow,
		};
		const init = getHandler(transport, MESSAGE_NAME.INIT);
		const bootstrap = getHandler(transport, MESSAGE_NAME.BOOTSTRAP);
		if (!init || !bootstrap) throw new Error("Missing handshake handlers");
		expect(await init({}, source)).toEqual({ success: false });
		await bootstrap({ sessionId: "first" }, source);
		await bootstrap({ sessionId: "second" }, source);
		expect(await init({ sessionId: "first" }, source)).toEqual({
			success: false,
		});
		expect(transport.hostInitialized).toBe(false);
		expect(await init({ sessionId: "second" }, source)).toEqual({
			success: true,
		});
		expect(transport.hostInitialized).toBe(true);
	});

	it("should prefer the verified active origin after host initialization", () => {
		const transport = createTransport();
		transport.openedHostDomain = "https://host.example.com";
		transport.activeHostDomain = "https://redirected-host.example.com";

		expect(transport.getHostDomain()).toBe(
			"https://redirected-host.example.com",
		);

		transport.activeHostDomain = null;
		expect(transport.getHostDomain()).toBe("https://host.example.com");
	});

	it("should rely exclusively on an explicit domain policy when configured", () => {
		const transport = createTransport({
			options: createOptions({
				domain: ["https://explicit.example.com"],
			}),
			resolveUrl: () => "https://dynamic-old.example.com/widget",
		});
		const removeSpy = vi.spyOn(transport.messenger, "removeTrustedDomain");
		const addSpy = vi.spyOn(transport.messenger, "addTrustedDomain");

		transport.syncTrustedDomainForUrl(
			"https://dynamic-next.example.com/widget",
		);

		expect(removeSpy).not.toHaveBeenCalled();
		expect(addSpy).not.toHaveBeenCalled();
		expect(transport.dynamicUrlTrustedOrigin).toBe(
			"https://dynamic-next.example.com",
		);

		removeSpy.mockClear();
		addSpy.mockClear();
		transport.dynamicUrlTrustedOrigin = "https://explicit.example.com";

		transport.syncTrustedDomainForUrl(
			"https://dynamic-final.example.com/widget",
		);

		expect(removeSpy).not.toHaveBeenCalled();
		expect(addSpy).not.toHaveBeenCalled();
		expect(transport.dynamicUrlTrustedOrigin).toBe(
			"https://dynamic-final.example.com",
		);
	});

	it("should retain both callback snapshots after a props delivery attempt fails", async () => {
		const transport = createTransport();
		attachOpenedHost(transport, window);

		const sendSpy = vi.spyOn(transport.messenger, "send");
		sendSpy.mockResolvedValueOnce(undefined);
		const source = {
			uid: "consumer-transport-uid",
			domain: "https://host.example.com",
			window,
		};
		const sentCallbackId = (call: number) =>
			(
				requireValue(sendSpy.mock.calls[call])[3] as {
					onReady: { __id__: string };
				}
			).onReady.__id__;

		await transport.sendPropsUpdateToHost(
			{ onReady: () => "first" },
			createOptions().props,
		);

		sendSpy.mockImplementationOnce(async (...args) => {
			args[5]?.();
			throw new Error("props sync failed");
		});

		await expect(
			transport.sendPropsUpdateToHost(
				{ onReady: () => "second" },
				createOptions().props,
			),
		).rejects.toThrow("props sync failed");

		await expect(
			callConsumerCallback(transport, sentCallbackId(0), source),
		).resolves.toBe("first");
		await expect(
			callConsumerCallback(transport, sentCallbackId(1), source),
		).resolves.toBe("second");
	});

	it("should keep existing callback references when serialization fails mid-batch", async () => {
		const transport = createTransport();
		attachOpenedHost(transport, window);
		const source = {
			uid: "consumer-transport-uid",
			domain: "https://host.example.com",
			window,
		};
		const circular: unknown[] = [];
		circular.push(circular);
		const serializeSpy = vi.spyOn(transport.bridge, "serialize");

		const serialized = transport.serializePropsForHost(
			{ onReady: () => "retained" },
			createOptions().props,
		) as { onReady: { __id__: string } };

		expect(() =>
			transport.serializePropsForHost(
				{
					onReady: () => {},
					payload: { circular },
				},
				createOptions().props,
			),
		).toThrow(
			"Circular reference detected in props - arrays cannot contain circular references",
		);

		const rolledBack = requireValue(serializeSpy.mock.results[1]).value as {
			__id__: string;
		};
		await expect(
			callConsumerCallback(transport, serialized.onReady.__id__, source),
		).resolves.toBe("retained");
		await expect(
			callConsumerCallback(transport, rolledBack.__id__, source),
		).rejects.toThrow("not found");
	});

	it("should short-circuit waitForHost when initialization already completed", async () => {
		const transport = createTransport();
		const onError = vi.fn();

		transport.hostInitialized = true;

		await expect(
			transport.waitForHost(25, "consumer-transport-component", onError),
		).resolves.toBeUndefined();
		expect(transport.initPromise).toBeNull();
		expect(onError).not.toHaveBeenCalled();
	});

	it("should not clear a newer init promise when an older waitForHost call times out", async () => {
		vi.useFakeTimers();

		const transport = createTransport();
		const onError = vi.fn();
		const waiting = transport.waitForHost(
			25,
			"consumer-transport-component",
			onError,
		);
		const replacement = createDeferred<void>();
		const rejection = expect(waiting).rejects.toThrow(
			'Host component "consumer-transport-component" (uid: consumer-transport-uid) did not initialize within 25ms.',
		);

		transport.initPromise = replacement;
		await vi.advanceTimersByTimeAsync(25);

		await rejection;
		expect(onError).toHaveBeenCalledWith(expect.any(Error));
		expect(transport.initPromise).toBe(replacement);
	});

	it("reports a host's initialization failure only in the handshake that received it", async () => {
		vi.useFakeTimers();
		const transport = createTransport();
		const first = transport.waitForHost(
			25,
			"consumer-transport-component",
			vi.fn(),
		);
		(transport as unknown as { hostInitFailure: Error }).hostInitFailure =
			new Error("Host initialization failed: bad props");
		const firstRejection = expect(first).rejects.toThrow(
			"within 25ms. Host initialization failed: bad props",
		);
		await vi.advanceTimersByTimeAsync(25);
		await firstRejection;

		const second = transport.waitForHost(
			25,
			"consumer-transport-component",
			vi.fn(),
		);
		const secondRejection = expect(second).rejects.toThrow(
			"within 25ms. Check that the host page loads correctly",
		);
		await vi.advanceTimersByTimeAsync(25);
		await secondRejection;
	});

	it("should rebind cached host export callbacks to the verified origin after a redirect", async () => {
		const configuredOrigin = "https://host.example.com";
		const redirectedOrigin = "https://redirected-host.example.com";
		const transport = createTransport({
			options: createOptions({
				domain: [configuredOrigin, redirectedOrigin],
			}),
		});
		const handlers = createHandlers();
		const hostWindow = { postMessage: vi.fn() } as unknown as Window;
		const sendSpy = vi
			.spyOn(transport.messenger, "send")
			.mockResolvedValue("callback-result");

		attachOpenedHost(transport, hostWindow);
		transport.openedHostDomain = configuredOrigin;
		transport.setupMessageHandlers(handlers);

		const exportHandler = getHandler(transport, MESSAGE_NAME.EXPORT);
		const exportedFunction = {
			__type__: "function",
			__id__: "shared-host-ping",
			__name__: "ping",
		};

		await exportHandler?.(
			{ ping: exportedFunction },
			{
				uid: "consumer-transport-uid",
				domain: configuredOrigin,
				window: hostWindow,
			},
		);

		const initialExport = handlers.onExport.mock.calls[0]?.[0] as {
			ping: () => Promise<unknown>;
		};
		await expect(initialExport.ping()).resolves.toBe("callback-result");

		await exportHandler?.(
			{ ping: exportedFunction },
			{
				uid: "consumer-transport-uid",
				domain: redirectedOrigin,
				window: hostWindow,
			},
		);

		const redirectedExport = handlers.onExport.mock.calls[1]?.[0] as {
			ping: () => Promise<unknown>;
		};
		await expect(redirectedExport.ping()).resolves.toBe("callback-result");
		expect(sendSpy).toHaveBeenLastCalledWith(
			hostWindow,
			redirectedOrigin,
			MESSAGE_NAME.CALL,
			{ id: "shared-host-ping", args: [] },
			null,
		);
	});
});
