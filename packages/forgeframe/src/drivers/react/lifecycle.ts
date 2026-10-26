import type { Ref } from "react";
import type { ContextType } from "../../constants";
import { hasErrorCode } from "../../errors";
import type { ComponentInstance } from "../../types/runtime";
import { normalizeError } from "../../utils/error";
import type { ReactInstance } from "../react";
import { deactivatePropSyncState, type ReactPropSyncState } from "./prop-sync";

/**
 * Mount state the React wrapper owns across renders: the current mount's
 * sync state and where its instance handle is published.
 * @internal
 */
export interface ReactInstanceRefs {
	/** Sync state of the current mount; `null` before mounting and after cleanup. */
	current: ReactPropSyncState | null;
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

/** Rejects completed work from an obsolete, closed, or unmounted instance. @internal */
export function isCurrentSyncState(
	state: ReactPropSyncState,
	refs: Pick<ReactInstanceRefs, "current">,
): boolean {
	return state.active && refs.current === state;
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
export function createInstanceHandle(
	instance: ComponentInstance,
): ReactInstance {
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
export function assignRef<T>(
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
export function clearRef<T>(
	target: Ref<T> | undefined,
	cleanup: (() => void) | undefined,
): void {
	if (cleanup) cleanup();
	else assignRef(target, null);
}

/** Gives the target a handle. @internal */
export function publishHandle(
	refs: ReactInstanceRefs,
	handle: ReactInstance,
): void {
	refs.published = handle;
	refs.targetCleanup = assignRef(refs.target, handle);
}

/** Clears the target if it still holds this handle. @internal */
export function unpublishHandle(
	refs: ReactInstanceRefs,
	handle: ReactInstance | null,
): void {
	if (handle === null || refs.published !== handle) return;
	refs.published = null;
	const cleanup = refs.targetCleanup;
	refs.targetCleanup = undefined;
	clearRef(refs.target, cleanup);
}

/**
 * Moves the published handle to a new `instanceRef`: the old ref is cleared
 * and the new one receives the handle, if an instance is rendered.
 * @internal
 */
export function retargetHandle(
	refs: ReactInstanceRefs,
	target: Ref<ReactInstance> | undefined,
): void {
	if (refs.target === target) return;
	const handle = refs.published;
	unpublishHandle(refs, handle);
	refs.target = target;
	if (handle) publishHandle(refs, handle);
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
 * Render completion affects state only while the refs still belong to this
 * mount: it publishes the handle, then calls `onRendered`. A close clears the
 * handle before `onClose`. Cleanup deactivates queued work before initiating
 * close and clears only refs still owned by this mount, protecting a
 * replacement mount.
 *
 * @returns Effect cleanup, or `undefined` after a reported construction failure.
 * @internal
 */
export function mountReactInstance(
	createInstance: (props: Record<string, unknown>) => ComponentInstance,
	initialProps: Record<string, unknown>,
	container: HTMLDivElement,
	context: ContextType | undefined,
	refs: ReactInstanceRefs,
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
	refs.current = syncState;

	const unsubscribeClose = instance.event.once("close", () => {
		deactivatePropSyncState(syncState);
		unpublishHandle(refs, handle);
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
			if (!isCurrentSyncState(syncState, refs)) return;
			syncState.rendered = true;
			publishHandle(refs, handle);
			callReactCallback("onRendered", observers.onRendered);
		},
		(err: Error) => {
			if (!isCurrentSyncState(syncState, refs)) return;
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
		unpublishHandle(refs, handle);
		if (refs.current === syncState) refs.current = null;
	};
}
