import {
	materializePropAliases,
	normalizeConsumerProps,
	validateConsumerProps,
} from "../../props/normalize";
import type { PropContext } from "../../types/props";
import { createDeferred } from "../../utils/promise";
import {
	definedInputKeys,
	invalidatePatchedKeys,
	mergePropPatch,
	PROP_RESET,
	recordValidatedKeys,
} from "./prop-update";
import type { NormalizedOptions } from "./types";

export { PROP_RESET } from "./prop-update";

/** Marks a user callback failure so construction does not defer it as schema validation. */
class UserNormalizationCallbackFailure {
	constructor(public readonly thrownValue: unknown) {}
}

interface NextPropsSnapshot<P> {
	nextInputProps: Record<string, unknown>;
	nextProps: P;
	revalidationSchemaKeys: Set<string>;
	outputValidationKeys: Set<string>;
}

interface NormalizedPropSnapshot<P> {
	props: P;
	schemaValidatedKeys: Set<string>;
	revalidationSchemaKeys: Set<string>;
	outputValidationKeys: Set<string>;
}

interface PreparedPropPatch<P> {
	mergedProps: P;
	changedSchemaKeys: Set<string>;
	providedChangedSchemaKeys: Set<string>;
	schemaValidatedKeys: Set<string>;
	outputValidationKeys: Set<string>;
}

/** Assembles the validated candidate without committing runtime state. */
function buildPropsSnapshot<P>(
	nextInputProps: Record<string, unknown>,
	normalized: NormalizedPropSnapshot<P>,
): NextPropsSnapshot<P> {
	return {
		nextInputProps,
		nextProps: normalized.props,
		revalidationSchemaKeys: normalized.revalidationSchemaKeys,
		outputValidationKeys: normalized.outputValidationKeys,
	};
}

/**
 * Hooks used by the props pipeline to coordinate host synchronization behavior.
 * @internal
 */
export interface ConsumerPropsUpdateHooks<P extends Record<string, unknown>> {
	assertActive: () => void;
	resolveUrl: (props: P) => string;
	resolveUrlOrigin: (url: string) => string | null;
	assertStableRenderedOrigin: (nextHostOrigin: string | null) => void;
	isRendered: () => boolean;
	syncTrustedDomainForUrl: (url: string) => void;
	shouldSendPropsToHost: () => boolean;
	sendPropsUpdateToHost: (nextProps: P) => Promise<void>;
	emitPropsUpdated: (nextProps: P) => void;
}

/**
 * Hooks required to queue a host sync for the current props snapshot.
 * @internal
 */
export interface ConsumerPropsSyncHooks<P extends Record<string, unknown>> {
	assertActive: () => void;
	shouldSendPropsToHost: () => boolean;
	sendPropsUpdateToHost: (nextProps: P) => Promise<void>;
}

function prevalidateProvidedSchemaInputs<
	P extends Record<string, unknown>,
	SchemaInputs,
>(
	inputProps: Record<string, unknown>,
	props: P,
	definitions: NormalizedOptions<P, SchemaInputs>["props"],
	candidateKeys = definedInputKeys(inputProps),
): Set<string> {
	validateConsumerProps<P, SchemaInputs>(props, definitions, {
		schemaKeys: candidateKeys,
		schemaInputProps: inputProps,
		validationKeys: candidateKeys,
		skipCustomValidation: true,
	});
	return candidateKeys;
}

function validateNormalizedSchemaValues<
	P extends Record<string, unknown>,
	SchemaInputs,
>(
	props: P,
	definitions: NormalizedOptions<P, SchemaInputs>["props"],
	schemaKeys: ReadonlySet<string>,
): void {
	if (schemaKeys.size === 0) {
		return;
	}

	validateConsumerProps<P, SchemaInputs>(props, definitions, {
		schemaKeys,
		schemaInputProps: props,
		validationKeys: schemaKeys,
		preserveValidatedValues: true,
		requireUnchangedSchemaOutput: true,
		validateNormalizedOutput: true,
		skipCustomValidation: true,
	});
}

/** Cloneable consumer-props pipeline state. @internal */
export interface ConsumerPropsPipelineSnapshot<
	P extends Record<string, unknown>,
> {
	props: P;
	inputProps: Record<string, unknown>;
	normalizationPending: boolean;
	pendingNormalizationError: unknown;
	schemaValidated: boolean;
	schemaValidatedKeys: ReadonlySet<string>;
	revalidationSchemaKeys: ReadonlySet<string>;
	outputValidationKeys: ReadonlySet<string>;
}

/**
 * Owns consumer prop normalization, validation, and update queueing.
 * @internal
 */
export class ConsumerPropsPipeline<
	P extends Record<string, unknown>,
	SchemaInputs = P,
> {
	/** Current normalized prop snapshot. */
	public props!: P;

	/** Last input props snapshot prior to normalization. */
	public inputProps!: Record<string, unknown>;

	/** Whether every current schema-backed value has been converted to output form. */
	private schemaValidated!: boolean;

	/** Values already produced by probing a schema with `undefined`. */
	private schemaValidatedKeys!: Set<string>;

	/** Defined raw schema inputs to recheck at each trust boundary. */
	private revalidationSchemaKeys!: Set<string>;

	/** Normalized values that have a safe trust-boundary validation schema. */
	private outputValidationKeys!: Set<string>;

	/** Whether custom normalization is waiting for valid schema outputs. */
	private normalizationPending = false;

	/** Original schema failure retained until an explicit prop update succeeds. */
	private pendingNormalizationError: unknown = undefined;

	/** Active in-flight update chain when host synchronization is occurring. */
	public pendingPropsUpdate: Promise<void> | null = null;

	constructor(
		private options: NormalizedOptions<P, SchemaInputs>,
		initialInputProps: Record<string, unknown>,
		private createPropContext: (props: P) => PropContext<P>,
		snapshot?: ConsumerPropsPipelineSnapshot<P>,
	) {
		if (snapshot) {
			this.restoreSnapshot(snapshot);
			return;
		}

		this.inputProps = materializePropAliases<P, SchemaInputs>(
			initialInputProps,
			this.options.props,
		) as Record<string, unknown>;
		try {
			const normalizedState = this.normalizeInputSnapshot(
				this.inputProps,
				(error) => {
					throw new UserNormalizationCallbackFailure(error);
				},
			);
			this.adoptNormalizedState(normalizedState);
		} catch (error) {
			if (error instanceof UserNormalizationCallbackFailure) {
				throw error.thrownValue;
			}

			const initialProps = this.deferFailedNormalization(error);
			this.props = normalizeConsumerProps<P, SchemaInputs>(
				initialProps,
				this.options.props,
				this.createPropContext(initialProps),
				{
					schemaValidatedKeys: this.schemaValidatedKeys,
					outputValidationKeys: this.outputValidationKeys,
					deferCustomNormalization: true,
				},
			);
		}
		this.schemaValidated = false;
	}

	private restoreSnapshot(snapshot: ConsumerPropsPipelineSnapshot<P>): void {
		this.inputProps = { ...snapshot.inputProps };
		this.props = { ...snapshot.props };
		this.normalizationPending = snapshot.normalizationPending;
		this.pendingNormalizationError = snapshot.pendingNormalizationError;
		this.schemaValidated = snapshot.schemaValidated;
		this.schemaValidatedKeys = new Set(snapshot.schemaValidatedKeys);
		this.revalidationSchemaKeys = new Set(snapshot.revalidationSchemaKeys);
		this.outputValidationKeys = new Set(snapshot.outputValidationKeys);
	}

	private adoptNormalizedState(
		normalizedState: ReturnType<
			ConsumerPropsPipeline<P, SchemaInputs>["normalizeInputSnapshot"]
		>,
	): void {
		this.props = normalizedState.props;
		this.schemaValidatedKeys = normalizedState.schemaValidatedKeys;
		this.revalidationSchemaKeys = normalizedState.revalidationSchemaKeys;
		this.outputValidationKeys = normalizedState.outputValidationKeys;
	}

	/** Records schema failure before building the fallback snapshot without user callbacks. */
	private deferFailedNormalization(error: unknown): P {
		this.normalizationPending = true;
		this.pendingNormalizationError = error;
		this.schemaValidatedKeys = new Set<string>();
		this.revalidationSchemaKeys = new Set<string>();
		this.outputValidationKeys = new Set<string>();
		const initialProps = { ...this.inputProps } as P;
		return initialProps;
	}

	/**
	 * Copies prop containers and validation-key sets for a clone's independent pipeline.
	 * Nested prop values and the retained normalization error remain shared references.
	 * Pending update promises are excluded.
	 */
	createSnapshot(): ConsumerPropsPipelineSnapshot<P> {
		return {
			props: { ...this.props },
			inputProps: { ...this.inputProps },
			normalizationPending: this.normalizationPending,
			pendingNormalizationError: this.pendingNormalizationError,
			schemaValidated: this.schemaValidated,
			schemaValidatedKeys: new Set(this.schemaValidatedKeys),
			revalidationSchemaKeys: new Set(this.revalidationSchemaKeys),
			outputValidationKeys: new Set(this.outputValidationKeys),
		};
	}

	/**
	 * Establishes schema outputs, then rechecks inputs without replacing those outputs.
	 * Later calls still run custom prop validators. A deferred normalization failure
	 * is rethrown until a successful explicit update replaces the snapshot.
	 */
	ensureSchemaValidated(): void {
		if (this.normalizationPending) {
			throw this.pendingNormalizationError;
		}

		if (this.schemaValidated) {
			this.revalidateSchemaInputs();
			validateConsumerProps<P, SchemaInputs>(this.props, this.options.props, {
				schemaKeys: new Set<string>(),
			});
			return;
		}

		this.revalidateSchemaInputs();
		const validatedProps = { ...this.props };
		validateConsumerProps<P, SchemaInputs>(validatedProps, this.options.props, {
			schemaValidatedKeys: this.schemaValidatedKeys,
		});
		this.props = validatedProps;
		this.schemaValidated = true;
		this.schemaValidatedKeys.clear();
	}

	/** Rechecks current schema values without rerunning user validators. @internal */
	revalidateSchemaValues(): void {
		if (this.normalizationPending || !this.schemaValidated) {
			this.ensureSchemaValidated();
			return;
		}

		this.revalidateSchemaInputs();
	}

	/**
	 * Prepares a validated candidate without committing the pipeline's current snapshot.
	 * Defaults, decorators and validators may execute user code during preparation.
	 */
	buildNextProps(newProps: Record<string, unknown>): NextPropsSnapshot<P> {
		const patch = materializePropAliases<P, SchemaInputs>(
			newProps,
			this.options.props,
			PROP_RESET,
		);
		const nextInputProps = mergePropPatch(this.inputProps, patch);
		if (this.normalizationPending) {
			const normalized = this.normalizeInputSnapshot(nextInputProps);
			this.validateDeferredSnapshot(normalized);
			return buildPropsSnapshot(nextInputProps, normalized);
		}

		const prepared = this.preparePropPatch(patch, nextInputProps);
		const normalized = this.normalizePatchedSnapshot(prepared, nextInputProps);
		this.validatePatchedSnapshot(
			normalized,
			prepared.changedSchemaKeys,
			nextInputProps,
		);
		return buildPropsSnapshot(nextInputProps, normalized);
	}

	/** Prepares isolated working values and invalidates only patched validation evidence. */
	private preparePropPatch(
		patch: Record<string, unknown>,
		nextInputProps: Record<string, unknown>,
	): PreparedPropPatch<P> {
		const changedSchemaKeys = new Set(Object.keys(patch));
		return {
			mergedProps: mergePropPatch(this.props, patch) as P,
			changedSchemaKeys,
			schemaValidatedKeys: invalidatePatchedKeys(
				this.schemaValidatedKeys,
				patch,
			),
			outputValidationKeys: invalidatePatchedKeys(
				this.outputValidationKeys,
				patch,
			),
			providedChangedSchemaKeys: definedInputKeys(
				nextInputProps,
				changedSchemaKeys,
			),
		};
	}

	private validateDeferredSnapshot(
		normalized: NormalizedPropSnapshot<P>,
	): void {
		validateNormalizedSchemaValues(
			normalized.props,
			this.options.props,
			normalized.outputValidationKeys,
		);
		validateConsumerProps<P, SchemaInputs>(
			normalized.props,
			this.options.props,
			{
				schemaValidatedKeys: normalized.schemaValidatedKeys,
			},
		);
		this.options.validate?.({ props: normalized.props });
	}

	/** Converts supplied inputs before running output-typed decorators. */
	private normalizePatchedSnapshot(
		prepared: PreparedPropPatch<P>,
		nextInputProps: Record<string, unknown>,
	): NormalizedPropSnapshot<P> {
		const {
			mergedProps,
			schemaValidatedKeys,
			outputValidationKeys,
			changedSchemaKeys,
			providedChangedSchemaKeys,
		} = prepared;
		prevalidateProvidedSchemaInputs(
			nextInputProps,
			mergedProps,
			this.options.props,
			providedChangedSchemaKeys,
		);
		recordValidatedKeys(schemaValidatedKeys, providedChangedSchemaKeys);
		const propContext = this.createPropContext(mergedProps);
		const normalizedSchemaKeys = new Set(schemaValidatedKeys);
		const props = normalizeConsumerProps<P, SchemaInputs>(
			mergedProps,
			this.options.props,
			propContext,
			{
				schemaValidatedKeys: normalizedSchemaKeys,
				outputValidationKeys,
				decorateKeys: changedSchemaKeys,
				fallbackKeys: changedSchemaKeys,
			},
		);
		recordValidatedKeys(schemaValidatedKeys, normalizedSchemaKeys);
		return {
			props,
			schemaValidatedKeys,
			outputValidationKeys,
			revalidationSchemaKeys: definedInputKeys(nextInputProps),
		};
	}

	/** Preserves input revalidation, output contracts, custom validators, then component validation. */
	private validatePatchedSnapshot(
		normalized: NormalizedPropSnapshot<P>,
		changedSchemaKeys: Set<string>,
		nextInputProps: Record<string, unknown>,
	): void {
		const {
			props,
			revalidationSchemaKeys,
			outputValidationKeys,
			schemaValidatedKeys,
		} = normalized;
		validateConsumerProps<P, SchemaInputs>(props, this.options.props, {
			schemaKeys: revalidationSchemaKeys,
			schemaInputProps: nextInputProps,
			validationKeys: revalidationSchemaKeys,
			preserveValidatedValues: true,
			skipCustomValidation: true,
		});
		validateNormalizedSchemaValues(
			props,
			this.options.props,
			outputValidationKeys,
		);
		validateConsumerProps<P, SchemaInputs>(props, this.options.props, {
			schemaKeys: this.schemaValidated ? changedSchemaKeys : undefined,
			schemaValidatedKeys,
		});
		this.options.validate?.({ props });
	}

	private normalizeInputSnapshot(
		inputProps: Record<string, unknown>,
		onUserCallbackError?: (error: unknown) => never,
	): NormalizedPropSnapshot<P> {
		const initialProps = { ...inputProps } as P;
		const schemaValidatedKeys = prevalidateProvidedSchemaInputs(
			inputProps,
			initialProps,
			this.options.props,
		);
		const revalidationSchemaKeys = new Set(schemaValidatedKeys);
		const outputValidationKeys = new Set<string>();
		const props = normalizeConsumerProps<P, SchemaInputs>(
			initialProps,
			this.options.props,
			this.createPropContext(initialProps),
			{
				schemaValidatedKeys,
				outputValidationKeys,
				onUserCallbackError,
			},
		);

		return {
			props,
			schemaValidatedKeys,
			revalidationSchemaKeys,
			outputValidationKeys,
		};
	}

	private revalidateSchemaInputs(): void {
		if (this.revalidationSchemaKeys.size > 0) {
			validateConsumerProps<P, SchemaInputs>(this.props, this.options.props, {
				schemaKeys: this.revalidationSchemaKeys,
				schemaInputProps: this.inputProps,
				validationKeys: this.revalidationSchemaKeys,
				preserveValidatedValues: true,
				skipCustomValidation: true,
			});
		}

		validateNormalizedSchemaValues(
			this.props,
			this.options.props,
			this.outputValidationKeys,
		);
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
			const {
				nextInputProps,
				nextProps,
				revalidationSchemaKeys,
				outputValidationKeys,
			} = this.buildNextProps(newProps);
			const resolvedUrl = hooks.resolveUrl(nextProps);
			const nextHostOrigin = hooks.resolveUrlOrigin(resolvedUrl);
			hooks.assertStableRenderedOrigin(nextHostOrigin);
			hooks.assertActive();

			this.commitSnapshot({
				nextInputProps,
				nextProps,
				revalidationSchemaKeys,
				outputValidationKeys,
			});

			if (!hooks.isRendered()) {
				hooks.syncTrustedDomainForUrl(resolvedUrl);
			}

			if (hooks.shouldSendPropsToHost()) {
				await hooks.sendPropsUpdateToHost(nextProps);
			}
			hooks.assertActive();
			hooks.emitPropsUpdated(nextProps);
		}, hooks.shouldSendPropsToHost);
	}

	/** Commits only a completely validated, origin-checked candidate. */
	private commitSnapshot(snapshot: NextPropsSnapshot<P>): void {
		this.inputProps = snapshot.nextInputProps;
		this.props = snapshot.nextProps;
		this.schemaValidated = true;
		this.schemaValidatedKeys.clear();
		this.revalidationSchemaKeys = snapshot.revalidationSchemaKeys;
		this.outputValidationKeys = snapshot.outputValidationKeys;
		this.normalizationPending = false;
		this.pendingNormalizationError = undefined;
	}

	/**
	 * Queues a host synchronization for the current props snapshot.
	 *
	 * @remarks
	 * This shares the same serialization queue as updateProps so function bridge
	 * batches cannot overlap with user-initiated prop updates.
	 */
	syncCurrentPropsToHost(hooks: ConsumerPropsSyncHooks<P>): Promise<void> {
		return this.queuePropsUpdate(async () => {
			hooks.assertActive();
			this.revalidateSchemaValues();
			hooks.assertActive();
			if (hooks.shouldSendPropsToHost()) {
				await hooks.sendPropsUpdateToHost(this.props);
			}
		}, hooks.shouldSendPropsToHost);
	}

	/**
	 * Reads validated current props through the same queue as updates and host sync.
	 * The read follows settlement of earlier work, including rejected updates, so
	 * bootstrap serialization cannot overlap a preceding function-bridge batch.
	 */
	readCurrentProps<R>(read: (props: P) => R): Promise<R> {
		return this.queuePropsUpdate(
			async () => {
				this.revalidateSchemaValues();
				return read(this.props);
			},
			() => true,
		);
	}

	/**
	 * Queues prop updates when a previous host sync is in flight.
	 */
	private queuePropsUpdate<R>(
		updateFn: () => Promise<R>,
		shouldTrackFollowingUpdates: () => boolean,
	): Promise<R> {
		if (!this.pendingPropsUpdate) {
			if (!shouldTrackFollowingUpdates()) {
				return updateFn();
			}
			// Install the queue entry before invoking user decorators: they may
			// synchronously enqueue another update while this snapshot is built.
			const pending = createDeferred<R>();
			this.trackPendingUpdate(pending.promise);
			try {
				const immediateUpdate = updateFn();
				void immediateUpdate.then(pending.resolve, pending.reject);
				return immediateUpdate;
			} catch (error) {
				pending.reject(
					error instanceof Error ? error : new Error(String(error)),
				);
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
