/**
 * Integration tests for consumer-to-host function prop bridging.
 *
 * Verifies host-side invocation of a consumer callback through the real window
 * bridge, including async results and thrown errors.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { deserializeMessage } from "@/communication/protocol";
import { create, PROP_SERIALIZATION, prop } from "@/index";
import type { PropsDefinition } from "@/types";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

type CallbackPayload = {
	orderId: string;
	amount: number;
};

type CallbackResult = {
	approved: boolean;
	receipt: string;
};

type CallbackBridgeProps = {
	onApprove: (payload: CallbackPayload) => Promise<CallbackResult>;
	label?: string;
};

const CALLBACK_PROP_DEFINITIONS: PropsDefinition<CallbackBridgeProps> = {
	onApprove: {
		schema:
			prop.function<(payload: CallbackPayload) => Promise<CallbackResult>>(),
		required: true,
	},
	label: { schema: prop.string().optional() },
};

describe("Function prop bridge integration", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		vi.useRealTimers();
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	it.each([
		["JSON", undefined],
		["BASE64", PROP_SERIALIZATION.BASE64],
		["DOTIFY", PROP_SERIALIZATION.DOTIFY],
	] as const)(
		"enforces callback capacity atomically across %s updates",
		async (_label, serialization) => {
			harness = createIframeIntegrationHarness();
			const container = document.createElement("div");
			document.body.append(container);
			const definitions = {
				callbacks: {
					schema: prop.record(prop.function<() => number>()),
					serialization,
				},
			};
			const Component = create({
				tag: "integration-callback-capacity",
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const callbacks = Object.fromEntries(
				Array.from({ length: 500 }, (_, index) => [`c${index}`, () => index]),
			);
			const instance = Component({ callbacks });
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			const cached = hostProps.callbacks.c0;
			if (!cached) throw new Error("Missing initial callback");
			await expect(cached()).resolves.toBe(0);
			await expect(hostProps.callbacks.c499?.()).resolves.toBe(499);
			const oversized = Object.fromEntries(
				Array.from({ length: 501 }, (_, index) => [
					`c${index}`,
					() => index + 1000,
				]),
			);
			const rejected = instance.updateProps({ callbacks: oversized });
			const replacement = Object.fromEntries(
				Array.from({ length: 500 }, (_, index) => [
					`c${index}`,
					() => index + 500,
				]),
			);
			const recovered = instance.updateProps({ callbacks: replacement });
			await expect(rejected).rejects.toThrow("500 distinct callback limit");
			await recovered;
			await expect(hostProps.callbacks.c0?.()).resolves.toBe(500);
			await expect(hostProps.callbacks.c499?.()).resolves.toBe(999);
			await expect(cached()).rejects.toThrow("not found");
		},
	);

	it("delivers an omitted callback default without invoking the callback during normalization", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const callback = vi.fn(() => 42);
		const definitions = {
			callback: prop.function<() => number>().default(() => callback),
		};
		const Component = create({
			tag: "integration-callback-default",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({});
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost<
			{ callback: () => number },
			{ callback?: () => number }
		>(container, definitions);
		await rendering;
		expect(callback).not.toHaveBeenCalled();
		await expect(hostProps.callback()).resolves.toBe(42);
		expect(callback).toHaveBeenCalledOnce();
	});

	it("preserves installed callbacks after a dropped acknowledgement and recovers a full pool", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = {
			callbacks: prop.record(prop.function<() => number>()),
		};
		const Component = create({
			tag: "integration-dropped-callback-ack",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const callbacks = Object.fromEntries(
			Array.from({ length: 500 }, (_, index) => [`c${index}`, () => index]),
		);
		const instance = Component({ callbacks });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		const cached = hostProps.callbacks.c0;
		if (!cached) throw new Error("Missing initial callback");
		const forward = harness.consumerWindow.postMessage.bind(
			harness.consumerWindow,
		);
		const post = vi
			.spyOn(harness.consumerWindow, "postMessage")
			.mockImplementation((data, origin) => {
				const message = deserializeMessage(data);
				if (message?.type === "response") return;
				forward(data, origin);
			});
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const replacement = Object.fromEntries(
			Array.from({ length: 500 }, (_, index) => [
				`c${index}`,
				() => index + 500,
			]),
		);
		const failed = expect(
			instance.updateProps({ callbacks: replacement }),
		).rejects.toThrow("timed out");
		await vi.advanceTimersByTimeAsync(10001);
		await failed;
		await expect(cached()).resolves.toBe(0);
		await expect(hostProps.callbacks.c0?.()).resolves.toBe(500);
		await expect(
			instance.updateProps({ callbacks: { fresh: () => 1001 } }),
		).rejects.toThrow("recovery pool is full");
		await expect(hostProps.callbacks.c499?.()).resolves.toBe(999);
		post.mockRestore();
		await instance.updateProps({ callbacks: replacement });
		await expect(hostProps.callbacks.c0?.()).resolves.toBe(500);
		await expect(cached()).rejects.toThrow("not found");
		await instance.updateProps({ callbacks: { fresh: () => 1001 } });
		await expect(hostProps.callbacks.fresh?.()).resolves.toBe(1001);
	});

	it.each([
		["default", undefined],
		["BASE64", PROP_SERIALIZATION.BASE64],
		["DOTIFY", PROP_SERIALIZATION.DOTIFY],
	] as const)(
		"retires replaced callbacks after acknowledged %s updates",
		async (_label, serialization) => {
			harness = createIframeIntegrationHarness();
			const container = document.createElement("div");
			document.body.append(container);
			const definitions = {
				config: {
					schema: prop.object().shape({ run: prop.function<() => string>() }),
					serialization,
				},
			};
			const Component = create({
				tag: "integration-replaced-callback",
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const original = vi.fn(() => "original");
			const instance = Component({ config: { run: original } });
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			const cached = hostProps.config.run;
			await expect(cached()).resolves.toBe("original");
			await instance.updateProps({ config: { run: () => "replacement" } });
			await expect(hostProps.config.run()).resolves.toBe("replacement");
			await expect(cached()).rejects.toThrow(/Function with id ".+" not found/);
			expect(original).toHaveBeenCalledOnce();
		},
	);

	it.each([PROP_SERIALIZATION.BASE64, PROP_SERIALIZATION.DOTIFY])(
		"bridges nested callbacks across %s bootstrap and updates",
		async (serialization) => {
			harness = createIframeIntegrationHarness();
			const container = document.createElement("div");
			document.body.appendChild(container);
			const definitions = {
				config: {
					schema: prop.object().shape({
						onComplete: prop.function<() => number>(),
						list: prop.array().of(prop.function<() => number>()),
						date: prop.date(),
					}),
					serialization,
				},
				label: prop.string().optional(),
			};
			const Component = create({
				tag: `integration-nested-callback-${serialization}`,
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const date = new Date("2026-01-02T03:04:05.678Z");
			const instance = Component({
				config: { onComplete: () => 42, list: [() => 7], date },
			});
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			await expect(hostProps.config.onComplete()).resolves.toBe(42);
			await expect(hostProps.config.list[0]?.()).resolves.toBe(7);
			expect(hostProps.config.date).toEqual(date);
			const cached = hostProps.config.onComplete;
			await instance.updateProps({ label: "unrelated" });
			await expect(cached()).resolves.toBe(42);
			await expect(
				instance.updateProps({
					config: {
						onComplete: () => 99,
						list: [],
						date: new Date(Number.NaN),
					},
				}),
			).rejects.toThrow("Validation failed");
			await expect(cached()).resolves.toBe(42);
			await instance.updateProps({
				config: { onComplete: () => 84, list: [() => 14], date },
			});
			await expect(hostProps.config.onComplete()).resolves.toBe(84);
			await expect(hostProps.config.list[0]?.()).resolves.toBe(14);
			expect(hostProps.config.date).toEqual(date);
		},
	);

	it.each([PROP_SERIALIZATION.BASE64, PROP_SERIALIZATION.DOTIFY])(
		"retains live callbacks after failed %s encoding and recovers",
		async (serialization) => {
			harness = createIframeIntegrationHarness();
			const container = document.createElement("div");
			document.body.appendChild(container);
			const definitions = {
				config: {
					schema: prop.object<{ onComplete: () => number; failure?: object }>(),
					serialization,
				},
			};
			const Component = create({
				tag: `integration-encoding-recovery-${serialization}`,
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const instance = Component({ config: { onComplete: () => 42 } });
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			const cached = hostProps.config.onComplete;
			class FailingValue {
				toJSON() {
					throw new Error("encoding failed");
				}
			}
			await expect(
				instance.updateProps({
					config: { onComplete: () => 99, failure: new FailingValue() },
				}),
			).rejects.toThrow("encoding failed");
			await expect(cached()).resolves.toBe(42);
			await expect(hostProps.config.onComplete()).resolves.toBe(42);
			await instance.updateProps({ config: { onComplete: () => 84 } });
			await expect(hostProps.config.onComplete()).resolves.toBe(84);
		},
	);

	it("should report unserializable callback results without waiting for a message timeout", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const definitions = { getResult: prop.function<() => unknown>() };
		const Component = create({
			tag: "integration-unserializable-callback-result",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		let result: unknown = cyclic;
		const instance = Component({ getResult: () => result });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost<{
			getResult: () => unknown;
		}>(container, definitions);
		await rendering;

		await expect(hostProps.getResult()).rejects.toThrow(
			"Could not serialize response",
		);
		result = 42;
		await expect(hostProps.getResult()).resolves.toBe(42);
	});

	it("should propagate async callback results and thrown errors across the bridge", async () => {
		harness = createIframeIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const CallbackComponent = create<CallbackBridgeProps>({
			tag: "integration-function-prop-bridge-component",
			url: "https://host.example.com/widget",
			props: CALLBACK_PROP_DEFINITIONS,
		});

		let shouldThrow = false;
		const onApprove = vi.fn(
			async (payload: CallbackPayload): Promise<CallbackResult> => {
				if (shouldThrow) {
					throw new Error("consumer callback failed");
				}

				return {
					approved: true,
					receipt: `${payload.orderId}:${payload.amount}`,
				};
			},
		);

		const instance = CallbackComponent({ onApprove });

		const renderPromise = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			CALLBACK_PROP_DEFINITIONS,
		);

		await expect(renderPromise).resolves.toBeUndefined();

		const firstPayload: CallbackPayload = { orderId: "order-1", amount: 49 };
		await expect(hostProps.onApprove(firstPayload)).resolves.toEqual({
			approved: true,
			receipt: "order-1:49",
		});
		expect(onApprove).toHaveBeenNthCalledWith(1, firstPayload);

		const cachedOnApprove = hostProps.onApprove;
		await instance.updateProps({ label: "unrelated update" });
		await expect(
			cachedOnApprove({ orderId: "order-cached", amount: 5 }),
		).resolves.toEqual({ approved: true, receipt: "order-cached:5" });

		shouldThrow = true;
		const secondPayload: CallbackPayload = { orderId: "order-2", amount: 17 };
		await expect(hostProps.onApprove(secondPayload)).rejects.toThrow(
			"consumer callback failed",
		);
		expect(onApprove).toHaveBeenNthCalledWith(3, secondPayload);
	});
});
