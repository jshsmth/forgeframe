import { ForgeFrameError } from "../../errors";
import {
	buildUnnormalizedProps,
	normalizeProps,
	revalidatePropInputs,
	validateNormalizedProps,
} from "../../props/normalize";
import { normalizeError } from "../../utils/error";
import { createDeferred, type Deferred } from "../../utils/promise";
import {
	definedInputKeys,
	mergeNormalizedPatch,
	mergePropPatch,
	selectNormalizationKeys,
} from "./prop-update";
import type { NormalizedOptions } from "./types";

/** A validated update that has not been committed yet. */
interface PropsCandidate<P> {
	inputProps: Record<string, unknown>;
	props: P;
}

/**
 * A render attempt's place in the props queue.
 * @internal
 */
export interface RenderHold {
	/** Earlier prop work the render waits for, or `null` when nothing is pending. */
	earlierWork: Promise<void> | null;
	/** Lets held updates run once the attempt has settled. Safe to call twice. */
	release: () => void;
}

/** Queue state of an active render hold. */
interface ActiveRenderHold {
	gate: Deferred<void>;
	/** Queue tail the hold installed; another tail means updates are held. */
	tail: Promise<void> | null;
	/** Earlier work, then the render's own reads, which run ahead of held updates. */
	ownWork: Promise<void>;
	/** Entries of `ownWork` still running: the earlier work and each own read. */
	unsettled: number;
}

/**
 * Hooks used by the props pipeline to coordinate host synchronization behavior.
 * @internal
 */
export interface ConsumerPropsUpdateHooks<P extends Record<string, unknown>> {
	assertActive: () => void;
	resolveUrl: (props: P) => string;
	resolveUrlOrigin: (url: string) => string;
	assertStableRenderedOrigin: (nextHostOrigin: string) => void;
	validateTransportProps: (props: P, hostOrigin: string) => void;
	shouldSendPropsToHost: () => boolean;
	sendPropsUpdateToHost: (nextProps: P) => Promise<void>;
	emitPropsUpdated: (nextProps: P) => void;
}

/**
 * Owns consumer prop normalization, validation, and update queueing.
 *
 * @remarks
 * Every update runs one schema-driven sequence: serialized queue, isolated
 * patch merge, schema conversion (which applies schema defaults), output
 * contract checks, the component `validate`, URL and origin checks, snapshot
 * commitment, host synchronization, then notifications.
 *
 * @internal
 */
export class ConsumerPropsPipeline<P extends Record<string, unknown>> {
	/** Current normalized prop snapshot. */
	public props: P;

	/** Last input props snapshot prior to normalization. */
	public inputProps: Record<string, unknown>;

	/** Construction-time schema failure retained until an update succeeds. */
	private pendingNormalizationError: { error: unknown } | null = null;

	/** Settled tail of all admitted prop work, including disconnected updates. */
	private pendingPropsUpdate: Promise<void> | null = null;

	/** The render attempt holding the queue, if any. */
	private renderHold: ActiveRenderHold | null = null;

	constructor(
		private options: NormalizedOptions<P>,
		initialInputProps: Record<string, unknown>,
	) {
		this.inputProps = { ...initialInputProps };
		try {
			this.props = normalizeProps(this.inputProps, this.options.props) as P;
		} catch (error) {
			// Construction stays usable so the failure surfaces at render, or is
			// cleared by a successful update. These props are not `P` yet: every
			// reader calls revalidateSchemaValues() first, which rethrows this
			// failure, and only an update merges into them.
			this.pendingNormalizationError = { error };
			this.props = buildUnnormalizedProps(
				this.inputProps,
				this.options.props,
			) as P;
		}
	}

	/**
	 * Rechecks supplied inputs and normalized outputs at a trust boundary.
	 * A deferred construction failure is rethrown until an update replaces the
	 * snapshot.
	 */
	revalidateSchemaValues(): void {
		if (this.pendingNormalizationError) {
			throw this.pendingNormalizationError.error;
		}
		this.validateSnapshot(this.inputProps, this.props);
	}

	/**
	 * Prepares a validated candidate without committing the current snapshot.
	 * Schema transforms and the component `validate` may run user code.
	 */
	buildCandidate(patch: Record<string, unknown>): PropsCandidate<P> {
		const inputProps = mergePropPatch(this.inputProps, patch);
		const normalized = normalizeProps(
			inputProps,
			this.options.props,
			selectNormalizationKeys(patch, this.pendingNormalizationError !== null),
		);
		const props = mergeNormalizedPatch(this.props, normalized);
		this.validateSnapshot(inputProps, props, new Set(Object.keys(normalized)));
		this.validateComponent(props);
		return { inputProps, props };
	}

	/**
	 * Runs the component's `validate` option. Its rejection becomes a
	 * `VALIDATION` error that keeps the thrown value as `cause`.
	 */
	validateComponent(props: P): void {
		if (!this.options.validate) return;
		try {
			this.options.validate({ props });
		} catch (error) {
			throw new ForgeFrameError(
				"VALIDATION",
				`Component "${this.options.tag}" validate() rejected the props: ${normalizeError(error).message}`,
				{ cause: error },
			);
		}
	}

	/**
	 * Rechecks supplied inputs, then each normalized output contract.
	 * Keys an update has just normalized were checked by normalization.
	 */
	private validateSnapshot(
		inputProps: Record<string, unknown>,
		props: P,
		normalizedKeys?: ReadonlySet<string>,
	): void {
		revalidatePropInputs(
			inputProps,
			this.options.props,
			definedInputKeys(inputProps, normalizedKeys),
		);
		validateNormalizedProps(props, this.options.props, normalizedKeys);
	}

	/**
	 * Applies a props update and synchronizes it to the host when connected.
	 *
	 * @remarks
	 * Validation and origin checks precede commitment. Host synchronization follows
	 * commitment, so a transport rejection leaves the new consumer snapshot in place
	 * and skips the props-updated notification. Queued work continues after failure.
	 */
	updateProps(
		newProps: Record<string, unknown>,
		hooks: ConsumerPropsUpdateHooks<P>,
	): Promise<void> {
		return this.queuePropsUpdate(async () => {
			hooks.assertActive();
			const candidate = this.buildCandidate(newProps);
			const resolvedUrl = hooks.resolveUrl(candidate.props);
			const nextHostOrigin = hooks.resolveUrlOrigin(resolvedUrl);
			hooks.assertStableRenderedOrigin(nextHostOrigin);
			hooks.validateTransportProps(candidate.props, nextHostOrigin);
			hooks.assertActive();

			this.commitCandidate(candidate);

			if (hooks.shouldSendPropsToHost()) {
				await hooks.sendPropsUpdateToHost(candidate.props);
			}
			hooks.assertActive();
			hooks.emitPropsUpdated(candidate.props);
		});
	}

	/** Commits only a completely validated, origin-checked candidate. */
	private commitCandidate(candidate: PropsCandidate<P>): void {
		this.inputProps = candidate.inputProps;
		this.props = candidate.props;
		this.pendingNormalizationError = null;
	}

	/**
	 * Reads validated current props in queue order.
	 *
	 * @remarks
	 * During a render attempt the read is the render's own work, so it runs
	 * inside the hold, ahead of held updates. Otherwise it queues behind earlier
	 * work, including rejected updates. Either way, bootstrap serialization
	 * cannot overlap another function-bridge batch.
	 */
	readCurrentProps<R>(read: (props: P) => R): Promise<R> {
		const readSnapshot = async () => {
			this.revalidateSchemaValues();
			return read(this.props);
		};
		const hold = this.renderHold;
		return hold
			? this.appendOwnWork(hold, hold.ownWork.then(readSnapshot))
			: this.queuePropsUpdate(readSnapshot);
	}

	/**
	 * Places a render attempt's hold at the tail of the props queue.
	 *
	 * @remarks
	 * The render waits for `earlierWork`, so every update admitted earlier is
	 * in its snapshot. Updates admitted later wait behind the hold in call
	 * order, without running user code, until `release`.
	 */
	holdForRender(): RenderHold {
		const earlierWork = this.pendingPropsUpdate;
		const hold: ActiveRenderHold = {
			gate: createDeferred<void>(),
			tail: null,
			ownWork: Promise.resolve(),
			unsettled: 0,
		};
		if (earlierWork) this.appendOwnWork(hold, earlierWork);
		this.renderHold = hold;
		hold.tail = this.trackPendingUpdate(
			hold.ownWork.then(() => hold.gate.promise),
		);
		return { earlierWork, release: () => this.releaseRenderHold(hold) };
	}

	/** Extends the hold's own work, counting the entry until it settles. */
	private appendOwnWork<R>(
		hold: ActiveRenderHold,
		work: Promise<R>,
	): Promise<R> {
		hold.unsettled += 1;
		const settle = () => {
			hold.unsettled -= 1;
		};
		hold.ownWork = work.then(settle, settle);
		return work;
	}

	/**
	 * Releases a hold once its own work has settled. With nothing held or
	 * running, the queue is idle at once, so the next update starts
	 * synchronously as it would without a render.
	 */
	private releaseRenderHold(hold: ActiveRenderHold): void {
		if (this.renderHold !== hold) return;
		this.renderHold = null;
		if (this.pendingPropsUpdate === hold.tail && hold.unsettled === 0) {
			this.pendingPropsUpdate = null;
		}
		void hold.ownWork.then(hold.gate.resolve);
	}

	/**
	 * Forgets queued work at teardown. A render hold is released at once, so
	 * every held update settles; each rejects when its turn checks activity.
	 */
	abandonPending(): void {
		this.pendingPropsUpdate = null;
		this.renderHold?.gate.resolve();
		this.renderHold = null;
	}

	/**
	 * Installs queue ownership before user callbacks, even without a connected host.
	 */
	private queuePropsUpdate<R>(updateFn: () => Promise<R>): Promise<R> {
		if (!this.pendingPropsUpdate) {
			// Install the queue entry before running user code such as schema
			// transforms or the component validate: it may synchronously enqueue
			// another update while this snapshot is built.
			const pending = createDeferred<R>();
			this.trackPendingUpdate(pending.promise);
			try {
				const immediateUpdate = updateFn();
				void immediateUpdate.then(pending.resolve, pending.reject);
				return immediateUpdate;
			} catch (error) {
				pending.reject(normalizeError(error));
				throw error;
			}
		}

		const queuedUpdate = this.pendingPropsUpdate.then(updateFn, updateFn);
		this.trackPendingUpdate(queuedUpdate);
		return queuedUpdate;
	}

	/**
	 * Tracks a promise as the active queued update and clears it when settled.
	 */
	private trackPendingUpdate(updatePromise: Promise<unknown>): Promise<void> {
		const settledUpdate = updatePromise.then(
			() => undefined,
			() => undefined,
		);

		this.pendingPropsUpdate = settledUpdate;

		settledUpdate.finally(() => {
			if (this.pendingPropsUpdate === settledUpdate) {
				this.pendingPropsUpdate = null;
			}
		});
		return settledUpdate;
	}
}
