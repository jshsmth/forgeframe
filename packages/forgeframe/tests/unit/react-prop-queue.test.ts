import { describe, expect, it } from "vitest";
import { PROP_RESET } from "@/core/consumer/prop-update";
import {
	acknowledgePropUpdate,
	buildPropUpdate,
	enqueuePropSnapshot,
	failPropUpdate,
	type ReactPropQueue,
} from "@/drivers/react/prop-sync";

describe("React prop commit and retry policy", () => {
	it("remembers omitted keys across commits while preserving explicit undefined", () => {
		const known = new Set(["previous"]);
		const desired = { cleared: undefined, count: 0 };
		expect(buildPropUpdate(desired, known).payload).toEqual({
			...desired,
			previous: PROP_RESET,
		});
		expect(buildPropUpdate({ count: 1 }, known).payload).toEqual({
			count: 1,
			previous: PROP_RESET,
			cleared: PROP_RESET,
		});
		expect(desired).toEqual({ cleared: undefined, count: 0 });
	});
	it("requests one retry for an equivalent pending commit, then advances FIFO after acknowledgement", () => {
		const queue: ReactPropQueue = {
			comparableProps: { count: 0 },
			knownKeys: new Set(["count"]),
			queue: [],
		};
		expect(enqueuePropSnapshot(queue, { count: 1 })).toBe(true);
		expect(enqueuePropSnapshot(queue, { count: 1 })).toBe(false);
		const first = queue.queue[0];
		failPropUpdate(queue, first);
		expect(queue.comparableProps).toBeNull();
		expect(queue.queue[0].retryOnFailure).toBe(false);
		enqueuePropSnapshot(queue, { count: 2 });
		acknowledgePropUpdate(queue, queue.queue[0]);
		expect(queue.comparableProps).toEqual({ count: 1 });
		expect(queue.queue.map((update) => update.desired)).toEqual([{ count: 2 }]);
		failPropUpdate(queue, queue.queue[0]);
		expect(queue.queue).toEqual([]);
		expect(enqueuePropSnapshot(queue, { count: 2 })).toBe(true);
	});
});
