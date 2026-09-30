/** React commits synchronize through the real consumer/host messaging pipeline. */
import * as React from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	create,
	createReactComponent,
	prop,
	withReactComponent,
} from "@/index";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

describe("React commits across the host boundary", () => {
	let harness: IframeIntegrationHarness;
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		harness = createIframeIntegrationHarness();
		// React flushes effects through iframe opening before the test can attach
		// the host. Supply the browser window at that boundary from the outset.
		vi.spyOn(
			HTMLIFrameElement.prototype,
			"contentWindow",
			"get",
		).mockReturnValue(harness.hostWindow);
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await React.act(async () => root.unmount());
		await harness.cleanup();
		vi.unstubAllGlobals();
	});

	it("renders the driver's container styles and forwards its DOM ref without leaking wrapper props to the host", async () => {
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-driver-container-contract",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = withReactComponent(React)(Component);
		expect(Wrapped.displayName).toBe("ForgeFrame(Component)");
		const ref = React.createRef<HTMLDivElement>();
		await React.act(async () => {
			root.render(
				React.createElement(Wrapped, {
					title: "hello",
					ref,
					className: "custom-wrapper",
					style: { backgroundColor: "red" },
				}),
			);
		});
		expect(ref.current).toBe(container.firstElementChild);
		expect(ref.current?.className).toBe("custom-wrapper");
		expect(ref.current?.style.display).toBe("inline-block");
		expect(ref.current?.style.backgroundColor).toBe("red");
		const { hostProps, iframe } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await vi.waitFor(() => expect(iframe.style.visibility).toBe("visible"));
		expect(hostProps.consumer.props).toEqual({ title: "hello" });
		await React.act(async () => root.render(null));
		expect(ref.current).toBeNull();
		expect(Component.instances).toHaveLength(0);
	});

	it("uses the latest lifecycle callbacks and ref while equivalent commits avoid host notifications", async () => {
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-latest-observers",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component, { React });
		const oldRendered = vi.fn();
		const oldClose = vi.fn();
		const oldError = vi.fn();
		const rendered = vi.fn();
		const closed = vi.fn();
		const onError = vi.fn();
		const oldRef = vi.fn();
		const ref = vi.fn();
		await React.act(async () =>
			root.render(
				React.createElement(Wrapped, {
					title: "hello",
					ref: oldRef,
					onRendered: oldRendered,
					onClose: oldClose,
					onError: oldError,
				}),
			),
		);
		const mount = container.firstElementChild;
		await React.act(async () =>
			root.render(
				React.createElement(Wrapped, {
					title: "hello",
					ref,
					onRendered: rendered,
					onClose: closed,
					onError,
				}),
			),
		);
		expect(oldRef.mock.calls).toEqual([[mount], [null]]);
		expect(ref).toHaveBeenCalledExactlyOnceWith(mount);
		const { hostProps, iframe } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await vi.waitFor(() => expect(rendered).toHaveBeenCalledOnce());
		expect(oldRendered).not.toHaveBeenCalled();
		const updates = vi.fn();
		hostProps.onProps(updates);
		await React.act(async () =>
			root.render(
				React.createElement(Wrapped, {
					title: "hello",
					ref,
					onRendered: rendered,
					onClose: closed,
					onError,
					className: "updated-class",
				}),
			),
		);
		await harness.flushMessages();
		expect(updates).not.toHaveBeenCalled();
		await React.act(async () =>
			root.render(
				React.createElement(Wrapped, {
					title: "updated",
					ref,
					onRendered: rendered,
					onClose: closed,
					onError,
				}),
			),
		);
		await vi.waitFor(() =>
			expect(updates).toHaveBeenCalledExactlyOnceWith({ title: "updated" }),
		);
		expect(container.querySelector("iframe")).toBe(iframe);
		await React.act(async () => {
			await harness.withHostGlobalsAsync(() =>
				hostProps.onError(new Error("host operation failed")),
			);
		});
		expect(onError).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ message: "host operation failed" }),
		);
		expect(oldError).not.toHaveBeenCalled();
		await React.act(async () => {
			await harness.withHostGlobalsAsync(() => hostProps.close());
		});
		expect(closed).toHaveBeenCalledOnce();
		expect(oldClose).not.toHaveBeenCalled();
		expect(Component.instances).toHaveLength(0);
		expect(container.querySelector("iframe")).toBeNull();
		await React.act(async () => root.render(null));
		expect(ref.mock.calls).toEqual([[mount], [null]]);
		expect(closed).toHaveBeenCalledOnce();
	});

	it("recovers from a blocked popup by changing context without replacing the forwarded container", async () => {
		vi.spyOn(window, "open").mockReturnValue(null);
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-render-context-recovery",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component, { React });
		const ref = React.createRef<HTMLDivElement>();
		const onError = vi.fn();
		const onRendered = vi.fn();
		await React.act(async () =>
			root.render(
				React.createElement(Wrapped, {
					title: "hello",
					context: "popup",
					ref,
					onError,
					onRendered,
				}),
			),
		);
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
		expect(container.textContent).toContain("Error:");
		expect(container.textContent).toContain("Popup blocked by browser");
		const mount = ref.current;
		expect(mount).toBe(container.firstElementChild);
		await React.act(async () =>
			root.render(
				React.createElement(Wrapped, {
					title: "hello",
					context: "iframe",
					ref,
					onError,
					onRendered,
				}),
			),
		);
		const { hostProps, iframe } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await vi.waitFor(() => expect(onRendered).toHaveBeenCalledOnce());
		expect(hostProps.title).toBe("hello");
		expect(ref.current).toBe(mount);
		expect(container.textContent).toBe("");
		expect(mount?.querySelector("iframe")).toBe(iframe);
		expect(onError).toHaveBeenCalledOnce();
		expect(Component.instances).toHaveLength(1);
	});

	it("finishes the current StrictMode mount while discarding the cancelled replay instance", async () => {
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-strictmode-real-host",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component, { React });
		const onError = vi.fn();
		const onRendered = vi.fn();
		await React.act(async () =>
			root.render(
				React.createElement(
					React.StrictMode,
					null,
					React.createElement(Wrapped, { title: "hello", onError, onRendered }),
				),
			),
		);
		const { hostProps, iframe } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await vi.waitFor(() => expect(onRendered).toHaveBeenCalledOnce());
		expect(hostProps.title).toBe("hello");
		expect(Component.instances).toHaveLength(1);
		expect(container.querySelectorAll("iframe")).toHaveLength(1);
		expect(iframe.style.visibility).toBe("visible");
		expect(onError).not.toHaveBeenCalled();
		await React.act(async () => root.render(null));
		expect(Component.instances).toHaveLength(0);
		expect(container.querySelector("iframe")).toBeNull();
		expect(onError).not.toHaveBeenCalled();
	});

	it("contains rejected lifecycle observers while rendering and teardown still complete", async () => {
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-rejected-lifecycle-observers",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component, { React });
		const renderedError = new Error("rendered observer failed");
		const closedError = new Error("close observer failed");
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const onError = vi.fn();
		await React.act(async () =>
			root.render(
				React.createElement(Wrapped, {
					title: "hello",
					onError,
					onRendered: async () => {
						throw renderedError;
					},
					onClose: async () => {
						throw closedError;
					},
				}),
			),
		);
		const { hostProps, iframe } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await vi.waitFor(() =>
			expect(log).toHaveBeenCalledWith(
				'Error in async event handler for "rendered":',
				renderedError,
			),
		);
		expect(iframe.style.visibility).toBe("visible");
		expect(hostProps.title).toBe("hello");
		await React.act(async () => root.render(null));
		await vi.waitFor(() =>
			expect(log).toHaveBeenCalledWith(
				'Error in async event handler for "close":',
				closedError,
			),
		);
		expect(Component.instances).toHaveLength(0);
		expect(container.querySelector("iframe")).toBeNull();
		expect(onError).not.toHaveBeenCalled();
	});

	it("contains a rejected onError callback and still delivers the next valid React commit", async () => {
		const definitions = { amount: prop.number().min(0) };
		const Component = create({
			tag: "react-rejected-error-observer",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component, { React });
		const observerError = new Error("error observer rejected");
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const onError = vi.fn(async (_error: Error) => {
			throw observerError;
		});
		await React.act(async () =>
			root.render(React.createElement(Wrapped, { amount: 1, onError })),
		);
		const { hostProps, iframe } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await vi.waitFor(() => expect(iframe.style.visibility).toBe("visible"));
		await React.act(async () =>
			root.render(React.createElement(Wrapped, { amount: -1, onError })),
		);
		await vi.waitFor(() =>
			expect(log).toHaveBeenCalledWith(
				"Error in React onError callback:",
				observerError,
			),
		);
		expect(hostProps.amount).toBe(1);
		expect(onError).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				message: expect.stringContaining("Number must be >= 0"),
			}),
		);
		await React.act(async () =>
			root.render(React.createElement(Wrapped, { amount: 2, onError })),
		);
		await vi.waitFor(() => expect(hostProps.amount).toBe(2));
		expect(container.querySelector("iframe")).toBe(iframe);
		expect(onError).toHaveBeenCalledOnce();
	});

	it("delivers commits made before host readiness in order after the handshake", async () => {
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-host-render-gate",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component, { React });
		const onError = vi.fn();
		const onRendered = vi.fn();
		await React.act(async () => {
			root.render(
				React.createElement(Wrapped, { title: "initial", onError, onRendered }),
			);
		});
		const iframe = await harness.waitForIframe(container);
		harness.attachHostToIframe(iframe);
		await React.act(async () => {
			root.render(
				React.createElement(Wrapped, { title: "second", onError, onRendered }),
			);
		});
		await React.act(async () => {
			root.render(
				React.createElement(Wrapped, { title: "third", onError, onRendered }),
			);
		});
		expect(onRendered).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();

		const host = harness.bootstrapHost<{ title: string }>(definitions);
		expect(host).not.toBeNull();
		if (!host) throw new Error("Expected an initialized host");
		const snapshots: string[] = [];
		host.hostProps.onProps(({ title }) => {
			snapshots.push(title);
		});
		await React.act(async () => {
			await host.ready;
			await vi.waitFor(() => expect(host.hostProps.title).toBe("third"));
		});
		expect(snapshots).toEqual(["initial", "second", "third"]);
		expect(onRendered).toHaveBeenCalledOnce();
		expect(onError).not.toHaveBeenCalled();
		expect(container.querySelectorAll("iframe")).toHaveLength(1);
	});

	it("resets omitted React props to defaults and removes optional host values without remounting", async () => {
		const definitions = {
			title: prop.string(),
			theme: { schema: prop.string().optional(), default: "light" },
			note: prop.string().optional(),
		};
		const Component = create({
			tag: "react-host-omitted-props",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component, { React });
		await React.act(async () => {
			root.render(
				React.createElement(Wrapped, {
					title: "initial",
					theme: "dark",
					note: "temporary",
				}),
			);
		});
		const { hostProps, iframe } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await vi.waitFor(() => expect(iframe.style.visibility).toBe("visible"));
		expect(hostProps.theme).toBe("dark");
		expect(hostProps.note).toBe("temporary");
		await React.act(async () => {
			root.render(React.createElement(Wrapped, { title: "updated" }));
		});
		await vi.waitFor(() => expect(hostProps.title).toBe("updated"));
		expect(hostProps.consumer.props).toEqual({
			title: "updated",
			theme: "light",
		});
		expect(hostProps.theme).toBe("light");
		expect(Object.hasOwn(hostProps, "note")).toBe(false);
		expect(container.querySelector("iframe")).toBe(iframe);
	});

	it("preserves host state after a rejected React update and delivers the next valid commit", async () => {
		const definitions = { amount: prop.number().min(0) };
		const Component = create({
			tag: "react-host-validation-recovery",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component, { React });
		const onError = vi.fn();
		await React.act(async () => {
			root.render(React.createElement(Wrapped, { amount: 1, onError }));
		});
		const { hostProps, iframe } = await harness.bootstrapIframeHost<{
			amount: number;
		}>(container, definitions);
		await vi.waitFor(() => expect(iframe.style.visibility).toBe("visible"));
		const snapshots: number[] = [];
		hostProps.onProps(({ amount }) => {
			snapshots.push(amount);
		});
		await React.act(async () => {
			root.render(React.createElement(Wrapped, { amount: -1, onError }));
		});
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.stringContaining("Number must be >= 0"),
			}),
		);
		expect(hostProps.amount).toBe(1);
		expect(snapshots).toEqual([]);
		await React.act(async () => {
			root.render(React.createElement(Wrapped, { amount: 2, onError }));
		});
		await vi.waitFor(() => expect(hostProps.amount).toBe(2));
		expect(snapshots).toEqual([2]);
		expect(container.querySelector("iframe")).toBe(iframe);
		expect(onError).toHaveBeenCalledOnce();
	});

	it("cancels an unready mount on unmount without reporting an error or retaining an instance", async () => {
		const Component = create({
			tag: "react-host-unmount-before-ready",
			url: "https://host.example.com/widget",
			props: { title: prop.string() },
		});
		const Wrapped = createReactComponent(Component, { React });
		const ref = React.createRef<HTMLDivElement>();
		const onError = vi.fn();
		const onRendered = vi.fn();
		await React.act(async () => {
			root.render(
				React.createElement(Wrapped, {
					title: "initial",
					ref,
					onError,
					onRendered,
				}),
			);
		});
		const mount = ref.current;
		if (!mount) throw new Error("Expected the forwarded mount container");
		expect(mount.querySelector("iframe")).not.toBeNull();
		expect(Component.instances).toHaveLength(1);
		await React.act(async () => root.render(null));
		await harness.flushMessages();
		expect(Component.instances).toHaveLength(0);
		expect(ref.current).toBeNull();
		expect(mount.querySelector("iframe")).toBeNull();
		expect(onRendered).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});
});
