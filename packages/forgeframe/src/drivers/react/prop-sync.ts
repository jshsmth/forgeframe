import type { ComponentInstance } from "../../types/runtime";

/**
 * Compares own enumerable string keys and their values using `Object.is`.
 * Nested values are compared by identity, so in-place nested mutations are not detected.
 * @internal
 */
export function shallowEqualProps(
	prev: Record<string, unknown>,
	next: Record<string, unknown>,
): boolean {
	const prevKeys = Object.keys(prev);
	const nextKeys = Object.keys(next);

	if (prevKeys.length !== nextKeys.length) {
		return false;
	}

	for (const key of prevKeys) {
		if (!Object.hasOwn(next, key)) {
			return false;
		}

		if (!Object.is(prev[key], next[key])) {
			return false;
		}
	}

	return true;
}

/** A committed React prop snapshot waiting to be synchronized. @internal */
export interface ReactPropUpdate {
	/** Committed snapshot used for equality checks after acknowledgement. */
	desired: Record<string, unknown>;
	/** Snapshot plus `undefined` for omitted keys known to this mounted instance. */
	payload: Record<string, unknown>;
	retryOnFailure: boolean;
}

/** Queue state used by snapshot/retry operations, independent of React or a component instance. @internal */
export interface ReactPropQueue {
	/** Last acknowledged snapshot; `null` permits resubmission after failure. */
	comparableProps: Record<string, unknown> | null;
	/** Keys observed with a defined value across commits, including updates that have not succeeded. */
	knownKeys: Set<string>;
	queue: ReactPropUpdate[];
}

/** Per-instance state for serializing React prop updates. @internal */
export interface ReactPropSyncState extends ReactPropQueue {
	instance: ComponentInstance;
	renderReady: boolean;
	draining: boolean;
	active: boolean;
}

/** Prevents a completed or failed instance from retaining further prop work. @internal */
export function deactivatePropSyncState(state: ReactPropSyncState): void {
	state.active = false;
	state.queue.length = 0;
}

/**
 * Creates a shallow, stable snapshot of the component props for one React commit.
 * Keys whose value is `undefined` are dropped, so passing `undefined` and
 * leaving a prop out produce the same snapshot.
 * @internal
 */
export function snapshotProps(
	props: Record<string, unknown>,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(props).filter(([, value]) => value !== undefined),
	);
}

/**
 * Builds a self-contained update payload that sends `undefined` for every
 * previously observed key the commit no longer has, which resets it in core.
 * Mutates `knownKeys` to include this commit and retains `desired` by reference.
 * @internal
 */
export function buildPropUpdate(
	desired: Record<string, unknown>,
	knownKeys: Set<string>,
): ReactPropUpdate {
	const payload = { ...desired };

	for (const key of Object.keys(desired)) {
		knownKeys.add(key);
	}

	for (const key of knownKeys) {
		if (!Object.hasOwn(desired, key)) {
			payload[key] = undefined;
		}
	}

	return {
		desired,
		payload,
		retryOnFailure: false,
	};
}

/** Records a failed attempt and permits exactly one explicitly requested retry. @internal */
export function failPropUpdate(
	state: ReactPropQueue,
	update: ReactPropUpdate,
): void {
	state.queue.shift();
	if (update.retryOnFailure)
		state.queue.unshift({ ...update, retryOnFailure: false });
	state.comparableProps = null;
}

/** Advances the queue only after the current instance acknowledges its update. @internal */
export function acknowledgePropUpdate(
	state: ReactPropQueue,
	update: ReactPropUpdate,
): void {
	state.queue.shift();
	state.comparableProps = update.desired;
}

/**
 * Enqueues a changed commit in FIFO order or requests one retry for an equivalent pending commit.
 * @returns Whether a new queue entry was added. `false` may still set a pending retry flag.
 * @internal
 */
export function enqueuePropSnapshot(
	state: ReactPropQueue,
	nextProps: Record<string, unknown>,
): boolean {
	const pending = state.queue.at(-1);
	const previous = pending?.desired ?? state.comparableProps;
	if (previous && shallowEqualProps(previous, nextProps)) {
		if (pending) pending.retryOnFailure = true;
		return false;
	}
	state.queue.push(buildPropUpdate(nextProps, state.knownKeys));
	return true;
}

/**
 * Serializes queued updates after rendering, stopping when the instance becomes obsolete.
 * Failed entries are reported and removed unless an equivalent commit requested one retry.
 * An existing drain or a render gate prevents a second drain from starting.
 * @param isCurrentSyncState - Checks both active state and ownership by the current mount.
 * @param onError - Error observer that must isolate its own failures so draining can continue.
 * @internal
 */
export async function drainPropUpdates(
	state: ReactPropSyncState,
	isCurrentSyncState: (state: ReactPropSyncState) => boolean,
	onError: (error: Error) => void,
): Promise<void> {
	if (state.draining || !state.renderReady || !isCurrentSyncState(state)) {
		return;
	}

	state.draining = true;

	try {
		while (state.queue.length > 0 && isCurrentSyncState(state)) {
			const update = state.queue[0];
			if (!update) {
				return;
			}

			try {
				await state.instance.updateProps(update.payload);
			} catch (err) {
				if (!isCurrentSyncState(state)) {
					return;
				}

				failPropUpdate(state, update);
				onError(err as Error);
				continue;
			}

			if (!isCurrentSyncState(state)) {
				return;
			}

			acknowledgePropUpdate(state, update);
		}
	} finally {
		state.draining = false;
	}
}
