import type { Ref } from "react";
import type { ContextType } from "../../constants";
import { hasErrorCode } from "../../errors";
import type { ComponentInstance } from "../../types/runtime";
import { normalizeError } from "../../utils/error";
import { deactivatePropSyncState, type ReactPropSyncState } from "./prop-sync";

/**
 * The rendered ForgeFrame instance that `instanceRef` receives.
 *
 * @remarks
 * The wrapper owns rendering and prop synchronization, so the handle leaves
 * out `render()` and `updateProps()`. `close()` closes the instance through
 * the wrapper, which then calls `onClose` and clears `instanceRef`.
 *
 * @typeParam Exports - What the host exports, from the component's `exports`
 * schema
 *
 * @public
 */
export type ReactInstance<Exports = unknown> = Pick<
	ComponentInstance<Record<string, unknown>, Record<string, unknown>, Exports>,
	"uid" | "exports" | "event" | "close" | "focus" | "resize" | "show" | "hide"
>;

/**
 * Mount state the React wrapper owns across renders: the current mount's
 * sync state and where its instance handle is published.
 * @internal
 */
export interface ReactMountState {
	/** Sync state of the current mount; `null` before mounting and after cleanup. */
	syncState: ReactPropSyncState | null;
	/** The handle the target currently holds, or `null`. */
	published: ReactInstance | null;
	/** The latest `instanceRef` prop. */
	target: Ref<ReactInstance> | undefined;
	/** The cleanup a callback `target` returned for the published handle. */
	targetCleanup: (() => void) | undefined;
}

/**
 * Whether an update failure only says that the render it was held behind
 * failed. The render failure itself is reported, so this one is not.
 * @internal
 */
export function isHeldUpdateCancellation(
	state: ReactPropSyncState,
	error: unknown,
): boolean {
	return !state.rendered && hasErrorCode(error, "CLOSED");
}

/** Creates the wrapper's mount state, with nothing mounted or published yet. @internal */
export function createMountState(
	target: Ref<ReactInstance> | undefined,
): ReactMountState {
	return {
		syncState: null,
		published: null,
		target,
		targetCleanup: undefined,
	};
}

/** Rejects completed work from an obsolete, closed, or unmounted instance. @internal */
export function isCurrentSyncState(
	state: ReactPropSyncState,
	mount: Pick<ReactMountState, "syncState">,
): boolean {
	return state.active && mount.syncState === state;
}

/** Creates isolated state for one mounted instance without performing lifecycle work. */
function createPropSyncState(
	instance: ComponentInstance,
	initialProps: Record<string, unknown>,
): ReactPropSyncState {
	return {
		instance,
		comparableProps: initialProps,
		knownKeys: new Set(Object.keys(initialProps)),
		queue: [],
		rendered: false,
		draining: false,
		active: true,
	};
}

/**
 * Builds the narrow handle `instanceRef` receives. It reads `exports` live
 * and has no `render()` or `updateProps()`, which the wrapper owns.
 * @internal
 */
function createInstanceHandle(instance: ComponentInstance): ReactInstance {
	return Object.freeze({
		uid: instance.uid,
		get exports() {
			return instance.exports;
		},
		event: instance.event,
		close: () => instance.close(),
		focus: () => instance.focus(),
		resize: (dimensions) => instance.resize(dimensions),
		show: () => instance.show(),
		hide: () => instance.hide(),
	} satisfies ReactInstance);
}

/**
 * Writes a value to a ref object or callback ref. A callback's React 19
 * cleanup is returned so that it can run in place of a `null` call.
 * @internal
 */
function assignRef<T>(
	target: Ref<T> | undefined,
	value: T | null,
): (() => void) | undefined {
	if (typeof target === "function") {
		const cleanup: unknown = target(value);
		return value !== null && typeof cleanup === "function"
			? (cleanup as () => void)
			: undefined;
	}
	if (target) target.current = value;
	return undefined;
}

/** Clears a ref, running a callback's cleanup instead of calling it with `null`. @internal */
function clearRef<T>(
	target: Ref<T> | undefined,
	cleanup: (() => void) | undefined,
): void {
	if (cleanup) cleanup();
	else assignRef(target, null);
}

/** Gives the target a handle. @internal */
function publishHandle(mount: ReactMountState, handle: ReactInstance): void {
	mount.published = handle;
	mount.targetCleanup = assignRef(mount.target, handle);
}

/** Clears the target if it still holds this handle. @internal */
function unpublishHandle(
	mount: ReactMountState,
	handle: ReactInstance | null,
): void {
	if (handle === null || mount.published !== handle) return;
	mount.published = null;
	const cleanup = mount.targetCleanup;
	mount.targetCleanup = undefined;
	clearRef(mount.target, cleanup);
}

/**
 * Moves the published handle to a new `instanceRef`: the old ref is cleared
 * and the new one receives the handle, if an instance is rendered.
 * @internal
 */
export function retargetHandle(
	mount: ReactMountState,
	target: Ref<ReactInstance> | undefined,
): void {
	if (mount.target === target) return;
	const handle = mount.published;
	unpublishHandle(mount, handle);
	mount.target = target;
	if (handle) publishHandle(mount, handle);
}

/**
 * Runs a wrapper callback, logging a throw or a rejected promise so lifecycle
 * work continues.
 * @internal
 */
export function callReactCallback(name: string, run: () => unknown): void {
	const log = (error: unknown) =>
		console.error(`Error in React ${name} callback:`, error);
	try {
		const result = run();
		if (
			result &&
			typeof result === "object" &&
			"catch" in result &&
			typeof result.catch === "function"
		) {
			(result as Promise<unknown>).catch(log);
		}
	} catch (error) {
		log(error);
	}
}

/**
 * Owns one mounted instance's subscriptions, handle and prop synchronization.
 *
 * @remarks
 * Render completion affects state only while the mount state still belongs
 * to this mount: it publishes the handle, then calls `onRendered`. A close
 * clears the handle before `onClose`. Cleanup deactivates queued work before
 * initiating close and clears only state still owned by this mount,
 * protecting a replacement mount.
 *
 * @returns Effect cleanup, or `undefined` after a reported construction failure.
 * @internal
 */
export function mountReactInstance(
	createInstance: (props: Record<string, unknown>) => ComponentInstance,
	initialProps: Record<string, unknown>,
	container: HTMLDivElement,
	context: ContextType | undefined,
	mount: ReactMountState,
	observers: {
		onRendered: () => unknown;
		onClose: () => void | Promise<void>;
		onError: (error: Error) => void;
		setError: (error: Error) => void;
	},
): (() => void) | undefined {
	let instance: ComponentInstance;
	try {
		instance = createInstance(initialProps);
	} catch (err) {
		const constructionError = normalizeError(err);
		observers.setError(constructionError);
		observers.onError(constructionError);
		return;
	}
	const syncState = createPropSyncState(instance, initialProps);
	const handle = createInstanceHandle(instance);
	mount.syncState = syncState;

	const unsubscribeClose = instance.event.once("close", () => {
		deactivatePropSyncState(syncState);
		unpublishHandle(mount, handle);
		return observers.onClose();
	});
	// A failed render can also arrive on the `error` event; report it once.
	const reported = new WeakSet<Error>();
	const unsubscribeError = instance.event.on("error", (err: Error) => {
		reported.add(err);
		observers.onError(err);
	});

	instance.render(container, context).then(
		() => {
			if (!isCurrentSyncState(syncState, mount)) return;
			syncState.rendered = true;
			publishHandle(mount, handle);
			callReactCallback("onRendered", observers.onRendered);
		},
		(err: Error) => {
			if (!isCurrentSyncState(syncState, mount)) return;
			deactivatePropSyncState(syncState);
			observers.setError(err);
			if (!reported.has(err)) observers.onError(err);
		},
	);

	return () => {
		deactivatePropSyncState(syncState);
		instance.close().catch(() => undefined);
		unsubscribeClose();
		unsubscribeError();
		unpublishHandle(mount, handle);
		if (mount.syncState === syncState) mount.syncState = null;
	};
}
