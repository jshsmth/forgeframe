import {
	buildUnnormalizedProps,
	normalizeProps,
	revalidatePropInputs,
	validateNormalizedProps,
} from "../../props/normalize";
import { normalizeError } from "../../utils/error";
import { createDeferred } from "../../utils/promise";
import { definedInputKeys, mergePropPatch } from "./prop-update";
import type { NormalizedOptions } from "./types";

interface NextPropsSnapshot<P> {
	nextInputProps: Record<string, unknown>;
	nextProps: P;
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
	isRendered: () => boolean;
	syncTrustedDomainForUrl: (url: string) => void;
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
export class ConsumerPropsPipeline<
	P extends Record<string, unknown>,
	SchemaInputs = P,
> {
	/** Current normalized prop snapshot. */
	public props: P;

	/** Last input props snapshot prior to normalization. */
	public inputProps: Record<string, unknown>;

	/** Construction-time schema failure retained until an update succeeds. */
	private pendingNormalizationError: { error: unknown } | null = null;

	/** Settled tail of all admitted prop work, including disconnected updates. */
	public pendingPropsUpdate: Promise<void> | null = null;

	constructor(
		private options: NormalizedOptions<P, SchemaInputs>,
		initialInputProps: Record<string, unknown>,
	) {
		this.inputProps = { ...initialInputProps };
		try {
			this.props = normalizeProps(this.inputProps, this.options.props) as P;
		} catch (error) {
			// Construction stays usable so the failure surfaces at render, or is
			// cleared by a successful update.
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
	buildNextProps(patch: Record<string, unknown>): NextPropsSnapshot<P> {
		const nextInputProps = mergePropPatch(this.inputProps, patch);
		const nextProps = (
			this.pendingNormalizationError
				? normalizeProps(nextInputProps, this.options.props)
				: {
						...this.props,
						...normalizeProps(
							nextInputProps,
							this.options.props,
							new Set(Object.keys(patch)),
						),
					}
		) as P;
		this.validateSnapshot(nextInputProps, nextProps);
		this.options.validate?.({ props: nextProps });
		return { nextInputProps, nextProps };
	}

	/** Rechecks supplied inputs, then each normalized output contract. */
	private validateSnapshot(
		inputProps: Record<string, unknown>,
		props: P,
	): void {
		revalidatePropInputs(
			inputProps,
			this.options.props,
			definedInputKeys(inputProps),
		);
		validateNormalizedProps(props, this.options.props);
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
			const { nextInputProps, nextProps } = this.buildNextProps(newProps);
			const resolvedUrl = hooks.resolveUrl(nextProps);
			const nextHostOrigin = hooks.resolveUrlOrigin(resolvedUrl);
			hooks.assertStableRenderedOrigin(nextHostOrigin);
			hooks.validateTransportProps(nextProps, nextHostOrigin);
			hooks.assertActive();

			this.commitSnapshot({ nextInputProps, nextProps });

			if (!hooks.isRendered()) {
				hooks.syncTrustedDomainForUrl(resolvedUrl);
			}

			if (hooks.shouldSendPropsToHost()) {
				await hooks.sendPropsUpdateToHost(nextProps);
			}
			hooks.assertActive();
			hooks.emitPropsUpdated(nextProps);
		});
	}

	/** Commits only a completely validated, origin-checked candidate. */
	private commitSnapshot(snapshot: NextPropsSnapshot<P>): void {
		this.inputProps = snapshot.nextInputProps;
		this.props = snapshot.nextProps;
		this.pendingNormalizationError = null;
	}

	/**
	 * Reads validated current props through the same queue as updates and host sync.
	 * The read follows settlement of earlier work, including rejected updates, so
	 * bootstrap serialization cannot overlap a preceding function-bridge batch.
	 */
	readCurrentProps<R>(read: (props: P) => R): Promise<R> {
		return this.queuePropsUpdate(async () => {
			this.revalidateSchemaValues();
			return read(this.props);
		});
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
	private trackPendingUpdate(updatePromise: Promise<unknown>): void {
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
	}
}
