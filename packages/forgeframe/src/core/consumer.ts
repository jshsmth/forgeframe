/**
 * @packageDocumentation
 * Consumer component implementation module.
 *
 * @remarks
 * This module contains the ConsumerComponent class which handles the consumer-side
 * (the app embedding the component) rendering and communication with host components
 * embedded in iframes or popups.
 */

import type {
  ComponentOptions,
  ConsumerPropsInput,
  ConsumerPropsUpdate,
  ForgeFrameComponentInstance,
} from '../types/runtime';
import type { ConsumerExports } from '../communication/types';
import type { ContextType } from '../constants';
import type { PropsDefinition } from '../types/props';
import type { Dimensions } from '../types/utility';
import { CONTEXT, EVENT, MESSAGE_NAME } from '../constants';
import { EventEmitter } from '../events/emitter';
import { generateUID } from '../utils/uid';
import { CleanupManager } from '../utils/cleanup';
import { createDeferred, type Deferred } from '../utils/promise';
import { registerWindow, unregisterWindow } from '../window/proxy';
import {
  propsToQueryParams,
  propsToBodyParams,
  isStandardSchema,
} from '../props';
import { EMPTY_PROP_DEFINITIONS } from '../props/definitions';
import { isSameDomain } from '../window/helpers';
import {
  emitConsumerError,
  invokePropCallback,
} from './consumer/callbacks';
import { buildNestedHostRefs } from './consumer/child-refs';
import {
  ConsumerPropsPipeline,
  type ConsumerPropsPipelineSnapshot,
  type ConsumerPropsUpdateHooks,
} from './consumer/props-pipeline';
import { ConsumerRenderer } from './consumer/renderer';
import { getSiblingInstances } from './consumer/siblings';
import { ConsumerTransport } from './consumer/transport';
import type { NormalizedOptions } from './consumer/types';
import { resolveComponentHostUrl } from '../utils/url';

/**
 * Registration callback used to track instances through their owning component.
 * @internal
 */
type ConsumerInstanceTracker<
  P extends Record<string, unknown>,
  X,
  I extends Record<string, unknown>,
> = (instance: ConsumerComponent<P, X, I>) => ConsumerComponent<P, X, I>;

/**
 * Consumer-side component implementation.
 *
 * @remarks
 * This class coordinates focused subsystems for rendering, transport, and
 * prop synchronization while preserving the existing public API.
 *
 * @typeParam P - The props type passed to the component
 * @typeParam X - The exports type that the host can expose to the consumer
 * @typeParam I - An alternate consumer input shape, such as legacy alias keys
 *
 * @internal
 */
export class ConsumerComponent<
  P extends Record<string, unknown>,
  X = unknown,
  I extends Record<string, unknown> = P,
> implements ForgeFrameComponentInstance<P, X, I>
{
  /** Event emitter for lifecycle events. */
  public event: EventEmitter;

  /** Arbitrary state storage for the component instance. */
  public state: Record<string, unknown> = {};

  /** Data exported by the host component. */
  public exports?: X;

  /** Data exported from the consumer by the host. */
  public consumerExports?: unknown;

  /** @internal */
  private _uid: string;

  /**
   * Unique instance identifier.
   * @readonly
   */
  public get uid(): string {
    return this._uid;
  }

  /** @internal */
  private options: NormalizedOptions<P>;

  /** @internal */
  private cleanup: CleanupManager;

  /** @internal */
  private transport!: ConsumerTransport<P, X>;

  /** @internal */
  private renderer!: ConsumerRenderer<P>;

  /** @internal */
  private propsPipeline!: ConsumerPropsPipeline<P>;

  /** @internal */
  private rendered = false;

  /** @internal */
  private renderPromise: Promise<void> | null = null;

  /** @internal */
  private activeRenderTask: Deferred<void> | null = null;

  /** @internal */
  private destroyed = false;

  /** @internal */
  private closing = false;

  /** @internal */
  private constructing = true;

  /** @internal */
  private constructionActions: Array<'close' | 'focus'> = [];

  /**
   * Creates a new ConsumerComponent instance.
   *
   * @param options - Component configuration options
   * @param props - Initial props to pass to the component
   * @param trackInstance - Owning component registration callback used for clones
   * @param propsSnapshot - Existing normalized pipeline state used by clones
   */
  constructor(
    options: ComponentOptions<P, I>,
    props?: ConsumerPropsInput<P, I>,
    private trackInstance?: ConsumerInstanceTracker<P, X, I>,
    propsSnapshot?: ConsumerPropsPipelineSnapshot<P>
  ) {
    this._uid = generateUID();
    this.options = this.normalizeOptions(options);

    this.event = new EventEmitter();
    this.cleanup = new CleanupManager();

    this.renderer = new ConsumerRenderer(
      this.options,
      this.uid,
      () => this.propsPipeline.props,
      () => this.resolveDimensions(),
      {
        close: () => this.close(),
        focus: () => this.focus(),
      }
    );

    this.propsPipeline = new ConsumerPropsPipeline(
      this.options,
      { ...props },
      (nextProps) => this.createPropContext(nextProps),
      propsSnapshot
    );

    this.transport = new ConsumerTransport(
      this.uid,
      this.options,
      () => this.resolveUrl(),
      (url) => this.resolveUrlOrigin(url)
    );

    this.setupMessageHandlers();
    this.setupCleanup();

    this.constructing = false;
    for (const action of this.constructionActions) {
      void this[action]();
    }
    this.constructionActions = [];
  }

  /**
   * Renders the component into a DOM container.
   *
   * @remarks
   * This is the primary method for displaying the component. It creates
   * an iframe or popup, establishes communication with the host, and
   * handles the prerender/render lifecycle.
   *
   * @param container - CSS selector or HTMLElement to render into
   * @param context - Override the default rendering context (iframe or popup)
   * @throws Error if component was already destroyed or rendered
   *
   * @example
   * ```typescript
   * await instance.render('#container');
   * await instance.render(document.getElementById('target'), 'popup');
   * ```
   */
  async render(
    container: string | HTMLElement,
    context?: ContextType
  ): Promise<void> {
    if (this.destroyed) {
      throw new Error('Component has been destroyed');
    }

    if (this.rendered) {
      throw new Error('Component has already been rendered');
    }

    if (this.renderPromise) {
      return this.renderPromise;
    }

    const renderTask = createDeferred<void>();
    const operation = renderTask.promise;
    this.renderPromise = operation;
    this.activeRenderTask = renderTask;
    void this.performRender(container, context).then(
      renderTask.resolve,
      renderTask.reject
    );
    try {
      await operation;
    } finally {
      if (this.activeRenderTask === renderTask) {
        this.activeRenderTask = null;
      }
      if (!this.rendered && !this.destroyed && this.renderPromise === operation) {
        this.renderPromise = null;
      }
    }
  }

  /** @internal */
  private async performRender(
    container: string | HTMLElement,
    context?: ContextType
  ): Promise<void> {
    this.renderer.context = context ?? this.options.defaultContext;

    this.propsPipeline.ensureSchemaValidated();
    this.assertRenderActive();
    this.options.validate?.({ props: this.propsPipeline.props });
    this.assertRenderActive();
    this.checkEligibility();
    this.assertRenderActive();

    let baseUrl: string;
    try {
      baseUrl = this.resolveUrl();
      this.assertRenderActive();
      this.transport.syncTrustedDomainForUrl(baseUrl);
    } catch (error) {
      await this.destroy().catch(() => undefined);
      throw error;
    }

    // Configuration/container guard failures remain retryable until rendering
    // has begun and resources may need lifecycle cleanup.
    this.renderer.container = this.resolveContainer(container);

    try {
      this.event.emit(EVENT.PRERENDER);
      this.assertRenderActive();
      invokePropCallback(
        this.propsPipeline.props as Record<string, unknown>,
        'onPrerender'
      );
      this.assertRenderActive();

      await this.prerender(baseUrl);
      this.assertRenderActive();

      this.event.emit(EVENT.PRERENDERED);
      this.assertRenderActive();
      invokePropCallback(
        this.propsPipeline.props as Record<string, unknown>,
        'onPrerendered'
      );
      this.assertRenderActive();

      this.event.emit(EVENT.RENDER);
      this.assertRenderActive();
      invokePropCallback(
        this.propsPipeline.props as Record<string, unknown>,
        'onRender'
      );
      this.assertRenderActive();

      this.assertRenderActive();
      await this.open(baseUrl);
      this.assertRenderActive();
      await this.waitForHost();
      this.assertRenderActive();
      if (this.renderer.context === CONTEXT.IFRAME && this.renderer.iframe) {
        await this.renderer.swapPrerenderContentIfNeeded();
        this.assertRenderActive();
      }

      this.rendered = true;

      this.event.emit(EVENT.RENDERED);
      this.assertRenderActive();
      invokePropCallback(
        this.propsPipeline.props as Record<string, unknown>,
        'onRendered'
      );
      this.assertRenderActive();

      this.event.emit(EVENT.DISPLAY);
      this.assertRenderActive();
      invokePropCallback(
        this.propsPipeline.props as Record<string, unknown>,
        'onDisplay'
      );
      this.assertRenderActive();
    } catch (err) {
      const renderWasCancelled = this.isRenderCancelled();
      await this.destroy().catch(() => undefined);
      if (renderWasCancelled) {
        this.teardownRenderResources();
        throw this.createRenderCancellationError();
      }
      throw err;
    }
  }

  /**
   * Renders the component into a container in a different window.
   *
   * @remarks
   * Only rendering into the current window is supported. Passing a
   * different window throws explicitly to prevent silent misuse.
   *
   * @param win - Target window
   * @param container - CSS selector or HTMLElement to render into
   * @param context - Override the default rendering context
   */
  async renderTo(
    win: Window,
    container: string | HTMLElement,
    context?: ContextType
  ): Promise<void> {
    if (win !== window) {
      throw new Error('Cross-window renderTo is not supported; pass the current window');
    }

    return this.render(container, context);
  }

  /**
   * Closes and destroys the component.
   *
   * @remarks
   * Emits the 'close' event before destruction. Safe to call multiple times.
   */
  async close(): Promise<void> {
    if (this.destroyed || this.closing) return;

    this.closing = true;
    this.activeRenderTask?.reject(this.createRenderCancellationError());

    try {
      const callbackProps = this.propsPipeline ? this.propsPipeline.props : ({} as P);
      this.event.emit(EVENT.CLOSE);
      invokePropCallback(callbackProps as Record<string, unknown>, 'onClose');

      await this.destroy();
    } finally {
      this.closing = false;
    }
  }

  /**
   * Focuses the component window.
   *
   * @remarks
   * For iframes, focuses the iframe element. For popups, brings the window to front.
   */
  async focus(): Promise<void> {
    const hostWindow = this.transport ? this.transport.hostWindow : null;
    const callbackProps = this.propsPipeline ? this.propsPipeline.props : ({} as P);

    this.renderer.focus(hostWindow);

    this.event.emit(EVENT.FOCUS);
    invokePropCallback(callbackProps as Record<string, unknown>, 'onFocus');
  }

  /**
   * Resizes the component to the specified dimensions.
   *
   * @param dimensions - New width and height for the component
   */
  async resize(dimensions: Dimensions): Promise<void> {
    const hostWindow = this.transport ? this.transport.hostWindow : null;
    const callbackProps = this.propsPipeline ? this.propsPipeline.props : ({} as P);

    this.renderer.resize(dimensions, hostWindow);

    this.event.emit(EVENT.RESIZE, dimensions);
    invokePropCallback(
      callbackProps as Record<string, unknown>,
      'onResize',
      dimensions
    );
  }

  /**
   * Shows the component if hidden.
   *
   * @remarks
   * Only applicable to iframe context.
   */
  async show(): Promise<void> {
    this.renderer.show();
  }

  /**
   * Hides the component.
   *
   * @remarks
   * Only applicable to iframe context.
   */
  async hide(): Promise<void> {
    this.renderer.hide();
  }

  /**
   * Updates the component props and sends them to the host.
   *
   * @remarks
   * Props are normalized and validated before being sent to the host window.
   *
   * @param newProps - Partial props object to merge with existing props
   */
  async updateProps(newProps: ConsumerPropsUpdate<P, I>): Promise<void> {
    if (this.renderPromise && !this.rendered) {
      throw new Error('Cannot update props while the component is rendering');
    }
    return this.applyPropsUpdate(newProps);
  }

  /**
   * Applies a props update and synchronizes it to the host when connected.
   * @internal
   */
  private async applyPropsUpdate(
    newProps: ConsumerPropsUpdate<P, I>
  ): Promise<void> {
    const hooks: ConsumerPropsUpdateHooks<P> = {
      resolveUrl: (nextProps) => this.resolveUrl(nextProps),
      resolveUrlOrigin: (url) => this.resolveUrlOrigin(url),
      assertStableRenderedOrigin: (nextHostOrigin) =>
        this.assertStableRenderedOrigin(nextHostOrigin),
      isRendered: () => this.rendered,
      syncTrustedDomainForUrl: (url) => this.syncTrustedDomainForUrl(url),
      shouldSendPropsToHost: () =>
        this.transport ? this.transport.isHostConnected() : false,
      sendPropsUpdateToHost: (nextProps) => this.sendPropsUpdateToHost(nextProps),
      emitPropsUpdated: (nextProps) => {
        this.event.emit(EVENT.PROPS, nextProps);
        invokePropCallback(
          nextProps as Record<string, unknown>,
          'onProps',
          nextProps
        );
      },
    };

    await this.propsPipeline.updateProps({ ...newProps }, hooks);
  }

  /**
   * Prevents origin changes after render for security and routing consistency.
   * @internal
   */
  private assertStableRenderedOrigin(nextHostOrigin: string | null): void {
    const openedHostDomain = this.transport?.openedHostDomain;

    if (
      (this.rendered || this.renderPromise !== null) &&
      openedHostDomain &&
      nextHostOrigin &&
      nextHostOrigin !== openedHostDomain
    ) {
      throw new Error(
        `Cannot change component URL origin after render (from "${openedHostDomain}" to "${nextHostOrigin}")`
      );
    }
  }

  /**
   * Sends the current props snapshot to the host window when available.
   * @internal
   */
  private async sendPropsUpdateToHost(nextProps: P): Promise<void> {
    if (!this.transport) {
      return;
    }

    await this.transport.sendPropsUpdateToHost(nextProps, this.options.props);
  }

  /**
   * Creates a clone of this instance with the same props.
   *
   * @returns A new unrendered component instance with identical configuration
   */
  clone(): ForgeFrameComponentInstance<P, X, I> {
    const cloned = new ConsumerComponent<P, X, I>(
      this.options as ComponentOptions<P, I>,
      undefined,
      this.trackInstance,
      this.propsPipeline.createSnapshot()
    );
    return this.trackInstance ? this.trackInstance(cloned) : cloned;
  }

  /** Returns whether construction or lifecycle callbacks destroyed this instance. @internal */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Checks if the component is eligible to render based on the eligible option.
   *
   * @returns True if eligible or no eligibility check defined
   */
  isEligible(): boolean {
    if (!this.options.eligible) return true;

    this.propsPipeline.ensureSchemaValidated();
    const result = this.options.eligible({ props: this.propsPipeline.props });
    return result.eligible;
  }

  /**
   * Normalizes component options with default values.
   * @internal
   */
  private normalizeOptions(options: ComponentOptions<P, I>): NormalizedOptions<P> {
    return {
      ...options,
      props:
        (options.props as PropsDefinition<P> | undefined) ??
        (EMPTY_PROP_DEFINITIONS as PropsDefinition<P>),
      defaultContext: options.defaultContext ?? CONTEXT.IFRAME,
      dimensions: options.dimensions ?? { width: '100%', height: '100%' },
      timeout: options.timeout ?? 10000,
      children: options.children,
    };
  }

  /**
   * Resolves the host URL from static or function options.
   * @internal
   */
  private resolveUrl(props?: P): string {
    if (props === undefined) {
      this.propsPipeline.revalidateSchemaValues();
    }
    const resolvedProps = props ?? this.propsPipeline.props;
    return typeof this.options.url === 'function'
      ? this.options.url(resolvedProps)
      : this.options.url;
  }

  /**
   * Resolves dimensions from static or function options.
   * @internal
   */
  private resolveDimensions(): Dimensions {
    this.propsPipeline.revalidateSchemaValues();
    return typeof this.options.dimensions === 'function'
      ? this.options.dimensions(this.propsPipeline.props)
      : this.options.dimensions;
  }

  /**
   * Resolves a URL to an origin, supporting relative URLs.
   * @internal
   */
  private resolveUrlOrigin(url: string): string | null {
    return resolveComponentHostUrl(
      url,
      window.location.origin,
      this.options.domain
    ).origin;
  }

  /**
   * Ensures the messenger trusts the origin for a resolved host URL.
   * @internal
   */
  private syncTrustedDomainForUrl(url: string): void {
    if (!this.transport) {
      this.resolveUrlOrigin(url);
      return;
    }

    this.transport.syncTrustedDomainForUrl(url);
  }

  /**
   * Creates the prop context passed to prop callbacks and validators.
   * @internal
   */
  private createPropContext(props?: P) {
    const contextProps = (props ?? this.propsPipeline?.props ?? ({} as P)) as P;

    return {
      props: contextProps,
      state: this.state,
      close: () => {
        if (this.constructing) {
          this.constructionActions.push('close');
          return Promise.resolve();
        }
        return this.close();
      },
      focus: () => {
        if (this.constructing) {
          this.constructionActions.push('focus');
          return Promise.resolve();
        }
        return this.focus();
      },
      onError: (err: Error) =>
        emitConsumerError(
          this.event,
          (this.propsPipeline?.props ?? contextProps) as Record<string, unknown>,
          err
        ),
      container: this.renderer.container,
      uid: this.uid,
      tag: this.options.tag,
    };
  }

  /**
   * Resolves a container selector or element to an HTMLElement.
   * @internal
   */
  private resolveContainer(container?: string | HTMLElement): HTMLElement {
    return this.renderer.resolveContainer(container);
  }

  /**
   * Checks eligibility and throws if component cannot render.
   * @internal
   */
  private checkEligibility(): void {
    if (!this.options.eligible) return;

    const result = this.options.eligible({ props: this.propsPipeline.props });
    if (!result.eligible) {
      throw new Error(`Component not eligible: ${result.reason ?? 'Unknown reason'}`);
    }
  }

  /**
   * Creates and displays the prerender (loading) content.
   * @internal
   */
  private async prerender(baseUrl: string = this.resolveUrl()): Promise<void> {
    await this.renderer.prerender(
      (windowName) => this.createIframeElement(windowName),
      () => this.buildWindowName(baseUrl),
      () => this.assertRenderActive()
    );
  }

  /**
   * Creates an iframe element without setting src (for prerender phase).
   * The window name is set immediately as it carries the payload for the host.
   * @internal
   */
  private createIframeElement(windowName: string): HTMLIFrameElement {
    return this.renderer.createIframeElement(windowName);
  }

  /**
   * Opens the host window (iframe or popup).
   * @internal
   */
  private async open(baseUrl: string = this.resolveUrl()): Promise<void> {
    this.syncTrustedDomainForUrl(baseUrl);
    this.transport.openedHostDomain = this.resolveUrlOrigin(baseUrl);
    this.transport.activeHostDomain = null;

    this.transport.hostWindow = this.renderer.open({
      baseUrl,
      assertActive: () => this.assertRenderActive(),
      buildUrl: (resolvedBaseUrl) => this.buildUrl(resolvedBaseUrl),
      buildBodyParams: () => this.buildBodyParams(baseUrl),
      buildWindowName: () => this.buildWindowName(baseUrl),
      submitBodyForm: (target, actionUrl, params) =>
        this.submitBodyForm(target, actionUrl, params),
      onPopupClose: () => {
        void this.close();
      },
      registerCleanup: (cleanupFn) => {
        this.cleanup.register(cleanupFn);
      },
    });

    if (this.transport.hostWindow) {
      registerWindow(this.uid, this.transport.hostWindow);
    }
  }

  /**
   * Builds the URL for the host window including query parameters.
   * @internal
   */
  private buildUrl(baseUrl: string = this.resolveUrl()): string {
    this.propsPipeline.revalidateSchemaValues();
    const hostDomain = this.resolveUrlOrigin(baseUrl);
    const queryParams = propsToQueryParams(
      this.propsPipeline.props,
      this.options.props,
      hostDomain ?? ''
    );
    const queryString = queryParams.toString();

    if (!queryString) return baseUrl;

    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${queryString}`;
  }

  /**
   * Builds POST body parameters from props marked with bodyParam.
   * @internal
   */
  private buildBodyParams(baseUrl: string = this.resolveUrl()): URLSearchParams {
    this.propsPipeline.revalidateSchemaValues();
    const hostDomain = this.resolveUrlOrigin(baseUrl);
    return propsToBodyParams(
      this.propsPipeline.props,
      this.options.props,
      hostDomain ?? ''
    );
  }

  /**
   * Submits a hidden form to navigate a target window via POST.
   * @internal
   */
  private submitBodyForm(
    target: string,
    actionUrl: string,
    params: URLSearchParams
  ): void {
    this.renderer.submitBodyForm(target, actionUrl, params);
  }

  /**
   * Builds the window.name payload for the host window.
   * @internal
   */
  private buildWindowName(baseUrl: string = this.resolveUrl()): string {
    this.propsPipeline.revalidateSchemaValues();
    return this.transport.buildWindowName({
      tag: this.options.tag,
      context: this.renderer.context,
      props: this.propsPipeline.props,
      propDefinitions: this.options.props,
      hostDomain: this.resolveUrlOrigin(baseUrl) ?? '*',
      children: buildNestedHostRefs(this.options, this.propsPipeline.props),
      exports: this.createConsumerExports(),
    });
  }

  /** Legacy protocol-v1 bootstrap metadata retained for mixed-version hosts. @internal */
  private createConsumerExports(): ConsumerExports {
    return {
      init: MESSAGE_NAME.INIT,
      close: MESSAGE_NAME.CLOSE,
      resize: MESSAGE_NAME.RESIZE,
      show: MESSAGE_NAME.SHOW,
      hide: MESSAGE_NAME.HIDE,
      onError: MESSAGE_NAME.ERROR,
      updateProps: MESSAGE_NAME.PROPS,
      export: MESSAGE_NAME.EXPORT,
    };
  }

  /**
   * Waits for the host to send the init message.
   * @internal
   */
  private async waitForHost(): Promise<void> {
    await this.transport.waitForHost(
      this.options.timeout,
      this.options.tag,
      (error) => {
        if (!this.isRenderCancelled()) {
          emitConsumerError(
            this.event,
            this.propsPipeline.props as Record<string, unknown>,
            error
          );
        }
      }
    );
  }

  /** Returns an error describing intentional cancellation of an in-flight render. @internal */
  private createRenderCancellationError(): Error {
    return new Error(
      `Component "${this.options.tag}" was closed before rendering completed`
    );
  }

  /** Returns whether close/destroy has cancelled the active render operation. @internal */
  private isRenderCancelled(): boolean {
    return this.closing || this.destroyed;
  }

  /** Stops a cancelled render before it can advance to another lifecycle stage. @internal */
  private assertRenderActive(): void {
    if (!this.isRenderCancelled()) {
      return;
    }

    this.teardownRenderResources();
    throw this.createRenderCancellationError();
  }

  /**
   * Sets up message handlers for host communication.
   * @internal
   */
  private setupMessageHandlers(): void {
    this.transport.setupMessageHandlers({
      onInit: () => this.syncSameDomainPropsAfterInit(),
      onClose: async () => this.close(),
      onResize: async (dimensions) => this.resize(dimensions),
      onFocus: async () => this.focus(),
      onShow: async () => this.show(),
      onHide: async () => this.hide(),
      onError: (error) =>
        emitConsumerError(
          this.event,
          this.propsPipeline.props as Record<string, unknown>,
          error
        ),
      onExport: (exports) => {
        this.exports = exports;
      },
      onConsumerExport: (data) => {
        this.consumerExports = data;
      },
      onGetSiblings: (request) => getSiblingInstances(request),
    });
  }

  /**
   * Synchronizes sameDomain props after the host proves its loaded origin via INIT.
   * @internal
   */
  private async syncSameDomainPropsAfterInit(): Promise<void> {
    if (!this.transport.hostWindow || !this.transport.isHostConnected()) {
      return;
    }

    if (!isSameDomain(this.transport.hostWindow)) {
      return;
    }

    if (!this.hasSameDomainPropDefinition()) {
      return;
    }

    try {
      await this.propsPipeline.syncCurrentPropsToHost({
        shouldSendPropsToHost: () => this.transport.isHostConnected(),
        sendPropsUpdateToHost: (nextProps) => this.sendPropsUpdateToHost(nextProps),
      });
    } catch (error) {
      emitConsumerError(
        this.event,
        this.propsPipeline.props as Record<string, unknown>,
        error as Error
      );
    }
  }

  /**
   * Returns true when any prop definition is restricted to same-origin hosts.
   * @internal
   */
  private hasSameDomainPropDefinition(): boolean {
    return Object.values(this.options.props).some((definition) => {
      if (!definition || isStandardSchema(definition)) {
        return false;
      }

      return definition.sameDomain === true;
    });
  }

  /**
   * Registers cleanup handlers for the instance.
   * @internal
   */
  private setupCleanup(): void {
    this.cleanup.register(() => {
      this.transport.destroy();
      unregisterWindow(this.uid);
    });
  }

  /**
   * Removes render artifacts, including resources created after destroy began.
   * Safe to call repeatedly while an asynchronous render unwinds.
   * @internal
   */
  private teardownRenderResources(): void {
    const hostWindow = this.transport ? this.transport.hostWindow : null;

    if (this.renderer) {
      this.renderer.destroy(hostWindow);
    }
    unregisterWindow(this.uid);

    if (this.transport) {
      this.transport.hostWindow = null;
      this.transport.openedHostDomain = null;
      this.transport.activeHostDomain = null;
      this.transport.dynamicUrlTrustedOrigin = null;
    }
  }

  /**
   * Destroys the component and cleans up all resources.
   * @internal
   */
  private async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    const callbackProps = this.propsPipeline ? this.propsPipeline.props : ({} as P);
    if (this.transport && this.transport.initPromise) {
      this.transport.initPromise.reject(
        new Error(
          `Component "${this.options.tag}" was destroyed before initialization completed`
        )
      );
      this.transport.initPromise = null;
    }
    if (this.transport) {
      this.transport.hostInitialized = false;
    }

    this.teardownRenderResources();
    if (this.propsPipeline) {
      this.propsPipeline.pendingPropsUpdate = null;
    }

    await this.cleanup.cleanup();

    this.event.emit(EVENT.DESTROY);
    invokePropCallback(callbackProps as Record<string, unknown>, 'onDestroy');
    this.event.removeAllListeners();
  }
}
