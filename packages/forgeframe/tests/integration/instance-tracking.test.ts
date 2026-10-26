/**
 * Integration tests for consumer instance tracking and global teardown.
 *
 * Renders instances across consumer and host windows, then checks that one
 * `closeAll()` call removes their frames, empties each factory's `instances`,
 * fires each instance's lifecycle events once, and reports failures as one
 * `AggregateError`; that `Component.instances` is a read-only snapshot that
 * peer discovery does not depend on; and that `create()` rejects the removed
 * `eligible` and `children` options.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeAll, create, EVENT, prop } from "@/index";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

describe("closeAll()", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	it("closes instances of every component and leaves later instances open", async () => {
		harness = createIframeIntegrationHarness();
		const definitions = { amount: prop.number() };
		const Checkout = create({
			tag: "close-all-checkout",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const CardField = create({
			tag: "close-all-card-field",
			url: "https://host.example.com/card",
			props: definitions,
		});

		const checkoutContainer = document.createElement("div");
		const cardContainer = document.createElement("div");
		document.body.append(checkoutContainer, cardContainer);
		const checkout = Checkout({ amount: 1 });
		const checkoutRendering = checkout.render(checkoutContainer);
		await harness.bootstrapIframeHost(checkoutContainer, definitions);
		await expect(checkoutRendering).resolves.toBeUndefined();
		const card = CardField({ amount: 2 });
		const cardRendering = card.render(cardContainer);
		// The card host never answers, so closeAll() cancels its render.
		void cardRendering.catch(() => {});
		await harness.waitForIframe(cardContainer);

		const events: string[] = [];
		for (const [name, instance] of [
			["checkout", checkout],
			["card", card],
		] as const) {
			instance.event.on(EVENT.CLOSE, () => {
				events.push(`${name}:close`);
			});
			instance.event.on(EVENT.CLOSED, () => {
				events.push(`${name}:closed`);
			});
		}
		let late: ReturnType<typeof Checkout> | undefined;
		checkout.event.on(EVENT.CLOSE, () => {
			late = Checkout({ amount: 3 });
		});

		await closeAll();

		expect(checkoutContainer.querySelector("iframe")).toBeNull();
		expect(cardContainer.querySelector("iframe")).toBeNull();
		expect(CardField.instances).toEqual([]);
		expect(Checkout.instances).toEqual([late]);
		expect([...events].sort()).toEqual([
			"card:close",
			"card:closed",
			"checkout:close",
			"checkout:closed",
		]);
		await expect(cardRendering).rejects.toThrow(
			'Component "close-all-card-field" was closed before rendering completed',
		);

		await closeAll();
		expect(Checkout.instances).toEqual([]);
		await expect(closeAll()).resolves.toBeUndefined();
		expect(events).toHaveLength(4);
	});

	it("attempts every close and rejects with an AggregateError", async () => {
		harness = createIframeIntegrationHarness();
		const definitions = { amount: prop.number() };
		const Component = create({
			tag: "close-all-failure",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const container = document.createElement("div");
		document.body.append(container);
		const rendered = Component({ amount: 1 });
		const rendering = rendered.render(container);
		await harness.bootstrapIframeHost(container, definitions);
		await expect(rendering).resolves.toBeUndefined();
		const failing = Component({ amount: 2 });
		const failure = new Error("close failed");
		vi.spyOn(failing, "close").mockRejectedValueOnce(failure);

		const error = await closeAll().catch((reason: unknown) => reason);

		expect(error).toBeInstanceOf(AggregateError);
		expect((error as AggregateError).errors).toEqual([failure]);
		expect(container.querySelector("iframe")).toBeNull();
		expect(Component.instances).toEqual([failing]);
	});
});

describe("Component.instances", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	it("is a frozen snapshot that rejects mutation without changing tracking or peer discovery", async () => {
		harness = createIframeIntegrationHarness();
		const definitions = { amount: prop.number() };
		const Component = create({
			tag: "instances-snapshot",
			peers: true,
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const firstContainer = document.createElement("div");
		const secondContainer = document.createElement("div");
		document.body.append(firstContainer, secondContainer);
		const first = Component({ amount: 1 });
		const firstRendering = first.render(firstContainer);
		const { hostProps } = await harness.bootstrapIframeHost(
			firstContainer,
			definitions,
		);
		await expect(firstRendering).resolves.toBeUndefined();
		const second = Component({ amount: 2 });
		// This host never answers; its opened frame still makes it a peer.
		void second.render(secondContainer).catch(() => {});
		await harness.waitForIframe(secondContainer);

		const snapshot = Component.instances;
		expect(snapshot).toEqual([first, second]);
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Component.instances).not.toBe(snapshot);
		const mutable = snapshot as unknown as unknown[];
		expect(() => mutable.push(first)).toThrow(TypeError);
		expect(() => mutable.splice(0)).toThrow(TypeError);
		expect(() => {
			(Component as unknown as { instances: unknown[] }).instances = [];
		}).toThrow(TypeError);
		expect(Component.instances).toEqual([first, second]);
		await expect(
			harness.withHostGlobalsAsync(() => hostProps.getPeerInstances()),
		).resolves.toEqual([
			{ uid: second.uid, tag: "instances-snapshot", exports: undefined },
		]);

		await second.close();
		expect(snapshot).toEqual([first, second]);
		expect(Component.instances).toEqual([first]);
	});
});

describe("removed create() options", () => {
	it.each([
		[
			"eligible",
			() => ({ eligible: true }),
			'Component option "eligible" was removed. Throw from the component validate({ props }) option instead.',
		],
		[
			"children",
			() => ({}),
			'Component option "children" was removed. Import child components in the host page and render them there; each child host calls initHost(Child, { consumerOrigins }).',
		],
	])(
		"rejects the removed %s option with its migration before registering",
		(option, value, message) => {
			expect(() =>
				create({
					tag: `removed-${option}-option`,
					url: "https://host.example.com/widget",
					// Invalid JavaScript configuration is rejected at runtime.
					...({ [option]: value } as object),
				}),
			).toThrow(message);
			// Nothing was registered, so the tag is still free.
			expect(() =>
				create({
					tag: `removed-${option}-option`,
					url: "https://host.example.com/widget",
				}),
			).not.toThrow();
		},
	);
});
