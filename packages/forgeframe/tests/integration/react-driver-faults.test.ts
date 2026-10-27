/**
 * Fault injection for `forgeframe/react` with real React DOM.
 *
 * A registered stand-in component returns instances whose `render()` and
 * `updateProps()` settle when each test says, so stale completions, failed
 * updates and remounts can be ordered exactly. Covers stale render and update
 * results after a `context` remount, prop sync stopping after a failed render,
 * updates committed during `render()`, a throwing `instanceRef` callback,
 * failed-update resync and single retries, an `onError` that throws, and a
 * reserved wrapper name declared as `undefined`.
 */

import { createReactComponent } from "forgeframe/react";
import * as React from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	deleteRegisteredComponent,
	registerComponent,
} from "@/core/component-registry";
import type {
	AnyComponent,
	ComponentEvents,
	ComponentInstance,
	ComponentOptions,
	EventHandler,
} from "@/types";
import { createDeferred } from "@/utils/promise";

type Events = ComponentEvents;
type Listeners = { [K in keyof Events]: Set<EventHandler<Events[K]>> };

/** A stand-in instance with the members the wrapper uses. */
function createFakeInstance(uid: string) {
	const listeners: Listeners = {
		render: new Set(),
		rendered: new Set(),
		close: new Set(),
		closed: new Set(),
		error: new Set(),
		props: new Set(),
		resize: new Set(),
		focus: new Set(),
		exports: new Set(),
	};
	const subscribe = <K extends keyof Events>(
		name: K,
		listener: EventHandler<Events[K]>,
	) => {
		const set = listeners[name];
		set.add(listener);
		return () => {
			set.delete(listener);
		};
	};
	const emit = <K extends keyof Events>(name: K, payload: Events[K]) => {
		for (const listener of [...listeners[name]]) listener(payload);
	};
	const render = createDeferred<void>();
	return {
		uid,
		exports: undefined,
		render: vi.fn(
			(_container: HTMLElement, _context?: string) => render.promise,
		),
		renderTask: render,
		updateProps: vi
			.fn<(props: Record<string, unknown>) => Promise<void>>()
			.mockResolvedValue(undefined),
		close: vi.fn(async () => emit("close", undefined)),
		focus: vi.fn(),
		resize: vi.fn(),
		show: vi.fn(),
		hide: vi.fn(),
		event: {
			on: subscribe,
			once: <K extends keyof Events>(
				name: K,
				listener: EventHandler<Events[K]>,
			) => {
				const unsubscribe = subscribe(name, (payload) => {
					unsubscribe();
					return listener(payload);
				});
				return unsubscribe;
			},
		},
		emit,
	} satisfies ComponentInstance & Record<string, unknown>;
}

type FakeInstance = ReturnType<typeof createFakeInstance>;

describe("React driver fault injection", () => {
	let container: HTMLDivElement;
	let root: Root;
	let instances: FakeInstance[];
	let Wrapped: React.ComponentType<Record<string, unknown>>;
	const tag = "react-fault-injection";

	beforeEach(() => {
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		instances = [];
		const factory: AnyComponent = Object.assign(
			vi.fn(() => {
				const instance = createFakeInstance(`fake-${instances.length + 1}`);
				instances.push(instance);
				return instance;
			}),
			{ instances: [] },
		);
		registerComponent(factory, { tag, url: "https://host.example.com" });
		Wrapped = createReactComponent(factory);
	});

	afterEach(async () => {
		await React.act(async () => root.unmount());
		container.remove();
		deleteRegisteredComponent(tag);
		vi.unstubAllGlobals();
	});

	async function commit(props: Record<string, unknown>): Promise<void> {
		await React.act(async () => {
			root.render(React.createElement(Wrapped, props));
		});
	}

	async function settle(run: () => void): Promise<void> {
		await React.act(async () => {
			run();
			await Promise.resolve();
		});
	}

	function instance(index: number): FakeInstance {
		const found = instances[index];
		if (!found) throw new Error(`Expected instance ${index}`);
		return found;
	}

	it("ignores a stale render rejection after a context remount", async () => {
		const onError = vi.fn();
		await commit({ amount: 1, context: "popup", onError });
		await commit({ amount: 1, context: "iframe", onError });
		expect(instance(0).close).toHaveBeenCalledOnce();
		expect(instance(1).render).toHaveBeenCalledWith(
			container.firstElementChild,
			"iframe",
		);

		await settle(() =>
			instance(0).renderTask.reject(new Error("stale render")),
		);

		expect(onError).not.toHaveBeenCalled();
		expect(container.textContent).toBe("");
	});

	it("ignores a render that resolves after unmount", async () => {
		const onRendered = vi.fn();
		const onError = vi.fn();
		const instanceRef = vi.fn();
		await commit({ amount: 1, onRendered, onError, instanceRef });
		await React.act(async () => root.unmount());
		// afterEach unmounts again, so it gets a fresh root.
		root = createRoot(container);
		expect(instance(0).close).toHaveBeenCalledOnce();

		await settle(() => instance(0).renderTask.resolve());

		expect(onRendered).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		expect(instanceRef).not.toHaveBeenCalledWith(
			expect.objectContaining({ uid: "fake-1" }),
		);
	});

	it("ignores a stale render success after a context remount", async () => {
		const onRendered = vi.fn();
		const instanceRef = vi.fn();
		await commit({ amount: 1, context: "popup", onRendered, instanceRef });
		await commit({ amount: 1, context: "iframe", onRendered, instanceRef });

		await settle(() => instance(0).renderTask.resolve());

		expect(onRendered).not.toHaveBeenCalled();
		expect(instanceRef).not.toHaveBeenCalledWith(
			expect.objectContaining({ uid: "fake-1" }),
		);

		await settle(() => instance(1).renderTask.resolve());

		expect(onRendered).toHaveBeenCalledOnce();
		expect(instanceRef).toHaveBeenLastCalledWith(
			expect.objectContaining({ uid: "fake-2" }),
		);
	});

	it("ignores a stale update result after a context remount and starts the new instance's queue fresh", async () => {
		const onError = vi.fn();
		await commit({ amount: 1, context: "iframe", onError });
		await settle(() => instance(0).renderTask.resolve());
		const staleUpdate = createDeferred<void>();
		instance(0).updateProps.mockReturnValueOnce(staleUpdate.promise);
		await commit({ amount: 2, context: "iframe", onError });
		expect(instance(0).updateProps).toHaveBeenCalledWith({ amount: 2 });

		await commit({ amount: 2, context: "popup", onError });
		await settle(() => staleUpdate.reject(new Error("stale update")));
		await settle(() => instance(1).renderTask.resolve());

		expect(onError).not.toHaveBeenCalled();
		expect(instance(1).updateProps).not.toHaveBeenCalled();
		await commit({ amount: 3, context: "popup", onError });
		expect(instance(1).updateProps).toHaveBeenCalledExactlyOnceWith({
			amount: 3,
		});
	});

	it("does not let a stale update success advance the remounted instance's queue", async () => {
		await commit({ amount: 1, context: "iframe" });
		await settle(() => instance(0).renderTask.resolve());
		const staleUpdate = createDeferred<void>();
		instance(0).updateProps.mockReturnValueOnce(staleUpdate.promise);
		await commit({ amount: 2, context: "iframe" });

		await commit({ amount: 2, context: "popup" });
		await settle(() => staleUpdate.resolve());
		await settle(() => instance(1).renderTask.resolve());

		// The new instance's snapshot is its own initial props, so the same
		// props send nothing and a change sends only that change.
		await commit({ amount: 2, context: "popup" });
		expect(instance(1).updateProps).not.toHaveBeenCalled();
		await commit({ amount: 1, context: "popup" });
		expect(instance(1).updateProps).toHaveBeenCalledExactlyOnceWith({
			amount: 1,
		});
	});

	it("sends a commit made during render to the instance, which holds it until the render settles", async () => {
		await commit({ amount: 1 });
		await commit({ amount: 2 });

		expect(instance(0).updateProps).toHaveBeenCalledExactlyOnceWith({
			amount: 2,
		});
	});

	it("stops prop sync after a failed render and shows the error", async () => {
		const onError = vi.fn();
		const failure = new Error("render failed");
		await commit({ amount: 1, onError });
		await settle(() => instance(0).renderTask.reject(failure));

		expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
		expect(container.textContent).toBe("Error: render failed");
		await commit({ amount: 2, onError });
		expect(instance(0).updateProps).not.toHaveBeenCalled();
	});

	it("treats a reserved name declared as undefined as omitted, as create() does", () => {
		const reservedTag = "react-fault-reserved-undefined";
		const factory: AnyComponent = Object.assign(vi.fn(), { instances: [] });
		const options: ComponentOptions = {
			tag: reservedTag,
			url: "https://host.example.com",
			// @ts-expect-error JavaScript callers can leave a definition undefined.
			props: { onClose: undefined },
		};
		registerComponent(factory, options);
		try {
			expect(() => createReactComponent(factory)).not.toThrow();
		} finally {
			deleteRegisteredComponent(reservedTag);
		}
	});

	it("logs a throwing instanceRef callback and still calls onRendered and onClose", async () => {
		const refError = new Error("ref failed");
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const instanceRef = vi.fn(() => {
			throw refError;
		});
		const onRendered = vi.fn();
		const onClose = vi.fn();
		await commit({ amount: 1, instanceRef, onRendered, onClose });

		await settle(() => instance(0).renderTask.resolve());
		expect(instanceRef).toHaveBeenLastCalledWith(
			expect.objectContaining({ uid: "fake-1" }),
		);
		expect(onRendered).toHaveBeenCalledOnce();

		await settle(() => instance(0).emit("close", undefined));
		expect(instanceRef).toHaveBeenLastCalledWith(null);
		expect(onClose).toHaveBeenCalledOnce();
		expect(log.mock.calls).toEqual([
			["Error in React instanceRef callback:", refError],
			["Error in React instanceRef callback:", refError],
		]);
	});

	describe("prop synchronization", () => {
		beforeEach(async () => {
			await commit({ amount: 1 });
			await settle(() => instance(0).renderTask.resolve());
		});

		it("resyncs the last acknowledged snapshot after a failed update", async () => {
			const onError = vi.fn();
			const updateError = new Error("host sync failed");
			instance(0).updateProps.mockRejectedValueOnce(updateError);

			await commit({ amount: 2, onError });
			expect(onError).toHaveBeenCalledExactlyOnceWith(updateError);

			await commit({ amount: 1, onError });
			expect(instance(0).updateProps).toHaveBeenNthCalledWith(2, {
				amount: 1,
			});
			await commit({ amount: 1, onError });
			expect(instance(0).updateProps).toHaveBeenCalledTimes(2);
		});

		it("continues queued updates when onError throws", async () => {
			const updateError = new Error("first update failed");
			const observerError = new Error("observer failed");
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			const onError = vi.fn(() => {
				throw observerError;
			});
			const firstUpdate = createDeferred<void>();
			instance(0).updateProps.mockReturnValueOnce(firstUpdate.promise);

			await commit({ amount: 2, onError });
			await commit({ amount: 3, onError });
			await settle(() => firstUpdate.reject(updateError));

			expect(instance(0).updateProps.mock.calls).toEqual([
				[{ amount: 2 }],
				[{ amount: 3 }],
			]);
			expect(onError).toHaveBeenCalledExactlyOnceWith(updateError);
			expect(log).toHaveBeenCalledWith(
				"Error in React onError callback:",
				observerError,
			);
		});

		it("retries an identical commit made while its update is in flight, once", async () => {
			const onError = vi.fn();
			const updateError = new Error("first update failed");
			const firstUpdate = createDeferred<void>();
			instance(0).updateProps.mockReturnValueOnce(firstUpdate.promise);

			await commit({ amount: 2, onError });
			await commit({ amount: 2, onError, className: "same-props" });
			expect(instance(0).updateProps).toHaveBeenCalledOnce();

			await settle(() => firstUpdate.reject(updateError));
			expect(instance(0).updateProps.mock.calls).toEqual([
				[{ amount: 2 }],
				[{ amount: 2 }],
			]);
			expect(onError).toHaveBeenCalledExactlyOnceWith(updateError);
			await commit({ amount: 2, onError });
			expect(instance(0).updateProps).toHaveBeenCalledTimes(2);
		});

		it("retries an identical commit made while its update is queued, once", async () => {
			const onError = vi.fn();
			const queuedError = new Error("queued update failed");
			const firstUpdate = createDeferred<void>();
			instance(0)
				.updateProps.mockReturnValueOnce(firstUpdate.promise)
				.mockRejectedValueOnce(queuedError);

			await commit({ amount: 2, onError });
			await commit({ amount: 3, onError });
			await commit({ amount: 3, onError, className: "same-props" });
			expect(instance(0).updateProps).toHaveBeenCalledOnce();

			await settle(() => firstUpdate.resolve());
			expect(instance(0).updateProps.mock.calls).toEqual([
				[{ amount: 2 }],
				[{ amount: 3 }],
				[{ amount: 3 }],
			]);
			expect(onError).toHaveBeenCalledExactlyOnceWith(queuedError);
			await commit({ amount: 3, onError });
			expect(instance(0).updateProps).toHaveBeenCalledTimes(3);
		});

		it("retries an identical snapshot after its earlier update failed", async () => {
			const onError = vi.fn();
			const updateError = new Error("retry update");
			instance(0).updateProps.mockRejectedValueOnce(updateError);

			await commit({ amount: 2, onError });
			await commit({ amount: 2, onError, className: "same-props" });

			expect(instance(0).updateProps.mock.calls).toEqual([
				[{ amount: 2 }],
				[{ amount: 2 }],
			]);
			expect(onError).toHaveBeenCalledExactlyOnceWith(updateError);
		});
	});
});
