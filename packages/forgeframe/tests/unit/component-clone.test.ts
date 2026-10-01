/**
 * Clone regressions for component snapshots and lifecycle tracking.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	clearComponents,
	create,
	destroyAll,
	destroyByTag,
} from "@/core/component";
import { ConsumerComponent } from "@/core/consumer";
import { getSiblingInstances } from "@/core/consumer/siblings";
import { prop } from "@/props/prop";
import { CleanupManager } from "@/utils/cleanup";

type CloneInternals = {
	options: {
		tag: string;
	};
	propsPipeline: {
		props: { token?: string; amount?: number; target?: number };
		inputProps: {
			token?: string;
			amount?: string;
			target?: { value: string | number };
		};
	};
	resolveUrl: () => string;
};

function getCloneInternals(instance: unknown): CloneInternals {
	return instance as CloneInternals;
}

describe("Component clone", () => {
	afterEach(async () => {
		await destroyAll();
		clearComponents();
	});
	it("delivers rearmed once listeners on the next resize", async () => {
		const Component = create({
			tag: "rearmed-resize",
			url: "https://example.com",
		});
		const instance = Component();
		const persistent = vi.fn();
		instance.event.on("resize", persistent);
		const sizes: unknown[] = [];
		const rearm = (dimensions: unknown) => {
			sizes.push(dimensions);
			// Bound a broken live-Set traversal so the regression fails without hanging.
			if (sizes.length < 3) instance.event.once("resize", rearm);
		};
		instance.event.once("resize", rearm);

		await instance.resize({ width: 401 });
		expect(sizes).toEqual([{ width: 401 }]);
		await instance.resize({ width: 402 });
		expect(sizes).toEqual([{ width: 401 }, { width: 402 }]);
		expect(persistent).toHaveBeenCalledTimes(2);
	});

	it.each(["direct", "reentrant"])(
		"waits for destruction when close is requested again (%s)",
		async (mode) => {
			const Component = create({
				tag: "concurrent-close",
				url: "https://example.com",
			});
			const instance = Component();
			const destroyed = vi.fn();
			instance.event.on("destroy", destroyed);
			let reentrant: Promise<void> | undefined;
			if (mode === "reentrant")
				instance.event.on("close", () => {
					reentrant = instance.close();
				});
			const first = instance.close();
			try {
				await (mode === "direct" ? instance.close() : reentrant);
				expect(Component.instances).toHaveLength(0);
				expect(destroyed).toHaveBeenCalledTimes(1);
			} finally {
				await first;
			}
		},
	);

	it("waits for already-started render-failure destruction before close resolves", async () => {
		const failure = new Error("Expected template failure");
		const Component = create({
			tag: "close-during-failed-render",
			url: "https://example.com",
			prerenderTemplate: () => {
				throw failure;
			},
		});
		const instance = Component();
		const mount = document.createElement("div");
		document.body.appendChild(mount);
		const destroyed = vi.fn();
		const closed = vi.fn();
		instance.event.on("destroy", destroyed);
		instance.event.on("close", closed);
		let releaseCleanup = () => {};
		let markCleanupStarted = () => {};
		const cleanupAllowed = new Promise<void>((resolve) => {
			releaseCleanup = resolve;
		});
		const cleanupStarted = new Promise<void>((resolve) => {
			markCleanupStarted = resolve;
		});
		const originalCleanup = CleanupManager.prototype.cleanup;
		const cleanup = vi
			.spyOn(CleanupManager.prototype, "cleanup")
			.mockImplementationOnce(async function (this: CleanupManager) {
				markCleanupStarted();
				await cleanupAllowed;
				await originalCleanup.call(this);
			});
		const renderOutcome = instance
			.render(mount)
			.catch((error: unknown) => error);
		try {
			await cleanupStarted;
			const closeCompleted = vi.fn();
			const closing = instance.close().then(closeCompleted);
			await Promise.resolve();
			await Promise.resolve();
			expect(closeCompleted).not.toHaveBeenCalled();
			releaseCleanup();
			await closing;
			await destroyAll();
			expect(Component.instances).toHaveLength(0);
			expect(destroyed).toHaveBeenCalledOnce();
			expect(closed).not.toHaveBeenCalled();
			expect(await renderOutcome).toBe(failure);
		} finally {
			releaseCleanup();
			await renderOutcome;
			cleanup.mockRestore();
			mount.remove();
		}
	});

	it("should preserve the normalized props snapshot", () => {
		let tokenCounter = 0;
		const Component = create<{ token?: string }>({
			tag: "clone-test",
			url: (props) => `https://example.com/${props.token}`,
			props: {
				token: {
					schema: prop.string().optional(),
					value: () => `token-${++tokenCounter}`,
				},
			},
		});

		const original = Component({});
		const cloned = original.clone();
		const originalInternal = getCloneInternals(original);
		const clonedInternal = getCloneInternals(cloned);

		expect(cloned).not.toBe(original);
		expect(clonedInternal.propsPipeline.props.token).toBe(
			originalInternal.propsPipeline.props.token,
		);
		expect(clonedInternal.resolveUrl()).toBe(originalInternal.resolveUrl());
		expect(clonedInternal.propsPipeline.inputProps).toEqual(
			originalInternal.propsPipeline.inputProps,
		);
		expect(tokenCounter).toBe(1);
	});

	it("should clone transformed props without validating outputs as inputs", () => {
		const Component = create({
			tag: "clone-transformed-props",
			url: "https://example.com/transformed-clone",
			props: {
				amount: {
					schema: z.string().transform(Number),
					outputSchema: z.number(),
					required: true,
				},
			},
			eligible: () => ({ eligible: true }),
		});
		const original = Component({ amount: "42" });

		expect(original.isEligible()).toBe(true);

		const cloned = original.clone();
		const originalInternal = getCloneInternals(original);
		const clonedInternal = getCloneInternals(cloned);

		expect(originalInternal.propsPipeline.props.amount).toBe(42);
		expect(clonedInternal.propsPipeline.props.amount).toBe(42);
		expect(clonedInternal.propsPipeline.inputProps.amount).toBe("42");
		expect(cloned.isEligible()).toBe(true);
	});

	it("should retain pending clone errors until an explicit correction", async () => {
		const target: { value: string | number } = { value: "invalid" };
		const Component = create({
			tag: "clone-pending-input",
			url: "https://example.com/pending-clone",
			props: {
				target: {
					schema: z
						.object({ value: z.number() })
						.transform(({ value }) => value),
					outputSchema: z.number(),
					required: true,
				},
			},
			eligible: () => ({ eligible: true }),
		});
		const original = Component({
			target: target as { value: number },
		});
		const cloned = original.clone();

		expect(() => original.isEligible()).toThrow();
		expect(() => cloned.isEligible()).toThrow();

		target.value = 42;

		await original.updateProps({ target: target as { value: number } });
		await cloned.updateProps({ target: target as { value: number } });

		expect(original.isEligible()).toBe(true);
		expect(cloned.isEligible()).toBe(true);
		expect(getCloneInternals(original).propsPipeline.props.target).toBe(42);
		expect(getCloneInternals(cloned).propsPipeline.props.target).toBe(42);
	});

	it("should preserve the source configuration when definition options change", () => {
		const options = {
			tag: "clone-options-snapshot",
			url: "https://one.example.com/component",
		};
		const Component = create(options);
		const original = Component({});

		options.tag = "mutated-clone-options";
		options.url = "https://two.example.com/component";
		const cloned = original.clone();
		const clonedInternal = getCloneInternals(cloned);

		expect(clonedInternal.options.tag).toBe("clone-options-snapshot");
		expect(clonedInternal.resolveUrl()).toBe(
			"https://one.example.com/component",
		);
		expect(
			getSiblingInstances({
				uid: original.uid,
				tag: "clone-options-snapshot",
			}),
		).toEqual([
			expect.objectContaining({
				uid: cloned.uid,
				tag: "clone-options-snapshot",
			}),
		]);
	});

	it("should participate in factory tracking, peer lookup, and close cleanup", async () => {
		const Component = create({
			tag: "tracked-clone-component",
			url: "https://example.com/clone",
		});
		const original = Component({});
		const cloned = original.clone();

		expect(Component.instances).toEqual([original, cloned]);
		expect(
			getSiblingInstances({
				uid: original.uid,
				tag: "tracked-clone-component",
			}),
		).toEqual([
			{
				uid: cloned.uid,
				tag: "tracked-clone-component",
				exports: undefined,
			},
		]);

		await cloned.close();

		expect(Component.instances).toEqual([original]);
		expect(
			getSiblingInstances({
				uid: original.uid,
				tag: "tracked-clone-component",
			}),
		).toEqual([]);

		await original.close();
	});

	it("should participate in destroyByTag and destroyAll", async () => {
		const TaggedComponent = create({
			tag: "destroy-tracked-clone-by-tag",
			url: "https://example.com/clone-by-tag",
		});
		const taggedClone = TaggedComponent({}).clone();
		const taggedCloneClose = vi.spyOn(taggedClone, "close");

		await destroyByTag("destroy-tracked-clone-by-tag");

		expect(taggedCloneClose).toHaveBeenCalledOnce();
		expect(TaggedComponent.instances).toEqual([]);

		const GlobalComponent = create({
			tag: "destroy-tracked-clone-globally",
			url: "https://example.com/clone-globally",
		});
		const globalClone = GlobalComponent({}).clone();
		const globalCloneClose = vi.spyOn(globalClone, "close");

		await destroyAll();

		expect(globalCloneClose).toHaveBeenCalledOnce();
		expect(GlobalComponent.instances).toEqual([]);
	});

	it.each(["off", "removeAllListeners"] as const)(
		"should deregister originals and clones after public %s cleanup",
		async (method) => {
			const tag = `listener-cleanup-${method.toLowerCase()}`;
			const Component = create({
				tag,
				url: "https://example.com/clone",
			});
			const original = Component();
			const cloned = original.clone();
			const events: string[] = [];
			for (const [name, instance] of [
				["original", original],
				["clone", cloned],
			] as const) {
				if (method === "off") instance.event.off("destroy");
				else instance.event.removeAllListeners();
				instance.event.on("close", () => {
					events.push(
						`${name}:close:${Component.instances.includes(instance)}`,
					);
				});
				instance.event.on("destroy", () => {
					events.push(
						`${name}:destroy:${Component.instances.includes(instance)}`,
					);
				});
			}

			await original.close();
			expect(Component.instances).toEqual([cloned]);
			expect(getSiblingInstances({ uid: cloned.uid, tag })).toEqual([]);
			await cloned.close();
			await cloned.close();
			expect(Component.instances).toEqual([]);
			expect(getSiblingInstances({ uid: "outside", tag })).toEqual([]);
			expect(events).toEqual([
				"original:close:true",
				"original:destroy:false",
				"clone:close:true",
				"clone:destroy:false",
			]);
		},
	);

	it("should keep direct ConsumerComponent clones untracked", async () => {
		const original = new ConsumerComponent({
			tag: "direct-untracked-clone",
			url: "https://example.com/direct-clone",
		});
		const cloned = original.clone();

		expect(
			getSiblingInstances({
				uid: original.uid,
				tag: "direct-untracked-clone",
			}),
		).toEqual([]);

		await Promise.all([original.close(), cloned.close()]);
	});
});
