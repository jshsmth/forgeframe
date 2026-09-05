import * as React from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create, destroyAll } from "@/core/component";
import { createReactComponent } from "@/drivers/react";
import { EventEmitter } from "@/events/emitter";
import { prop } from "@/props/prop";
import type { ForgeFrameComponent } from "@/types/runtime";

function createInstanceMock() {
	const event = new EventEmitter();
	return {
		event,
		render: vi.fn(async (_container?: HTMLElement, _context?: string) => {
			event.emit("rendered");
		}),
		updateProps: vi.fn(async () => undefined),
		close: vi.fn(async () => {
			event.emit("close");
		}),
	};
}

describe("React driver with React DOM", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await React.act(async () => root.unmount());
		container.remove();
		await destroyAll();
		vi.unstubAllGlobals();
	});

	it("recovers from a rejected render when context changes, retaining the forwarded container", async () => {
		const first = createInstanceMock();
		first.render.mockRejectedValueOnce(new Error("popup unavailable"));
		const second = createInstanceMock();
		second.render.mockImplementationOnce(async (target) => {
			target?.append(document.createElement("iframe"));
		});
		const factory = vi
			.fn()
			.mockReturnValueOnce(first)
			.mockReturnValueOnce(second);
		const Wrapped = createReactComponent(
			factory as unknown as ForgeFrameComponent,
			{ React },
		);
		const ref = React.createRef<HTMLDivElement>();
		const onError = vi.fn();

		await React.act(async () => {
			root.render(
				React.createElement(Wrapped, { context: "popup", ref, onError }),
			);
		});
		const forwardedContainer = ref.current;
		expect(container.textContent).toContain("popup unavailable");
		expect(forwardedContainer).toBe(container.firstElementChild);

		await React.act(async () => {
			root.render(
				React.createElement(Wrapped, { context: "iframe", ref, onError }),
			);
		});

		expect(factory).toHaveBeenCalledTimes(2);
		expect(second.render).toHaveBeenCalledWith(forwardedContainer, "iframe");
		expect(ref.current).toBe(forwardedContainer);
		expect(container.textContent).toBe("");
		expect(forwardedContainer?.querySelector("iframe")).not.toBeNull();
		expect(onError).toHaveBeenCalledTimes(1);
	});

	it("reports construction errors locally without unmounting sibling content", async () => {
		const failure = new Error("normalizer failed");
		const Component = create({
			tag: "react-construction-failure",
			url: "https://example.com",
			props: {
				name: {
					schema: prop.string(),
					decorate: () => {
						throw failure;
					},
				},
			},
		});
		const Wrapped = createReactComponent(Component, { React });
		const onError = vi.fn();

		await React.act(async () => {
			root.render(
				React.createElement(
					"section",
					null,
					React.createElement("span", null, "Other application content"),
					React.createElement(Wrapped, { name: "test", onError }),
				),
			);
		});

		expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
		expect(container.querySelector("span")?.textContent).toBe(
			"Other application content",
		);
		expect(container.textContent).toContain("Error: normalizer failed");
	});

	it("lets lifecycle observers reject without creating unhandled promises", async () => {
		const instance = createInstanceMock();
		const factory = vi.fn().mockReturnValue(instance);
		const Wrapped = createReactComponent(
			factory as unknown as ForgeFrameComponent,
			{ React },
		);
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const renderedError = new Error("rendered observer failed");
		const closeError = new Error("close observer failed");

		await React.act(async () => {
			root.render(
				React.createElement(Wrapped, {
					onRendered: async () => {
						throw renderedError;
					},
					onClose: async () => {
						throw closeError;
					},
				}),
			);
		});
		await React.act(async () => root.render(null));

		expect(log).toHaveBeenCalledWith(
			'Error in async event handler for "rendered":',
			renderedError,
		);
		expect(log).toHaveBeenCalledWith(
			'Error in async event handler for "close":',
			closeError,
		);
	});

	it("ignores the first mount rejection during StrictMode effect replay", async () => {
		const first = createInstanceMock();
		first.render.mockRejectedValueOnce(new Error("cancelled stale mount"));
		const second = createInstanceMock();
		const factory = vi
			.fn()
			.mockReturnValueOnce(first)
			.mockReturnValueOnce(second);
		const Wrapped = createReactComponent(
			factory as unknown as ForgeFrameComponent,
			{ React },
		);
		const onError = vi.fn();

		await React.act(async () => {
			root.render(
				React.createElement(
					React.StrictMode,
					null,
					React.createElement(Wrapped, { onError }),
				),
			);
		});

		expect(factory).toHaveBeenCalledTimes(2);
		expect(first.close).toHaveBeenCalledOnce();
		expect(second.render).toHaveBeenCalledOnce();
		expect(onError).not.toHaveBeenCalled();
		expect(container.textContent).toBe("");
	});
});
