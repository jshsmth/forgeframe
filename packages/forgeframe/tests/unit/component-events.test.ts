/**
 * Unit tests for the public `instance.event` subscriber.
 *
 * Covers registration and dispatch rules through public calls: ordering,
 * duplicate and stale registrations, removal and additions during dispatch,
 * rearmed `once` handlers, error isolation, the frozen facade, and errors for
 * unknown and removed event names.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearComponents, create } from "@/core/component";
import { ForgeFrameError } from "@/errors";
import type { Dimensions } from "@/types";

const SIZE: Dimensions = { width: 10, height: 20 };

let tagCount = 0;

function createInstance() {
	tagCount += 1;
	const Component = create({
		tag: `component-events-${tagCount}`,
		url: "https://host.example.com/component",
	});
	return Component();
}

/** Emits one `resize` event through the public API; nothing is mounted to resize. */
function emitResize(instance: ReturnType<typeof createInstance>): void {
	void instance.resize(SIZE);
}

afterEach(() => {
	clearComponents();
	vi.restoreAllMocks();
});

describe("instance.event", () => {
	it("calls handlers in registration order with the typed payload", () => {
		const instance = createInstance();
		const calls: string[] = [];
		instance.event.on("resize", (dimensions) => {
			calls.push(`first:${dimensions.width}`);
		});
		instance.event.on("resize", (dimensions) => {
			calls.push(`second:${dimensions.height}`);
		});

		emitResize(instance);

		expect(calls).toEqual(["first:10", "second:20"]);
	});

	it("keeps one registration per handler, at its first position", () => {
		const instance = createInstance();
		const calls: string[] = [];
		const repeated = () => {
			calls.push("repeated");
		};
		instance.event.on("resize", repeated);
		instance.event.on("resize", () => {
			calls.push("other");
		});
		instance.event.on("resize", repeated);

		emitResize(instance);

		expect(calls).toEqual(["repeated", "other"]);
	});

	it("removes a registration through its unsubscribe function", () => {
		const instance = createInstance();
		const handler = vi.fn();
		const unsubscribe = instance.event.on("resize", handler);

		unsubscribe();
		emitResize(instance);

		expect(handler).not.toHaveBeenCalled();
	});

	it("runs a once() handler for one emission and cancels it through its unsubscribe function", () => {
		const instance = createInstance();
		const fired = vi.fn();
		const cancelled = vi.fn();
		instance.event.once("resize", fired);
		instance.event.once("resize", cancelled)();

		emitResize(instance);
		emitResize(instance);

		expect(fired).toHaveBeenCalledExactlyOnceWith(SIZE);
		expect(cancelled).not.toHaveBeenCalled();
	});

	it("lets a once() handler rearm itself for the next emission", () => {
		const instance = createInstance();
		let calls = 0;
		const rearm = () => {
			calls += 1;
			instance.event.once("resize", rearm);
		};
		instance.event.once("resize", rearm);

		emitResize(instance);
		expect(calls).toBe(1);
		emitResize(instance);
		expect(calls).toBe(2);
	});

	it.each(["on", "once"] as const)(
		"keeps a newer registration when a stale %s() unsubscribe runs",
		(method) => {
			const instance = createInstance();
			const handler = vi.fn();

			const stale = instance.event[method]("resize", handler);
			if (method === "on") stale();
			else emitResize(instance);
			instance.event.on("resize", handler);
			stale();
			emitResize(instance);

			expect(handler).toHaveBeenCalledTimes(method === "on" ? 1 : 2);
		},
	);

	it("skips handlers removed during dispatch and defers handlers added during it", () => {
		const instance = createInstance();
		const added = vi.fn();
		const removed = vi.fn();
		let unsubscribeRemoved = () => {};
		instance.event.on("resize", () => {
			unsubscribeRemoved();
			instance.event.on("resize", added);
		});
		unsubscribeRemoved = instance.event.on("resize", removed);

		emitResize(instance);
		expect(removed).not.toHaveBeenCalled();
		expect(added).not.toHaveBeenCalled();

		emitResize(instance);
		expect(added).toHaveBeenCalledOnce();
	});

	it("defers a handler removed and registered again during dispatch", () => {
		const instance = createInstance();
		const handler = vi.fn();
		let unsubscribe = () => {};
		instance.event.once("resize", () => {
			unsubscribe();
			unsubscribe = instance.event.on("resize", handler);
		});
		instance.event.on("resize", () => {});
		unsubscribe = instance.event.on("resize", handler);

		emitResize(instance);
		expect(handler).not.toHaveBeenCalled();
		emitResize(instance);
		expect(handler).toHaveBeenCalledOnce();
	});

	it("logs thrown errors and rejected promises without skipping later handlers", async () => {
		const instance = createInstance();
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const later = vi.fn();
		instance.event.on("resize", () => {
			throw new Error("sync failure");
		});
		instance.event.on("resize", async () => {
			throw new Error("async failure");
		});
		instance.event.on("resize", later);

		emitResize(instance);
		await Promise.resolve();

		expect(later).toHaveBeenCalledOnce();
		expect(consoleSpy).toHaveBeenCalledWith(
			'Error in event handler for "resize":',
			expect.objectContaining({ message: "sync failure" }),
		);
		expect(consoleSpy).toHaveBeenCalledWith(
			'Error in async event handler for "resize":',
			expect.objectContaining({ message: "async failure" }),
		);
	});

	it("exposes only on() and once() on a frozen object", () => {
		const instance = createInstance();

		expect(Object.keys(instance.event).sort()).toEqual(["on", "once"]);
		expect(Object.isFrozen(instance.event)).toBe(true);
		expect(
			Reflect.set(instance.event, "emit", () => {}) && "emit" in instance.event,
		).toBe(false);
	});

	it.each([
		["prerender", "render"],
		["prerendered", "render"],
		["display", "rendered"],
		["destroy", "closed"],
	])(
		"names the replacement when subscribing to the removed %s event",
		(removed, replacement) => {
			const instance = createInstance();

			for (const method of ["on", "once"] as const) {
				expect(() =>
					instance.event[method](
						// @ts-expect-error JavaScript callers can still pass removed names.
						removed,
						() => {},
					),
				).toThrow(
					new ForgeFrameError(
						"VALIDATION",
						`The "${removed}" event was removed in ForgeFrame 2; subscribe to "${replacement}" instead`,
					),
				);
			}
		},
	);

	it("rejects unknown event names and handlers that are not functions", () => {
		const instance = createInstance();

		expect(() =>
			// @ts-expect-error JavaScript callers can pass any name.
			instance.event.on("toString", () => {}),
		).toThrow(
			'Unknown component event "toString". Supported events: render, rendered, error, close, closed, props, resize, focus, exports',
		);
		expect(() =>
			// @ts-expect-error JavaScript callers can pass any handler.
			instance.event.once("resize", "not a function"),
		).toThrow(
			new ForgeFrameError(
				"VALIDATION",
				'The "resize" event handler must be a function',
			),
		);
	});

	it("emits focus only when a frame is mounted or a popup is open", async () => {
		const instance = createInstance();
		const focus = vi.fn();
		instance.event.on("focus", focus);

		await instance.focus();

		expect(focus).not.toHaveBeenCalled();
	});

	it("accepts subscriptions after closed and never calls them", async () => {
		const instance = createInstance();
		const closed = vi.fn();
		instance.event.on("closed", closed);

		await instance.close();
		const late = vi.fn();
		instance.event.on("resize", late);
		emitResize(instance);

		expect(closed).toHaveBeenCalledOnce();
		expect(late).not.toHaveBeenCalled();
	});
});
