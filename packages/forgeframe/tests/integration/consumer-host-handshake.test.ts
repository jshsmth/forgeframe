/**
 * Integration test covering the primary iframe happy path.
 *
 * Exercises `create()`, `instance.render()`, `initHost()`, and the real INIT
 * handshake across separate consumer and host windows.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { create, EVENT, getHostProps, initHost, prop } from "@/index";
import type { HostProps, PropsDefinition } from "@/types";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

type HandshakeProps = {
	amount: number;
	message: string;
};

const HANDSHAKE_PROP_DEFINITIONS: PropsDefinition<HandshakeProps> = {
	amount: { schema: prop.number(), required: true },
	message: { schema: prop.string(), required: true },
};

describe("Consumer/host handshake integration", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	it.each([
		{ names: ["__proto__"] },
		{ names: ["__proto__", "constructor", "toString", "ordinary"] },
	])(
		"preserves own child names through bootstrap: $names",
		async ({ names }) => {
			harness = createIframeIntegrationHarness();
			const Child = create({
				tag: "own-name-child",
				url: "https://host.example.com/child",
			});
			const Parent = create({
				tag: "own-name-parent",
				url: "https://host.example.com/widget",
				children: () => Object.fromEntries(names.map((name) => [name, Child])),
			});
			const container = document.createElement("div");
			document.body.append(container);
			const instance = Parent();
			const rendering = instance.render(container);
			void rendering.catch(() => {});
			const { hostProps } = await harness.bootstrapIframeHost(container);
			await expect(rendering).resolves.toBeUndefined();
			const children = hostProps.children;
			expect(Object.keys(children ?? {})).toEqual(names);
			expect(Object.getPrototypeOf(children)).toBe(Object.prototype);
			for (const name of names) {
				expect(Object.hasOwn(children ?? {}, name)).toBe(true);
				expect(children?.[name]).toBe(Child);
			}
			await instance.updateProps({});
			expect(hostProps.children).toBe(children);
			await hostProps.close();
			expect(container.querySelector("iframe")).toBeNull();
		},
	);

	it("bootstraps a parent without serializing its child's recursive schema", async () => {
		harness = createIframeIntegrationHarness();
		const tree = z.object({
			name: z.string(),
			get children(): z.ZodArray<typeof tree> {
				return z.array(tree);
			},
		});
		const Child = create({
			tag: "recursive-schema-child",
			url: "https://host.example.com/child",
			props: { tree },
		});
		const Parent = create({
			tag: "recursive-schema-parent",
			url: "https://host.example.com/widget",
			children: () => ({ Child }),
		});
		const container = document.createElement("div");
		document.body.append(container);
		const instance = Parent();
		const rendering = instance.render(container);
		void rendering.catch(() => {});
		const { hostProps } = await harness.bootstrapIframeHost(container, {});
		await expect(rendering).resolves.toBeUndefined();
		expect(hostProps.children?.Child).toBe(Child);
		expect(tree.safeParse({ name: "root", children: [] }).success).toBe(true);
	});

	it("initializes a fresh host after public teardown and clears stale host props", async () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "host-public-teardown",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const container = document.createElement("div");
		document.body.append(container);
		const instance = Component({ title: "initial" });
		const rendering = instance.render(container);
		const { host } = await activeHarness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		activeHarness.withHostGlobals(() => host.destroy());
		expect(activeHarness.withHostGlobals(() => getHostProps())).toBeUndefined();
		const nextHost = activeHarness.withHostGlobals(() => initHost(definitions));
		if (!nextHost) throw new Error("Expected host reinitialization");
		expect(nextHost).not.toBe(host);
		await nextHost.ready;
		activeHarness.withHostGlobals(() => host.destroy());
		expect(activeHarness.withHostGlobals(() => getHostProps())).toBe(
			nextHost.hostProps,
		);
		await expect(
			instance.updateProps({ title: "updated" }),
		).resolves.toBeUndefined();
		expect(nextHost.hostProps.title).toBe("updated");
		await expect(nextHost.hostProps.hide()).resolves.toBeUndefined();
		expect(container.querySelector("iframe")?.style.display).toBe("none");
	});

	it("rejects oversized bootstrap metadata before installing a host and accepts a valid retry", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const Component = create({
			tag: "oversized-bootstrap-admission",
			url: "https://host.example.com/widget",
			props: { title: prop.string() },
		});
		const instance = Component({ title: "safe" });
		const render = instance.render(container);
		// Cleanup may cancel this render if an admission assertion fails.
		void render.catch(() => {});
		const iframe = await harness.waitForIframe(container);
		harness.attachHostToIframe(iframe);
		const validName = harness.hostWindow.name;
		const prefix = "__forgeframe__";
		const metadata = JSON.parse(
			decodeURIComponent(atob(validName.slice(prefix.length))),
		);
		harness.hostWindow.name =
			prefix +
			btoa(
				encodeURIComponent(
					JSON.stringify({ ...metadata, padding: "x".repeat(32 * 1024) }),
				),
			);
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(harness.bootstrapHost({ title: prop.string() })).toBeNull();
		expect(
			harness.withHostGlobals(() => Reflect.get(window, "hostProps")),
		).toBeUndefined();
		harness.hostWindow.name = validName;
		const host = harness.bootstrapHost<{ title: string }>({
			title: prop.string(),
		});
		if (!host)
			throw new Error("Expected the valid retry to initialize the host");
		await host.ready;
		await expect(render).resolves.toBeUndefined();
		expect(host.hostProps.title).toBe("safe");
		expect(container.querySelector("iframe")).toBe(iframe);
	});

	it("should resolve render() after initHost() completes the iframe INIT handshake", async () => {
		harness = createIframeIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const HandshakeComponent = create<HandshakeProps>({
			tag: "integration-handshake-component",
			url: "https://host.example.com/widget",
			props: HANDSHAKE_PROP_DEFINITIONS,
		});

		const instance = HandshakeComponent({
			amount: 7,
			message: "ForgeFrame ready",
		});
		const renderedSpy = vi.fn();
		instance.event.once(EVENT.RENDERED, renderedSpy);

		const renderPromise = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			HANDSHAKE_PROP_DEFINITIONS,
		);

		await expect(renderPromise).resolves.toBeUndefined();

		const windowHostProps = harness.withHostGlobals(
			() =>
				(window as unknown as { hostProps?: HostProps<HandshakeProps> })
					.hostProps,
		);

		expect(windowHostProps).toBe(hostProps);
		expect(hostProps.amount).toBe(7);
		expect(hostProps.message).toBe("ForgeFrame ready");
		expect(hostProps.consumer.props).toEqual({
			amount: 7,
			message: "ForgeFrame ready",
		});

		expect(typeof hostProps.uid).toBe("string");
		expect(hostProps.tag).toBe("integration-handshake-component");
		expect(typeof hostProps.close).toBe("function");
		expect(typeof hostProps.focus).toBe("function");
		expect(typeof hostProps.resize).toBe("function");
		expect(typeof hostProps.show).toBe("function");
		expect(typeof hostProps.hide).toBe("function");
		expect(typeof hostProps.onProps).toBe("function");
		expect(typeof hostProps.onError).toBe("function");
		expect(typeof hostProps.export).toBe("function");
		expect(typeof hostProps.consumer.export).toBe("function");
		expect(typeof hostProps.getPeerInstances).toBe("function");
		expect(hostProps.getConsumer()).toBe(harness.consumerWindow);
		expect(hostProps.getConsumerDomain()).toBe(harness.consumerOrigin);

		await expect(
			instance.updateProps({
				amount: 8,
				message: "ForgeFrame updated",
			}),
		).resolves.toBeUndefined();

		expect(hostProps.amount).toBe(8);
		expect(hostProps.message).toBe("ForgeFrame updated");
		expect(hostProps.consumer.props).toEqual({
			amount: 8,
			message: "ForgeFrame updated",
		});

		expect(renderedSpy).toHaveBeenCalledTimes(1);
	});
});
