import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ConsumerComponent } from "@/core/consumer";
import { ConsumerPropsPipeline } from "@/core/consumer/props-pipeline";
import { ConsumerTransport } from "@/core/consumer/transport";
import { prop } from "@/props/prop";
import type { ComponentBaseOptions } from "@/types";
import { forgeFrameError } from "../forgeframe-error";
import { requireValue } from "../require-value";

const consumers: ConsumerComponent<Record<string, unknown>>[] = [];
function consumerWith(
	options: Partial<ComponentBaseOptions<Record<string, unknown>>>,
	props: Record<string, unknown>,
) {
	const consumer = new ConsumerComponent<Record<string, unknown>>(
		{
			tag: "disconnected-prop-queue",
			url: "https://host.example/widget",
			...options,
		},
		props,
	);
	consumers.push(consumer);
	return consumer;
}
/** The props the consumer's pipeline holds, read from the pipeline it updated. */
function committedProps(
	consumer: ConsumerComponent<Record<string, unknown>>,
): Record<string, unknown> {
	const updated = vi.mocked(ConsumerPropsPipeline.prototype.updateProps);
	const pipelines = new Set(updated.mock.contexts);
	// Each test updates one consumer, so its pipeline is the only one updated.
	expect(consumers).toEqual([consumer]);
	expect(pipelines.size).toBe(1);
	const [pipeline] = pipelines;
	if (!(pipeline instanceof ConsumerPropsPipeline))
		throw new Error("The consumer did not update its props pipeline");
	return pipeline.props;
}
beforeEach(() => {
	vi.spyOn(ConsumerPropsPipeline.prototype, "updateProps");
});
afterEach(async () => {
	for (const consumer of consumers.splice(0)) await consumer.close();
	document.body.innerHTML = "";
	vi.restoreAllMocks();
});

describe("Disconnected consumer prop queue", () => {
	it.each(["a schema transform", "the component validate"])(
		"should preserve a nested update triggered by %s",
		async (callback) => {
			let consumer: ConsumerComponent<Record<string, unknown>> | undefined;
			let nested: Promise<void> | undefined;
			const trigger = (value: unknown) => {
				if (value === 1 && consumer && !nested)
					nested = consumer.updateProps({ second: 2 });
				return value;
			};
			consumer = consumerWith(
				callback === "a schema transform"
					? {
							props: {
								first: z.number().transform(trigger),
								second: prop.number(),
							},
						}
					: {
							props: { first: prop.number(), second: prop.number() },
							validate: ({ props }) => {
								trigger(props.first);
							},
						},
				{ first: 0, second: 0 },
			);
			await consumer.updateProps({ first: 1 });
			await nested;
			expect(nested).toBeDefined();
			expect(committedProps(consumer)).toMatchObject({
				first: 1,
				second: 2,
			});
		},
	);

	it("should continue in FIFO order after failed validation", async () => {
		const consumer = consumerWith(
			{ props: { count: prop.number() } },
			{ count: 0 },
		);
		const seen: unknown[] = [];
		consumer.event.on("props", (value) => {
			seen.push(value);
		});
		const first = consumer.updateProps({ count: 1 });
		const rejected = consumer
			.updateProps({ count: "invalid" })
			.catch((error: unknown) => error);
		const last = consumer.updateProps({ count: 3 });
		await Promise.all([first, last]);
		expect(await rejected).toBeInstanceOf(Error);
		expect(seen).toEqual([
			expect.objectContaining({ count: 1 }),
			expect.objectContaining({ count: 3 }),
		]);
		expect(committedProps(consumer).count).toBe(3);
	});

	it.each(["outer", "nested"])(
		"should recover after a failed %s reentrant update",
		async (failure) => {
			let consumer: ConsumerComponent<Record<string, unknown>> | undefined;
			let nested: Promise<unknown> | undefined;
			consumer = consumerWith(
				{
					props: { first: prop.number(), second: prop.number() },
					validate: ({ props }) => {
						if (props.first === 1 && consumer && !nested) {
							nested = consumer
								.updateProps({
									second: failure === "nested" ? "invalid" : 2,
								})
								.catch((error: unknown) => error);
							if (failure === "outer")
								throw new Error("Outer validation failed");
						}
					},
				},
				{ first: 0, second: 0 },
			);
			const outer = await consumer
				.updateProps({ first: 1 })
				.catch((error: unknown) => error);
			const inner = await nested;
			expect(failure === "outer" ? outer : inner).toBeInstanceOf(Error);
			expect(committedProps(consumer)).toMatchObject(
				failure === "outer" ? { first: 0, second: 2 } : { first: 1, second: 0 },
			);
			await consumer.updateProps({ first: 3, second: 3 });
			expect(committedProps(consumer)).toMatchObject({
				first: 3,
				second: 3,
			});
		},
	);

	it("should allow rendering requested inside the component validate without reading its uncommitted snapshot", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		let consumer: ConsumerComponent<Record<string, unknown>> | undefined;
		let rendering: Promise<void> | undefined;
		consumer = consumerWith(
			{
				props: { count: { schema: prop.number(), queryParam: true } },
				validate: ({ props }) => {
					if (props.count === 1 && consumer && !rendering)
						rendering = consumer.render(container);
				},
			},
			{ count: 0 },
		);
		vi.spyOn(ConsumerTransport.prototype, "waitForHost").mockResolvedValue();
		await consumer.updateProps({ count: 1 });
		await rendering;
		expect(rendering).toBeDefined();
		expect(requireValue(container.querySelector("iframe")).src).toBe(
			"https://host.example/widget?count=1",
		);
	});

	it("should cancel rendering and queued user callbacks when closed during draining", async () => {
		const validate = vi.fn();
		const consumer = consumerWith(
			{ props: { count: prop.number() }, validate },
			{ count: 0 },
		);
		const first = consumer.updateProps({ count: 1 });
		const second = consumer
			.updateProps({ count: 2 })
			.catch((error: unknown) => error);
		const container = document.createElement("div");
		document.body.appendChild(container);
		const rendering = consumer
			.render(container)
			.catch((error: unknown) => error);
		await consumer.close();
		await first;
		expect(await second).toEqual(
			forgeFrameError(
				"CLOSED",
				"Cannot update props after the component has closed",
			),
		);
		expect(await rendering).toEqual(
			forgeFrameError("CANCELLED", "closed before rendering completed"),
		);
		expect(validate).toHaveBeenCalledTimes(1);
		expect(container.children).toHaveLength(0);
	});

	it("keeps the queue busy when a render hold is released before earlier work settles", async () => {
		const pipeline = new ConsumerPropsPipeline<Record<string, unknown>>(
			{
				tag: "hold-release-order",
				url: "https://host.example/widget",
				props: { amount: prop.number() },
				context: "iframe",
				dimensions: { width: 1, height: 1 },
				initTimeout: 1,
			},
			{ amount: 1 },
		);
		let releaseSend: (() => void) | undefined;
		const sent: number[] = [];
		const hooks = {
			assertActive: () => {},
			resolveUrl: () => "https://host.example/widget",
			resolveUrlOrigin: () => "https://host.example",
			assertStableRenderedOrigin: () => {},
			validateTransportProps: () => {},
			shouldSendPropsToHost: () => true,
			sendPropsUpdateToHost: (props: Record<string, unknown>) => {
				sent.push(props.amount as number);
				return sent.length === 1
					? new Promise<void>((resolve) => {
							releaseSend = resolve;
						})
					: Promise.resolve();
			},
			emitPropsUpdated: () => {},
		};
		const first = pipeline.updateProps({ amount: 2 }, hooks);
		const hold = pipeline.holdForRender();
		expect(hold.earlierWork).not.toBeNull();
		hold.release();
		const second = pipeline.updateProps({ amount: 3 }, hooks);
		await Promise.resolve();
		expect(sent).toEqual([2]);
		releaseSend?.();
		await Promise.all([first, second]);
		expect(sent).toEqual([2, 3]);
	});
});
