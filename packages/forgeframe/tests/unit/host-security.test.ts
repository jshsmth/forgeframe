/**
 * Security-oriented tests for host initialization.
 *
 * Covers consumer origin allowlist enforcement, reserved prop names, and pinned consumer sources.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { Messenger } from "@/communication/messenger";
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
import type { OriginMatcher, PropsDefinition } from "@/types";
import { buildWindowName } from "@/window/name-payload";
import type { WindowNamePayload } from "@/window/types";
import { forgeFrameError } from "../forgeframe-error";
import { requireValue } from "../require-value";

const originalWindowName = window.name;
let dispatchedMessageCount = 0;

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
	propDefinitions?: PropsDefinition<Record<string, unknown>>,
): Promise<{ host: HostComponent<Record<string, unknown>> }> {
	vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
		consumerWindow,
	);
	window.name = buildWindowName(payload);
	vi.spyOn(Messenger.prototype, "send")
		.mockResolvedValueOnce({ props })
		.mockResolvedValue(undefined);
	await requireValue(
		initHost({
			...(propDefinitions === undefined ? {} : { props: propDefinitions }),
			consumerOrigins: "*",
			autoInit: false,
		}),
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

/**
 * Waits until `sourceWindow` receives the reply to the last dispatched
 * request, so the host has finished handling it and a negative assertion
 * that follows cannot pass only because the handler has not run yet. Polls
 * microtasks rather than timers.
 */
async function waitForReply(sourceWindow: Window): Promise<void> {
	const requestId = `req-${dispatchedMessageCount}`;
	const replied = () =>
		vi
			.mocked(sourceWindow.postMessage)
			.mock.calls.some(
				([data]) =>
					JSON.parse(String(data).slice("forgeframe:".length)).id === requestId,
			);
	for (let tick = 0; tick < 100 && !replied(); tick++) await Promise.resolve();
	expect(replied()).toBe(true);
}

function readResponseData(sourceWindow: Window): unknown {
	const calls = vi.mocked(sourceWindow.postMessage).mock.calls;
	const lastCall = calls.at(-1);

	if (!lastCall) {
		return undefined;
	}

	return JSON.parse(lastCall[0].slice("forgeframe:".length)).data;
}

afterEach(() => {
	clearHostInstance();
	window.name = originalWindowName;
	dispatchedMessageCount = 0;
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("Host security", () => {
	it("keeps host controls when bootstrap props reuse control names", async () => {
		const consumerWindow = createInaccessibleConsumerWindow();
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
			{ title: prop.string() },
		);

		expect(host.uid).toBe("host-uid-reserved-bootstrap");
		expect(host.tag).toBe("secure-component-reserved-bootstrap");
		expect(typeof host.close).toBe("function");
		// Undeclared fields never arrive, whatever their name.
		expect(await host.ready).toEqual({ title: "Visible title" });
	});

	it("ignores undeclared control names during prop sync", async () => {
		const consumerWindow = createInaccessibleConsumerWindow();
		const { host } = await startBootstrappedHost(
			consumerWindow,
			createPayload({
				uid: "host-uid-reserved-sync",
				tag: "secure-component-reserved-sync",
			}),
			{ amount: 10, close: "initial-close" },
			{
				amount: prop.number().optional(),
				status: prop.string().optional(),
			},
		);
		expect((await host.ready).amount).toBe(10);

		dispatchConsumerMessage(MESSAGE_NAME.PROPS, consumerWindow, {
			data: {
				uid: "spoofed-uid",
				close: "spoofed-close",
				consumer: "spoofed-consumer",
				status: "updated",
			},
			claimedUid: "host-uid-reserved-sync",
		});
		await waitForReply(consumerWindow);

		expect(readResponseData(consumerWindow)).toEqual({ success: true });

		expect((await host.ready).amount).toBeUndefined();
		expect(host.uid).toBe("host-uid-reserved-sync");
		expect(typeof host.close).toBe("function");
		expect(await host.ready).toEqual({ status: "updated" });
	});

	it("should ignore spoofed PROPS from a different trusted window and accept the resolved consumer window", async () => {
		const consumerWindow = createInaccessibleConsumerWindow();
		const spoofedWindow = createInaccessibleConsumerWindow();
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
		host.onProps(onProps);

		dispatchConsumerMessage(MESSAGE_NAME.PROPS, spoofedWindow, {
			data: { amount: 42 },
			claimedUid: "host-uid-pinned-props",
		});
		await waitForReply(spoofedWindow);

		expect(readResponseData(spoofedWindow)).toEqual({ success: false });
		expect(await host.ready).toEqual({ amount: 10 });
		expect(onProps).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();

		dispatchConsumerMessage(MESSAGE_NAME.PROPS, consumerWindow, {
			data: { amount: 42 },
			claimedUid: "host-uid-pinned-props",
		});
		await waitForReply(consumerWindow);

		expect(readResponseData(consumerWindow)).toEqual({ success: true });
		expect(await host.ready).toEqual({ amount: 42 });
		expect(onProps).toHaveBeenCalledTimes(1);
		expect(onProps).toHaveBeenCalledWith({ amount: 42 });
		expect(onError).not.toHaveBeenCalled();
	});

	/** Starts a host for an untrusted consumer and asserts the allowlist is rejected. */
	function expectAllowlistRejected(start: () => unknown): void {
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

		expect(start).toThrow(
			forgeFrameError(
				"VALIDATION",
				"initHost() consumerOrigins must be a non-empty origin string, a RegExp, or an array of them",
			),
		);
		expect(getHost()).toBeNull();
	}

	// Values the types accept but the runtime rejects.
	it.each<{ label: string; allowed: OriginMatcher }>([
		{ label: "an empty string", allowed: "" },
		{ label: "a blank string", allowed: "   " },
		{
			label: "an empty array entry",
			allowed: ["https://trusted.example.com", ""],
		},
	])(
		"rejects $label as an allowlist instead of trusting every consumer",
		({ allowed }) => {
			expectAllowlistRejected(() =>
				initHost({ props: {}, consumerOrigins: allowed }),
			);
		},
	);

	it("rejects a non-pattern entry as an allowlist instead of trusting every consumer", () => {
		expectAllowlistRejected(() =>
			initHost({
				props: {},
				// @ts-expect-error A JavaScript caller can pass a non-pattern entry.
				consumerOrigins: [42],
			}),
		);
	});

	it("rejects null as an allowlist instead of trusting every consumer", () => {
		expectAllowlistRejected(() =>
			initHost({
				props: {},
				// @ts-expect-error A JavaScript caller can pass null.
				consumerOrigins: null,
			}),
		);
	});

	it("rejects a consumer origin browsers never report before reading the window", () => {
		expect(() =>
			initHost({ props: {}, consumerOrigins: "https://Shop.example.com" }),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'initHost() consumerOrigins lists "https://Shop.example.com", which can never match because browsers report it as "https://shop.example.com"',
			),
		);
		expect(getHost()).toBeNull();
	});

	it("rejects a consumer wildcard browsers never report, and a file: origin", () => {
		expect(() =>
			initHost({
				props: {},
				consumerOrigins: "https://*.shop.example.com:443",
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'initHost() consumerOrigins lists "https://*.shop.example.com:443", which can never match because browsers report it as "https://*.shop.example.com"',
			),
		);
		expect(() => initHost({ props: {}, consumerOrigins: "file://" })).toThrow(
			forgeFrameError("VALIDATION", "is not a valid origin"),
		);
		expect(getHost()).toBeNull();
	});

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
			forgeFrameError(
				"ORIGIN_REJECTED",
				'Consumer origin "https://trusted.example.com" is not allowed',
			),
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
		).toThrow(
			forgeFrameError(
				"ORIGIN_REJECTED",
				'Consumer origin "https://evil.example.com" is not allowed',
			),
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

		expect(() =>
			initHost({ props: {}, consumerOrigins: "https://trusted.example.com" }),
		).toThrow(forgeFrameError("ORIGIN_REJECTED", "is not allowed"));

		expect(window.name).toBe(bootstrapWindowName);
		expect(getHost()).toBeNull();

		const host = initHost({
			props: {},
			consumerOrigins: "https://evil.example.com",
			autoInit: false,
		});

		expect(host).not.toBeNull();
		expect(host?.consumerOrigin).toBe("https://evil.example.com");
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
		expect(host?.consumerOrigin).toBe("https://api.trusted.example.com");
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
		).toThrow(forgeFrameError("ORIGIN_REJECTED", "https://evil.example.com"));
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

		expect(host?.consumerOrigin).toBe("https://verified.example.com");
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
		).toThrow(
			forgeFrameError(
				"ORIGIN_REJECTED",
				'Consumer origin "https://evil.example.com" is not allowed',
			),
		);
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
		).toThrow(
			forgeFrameError("ORIGIN_REJECTED", "Could not verify consumer origin"),
		);
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

		expect(host?.consumerOrigin).toBe("https://trusted.example.com");
		expect(postMessage).toHaveBeenCalledOnce();
		expect(postMessage).toHaveBeenCalledWith(
			expect.stringContaining(MESSAGE_NAME.BOOTSTRAP),
			"https://trusted.example.com",
		);
	});
});
