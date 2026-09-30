import { afterEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_NAME } from "@/constants";
import { ConsumerComponent } from "@/core/consumer";
import { prop } from "@/props/prop";
import type { ComponentOptions } from "@/types";

const consumers: ConsumerComponent<Record<string, unknown>>[] = [];
function consumerWith(
	options: Partial<ComponentOptions<Record<string, unknown>>>,
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
function internals(consumer: ConsumerComponent<Record<string, unknown>>) {
	return consumer as unknown as {
		propsPipeline: {
			props: Record<string, unknown>;
			pendingPropsUpdate: Promise<void> | null;
		};
		renderer: { iframe: HTMLIFrameElement };
		waitForHost: () => Promise<void>;
		transport: {
			messenger: {
				handlers: Map<
					string,
					(
						data: unknown,
						source: { uid: string; window: Window; domain: string },
					) => Promise<{ props: Record<string, unknown> }>
				>;
			};
		};
	};
}
afterEach(async () => {
	for (const consumer of consumers.splice(0)) await consumer.close();
	document.body.innerHTML = "";
	vi.restoreAllMocks();
});

describe("Disconnected consumer prop queue", () => {
	it.each(["decorate", "validate"])(
		"should preserve a nested update triggered by %s",
		async (callback) => {
			let consumer: ConsumerComponent<Record<string, unknown>> | undefined;
			let nested: Promise<void> | undefined;
			const trigger = ({ value }: { value: unknown }) => {
				if (value === 1 && consumer && !nested)
					nested = consumer.updateProps({ second: 2 });
				return value;
			};
			consumer = consumerWith(
				{
					props: {
						first: { schema: prop.number(), [callback]: trigger },
						second: prop.number(),
					},
				},
				{ first: 0, second: 0 },
			);
			await consumer.updateProps({ first: 1 });
			await nested;
			expect(nested).toBeDefined();
			expect(internals(consumer).propsPipeline.props).toMatchObject({
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
		expect(internals(consumer).propsPipeline.props.count).toBe(3);
	});

	it("should drain admitted updates before query, body, and bootstrap snapshots", async () => {
		const consumer = consumerWith(
			{
				props: {
					count: { schema: prop.number(), queryParam: true },
					bodyCount: { schema: prop.number(), bodyParam: true },
				},
			},
			{ count: 0, bodyCount: 0 },
		);
		const internal = internals(consumer);
		const submit = vi
			.spyOn(HTMLFormElement.prototype, "submit")
			.mockImplementation(function (this: HTMLFormElement) {
				expect(this.action).toBe("https://host.example/widget?count=2");
				expect(
					this.querySelector<HTMLInputElement>('input[name="bodyCount"]')
						?.value,
				).toBe("2");
			});
		let bootstrap: Record<string, unknown> | undefined;
		vi.spyOn(internal, "waitForHost").mockImplementation(async () => {
			const handler = internal.transport.messenger.handlers.get(
				MESSAGE_NAME.BOOTSTRAP,
			);
			const response = await handler?.(
				{ sessionId: "queue-session" },
				{
					uid: consumer.uid,
					window: internal.renderer.iframe.contentWindow as Window,
					domain: "https://host.example",
				},
			);
			bootstrap = response?.props;
		});
		const container = document.createElement("div");
		document.body.appendChild(container);
		const first = consumer.updateProps({ count: 1, bodyCount: 1 });
		const second = consumer.updateProps({ count: 2, bodyCount: 2 });
		const rendering = consumer.render(container);
		await expect(consumer.updateProps({ count: 3 })).rejects.toThrow(
			"while the component is rendering",
		);
		await Promise.all([first, second, rendering]);
		expect(submit).toHaveBeenCalledOnce();
		expect(bootstrap).toMatchObject({ count: 2, bodyCount: 2 });
	});

	it.each(["outer", "nested"])(
		"should recover after a failed %s reentrant update",
		async (failure) => {
			let consumer: ConsumerComponent<Record<string, unknown>> | undefined;
			let nested: Promise<unknown> | undefined;
			consumer = consumerWith(
				{
					props: {
						first: {
							schema: prop.number(),
							decorate: ({ value }) => {
								if (value === 1 && consumer && !nested) {
									nested = consumer
										.updateProps({
											second: failure === "nested" ? "invalid" : 2,
										})
										.catch((error: unknown) => error);
									if (failure === "outer")
										throw new Error("Outer normalization failed");
								}
								return value;
							},
						},
						second: prop.number(),
					},
				},
				{ first: 0, second: 0 },
			);
			const outer = await consumer
				.updateProps({ first: 1 })
				.catch((error: unknown) => error);
			const inner = await nested;
			expect(failure === "outer" ? outer : inner).toBeInstanceOf(Error);
			expect(internals(consumer).propsPipeline.props).toMatchObject(
				failure === "outer" ? { first: 0, second: 2 } : { first: 1, second: 0 },
			);
			await consumer.updateProps({ first: 3, second: 3 });
			expect(internals(consumer).propsPipeline.props).toMatchObject({
				first: 3,
				second: 3,
			});
		},
	);

	it("should allow rendering requested inside a decorator without reading its uncommitted snapshot", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		let consumer: ConsumerComponent<Record<string, unknown>> | undefined;
		let rendering: Promise<void> | undefined;
		consumer = consumerWith(
			{
				props: {
					count: {
						schema: prop.number(),
						queryParam: true,
						decorate: ({ value }) => {
							if (value === 1 && consumer && !rendering)
								rendering = consumer.render(container);
							return value;
						},
					},
				},
			},
			{ count: 0 },
		);
		vi.spyOn(internals(consumer), "waitForHost").mockResolvedValue();
		await consumer.updateProps({ count: 1 });
		await rendering;
		expect(rendering).toBeDefined();
		expect(internals(consumer).renderer.iframe.src).toBe(
			"https://host.example/widget?count=1",
		);
	});

	it("should cancel rendering and queued user callbacks when closed during draining", async () => {
		const decorate = vi.fn(({ value }: { value: unknown }) => value);
		const consumer = consumerWith(
			{ props: { count: { schema: prop.number(), decorate } } },
			{ count: 0 },
		);
		decorate.mockClear();
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
		expect(await second).toMatchObject({
			message: "Cannot update props after the component has closed",
		});
		expect(await rendering).toMatchObject({
			message: expect.stringContaining("closed before rendering completed"),
		});
		expect(decorate).toHaveBeenCalledTimes(1);
		expect(container.children).toHaveLength(0);
	});
});
