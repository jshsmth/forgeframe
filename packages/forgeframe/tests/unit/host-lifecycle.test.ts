/**
 * Lifecycle tests for `@/core/host` runtime behavior.
 *
 * Covers consumer control channels, props synchronization/subscriber behavior, and consumer window resolution rules.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { type MessageHandler, Messenger } from "@/communication/messenger";
import { CONTEXT, EVENT, MESSAGE_NAME, PROTOCOL_VERSION } from "@/constants";
import { ConsumerComponent } from "@/core/consumer";
import {
	clearHostInstance,
	getHost,
	HostComponent,
	initHost,
	isHost,
} from "@/core/host";
import * as hostSecurity from "@/core/host/security";
import { prop } from "@/props/prop";
import type { PropsDefinition } from "@/types";
import { createDeferred } from "@/utils/promise";
import * as helpers from "@/window/helpers";
import { buildWindowName } from "@/window/name-payload";
import type { WindowNamePayload } from "@/window/types";
import { requireValue } from "../require-value";

const originalWindowName = window.name;
const createdConsumers: Array<ConsumerComponent<Record<string, unknown>>> = [];
type HandlerSource = Parameters<MessageHandler>[1];
type DirectHandler = (data: unknown, source: HandlerSource) => unknown;

/**
 * Builds current-protocol channel metadata for a host window.
 */
function createPayload(
	overrides: Partial<WindowNamePayload> = {},
): WindowNamePayload {
	return {
		uid: "host-lifecycle-uid",
		tag: "host-lifecycle-component",
		protocolVersion: PROTOCOL_VERSION,
		context: CONTEXT.IFRAME,
		consumerDomain: "https://consumer.example.com",
		...overrides,
	};
}

/** Reads a runtime's live props object, which `ready` resolves to, before it settles. */
function readLiveProps(host: object): Record<string, unknown> {
	return (host as { propsRuntime: { props: Record<string, unknown> } })
		.propsRuntime.props;
}

/**
 * Creates a host instance while stubbing consumer window resolution behavior.
 */
function createHost({
	payload = createPayload(),
	autoInit = false,
	consumerWindow = window,
	propDefinitions = { amount: prop.any() },
}: {
	payload?: WindowNamePayload;
	autoInit?: boolean;
	consumerWindow?: Window;
	propDefinitions?: PropsDefinition<Record<string, unknown>>;
} = {}): HostComponent<Record<string, unknown>> {
	vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
		consumerWindow,
	);

	return new HostComponent(payload, {
		props: propDefinitions,
		consumerOrigins: "*",
		consumerWindow,
		autoInit,
	});
}

/**
 * Creates a host whose verified bootstrap response carries the given props.
 * Await `ready` before relying on the bootstrapped snapshot.
 */
function createBootstrappingHost(
	props: Record<string, unknown>,
	options: Parameters<typeof createHost>[0] = {},
): HostComponent<Record<string, unknown>> {
	vi.spyOn(Messenger.prototype, "send").mockResolvedValueOnce({ props });
	return createHost(options);
}

/**
 * Creates a host and waits for its verified bootstrap to deliver the props.
 */
async function createBootstrappedHost(
	props: Record<string, unknown> = { amount: 10 },
	options: Parameters<typeof createHost>[0] = {},
): Promise<HostComponent<Record<string, unknown>>> {
	const host = createBootstrappingHost(props, options);
	await host.ready;
	return host;
}

/**
 * Creates a consumer instance for transport bootstrap tests.
 */
function createConsumer(
	{
		url = "https://host.example.com/widget",
		props = {},
	}: {
		url?: string;
		props?: Record<string, unknown>;
	} = {},
	inputProps: Record<string, unknown> = {},
): ConsumerComponent<Record<string, unknown>> {
	const consumer = new ConsumerComponent<Record<string, unknown>>(
		{
			tag: "host-lifecycle-consumer-component",
			url,
			props,
		} as never,
		inputProps,
	);
	createdConsumers.push(consumer);
	return consumer;
}

function createMessageSource(
	windowRef: Window,
	domain = windowRef.location?.origin ?? "https://consumer.example.com",
): HandlerSource {
	return {
		uid: "consumer-source",
		domain,
		window: windowRef,
	};
}

afterEach(async () => {
	for (const consumer of createdConsumers.splice(0)) {
		await consumer.close();
	}
	clearHostInstance();
	vi.restoreAllMocks();
	window.name = originalWindowName;
});

describe("Host lifecycle behavior", () => {
	it("keeps consumer-only fields out of an acknowledged update that outlives a pending bootstrap", async () => {
		const bootstrap = createDeferred<{
			props: { amount: number; local: string };
		}>();
		vi.spyOn(Messenger.prototype, "send").mockImplementation(
			() => bootstrap.promise,
		);
		const host = createHost({
			propDefinitions: {
				amount: prop.number(),
				local: { schema: prop.string(), sendToHost: false },
			},
		});
		try {
			const propsHandler = requireValue(
				(
					host as unknown as {
						messenger: { handlers: Map<string, DirectHandler> };
					}
				).messenger.handlers.get(MESSAGE_NAME.PROPS),
			);
			expect(
				propsHandler(
					{ amount: 42, local: "new private" },
					createMessageSource(window),
				),
			).toEqual({ success: true });
			expect(readLiveProps(host)).toEqual({ amount: 42 });
			bootstrap.resolve({ props: { amount: 10, local: "old private" } });
			expect(await host.ready).toEqual({ amount: 42 });
		} finally {
			host.destroy();
		}
	});

	it("preserves the latest acknowledged update when an older bootstrap response arrives", async () => {
		const bootstrap = createDeferred<{ props: { amount: number } }>();
		vi.spyOn(Messenger.prototype, "send").mockImplementation(
			() => bootstrap.promise,
		);
		const host = createHost();
		const propsHandler = (
			host as unknown as { messenger: { handlers: Map<string, DirectHandler> } }
		).messenger.handlers.get(MESSAGE_NAME.PROPS);
		expect(propsHandler?.({ amount: 42 }, createMessageSource(window))).toEqual(
			{ success: true },
		);
		expect(readLiveProps(host).amount).toBe(42);
		bootstrap.resolve({ props: { amount: 10 } });
		expect((await host.ready).amount).toBe(42);
		host.destroy();
	});

	it("drops a then field from an unchecked consumer, so ready still resolves", async () => {
		const host = await createBootstrappedHost(
			// biome-ignore lint/suspicious/noThenProperty: checks the reserved name
			{ then: "not a promise", children: "jsx", amount: 2 },
			{ propDefinitions: "unchecked" as never },
		);
		try {
			expect(await host.ready).toEqual({ amount: 2 });
		} finally {
			host.destroy();
		}
	});

	it("notifies subscribers once when bootstrap completes", async () => {
		const bootstrap = createDeferred<{ props: { amount: number } }>();
		vi.spyOn(Messenger.prototype, "send").mockImplementation(
			() => bootstrap.promise,
		);
		const host = createHost();
		try {
			const notifications: unknown[] = [];
			host.onProps((props) => {
				notifications.push(props.amount);
			});
			const propsHandler = requireValue(
				(
					host as unknown as {
						messenger: { handlers: Map<string, DirectHandler> };
					}
				).messenger.handlers.get(MESSAGE_NAME.PROPS),
			);
			expect(propsHandler({ amount: 42 }, createMessageSource(window))).toEqual(
				{ success: true },
			);
			expect(notifications).toEqual([]);

			bootstrap.resolve({ props: { amount: 10 } });
			await host.ready;

			expect(notifications).toEqual([42]);
			expect(await host.ready).not.toHaveProperty("children");
		} finally {
			host.destroy();
		}
	});

	it("should withhold all props until the messaging bootstrap completes", () => {
		const definitions = {
			label: { schema: prop.string() },
			secret: { schema: prop.string(), deliverTo: "same-origin" },
		};
		const consumer = createConsumer(
			{
				url: "/widget",
				props: definitions,
			},
			{
				label: "visible",
				secret: "same-origin-only",
			},
		);

		window.name = (
			consumer as unknown as {
				buildWindowName: () => string;
			}
		).buildWindowName();

		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		const host = initHost({
			props: definitions,
			consumerOrigins: "*",
			autoInit: false,
		});

		expect(host).not.toBeNull();
		expect(readLiveProps(requireValue(getHost()))).toEqual({});
	});

	it("keeps the channel metadata in window.name after host initialization", async () => {
		const bootstrapWindowName = buildWindowName(createPayload());
		window.name = bootstrapWindowName;

		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);
		const sendSpy = vi
			.spyOn(Messenger.prototype, "send")
			.mockResolvedValueOnce({ props: { amount: 42 } })
			.mockResolvedValue(undefined);

		const host = requireValue(
			initHost({ props: { amount: prop.number() }, consumerOrigins: "*" }),
		);

		expect(window.name).toBe(bootstrapWindowName);
		expect(isHost()).toBe(true);
		expect(getHost()?.uid).toBe(host.uid);
		await host.ready;
		expect((await host.ready).amount).toBe(42);
		expect(window.name).toBe(bootstrapWindowName);
		await vi.waitFor(() =>
			expect(sendSpy.mock.calls.map(([, , name]) => name)).toContain(
				MESSAGE_NAME.INIT,
			),
		);
	});

	it("should not create a host instance for invalid bootstrap payloads", () => {
		const invalidName = "__forgeframe__not-valid-base64";
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		window.name = invalidName;

		expect(initHost({ consumerOrigins: "*" })).toBeNull();
		expect(isHost()).toBe(false);
		expect(getHost()).toBeNull();
		expect(window.name).toBe(invalidName);
		expect(errorSpy).toHaveBeenCalledWith(
			"Failed to parse ForgeFrame payload from window.name",
		);
	});

	it("requires same-origin props on a verified same-origin host", async () => {
		window.name = buildWindowName(
			createPayload({ consumerDomain: window.location.origin }),
		);
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);
		vi.spyOn(Messenger.prototype, "send").mockResolvedValueOnce({
			props: { label: "visible" },
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const host = requireValue(
			initHost({
				props: {
					label: prop.string(),
					secret: { schema: prop.string(), deliverTo: "same-origin" },
				},
				consumerOrigins: window.location.origin,
				autoInit: false,
			}),
		);

		await expect(host.ready).rejects.toThrow(
			"Validation failed: secret: Required",
		);
		expect(host.consumerOrigin).toBe(window.location.origin);
		expect(getHost()).toBeNull();
	});

	it("neither expects nor accepts props withheld from a cross-origin host", async () => {
		const crossOriginConsumerWindow = {
			postMessage: vi.fn(),
			location: { origin: "https://consumer.example.com" },
		} as unknown as Window;

		const host = createBootstrappingHost(
			{ label: "visible", secret: "stale", partner: "stale" },
			{
				consumerWindow: crossOriginConsumerWindow,
				propDefinitions: {
					label: prop.string(),
					secret: { schema: prop.string(), deliverTo: "same-origin" },
					partner: {
						schema: prop.string(),
						deliverTo: "https://partner.example.com",
					},
				},
			},
		);
		const hostProps = await host.ready;

		expect(hostProps.label).toBe("visible");
		expect(hostProps).not.toHaveProperty("secret");
		expect(hostProps).not.toHaveProperty("partner");
		expect(hostProps).toEqual({ label: "visible" });
	});

	it("should isolate failing props subscribers and continue notifying others", async () => {
		const host = await createBootstrappedHost();
		const propsHandler = (
			host as unknown as { messenger: { handlers: Map<string, DirectHandler> } }
		).messenger.handlers.get(MESSAGE_NAME.PROPS);

		expect(propsHandler).toBeDefined();

		const throwingSubscriber = vi.fn(() => {
			throw new Error("subscriber failed");
		});
		const healthySubscriber = vi.fn();
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		host.onProps(throwingSubscriber);
		host.onProps(healthySubscriber);

		const result = requireValue(propsHandler)(
			{ amount: 77 },
			createMessageSource(window),
		);

		expect(result).toEqual({ success: true });
		expect(throwingSubscriber).toHaveBeenCalled();
		expect(healthySubscriber).toHaveBeenCalledWith({ amount: 77 });
		expect(consoleSpy).toHaveBeenCalledWith(
			"Error in props handler:",
			expect.any(Error),
		);
	});

	it.each(["promise", "thenable"])(
		"should isolate a rejected async props subscriber returning a %s",
		async (kind) => {
			const host = await createBootstrappedHost();
			const error = new Error("Async subscriber failure");
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			const order: string[] = [];
			host.onProps(() => {
				order.push("failing");
				return kind === "promise"
					? Promise.reject(error)
					: {
							// biome-ignore lint/suspicious/noThenProperty: Exercise subscriber rejection from an intentional thenable.
							then: (_resolve: unknown, reject: (error: Error) => void) =>
								reject(error),
						};
			});
			host.onProps(() => {
				order.push("healthy");
			});
			const propsHandler = (
				host as unknown as {
					messenger: { handlers: Map<string, DirectHandler> };
				}
			).messenger.handlers.get(MESSAGE_NAME.PROPS);
			expect(
				propsHandler?.({ amount: 77 }, createMessageSource(window)),
			).toEqual({ success: true });
			expect(order).toEqual(["failing", "healthy"]);
			expect((await host.ready).amount).toBe(77);
			await vi.waitFor(() =>
				expect(consoleSpy).toHaveBeenCalledWith(
					"Error in props handler:",
					error,
				),
			);
		},
	);

	it("should cancel subscriptions and retain rejection handling after destruction", async () => {
		const host = await createBootstrappedHost();
		const cancelled = vi.fn();
		host.onProps(cancelled)();
		let rejectObserver: ((error: Error) => void) | undefined;
		host.onProps(
			() =>
				new Promise<void>((_resolve, reject) => {
					rejectObserver = reject;
				}),
		);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const propsHandler = (
			host as unknown as { messenger: { handlers: Map<string, DirectHandler> } }
		).messenger.handlers.get(MESSAGE_NAME.PROPS);
		expect(propsHandler?.({ amount: 78 }, createMessageSource(window))).toEqual(
			{ success: true },
		);
		expect(cancelled).not.toHaveBeenCalled();
		host.destroy();
		const error = new Error("Observer settled after teardown");
		rejectObserver?.(error);
		await vi.waitFor(() =>
			expect(consoleSpy).toHaveBeenCalledWith("Error in props handler:", error),
		);
	});

	it("should acknowledge updates without waiting for an async subscriber", async () => {
		const host = await createBootstrappedHost();
		let resolveObserver: (() => void) | undefined;
		host.onProps(
			() =>
				new Promise<void>((resolve) => {
					resolveObserver = resolve;
				}),
		);
		const healthy = vi.fn();
		host.onProps(healthy);
		const propsHandler = (
			host as unknown as { messenger: { handlers: Map<string, DirectHandler> } }
		).messenger.handlers.get(MESSAGE_NAME.PROPS);
		expect(propsHandler?.({ amount: 88 }, createMessageSource(window))).toEqual(
			{ success: true },
		);
		expect(healthy).toHaveBeenCalledWith({ amount: 88 });
		resolveObserver?.();
	});

	it("should emit host error and rethrow when a props update cannot be applied", () => {
		const host = createHost({
			propDefinitions: { amount: prop.number().optional() },
		});
		const propsHandler = (
			host as unknown as { messenger: { handlers: Map<string, DirectHandler> } }
		).messenger.handlers.get(MESSAGE_NAME.PROPS);

		expect(propsHandler).toBeDefined();

		const emitSpy = vi.spyOn(host.event, "emit");
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		expect(() =>
			requireValue(propsHandler)(
				{ amount: "not a number" },
				createMessageSource(window),
			),
		).toThrow("Validation failed: amount");
		expect(emitSpy).toHaveBeenCalledWith(EVENT.ERROR, expect.any(Error));
		expect(consoleSpy).toHaveBeenCalledWith(
			"Error deserializing props:",
			expect.any(Error),
		);
	});

	it("should reject invalid PROPS updates before mutating hostProps", async () => {
		const typedHost = await createBootstrappedHost(
			{ amount: 10 },
			{ propDefinitions: { amount: { schema: prop.number() } } },
		);
		const propsHandler = (
			typedHost as unknown as {
				messenger: { handlers: Map<string, DirectHandler> };
			}
		).messenger.handlers.get(MESSAGE_NAME.PROPS);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		expect(propsHandler).toBeDefined();
		expect(() =>
			requireValue(propsHandler)(
				{ amount: "bad-update" },
				createMessageSource(window),
			),
		).toThrow("Validation failed: amount: Expected number, got string");
		expect(await typedHost.ready).toEqual({ amount: 10 });
		expect(consoleSpy).toHaveBeenCalledWith(
			"Error deserializing props:",
			expect.any(Error),
		);
		typedHost.destroy();
	});

	it("should resolve consumer window from iframe consumer when available", () => {
		const consumerWindow = { postMessage: vi.fn() } as unknown as Window;
		vi.spyOn(helpers, "isIframe").mockReturnValue(true);
		vi.spyOn(helpers, "getConsumer").mockReturnValue(consumerWindow);
		vi.spyOn(helpers, "isPopup").mockReturnValue(false);

		expect(hostSecurity.resolveConsumerWindow()).toBe(consumerWindow);
	});

	it("should resolve consumer window from popup opener when available", () => {
		const openerWindow = { postMessage: vi.fn() } as unknown as Window;
		vi.spyOn(helpers, "isIframe").mockReturnValue(false);
		vi.spyOn(helpers, "isPopup").mockReturnValue(true);
		vi.spyOn(helpers, "getOpener").mockReturnValue(openerWindow);

		expect(hostSecurity.resolveConsumerWindow()).toBe(openerWindow);
	});

	it("should throw when no consumer window can be resolved", () => {
		vi.spyOn(helpers, "isIframe").mockReturnValue(false);
		vi.spyOn(helpers, "isPopup").mockReturnValue(false);

		expect(() => hostSecurity.resolveConsumerWindow()).toThrow(
			expect.objectContaining({
				code: "CLOSED",
				message: "Could not resolve consumer window",
			}),
		);
	});
});
