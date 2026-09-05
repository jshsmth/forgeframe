/**
 * Unit tests for `@/core/consumer/transport`.
 *
 * Covers consumer-side trust rotation, host-domain fallback, function-bridge
 * cleanup across failed updates, wait-for-host races, and async init error
 * forwarding from the INIT handshake.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTEXT, MESSAGE_NAME } from "@/constants";
import type { ConsumerTransportHandlers } from "@/core/consumer/transport";
import { ConsumerTransport } from "@/core/consumer/transport";
import type { NormalizedOptions } from "@/core/consumer/types";
import { prop } from "@/props/prop";
import type { Dimensions, SiblingInfo } from "@/types";
import { createDeferred } from "@/utils/promise";

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
	resolveUrlOrigin?: (url: string) => string | null;
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

function createHandlers(): ConsumerTransportHandlers<{ ready: boolean }> & {
	onError: ReturnType<typeof vi.fn>;
	onInit: ReturnType<typeof vi.fn>;
	onClose: ReturnType<typeof vi.fn>;
	onResize: ReturnType<typeof vi.fn>;
	onFocus: ReturnType<typeof vi.fn>;
	onShow: ReturnType<typeof vi.fn>;
	onHide: ReturnType<typeof vi.fn>;
	onExport: ReturnType<typeof vi.fn>;
	onConsumerExport: ReturnType<typeof vi.fn>;
	onGetSiblings: ReturnType<typeof vi.fn>;
} {
	return {
		onInit: vi.fn(async () => {}),
		onClose: vi.fn(async () => {}),
		onResize: vi.fn(async (_dimensions: Dimensions) => {}),
		onFocus: vi.fn(async () => {}),
		onShow: vi.fn(async () => {}),
		onHide: vi.fn(async () => {}),
		onError: vi.fn(),
		onExport: vi.fn(),
		onConsumerExport: vi.fn(),
		onGetSiblings: vi.fn(async (_request): Promise<SiblingInfo[]> => []),
	};
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

afterEach(() => {
	while (createdTransports.length > 0) {
		createdTransports.pop()!.destroy();
	}
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("ConsumerTransport", () => {
	it('should fall back to "*" when the resolved host URL has no origin', () => {
		const transport = createTransport({
			options: createOptions({ domain: undefined }),
			resolveUrl: () => "/relative-widget",
			resolveUrlOrigin: () => null,
		});

		expect(transport.dynamicUrlTrustedOrigin).toBeNull();
		expect(transport.getHostDomain()).toBe("*");
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

	it("should keep previous callback references when a props update send fails", async () => {
		const transport = createTransport();
		transport.hostWindow = window;

		const sendSpy = vi.spyOn(transport.messenger, "send");
		sendSpy.mockResolvedValueOnce(undefined);

		await transport.sendPropsUpdateToHost(
			{ onReady: () => {} },
			createOptions().props,
		);

		expect(transport.bridge.localFunctionCount).toBe(1);

		sendSpy.mockRejectedValueOnce(new Error("props sync failed"));

		await expect(
			transport.sendPropsUpdateToHost(
				{ onReady: () => {} },
				createOptions().props,
			),
		).rejects.toThrow("props sync failed");

		expect(transport.bridge.localFunctionCount).toBe(2);
	});

	it("should keep existing callback references when serialization fails mid-batch", () => {
		const transport = createTransport();
		const circular: unknown[] = [];
		circular.push(circular);

		transport.serializePropsForHost(
			{ onReady: () => {} },
			createOptions().props,
		);

		expect(transport.bridge.localFunctionCount).toBe(1);

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

		expect(transport.bridge.localFunctionCount).toBe(2);
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

	it("should forward async onInit failures to onError after a trusted INIT message", async () => {
		const transport = createTransport();
		const handlers = createHandlers();
		const initFailure = new Error("async init failed");

		transport.hostWindow = window;
		transport.initPromise = createDeferred<void>();
		handlers.onInit.mockRejectedValueOnce(initFailure);

		transport.setupMessageHandlers(handlers);

		const initHandler = getHandler(transport, MESSAGE_NAME.INIT);
		const result = initHandler?.(
			{},
			{
				uid: "host-window",
				domain: "https://host.example.com",
				window,
			},
		);

		expect(result).toEqual({ success: true });
		expect(transport.hostInitialized).toBe(true);
		await expect(transport.initPromise?.promise).resolves.toBeUndefined();

		await flushMicrotasks();

		expect(handlers.onError).toHaveBeenCalledWith(initFailure);
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

		transport.hostWindow = hostWindow;
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
		);
	});
});
