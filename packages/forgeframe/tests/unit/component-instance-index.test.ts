/**
 * Unit tests for the internal component instance index in `@/core/component-instance-index`.
 *
 * Covers UID reindexing, per-tag lookups, tag clearing, and defensive teardown
 * behavior when internal maps become inconsistent.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearIndexedInstances,
	clearIndexedInstancesByTag,
	getComponentInstancesByTag,
	getIndexedComponentInstances,
	indexComponentInstance,
	removeIndexedComponentInstance,
} from "@/core/component-instance-index";
import type { ForgeFrameComponentInstance } from "@/types";

type TestInstance = ForgeFrameComponentInstance<
	Record<string, unknown>,
	unknown
>;

function createInstance(uid: string): TestInstance {
	const instance = {
		uid,
		render: vi.fn(async () => {}),
		renderTo: vi.fn(async () => {}),
		close: vi.fn(async () => {}),
		focus: vi.fn(async () => {}),
		resize: vi.fn(async () => {}),
		show: vi.fn(async () => {}),
		hide: vi.fn(async () => {}),
		updateProps: vi.fn(async () => {}),
		clone: vi.fn(),
		isEligible: vi.fn(() => true),
		event: {} as TestInstance["event"],
		state: {},
	} as TestInstance;

	instance.clone = vi.fn(() => instance);
	return instance;
}

afterEach(() => {
	vi.restoreAllMocks();
	clearIndexedInstances();
});

describe("component-instance-index", () => {
	it("should index instances by tag and expose the global snapshot", () => {
		const alpha = createInstance("alpha");
		const beta = createInstance("beta");

		indexComponentInstance("payments-widget", alpha);
		indexComponentInstance("payments-widget", beta);

		expect(getComponentInstancesByTag("payments-widget")).toEqual([
			alpha,
			beta,
		]);
		expect(getIndexedComponentInstances()).toEqual([
			{ tag: "payments-widget", instance: alpha },
			{ tag: "payments-widget", instance: beta },
		]);
	});

	it("should reindex an existing uid under a new tag and remove the stale tag entry", () => {
		const original = createInstance("shared-uid");
		const replacement = createInstance("shared-uid");

		indexComponentInstance("old-tag", original);
		indexComponentInstance("new-tag", replacement);

		expect(getComponentInstancesByTag("old-tag")).toEqual([]);
		expect(getComponentInstancesByTag("new-tag")).toEqual([replacement]);
		expect(getIndexedComponentInstances()).toEqual([
			{ tag: "new-tag", instance: replacement },
		]);
	});

	it("should remove a single uid without disturbing sibling instances for the same tag", () => {
		const first = createInstance("first");
		const second = createInstance("second");

		indexComponentInstance("shared-tag", first);
		indexComponentInstance("shared-tag", second);
		removeIndexedComponentInstance("first");

		expect(getComponentInstancesByTag("shared-tag")).toEqual([second]);
		expect(getIndexedComponentInstances()).toEqual([
			{ tag: "shared-tag", instance: second },
		]);
	});

	it("should return an empty array for unknown tags and ignore missing uids", () => {
		removeIndexedComponentInstance("missing-uid");

		expect(getComponentInstancesByTag("missing-tag")).toEqual([]);
		expect(getIndexedComponentInstances()).toEqual([]);
	});

	it("should clear one tag without disturbing instances indexed under other tags", () => {
		const alpha = createInstance("alpha");
		const beta = createInstance("beta");
		const gamma = createInstance("gamma");

		indexComponentInstance("tag-a", alpha);
		indexComponentInstance("tag-a", beta);
		indexComponentInstance("tag-b", gamma);

		clearIndexedInstancesByTag("tag-a");

		expect(getComponentInstancesByTag("tag-a")).toEqual([]);
		expect(getComponentInstancesByTag("tag-b")).toEqual([gamma]);
		expect(getIndexedComponentInstances()).toEqual([
			{ tag: "tag-b", instance: gamma },
		]);
	});

	it("should tolerate missing tag buckets during removal and still clear the uid index", () => {
		const orphaned = createInstance("orphaned");
		indexComponentInstance("orphan-tag", orphaned);

		const originalGet = Map.prototype.get;
		let getCalls = 0;
		vi.spyOn(Map.prototype, "get").mockImplementation(function (
			this: Map<unknown, unknown>,
			key: unknown,
		) {
			getCalls += 1;
			if (getCalls === 2 && key === "orphan-tag") {
				return undefined;
			}
			return originalGet.call(this, key);
		});

		removeIndexedComponentInstance("orphaned");

		expect(getIndexedComponentInstances()).toEqual([]);
	});

	it("should clear all indexed instances across tags", () => {
		indexComponentInstance("tag-a", createInstance("alpha"));
		indexComponentInstance("tag-b", createInstance("beta"));

		clearIndexedInstances();

		expect(getComponentInstancesByTag("tag-a")).toEqual([]);
		expect(getComponentInstancesByTag("tag-b")).toEqual([]);
		expect(getIndexedComponentInstances()).toEqual([]);
	});
});
