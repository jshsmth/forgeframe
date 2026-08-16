import { normalizeProps, validateProps } from '../../props';
import { materializePropAliases } from '../../props/normalize';
import type { PropContext } from '../../types/props';
import type { NormalizedOptions } from './types';

/** Internal marker used by framework drivers to restore an omitted prop. @internal */
export const PROP_RESET = Symbol('forgeframe.prop-reset');

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

/**
 * Owns consumer prop normalization, validation, and update queueing.
 * @internal
 */
export class ConsumerPropsPipeline<P extends Record<string, unknown>> {
  /** Current normalized prop snapshot. */
  public props: P;

  /** Last input props snapshot prior to normalization. */
  public inputProps: Partial<P>;

  /** Active in-flight update chain when host synchronization is occurring. */
  public pendingPropsUpdate: Promise<void> | null = null;

  constructor(
    private options: NormalizedOptions<P>,
    initialInputProps: Record<string, unknown>,
    private createPropContext: (props: P) => PropContext<P>
  ) {
    this.inputProps = materializePropAliases(
      initialInputProps,
      this.options.props
    );
    const initialProps = this.inputProps as P;
    const propContext = this.createPropContext(initialProps);
    this.props = normalizeProps(initialProps, this.options.props, propContext);
  }

  /**
   * Builds and validates the next props snapshot.
   */
  buildNextProps(newProps: Record<string, unknown>): {
    nextInputProps: Partial<P>;
    nextProps: P;
  } {
    const materializedNewProps = materializePropAliases(
      newProps,
      this.options.props,
      PROP_RESET
    );
    const nextInputProps = { ...this.inputProps } as Record<string, unknown>;
    const mergedProps = { ...this.props } as Record<string, unknown>;

    for (const [key, value] of Object.entries(materializedNewProps)) {
      if (value === PROP_RESET) {
        Reflect.deleteProperty(nextInputProps, key);
        Reflect.deleteProperty(mergedProps, key);
        continue;
      }

      nextInputProps[key] = value;
      mergedProps[key] = value;
    }

    const propContext = this.createPropContext(mergedProps as P);
    const nextProps = normalizeProps(
      mergedProps as P,
      this.options.props,
      propContext
    );
    validateProps(nextProps, this.options.props);
    this.options.validate?.({ props: nextProps });
    return { nextInputProps: nextInputProps as Partial<P>, nextProps };
  }

  /**
   * Applies a props update and synchronizes it to the host when connected.
   */
  updateProps(
    newProps: Record<string, unknown>,
    hooks: ConsumerPropsUpdateHooks<P>
  ): Promise<void> {
    return this.queuePropsUpdate(async () => {
      const { nextInputProps, nextProps } = this.buildNextProps(newProps);
      const resolvedUrl = hooks.resolveUrl(nextProps);
      const nextHostOrigin = hooks.resolveUrlOrigin(resolvedUrl);
      hooks.assertStableRenderedOrigin(nextHostOrigin);

      this.inputProps = nextInputProps;
      this.props = nextProps;

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
