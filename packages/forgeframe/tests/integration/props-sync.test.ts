/**
 * Integration test covering post-connect prop synchronization.
 *
 * Verifies that `instance.updateProps()` updates the host snapshot, removes
 * omitted optional keys from `window.hostProps`, and notifies subscribers once.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { deleteRegisteredComponent } from "@/core/component-registry";
import { create, EVENT, initHost, PROP_SERIALIZATION, prop } from "@/index";
import type { PropsDefinition } from "@/types";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

it("validates required consumer-only inputs locally while shared host definitions omit them", async () => {
	const harness = createIframeIntegrationHarness();
	try {
		const definitions = {
			local: { schema: prop.string(), required: true, sendToHost: false },
			title: prop.string(),
		};
		const Component = create({
			tag: "required-local-prop",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const container = document.createElement("div");
		document.body.append(container);
		const instance = Component({ local: "private", title: "initial" });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(Object.hasOwn(hostProps, "local")).toBe(false);
		await instance.updateProps({ local: "changed", title: "updated" });
		expect(hostProps.title).toBe("updated");
		expect(Object.hasOwn(hostProps, "local")).toBe(false);
		await expect(instance.updateProps({ local: undefined })).rejects.toThrow(
			/required/,
		);
		expect(hostProps.title).toBe("updated");
	} finally {
		await harness.cleanup();
	}
});

type SyncProps = {
	title: string;
	optionalNote?: string;
};

type DateSyncProps = {
	publishedAt: Date;
};

type TransformedSyncProps = {
	amount: number;
};

type TransformedSyncInput = {
	amount: string;
};

type OptionalTransformOutputSyncProps = {
	amount: number | undefined;
};

type OptionalTransformOutputSyncInput = {
	amount: string;
};

const SYNC_PROP_DEFINITIONS: PropsDefinition<SyncProps> = {
	title: { schema: prop.string(), required: true },
	optionalNote: { schema: prop.string().optional() },
};

const DATE_SYNC_PROP_DEFINITIONS: PropsDefinition<DateSyncProps> = {
	publishedAt: { schema: prop.date(), required: true },
};

const TRANSFORMED_SYNC_PROP_DEFINITIONS: PropsDefinition<
	TransformedSyncProps,
	TransformedSyncInput
> = {
	amount: {
		schema: z.string().transform(Number),
		outputSchema: z.number(),
		required: true,
	},
};

const OPTIONAL_TRANSFORM_OUTPUT_SYNC_PROP_DEFINITIONS: PropsDefinition<
	OptionalTransformOutputSyncProps,
	OptionalTransformOutputSyncInput
> = {
	amount: {
		schema: z
			.string()
			.transform((value) => (value === "empty" ? undefined : Number(value))),
		outputSchema: z.number().optional(),
		required: true,
	},
};

describe("Props sync integration", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	describe.each([
		PROP_SERIALIZATION.JSON,
		PROP_SERIALIZATION.BASE64,
		PROP_SERIALIZATION.DOTIFY,
	])("%s late configuration", (serialization) => {
		it.each(["create", "initHost"])(
			"purges already committed private fields when %s supplies definitions",
			async (configure) => {
				harness = createIframeIntegrationHarness();
				const activeHarness = harness;
				const container = document.createElement("div");
				document.body.append(container);
				const tag = "integration-late-private-props";
				const Component = create({
					tag,
					url: "https://host.example.com/widget",
					props: {
						title: prop.string(),
						local: { schema: z.unknown(), serialization },
						constructor: z.unknown(),
						callback: prop.function<() => number>(),
						extra: prop.string(),
					},
				});
				const instance = Component({
					title: "initial",
					local: { private: "accepted before configuration" },
					constructor: 42,
					callback: () => 7,
					extra: "undeclared",
				});
				const rendering = instance.render(container);
				const { host, hostProps } = await activeHarness.bootstrapIframeHost<{
					title: string;
					local: unknown;
					constructor: unknown;
					callback: () => number;
					extra: string;
				}>(container);
				await rendering;
				expect(hostProps.local).toEqual({
					private: "accepted before configuration",
				});
				expect(hostProps.constructor).toBe(42);
				const close = hostProps.close;
				const callback = hostProps.callback;
				const onProps = vi.fn();
				const onEvent = vi.fn();
				hostProps.onProps(onProps);
				host.event.on(EVENT.PROPS, onEvent);
				const definitions = {
					title: prop.string(),
					local: { schema: prop.string(), required: true, sendToHost: false },
					constructor: { schema: prop.string(), sendToHost: false },
					callback: prop.function<() => number>(),
				};
				// These two test windows share one module registry. Remove only the
				// stale declaration to model the host bundle's matching registration.
				if (configure === "create") deleteRegisteredComponent(tag);
				const configuredProps = activeHarness.withHostGlobals(() =>
					configure === "create"
						? create({
								tag,
								url: "https://host.example.com/widget",
								props: definitions,
							}).hostProps
						: initHost(definitions)?.hostProps,
				);
				expect(configuredProps).toBe(hostProps);
				expect(hostProps.consumer.props).toEqual({
					title: "initial",
					callback,
					extra: "undeclared",
				});
				for (const key of ["local", "constructor"]) {
					expect(Object.hasOwn(hostProps, key)).toBe(false);
				}
				expect(hostProps.close).toBe(close);
				await expect(callback()).resolves.toBe(7);
				expect(onProps).not.toHaveBeenCalled();
				expect(onEvent).not.toHaveBeenCalled();
				await instance.updateProps({
					title: "updated",
					local: "still private",
				});
				expect(hostProps.consumer.props).toEqual({
					title: "updated",
					callback,
					extra: "undeclared",
				});
				expect(onProps).toHaveBeenCalledExactlyOnceWith(
					hostProps.consumer.props,
				);
				expect(onEvent).toHaveBeenCalledExactlyOnceWith(
					hostProps.consumer.props,
				);
			},
		);
	});

	it.each([
		PROP_SERIALIZATION.JSON,
		PROP_SERIALIZATION.BASE64,
		PROP_SERIALIZATION.DOTIFY,
	])(
		"discards consumer-only fields from a stale consumer's %s bootstrap and updates",
		async (serialization) => {
			harness = createIframeIntegrationHarness();
			const container = document.createElement("div");
			document.body.append(container);
			// The stale consumer still sends fields the current host declares private.
			const Component = create({
				tag: "integration-stale-private-props",
				url: "https://host.example.com/widget",
				props: {
					title: prop.string(),
					local: { schema: z.unknown(), serialization },
					constructor: z.unknown(),
					extra: prop.string(),
				},
			});
			const localValidator = vi.fn(() => {
				throw new Error("Consumer-only validation must stay local");
			});
			const definitions = {
				title: prop.string(),
				local: {
					schema: prop.string(),
					required: true,
					sendToHost: false,
					validate: localValidator,
				},
				constructor: { schema: prop.string(), sendToHost: false },
			};
			const instance = Component({
				title: "initial",
				local: { private: "invalid for the host schema" },
				constructor: 42,
				extra: "undeclared initial",
			});
			const rendering = instance.render(container);
			const { host, hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			expect(hostProps.consumer.props).toEqual({
				title: "initial",
				extra: "undeclared initial",
			});
			for (const key of ["local", "constructor"]) {
				expect(Object.hasOwn(hostProps, key)).toBe(false);
			}
			const snapshots: unknown[] = [];
			const events: unknown[] = [];
			hostProps.onProps((props) => {
				snapshots.push(props);
			});
			host.event.on(EVENT.PROPS, (props) => {
				events.push(props);
			});
			await instance.updateProps({
				title: "updated",
				local: "valid but private",
				constructor: "also private",
				extra: "undeclared update",
			});
			expect(hostProps.title).toBe("updated");
			expect(hostProps.consumer.props).toEqual({
				title: "updated",
				extra: "undeclared update",
			});
			expect(snapshots).toEqual([
				{ title: "updated", extra: "undeclared update" },
			]);
			expect(events).toEqual(snapshots);
			for (const key of ["local", "constructor"]) {
				expect(Object.hasOwn(hostProps, key)).toBe(false);
			}
			expect(localValidator).not.toHaveBeenCalled();
		},
	);

	it("preserves host snapshots on host-side rejection and continues the queued update", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const Component = create({
			tag: "integration-host-validation-recovery",
			url: "https://host.example.com/widget",
			props: { amount: prop.number() },
		});
		const instance = Component({ amount: 1 });
		const rendering = instance.render(container);
		const { host, hostProps } = await harness.bootstrapIframeHost<{
			amount: number;
		}>(container, {
			amount: prop.number().min(0),
		});
		await rendering;
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const snapshots: number[] = [];
		const rejectedSnapshots: unknown[] = [];
		hostProps.onProps(({ amount }) => {
			snapshots.push(amount);
		});
		host.event.on(EVENT.ERROR, () => {
			rejectedSnapshots.push({
				amount: hostProps.amount,
				consumer: hostProps.consumer.props,
			});
		});

		const rejected = expect(
			instance.updateProps({ amount: -1 }),
		).rejects.toThrow("Number must be >= 0");
		const next = instance.updateProps({ amount: 2 });
		await rejected;
		await next;
		expect(rejectedSnapshots).toEqual([{ amount: 1, consumer: { amount: 1 } }]);
		expect(snapshots).toEqual([2]);
		expect(hostProps.consumer.props).toEqual({ amount: 2 });
		expect(hostProps.amount).toBe(2);
	});

	it("acknowledges updates while a subscriber is pending and stops delivery after cancellation", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "integration-props-subscriber-cancel",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ title: "initial" });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost<{ title: string }>(
			container,
			definitions,
		);
		await rendering;
		let rejectSubscriber!: (error: Error) => void;
		const pending = new Promise<void>((_resolve, reject) => {
			rejectSubscriber = reject;
		});
		const cancelledSnapshots: string[] = [];
		const liveSnapshots: string[] = [];
		const subscription = hostProps.onProps(({ title }) => {
			cancelledSnapshots.push(title);
			return pending;
		});
		hostProps.onProps(({ title }) => {
			liveSnapshots.push(title);
		});
		await instance.updateProps({ title: "first" });
		expect(hostProps.title).toBe("first");
		subscription.cancel();
		subscription.cancel();
		const failure = new Error("cancelled subscriber rejected");
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		rejectSubscriber(failure);
		await harness.flushMessages();
		expect(log).toHaveBeenCalledWith("Error in props handler:", failure);
		await instance.updateProps({ title: "second" });
		expect(cancelledSnapshots).toEqual(["first"]);
		expect(liveSnapshots).toEqual(["first", "second"]);
		expect(hostProps.consumer.props).toEqual({ title: "second" });
	});

	it("withholds consumer-only and origin-restricted props during bootstrap and later updates", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = {
			title: prop.string(),
			local: { schema: prop.string().optional(), sendToHost: false },
			sameOrigin: { schema: prop.string().optional(), sameDomain: true },
			restricted: {
				schema: prop.string().optional(),
				trustedDomains: ["https://other.example.com"],
			},
		};
		const validate = vi.fn();
		const Component = create({
			tag: "integration-private-prop-delivery",
			url: "https://host.example.com/widget",
			props: definitions,
			validate,
		});
		const instance = Component({
			title: "initial",
			local: "local secret",
			sameOrigin: "same-origin secret",
			restricted: "restricted secret",
		});
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.consumer.props).toEqual({ title: "initial" });
		const snapshots: unknown[] = [];
		hostProps.onProps((props) => {
			snapshots.push(props);
		});
		await instance.updateProps({
			title: "updated",
			local: "next local",
			sameOrigin: "next same-origin",
			restricted: "next restricted",
		});
		expect(hostProps.consumer.props).toEqual({ title: "updated" });
		expect(snapshots).toEqual([{ title: "updated" }]);
		for (const key of ["local", "sameOrigin", "restricted"]) {
			expect(Object.hasOwn(hostProps, key)).toBe(false);
		}
		expect(validate).toHaveBeenLastCalledWith({
			props: expect.objectContaining({
				local: "next local",
				sameOrigin: "next same-origin",
				restricted: "next restricted",
			}),
		});
	});

	it("removes inherited-name custom props from both host snapshots", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const definitions = {
			toString: prop.string().optional(),
			constructor: prop.string().optional(),
			hasOwnProperty: prop.string().optional(),
		};
		const Component = create({
			tag: "integration-inherited-prop-keys",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({
			toString: undefined,
			constructor: undefined,
			hasOwnProperty: undefined,
		});
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		const close = hostProps.close;
		await instance.updateProps({
			toString: "first",
			constructor: "second",
			hasOwnProperty: "third",
		});
		expect(hostProps.toString).toBe("first");
		await instance.updateProps({
			toString: undefined,
			constructor: undefined,
			hasOwnProperty: undefined,
		});
		for (const key of ["toString", "constructor", "hasOwnProperty"]) {
			expect(Object.hasOwn(hostProps, key)).toBe(false);
			expect(Object.hasOwn(hostProps.consumer.props, key)).toBe(false);
		}
		expect(hostProps.close).toBe(close);
	});

	it.each([Infinity, -Infinity])(
		"rejects %s updates without changing either snapshot",
		async (value) => {
			harness = createIframeIntegrationHarness();
			const container = document.createElement("div");
			document.body.appendChild(container);
			const definitions = { amount: prop.number() };
			const Component = create({
				tag: "integration-finite-numbers",
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const invalid = Component({ amount: value });
			await expect(invalid.render(container)).rejects.toThrow(
				"Expected finite number",
			);
			expect(container.querySelector("iframe")).toBeNull();
			const instance = Component({ amount: 42 });
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			const onProps = vi.fn();
			hostProps.onProps(onProps);
			await expect(instance.updateProps({ amount: value })).rejects.toThrow(
				"Expected finite number",
			);
			expect(hostProps.amount).toBe(42);
			expect(hostProps.consumer.props.amount).toBe(42);
			expect(onProps).not.toHaveBeenCalled();
			await instance.updateProps({ amount: 84 });
			expect(hostProps.amount).toBe(84);
		},
	);

	it("should reject queued and subsequent prop updates when the instance closes", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const validate = vi.fn();
		const Component = create<SyncProps>({
			tag: "integration-close-during-props-sync",
			url: "https://host.example.com/widget",
			props: SYNC_PROP_DEFINITIONS,
			validate,
		});
		const instance = Component({ title: "initial" });
		const rendering = instance.render(container);
		await harness.bootstrapIframeHost(container, SYNC_PROP_DEFINITIONS);
		await rendering;
		validate.mockClear();

		// Hold the first update at the window boundary so the next update queues.
		vi.spyOn(harness.hostWindow, "postMessage").mockImplementationOnce(
			() => {},
		);
		const first = instance.updateProps({ title: "in flight" });
		const firstRejected = expect(first).rejects.toThrow("Messenger destroyed");
		const queued = instance.updateProps({ title: "queued" });
		const queuedRejected = expect(queued).rejects.toThrow("closed");

		await instance.close();
		await firstRejected;
		await queuedRejected;
		await expect(
			instance.updateProps({ title: "after close" }),
		).rejects.toThrow("closed");
		expect(validate).toHaveBeenCalledTimes(1);
		expect(validate).toHaveBeenCalledWith({
			props: expect.objectContaining({ title: "in flight" }),
		});
		expect(container.querySelectorAll("iframe")).toHaveLength(0);
	});

	it("should sync updated props, remove undefined keys, and notify host subscribers once", async () => {
		harness = createIframeIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const SyncComponent = create<SyncProps>({
			tag: "integration-props-sync-component",
			url: "https://host.example.com/widget",
			props: SYNC_PROP_DEFINITIONS,
		});

		const instance = SyncComponent({
			title: "Initial title",
			optionalNote: "Keep me",
		});

		const renderPromise = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			SYNC_PROP_DEFINITIONS,
		);

		await expect(renderPromise).resolves.toBeUndefined();

		const initialConsumerProps = hostProps.consumer.props;
		const onProps = vi.fn();
		hostProps.onProps(onProps);

		await expect(
			instance.updateProps({
				title: "Updated title",
				optionalNote: undefined,
			}),
		).resolves.toBeUndefined();

		expect(hostProps.title).toBe("Updated title");
		expect("optionalNote" in hostProps).toBe(false);
		expect(hostProps.consumer.props).toEqual({ title: "Updated title" });
		expect(hostProps.consumer.props).not.toBe(initialConsumerProps);
		expect(onProps).toHaveBeenCalledTimes(1);
		expect(onProps).toHaveBeenCalledWith({ title: "Updated title" });
	});

	it("should preserve omitted nested optional fields across bootstrap", async () => {
		harness = createIframeIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const definitions = {
			details: prop.object().shape({
				note: prop.string().optional(),
			}),
		};
		const NestedOptionalComponent = create({
			tag: "integration-nested-optional-props-component",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = NestedOptionalComponent({ details: {} });

		const renderPromise = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);

		await expect(renderPromise).resolves.toBeUndefined();
		expect(hostProps.details).toEqual({});
	});

	it("should preserve Date props through bootstrap and prop sync", async () => {
		harness = createIframeIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const initialDate = new Date("2026-01-02T03:04:05.678Z");
		const updatedDate = new Date("2026-02-03T04:05:06.789Z");

		const DateSyncComponent = create<DateSyncProps>({
			tag: "integration-date-props-sync-component",
			url: "https://host.example.com/widget",
			props: DATE_SYNC_PROP_DEFINITIONS,
		});

		const instance = DateSyncComponent({
			publishedAt: initialDate,
		});

		const renderPromise = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			DATE_SYNC_PROP_DEFINITIONS,
		);

		await expect(renderPromise).resolves.toBeUndefined();

		expect(hostProps.publishedAt).toBeInstanceOf(Date);
		expect(hostProps.publishedAt.toISOString()).toBe(initialDate.toISOString());

		const onProps = vi.fn();
		hostProps.onProps(onProps);

		await expect(
			instance.updateProps({
				publishedAt: updatedDate,
			}),
		).resolves.toBeUndefined();

		expect(hostProps.publishedAt).toBeInstanceOf(Date);
		expect(hostProps.publishedAt.toISOString()).toBe(updatedDate.toISOString());
		expect(onProps).toHaveBeenCalledTimes(1);
		expect(onProps.mock.calls[0][0].publishedAt).toBeInstanceOf(Date);
		expect(onProps.mock.calls[0][0].publishedAt.toISOString()).toBe(
			updatedDate.toISOString(),
		);
	});

	it("should deliver transformed props through bootstrap and prop sync", async () => {
		harness = createIframeIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const TransformedSyncComponent = create<
			TransformedSyncProps,
			unknown,
			TransformedSyncInput
		>({
			tag: "integration-transformed-props-sync-component",
			url: "https://host.example.com/widget",
			props: TRANSFORMED_SYNC_PROP_DEFINITIONS,
		});

		const instance = TransformedSyncComponent({ amount: "41" });

		const renderPromise = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost<
			TransformedSyncProps,
			TransformedSyncInput
		>(container, TRANSFORMED_SYNC_PROP_DEFINITIONS);

		await expect(renderPromise).resolves.toBeUndefined();

		expect(hostProps.amount).toBe(41);
		expect(hostProps.consumer.props.amount).toBe(41);

		const onProps = vi.fn();
		hostProps.onProps(onProps);

		await expect(
			instance.updateProps({ amount: "42" }),
		).resolves.toBeUndefined();

		expect(hostProps.amount).toBe(42);
		expect(hostProps.consumer.props.amount).toBe(42);
		expect(onProps).toHaveBeenCalledTimes(1);
		expect(onProps).toHaveBeenCalledWith({ amount: 42 });
	});

	it("should accept undefined normalized outputs for required inputs across bootstrap and prop sync", async () => {
		harness = createIframeIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const OptionalTransformOutputSyncComponent = create<
			OptionalTransformOutputSyncProps,
			unknown,
			OptionalTransformOutputSyncInput
		>({
			tag: "integration-optional-transform-output-sync-component",
			url: "https://host.example.com/widget",
			props: OPTIONAL_TRANSFORM_OUTPUT_SYNC_PROP_DEFINITIONS,
		});

		const instance = OptionalTransformOutputSyncComponent({ amount: "empty" });

		const renderPromise = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost<
			OptionalTransformOutputSyncProps,
			OptionalTransformOutputSyncInput
		>(container, OPTIONAL_TRANSFORM_OUTPUT_SYNC_PROP_DEFINITIONS);

		await expect(renderPromise).resolves.toBeUndefined();

		expect(hostProps.amount).toBeUndefined();
		expect(hostProps.consumer.props.amount).toBeUndefined();

		const onProps = vi.fn();
		hostProps.onProps(onProps);

		await expect(
			instance.updateProps({ amount: "42" }),
		).resolves.toBeUndefined();
		expect(hostProps.amount).toBe(42);

		await expect(
			instance.updateProps({ amount: "empty" }),
		).resolves.toBeUndefined();

		expect(hostProps.amount).toBeUndefined();
		expect(hostProps.consumer.props.amount).toBeUndefined();
		expect(onProps).toHaveBeenCalledTimes(2);
		expect(onProps).toHaveBeenNthCalledWith(1, { amount: 42 });
		expect(onProps).toHaveBeenNthCalledWith(2, {});
	});
});
