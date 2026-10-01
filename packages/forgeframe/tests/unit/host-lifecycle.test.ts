/**
 * Lifecycle tests for `@/core/host` runtime behavior.
 *
 * Covers consumer control channels, props synchronization/subscriber behavior, and consumer window resolution rules.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type MessageHandler, Messenger } from "@/communication/messenger";
import type { ConsumerExports } from "@/communication/types";
import {
	CONTEXT,
	EVENT,
	MESSAGE_NAME,
	PROTOCOL_VERSION,
	VERSION,
} from "@/constants";
import { create } from "@/core/component";
import { deleteRegisteredComponent } from "@/core/component-registry";
import { ConsumerComponent } from "@/core/consumer";
import {
	clearHostInstance,
	getHostProps,
	HostComponent,
	initHost,
	isEmbedded,
	isHost,
} from "@/core/host";
import * as hostSecurity from "@/core/host/security";
import { prop } from "@/props/prop";
import { createDeferred } from "@/utils/promise";
import * as helpers from "@/window/helpers";
import { buildWindowName } from "@/window/name-payload";
import type { WindowNamePayload } from "@/window/types";
import { requireValue } from "../require-value";

const VALID_EXPORTS: ConsumerExports = {
	init: MESSAGE_NAME.INIT,
	close: MESSAGE_NAME.CLOSE,
	resize: MESSAGE_NAME.RESIZE,
	show: MESSAGE_NAME.SHOW,
	hide: MESSAGE_NAME.HIDE,
	onError: MESSAGE_NAME.ERROR,
	updateProps: MESSAGE_NAME.PROPS,
	export: MESSAGE_NAME.EXPORT,
};

const originalWindowName = window.name;
const createdConsumers: Array<ConsumerComponent<Record<string, unknown>>> = [];
type HandlerSource = Parameters<MessageHandler>[1];
type DirectHandler = (data: unknown, source: HandlerSource) => unknown;

/**
 * Builds a host window payload with default props and domain metadata.
 */
function createPayload(
	overrides: Partial<WindowNamePayload<Record<string, unknown>>> = {},
): WindowNamePayload<Record<string, unknown>> {
	return {
		uid: "host-lifecycle-uid",
		tag: "host-lifecycle-component",
		version: VERSION,
		context: CONTEXT.IFRAME,
		consumerDomain: "https://consumer.example.com",
		props: { amount: 10 },
		exports: VALID_EXPORTS,
		...overrides,
	};
}

/**
 * Creates a host instance while stubbing consumer window resolution behavior.
 */
function createHost({
	payload = createPayload(),
	deferInit = true,
	consumerWindow = window,
}: {
	payload?: WindowNamePayload<Record<string, unknown>>;
	deferInit?: boolean;
	consumerWindow?: Window;
} = {}): HostComponent<Record<string, unknown>> {
	vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
		consumerWindow,
	);

	return new HostComponent(payload, {}, undefined, deferInit);
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
	delete (window as unknown as { hostProps?: unknown }).hostProps;
	window.name = originalWindowName;
});

describe("Host lifecycle behavior", () => {
	it.each([
		{ configure: "initHost", deferInit: true },
		{ configure: "initHost", deferInit: false },
		{ configure: "create", deferInit: true },
		{ configure: "create", deferInit: false },
	])(
		"preserves a legacy host after same-turn rejected $configure configuration with deferInit=$deferInit",
		({ configure, deferInit }) => {
			const payload = createPayload({
				tag: `legacy-replacement-${configure}-${deferInit}`,
			});
			window.name = buildWindowName(payload);
			vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);
			const definitions = { amount: prop.number() };
			const host = requireValue(
				initHost(definitions, undefined, { deferInit }),
			);
			const snapshot = host.hostProps;
			const destroy = vi.spyOn(host, "destroy");
			const notified = vi.fn();
			snapshot.onProps(notified);
			try {
				expect(() => {
					const invalid = { amount: prop.string() };
					if (configure === "initHost")
						initHost(invalid, undefined, { deferInit });
					else
						create({
							tag: payload.tag,
							url: "https://host.example.com/widget",
							props: invalid,
						});
				}).toThrow("Expected string, got number");
				expect(getHostProps()).toBe(snapshot);
				expect(destroy).not.toHaveBeenCalled();
				expect(initHost(definitions, undefined, { deferInit })).toBe(host);
				const handler = (
					host as unknown as {
						messenger: { handlers: Map<string, DirectHandler> };
					}
				).messenger.handlers.get(MESSAGE_NAME.PROPS);
				expect(
					requireValue(handler)({ amount: 11 }, createMessageSource(window)),
				).toEqual({ success: true });
				expect(snapshot.amount).toBe(11);
				expect(notified).toHaveBeenCalledOnce();
				expect(notified).toHaveBeenCalledWith({ amount: 11 });
			} finally {
				deleteRegisteredComponent(payload.tag);
			}
		},
	);

	it("reconciles late private fields only after replacement validation succeeds", () => {
		const host = createHost({
			payload: createPayload({
				props: { amount: 10, local: "private", close: "wire value" },
			}),
		});
		try {
			const previous = host.hostProps.consumer.props;
			const close = host.hostProps.close;
			const privateDefinitions = {
				local: { schema: prop.string(), required: true, sendToHost: false },
				close: { schema: prop.string(), sendToHost: false },
			};
			expect(() =>
				host.applyHostConfiguration({
					...privateDefinitions,
					amount: prop.number().min(100),
				}),
			).toThrow("Number must be >= 100");
			expect(host.hostProps.consumer.props).toBe(previous);
			expect(host.hostProps.local).toBe("private");
			const propsHandler = requireValue(
				(
					host as unknown as {
						messenger: { handlers: Map<string, DirectHandler> };
					}
				).messenger.handlers.get(MESSAGE_NAME.PROPS),
			);
			expect(
				propsHandler(
					{ amount: 11, local: "next", close: "wire value" },
					createMessageSource(window),
				),
			).toEqual({ success: true });
			expect(host.hostProps.local).toBe("next");
			const definitions = { ...privateDefinitions, amount: prop.number() };
			host.applyHostConfiguration(definitions);
			expect(host.hostProps.consumer.props).toEqual({ amount: 11 });
			expect(Object.hasOwn(host.hostProps, "local")).toBe(false);
			expect(host.hostProps.close).toBe(close);
			const filtered = host.hostProps.consumer.props;
			host.applyHostConfiguration(definitions);
			expect(host.hostProps.consumer.props).toBe(filtered);
		} finally {
			host.destroy();
		}
	});

	it("does not restore purged acknowledged fields when pending bootstrap completes", async () => {
		const bootstrap = createDeferred<{
			props: { amount: number; local: string };
		}>();
		vi.spyOn(Messenger.prototype, "send").mockImplementation(
			() => bootstrap.promise,
		);
		const host = createHost({
			payload: createPayload({ protocolVersion: PROTOCOL_VERSION }),
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
			host.applyHostConfiguration({
				amount: prop.number(),
				local: { schema: prop.string(), required: true, sendToHost: false },
			});
			expect(host.hostProps.consumer.props).toEqual({ amount: 42 });
			bootstrap.resolve({ props: { amount: 10, local: "old private" } });
			await host.ready;
			expect(host.hostProps.consumer.props).toEqual({ amount: 42 });
			expect(Object.hasOwn(host.hostProps, "local")).toBe(false);
		} finally {
			host.destroy();
		}
	});

	it("discards consumer-only fields in legacy bootstrap payloads", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);
		const host = new HostComponent(
			createPayload({ props: { amount: 10, local: 42 } }),
			{
				amount: prop.number(),
				local: { schema: prop.string(), required: true, sendToHost: false },
			},
			undefined,
			true,
		);
		try {
			expect(host.hostProps.amount).toBe(10);
			expect(host.hostProps.consumer.props).toEqual({ amount: 10 });
			expect(Object.hasOwn(host.hostProps, "local")).toBe(false);
		} finally {
			host.destroy();
		}
	});

	it("preserves the latest acknowledged update when an older bootstrap response arrives", async () => {
		const bootstrap = createDeferred<{ props: { amount: number } }>();
		vi.spyOn(Messenger.prototype, "send").mockImplementation(
			() => bootstrap.promise,
		);
		const host = createHost({
			payload: createPayload({ protocolVersion: PROTOCOL_VERSION }),
		});
		const propsHandler = (
			host as unknown as { messenger: { handlers: Map<string, DirectHandler> } }
		).messenger.handlers.get(MESSAGE_NAME.PROPS);
		expect(propsHandler?.({ amount: 42 }, createMessageSource(window))).toEqual(
			{ success: true },
		);
		expect(host.hostProps.amount).toBe(42);
		bootstrap.resolve({ props: { amount: 10 } });
		await host.ready;
		expect(host.hostProps.amount).toBe(42);
		host.destroy();
	});

	it("should withhold all props until the messaging bootstrap completes", () => {
		const definitions = {
			label: { schema: prop.string() },
			secret: { schema: prop.string(), sameDomain: true },
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

		const host = initHost(definitions, undefined, { deferInit: true });

		expect(host).not.toBeNull();
		expect(requireValue(host).hostProps.label).toBeUndefined();
		expect(requireValue(host).hostProps.secret).toBeUndefined();
	});

	it("should clear the bootstrap window name after host initialization", async () => {
		const payload = createPayload({
			props: { amount: 42 },
		});
		window.name = buildWindowName(payload);

		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		const host = initHost(undefined, undefined, { deferInit: true });
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

		expect(host).not.toBeNull();
		expect(window.name).toBe("");
		expect(isHost()).toBe(true);
		expect(isEmbedded()).toBe(true);
		expect(getHostProps()).toBe(host?.hostProps);
		expect(host?.hostProps.amount).toBe(42);

		await Promise.resolve();
		expect(sendSpy).toHaveBeenCalled();
	});

	it("should validate transformed consumer outputs with the host output schema", async () => {
		const definitions = {
			amount: {
				schema: z.string().transform(Number),
				outputSchema: z.number(),
				default: "41",
				decorate: ({ value }: { value: number }) => value + 1,
			},
		};
		const consumer = createConsumer({
			url: "/widget",
			props: definitions,
		});

		window.name = (
			consumer as unknown as { buildWindowName: () => string }
		).buildWindowName();
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		vi.spyOn(Messenger.prototype, "send").mockResolvedValueOnce({
			props: { amount: 42 },
		});
		const host = initHost<{ amount: number }, { amount: string }>(
			definitions,
			undefined,
			{ deferInit: true },
		);
		await host?.ready;

		expect(host?.hostProps.amount).toBe(42);
		expect(host?.hostProps.consumer.props).toMatchObject({ amount: 42 });
	});

	it("should let the output schema decide whether a required input may normalize to undefined", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		const optionalOutputDefinitions = {
			amount: {
				schema: z
					.string()
					.transform((value) =>
						value === "empty" ? undefined : Number(value),
					),
				outputSchema: z.number().optional(),
				required: true,
			},
		};

		const optionalOutputHost = new HostComponent(
			createPayload({ props: {} }),
			optionalOutputDefinitions,
			undefined,
			true,
		);
		expect(optionalOutputHost.hostProps.amount).toBeUndefined();
		optionalOutputHost.destroy();

		const unconfiguredHost = new HostComponent(
			createPayload({ props: {} }),
			{},
			undefined,
			true,
		);
		expect(() =>
			unconfiguredHost.applyHostConfiguration(optionalOutputDefinitions),
		).not.toThrow();
		unconfiguredHost.destroy();

		expect(
			() =>
				new HostComponent(
					createPayload({ props: {} }),
					{
						amount: {
							schema: z.string().transform(Number),
							outputSchema: z.number(),
							required: true,
						},
					},
					undefined,
					true,
				),
		).toThrow("Invalid input: expected number, received undefined");
	});

	it("should reject normalized host props that fail their output schema", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		expect(
			() =>
				new HostComponent(
					createPayload({ props: { amount: -1 } }),
					{
						amount: {
							schema: z.string().transform(Number),
							outputSchema: z.number().nonnegative(),
						},
					},
					undefined,
					true,
				),
		).toThrow("Too small: expected number to be >=0");
	});

	it("should reject output schemas that transform normalized host props", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		expect(
			() =>
				new HostComponent(
					createPayload({ props: { amount: 1 } }),
					{
						amount: {
							schema: z.string().transform(Number),
							outputSchema: z.number().transform((value) => value + 1),
						},
					},
					undefined,
					true,
				),
		).toThrow(
			"Validation failed: amount: value no longer matches its normalized schema output",
		);
	});

	it("should validate normalized props when host configuration arrives after bootstrap", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		const host = new HostComponent(
			createPayload({ props: { amount: 42 } }),
			{},
			undefined,
			true,
		);

		expect(() =>
			host.applyHostConfiguration({
				amount: {
					schema: z.string().transform(Number),
					outputSchema: z.number().int().positive(),
				},
			}),
		).not.toThrow();
		expect(host.hostProps.amount).toBe(42);
	});

	it("should preserve the previous host configuration when a replacement is invalid", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		const host = new HostComponent(
			createPayload({ props: { amount: 10 } }),
			{ amount: { schema: prop.number() } },
			undefined,
			true,
		);

		expect(() =>
			host.applyHostConfiguration({
				amount: {
					schema: z.string().transform(Number),
					outputSchema: z.number().min(100),
				},
			}),
		).toThrow("Too small: expected number to be >=100");

		const propsHandler = (
			host as unknown as {
				messenger: { handlers: Map<string, DirectHandler> };
			}
		).messenger.handlers.get(MESSAGE_NAME.PROPS);

		expect(propsHandler).toBeDefined();
		expect(
			requireValue(propsHandler)({ amount: 11 }, createMessageSource(window)),
		).toEqual({
			success: true,
		});
		expect(host.hostProps.amount).toBe(11);
	});

	it("should clear the bootstrap window name but preserve same-page retry when host prop validation fails", () => {
		const payload = createPayload({
			props: { amount: "not-a-number" },
		});
		const bootstrapWindowName = buildWindowName(payload);
		window.name = bootstrapWindowName;

		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		expect(() =>
			initHost(
				{
					amount: { schema: prop.number() },
				},
				undefined,
				{ deferInit: true },
			),
		).toThrow("Validation failed: amount: Expected number, got string");

		expect(window.name).toBe("");
		expect(getHostProps()).toBeUndefined();

		const host = initHost(
			{
				amount: { schema: prop.string() },
			},
			undefined,
			{ deferInit: true },
		);

		expect(host).not.toBeNull();
		expect(host?.hostProps.amount).toBe("not-a-number");
		expect(window.name).toBe("");
	});

	it("should not create a host instance for invalid bootstrap payloads", () => {
		const invalidName = "__forgeframe__not-valid-base64";
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		window.name = invalidName;

		expect(initHost(undefined, undefined, { deferInit: true })).toBeNull();
		expect(isHost()).toBe(true);
		expect(getHostProps()).toBeUndefined();
		expect(window.name).toBe(invalidName);
		expect(errorSpy).toHaveBeenCalledWith(
			"Failed to parse ForgeFrame payload from window.name",
		);
	});

	it("should allow required sameDomain props to arrive after bootstrap on same-origin hosts", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		const host = new HostComponent(
			createPayload({
				consumerDomain: window.location.origin,
				props: { label: "visible" },
			}),
			{
				label: { schema: prop.string() },
				secret: { schema: prop.string(), sameDomain: true, required: true },
			},
			undefined,
			true,
		);
		const propsHandler = (
			host as unknown as { messenger: { handlers: Map<string, DirectHandler> } }
		).messenger.handlers.get(MESSAGE_NAME.PROPS);

		expect(propsHandler).toBeDefined();
		expect(host.hostProps.secret).toBeUndefined();
		expect(
			requireValue(propsHandler)(
				{ label: "visible", secret: "same-origin-only" },
				createMessageSource(window, window.location.origin),
			),
		).toEqual({ success: true });
		expect(host.hostProps.secret).toBe("same-origin-only");
	});

	it("should still reject missing required sameDomain props for cross-origin hosts", () => {
		const crossOriginConsumerWindow = {
			postMessage: vi.fn(),
			location: { origin: "https://consumer.example.com" },
		} as unknown as Window;

		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(
			crossOriginConsumerWindow,
		);

		expect(
			() =>
				new HostComponent(
					createPayload({
						consumerDomain: "https://consumer.example.com",
						props: {},
					}),
					{
						secret: { schema: prop.string(), sameDomain: true, required: true },
					},
					undefined,
					true,
				),
		).toThrow('Prop "secret" is required but was not provided');
	});

	it("should isolate failing props subscribers and continue notifying others", () => {
		const host = createHost();
		const propsHandler = (
			host as unknown as { messenger: { handlers: Map<string, DirectHandler> } }
		).messenger.handlers.get(MESSAGE_NAME.PROPS);

		expect(propsHandler).toBeDefined();

		const throwingSubscriber = vi.fn(() => {
			throw new Error("subscriber failed");
		});
		const healthySubscriber = vi.fn();
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		host.hostProps.onProps(throwingSubscriber);
		host.hostProps.onProps(healthySubscriber);

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
			const host = createHost();
			const error = new Error("Async subscriber failure");
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			const order: string[] = [];
			host.hostProps.onProps(() => {
				order.push("failing");
				return kind === "promise"
					? Promise.reject(error)
					: {
							// biome-ignore lint/suspicious/noThenProperty: Exercise subscriber rejection from an intentional thenable.
							then: (_resolve: unknown, reject: (error: Error) => void) =>
								reject(error),
						};
			});
			host.hostProps.onProps(() => {
				order.push("healthy");
			});
			host.event.on(EVENT.PROPS, () => {
				order.push("event");
			});
			const propsHandler = (
				host as unknown as {
					messenger: { handlers: Map<string, DirectHandler> };
				}
			).messenger.handlers.get(MESSAGE_NAME.PROPS);
			expect(
				propsHandler?.({ amount: 77 }, createMessageSource(window)),
			).toEqual({ success: true });
			expect(order).toEqual(["failing", "healthy", "event"]);
			expect(host.hostProps.amount).toBe(77);
			await vi.waitFor(() =>
				expect(consoleSpy).toHaveBeenCalledWith(
					"Error in props handler:",
					error,
				),
			);
		},
	);

	it("should cancel subscriptions and retain rejection handling after destruction", async () => {
		const host = createHost();
		const cancelled = vi.fn();
		host.hostProps.onProps(cancelled).cancel();
		let rejectObserver: ((error: Error) => void) | undefined;
		host.hostProps.onProps(
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

	it("should acknowledge updates without waiting for an async subscriber", () => {
		const host = createHost();
		let resolveObserver: (() => void) | undefined;
		host.hostProps.onProps(
			() =>
				new Promise<void>((resolve) => {
					resolveObserver = resolve;
				}),
		);
		const healthy = vi.fn();
		host.hostProps.onProps(healthy);
		const propsHandler = (
			host as unknown as { messenger: { handlers: Map<string, DirectHandler> } }
		).messenger.handlers.get(MESSAGE_NAME.PROPS);
		expect(propsHandler?.({ amount: 88 }, createMessageSource(window))).toEqual(
			{ success: true },
		);
		expect(healthy).toHaveBeenCalledWith({ amount: 88 });
		resolveObserver?.();
	});

	it("should emit host error and rethrow when props deserialization fails", () => {
		const host = createHost();
		const propsHandler = (
			host as unknown as { messenger: { handlers: Map<string, DirectHandler> } }
		).messenger.handlers.get(MESSAGE_NAME.PROPS);

		expect(propsHandler).toBeDefined();

		const emitSpy = vi.spyOn(host.event, "emit");
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const circular: Record<string, unknown> = {};
		circular.self = circular;

		expect(() =>
			requireValue(propsHandler)(circular, createMessageSource(window)),
		).toThrow("Circular reference detected in serialized props");
		expect(emitSpy).toHaveBeenCalledWith(EVENT.ERROR, expect.any(Error));
		expect(consoleSpy).toHaveBeenCalledWith(
			"Error deserializing props:",
			expect.any(Error),
		);
	});

	it("should reject invalid PROPS updates before mutating hostProps", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		const typedHost = new HostComponent(
			createPayload({ props: { amount: 10 } }),
			{
				amount: { schema: prop.number() },
			},
			undefined,
			true,
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
		expect(typedHost.hostProps.amount).toBe(10);
		expect(typedHost.hostProps.consumer.props).toEqual({ amount: 10 });
		expect(consoleSpy).toHaveBeenCalledWith(
			"Error deserializing props:",
			expect.any(Error),
		);
		typedHost.destroy();
	});

	it("should validate PROPS updates as normalized outputs and preserve prior state", () => {
		vi.spyOn(hostSecurity, "resolveConsumerWindow").mockReturnValue(window);

		const typedHost = new HostComponent(
			createPayload({ props: { amount: 10 } }),
			{
				amount: {
					schema: z.string().transform(Number),
					outputSchema: z.number().int().nonnegative(),
				},
			},
			undefined,
			true,
		);
		const propsHandler = (
			typedHost as unknown as {
				messenger: { handlers: Map<string, DirectHandler> };
			}
		).messenger.handlers.get(MESSAGE_NAME.PROPS);
		const subscriber = vi.fn();
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		typedHost.hostProps.onProps(subscriber);

		expect(propsHandler).toBeDefined();
		expect(() =>
			requireValue(propsHandler)({ amount: "42" }, createMessageSource(window)),
		).toThrow("Invalid input: expected number, received string");
		expect(typedHost.hostProps.amount).toBe(10);
		expect(typedHost.hostProps.consumer.props).toEqual({ amount: 10 });
		expect(subscriber).not.toHaveBeenCalled();
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

		const host = new HostComponent(createPayload(), {}, undefined, true);
		expect(host.hostProps.getConsumer()).toBe(consumerWindow);
	});

	it("should resolve consumer window from popup opener when available", () => {
		const openerWindow = { postMessage: vi.fn() } as unknown as Window;
		vi.spyOn(helpers, "isIframe").mockReturnValue(false);
		vi.spyOn(helpers, "isPopup").mockReturnValue(true);
		vi.spyOn(helpers, "getOpener").mockReturnValue(openerWindow);

		const host = new HostComponent(createPayload(), {}, undefined, true);
		expect(host.hostProps.getConsumer()).toBe(openerWindow);
	});

	it("should throw when no consumer window can be resolved", () => {
		vi.spyOn(helpers, "isIframe").mockReturnValue(false);
		vi.spyOn(helpers, "isPopup").mockReturnValue(false);

		expect(
			() => new HostComponent(createPayload(), {}, undefined, true),
		).toThrow("Could not resolve consumer window");
	});
});
