/**
 * Security-oriented tests for host initialization.
 *
 * Covers consumer origin allowlist enforcement, reserved prop names, and pinned consumer sources.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { type MessageHandler, Messenger } from "@/communication/messenger";
import {
	createRequestMessage,
	serializeMessage,
} from "@/communication/protocol";
import { CONTEXT, MESSAGE_NAME, PROTOCOL_VERSION } from "@/constants";
import {
	clearHostInstance,
	getHost,
	type HostComponent,
	initHost,
} from "@/core/host";
import * as hostSecurity from "@/core/host/security";
import { prop } from "@/props/prop";
import type { HostPropsDefinition } from "@/types";
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
 * Starts a deferred host whose verified bootstrap delivers `props`, and
 * returns its runtime so tests can reach the messenger and events.
 */
async function startBootstrappedHost(
	consumerWindow: Window,
	payload: WindowNamePayload,
	props: Record<string, unknown> = {},
	propDefinitions?: HostPropsDefinition<Record<string, unknown>>,
): Promise<{ host: HostComponent<Record<string, unknown>> }> {
	vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
		consumerWindow,
	);
	window.name = buildWindowName(payload);
	vi.spyOn(Messenger.prototype, "send")
		.mockResolvedValueOnce({ props })
		.mockResolvedValue(undefined);
	await requireValue(
		initHost({ props: propDefinitions, consumerOrigins: "*", autoInit: false }),
	).ready;
	return { host: requireValue(getHost()) };
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
		expect(Object.keys(host.hostProps.consumer)).toEqual(["props"]);
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
		expect(Object.keys(host.hostProps.consumer)).toEqual(["props"]);
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
		const onError = vi.fn();
		host.event.on("error", onError);
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
		expect(onError).not.toHaveBeenCalled();

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
		expect(onError).not.toHaveBeenCalled();
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
				initHost({
					props: {},
					// @ts-expect-error Invalid JavaScript configuration is rejected at runtime.
					consumerOrigins: allowed,
				}),
			).toThrow(
				"initHost() consumerOrigins must be a non-empty origin string, a RegExp, or an array of them",
			);
			expect(getHost()).toBeNull();
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

		expect(() => initHost({ props: {}, consumerOrigins: [] })).toThrow(
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

		expect(() =>
			initHost({ props: {}, consumerOrigins: "https://trusted.example.com" }),
		).toThrow('Consumer domain "https://evil.example.com" is not allowed');
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

		expect(() =>
			initHost({ props: {}, consumerOrigins: "https://trusted.example.com" }),
		).toThrow("is not allowed");

		expect(window.name).toBe(bootstrapWindowName);
		expect(getHost()).toBeNull();

		const host = initHost({
			props: {},
			consumerOrigins: "https://evil.example.com",
			autoInit: false,
		});

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

		const host = initHost({
			props: {},
			consumerOrigins: "https://*.trusted.example.com",
			autoInit: false,
		});

		expect(host).not.toBeNull();
		expect(host?.hostProps.getConsumerDomain()).toBe(
			"https://api.trusted.example.com",
		);
		expect(Object.hasOwn(window, "hostProps")).toBe(false);
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

		expect(() =>
			initHost({ props: {}, consumerOrigins: "https://trusted.example.com" }),
		).toThrow("https://evil.example.com");
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

		const host = initHost({ consumerOrigins: "*", autoInit: false });

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
		expect(() =>
			initHost({ props: {}, consumerOrigins: "https://trusted.example.com" }),
		).toThrow('Consumer domain "https://evil.example.com" is not allowed');
		expect(postMessage).not.toHaveBeenCalled();

		window.name = buildWindowName(
			createPayload({
				uid: "host-uid-unverified-domain",
				tag: "secure-component-unverified-domain",
				consumerDomain: "https://trusted.example.com/path",
			}),
		);
		expect(() =>
			initHost({ props: {}, consumerOrigins: "https://trusted.example.com" }),
		).toThrow("Could not verify consumer origin");
		expect(postMessage).not.toHaveBeenCalled();

		window.name = buildWindowName(
			createPayload({
				uid: "host-uid-unverified-domain",
				tag: "secure-component-unverified-domain",
				consumerDomain: "https://trusted.example.com",
			}),
		);
		const host = initHost({
			props: {},
			consumerOrigins: "https://trusted.example.com",
			autoInit: false,
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
});
