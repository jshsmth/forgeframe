/**
 * Prop synchronization tests for `createReactComponent` in `@/drivers/react`.
 *
 * Covers render gating, FIFO ordering, omission resets, failure recovery, and retry behavior.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROP_RESET } from "@/core/consumer/props-pipeline";
import { createReactComponent } from "@/drivers/react";
import {
	createDeferredPromise,
	createForgeFrameComponentMock,
	createReactHarness,
	flushMicrotasks,
} from "./react-driver-test-harness";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("createReactComponent prop synchronization", () => {
	it("should skip the initial prop sync and only update when props change", async () => {
		const { React, refs, effects } = createReactHarness();
		const { component, instance } = createForgeFrameComponentMock();
		const onError = vi.fn();

		const ReactComponent = createReactComponent(component as never, {
			React: React as never,
		});

		ReactComponent({ amount: 1, onError });
		refs[0].current = document.createElement("div");
		effects[0]?.(); // onError ref sync
		effects[1]?.(); // mount
		effects[2]?.(); // initial prop sync
		effects[2]?.(); // same props, should no-op
		await flushMicrotasks();

		expect(instance.updateProps).not.toHaveBeenCalled();

		ReactComponent({ amount: 2, onError });
		effects[0]?.(); // onError ref sync
		effects[2]?.(); // changed props
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(1);
		expect(instance.updateProps).toHaveBeenCalledWith({ amount: 2 });
	});

	it("should forward updateProps failures to onError callback", async () => {
		const { React, refs, effects } = createReactHarness();
		const { component, instance } = createForgeFrameComponentMock();
		const onError = vi.fn();
		const updateError = new Error("update failed");
		instance.updateProps.mockRejectedValueOnce(updateError);

		const ReactComponent = createReactComponent(component as never, {
			React: React as never,
		});
		ReactComponent({ amount: 1, onError });
		refs[0].current = document.createElement("div");
		effects[0]?.(); // onError ref sync
		effects[1]?.(); // mount
		await flushMicrotasks();

		ReactComponent({ amount: 2, onError });
		effects[0]?.(); // onError ref sync
		effects[2]?.(); // prop sync with changed value
		await flushMicrotasks();

		expect(onError).toHaveBeenCalledWith(updateError);
	});

	it("should resync the last successful snapshot after a failed update changed local props", async () => {
		const { React, refs, effects } = createReactHarness();
		const { component, instance } = createForgeFrameComponentMock();
		const onError = vi.fn();
		const updateError = new Error("host sync failed");
		let localProps: Record<string, unknown> = { amount: 1 };
		instance.updateProps
			.mockImplementationOnce(async (props) => {
				localProps = { ...props };
				throw updateError;
			})
			.mockImplementationOnce(async (props) => {
				localProps = { ...props };
			});

		const ReactComponent = createReactComponent(component as never, {
			React: React as never,
		});
		ReactComponent({ amount: 1, onError });
		refs[0].current = document.createElement("div");
		effects[0]?.();
		effects[1]?.();
		effects[2]?.();
		await flushMicrotasks();

		ReactComponent({ amount: 2, onError });
		effects[0]?.();
		effects[2]?.();
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(1);
		expect(localProps).toEqual({ amount: 2 });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(updateError);

		ReactComponent({ amount: 1, onError });
		effects[0]?.();
		effects[2]?.();
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(2);
		expect(instance.updateProps).toHaveBeenNthCalledWith(2, { amount: 1 });
		expect(localProps).toEqual({ amount: 1 });

		ReactComponent({ amount: 1, onError });
		effects[0]?.();
		effects[2]?.();
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(2);
	});

	it("should reset component props that are omitted from a later React commit", async () => {
		const { React, refs, effects } = createReactHarness();
		const { component, instance } = createForgeFrameComponentMock();

		const ReactComponent = createReactComponent(component as never, {
			React: React as never,
		});
		ReactComponent({ amount: 1, label: "initial" });
		refs[0].current = document.createElement("div");
		effects[0]?.();
		effects[1]?.();
		effects[2]?.();
		await flushMicrotasks();

		ReactComponent({ amount: 2 });
		effects[0]?.();
		effects[2]?.();
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(1);
		expect(instance.updateProps).toHaveBeenCalledWith({
			amount: 2,
			label: PROP_RESET,
		});
	});

	it("should gate queued prop snapshots behind render and preserve FIFO order", async () => {
		const { React, refs, effects } = createReactHarness();
		const { component, instance } = createForgeFrameComponentMock();
		const deferredRender = createDeferredPromise<void>();
		const deferredFirstUpdate = createDeferredPromise<void>();
		instance.render.mockReturnValueOnce(deferredRender.promise);
		instance.updateProps
			.mockReturnValueOnce(deferredFirstUpdate.promise)
			.mockResolvedValueOnce(undefined);

		const ReactComponent = createReactComponent(component as never, {
			React: React as never,
		});
		ReactComponent({ amount: 1 });
		refs[0].current = document.createElement("div");
		effects[0]?.();
		effects[1]?.();
		effects[2]?.();

		ReactComponent({ amount: 2 });
		effects[0]?.();
		effects[2]?.();
		ReactComponent({ amount: 3 });
		effects[0]?.();
		effects[2]?.();

		expect(instance.updateProps).not.toHaveBeenCalled();

		deferredRender.resolve();
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(1);
		expect(instance.updateProps).toHaveBeenNthCalledWith(1, { amount: 2 });

		deferredFirstUpdate.resolve();
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(2);
		expect(instance.updateProps).toHaveBeenNthCalledWith(2, { amount: 3 });
	});

	it("should continue queued prop updates after reporting one failed update", async () => {
		const { React, refs, effects } = createReactHarness();
		const { component, instance } = createForgeFrameComponentMock();
		const onError = vi.fn();
		const updateError = new Error("first update failed");
		const deferredFirstUpdate = createDeferredPromise<void>();
		instance.updateProps
			.mockReturnValueOnce(deferredFirstUpdate.promise)
			.mockResolvedValueOnce(undefined);

		const ReactComponent = createReactComponent(component as never, {
			React: React as never,
		});
		ReactComponent({ amount: 1, label: "initial", onError });
		refs[0].current = document.createElement("div");
		effects[0]?.();
		effects[1]?.();
		effects[2]?.();
		await flushMicrotasks();

		ReactComponent({ amount: 2, label: "pending", onError });
		effects[0]?.();
		effects[2]?.();
		ReactComponent({ amount: 3, onError });
		effects[0]?.();
		effects[2]?.();

		expect(instance.updateProps).toHaveBeenCalledTimes(1);

		deferredFirstUpdate.reject(updateError);
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(2);
		expect(instance.updateProps).toHaveBeenNthCalledWith(1, {
			amount: 2,
			label: "pending",
		});
		expect(instance.updateProps).toHaveBeenNthCalledWith(2, {
			amount: 3,
			label: PROP_RESET,
		});
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(updateError);

		ReactComponent({ amount: 3, onError });
		effects[0]?.();
		effects[2]?.();
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(2);
	});

	it("should continue queued prop updates when onError throws", async () => {
		const { React, refs, effects } = createReactHarness();
		const { component, instance } = createForgeFrameComponentMock();
		const updateError = new Error("first update failed");
		const observerError = new Error("observer failed");
		const deferredFirstUpdate = createDeferredPromise<void>();
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const onError = vi.fn(() => {
			throw observerError;
		});
		instance.updateProps
			.mockReturnValueOnce(deferredFirstUpdate.promise)
			.mockResolvedValueOnce(undefined);

		const ReactComponent = createReactComponent(component as never, {
			React: React as never,
		});
		ReactComponent({ amount: 1, onError });
		refs[0].current = document.createElement("div");
		effects[0]?.();
		effects[1]?.();
		effects[2]?.();
		await flushMicrotasks();

		ReactComponent({ amount: 2, onError });
		effects[0]?.();
		effects[2]?.();
		ReactComponent({ amount: 3, onError });
		effects[0]?.();
		effects[2]?.();

		deferredFirstUpdate.reject(updateError);
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(2);
		expect(instance.updateProps).toHaveBeenNthCalledWith(1, { amount: 2 });
		expect(instance.updateProps).toHaveBeenNthCalledWith(2, { amount: 3 });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(updateError);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"Error in React onError callback:",
			observerError,
		);
	});

	it("should retain an identical commit while its prop update is in flight", async () => {
		const { React, refs, effects } = createReactHarness();
		const { component, instance } = createForgeFrameComponentMock();
		const onError = vi.fn();
		const updateError = new Error("first update failed");
		const deferredFirstUpdate = createDeferredPromise<void>();
		instance.updateProps
			.mockReturnValueOnce(deferredFirstUpdate.promise)
			.mockResolvedValueOnce(undefined);

		const ReactComponent = createReactComponent(component as never, {
			React: React as never,
		});
		ReactComponent({ amount: 1, onError });
		refs[0].current = document.createElement("div");
		effects[0]?.();
		effects[1]?.();
		effects[2]?.();
		await flushMicrotasks();

		ReactComponent({ amount: 2, onError });
		effects[0]?.();
		effects[2]?.();
		ReactComponent({ amount: 2, onError });
		effects[0]?.();
		effects[2]?.();

		expect(instance.updateProps).toHaveBeenCalledTimes(1);

		deferredFirstUpdate.reject(updateError);
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(2);
		expect(instance.updateProps).toHaveBeenNthCalledWith(1, { amount: 2 });
		expect(instance.updateProps).toHaveBeenNthCalledWith(2, { amount: 2 });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(updateError);

		ReactComponent({ amount: 2, onError });
		effects[0]?.();
		effects[2]?.();
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(2);
	});

	it("should retain an identical commit while its prop update is queued", async () => {
		const { React, refs, effects } = createReactHarness();
		const { component, instance } = createForgeFrameComponentMock();
		const onError = vi.fn();
		const queuedUpdateError = new Error("queued update failed");
		const deferredFirstUpdate = createDeferredPromise<void>();
		instance.updateProps
			.mockReturnValueOnce(deferredFirstUpdate.promise)
			.mockRejectedValueOnce(queuedUpdateError)
			.mockResolvedValueOnce(undefined);

		const ReactComponent = createReactComponent(component as never, {
			React: React as never,
		});
		ReactComponent({ amount: 1, onError });
		refs[0].current = document.createElement("div");
		effects[0]?.();
		effects[1]?.();
		effects[2]?.();
		await flushMicrotasks();

		ReactComponent({ amount: 2, onError });
		effects[0]?.();
		effects[2]?.();
		ReactComponent({ amount: 3, onError });
		effects[0]?.();
		effects[2]?.();
		ReactComponent({ amount: 3, onError });
		effects[0]?.();
		effects[2]?.();

		expect(instance.updateProps).toHaveBeenCalledTimes(1);
		expect(instance.updateProps).toHaveBeenNthCalledWith(1, { amount: 2 });

		deferredFirstUpdate.resolve();
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(3);
		expect(instance.updateProps).toHaveBeenNthCalledWith(2, { amount: 3 });
		expect(instance.updateProps).toHaveBeenNthCalledWith(3, { amount: 3 });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(queuedUpdateError);

		ReactComponent({ amount: 3, onError });
		effects[0]?.();
		effects[2]?.();
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(3);
	});

	it("should retry an identical React prop snapshot after its prior update fails", async () => {
		const { React, refs, effects } = createReactHarness();
		const { component, instance } = createForgeFrameComponentMock();
		const onError = vi.fn();
		const updateError = new Error("retry update");
		instance.updateProps
			.mockRejectedValueOnce(updateError)
			.mockResolvedValueOnce(undefined);

		const ReactComponent = createReactComponent(component as never, {
			React: React as never,
		});
		ReactComponent({ amount: 1, onError });
		refs[0].current = document.createElement("div");
		effects[0]?.();
		effects[1]?.();
		effects[2]?.();
		await flushMicrotasks();

		ReactComponent({ amount: 2, onError });
		effects[0]?.();
		effects[2]?.();
		await flushMicrotasks();

		ReactComponent({ amount: 2, onError });
		effects[0]?.();
		effects[2]?.();
		await flushMicrotasks();

		expect(instance.updateProps).toHaveBeenCalledTimes(2);
		expect(instance.updateProps).toHaveBeenNthCalledWith(1, { amount: 2 });
		expect(instance.updateProps).toHaveBeenNthCalledWith(2, { amount: 2 });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(updateError);
	});
});
