import {
  materializePropAliases,
  normalizeConsumerProps,
  validateConsumerProps,
} from '../../props/normalize';
import type { PropContext } from '../../types/props';
import type { NormalizedOptions } from './types';

/** Internal marker used by framework drivers to restore an omitted prop. @internal */
export const PROP_RESET = Symbol('forgeframe.prop-reset');

const hasOwnDefinedValue = (
  props: Readonly<Record<string, unknown>>,
  key: string
): boolean =>
  Object.prototype.hasOwnProperty.call(props, key) && props[key] !== undefined;

/**
 * Hooks used by the props pipeline to coordinate host synchronization behavior.
 * @internal
 */
export interface ConsumerPropsUpdateHooks<P extends Record<string, unknown>> {
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
  shouldSendPropsToHost: () => boolean;
  sendPropsUpdateToHost: (nextProps: P) => Promise<void>;
}

function prevalidateProvidedSchemaInputs<
  P extends Record<string, unknown>,
  SchemaInputs,
>(
  inputProps: Record<string, unknown>,
  props: P,
  definitions: NormalizedOptions<P, SchemaInputs>['props'],
  candidateKeys = new Set(
    Object.entries(inputProps)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key)
  )
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
  definitions: NormalizedOptions<P, SchemaInputs>['props'],
  schemaKeys: ReadonlySet<string>
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
export interface ConsumerPropsPipelineSnapshot<P extends Record<string, unknown>> {
  props: P;
  inputProps: Record<string, unknown>;
  normalizationPending: boolean;
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
  public props: P;

  /** Last input props snapshot prior to normalization. */
  public inputProps: Record<string, unknown>;

  /** Whether every current schema-backed value has been converted to output form. */
  private schemaValidated: boolean;

  /** Values already produced by probing a schema with `undefined`. */
  private schemaValidatedKeys: Set<string>;

  /** Defined raw schema inputs to recheck at each trust boundary. */
  private revalidationSchemaKeys: Set<string>;

  /** Normalized values that have a safe trust-boundary validation schema. */
  private outputValidationKeys: Set<string>;

  /** Whether custom normalization is waiting for valid schema outputs. */
  private normalizationPending = false;

  /** Active in-flight update chain when host synchronization is occurring. */
  public pendingPropsUpdate: Promise<void> | null = null;

  constructor(
    private options: NormalizedOptions<P, SchemaInputs>,
    initialInputProps: Record<string, unknown>,
    private createPropContext: (props: P) => PropContext<P>,
    snapshot?: ConsumerPropsPipelineSnapshot<P>
  ) {
    if (snapshot) {
      this.inputProps = { ...snapshot.inputProps };
      this.props = { ...snapshot.props };
      this.normalizationPending = snapshot.normalizationPending;
      this.schemaValidated = snapshot.schemaValidated;
      this.schemaValidatedKeys = new Set(snapshot.schemaValidatedKeys);
      this.revalidationSchemaKeys = new Set(snapshot.revalidationSchemaKeys);
      this.outputValidationKeys = new Set(snapshot.outputValidationKeys);
      return;
    }

    this.inputProps = materializePropAliases<P, SchemaInputs>(
      initialInputProps,
      this.options.props
    ) as Record<string, unknown>;
    try {
      const normalizedState = this.normalizeInputSnapshot(this.inputProps);
      this.props = normalizedState.props;
      this.schemaValidatedKeys = normalizedState.schemaValidatedKeys;
      this.revalidationSchemaKeys = normalizedState.revalidationSchemaKeys;
      this.outputValidationKeys = normalizedState.outputValidationKeys;
    } catch {
      this.normalizationPending = true;
      this.schemaValidatedKeys = new Set<string>();
      this.revalidationSchemaKeys = new Set<string>();
      this.outputValidationKeys = new Set<string>();
      const initialProps = { ...this.inputProps } as P;
      this.props = normalizeConsumerProps<P, SchemaInputs>(
        initialProps,
        this.options.props,
        this.createPropContext(initialProps),
        {
          schemaValidatedKeys: this.schemaValidatedKeys,
          outputValidationKeys: this.outputValidationKeys,
          deferCustomNormalization: true,
        }
      );
    }
    this.schemaValidated = false;
  }

  /** Returns an isolated snapshot suitable for constructing a clone. */
  createSnapshot(): ConsumerPropsPipelineSnapshot<P> {
    return {
      props: { ...this.props },
      inputProps: { ...this.inputProps },
      normalizationPending: this.normalizationPending,
      schemaValidated: this.schemaValidated,
      schemaValidatedKeys: new Set(this.schemaValidatedKeys),
      revalidationSchemaKeys: new Set(this.revalidationSchemaKeys),
      outputValidationKeys: new Set(this.outputValidationKeys),
    };
  }

  /** Converts every current schema input to its normalized output exactly once. */
  ensureSchemaValidated(): void {
    if (this.normalizationPending) {
      const normalizedState = this.normalizeInputSnapshot(this.inputProps);
      this.props = normalizedState.props;
      this.schemaValidatedKeys = normalizedState.schemaValidatedKeys;
      this.revalidationSchemaKeys = normalizedState.revalidationSchemaKeys;
      this.outputValidationKeys = normalizedState.outputValidationKeys;
      this.normalizationPending = false;
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
   * Builds and validates the next props snapshot.
   */
  buildNextProps(newProps: Record<string, unknown>): {
    nextInputProps: Record<string, unknown>;
    nextProps: P;
    revalidationSchemaKeys: Set<string>;
    outputValidationKeys: Set<string>;
  } {
    const materializedNewProps = materializePropAliases<P, SchemaInputs>(
      newProps,
      this.options.props,
      PROP_RESET
    );
    const nextInputProps = { ...this.inputProps } as Record<string, unknown>;
    const changedSchemaKeys = new Set(Object.keys(materializedNewProps));

    for (const [key, value] of Object.entries(materializedNewProps)) {
      if (value === PROP_RESET) {
        Reflect.deleteProperty(nextInputProps, key);
        continue;
      }

      nextInputProps[key] = value;
    }

    if (this.normalizationPending) {
      const normalizedState = this.normalizeInputSnapshot(nextInputProps);
      validateNormalizedSchemaValues(
        normalizedState.props,
        this.options.props,
        normalizedState.outputValidationKeys
      );
      validateConsumerProps<P, SchemaInputs>(
        normalizedState.props,
        this.options.props,
        {
          schemaValidatedKeys: normalizedState.schemaValidatedKeys,
        }
      );
      this.options.validate?.({ props: normalizedState.props });
      return {
        nextInputProps,
        nextProps: normalizedState.props,
        revalidationSchemaKeys: normalizedState.revalidationSchemaKeys,
        outputValidationKeys: normalizedState.outputValidationKeys,
      };
    }

    const mergedProps = { ...this.props } as Record<string, unknown>;
    const schemaValidatedKeys = new Set(this.schemaValidatedKeys);
    const outputValidationKeys = new Set(this.outputValidationKeys);

    for (const [key, value] of Object.entries(materializedNewProps)) {
      schemaValidatedKeys.delete(key);
      outputValidationKeys.delete(key);

      if (value === PROP_RESET) {
        Reflect.deleteProperty(mergedProps, key);
        continue;
      }

      mergedProps[key] = value;
    }

    const providedChangedSchemaKeys = new Set(
      [...changedSchemaKeys].filter(
        (key) => hasOwnDefinedValue(nextInputProps, key)
      )
    );
    prevalidateProvidedSchemaInputs(
      nextInputProps,
      mergedProps as P,
      this.options.props,
      providedChangedSchemaKeys
    );
    for (const key of providedChangedSchemaKeys) {
      schemaValidatedKeys.add(key);
    }

    const propContext = this.createPropContext(mergedProps as P);
    const normalizedSchemaKeys = new Set(schemaValidatedKeys);
    const nextProps = normalizeConsumerProps<P, SchemaInputs>(
      mergedProps as P,
      this.options.props,
      propContext,
      {
        schemaValidatedKeys: normalizedSchemaKeys,
        outputValidationKeys,
        decorateKeys: changedSchemaKeys,
        fallbackKeys: changedSchemaKeys,
      }
    );
    for (const key of normalizedSchemaKeys) {
      schemaValidatedKeys.add(key);
    }

    const revalidationSchemaKeys = new Set(
      Object.keys(nextInputProps).filter((key) =>
        hasOwnDefinedValue(nextInputProps, key)
      )
    );
    validateConsumerProps<P, SchemaInputs>(nextProps, this.options.props, {
      schemaKeys: revalidationSchemaKeys,
      schemaInputProps: nextInputProps,
      validationKeys: revalidationSchemaKeys,
      preserveValidatedValues: true,
      skipCustomValidation: true,
    });

    validateNormalizedSchemaValues(
      nextProps,
      this.options.props,
      outputValidationKeys
    );

    validateConsumerProps<P, SchemaInputs>(nextProps, this.options.props, {
      schemaKeys: this.schemaValidated ? changedSchemaKeys : undefined,
      schemaValidatedKeys,
    });
    this.options.validate?.({ props: nextProps });
    return {
      nextInputProps,
      nextProps,
      revalidationSchemaKeys,
      outputValidationKeys,
    };
  }

  private normalizeInputSnapshot(inputProps: Record<string, unknown>): {
    props: P;
    schemaValidatedKeys: Set<string>;
    revalidationSchemaKeys: Set<string>;
    outputValidationKeys: Set<string>;
  } {
    const initialProps = { ...inputProps } as P;
    const schemaValidatedKeys = prevalidateProvidedSchemaInputs(
      inputProps,
      initialProps,
      this.options.props
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
      }
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
      this.outputValidationKeys
    );
  }

  /**
   * Applies a props update and synchronizes it to the host when connected.
   */
  updateProps(
    newProps: Record<string, unknown>,
    hooks: ConsumerPropsUpdateHooks<P>
  ): Promise<void> {
    return this.queuePropsUpdate(async () => {
      const {
        nextInputProps,
        nextProps,
        revalidationSchemaKeys,
        outputValidationKeys,
      } =
        this.buildNextProps(newProps);
      const resolvedUrl = hooks.resolveUrl(nextProps);
      const nextHostOrigin = hooks.resolveUrlOrigin(resolvedUrl);
      hooks.assertStableRenderedOrigin(nextHostOrigin);

      this.inputProps = nextInputProps;
      this.props = nextProps;
      this.schemaValidated = true;
      this.schemaValidatedKeys.clear();
      this.revalidationSchemaKeys = revalidationSchemaKeys;
      this.outputValidationKeys = outputValidationKeys;
      this.normalizationPending = false;

      if (!hooks.isRendered()) {
        hooks.syncTrustedDomainForUrl(resolvedUrl);
      }

      if (hooks.shouldSendPropsToHost()) {
        await hooks.sendPropsUpdateToHost(nextProps);
      }
      hooks.emitPropsUpdated(nextProps);
    }, hooks.shouldSendPropsToHost);
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
      this.revalidateSchemaValues();
      if (hooks.shouldSendPropsToHost()) {
        await hooks.sendPropsUpdateToHost(this.props);
      }
    }, hooks.shouldSendPropsToHost);
  }

  /**
   * Queues prop updates when a previous host sync is in flight.
   */
  private queuePropsUpdate(
    updateFn: () => Promise<void>,
    shouldTrackFollowingUpdates: () => boolean
  ): Promise<void> {
    if (!this.pendingPropsUpdate) {
      const immediateUpdate = updateFn();
      if (shouldTrackFollowingUpdates()) {
        this.trackPendingUpdate(immediateUpdate);
      }
      return immediateUpdate;
    }

    const queuedUpdate = this.pendingPropsUpdate.then(updateFn, updateFn);
    this.trackPendingUpdate(queuedUpdate);
    return queuedUpdate;
  }

  /**
   * Tracks a promise as the active queued update and clears it when settled.
   */
  private trackPendingUpdate(updatePromise: Promise<void>): void {
    const settledUpdate = updatePromise.then(
      () => undefined,
      () => undefined
    );

    this.pendingPropsUpdate = settledUpdate;

    settledUpdate.finally(() => {
      if (this.pendingPropsUpdate === settledUpdate) {
        this.pendingPropsUpdate = null;
      }
    });
  }
}
