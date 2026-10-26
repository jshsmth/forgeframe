/**
 * Lifecycle-focused tests for `@/core/consumer`.
 *
 * Covers host handshake timing, control message handling, open/render guards, callback isolation, and updateProps validation paths.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageHandler } from "@/communication/messenger";
import {
	createRequestMessage,
	serializeMessage,
} from "@/communication/protocol";
import { CONTEXT, EVENT, MESSAGE_NAME } from "@/constants";
import { clearComponents, closeAll, create } from "@/core/component";
import { ConsumerComponent } from "@/core/consumer";
import { getSiblingInstances } from "@/core/consumer/siblings";
import { prop } from "@/props/prop";
import * as popupRender from "@/render/popup";
import { CleanupManager } from "@/utils/cleanup";
import { PEER_HOST_DOMAIN, setVerifiedHostDomain } from "../peer-host-domain";
import { requireValue } from "../require-value";

const createdConsumers: Array<ConsumerComponent<Record<string, unknown>>> = [];
let dispatchedMessageCount = 0;

type HandlerSource = Parameters<MessageHandler>[1];
type DirectHandler = (data: unknown, source?: HandlerSource) => unknown;
type ConsumerInternals = {
	transport: {
		hostWindow: Window | null;
		attachHostWindow(hostWindow: Window | null, openedHostDomain: string): void;
		openedHostDomain: string | null;
		hostInitialized: boolean;
		initPromise: {
			promise: Promise<void>;
			reject: (error: Error) => void;
		} | null;
		messenger: {
			handlers: Map<string, DirectHandler>;
			send: (...args: unknown[]) => Promise<unknown>;
		};
	};
	renderer: {
		context: string;
		container: HTMLElement | null;
		iframe: HTMLIFrameElement | null;
	};
	propsPipeline: {
		props: Record<string, unknown>;
		inputProps: Record<string, unknown>;
	};
	waitForHost: () => Promise<void>;
	open: (baseUrl: string) => Promise<void>;
	prerender: () => Promise<void>;
	destroy: () => Promise<void>;
	buildWindowName: () => string;
	buildUrl: () => string;
	buildBodyParams: () => URLSearchParams;
	options: { url: string };
	resolveUrlOrigin: (url: string) => string;
	rendered: boolean;
};

function getInternals(
	component: ConsumerComponent<Record<string, unknown>>,
): ConsumerInternals {
	return component as unknown as ConsumerInternals;
}

/**
 * Creates a consumer instance and tracks it for deterministic lifecycle cleanup.
 */
function createConsumer(
	options: Record<string, unknown> = {},
	props: Record<string, unknown> = {},
): ConsumerComponent<Record<string, unknown>> {
	const consumer = new ConsumerComponent<Record<string, unknown>>(
		{
			tag: "consumer-lifecycle-component",
			url: "https://host.example.com/widget",
			...options,
		} as never,
		props,
	);
	createdConsumers.push(consumer);
	return consumer;
}

/**
 * Tracks factory-created instances so the file's cleanup closes them, even
 * when an assertion fails before the end of a test.
 */
function trackInstances<T extends object>(...instances: T[]): T[] {
	createdConsumers.push(
		...(instances as unknown as Array<
			ConsumerComponent<Record<string, unknown>>
		>),
	);
	return instances;
}

/**
 * Attaches host content at the origin of the fixture's static URL, as open()
 * does. It reads the URL directly, so no prop validation runs here.
 */
function attachOpenedHost(
	internal: ConsumerInternals,
	hostWindow: Window | null,
): void {
	internal.transport.attachHostWindow(
		hostWindow,
		internal.resolveUrlOrigin(internal.options.url),
	);
}

/** Connects a host window to an instance so its host-control handlers accept messages. */
function connectHostWindow(instance: object): Window {
	const hostWindow = { postMessage: vi.fn() } as unknown as Window;
	attachOpenedHost(
		getInternals(instance as ConsumerComponent<Record<string, unknown>>),
		hostWindow,
	);
	return hostWindow;
}

/** Completes a verified bootstrap so an INIT carrying the returned session is accepted. */
async function bootstrapHost(
	consumer: ConsumerComponent<Record<string, unknown>>,
	hostWindow: Window,
	domain?: string,
): Promise<{ sessionId: string }> {
	const sessionId = "host-session";
	await requireValue(getHandlers(consumer).get(MESSAGE_NAME.BOOTSTRAP))(
		{ sessionId },
		createMessageSource(hostWindow, domain),
	);
	return { sessionId };
}

/**
 * Reads the component's messenger handler map for direct handler invocation tests.
 */
function getHandlers(
	component: ConsumerComponent<Record<string, unknown>>,
): Map<string, DirectHandler> {
	return getInternals(component).transport.messenger.handlers;
}

function createMessageSource(
	windowRef: Window,
	domain = "https://host.example.com",
): HandlerSource {
	return {
		uid: "host-source",
		domain,
		window: windowRef,
	};
}

function dispatchHostMessage(
	name: string,
	sourceWindow: Window,
	options?: {
		data?: unknown;
		origin?: string;
		claimedUid?: string;
	},
): void {
	dispatchedMessageCount += 1;
	const origin = options?.origin ?? "https://host.example.com";
	const request = createRequestMessage(
		`req-${dispatchedMessageCount}`,
		name,
		options?.data ?? {},
		{
			uid: options?.claimedUid ?? `sender-${dispatchedMessageCount}`,
			domain: origin,
		},
	);

	window.dispatchEvent(
		new MessageEvent("message", {
			data: serializeMessage(request),
			source: sourceWindow,
			origin,
		}),
	);
}

async function flushMessages(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

function readResponseData(sourceWindow: Window): unknown {
	const calls = (
		sourceWindow as unknown as { postMessage: ReturnType<typeof vi.fn> }
	).postMessage.mock.calls;
	const lastCall = calls.at(-1);

	if (!lastCall) {
		return undefined;
	}

	return JSON.parse(lastCall[0].slice("forgeframe:".length)).data;
}

afterEach(async () => {
	for (const consumer of createdConsumers.splice(0)) {
		await consumer.close();
	}
	clearComponents();
	vi.useRealTimers();
	vi.restoreAllMocks();
	document.body.innerHTML = "";
});

describe("Consumer lifecycle behavior", () => {
	it("should surface waitForHost timeout on the error event", async () => {
		vi.useFakeTimers();
		const onError = vi.fn();
		const consumer = createConsumer({ timeout: 5 });
		consumer.event.on("error", onError);
		const waitForHost = (
			consumer as unknown as {
				waitForHost: () => Promise<void>;
			}
		).waitForHost;

		const waitPromise = waitForHost.call(consumer);
		const timeoutExpectation = expect(waitPromise).rejects.toThrow(
			"did not initialize within 5ms",
		);
		await vi.advanceTimersByTimeAsync(6);

		await timeoutExpectation;
		expect(onError).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				message: expect.stringContaining("did not initialize within 5ms"),
			}),
		);
	});

	it("should resolve waitForHost when INIT handler runs", async () => {
		vi.useFakeTimers();
		const consumer = createConsumer({ timeout: 50 });
		const internal = getInternals(consumer);
		const waitForHost = internal.waitForHost;
		const hostWindow = { postMessage: vi.fn() } as unknown as Window;
		attachOpenedHost(internal, hostWindow);
		const session = await bootstrapHost(consumer, hostWindow);

		const waitPromise = waitForHost.call(consumer);
		const initHandler = getHandlers(consumer).get(MESSAGE_NAME.INIT);

		expect(initHandler).toBeDefined();
		expect(
			requireValue(initHandler)(session, createMessageSource(hostWindow)),
		).toEqual({
			success: true,
		});
		await expect(waitPromise).resolves.toBeUndefined();
	});

	it("should resolve waitForHost when INIT arrives before waiting starts", async () => {
		vi.useFakeTimers();
		const consumer = createConsumer({ timeout: 50 });
		const internal = getInternals(consumer);
		const waitForHost = internal.waitForHost;
		const hostWindow = { postMessage: vi.fn() } as unknown as Window;
		attachOpenedHost(internal, hostWindow);
		const session = await bootstrapHost(consumer, hostWindow);
		const initHandler = getHandlers(consumer).get(MESSAGE_NAME.INIT);

		expect(initHandler).toBeDefined();
		expect(
			requireValue(initHandler)(session, createMessageSource(hostWindow)),
		).toEqual({
			success: true,
		});
		await expect(waitForHost.call(consumer)).resolves.toBeUndefined();
	});

	it("should deliver sameDomain props in the verified bootstrap response", async () => {
		const consumer = createConsumer(
			{
				url: "/widget",
				props: { secret: { schema: prop.string(), deliverTo: "same-origin" } },
			},
			{ secret: "same-origin-only" },
		);
		const internal = getInternals(consumer);
		const hostWindow = {
			closed: false,
			postMessage: vi.fn(),
			location: { origin: window.location.origin },
		} as unknown as Window;
		attachOpenedHost(internal, hostWindow);
		const bootstrap = getHandlers(consumer).get(MESSAGE_NAME.BOOTSTRAP);
		await expect(
			bootstrap?.(
				{ sessionId: "same-origin-session" },
				createMessageSource(hostWindow, window.location.origin),
			),
		).resolves.toEqual({
			props: { secret: "same-origin-only" },
		});
	});

	it("should route prop updates to the verified INIT origin after an allowed redirect", async () => {
		const configuredOrigin = "https://host.example.com";
		const redirectedOrigin = "https://redirected-host.example.com";
		const consumer = createConsumer(
			{
				domain: [configuredOrigin, redirectedOrigin],
				props: {
					amount: { schema: prop.number() },
				},
			},
			{ amount: 1 },
		);
		const internal = getInternals(consumer);
		const hostWindow = {
			closed: false,
			postMessage: vi.fn(),
		} as unknown as Window;
		const sendSpy = vi
			.spyOn(internal.transport.messenger, "send")
			.mockResolvedValue(undefined);

		attachOpenedHost(internal, hostWindow);
		internal.transport.openedHostDomain = configuredOrigin;
		const session = await bootstrapHost(consumer, hostWindow, redirectedOrigin);

		dispatchHostMessage(MESSAGE_NAME.INIT, hostWindow, {
			data: session,
			origin: redirectedOrigin,
			claimedUid: consumer.uid,
		});
		await flushMessages();
		await consumer.updateProps({ amount: 2 });

		expect(internal.transport.hostInitialized).toBe(true);
		expect(sendSpy).toHaveBeenCalledWith(
			hostWindow,
			redirectedOrigin,
			MESSAGE_NAME.PROPS,
			expect.objectContaining({ amount: 2 }),
			undefined,
			expect.any(Function),
		);
	});

	it("should not send sameDomain props after INIT when the loaded host is cross-origin", async () => {
		const consumer = createConsumer(
			{
				props: {
					secret: { schema: prop.string(), deliverTo: "same-origin" },
				},
			},
			{ secret: "cross-origin-blocked" },
		);
		const handlers = getHandlers(consumer);
		const initHandler = handlers.get(MESSAGE_NAME.INIT);

		const internal = getInternals(consumer);
		const hostWindow = {
			closed: false,
			postMessage: vi.fn(),
			location: { origin: "https://host.example.com" },
		} as unknown as Window;
		attachOpenedHost(internal, hostWindow);
		const session = await bootstrapHost(consumer, hostWindow);

		const sendSpy = vi
			.spyOn(internal.transport.messenger, "send")
			.mockResolvedValue(undefined);

		expect(initHandler).toBeDefined();
		expect(
			requireValue(initHandler)(session, createMessageSource(hostWindow)),
		).toEqual({
			success: true,
		});
		await Promise.resolve();

		expect(sendSpy).not.toHaveBeenCalledWith(
			internal.transport.hostWindow,
			expect.anything(),
			MESSAGE_NAME.PROPS,
			expect.anything(),
		);
	});

	it("should queue bootstrap behind an in-flight props update to preserve function refs", async () => {
		const onReady = vi.fn();
		const consumer = createConsumer(
			{
				url: "/widget",
				props: {
					count: { schema: prop.number() },
					secret: { schema: prop.string(), deliverTo: "same-origin" },
					onReady: prop.function<() => void>(),
				},
			},
			{
				count: 1,
				secret: "same-origin-only",
				onReady,
			},
		);
		const handlers = getHandlers(consumer);
		const bootstrapHandler = handlers.get(MESSAGE_NAME.BOOTSTRAP);
		const callHandler = handlers.get(MESSAGE_NAME.CALL);

		const internal = getInternals(consumer);
		attachOpenedHost(internal, {
			closed: false,
			postMessage: vi.fn(),
			location: { origin: window.location.origin },
		} as unknown as Window);

		let releaseFirstSend!: () => void;
		const firstSendInFlight = new Promise<void>((resolve) => {
			releaseFirstSend = resolve;
		});
		const sentPayloads: Array<Record<string, unknown>> = [];
		let propsSendCount = 0;

		const sendSpy = vi
			.spyOn(internal.transport.messenger, "send")
			.mockImplementation(async (_target, _domain, messageName, payload) => {
				if (messageName !== MESSAGE_NAME.PROPS) {
					return undefined;
				}

				propsSendCount += 1;
				sentPayloads.push(payload as Record<string, unknown>);

				if (propsSendCount === 1) {
					await firstSendInFlight;
				}

				return undefined;
			});

		expect(bootstrapHandler).toBeDefined();
		expect(callHandler).toBeDefined();
		const updatePromise = consumer.updateProps({ count: 2 });
		const bootstrapPromise = bootstrapHandler?.(
			{ sessionId: "new-document" },
			createMessageSource(
				requireValue(internal.transport.hostWindow),
				window.location.origin,
			),
		) as Promise<{ props: Record<string, unknown> }>;

		expect(sendSpy).toHaveBeenCalledTimes(1);

		releaseFirstSend?.();
		await updatePromise;
		await Promise.resolve();

		expect(sendSpy).toHaveBeenCalledTimes(1);

		const latestPayload = (await bootstrapPromise).props as {
			onReady: { __id__: string };
			count: number;
			secret: string;
		};

		expect(latestPayload.count).toBe(2);
		expect(latestPayload.secret).toBe("same-origin-only");
		expect(latestPayload.onReady.__id__).toEqual(expect.any(String));
		await expect(
			requireValue(callHandler)(
				{ id: latestPayload.onReady.__id__, args: [] },
				createMessageSource(
					requireValue(internal.transport.hostWindow),
					window.location.origin,
				),
			),
		).resolves.toBe(undefined);
		expect(onReady).toHaveBeenCalledTimes(1);
	});

	it("should ignore spoofed INIT from a different trusted window and accept the opened host window", async () => {
		vi.useFakeTimers();
		const consumer = createConsumer({ timeout: 50 });
		const internal = getInternals(consumer);
		const hostWindow = { postMessage: vi.fn() } as unknown as Window;
		const spoofedWindow = { postMessage: vi.fn() } as unknown as Window;
		attachOpenedHost(internal, hostWindow);
		const session = await bootstrapHost(consumer, hostWindow);

		dispatchHostMessage(MESSAGE_NAME.INIT, spoofedWindow, {
			data: session,
			claimedUid: consumer.uid,
		});
		await flushMessages();

		expect(internal.transport.hostInitialized).toBe(false);
		expect(readResponseData(spoofedWindow)).toEqual({ success: false });

		const waitPromise = internal.waitForHost.call(consumer);
		dispatchHostMessage(MESSAGE_NAME.INIT, hostWindow, {
			data: session,
			claimedUid: consumer.uid,
		});
		await flushMessages();

		expect(readResponseData(hostWindow)).toEqual({ success: true });
		await expect(waitPromise).resolves.toBeUndefined();
	});

	it("should ignore spoofed CLOSE from a different trusted window and accept the opened host window", async () => {
		const consumer = createConsumer();
		const internal = getInternals(consumer);
		const hostWindow = { postMessage: vi.fn() } as unknown as Window;
		const spoofedWindow = { postMessage: vi.fn() } as unknown as Window;
		const originalClose = consumer.close.bind(consumer);
		const closeSpy = vi.spyOn(consumer, "close").mockResolvedValue(undefined);
		attachOpenedHost(internal, hostWindow);

		dispatchHostMessage(MESSAGE_NAME.CLOSE, spoofedWindow, {
			claimedUid: consumer.uid,
		});
		await flushMessages();

		expect(closeSpy).not.toHaveBeenCalled();
		expect(readResponseData(spoofedWindow)).toEqual({ success: false });

		dispatchHostMessage(MESSAGE_NAME.CLOSE, hostWindow, {
			claimedUid: consumer.uid,
		});
		await flushMessages();

		expect(closeSpy).toHaveBeenCalledTimes(1);
		expect(readResponseData(hostWindow)).toEqual({ success: true });

		closeSpy.mockRestore();
		await originalClose();
	});

	it("should route host control messages to instance methods", async () => {
		const consumer = createConsumer();
		const handlers = getHandlers(consumer);
		const internal = getInternals(consumer);
		const hostWindow = { postMessage: vi.fn() } as unknown as Window;
		attachOpenedHost(internal, hostWindow);

		const closeSpy = vi.spyOn(consumer, "close").mockResolvedValue(undefined);
		const resized = vi.fn();
		consumer.event.on(EVENT.RESIZE, resized);
		const focusSpy = vi.spyOn(consumer, "focus").mockResolvedValue(undefined);
		const showSpy = vi.spyOn(consumer, "show").mockResolvedValue(undefined);
		const hideSpy = vi.spyOn(consumer, "hide").mockResolvedValue(undefined);

		await expect(
			requireValue(handlers.get(MESSAGE_NAME.CLOSE))(
				{},
				createMessageSource(hostWindow),
			),
		).resolves.toEqual({ success: true });
		await expect(
			requireValue(handlers.get(MESSAGE_NAME.RESIZE))(
				{ width: 420, height: 240 },
				createMessageSource(hostWindow),
			),
		).resolves.toEqual({ success: true });
		await expect(
			requireValue(handlers.get(MESSAGE_NAME.FOCUS))(
				{},
				createMessageSource(hostWindow),
			),
		).resolves.toEqual({ success: true, focused: document.hasFocus() });
		await expect(
			requireValue(handlers.get(MESSAGE_NAME.SHOW))(
				{},
				createMessageSource(hostWindow),
			),
		).resolves.toEqual({ success: true });
		await expect(
			requireValue(handlers.get(MESSAGE_NAME.HIDE))(
				{},
				createMessageSource(hostWindow),
			),
		).resolves.toEqual({ success: true });

		expect(closeSpy).toHaveBeenCalledTimes(1);
		expect(resized).toHaveBeenCalledWith({ width: 420, height: 240 });
		expect(focusSpy).toHaveBeenCalledTimes(1);
		expect(showSpy).toHaveBeenCalledTimes(1);
		expect(hideSpy).toHaveBeenCalledTimes(1);
	});

	it("should ignore spoofed ERROR from a different trusted window and accept the opened host window", async () => {
		const onError = vi.fn();
		const consumer = createConsumer();
		consumer.event.on("error", onError);
		const internal = getInternals(consumer);
		const hostWindow = { postMessage: vi.fn() } as unknown as Window;
		const spoofedWindow = { postMessage: vi.fn() } as unknown as Window;
		attachOpenedHost(internal, hostWindow);

		dispatchHostMessage(MESSAGE_NAME.ERROR, spoofedWindow, {
			data: { message: "spoofed host failed" },
			claimedUid: consumer.uid,
		});
		await flushMessages();

		expect(onError).not.toHaveBeenCalled();
		expect(readResponseData(spoofedWindow)).toEqual({ success: false });

		dispatchHostMessage(MESSAGE_NAME.ERROR, hostWindow, {
			data: { message: "host failed" },
			claimedUid: consumer.uid,
		});
		await flushMessages();

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "host failed" }),
		);
		expect(readResponseData(hostWindow)).toEqual({ success: true });
	});

	it("should ignore spoofed EXPORT from a different trusted window and accept the opened host window", async () => {
		const consumer = createConsumer();
		const internal = getInternals(consumer);
		const hostWindow = { postMessage: vi.fn() } as unknown as Window;
		const spoofedWindow = { postMessage: vi.fn() } as unknown as Window;
		attachOpenedHost(internal, hostWindow);

		dispatchHostMessage(MESSAGE_NAME.EXPORT, spoofedWindow, {
			data: { ready: false },
			claimedUid: consumer.uid,
		});
		await flushMessages();

		expect(consumer.exports).toBeUndefined();
		expect(readResponseData(spoofedWindow)).toEqual({ success: false });

		dispatchHostMessage(MESSAGE_NAME.EXPORT, hostWindow, {
			data: { ready: true },
			claimedUid: consumer.uid,
		});
		await flushMessages();

		expect(consumer.exports).toEqual({ ready: true });
		expect(readResponseData(hostWindow)).toEqual({ success: true });
	});

	it("should ignore spoofed GET_SIBLINGS from a different trusted window and accept the opened host window", async () => {
		const PeerComponent = create<{ amount: number }>({
			tag: "peer-siblings-component",
			url: "https://host.example.com/peer",
			props: {
				amount: { schema: prop.number() },
			},
		});

		const [requester, sibling] = trackInstances(
			PeerComponent({ amount: 1 }),
			PeerComponent({ amount: 2 }),
		);
		requester.exports = { id: "a" };
		sibling.exports = { id: "b" };
		setVerifiedHostDomain("https://host.example.com", requester, sibling);

		const hostWindow = connectHostWindow(requester);
		const spoofedWindow = { postMessage: vi.fn() } as unknown as Window;

		dispatchHostMessage(MESSAGE_NAME.GET_SIBLINGS, spoofedWindow, {
			data: {
				uid: requester.uid,
				tag: "peer-siblings-component",
			},
			claimedUid: requester.uid,
		});
		await flushMessages();

		expect(readResponseData(spoofedWindow)).toEqual({ success: false });

		dispatchHostMessage(MESSAGE_NAME.GET_SIBLINGS, hostWindow, {
			data: {
				uid: requester.uid,
				tag: "peer-siblings-component",
			},
			claimedUid: requester.uid,
		});
		await flushMessages();

		expect(readResponseData(hostWindow)).toEqual([
			{
				uid: sibling.uid,
				tag: "peer-siblings-component",
				exports: { id: "b" },
			},
		]);
	});

	it("should scope GET_SIBLINGS to the requester's own identity and verified host origin", async () => {
		const RequesterComponent = create({
			tag: "peer-scope-requester",
			url: "https://host.example.com/requester",
		});
		const VictimComponent = create({
			tag: "peer-scope-victim",
			url: "https://victim.example.com/widget",
		});

		const [requester, sameOriginSibling, victim, victimSibling] =
			trackInstances(
				RequesterComponent(),
				RequesterComponent(),
				VictimComponent(),
				VictimComponent(),
			);
		sameOriginSibling.exports = { id: "same-origin" };
		victim.exports = { secret: "victim" };
		victimSibling.exports = { secret: "victim-sibling" };
		setVerifiedHostDomain(
			"https://host.example.com",
			requester,
			sameOriginSibling,
		);
		setVerifiedHostDomain("https://victim.example.com", victim, victimSibling);
		const hostWindow = connectHostWindow(requester);

		// A host claiming another component's uid and tag still sees only its own peers.
		dispatchHostMessage(MESSAGE_NAME.GET_SIBLINGS, hostWindow, {
			data: { uid: victim.uid, tag: "peer-scope-victim" },
			claimedUid: requester.uid,
		});
		await flushMessages();

		expect(readResponseData(hostWindow)).toEqual([
			{
				uid: sameOriginSibling.uid,
				tag: "peer-scope-requester",
				exports: { id: "same-origin" },
			},
		]);

		dispatchHostMessage(MESSAGE_NAME.GET_SIBLINGS, hostWindow, {
			data: {
				uid: victim.uid,
				tag: "peer-scope-victim",
				options: { anyConsumer: true },
			},
			claimedUid: requester.uid,
		});
		await flushMessages();

		expect(readResponseData(hostWindow)).toEqual([
			{
				uid: sameOriginSibling.uid,
				tag: "peer-scope-requester",
				exports: { id: "same-origin" },
			},
		]);
	});

	it("should give opaque-origin hosts no peers even when both report the null origin", async () => {
		const OpaqueComponent = create({
			tag: "peer-scope-opaque",
			url: "https://host.example.com/opaque",
			domain: "*",
		});
		const [requester, otherProvider] = trackInstances(
			OpaqueComponent(),
			OpaqueComponent(),
		);
		otherProvider.exports = { secret: "other-provider" };
		// Sandboxed frames without allow-same-origin all serialize as "null".
		setVerifiedHostDomain("null", requester, otherProvider);
		const hostWindow = connectHostWindow(requester);

		for (const options of [undefined, { anyConsumer: true }]) {
			dispatchHostMessage(MESSAGE_NAME.GET_SIBLINGS, hostWindow, {
				data: { options },
				origin: "null",
				claimedUid: requester.uid,
			});
			await flushMessages();

			expect(readResponseData(hostWindow)).toEqual([]);
		}
	});

	it("should treat malformed GET_SIBLINGS data as a same-tag lookup", async () => {
		const PeerComponent = create({
			tag: "peer-scope-malformed",
			url: "https://host.example.com/peer",
		});
		const OtherComponent = create({
			tag: "peer-scope-malformed-other",
			url: "https://host.example.com/other",
		});
		const [requester, sibling, otherTag] = trackInstances(
			PeerComponent(),
			PeerComponent(),
			OtherComponent(),
		);
		sibling.exports = { id: "sibling" };
		otherTag.exports = { id: "other-tag" };
		setVerifiedHostDomain(
			"https://host.example.com",
			requester,
			sibling,
			otherTag,
		);

		const hostWindow = connectHostWindow(requester);
		const handler = requireValue(
			getHandlers(
				requester as unknown as ConsumerComponent<Record<string, unknown>>,
			).get(MESSAGE_NAME.GET_SIBLINGS),
		);

		for (const data of [
			null,
			undefined,
			"options",
			42,
			{ options: null },
			{ options: { anyConsumer: "yes" } },
		]) {
			await expect(
				Promise.resolve(handler(data, createMessageSource(hostWindow))),
			).resolves.toEqual([
				{
					uid: sibling.uid,
					tag: "peer-scope-malformed",
					exports: { id: "sibling" },
				},
			]);
		}
	});

	it("should throw when open is called in iframe context without prerender iframe", async () => {
		const consumer = createConsumer();
		getInternals(consumer).renderer.context = CONTEXT.IFRAME;

		await expect(
			getInternals(consumer).open("https://host.example.com/widget"),
		).rejects.toThrow("Iframe not created during prerender");
	});

	it("should destroy instance when render fails during open or init wait", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);

		const openFailure = createConsumer();
		vi.spyOn(
			openFailure as unknown as { prerender: () => Promise<void> },
			"prerender",
		).mockResolvedValue(undefined);
		vi.spyOn(getInternals(openFailure), "open").mockRejectedValue(
			new Error("open failed"),
		);
		const openDestroySpy = vi.spyOn(
			openFailure as unknown as { destroy: () => Promise<void> },
			"destroy",
		);

		await expect(openFailure.render(container)).rejects.toThrow("open failed");
		expect(openDestroySpy).toHaveBeenCalledTimes(1);

		const waitFailure = createConsumer();
		vi.spyOn(
			waitFailure as unknown as { prerender: () => Promise<void> },
			"prerender",
		).mockResolvedValue(undefined);
		vi.spyOn(getInternals(waitFailure), "open").mockResolvedValue(undefined);
		vi.spyOn(
			waitFailure as unknown as { waitForHost: () => Promise<void> },
			"waitForHost",
		).mockRejectedValue(new Error("init failed"));
		const waitDestroySpy = vi.spyOn(
			waitFailure as unknown as { destroy: () => Promise<void> },
			"destroy",
		);

		await expect(waitFailure.render(container)).rejects.toThrow("init failed");
		expect(waitDestroySpy).toHaveBeenCalledTimes(1);
	});

	it("should swap and reveal iframe even when prerender template returns null", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);

		const consumer = createConsumer({
			prerenderTemplate: () => null,
		});

		vi.spyOn(getInternals(consumer), "open").mockResolvedValue(undefined);
		vi.spyOn(
			consumer as unknown as { waitForHost: () => Promise<void> },
			"waitForHost",
		).mockResolvedValue(undefined);

		await consumer.render(container);

		expect(container.querySelector("iframe")?.style.display).toBe("");
		expect(container.querySelector("iframe")?.style.visibility).toBe("visible");
	});

	it("should route popup close watcher through close()", async () => {
		const hostWindow = {
			closed: false,
			focus: vi.fn(),
			close: vi.fn(),
		} as unknown as Window;

		const closeCallbackRef: { current: (() => void) | null } = {
			current: null,
		};
		vi.spyOn(popupRender, "openPopup").mockReturnValue(hostWindow);
		vi.spyOn(popupRender, "watchPopupClose").mockImplementation(
			(_win, callback) => {
				closeCallbackRef.current = callback;
				return () => undefined;
			},
		);

		const consumer = createConsumer({
			defaultContext: CONTEXT.POPUP,
		});
		const closeSpy = vi.spyOn(consumer, "close");

		const internal = getInternals(consumer);
		internal.renderer.context = CONTEXT.POPUP;
		internal.renderer.container = document.createElement("div");

		vi.spyOn(
			consumer as unknown as { buildWindowName: () => string },
			"buildWindowName",
		).mockReturnValue("forgeframe-test-window");
		vi.spyOn(
			consumer as unknown as { buildUrl: () => string },
			"buildUrl",
		).mockReturnValue("https://host.example.com/widget");
		vi.spyOn(
			consumer as unknown as { buildBodyParams: () => URLSearchParams },
			"buildBodyParams",
		).mockReturnValue(new URLSearchParams());

		await getInternals(consumer).open("https://host.example.com/widget");

		expect(closeCallbackRef.current).toBeTypeOf("function");
		closeCallbackRef.current?.();
		expect(closeSpy).toHaveBeenCalledTimes(1);
	});

	it("should emit close before closed, once each, when closing", async () => {
		const lifecycle: string[] = [];
		const consumer = createConsumer();
		consumer.event.on("close", () => {
			lifecycle.push("close");
		});
		consumer.event.on("closed", () => {
			lifecycle.push("closed");
		});

		await Promise.all([consumer.close(), consumer.close()]);

		expect(lifecycle).toEqual(["close", "closed"]);
	});

	it("should enforce render guards before opening", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);

		const destroyedInstance = createConsumer();
		await (
			destroyedInstance as unknown as {
				destroy: () => Promise<void>;
			}
		).destroy();
		await expect(destroyedInstance.render(container)).rejects.toThrow(
			"Component has been destroyed",
		);

		const renderedInstance = createConsumer();
		getInternals(renderedInstance).rendered = true;
		await expect(renderedInstance.render(container)).rejects.toThrow(
			"Component has already been rendered",
		);

		const unrenderedInstance = createConsumer();
		await expect(unrenderedInstance.render("")).rejects.toThrow(
			"Container is required for rendering",
		);
		await expect(
			unrenderedInstance.render("#missing-container"),
		).rejects.toThrow('Container "#missing-container" not found');
	});

	it("should share one in-flight render and queue prop updates until it settles", async () => {
		const consumer = createConsumer();
		const internal = getInternals(consumer);
		const container = document.createElement("div");
		document.body.append(container);
		let releasePrerender: (() => void) | undefined;

		const prerenderSpy = vi.spyOn(internal, "prerender").mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					releasePrerender = resolve;
				}),
		);
		const openSpy = vi.spyOn(internal, "open").mockResolvedValue(undefined);
		vi.spyOn(internal, "waitForHost").mockResolvedValue(undefined);

		const firstRender = consumer.render(container);
		const secondRender = consumer.render(container);
		const settled: string[] = [];
		const update = consumer.updateProps({ value: "racing" }).then(() => {
			settled.push("update");
		});
		void firstRender.then(() => settled.push("render"));

		await vi.waitFor(() => expect(prerenderSpy).toHaveBeenCalledTimes(1));
		expect(settled).toEqual([]);

		releasePrerender?.();
		await expect(Promise.all([firstRender, secondRender])).resolves.toEqual([
			undefined,
			undefined,
		]);
		await update;
		expect(settled).toEqual(["render", "update"]);
		expect(openSpy).toHaveBeenCalledTimes(1);
	});

	it("should establish the render lock before lifecycle callbacks can re-enter", async () => {
		const consumer = createConsumer();
		const internal = getInternals(consumer);
		const container = document.createElement("div");
		document.body.append(container);
		let releasePrerender: (() => void) | undefined;
		let reentrantRender: Promise<void> | undefined;
		let propUpdateResult: Promise<string> | undefined;

		const prerenderGate = new Promise<void>((resolve) => {
			releasePrerender = resolve;
		});
		const prerenderSpy = vi
			.spyOn(internal, "prerender")
			.mockReturnValue(prerenderGate);
		const openSpy = vi.spyOn(internal, "open").mockResolvedValue(undefined);
		vi.spyOn(internal, "waitForHost").mockResolvedValue(undefined);

		consumer.event.once(EVENT.RENDER, () => {
			reentrantRender = consumer.render(container);
			propUpdateResult = consumer.updateProps({ value: "racing" }).then(
				() => "resolved",
				(error: Error) => error.message,
			);
		});

		const firstRender = consumer.render(container);

		await vi.waitFor(() => {
			expect(reentrantRender).toBeDefined();
			expect(propUpdateResult).toBeDefined();
		});
		expect(prerenderSpy).toHaveBeenCalledTimes(1);

		releasePrerender?.();
		await expect(
			Promise.all([firstRender, reentrantRender as Promise<void>]),
		).resolves.toEqual([undefined, undefined]);
		await expect(propUpdateResult).resolves.toBe("resolved");
		expect(openSpy).toHaveBeenCalledTimes(1);
	});

	it("should promptly reject every caller when close cancels a delayed render", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const onError = vi.fn();
		const consumer = createConsumer();
		const internal = getInternals(consumer);
		const lifecycle = {
			render: vi.fn(),
			rendered: vi.fn(),
			close: vi.fn(),
			closed: vi.fn(),
		};
		let releasePrerender: (() => void) | undefined;

		vi.spyOn(internal, "prerender").mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					releasePrerender = resolve;
				}),
		);
		const openSpy = vi.spyOn(internal, "open").mockResolvedValue(undefined);
		consumer.event.on(EVENT.RENDER, lifecycle.render);
		consumer.event.on(EVENT.RENDERED, lifecycle.rendered);
		consumer.event.on(EVENT.CLOSE, lifecycle.close);
		consumer.event.on(EVENT.CLOSED, lifecycle.closed);
		consumer.event.on(EVENT.ERROR, onError);

		const firstRender = consumer.render(container);
		const secondRender = consumer.render(container);
		const cancellationMessage =
			'Component "consumer-lifecycle-component" was closed before rendering completed';

		await vi.waitFor(() => {
			expect(releasePrerender).toBeTypeOf("function");
		});

		const firstRejection =
			expect(firstRender).rejects.toThrow(cancellationMessage);
		const secondRejection =
			expect(secondRender).rejects.toThrow(cancellationMessage);

		await expect(consumer.close()).resolves.toBeUndefined();
		await Promise.all([firstRejection, secondRejection]);
		await consumer.close();

		expect(openSpy).not.toHaveBeenCalled();
		expect(lifecycle.render).toHaveBeenCalledTimes(1);
		expect(lifecycle.rendered).not.toHaveBeenCalled();
		expect(lifecycle.close).toHaveBeenCalledTimes(1);
		expect(lifecycle.closed).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();

		releasePrerender?.();
		await flushMessages();
		expect(openSpy).not.toHaveBeenCalled();
	});

	it("should cancel initialization without forwarding an intentional close as an error", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const onError = vi.fn();
		const consumer = createConsumer({ timeout: 1000 });
		consumer.event.on("error", onError);
		const internal = getInternals(consumer);

		vi.spyOn(internal, "prerender").mockResolvedValue(undefined);
		vi.spyOn(internal, "open").mockResolvedValue(undefined);

		const renderPromise = consumer.render(container);
		const renderRejection = expect(renderPromise).rejects.toThrow(
			'Component "consumer-lifecycle-component" was closed before rendering completed',
		);

		await vi.waitFor(() => {
			expect(internal.transport.initPromise).not.toBeNull();
		});
		await consumer.close();
		await renderRejection;
		await flushMessages();

		expect(onError).not.toHaveBeenCalled();
	});

	it("should stop before any frame or placeholder when a render listener closes the instance", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const consumer = createConsumer();
		const internal = getInternals(consumer);
		const prerenderSpy = vi.spyOn(internal, "prerender");
		const openSpy = vi.spyOn(internal, "open").mockResolvedValue(undefined);

		consumer.event.once(EVENT.RENDER, () => {
			void consumer.close();
		});

		await expect(consumer.render(container)).rejects.toThrow(
			'Component "consumer-lifecycle-component" was closed before rendering completed',
		);

		expect(prerenderSpy).not.toHaveBeenCalled();
		expect(openSpy).not.toHaveBeenCalled();
		expect(container.querySelectorAll("iframe")).toHaveLength(0);
	});

	it("should remove artifacts created by a template after close begins", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const lateContainer = document.createElement("section");
		const consumer = createConsumer({
			containerTemplate: () => {
				void consumer.close();
				return lateContainer;
			},
		});
		const openSpy = vi
			.spyOn(getInternals(consumer), "open")
			.mockResolvedValue(undefined);

		await expect(consumer.render(container)).rejects.toThrow(
			'Component "consumer-lifecycle-component" was closed before rendering completed',
		);
		await vi.waitFor(() => {
			expect(container.contains(lateContainer)).toBe(false);
		});

		expect(openSpy).not.toHaveBeenCalled();
		expect(container.querySelectorAll("iframe")).toHaveLength(0);
	});

	it("should stop between prerender and container templates when context close is called", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const latePrerender = document.createElement("div");
		const containerTemplate = vi.fn(() => document.createElement("section"));
		const consumer = createConsumer({
			prerenderTemplate: ({ close }: { close: () => Promise<void> }) => {
				void close();
				return latePrerender;
			},
			containerTemplate,
		});
		const openSpy = vi
			.spyOn(getInternals(consumer), "open")
			.mockResolvedValue(undefined);

		await expect(consumer.render(container)).rejects.toThrow(
			'Component "consumer-lifecycle-component" was closed before rendering completed',
		);

		expect(containerTemplate).not.toHaveBeenCalled();
		expect(openSpy).not.toHaveBeenCalled();
		expect(latePrerender.parentNode).toBeNull();
		expect(container.childElementCount).toBe(0);
	});

	it("should tear down a popup returned after close has already begun", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const popupWindow = {
			closed: false,
			close: vi.fn(),
		} as unknown as Window;
		const consumer = createConsumer({ defaultContext: CONTEXT.POPUP });

		vi.spyOn(popupRender, "openPopup").mockImplementation(() => {
			void consumer.close();
			return popupWindow;
		});
		vi.spyOn(popupRender, "watchPopupClose").mockReturnValue(() => undefined);
		const waitForHostSpy = vi
			.spyOn(getInternals(consumer), "waitForHost")
			.mockResolvedValue(undefined);

		await expect(consumer.render(container, CONTEXT.POPUP)).rejects.toThrow(
			'Component "consumer-lifecycle-component" was closed before rendering completed',
		);
		await vi.waitFor(() => {
			expect(popupWindow.close).toHaveBeenCalledTimes(1);
		});

		expect(waitForHostSpy).not.toHaveBeenCalled();
		expect(getInternals(consumer).transport.hostWindow).toBeNull();
	});

	it("should stop before opening a popup when dynamic dimensions close the instance", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		let dimensionCalls = 0;
		const consumer = createConsumer({
			defaultContext: CONTEXT.POPUP,
			dimensions: () => {
				dimensionCalls += 1;
				if (dimensionCalls === 2) {
					void consumer.close();
				}
				return { width: 320, height: 180 };
			},
		});
		const openPopupSpy = vi.spyOn(popupRender, "openPopup");
		const waitForHostSpy = vi
			.spyOn(getInternals(consumer), "waitForHost")
			.mockResolvedValue(undefined);

		await expect(consumer.render(container, CONTEXT.POPUP)).rejects.toThrow(
			'Component "consumer-lifecycle-component" was closed before rendering completed',
		);

		expect(dimensionCalls).toBe(2);
		expect(openPopupSpy).not.toHaveBeenCalled();
		expect(waitForHostSpy).not.toHaveBeenCalled();
		expect(getInternals(consumer).transport.hostWindow).toBeNull();
	});

	it("should reject updateProps when a required prop becomes undefined", async () => {
		const consumer = createConsumer(
			{
				props: {
					amount: { schema: prop.number() },
				},
			},
			{ amount: 1 },
		);

		await expect(consumer.updateProps({ amount: undefined })).rejects.toThrow(
			"Validation failed: amount: Required",
		);
	});

	it("should reject updateProps when a prop violates its schema", async () => {
		const consumer = createConsumer(
			{
				props: {
					amount: { schema: prop.number() },
				},
			},
			{ amount: 1 },
		);

		await expect(consumer.updateProps({ amount: "two" })).rejects.toThrow(
			"Validation failed: amount",
		);
	});

	it("should not run custom validation, mutate props, or send props when built-in validation fails", async () => {
		const validate = vi.fn();
		const consumer = createConsumer(
			{
				props: {
					amount: { schema: prop.number() },
				},
				validate,
			},
			{ amount: 1 },
		);

		const hostWindow = {
			closed: false,
			postMessage: vi.fn(),
			location: { origin: "https://host.example.com" },
		} as unknown as Window;
		const internal = getInternals(consumer);
		attachOpenedHost(internal, hostWindow);
		internal.transport.openedHostDomain = "https://host.example.com";

		const previousProps = { ...internal.propsPipeline.props };
		const sendSpy = vi
			.spyOn(internal.transport.messenger, "send")
			.mockResolvedValue(undefined);

		await expect(consumer.updateProps({ amount: undefined })).rejects.toThrow(
			"Validation failed: amount: Required",
		);

		expect(validate).not.toHaveBeenCalled();
		expect(sendSpy).not.toHaveBeenCalled();
		expect(internal.propsPipeline.props).toEqual(previousProps);
	});

	it("should send updated props to the opened host domain", async () => {
		const consumer = createConsumer(
			{
				props: {
					amount: { schema: prop.number() },
				},
			},
			{ amount: 1 },
		);

		const hostWindow = {
			closed: false,
			postMessage: vi.fn(),
			location: { origin: "https://host.example.com" },
		} as unknown as Window;
		const internal = getInternals(consumer);
		attachOpenedHost(internal, hostWindow);
		internal.transport.openedHostDomain = "https://host.example.com";

		const sendSpy = vi
			.spyOn(internal.transport.messenger, "send")
			.mockResolvedValue(undefined);

		await consumer.updateProps({ amount: 2 });

		expect(sendSpy).toHaveBeenCalledWith(
			hostWindow,
			"https://host.example.com",
			MESSAGE_NAME.PROPS,
			expect.objectContaining({ amount: 2 }),
			undefined,
			expect.any(Function),
		);
	});

	it("should skip props messaging when host window is closed", async () => {
		const consumer = createConsumer(
			{
				props: {
					amount: { schema: prop.number() },
				},
			},
			{ amount: 1 },
		);

		const internal = getInternals(consumer);
		attachOpenedHost(internal, { closed: true } as unknown as Window);
		internal.transport.openedHostDomain = "https://host.example.com";

		const sendSpy = vi
			.spyOn(internal.transport.messenger, "send")
			.mockResolvedValue(undefined);

		await consumer.updateProps({ amount: 2 });

		expect(sendSpy).not.toHaveBeenCalled();
	});
});

describe("Factory instance close and teardown", () => {
	afterEach(async () => {
		await closeAll();
	});

	it("delivers rearmed once listeners on the next resize", async () => {
		const Component = create({
			tag: "rearmed-resize",
			url: "https://example.com",
		});
		const instance = Component();
		const persistent = vi.fn();
		instance.event.on("resize", persistent);
		const sizes: unknown[] = [];
		const rearm = (dimensions: unknown) => {
			sizes.push(dimensions);
			// Bound a broken live-Set traversal so the regression fails without hanging.
			if (sizes.length < 3) instance.event.once("resize", rearm);
		};
		instance.event.once("resize", rearm);

		await instance.resize({ width: 401 });
		expect(sizes).toEqual([{ width: 401 }]);
		await instance.resize({ width: 402 });
		expect(sizes).toEqual([{ width: 401 }, { width: 402 }]);
		expect(persistent).toHaveBeenCalledTimes(2);
	});

	it.each(["direct", "reentrant"])(
		"waits for destruction when close is requested again (%s)",
		async (mode) => {
			const Component = create({
				tag: "concurrent-close",
				url: "https://example.com",
			});
			const instance = Component();
			const destroyed = vi.fn();
			instance.event.on("closed", destroyed);
			let reentrant: Promise<void> | undefined;
			if (mode === "reentrant")
				instance.event.on("close", () => {
					reentrant = instance.close();
				});
			const first = instance.close();
			try {
				await (mode === "direct" ? instance.close() : reentrant);
				expect(Component.instances).toHaveLength(0);
				expect(destroyed).toHaveBeenCalledTimes(1);
			} finally {
				await first;
			}
		},
	);

	it("waits for already-started render-failure destruction before close resolves", async () => {
		const failure = new Error("Expected template failure");
		const Component = create({
			tag: "close-during-failed-render",
			url: "https://example.com",
			prerenderTemplate: () => {
				throw failure;
			},
		});
		const instance = Component();
		const mount = document.createElement("div");
		document.body.appendChild(mount);
		const destroyed = vi.fn();
		const closed = vi.fn();
		instance.event.on("closed", destroyed);
		instance.event.on("close", closed);
		let releaseCleanup = () => {};
		let markCleanupStarted = () => {};
		const cleanupAllowed = new Promise<void>((resolve) => {
			releaseCleanup = resolve;
		});
		const cleanupStarted = new Promise<void>((resolve) => {
			markCleanupStarted = resolve;
		});
		const originalCleanup = CleanupManager.prototype.cleanup;
		const cleanup = vi
			.spyOn(CleanupManager.prototype, "cleanup")
			.mockImplementationOnce(async function (this: CleanupManager) {
				markCleanupStarted();
				await cleanupAllowed;
				await originalCleanup.call(this);
			});
		const renderOutcome = instance
			.render(mount)
			.catch((error: unknown) => error);
		try {
			await cleanupStarted;
			const closeCompleted = vi.fn();
			const closing = instance.close().then(closeCompleted);
			await Promise.resolve();
			await Promise.resolve();
			expect(closeCompleted).not.toHaveBeenCalled();
			releaseCleanup();
			await closing;
			await closeAll();
			expect(Component.instances).toHaveLength(0);
			expect(destroyed).toHaveBeenCalledOnce();
			expect(closed).not.toHaveBeenCalled();
			expect(await renderOutcome).toBe(failure);
		} finally {
			releaseCleanup();
			await renderOutcome;
			cleanup.mockRestore();
			mount.remove();
		}
	});

	it("deregisters instances before closed without relying on public listeners", async () => {
		const tag = "listener-free-deregistration";
		const Component = create({
			tag,
			url: "https://example.com/tracked",
		});
		const first = Component();
		const second = Component();
		setVerifiedHostDomain(PEER_HOST_DOMAIN, first, second);
		const events: string[] = [];
		for (const [name, instance] of [
			["first", first],
			["second", second],
		] as const) {
			instance.event.on("close", () => {
				events.push(`${name}:close:${Component.instances.includes(instance)}`);
			});
			instance.event.on("closed", () => {
				events.push(`${name}:closed:${Component.instances.includes(instance)}`);
			});
		}

		await first.close();
		expect(Component.instances).toEqual([second]);
		expect(
			getSiblingInstances({
				uid: second.uid,
				tag,
				hostDomain: PEER_HOST_DOMAIN,
				anyConsumer: false,
			}),
		).toEqual([]);
		await second.close();
		await second.close();
		expect(Component.instances).toEqual([]);
		expect(
			getSiblingInstances({
				uid: "outside",
				tag,
				hostDomain: PEER_HOST_DOMAIN,
				anyConsumer: false,
			}),
		).toEqual([]);
		expect(events).toEqual([
			"first:close:true",
			"first:closed:false",
			"second:close:true",
			"second:closed:false",
		]);
	});
});
