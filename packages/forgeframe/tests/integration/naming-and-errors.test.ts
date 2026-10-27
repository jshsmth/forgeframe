/**
 * Integration tests for the origin-named options and ForgeFrameError codes.
 *
 * Exercises the renamed options end to end, the migration errors for removed
 * names, and the codes ForgeFrame raises on each side of the handshake,
 * including codes that cross windows.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHost } from "@/core/host/bootstrap";
import { create, ForgeFrameError, initHost, prop } from "@/index";
import { forgeFrameError } from "../forgeframe-error";
import { requireValue } from "../require-value";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

const HOST_URL = "https://host.example.com/widget";

function createContainer(): HTMLDivElement {
	const container = document.createElement("div");
	document.body.append(container);
	return container;
}

describe("Origin naming and error codes", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	it("completes a handshake with hostOrigins, initTimeout, context and consumerOrigins", async () => {
		harness = createIframeIntegrationHarness();
		const Component = create({
			tag: "renamed-options-handshake",
			url: (props) => `${HOST_URL}?id=${props.id}`,
			hostOrigins: "https://host.example.com",
			initTimeout: 2000,
			context: "iframe",
			props: { id: prop.string() },
		});
		const container = createContainer();
		const rendering = Component({ id: "a" }).render(container);
		const { host, hostProps } = await harness.bootstrapIframeHost(
			container,
			Component,
			{ consumerOrigins: [harness.consumerOrigin] },
		);
		await expect(rendering).resolves.toBeUndefined();
		expect(host.consumerOrigin).toBe(harness.consumerOrigin);
		// Read-only at runtime too, not only in the types.
		expect(() => {
			// @ts-expect-error consumerOrigin is read-only
			host.consumerOrigin = "https://x.test";
		}).toThrow(TypeError);
		expect(host.consumerOrigin).toBe(harness.consumerOrigin);
		expect(hostProps.id).toBe("a");
	});

	it.each([
		["domain", "https://host.example.com", "hostOrigins"],
		["timeout", 1000, "initTimeout"],
		["defaultContext", "popup", "context"],
	])(
		"rejects the removed %s option, naming %s",
		(option, value, replacement) => {
			expect(() =>
				create({
					tag: `removed-option-${option.toLowerCase()}`,
					url: HOST_URL,
					...{ [option]: value },
				}),
			).toThrow(
				forgeFrameError(
					"VALIDATION",
					`"${option}" was renamed. Use ${replacement}`,
				),
			);
		},
	);

	it("rejects initHost's removed allowedConsumerDomains option, naming consumerOrigins", () => {
		expect(() =>
			initHost({
				...{ allowedConsumerDomains: "*" },
				consumerOrigins: "*",
			}),
		).toThrow(forgeFrameError("VALIDATION", "renamed to consumerOrigins"));
	});

	it.each([
		["hostOrigins", "app.example.com"],
		["peers", "true"],
	])("rejects a %s string without a scheme", (option, value) => {
		expect(() =>
			create({
				tag: `bare-host-${option.toLowerCase()}`,
				url: HOST_URL,
				...{ [option]: value },
			}),
		).toThrow(
			forgeFrameError("VALIDATION", `"${value}", which is not an origin`),
		);
	});

	it("reserves then as a prop name with the VALIDATION code", () => {
		expect(() =>
			create({
				tag: "reserved-then",
				url: HOST_URL,
				// @ts-expect-error then is a reserved prop name
				// biome-ignore lint/suspicious/noThenProperty: checks the reserved name
				props: { then: prop.function() },
			}),
		).toThrow(forgeFrameError("VALIDATION", 'Prop "then" is reserved'));
	});

	it("wraps a component validate failure as VALIDATION with the original as cause", async () => {
		harness = createIframeIntegrationHarness();
		const reason = new RangeError("Amount must be positive");
		const Component = create({
			tag: "validate-cause",
			url: HOST_URL,
			props: { amount: prop.number() },
			validate: () => {
				throw reason;
			},
		});
		const error = await Component({ amount: -1 })
			.render(createContainer())
			.catch((caught: unknown) => caught);
		expect(error).toEqual(
			forgeFrameError("VALIDATION", "Amount must be positive"),
		);
		expect((error as Error).cause).toBe(reason);
	});

	it("passes errors thrown by URL functions and templates through unchanged", async () => {
		harness = createIframeIntegrationHarness();
		class TenantError extends Error {}
		const urlError = new TenantError("no tenant");
		const UrlComponent = create({
			tag: "user-url-error",
			url: () => {
				throw urlError;
			},
			hostOrigins: "*",
		});
		await expect(UrlComponent().render(createContainer())).rejects.toBe(
			urlError,
		);

		const templateError = new TenantError("template failed");
		const TemplateComponent = create({
			tag: "user-template-error",
			url: HOST_URL,
			prerenderTemplate: () => {
				throw templateError;
			},
		});
		await expect(TemplateComponent().render(createContainer())).rejects.toBe(
			templateError,
		);
	});

	it("rejects render with CANCELLED when close() interrupts it", async () => {
		harness = createIframeIntegrationHarness();
		const Component = create({ tag: "cancelled-render", url: HOST_URL });
		const instance = Component();
		const rendering = instance.render(createContainer());
		await instance.close();
		const error = await rendering.catch((caught: unknown) => caught);
		expect(error).toEqual(forgeFrameError("CANCELLED"));
		expect(
			await instance.updateProps({}).catch((caught: unknown) => caught),
		).toEqual(forgeFrameError("CLOSED"));
		expect(
			await instance
				.render(createContainer())
				.catch((caught: unknown) => caught),
		).toEqual(forgeFrameError("CLOSED"));
	});

	it("rejects render with CLOSED when the host closes during the handshake", async () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		const Component = create({ tag: "host-closed-render", url: HOST_URL });
		const container = createContainer();
		const rendering = Component().render(container);
		void rendering.catch(() => {});
		activeHarness.attachHostToIframe(
			await activeHarness.waitForIframe(container),
		);
		const host = activeHarness.bootstrapHost(Component, { autoInit: false });
		if (!host) throw new Error("Expected a host");
		await activeHarness.withHostGlobalsAsync(() => host.ready);
		await activeHarness
			.withHostGlobalsAsync(() => host.close())
			.catch(() => {});

		expect(await rendering.catch((caught: unknown) => caught)).toEqual(
			forgeFrameError("CLOSED", "closed by its host or the user"),
		);
	});

	it("rejects host.ready and emits error with the same VALIDATION when a host schema throws instead of returning issues", async () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		const Component = create({
			tag: "host-throwing-schema",
			url: HOST_URL,
			props: { amount: prop.number() },
			initTimeout: 300,
		});
		const container = createContainer();
		vi.spyOn(console, "error").mockImplementation(() => {});
		const rendering = Component({ amount: 5 }).render(container);
		void rendering.catch(() => {});
		activeHarness.attachHostToIframe(
			await activeHarness.waitForIframe(container),
		);
		const thrown = new Error("schema exploded");
		const host = activeHarness.bootstrapHost({
			amount: {
				"~standard": {
					version: 1,
					vendor: "test",
					validate: () => {
						throw thrown;
					},
				},
			},
		});
		if (!host) throw new Error("Expected a host");
		const emitted: Error[] = [];
		host.on("error", (err) => {
			emitted.push(err);
		});

		const error = await host.ready.catch((caught: unknown) => caught);
		expect(error).toEqual(forgeFrameError("VALIDATION", "schema exploded"));
		expect((error as Error).cause).toBe(thrown);
		expect(emitted).toEqual([error]);
		expect(emitted[0]).toBe(error);
		await rendering.catch(() => {});
	});

	it("reports a host schema rejection as INIT_TIMEOUT whose cause carries the host's VALIDATION", async () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		const Component = create({
			tag: "host-rejection-code",
			url: HOST_URL,
			props: { amount: prop.number() },
			initTimeout: 300,
		});
		const container = createContainer();
		const instance = Component({ amount: 5 });
		const consumerErrors: unknown[] = [];
		instance.event.on("error", (error) => {
			consumerErrors.push(error);
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const rendering = instance.render(container);
		void rendering.catch(() => {});
		activeHarness.attachHostToIframe(
			await activeHarness.waitForIframe(container),
		);

		const host = activeHarness.bootstrapHost({ amount: prop.string() });
		if (!host) throw new Error("Expected a host");
		const hostErrors: unknown[] = [];
		host.on("error", (error) => {
			hostErrors.push(error);
		});
		expect(await host.ready.catch((caught: unknown) => caught)).toEqual(
			forgeFrameError("VALIDATION"),
		);

		const error = await rendering.catch((caught: unknown) => caught);
		expect(error).toEqual(
			forgeFrameError("INIT_TIMEOUT", "Expected string, got number"),
		);
		expect((error as Error).cause).toEqual(forgeFrameError("VALIDATION"));
		expect(consumerErrors).toEqual([error]);
		expect(hostErrors).toEqual([forgeFrameError("VALIDATION")]);
	});

	it("rejects initHost with ORIGIN_REJECTED for a consumer outside consumerOrigins", async () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		const Component = create({ tag: "origin-rejected-host", url: HOST_URL });
		const container = createContainer();
		void Component()
			.render(container)
			.catch(() => {});
		activeHarness.attachHostToIframe(
			await activeHarness.waitForIframe(container),
		);
		expect(() =>
			activeHarness.bootstrapHost(Component, {
				consumerOrigins: "https://partner.example.com",
			}),
		).toThrow(
			forgeFrameError("ORIGIN_REJECTED", "is not allowed by consumerOrigins"),
		);
		expect(getHost()).toBeNull();
	});

	it("carries the host's VALIDATION code to a rejected updateProps()", async () => {
		harness = createIframeIntegrationHarness();
		const Component = create({
			tag: "update-rejection-code",
			url: HOST_URL,
			props: { amount: prop.number() },
		});
		const container = createContainer();
		const instance = Component({ amount: 1 });
		const rendering = instance.render(container);
		vi.spyOn(console, "error").mockImplementation(() => {});
		await harness.bootstrapIframeHost(container, {
			amount: prop.number().max(10),
		});
		await rendering;

		const error = await instance
			.updateProps({ amount: 50 })
			.catch((caught: unknown) => caught);
		expect(error).toEqual(forgeFrameError("VALIDATION"));
	});

	it("rejects a throwing remote callback with a plain Error that carries no code", async () => {
		harness = createIframeIntegrationHarness();
		const Component = create({
			tag: "callback-error-code",
			url: HOST_URL,
			props: {
				onPlain: prop.function<() => void>(),
				onCoded: prop.function<() => void>(),
			},
		});
		const container = createContainer();
		const rendering = Component({
			onPlain: () => {
				throw new Error("plain failure");
			},
			onCoded: () => {
				throw new ForgeFrameError("CAPACITY", "coded failure");
			},
		}).render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			Component,
		);
		await rendering;

		for (const [call, message] of [
			[hostProps.onPlain, "plain failure"],
			[hostProps.onCoded, "coded failure"],
		] as const) {
			const error = await harness.withHostGlobalsAsync(() =>
				call().catch((caught: unknown) => caught),
			);
			expect(error).toBeInstanceOf(Error);
			expect(error).not.toBeInstanceOf(ForgeFrameError);
			expect((error as Error).message).toBe(message);
			expect(error).not.toHaveProperty("code");
		}
	});

	it("emits VALIDATION for a rejected export, rejects export(), and drops its callbacks", async () => {
		harness = createIframeIntegrationHarness();
		const Component = create({
			tag: "export-rejection-code",
			url: HOST_URL,
			exports: prop.object({ ready: prop.boolean() }),
		});
		const container = createContainer();
		const instance = Component();
		const errors: unknown[] = [];
		instance.event.on("error", (error) => {
			errors.push(error);
		});
		const rendering = instance.render(container);
		const { host } = await harness.bootstrapIframeHost(container, {});
		await rendering;
		// Bracket access reaches private members with their real types.
		const bridge = requireValue(getHost())["transport"].bridge;

		await harness.withHostGlobalsAsync(() =>
			host.export({ ready: true, refresh: () => 1 }),
		);
		const retained = bridge["localFunctions"].size;
		const error = await harness.withHostGlobalsAsync(() =>
			host
				.export({ ready: "yes", extra: () => 2, more: () => 3 })
				.catch((caught: unknown) => caught),
		);

		expect(error).toEqual(forgeFrameError("VALIDATION"));
		expect(errors).toHaveLength(1);
		expect(errors[0]).toEqual(forgeFrameError("VALIDATION"));
		expect(instance.exports).toMatchObject({ ready: true });
		expect(bridge["localFunctions"].size).toBe(retained);
	});

	it("rejects a URL outside hostOrigins with ORIGIN_REJECTED and keeps the instance open for a retry", async () => {
		harness = createIframeIntegrationHarness();
		const Component = create({
			tag: "url-origin-retry",
			url: (props) => `https://${props.tenant}.example.com/widget`,
			hostOrigins: "https://host.example.com",
			props: { tenant: prop.string() },
		});
		const container = createContainer();
		const instance = Component({ tenant: "attacker" });

		expect(
			await instance.render(container).catch((caught: unknown) => caught),
		).toEqual(
			forgeFrameError("ORIGIN_REJECTED", "https://attacker.example.com"),
		);
		expect(container.querySelector("iframe")).toBeNull();
		expect(Component.instances).toEqual([instance]);

		await instance.updateProps({ tenant: "host" });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			Component,
		);
		await expect(rendering).resolves.toBeUndefined();
		expect(hostProps.tenant).toBe("host");
	});

	it("applies show, hide, focus and resize before they return", async () => {
		harness = createIframeIntegrationHarness();
		const Component = create({ tag: "sync-dom-methods", url: HOST_URL });
		const container = createContainer();
		const instance = Component();
		const rendering = instance.render(container);
		const { iframe } = await harness.bootstrapIframeHost(container, Component);
		await rendering;
		const events: string[] = [];
		instance.event.on("focus", () => {
			events.push("focus");
		});
		instance.event.on("resize", (size) => {
			events.push(`resize:${size.width}`);
		});

		expect(instance.hide()).toBeUndefined();
		expect(iframe.style.display).toBe("none");
		expect(instance.show()).toBeUndefined();
		expect(iframe.style.display).not.toBe("none");
		expect(instance.resize({ width: 321 })).toBeUndefined();
		expect(iframe.style.width).toBe("321px");
		expect(instance.focus()).toBeUndefined();
		expect(events).toEqual(["resize:321", "focus"]);
	});
});
