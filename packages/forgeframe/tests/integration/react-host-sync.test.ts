/** React commits synchronize through the real consumer/host messaging pipeline. */

import { create, prop } from "forgeframe";
import { createReactComponent, type ReactInstance } from "forgeframe/react";
import * as React from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgeFrameError } from "../forgeframe-error";
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
		// Restore spies first, so cleanup's own restores are not overwritten.
		vi.restoreAllMocks();
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
		const Wrapped = createReactComponent(Component);
		expect(Wrapped.displayName).toBe(
			"ForgeFrame(react-driver-container-contract)",
		);
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
		expect(hostProps).toEqual({ title: "hello" });
		await React.act(async () => root.render(null));
		expect(ref.current).toBeNull();
		expect(Component.instances).toHaveLength(0);
	});

	it("attaches the forwarded ref before parent layout effects and honors React 19 ref cleanups", async () => {
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-driver-commit-phase-ref",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component);
		const observed: Array<HTMLDivElement | null> = [];
		const attached: HTMLDivElement[] = [];
		const cleanup = vi.fn();
		const forwardedRef = vi.fn((node: HTMLDivElement | null) => {
			if (node) attached.push(node);
			return cleanup;
		});
		function Parent() {
			const ref = React.useRef<HTMLDivElement>(null);
			React.useLayoutEffect(() => {
				observed.push(ref.current);
			}, []);
			return React.createElement(
				React.Fragment,
				null,
				React.createElement(Wrapped, { title: "layout", ref }),
				React.createElement(Wrapped, { title: "cleanup", ref: forwardedRef }),
			);
		}

		await React.act(async () => {
			root.render(React.createElement(Parent));
		});
		expect(observed).toEqual([container.firstElementChild]);
		expect(forwardedRef).toHaveBeenCalledExactlyOnceWith(container.children[1]);

		await React.act(async () => root.render(null));
		expect(cleanup).toHaveBeenCalledOnce();
		expect(forwardedRef).not.toHaveBeenCalledWith(null);
		expect(attached).toHaveLength(1);
		expect(Component.instances).toHaveLength(0);
	});

	it("uses the latest lifecycle callbacks and ref while equivalent commits avoid host notifications", async () => {
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-latest-observers",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component);
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
		const { host, iframe } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await vi.waitFor(() => expect(rendered).toHaveBeenCalledOnce());
		expect(oldRendered).not.toHaveBeenCalled();
		const updates = vi.fn();
		host.onProps(updates);
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
				host.reportError(new Error("host operation failed")),
			);
		});
		expect(onError).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ message: "host operation failed" }),
		);
		expect(oldError).not.toHaveBeenCalled();
		await React.act(async () => {
			await harness.withHostGlobalsAsync(() => host.close());
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
		const Wrapped = createReactComponent(Component);
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
		const Wrapped = createReactComponent(Component);
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
		const Wrapped = createReactComponent(Component);
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
				"Error in React onRendered callback:",
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
		const Wrapped = createReactComponent(Component);
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
			forgeFrameError("VALIDATION", "Number must be >= 0"),
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
		const Wrapped = createReactComponent(Component);
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

		const host = harness.bootstrapHost(definitions);
		expect(host).not.toBeNull();
		if (!host) throw new Error("Expected an initialized host");
		const snapshots: string[] = [];
		host.onProps(({ title }) => {
			snapshots.push(title);
		});
		await React.act(async () => {
			const props = await host.ready;
			await vi.waitFor(() => expect(props.title).toBe("third"));
		});
		expect(snapshots).toEqual(["initial", "second", "third"]);
		expect(onRendered).toHaveBeenCalledOnce();
		expect(onError).not.toHaveBeenCalled();
		expect(container.querySelectorAll("iframe")).toHaveLength(1);
	});

	it("resets omitted React props to defaults and removes optional host values without remounting", async () => {
		const definitions = {
			title: prop.string(),
			theme: { schema: prop.string().default("light"), queryParam: true },
			note: prop.string().optional(),
		};
		const Component = create({
			tag: "react-host-omitted-props",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component);
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
			Component,
		);
		await vi.waitFor(() => expect(iframe.style.visibility).toBe("visible"));
		expect(hostProps.theme).toBe("dark");
		expect(hostProps.note).toBe("temporary");
		await React.act(async () => {
			root.render(React.createElement(Wrapped, { title: "updated" }));
		});
		await vi.waitFor(() => expect(hostProps.title).toBe("updated"));
		expect(hostProps).toEqual({
			title: "updated",
			theme: "light",
		});
		expect(hostProps.theme).toBe("light");
		expect(Object.hasOwn(hostProps, "note")).toBe(false);
		expect(container.querySelector("iframe")).toBe(iframe);
	});

	it("treats an explicit undefined prop like an omitted one", async () => {
		const definitions = {
			title: prop.string(),
			theme: prop.string().default("light"),
		};
		const Component = create({
			tag: "react-host-explicit-undefined",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component);
		await React.act(async () => {
			root.render(React.createElement(Wrapped, { title: "a", theme: "dark" }));
		});
		const { host, hostProps, iframe } = await harness.bootstrapIframeHost(
			container,
			Component,
		);
		await vi.waitFor(() => expect(iframe.style.visibility).toBe("visible"));
		const notifications: Record<string, unknown>[] = [];
		host.onProps((props) => notifications.push({ ...props }));
		await React.act(async () => {
			root.render(
				React.createElement(Wrapped, { title: "a", theme: undefined }),
			);
		});
		await vi.waitFor(() => expect(hostProps.theme).toBe("light"));
		const afterUndefined = { ...hostProps };
		await React.act(async () => {
			root.render(React.createElement(Wrapped, { title: "a" }));
		});
		await React.act(async () => {
			root.render(
				React.createElement(Wrapped, { title: "a", theme: undefined }),
			);
		});
		await harness.flushMessages();
		expect(notifications).toEqual([{ title: "a", theme: "light" }]);
		expect(hostProps).toEqual(afterUndefined);
	});

	it("resets a removed callback prop to its default through React", async () => {
		const fallback = () => "fallback";
		const definitions = {
			label: prop.function<() => string>().default(() => fallback),
		};
		const Component = create({
			tag: "react-host-callback-reset",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component);
		await React.act(async () => {
			root.render(React.createElement(Wrapped, { label: () => "custom" }));
		});
		const { hostProps, iframe } = await harness.bootstrapIframeHost(
			container,
			Component,
		);
		await vi.waitFor(() => expect(iframe.style.visibility).toBe("visible"));
		await expect(hostProps.label()).resolves.toBe("custom");
		await React.act(async () => {
			root.render(React.createElement(Wrapped, {}));
		});
		await vi.waitFor(async () =>
			expect(await hostProps.label()).toBe("fallback"),
		);
	});

	it("preserves host state after a rejected React update and delivers the next valid commit", async () => {
		const definitions = { amount: prop.number().min(0) };
		const Component = create({
			tag: "react-host-validation-recovery",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component);
		const onError = vi.fn();
		await React.act(async () => {
			root.render(React.createElement(Wrapped, { amount: 1, onError }));
		});
		const { host, hostProps, iframe } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await vi.waitFor(() => expect(iframe.style.visibility).toBe("visible"));
		const snapshots: number[] = [];
		host.onProps(({ amount }) => {
			snapshots.push(amount);
		});
		await React.act(async () => {
			root.render(React.createElement(Wrapped, { amount: -1, onError }));
		});
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
		expect(onError).toHaveBeenCalledWith(
			forgeFrameError("VALIDATION", "Number must be >= 0"),
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
		const Wrapped = createReactComponent(Component);
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
	it("reports only the render failure when a commit was held during that render", async () => {
		const Component = create({
			tag: "react-held-update-render-failure",
			url: "https://host.example.com/widget",
			props: { title: prop.string() },
			initTimeout: 50,
		});
		const Wrapped = createReactComponent(Component);
		const onError = vi.fn();
		await React.act(async () =>
			root.render(React.createElement(Wrapped, { title: "first", onError })),
		);
		await React.act(async () =>
			root.render(React.createElement(Wrapped, { title: "second", onError })),
		);

		await vi.waitFor(() => expect(onError).toHaveBeenCalled());
		await harness.flushMessages();
		expect(onError).toHaveBeenCalledOnce();
		expect(onError.mock.calls[0]?.[0]).toEqual(forgeFrameError("INIT_TIMEOUT"));
	});

	it("sets instanceRef after render resolves, before onRendered, and exposes exports, resize and events", async () => {
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-instance-ref",
			url: "https://host.example.com/widget",
			props: definitions,
			exports: prop.object({
				ready: prop.boolean(),
				total: prop.function<() => number>(),
			}),
		});
		const Wrapped = createReactComponent(Component);
		const instanceRef =
			React.createRef<ReactInstance<{ ready: boolean; total: () => number }>>();
		const seenByOnRendered: unknown[] = [];
		const onRendered = vi.fn(() => {
			seenByOnRendered.push(instanceRef.current);
		});
		await React.act(async () =>
			root.render(
				React.createElement(Wrapped, {
					title: "hello",
					instanceRef,
					onRendered,
				}),
			),
		);
		expect(instanceRef.current).toBeNull();

		const { host, iframe } = await harness.bootstrapIframeHost(
			container,
			Component,
		);
		await vi.waitFor(() => expect(onRendered).toHaveBeenCalledOnce());
		const handle = instanceRef.current;
		if (!handle) throw new Error("Expected an instance handle");
		expect(seenByOnRendered).toEqual([handle]);
		expect(handle.uid).toBe(Component.instances[0]?.uid);
		expect(handle).not.toHaveProperty("render");
		expect(handle).not.toHaveProperty("updateProps");

		const exported = vi.fn();
		handle.event.on("exports", exported);
		await harness.withHostGlobalsAsync(() =>
			host.export({ ready: true, total: () => 42 }),
		);
		await vi.waitFor(() => expect(exported).toHaveBeenCalledOnce());
		expect(handle.exports?.ready).toBe(true);
		await expect(handle.exports?.total()).resolves.toBe(42);

		handle.resize({ width: 320, height: 180 });
		expect(iframe.style.width).toBe("320px");
		expect(iframe.style.height).toBe("180px");
		handle.hide();
		expect(iframe.style.display).toBe("none");
		handle.show();
		expect(iframe.style.visibility).toBe("visible");
		const focus = vi.spyOn(iframe, "focus");
		handle.focus();
		expect(focus).toHaveBeenCalled();

		await React.act(async () => root.render(null));
		expect(instanceRef.current).toBeNull();
	});

	it("clears instanceRef when the host closes, then calls onClose", async () => {
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-instance-ref-host-close",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component);
		const instanceRef = React.createRef<ReactInstance>();
		const onRendered = vi.fn();
		const refAtClose: unknown[] = [];
		const onClose = vi.fn(() => {
			refAtClose.push(instanceRef.current);
		});
		await React.act(async () =>
			root.render(
				React.createElement(Wrapped, {
					title: "hello",
					instanceRef,
					onRendered,
					onClose,
				}),
			),
		);
		const { host } = await harness.bootstrapIframeHost(container, definitions);
		await vi.waitFor(() => expect(onRendered).toHaveBeenCalledOnce());
		expect(instanceRef.current).not.toBeNull();

		await React.act(async () => {
			await harness.withHostGlobalsAsync(() => host.close());
		});
		await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(refAtClose).toEqual([null]);
		expect(instanceRef.current).toBeNull();
	});

	it("gives a callback instanceRef the handle, then null, and moves it to a new ref", async () => {
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-instance-ref-callback",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component);
		const first = vi.fn();
		const second = React.createRef<ReactInstance>();
		const onRendered = vi.fn();
		await React.act(async () =>
			root.render(
				React.createElement(Wrapped, {
					title: "hello",
					instanceRef: first,
					onRendered,
				}),
			),
		);
		await harness.bootstrapIframeHost(container, definitions);
		await vi.waitFor(() => expect(onRendered).toHaveBeenCalledOnce());
		const handle = first.mock.calls[0]?.[0] as ReactInstance;
		expect(first).toHaveBeenCalledExactlyOnceWith(handle);
		expect(handle).not.toBeNull();

		await React.act(async () =>
			root.render(
				React.createElement(Wrapped, {
					title: "hello",
					instanceRef: second,
					onRendered,
				}),
			),
		);
		expect(first.mock.calls).toEqual([[handle], [null]]);
		expect(second.current).toBe(handle);

		await React.act(async () => root.render(null));
		expect(second.current).toBeNull();
		expect(first).toHaveBeenCalledTimes(2);
	});

	it("clears instanceRef on a context change and after a failed render", async () => {
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-instance-ref-context",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component);
		const instanceRef = vi.fn();
		const onRendered = vi.fn();
		const onError = vi.fn();
		const props = { title: "hello", instanceRef, onRendered, onError };
		await React.act(async () =>
			root.render(React.createElement(Wrapped, props)),
		);
		await harness.bootstrapIframeHost(container, definitions);
		await vi.waitFor(() => expect(onRendered).toHaveBeenCalledOnce());
		const iframeHandle = instanceRef.mock.calls[0]?.[0];
		expect(iframeHandle).not.toBeNull();

		// The popup is blocked in jsdom, so the new instance's render fails.
		await React.act(async () =>
			root.render(React.createElement(Wrapped, { ...props, context: "popup" })),
		);
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
		expect(onError.mock.calls[0]?.[0]).toEqual(
			forgeFrameError("POPUP_BLOCKED"),
		);
		expect(instanceRef.mock.calls).toEqual([[iframeHandle], [null]]);
		expect(onRendered).toHaveBeenCalledOnce();
	});

	it("leaves no stale handle after a StrictMode replay", async () => {
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-instance-ref-strictmode",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component);
		const instanceRef = vi.fn();
		const onRendered = vi.fn();
		await React.act(async () =>
			root.render(
				React.createElement(
					React.StrictMode,
					null,
					React.createElement(Wrapped, {
						title: "hello",
						instanceRef,
						onRendered,
					}),
				),
			),
		);
		await harness.bootstrapIframeHost(container, definitions);
		await vi.waitFor(() => expect(onRendered).toHaveBeenCalledOnce());
		expect(instanceRef).toHaveBeenCalledOnce();
		const handle = instanceRef.mock.calls[0]?.[0] as ReactInstance;
		expect(handle.uid).toBe(Component.instances[0]?.uid);

		await React.act(async () => root.render(null));
		expect(instanceRef.mock.calls).toEqual([[handle], [null]]);
	});

	it("closes through the handle, which clears instanceRef and calls onClose", async () => {
		const definitions = { title: prop.string() };
		const Component = create({
			tag: "react-instance-ref-close",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const Wrapped = createReactComponent(Component);
		const instanceRef = React.createRef<ReactInstance>();
		const onRendered = vi.fn();
		const onClose = vi.fn();
		await React.act(async () =>
			root.render(
				React.createElement(Wrapped, {
					title: "hello",
					instanceRef,
					onRendered,
					onClose,
				}),
			),
		);
		await harness.bootstrapIframeHost(container, definitions);
		await vi.waitFor(() => expect(onRendered).toHaveBeenCalledOnce());

		await React.act(async () => instanceRef.current?.close());
		expect(onClose).toHaveBeenCalledOnce();
		expect(instanceRef.current).toBeNull();
		expect(Component.instances).toHaveLength(0);
	});

	it("rejects a v1 second argument, a non-component and reserved prop names", () => {
		const Component = create({
			tag: "react-factory-arguments",
			url: "https://host.example.com/widget",
		});
		// @ts-expect-error the v1 second argument was removed; this checks the runtime error
		expect(() => createReactComponent(Component, { React })).toThrow(
			forgeFrameError("VALIDATION", "`react` peer dependency"),
		);
		// @ts-expect-error a plain function is not a component; this checks the runtime error
		expect(() => createReactComponent(() => null)).toThrow(
			forgeFrameError("VALIDATION", "component returned by create()"),
		);
		const Reserved = create({
			tag: "react-reserved-props",
			url: "https://host.example.com/widget",
			props: {
				onClose: prop.function<() => void>().optional(),
				instanceRef: prop.string().optional(),
			},
		});
		expect(() => createReactComponent(Reserved)).toThrow(
			forgeFrameError("VALIDATION", '"onClose", "instanceRef"'),
		);
		// React consumes `key` itself, so the wrapper could never forward it.
		const KeyProp = create({
			tag: "react-reserved-key",
			url: "https://host.example.com/widget",
			props: { key: prop.string() },
		});
		expect(() => createReactComponent(KeyProp)).toThrow(
			forgeFrameError("VALIDATION", '"key"'),
		);
	});
});
