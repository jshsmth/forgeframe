/**
 * Integration tests for the one-schema-per-prop rule.
 *
 * Each prop's schema must accept its own output unchanged, because the
 * consumer's trust boundaries and the host validate normalized values with the
 * same schema. Covers coercing and union-accepting schemas, violations at
 * construction and on update, the removed `outputSchema` option, host
 * rejection of values its schema would change, shared presence messages and
 * per-instance defaults.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getComponent } from "@/core/component";
import { getHost } from "@/core/host/bootstrap";
import { create, prop } from "@/index";
import { forgeFrameError } from "../forgeframe-error";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

const SELF_ACCEPTANCE_RULE =
	"the prop schema must accept its own output unchanged, because ForgeFrame validates delivered values with the same schema";

describe("One schema per prop", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	function mountContainer(): HTMLDivElement {
		const container = document.createElement("div");
		document.body.append(container);
		return container;
	}

	it("delivers coerced props through bootstrap and prop sync, and accepts outputs as inputs", async () => {
		harness = createIframeIntegrationHarness();
		const container = mountContainer();
		const definitions = { amount: z.coerce.number() };
		const Component = create({
			tag: "coerced-props-sync",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ amount: "41" });
		const rendering = instance.render(container);
		const { host, hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.amount).toBe(41);

		const snapshots: unknown[] = [];
		host.onProps((props) => {
			snapshots.push(props.amount);
		});
		await instance.updateProps({ amount: "42" });
		expect(hostProps.amount).toBe(42);
		await instance.updateProps({ amount: 43 });
		expect(hostProps.amount).toBe(43);
		expect(snapshots).toEqual([42, 43]);
	});

	it("converts an ISO string to a Date and delivers a later Date unchanged", async () => {
		harness = createIframeIntegrationHarness();
		const container = mountContainer();
		const definitions = {
			startsAt: z
				.union([z.iso.datetime(), z.date()])
				.transform((value) => new Date(value)),
		};
		const Component = create({
			tag: "date-union-props-sync",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ startsAt: "2026-11-01T09:00:00.000Z" });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.startsAt).toBeInstanceOf(Date);
		expect(hostProps.startsAt.toISOString()).toBe("2026-11-01T09:00:00.000Z");

		const next = new Date("2026-12-24T18:30:00.000Z");
		await instance.updateProps({ startsAt: next });
		expect(hostProps.startsAt).toBeInstanceOf(Date);
		expect(hostProps.startsAt.getTime()).toBe(next.getTime());
	});

	it("rejects an update whose value the schema changes again, keeps both snapshots and delivers a later valid update", async () => {
		harness = createIframeIntegrationHarness();
		const container = mountContainer();
		// Idempotent below 10; 25 becomes 15, which a second run changes to 5.
		const definitions = {
			amount: z
				.number()
				.transform((value) => (value >= 10 ? value - 10 : value)),
		};
		const Component = create({
			tag: "non-idempotent-update",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ amount: 5 });
		const rendering = instance.render(container);
		const { host, hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		const snapshots: unknown[] = [];
		host.onProps((props) => {
			snapshots.push(props.amount);
		});

		await expect(instance.updateProps({ amount: 25 })).rejects.toThrow(
			forgeFrameError(
				"VALIDATION",
				`Validation failed: amount: ${SELF_ACCEPTANCE_RULE}; the schema changed the value.`,
			),
		);
		expect(hostProps.amount).toBe(5);
		expect(hostProps).toEqual({ amount: 5 });
		expect(snapshots).toEqual([]);

		await instance.updateProps({ amount: 12 });
		expect(hostProps.amount).toBe(2);
		expect(snapshots).toEqual([2]);
	});

	it.each([
		["delivered", { sendToHost: true }],
		["consumer-only", { sendToHost: false }],
	])(
		"rejects a wrapped type-changing %s schema at render without creating an iframe",
		async (_label, options) => {
			const container = mountContainer();
			const Component = create({
				tag: `type-changing-${options.sendToHost ? "delivered" : "local"}`,
				url: "https://host.example.com/widget",
				props: {
					// @ts-expect-error a JavaScript caller bypasses the self-acceptance rule
					amount: { schema: z.string().transform(Number), ...options },
				},
			});
			const instance = Component({ amount: "42" });

			await expect(instance.render(container)).rejects.toThrow(
				forgeFrameError(
					"VALIDATION",
					`Validation failed: amount: ${SELF_ACCEPTANCE_RULE}; the schema rejected it: amount: Invalid input: expected string, received number.`,
				),
			);
			expect(container.querySelector("iframe")).toBeNull();
			container.remove();
		},
	);

	it("rejects outputSchema in create() before registering the factory", () => {
		expect(() =>
			create({
				tag: "removed-output-schema-consumer",
				url: "https://host.example.com/widget",
				props: {
					// @ts-expect-error outputSchema was removed; this checks the runtime error
					amount: { schema: z.number(), outputSchema: z.number() },
				},
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "amount" uses the removed "outputSchema" option. Each prop now has one schema, which must accept its own output unchanged.',
			),
		);
		expect(getComponent("removed-output-schema-consumer")).toBeUndefined();
	});

	it("rejects outputSchema in the tag-agnostic initHost() before starting a host", async () => {
		harness = createIframeIntegrationHarness();
		const container = mountContainer();
		const Component = create({
			tag: "removed-output-schema-host",
			url: "https://host.example.com/widget",
			props: { amount: z.number() },
		});
		const rendering = Component({ amount: 1 }).render(container);
		harness.attachHostToIframe(await harness.waitForIframe(container));

		expect(() =>
			harness?.bootstrapHost({
				amount: { schema: z.number(), outputSchema: z.number() },
			}),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				'Prop "amount" uses the removed "outputSchema" option.',
			),
		);
		expect(getHost()).toBeNull();

		const host = harness.bootstrapHost({ amount: z.number() });
		if (!host) throw new Error("Expected the corrected host to initialize");
		await host.ready;
		await rendering;
		expect((await host.ready).amount).toBe(1);
	});

	it("rejects a received value that the host schema would change, once at the render timeout", async () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		const container = mountContainer();
		const Component = create({
			tag: "host-strips-unknown-fields",
			url: "https://host.example.com/widget",
			props: { profile: z.looseObject({ name: z.string() }) },
			initTimeout: 300,
		});
		const instance = Component({ profile: { name: "Ada", role: "admin" } });
		const errors: string[] = [];
		instance.event.on("error", (error) => {
			errors.push((error as Error).message);
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const rendering = instance.render(container);
		void rendering.catch(() => {});
		activeHarness.attachHostToIframe(
			await activeHarness.waitForIframe(container),
		);

		// Zod objects strip unknown keys, so the host schema would drop `role`.
		const host = activeHarness.bootstrapHost({
			profile: z.object({ name: z.string() }),
		});
		if (!host) throw new Error("Expected a host");
		const reason =
			"Validation failed: profile: value no longer matches its normalized schema output";
		await expect(host.ready).rejects.toThrow(
			forgeFrameError("VALIDATION", reason),
		);
		await expect(rendering).rejects.toThrow(
			forgeFrameError(
				"INIT_TIMEOUT",
				`did not initialize within 300ms. Host initialization failed: ${reason}`,
			),
		);
		expect(errors).toEqual([expect.stringContaining(reason)]);
	});

	it.each([
		["direct", prop.string()],
		["wrapped", { schema: prop.string(), queryParam: true }],
	])(
		"rejects an omitted %s required prop with the same message on the consumer",
		async (label, entry) => {
			const container = mountContainer();
			const Component = create({
				tag: `required-message-${label}`,
				url: "https://host.example.com/widget",
				props: { title: entry },
			});
			// @ts-expect-error the required title is omitted on purpose
			const instance = Component({});

			await expect(instance.render(container)).rejects.toThrow(
				forgeFrameError("VALIDATION", "Validation failed: title: Required"),
			);
			await expect(
				// @ts-expect-error a required prop cannot be reset to undefined
				instance.updateProps({ title: undefined }),
			).rejects.toThrow(
				forgeFrameError("VALIDATION", "Validation failed: title: Required"),
			);
			container.remove();
		},
	);

	it.each([
		["direct", prop.string()],
		["wrapped", { schema: prop.string() }],
	])(
		"rejects an omitted %s required prop with the same message in host bootstrap and updates",
		async (label, entry) => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const container = mountContainer();
			const Component = create({
				tag: `host-required-message-${label}`,
				url: "https://host.example.com/widget",
				props: { title: prop.string().optional(), count: prop.number() },
			});
			vi.spyOn(console, "error").mockImplementation(() => {});

			const missing = Component({ count: 1 });
			const failedRender = missing.render(container);
			void failedRender.catch(() => {});
			activeHarness.attachHostToIframe(
				await activeHarness.waitForIframe(container),
			);
			const rejectedHost = activeHarness.bootstrapHost({
				title: entry,
				count: prop.number(),
			});
			if (!rejectedHost) throw new Error("Expected a host");
			await expect(rejectedHost.ready).rejects.toThrow(
				forgeFrameError("VALIDATION", "Validation failed: title: Required"),
			);
			await missing.close();
			container.replaceChildren();

			const present = Component({ title: "ready", count: 1 });
			const rendering = present.render(container);
			const { host, hostProps } = await activeHarness.bootstrapIframeHost(
				container,
				{ title: entry, count: prop.number() },
			);
			await rendering;
			const hostErrors: string[] = [];
			host.on("error", (error) => {
				hostErrors.push(error.message);
			});

			await expect(present.updateProps({ title: undefined })).rejects.toThrow(
				forgeFrameError("VALIDATION", "Validation failed: title: Required"),
			);
			expect(hostErrors).toEqual(["Validation failed: title: Required"]);
			expect(hostProps.title).toBe("ready");
		},
	);

	it("gives each instance its own copy of an object or array default", async () => {
		type DefaultedProps = { tags: string[]; settings: { theme: string } };
		const seen: DefaultedProps[] = [];
		const Component = create({
			tag: "per-instance-defaults",
			url: "https://host.example.com/widget",
			props: {
				tags: prop.array(prop.string()).default([]),
				settings: prop.object({ theme: prop.string() }).default({
					theme: "light",
				}),
			},
			validate: ({ props }) => {
				seen.push(props);
			},
		});

		await Component().updateProps({});
		seen[0]?.tags.push("mutated");
		await Component().updateProps({});

		expect(seen).toHaveLength(2);
		expect(seen[1]?.tags).toEqual([]);
		expect(seen[1]?.settings).toEqual({ theme: "light" });
		expect(seen[1]?.settings).not.toBe(seen[0]?.settings);
	});

	it("never applies a host-side default: an omitted value the host schema would default is rejected", async () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		const container = mountContainer();
		const Component = create({
			tag: "host-default-not-applied",
			url: "https://host.example.com/widget",
			props: { tags: prop.array(prop.string()).optional() },
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const rendering = Component().render(container);
		void rendering.catch(() => {});
		activeHarness.attachHostToIframe(
			await activeHarness.waitForIframe(container),
		);

		const host = activeHarness.bootstrapHost({
			tags: prop.array(prop.string()).default([]),
		});
		if (!host) throw new Error("Expected a host");
		await expect(host.ready).rejects.toThrow(
			forgeFrameError(
				"VALIDATION",
				"Validation failed: tags: value no longer matches its normalized schema output",
			),
		);
	});
});
