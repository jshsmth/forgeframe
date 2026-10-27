import { describe, expect, it } from "vitest";
import {
	acknowledgePropUpdate,
	buildPropUpdate,
	enqueuePropSnapshot,
	failPropUpdate,
	type ReactPropQueue,
	shallowEqualProps,
	snapshotProps,
} from "@/drivers/react/prop-sync";
import { requireValue } from "../require-value";

describe("React prop commit and retry policy", () => {
	it("sends undefined for known keys a commit leaves out or sets to undefined", () => {
		const known = new Set(["previous"]);
		const desired = snapshotProps({ cleared: "set", count: 0 });
		expect(buildPropUpdate(desired, known).payload).toEqual({
			cleared: "set",
			count: 0,
			previous: undefined,
		});
		const next = snapshotProps({ cleared: undefined, count: 1 });
		const update = buildPropUpdate(next, known);
		expect(update.payload).toEqual({
			count: 1,
			previous: undefined,
			cleared: undefined,
		});
		expect(Object.hasOwn(update.payload, "cleared")).toBe(true);
		expect(next).toEqual({ count: 1 });
		expect(desired).toEqual({ cleared: "set", count: 0 });
	});
	it("treats snapshots that differ only in undefined-valued keys as the same commit", () => {
		const queue: ReactPropQueue = {
			comparableProps: snapshotProps({ count: 0 }),
			knownKeys: new Set(["count"]),
			queue: [],
		};
		expect(
			enqueuePropSnapshot(queue, snapshotProps({ count: 0, theme: undefined })),
		).toBe(false);
		expect(queue.queue).toEqual([]);
		expect(queue.knownKeys).toEqual(new Set(["count"]));
	});
	it("requests one retry for an equivalent pending commit, then advances FIFO after acknowledgement", () => {
		const queue: ReactPropQueue = {
			comparableProps: { count: 0 },
			knownKeys: new Set(["count"]),
			queue: [],
		};
		expect(enqueuePropSnapshot(queue, { count: 1 })).toBe(true);
		expect(enqueuePropSnapshot(queue, { count: 1 })).toBe(false);
		const first = requireValue(queue.queue[0]);
		failPropUpdate(queue, first);
		expect(queue.comparableProps).toBeNull();
		expect(queue.queue[0]?.retryOnFailure).toBe(false);
		enqueuePropSnapshot(queue, { count: 2 });
		acknowledgePropUpdate(queue, requireValue(queue.queue[0]));
		expect(queue.comparableProps).toEqual({ count: 1 });
		expect(queue.queue.map((update) => update.desired)).toEqual([{ count: 2 }]);
		failPropUpdate(queue, requireValue(queue.queue[0]));
		expect(queue.queue).toEqual([]);
		expect(enqueuePropSnapshot(queue, { count: 2 })).toBe(true);
	});
});

describe("shallowEqualProps", () => {
	it.each([
		[{ a: 1 }, { a: 1 }, true],
		[{ a: 1 }, { a: 2 }, false],
		[{ a: 1 }, { a: 1, b: 2 }, false],
		// Same number of keys, different names, equal (undefined) values.
		[{ a: undefined }, { b: undefined }, false],
	])("compares %j with %j: %s", (previous, next, equal) => {
		expect(shallowEqualProps(previous, next)).toBe(equal);
	});
});
