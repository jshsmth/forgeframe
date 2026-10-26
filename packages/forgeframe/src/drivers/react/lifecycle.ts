import type { ContextType } from "../../constants";
import type {
	AnyFactoryInput,
	ForgeFrameComponentInstance,
} from "../../types/runtime";
import { normalizeError } from "../../utils/error";
import { deactivatePropSyncState, type ReactPropSyncState } from "./prop-sync";

/** Mutable refs remain owned by the React wrapper. @internal */
export interface ReactInstanceRefs<P extends Record<string, unknown>, X> {
	instanceRef: {
		current: ForgeFrameComponentInstance<P, X, AnyFactoryInput> | null;
	};
	propSyncRef: { current: ReactPropSyncState<P, X> | null };
}

/** Rejects completed work from an obsolete, closed, or unmounted instance. @internal */
export function isCurrentSyncState<P extends Record<string, unknown>, X>(
	state: ReactPropSyncState<P, X>,
	refs: ReactInstanceRefs<P, X>,
): boolean {
	return (
		state.active &&
		refs.instanceRef.current === state.instance &&
		refs.propSyncRef.current === state
	);
}

/** Creates isolated state for one mounted instance without performing lifecycle work. */
function createPropSyncState<P extends Record<string, unknown>, X>(
	instance: ForgeFrameComponentInstance<P, X, AnyFactoryInput>,
	initialProps: Record<string, unknown>,
): ReactPropSyncState<P, X> {
	return {
		instance,
		comparableProps: initialProps,
		knownKeys: new Set(Object.keys(initialProps)),
		queue: [],
		renderReady: false,
		draining: false,
		active: true,
	};
}

/** Clears only refs still owned by the completing instance. */
function releaseInstanceRefs<P extends Record<string, unknown>, X>(
	refs: ReactInstanceRefs<P, X>,
	state: ReactPropSyncState<P, X>,
): void {
	if (refs.instanceRef.current === state.instance)
		refs.instanceRef.current = null;
	if (refs.propSyncRef.current === state) refs.propSyncRef.current = null;
}

/**
 * Owns one mounted instance's subscriptions and render-gated prop synchronization.
 *
 * @remarks
 * Render completion affects state only while the refs still belong to this mount.
 * Cleanup deactivates queued work before initiating close and clears only refs
 * still owned by this instance, protecting a replacement mount.
 *
 * @param onReady - Runs after the current instance's render promise resolves.
 * @returns Effect cleanup, or `undefined` after a reported construction failure.
 * @internal
 */
export function mountReactInstance<P extends Record<string, unknown>, X>(
	createInstance: (
		props: Record<string, unknown>,
	) => ForgeFrameComponentInstance<P, X, AnyFactoryInput>,
	initialProps: Record<string, unknown>,
	container: HTMLDivElement,
	context: ContextType | undefined,
	refs: ReactInstanceRefs<P, X>,
	observers: {
		onRendered: () => void | Promise<void>;
		onClose: () => void | Promise<void>;
		onError: (error: Error) => void;
		setError: (error: Error) => void;
	},
	onReady: (state: ReactPropSyncState<P, X>) => void,
): (() => void) | undefined {
	const { instanceRef, propSyncRef } = refs;
	const isCurrent = (state: ReactPropSyncState<P, X>) =>
		isCurrentSyncState(state, refs);
	let instance: ForgeFrameComponentInstance<P, X, AnyFactoryInput>;
	try {
		instance = createInstance(initialProps);
	} catch (err) {
		const constructionError = normalizeError(err);
		observers.setError(constructionError);
		observers.onError(constructionError);
		return;
	}
	const syncState = createPropSyncState(instance, initialProps);

	instanceRef.current = instance;
	propSyncRef.current = syncState;

	const unsubscribeRendered = instance.event.once("rendered", () => {
		return observers.onRendered();
	});
	const unsubscribeClose = instance.event.once("close", () => {
		deactivatePropSyncState(syncState);
		return observers.onClose();
	});
	const unsubscribeError = instance.event.on("error", (err: Error) => {
		observers.onError(err);
	});

	instance.render(container, context).then(
		() => {
			if (!isCurrent(syncState)) {
				return;
			}

			syncState.renderReady = true;
			void onReady(syncState);
		},
		(err: Error) => {
			if (!isCurrent(syncState)) {
				return;
			}

			deactivatePropSyncState(syncState);
			observers.setError(err);
			observers.onError(err);
		},
	);

	return () => {
		deactivatePropSyncState(syncState);
		instance.close().catch(() => undefined);
		unsubscribeRendered();
		unsubscribeClose();
		unsubscribeError();

		releaseInstanceRefs(refs, syncState);
	};
}
