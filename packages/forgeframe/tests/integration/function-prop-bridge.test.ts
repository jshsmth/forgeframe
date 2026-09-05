/**
 * Integration tests for consumer-to-host function prop bridging.
 *
 * Verifies host-side invocation of a consumer callback through the real window
 * bridge, including async results and thrown errors.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { create, prop } from "@/index";
import type { PropsDefinition } from "@/types";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

interface CallbackPayload {
	orderId: string;
	amount: number;
}

interface CallbackResult {
	approved: boolean;
	receipt: string;
}

interface CallbackBridgeProps {
	onApprove: (payload: CallbackPayload) => Promise<CallbackResult>;
	label?: string;
}

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
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

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
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
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
