/**
 * Security-oriented tests for host initialization and deferred init behavior.
 *
 * Covers consumer domain allowlist enforcement, hostProps invalidation, and deferred init gating under security checks.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { type MessageHandler, Messenger } from "@/communication/messenger";
import {
	createRequestMessage,
	serializeMessage,
} from "@/communication/protocol";
import { CONTEXT, EVENT, MESSAGE_NAME, PROTOCOL_VERSION } from "@/constants";
import { clearHostInstance, type HostComponent, initHost } from "@/core/host";
import * as hostSecurity from "@/core/host/security";
import { prop } from "@/props/prop";
import { buildWindowName } from "@/window/name-payload";
import type { WindowNamePayload } from "@/window/types";
import { requireValue } from "../require-value";

const originalWindowName = window.name;
let dispatchedMessageCount = 0;
type HandlerSource = Parameters<MessageHandler>[1];
type DirectHandler = (
	data: Record<string, unknown>,
	source: HandlerSource,
) => unknown;

/** Builds current-protocol channel metadata for a host window. */
function createPayload(
	overrides: Partial<WindowNamePayload> = {},
): WindowNamePayload {
	return {
		uid: "host-uid",
		tag: "secure-component",
		protocolVersion: PROTOCOL_VERSION,
		context: CONTEXT.IFRAME,
		consumerDomain: "https://trusted.example.com",
		...overrides,
	};
}

/**
 * Starts a deferred host whose verified bootstrap delivers `props`, and counts
 * the INIT messages it sends afterwards.
 */
async function startBootstrappedHost(
	consumerWindow: Window,
	payload: WindowNamePayload,
	props: Record<string, unknown> = {},
	propDefinitions?: Parameters<typeof initHost>[0],
): Promise<{
	host: HostComponent<Record<string, unknown>>;
	countInitMessages: () => number;
}> {
	vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
		consumerWindow,
	);
	window.name = buildWindowName(payload);
	const send = vi
		.spyOn(Messenger.prototype, "send")
		.mockResolvedValueOnce({ props })
		.mockResolvedValue(undefined);
	const host = requireValue(
		initHost(propDefinitions, undefined, { deferInit: true }),
	);
	await host.ready;
	return {
		host,
		countInitMessages: () =>
			send.mock.calls.filter(([, , name]) => name === MESSAGE_NAME.INIT).length,
	};
}

/** Creates a consumer window whose origin the browser exposes to the host. */
function createAccessibleConsumerWindow(origin: string): Window {
	return { location: { origin }, postMessage: vi.fn() } as unknown as Window;
}

/** Creates a cross-origin consumer window whose location the browser hides. */
function createInaccessibleConsumerWindow(): Window {
	return {
		postMessage: vi.fn(),
		get location() {
			throw new Error("Cross-origin");
		},
	} as unknown as Window;
}

function dispatchConsumerMessage(
	name: string,
	sourceWindow: Window,
	options?: {
		data?: unknown;
		origin?: string;
		claimedUid?: string;
	},
): void {
	dispatchedMessageCount += 1;
	const origin = options?.origin ?? "https://trusted.example.com";
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

function createMessageSource(
	windowRef: Window,
	domain = "https://trusted.example.com",
): HandlerSource {
	return {
		uid: "consumer-source",
		domain,
		window: windowRef,
	};
}

afterEach(() => {
	clearHostInstance();
	window.name = originalWindowName;
	dispatchedMessageCount = 0;
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("Host security", () => {
	it("should preserve built-in hostProps when bootstrap props reuse reserved names", async () => {
		const consumerWindow = { postMessage: vi.fn() } as unknown as Window;
		const { host } = await startBootstrappedHost(
			consumerWindow,
			createPayload({
				uid: "host-uid-reserved-bootstrap",
				tag: "secure-component-reserved-bootstrap",
			}),
			{
				uid: "spoofed-uid",
				close: "spoofed-close",
				consumer: "spoofed-consumer",
				title: "Visible title",
			},
		);

		expect(host.hostProps.uid).toBe("host-uid-reserved-bootstrap");
		expect(host.hostProps.tag).toBe("secure-component-reserved-bootstrap");
		expect(typeof host.hostProps.close).toBe("function");
		expect(typeof host.hostProps.consumer.export).toBe("function");
		expect(host.hostProps.title).toBe("Visible title");
		expect(host.hostProps.consumer.props).toEqual({
			uid: "spoofed-uid",
			close: "spoofed-close",
			consumer: "spoofed-consumer",
			title: "Visible title",
		});
	});

	it("should ignore reserved names during prop sync without deleting built-ins", async () => {
		const consumerWindow = { postMessage: vi.fn() } as unknown as Window;
		const { host } = await startBootstrappedHost(
			consumerWindow,
			createPayload({
				uid: "host-uid-reserved-sync",
				tag: "secure-component-reserved-sync",
			}),
			{ amount: 10, close: "initial-close" },
		);
		expect(host.hostProps.amount).toBe(10);

		const propsHandler = (
			host as unknown as {
				messenger: { handlers: Map<string, DirectHandler> };
			}
		).messenger.handlers.get(MESSAGE_NAME.PROPS);

		expect(propsHandler).toBeDefined();

		requireValue(propsHandler)(
			{
				uid: "spoofed-uid",
				close: "spoofed-close",
				consumer: "spoofed-consumer",
				status: "updated",
			},
			createMessageSource(consumerWindow),
		);

		expect(host.hostProps.amount).toBeUndefined();
		expect(host.hostProps.uid).toBe("host-uid-reserved-sync");
		expect(typeof host.hostProps.close).toBe("function");
		expect(typeof host.hostProps.consumer.export).toBe("function");
		expect(host.hostProps.status).toBe("updated");
		expect(host.hostProps.consumer.props).toEqual({
			uid: "spoofed-uid",
			close: "spoofed-close",
			consumer: "spoofed-consumer",
			status: "updated",
		});
	});

	it("should ignore spoofed PROPS from a different trusted window and accept the resolved consumer window", async () => {
		const consumerWindow = { postMessage: vi.fn() } as unknown as Window;
		const spoofedWindow = { postMessage: vi.fn() } as unknown as Window;
		const { host } = await startBootstrappedHost(
			consumerWindow,
			createPayload({
				uid: "host-uid-pinned-props",
				tag: "secure-component-pinned-props",
			}),
			{ amount: 10 },
			{ amount: { schema: prop.number() } },
		);

		const onProps = vi.fn();
		const emitSpy = vi.spyOn(host.event, "emit");
		host.hostProps.onProps(onProps);

		dispatchConsumerMessage(MESSAGE_NAME.PROPS, spoofedWindow, {
			data: { amount: 42 },
			claimedUid: "host-uid-pinned-props",
		});
		await flushMessages();

		expect(readResponseData(spoofedWindow)).toEqual({ success: false });
		expect(host.hostProps.amount).toBe(10);
		expect(host.hostProps.consumer.props).toEqual({ amount: 10 });
		expect(onProps).not.toHaveBeenCalled();
		expect(emitSpy).not.toHaveBeenCalled();

		dispatchConsumerMessage(MESSAGE_NAME.PROPS, consumerWindow, {
			data: { amount: 42 },
			claimedUid: "host-uid-pinned-props",
		});
		await flushMessages();

		expect(readResponseData(consumerWindow)).toEqual({ success: true });
		expect(host.hostProps.amount).toBe(42);
		expect(host.hostProps.consumer.props).toEqual({ amount: 42 });
		expect(onProps).toHaveBeenCalledTimes(1);
		expect(onProps).toHaveBeenCalledWith({ amount: 42 });
		expect(emitSpy).toHaveBeenCalledTimes(1);
		expect(emitSpy).toHaveBeenCalledWith(EVENT.PROPS, { amount: 42 });
	});

	it.each([
		{ label: "an empty string", allowed: "" },
		{ label: "a blank string", allowed: "   " },
		{
			label: "an empty array entry",
			allowed: ["https://trusted.example.com", ""],
		},
		{ label: "a non-pattern entry", allowed: [42] },
		{ label: "null", allowed: null },
	])(
		"rejects $label as an allowlist instead of trusting every consumer",
		({ allowed }) => {
			vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
				createAccessibleConsumerWindow("https://evil.example.com"),
			);
			window.name = buildWindowName(
				createPayload({
					uid: "host-uid-invalid-allowlist",
					tag: "secure-component-invalid-allowlist",
					consumerDomain: "https://evil.example.com",
				}),
			);

			expect(() =>
				// @ts-expect-error Invalid JavaScript configuration is rejected at runtime.
				initHost({}, allowed),
			).toThrow(
				"allowedConsumerDomains must be a non-empty origin string, a RegExp, or an array of them",
			);
			expect(window.hostProps).toBeUndefined();
		},
	);

	it("keeps an empty allowlist array as a policy that admits no consumer", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
			createAccessibleConsumerWindow("https://trusted.example.com"),
		);
		window.name = buildWindowName(
			createPayload({
				uid: "host-uid-empty-allowlist",
				tag: "secure-component-empty-allowlist",
				consumerDomain: "https://trusted.example.com",
			}),
		);

		expect(() => initHost({}, [])).toThrow(
			'Consumer domain "https://trusted.example.com" is not allowed',
		);
	});

	it("should reject disallowed consumer domains during host initialization", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
			createAccessibleConsumerWindow("https://evil.example.com"),
		);

		const payload = createPayload({
			uid: "host-uid",
			tag: "secure-component",
			consumerDomain: "https://evil.example.com",
		});

		window.name = buildWindowName(payload);

		expect(() => initHost({}, "https://trusted.example.com")).toThrow(
			'Consumer domain "https://evil.example.com" is not allowed',
		);
	});

	it("should keep the bootstrap window name and allow a same-page retry when allowlist validation fails", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
			createAccessibleConsumerWindow("https://evil.example.com"),
		);

		const payload = createPayload({
			uid: "host-uid-allowlist-retry",
			tag: "secure-component-allowlist-retry",
			consumerDomain: "https://evil.example.com",
		});
		const bootstrapWindowName = buildWindowName(payload);

		window.name = bootstrapWindowName;

		expect(() => initHost({}, "https://trusted.example.com")).toThrow(
			"is not allowed",
		);

		expect(window.name).toBe(bootstrapWindowName);
		expect(
			(window as unknown as { hostProps?: unknown }).hostProps,
		).toBeUndefined();

		const host = initHost({}, "https://evil.example.com", { deferInit: true });

		expect(host).not.toBeNull();
		expect(host?.hostProps.getConsumerDomain()).toBe(
			"https://evil.example.com",
		);
		expect(window.name).toBe(bootstrapWindowName);
	});

	it("should allow wildcard consumer domains during host initialization and bind the verified origin", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
			createAccessibleConsumerWindow("https://api.trusted.example.com"),
		);

		const payload = createPayload({
			uid: "host-uid-wildcard",
			tag: "secure-component-wildcard",
			consumerDomain: "https://api.trusted.example.com",
		});

		window.name = buildWindowName(payload);

		const host = initHost({}, "https://*.trusted.example.com", {
			deferInit: true,
		});
		const hostPropsDescriptor = Object.getOwnPropertyDescriptor(
			window,
			"hostProps",
		);

		expect(host).not.toBeNull();
		expect(host?.hostProps.getConsumerDomain()).toBe(
			"https://api.trusted.example.com",
		);
		expect(hostPropsDescriptor?.get).toEqual(expect.any(Function));
	});

	it("should reject spoofed claimed consumer domains when the accessible consumer origin is untrusted", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
			createAccessibleConsumerWindow("https://evil.example.com"),
		);

		const payload = createPayload({
			uid: "host-uid-spoofed-domain",
			tag: "secure-component-spoofed-domain",
			consumerDomain: "https://trusted.example.com",
		});

		window.name = buildWindowName(payload);

		expect(() => initHost({}, "https://trusted.example.com")).toThrow(
			"https://evil.example.com",
		);
	});

	it("should bind host consumer domain to the accessible consumer origin instead of the claimed payload origin", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
			createAccessibleConsumerWindow("https://verified.example.com"),
		);

		const payload = createPayload({
			uid: "host-uid-verified-domain",
			tag: "secure-component-verified-domain",
			consumerDomain: "https://claimed.example.com",
		});

		window.name = buildWindowName(payload);

		const host = initHost({}, undefined, { deferInit: true });

		expect(host?.hostProps.getConsumerDomain()).toBe(
			"https://verified.example.com",
		);
	});

	it("should request bootstrap from an inaccessible consumer only at its exact allowlisted claimed origin", () => {
		const inaccessibleConsumerWindow = createInaccessibleConsumerWindow();
		const postMessage = vi.mocked(inaccessibleConsumerWindow.postMessage);

		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
			inaccessibleConsumerWindow,
		);

		window.name = buildWindowName(
			createPayload({
				uid: "host-uid-unverified-domain",
				tag: "secure-component-unverified-domain",
				consumerDomain: "https://evil.example.com",
			}),
		);
		expect(() => initHost({}, "https://trusted.example.com")).toThrow(
			'Consumer domain "https://evil.example.com" is not allowed',
		);
		expect(postMessage).not.toHaveBeenCalled();

		window.name = buildWindowName(
			createPayload({
				uid: "host-uid-unverified-domain",
				tag: "secure-component-unverified-domain",
				consumerDomain: "https://trusted.example.com/path",
			}),
		);
		expect(() => initHost({}, "https://trusted.example.com")).toThrow(
			"Could not verify consumer origin",
		);
		expect(postMessage).not.toHaveBeenCalled();

		window.name = buildWindowName(
			createPayload({
				uid: "host-uid-unverified-domain",
				tag: "secure-component-unverified-domain",
				consumerDomain: "https://trusted.example.com",
			}),
		);
		const host = initHost({}, "https://trusted.example.com", {
			deferInit: true,
		});

		expect(host?.hostProps.getConsumerDomain()).toBe(
			"https://trusted.example.com",
		);
		expect(postMessage).toHaveBeenCalledOnce();
		expect(postMessage).toHaveBeenCalledWith(
			expect.stringContaining(MESSAGE_NAME.BOOTSTRAP),
			"https://trusted.example.com",
		);
	});

	it("validates late definitions against props received before bootstrap completes", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);
		window.name = buildWindowName(
			createPayload({
				uid: "host-uid-preinit-validation",
				tag: "secure-component-preinit-validation",
			}),
		);

		const host = initHost(undefined, undefined, { deferInit: true });
		expect(host).not.toBeNull();
		const handler = (
			host as unknown as {
				messenger: { handlers: Map<string, DirectHandler> };
			}
		).messenger.handlers.get(MESSAGE_NAME.PROPS);
		expect(
			requireValue(handler)(
				{ amount: "not-a-number" },
				createMessageSource(window, window.location.origin),
			),
		).toEqual({ success: true });
		expect(
			(window as unknown as { hostProps?: unknown }).hostProps,
		).toBeDefined();

		expect(() =>
			initHost(
				{
					amount: { schema: prop.number() },
				},
				undefined,
				{ deferInit: true },
			),
		).toThrow("Validation failed: amount: Expected number, got string");
		expect(
			(window as unknown as { hostProps?: unknown }).hostProps,
		).toBeUndefined();
	});

	it("does not relax required sameDomain props in late definitions before bootstrap completes", () => {
		const inaccessibleConsumerWindow = createInaccessibleConsumerWindow();

		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
			inaccessibleConsumerWindow,
		);
		window.name = buildWindowName(
			createPayload({
				uid: "host-uid-unverified-same-domain-required",
				tag: "secure-component-unverified-same-domain-required",
				consumerDomain: window.location.origin,
			}),
		);

		const host = initHost(undefined, undefined, { deferInit: true });
		expect(host).not.toBeNull();
		const handler = (
			host as unknown as {
				messenger: { handlers: Map<string, DirectHandler> };
			}
		).messenger.handlers.get(MESSAGE_NAME.PROPS);
		expect(
			requireValue(handler)(
				{},
				createMessageSource(inaccessibleConsumerWindow, window.location.origin),
			),
		).toEqual({ success: true });

		expect(() =>
			initHost(
				{
					secret: { schema: prop.string(), sameDomain: true, required: true },
				},
				undefined,
				{ deferInit: true },
			),
		).toThrow('Prop "secret" is required but was not provided');
		expect(
			(window as unknown as { hostProps?: unknown }).hostProps,
		).toBeUndefined();
	});

	it("should clear window.hostProps when existing host fails allowlist recheck", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		const payload = createPayload({
			uid: "host-uid-existing",
			tag: "secure-component-existing",
			consumerDomain: "https://evil.example.com",
		});

		window.name = buildWindowName(payload);

		initHost(undefined, undefined, { deferInit: true });
		expect(
			(window as unknown as { hostProps?: unknown }).hostProps,
		).toBeDefined();

		expect(() => initHost({}, "https://trusted.example.com")).toThrow(
			"is not allowed",
		);
		expect(
			(window as unknown as { hostProps?: unknown }).hostProps,
		).toBeUndefined();
	});

	it("should keep deferred init unsent until explicitly flushed", async () => {
		const { countInitMessages } = await startBootstrappedHost(
			window,
			createPayload({
				uid: "host-uid-deferred",
				tag: "secure-component-deferred",
			}),
		);

		await flushMessages();
		expect(countInitMessages()).toBe(0);
		initHost();
		await vi.waitFor(() => expect(countInitMessages()).toBe(1));
	});

	it("should auto-flush deferred init when window.hostProps is accessed", async () => {
		const { countInitMessages } = await startBootstrappedHost(
			window,
			createPayload({
				uid: "host-uid-deferred-access",
				tag: "secure-component-deferred-access",
			}),
		);

		void (window as unknown as { hostProps?: unknown }).hostProps;
		await vi.waitFor(() => expect(countInitMessages()).toBe(1));
	});

	it("should not send deferred init before allowlist recheck", async () => {
		const { countInitMessages } = await startBootstrappedHost(
			window,
			createPayload({
				uid: "host-uid-deferred-allowlist",
				tag: "secure-component-deferred-allowlist",
			}),
		);

		expect(() => initHost({}, "https://trusted.example.com")).toThrow(
			"is not allowed",
		);
		await flushMessages();
		expect(countInitMessages()).toBe(0);
		expect(
			(window as unknown as { hostProps?: unknown }).hostProps,
		).toBeUndefined();
	});

	it("should not flush deferred init when allowlist recheck fails in the same tick", async () => {
		const { countInitMessages } = await startBootstrappedHost(
			window,
			createPayload({
				uid: "host-uid-deferred-same-tick",
				tag: "secure-component-deferred-same-tick",
			}),
		);

		void (window as unknown as { hostProps?: unknown }).hostProps;
		expect(() => initHost({}, "https://trusted.example.com")).toThrow(
			"is not allowed",
		);

		await flushMessages();

		expect(countInitMessages()).toBe(0);
		expect(
			(window as unknown as { hostProps?: unknown }).hostProps,
		).toBeUndefined();
	});
});
