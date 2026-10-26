/**
 * Integration test covering post-connect prop synchronization.
 *
 * Verifies that `instance.updateProps()` updates the host snapshot, removes
 * omitted optional keys from `hostProps`, and notifies subscribers once.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getHost } from "@/core/host/bootstrap";
import { create, EVENT, prop } from "@/index";
import type { PropsDefinition } from "@/types";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

it("validates required consumer-only inputs locally while shared host definitions omit them", async () => {
	const harness = createIframeIntegrationHarness();
	try {
		const definitions = {
			local: { schema: prop.string(), sendToHost: false },
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
			"Validation failed: local: Required",
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

const SYNC_PROP_DEFINITIONS: PropsDefinition<SyncProps> = {
	title: { schema: prop.string() },
	optionalNote: { schema: prop.string().optional() },
};

const DATE_SYNC_PROP_DEFINITIONS: PropsDefinition<DateSyncProps> = {
	publishedAt: { schema: prop.date() },
};

describe("Props sync integration", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	it("rejects readiness when a bootstrap observer destroys the host", async () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		const definitions = { amount: prop.number() };
		const instance = create({
			tag: "integration-bootstrap-observer-destroy",
			url: "https://host.example.com/widget",
			props: definitions,
		})({ amount: 1 });
		const container = document.createElement("div");
		document.body.append(container);
		const rendering = instance.render(container);
		void rendering.catch(() => undefined);
		const iframe = await activeHarness.waitForIframe(container);
		activeHarness.attachHostToIframe(iframe);
		const host = activeHarness.bootstrapHost(definitions);
		if (!host) throw new Error("Missing initial host");
		const unsubscribe = host.hostProps.onProps(() => {
			unsubscribe();
			activeHarness.withHostGlobals(() => host.destroy());
		});
		await expect(host.ready).rejects.toThrow(
			"Host destroyed before bootstrap completed",
		);
		expect(getHost()).toBeNull();
		await instance.close();
		await expect(rendering).rejects.toThrow(
			"was closed before rendering completed",
		);
		expect(container.querySelector("iframe")).toBeNull();
	});

	it("discards consumer-only fields from a stale consumer's bootstrap and updates", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		// The stale consumer still sends fields the current host declares private.
		const Component = create({
			tag: "integration-stale-private-props",
			url: "https://host.example.com/widget",
			props: {
				title: prop.string(),
				local: z.unknown(),
				constructor: z.unknown(),
				extra: prop.string(),
			},
		});
		const localSchema = z.string().refine(() => {
			throw new Error("Consumer-only validation must stay local");
		});
		const definitions = {
			title: prop.string(),
			local: { schema: localSchema, sendToHost: false },
			constructor: { schema: prop.string(), sendToHost: false },
		};
		const instance = Component({
			title: "initial",
			local: { private: "invalid for the host schema" },
			constructor: 42,
			extra: "undeclared initial",
		});
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
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
		hostProps.onProps((props) => {
			snapshots.push(props);
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
		for (const key of ["local", "constructor"]) {
			expect(Object.hasOwn(hostProps, key)).toBe(false);
		}
	});

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
		host.on("error", () => {
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

	it("defers rearmed host prop subscribers until the next acknowledged update", async () => {
		harness = createIframeIntegrationHarness();
		const Component = create({
			tag: "integration-props-subscriber-rearm",
			url: "https://host.example.com/widget",
			props: { title: prop.string() },
		});
		const container = document.createElement("div");
		document.body.append(container);
		const instance = Component({ title: "initial" });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(container, {
			title: prop.string(),
		});
		await rendering;
		const received: string[] = [];
		let subscription: () => void;
		const rearm = ({ title }: { title: string }) => {
			received.push(title);
			subscription();
			// Bound the counterexample so live Set iteration cannot freeze the test.
			if (received.length < 3) subscription = hostProps.onProps(rearm);
		};
		subscription = hostProps.onProps(rearm);
		const persistent = vi.fn();
		hostProps.onProps(persistent);

		await expect(
			instance.updateProps({ title: "first" }),
		).resolves.toBeUndefined();
		expect(received).toEqual(["first"]);
		expect(persistent).toHaveBeenCalledExactlyOnceWith({ title: "first" });
		await instance.updateProps({ title: "second" });
		expect(received).toEqual(["first", "second"]);
		expect(persistent).toHaveBeenCalledTimes(2);
	});

	it.each(["replace", "duplicate"] as const)(
		"preserves host prop subscriber registration identity during %s",
		async (action) => {
			harness = createIframeIntegrationHarness();
			const definitions = { title: prop.string() };
			const Component = create({
				tag: `integration-props-subscriber-registration-${action}`,
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const container = document.createElement("div");
			document.body.append(container);
			const instance = Component({ title: "initial" });
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			const later = vi.fn();
			let laterSubscription: () => void;
			const earlierSubscription = hostProps.onProps(() => {
				earlierSubscription();
				if (action === "replace") laterSubscription();
				laterSubscription = hostProps.onProps(later);
			});
			laterSubscription = hostProps.onProps(later);
			await instance.updateProps({ title: "first" });
			const initialCalls = action === "replace" ? 0 : 1;
			expect(later).toHaveBeenCalledTimes(initialCalls);
			await instance.updateProps({ title: "second" });
			expect(later).toHaveBeenCalledTimes(initialCalls + 1);
			expect(later).toHaveBeenLastCalledWith({ title: "second" });
		},
	);

	it.each(["cancel", "destroy"] as const)(
		"skips host prop subscribers removed before their turn by %s",
		async (action) => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const definitions = { title: prop.string() };
			const Component = create({
				tag: `integration-props-subscriber-${action}`,
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const container = document.createElement("div");
			document.body.append(container);
			const instance = Component({ title: "initial" });
			const rendering = instance.render(container);
			const { host, hostProps } = await activeHarness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			let laterSubscription: () => void;
			hostProps.onProps(() => {
				if (action === "destroy")
					activeHarness.withHostGlobals(() => host.destroy());
				else laterSubscription();
			});
			const later = vi.fn();
			laterSubscription = hostProps.onProps(later);
			await instance.updateProps({ title: "updated" });
			expect(later).not.toHaveBeenCalled();
		},
	);

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
		subscription();
		subscription();
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
			sameOrigin: {
				schema: prop.string().optional(),
				deliverTo: "same-origin",
			},
			restricted: {
				schema: prop.string().optional(),
				deliverTo: ["https://other.example.com"],
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

	it("treats explicitly undefined definitions as omitted through creation, bootstrap and updates", async () => {
		harness = createIframeIntegrationHarness();
		const definitions: PropsDefinition<{ title: string; message: string }> = {
			title: undefined,
			message: prop.string(),
		};
		const Component = create<{ title: string; message: string }>({
			tag: "integration-undefined-definition",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ title: "initial", message: "initial" });
		const container = document.createElement("div");
		document.body.append(container);
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.message).toBe("initial");
		expect(Object.hasOwn(hostProps, "title")).toBe(false);
		await instance.updateProps({ title: "updated", message: "updated" });
		expect(hostProps.message).toBe("updated");
		expect(Object.hasOwn(hostProps, "title")).toBe(false);
		await hostProps.close();
		expect(container.querySelector("iframe")).toBeNull();
	});

	it("keeps a delivered value whose host definition entry is undefined, like an undeclared one", async () => {
		harness = createIframeIntegrationHarness();
		const consumerDefinitions = { beta: prop.string(), title: prop.string() };
		const hostDefinitions: PropsDefinition<{ beta: string; title: string }> = {
			beta: undefined,
			title: prop.string(),
		};
		const Component = create({
			tag: "integration-host-undefined-definition",
			url: "https://host.example.com/widget",
			props: consumerDefinitions,
		});
		const instance = Component({ beta: "on", title: "initial" });
		const container = document.createElement("div");
		document.body.append(container);
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			hostDefinitions,
		);
		await rendering;
		expect(hostProps.beta).toBe("on");
		await instance.updateProps({ beta: "off" });
		expect(hostProps.beta).toBe("off");
	});

	it("prevents stale cancellation handles from removing a new subscription for the same callback", async () => {
		harness = createIframeIntegrationHarness();
		const definitions = { title: prop.string() };
		const instance = create({
			tag: "integration-stale-subscription-cancellation",
			url: "https://host.example.com/widget",
			props: definitions,
		})({ title: "initial" });
		const container = document.createElement("div");
		document.body.append(container);
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		const calls: string[] = [];
		const callback = ({ title }: { title: string }) => {
			calls.push(title);
		};
		const previous = hostProps.onProps(callback);
		const duplicate = hostProps.onProps(callback);
		previous();
		const current = hostProps.onProps(callback);
		previous();
		duplicate();
		await instance.updateProps({ title: "updated" });
		expect(calls).toEqual(["updated"]);
		current();
		await instance.updateProps({ title: "cancelled" });
		expect(calls).toEqual(["updated"]);
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
			details: prop.object({
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
});

describe("undefined in factory input and updates", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	const defaultLabel = () => "default-label";
	const definitions = {
		title: prop.string(),
		theme: prop.string().default("light"),
		note: prop.string().optional(),
		label: prop.function<() => string>().default(() => defaultLabel),
		empty: prop.string().nullable().optional(),
	};

	async function renderWith(input: Record<string, unknown>) {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const Component = create({
			tag: `undefined-rule-${Math.random().toString(36).slice(2)}`,
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component(input as never);
		const committed: Record<string, unknown>[] = [];
		instance.event.on(EVENT.PROPS, (props) => {
			committed.push({ ...props });
		});
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		const notifications: Record<string, unknown>[] = [];
		hostProps.onProps((props) => notifications.push({ ...props }));
		return { instance, hostProps, committed, notifications };
	}

	it("resets a prop to its schema default", async () => {
		const { instance, hostProps, committed, notifications } = await renderWith({
			title: "t",
			theme: "dark",
		});
		expect(hostProps.theme).toBe("dark");
		await instance.updateProps({ theme: undefined });
		expect(hostProps.theme).toBe("light");
		expect(notifications.at(-1)?.theme).toBe("light");
		expect(committed.at(-1)?.theme).toBe("light");
	});

	it("resets a callback prop to its default callback", async () => {
		const { instance, hostProps } = await renderWith({
			title: "t",
			label: () => "custom",
		});
		await expect(hostProps.label()).resolves.toBe("custom");
		await instance.updateProps({ label: undefined });
		await expect(hostProps.label()).resolves.toBe("default-label");
	});

	it("keeps a key left out, including after a reset, and sets a reset prop again", async () => {
		const { instance, hostProps } = await renderWith({
			title: "t",
			theme: "dark",
			note: "kept",
		});
		await instance.updateProps({ title: "u" });
		expect(hostProps.theme).toBe("dark");
		expect(hostProps.note).toBe("kept");
		await instance.updateProps({ note: undefined });
		expect(Object.hasOwn(hostProps, "note")).toBe(false);
		expect(Object.hasOwn(hostProps.consumer.props, "note")).toBe(false);
		await instance.updateProps({ title: "v" });
		expect(Object.hasOwn(hostProps, "note")).toBe(false);
		await instance.updateProps({ note: "again" });
		expect(hostProps.note).toBe("again");
	});

	it("rejects undefined for a required prop and leaves both snapshots unchanged", async () => {
		const { instance, hostProps, committed, notifications } = await renderWith({
			title: "t",
		});
		await expect(instance.updateProps({ title: undefined })).rejects.toThrow(
			"Validation failed: title: Required",
		);
		expect(hostProps.title).toBe("t");
		expect(notifications).toEqual([]);
		expect(committed).toEqual([]);
		await instance.updateProps({ title: "next" });
		expect(hostProps.title).toBe("next");
	});

	it("delivers null as a value", async () => {
		const { instance, hostProps, notifications } = await renderWith({
			title: "t",
			empty: "x",
		});
		await instance.updateProps({ empty: null });
		expect(Object.hasOwn(hostProps, "empty")).toBe(true);
		expect(hostProps.empty).toBeNull();
		expect(notifications.at(-1)).toHaveProperty("empty", null);
	});

	it("treats undefined in the factory input like a key left out", async () => {
		const { hostProps } = await renderWith({
			title: "t",
			theme: undefined,
			note: undefined,
		});
		expect(hostProps.theme).toBe("light");
		expect(Object.hasOwn(hostProps, "note")).toBe(false);
		expect(Object.hasOwn(hostProps.consumer.props, "note")).toBe(false);
	});
});

describe("close during render", () => {
	it("cancels the render and rejects held updates without validating or reaching a host", async () => {
		const harness = createIframeIntegrationHarness();
		try {
			const container = document.createElement("div");
			document.body.append(container);
			const validate = vi.fn();
			const Component = create({
				tag: "close-during-render-hold",
				url: "https://host.example.com/widget",
				props: { amount: prop.number() },
				validate,
			});
			const instance = Component({ amount: 1 });
			const rendering = instance.render(container);
			const held = instance.updateProps({ amount: 2 });
			const heldRejected = expect(held).rejects.toThrow(
				"Cannot update props after the component has closed",
			);
			const renderRejected = expect(rendering).rejects.toThrow(
				"was closed before rendering completed",
			);
			await instance.close();
			await renderRejected;
			await heldRejected;
			expect(validate).toHaveBeenCalledTimes(1);
			expect(container.querySelector("iframe")).toBeNull();
		} finally {
			await harness.cleanup();
		}
	});
});
