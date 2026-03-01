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
  ForgeFrameComponentInstance,
  Dimensions,
  PropsDefinition,
  ConsumerExports,
  SiblingInfo,
  GetPeerInstancesOptions,
  HostComponentRef,
} from '../types';
import type { ContextType } from '../constants';
import { CONTEXT, EVENT, MESSAGE_NAME } from '../constants';
import { EventEmitter } from '../events/emitter';
import { generateUID } from '../utils/uid';
import { CleanupManager } from '../utils/cleanup';
import { createDeferred } from '../utils/promise';
import { registerWindow, unregisterWindow } from '../window/proxy';
import {
  validateProps,
  propsToQueryParams,
  propsToBodyParams,
} from '../props';
import {
  getComponent,
  getComponentOptions,
  getRegisteredComponents,
} from './component';
import {
  ConsumerPropsPipeline,
  type ConsumerPropsUpdateHooks,
} from './consumer/props-pipeline';
import { ConsumerRenderer } from './consumer/renderer';
import { ConsumerTransport } from './consumer/transport';
import type { NormalizedOptions } from './consumer/types';

/**
 * Consumer-side component implementation.
 *
 * @remarks
 * This class coordinates focused subsystems for rendering, transport, and
 * prop synchronization while preserving the existing public API.
 *
 * @typeParam P - The props type passed to the component
 * @typeParam X - The exports type that the host can expose to the consumer
 *
 * @example
 * ```typescript
 * const instance = new ConsumerComponent(options, { email: 'user@example.com' });
 * await instance.render('#container');
 * ```
 *
 * @public
 */
export class ConsumerComponent<P extends Record<string, unknown>, X = unknown>
  implements ForgeFrameComponentInstance<P, X>
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
  private destroyed = false;

  /** @internal */
  private get props(): P {
    return this.propsPipeline ? this.propsPipeline.props : ({} as P);
  }

  /** @internal */
  private set props(value: P) {
    if (this.propsPipeline) {
      this.propsPipeline.props = value;
    }
  }

  /** @internal */
  private get inputProps(): Partial<P> {
    return this.propsPipeline ? this.propsPipeline.inputProps : {};
  }

  /** @internal */
  private set inputProps(value: Partial<P>) {
    if (this.propsPipeline) {
      this.propsPipeline.inputProps = value;
    }
  }

  /** @internal */
  private get pendingPropsUpdate(): Promise<void> | null {
    return this.propsPipeline ? this.propsPipeline.pendingPropsUpdate : null;
  }

  /** @internal */
  private set pendingPropsUpdate(value: Promise<void> | null) {
    if (this.propsPipeline) {
      this.propsPipeline.pendingPropsUpdate = value;
    }
  }

  /** @internal */
  private get context(): ContextType {
    return this.renderer ? this.renderer.context : this.options.defaultContext;
  }

  /** @internal */
  private set context(value: ContextType) {
    if (this.renderer) {
      this.renderer.context = value;
    }
  }

  /** @internal */
  private get hostWindow(): Window | null {
    return this.transport ? this.transport.hostWindow : null;
  }

  /** @internal */
  private set hostWindow(value: Window | null) {
    if (this.transport) {
      this.transport.hostWindow = value;
    }
  }

  /** @internal */
  private get openedHostDomain(): string | null {
    return this.transport ? this.transport.openedHostDomain : null;
  }

  /** @internal */
  private set openedHostDomain(value: string | null) {
    if (this.transport) {
      this.transport.openedHostDomain = value;
    }
  }

  /** @internal */
  private get dynamicUrlTrustedOrigin(): string | null {
    return this.transport ? this.transport.dynamicUrlTrustedOrigin : null;
  }

  /** @internal */
  private set dynamicUrlTrustedOrigin(value: string | null) {
    if (this.transport) {
      this.transport.dynamicUrlTrustedOrigin = value;
    }
  }

  /** @internal */
  private get iframe(): HTMLIFrameElement | null {
    return this.renderer ? this.renderer.iframe : null;
  }

  /** @internal */
  private set iframe(value: HTMLIFrameElement | null) {
    if (this.renderer) {
      this.renderer.iframe = value;
    }
  }

  /** @internal */
  private get container(): HTMLElement | null {
    return this.renderer ? this.renderer.container : null;
  }

  /** @internal */
  private set container(value: HTMLElement | null) {
    if (this.renderer) {
      this.renderer.container = value;
    }
  }

  /** @internal */
  private get prerenderElement(): HTMLElement | null {
    return this.renderer ? this.renderer.prerenderElement : null;
  }

  /** @internal */
  private set prerenderElement(value: HTMLElement | null) {
    if (this.renderer) {
      this.renderer.prerenderElement = value;
    }
  }

  /** @internal */
  private get initPromise(): ReturnType<typeof createDeferred<void>> | null {
    return this.transport ? this.transport.initPromise : null;
  }

  /** @internal */
  private set initPromise(value: ReturnType<typeof createDeferred<void>> | null) {
    if (this.transport) {
      this.transport.initPromise = value;
    }
  }

  /** @internal */
  private get hostInitialized(): boolean {
    return this.transport ? this.transport.hostInitialized : false;
  }

  /** @internal */
  private set hostInitialized(value: boolean) {
    if (this.transport) {
      this.transport.hostInitialized = value;
    }
  }

  /** @internal */
  private get messenger() {
    if (!this.transport) {
      throw new Error('Consumer transport is not initialized');
    }
    return this.transport.messenger;
  }

  /** @internal */
  private get bridge() {
    if (!this.transport) {
      throw new Error('Consumer transport is not initialized');
    }
    return this.transport.bridge;
  }

  /**
   * Creates a new ConsumerComponent instance.
   *
   * @param options - Component configuration options
   * @param props - Initial props to pass to the component
   */
  constructor(options: ComponentOptions<P>, props: Partial<P> = {}) {
    this._uid = generateUID();
    this.options = this.normalizeOptions(options);

    this.event = new EventEmitter();
    this.cleanup = new CleanupManager();

    this.renderer = new ConsumerRenderer(
      this.options,
      this.uid,
      () => this.props,
      () => this.resolveDimensions(),
      {
        close: () => this.close(),
        focus: () => this.focus(),
      }
    );

    this.propsPipeline = new ConsumerPropsPipeline(
      this.options,
      { ...props },
      (nextProps) => this.createPropContext(nextProps)
    );

    this.transport = new ConsumerTransport(
      this.uid,
      this.options,
      () => this.resolveUrl(),
      (url) => this.resolveUrlOrigin(url)
    );

    this.setupMessageHandlers();
    this.setupCleanup();
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
    container?: string | HTMLElement,
    context?: ContextType
  ): Promise<void> {
    if (this.destroyed) {
      throw new Error('Component has been destroyed');
    }

    if (this.rendered) {
      throw new Error('Component has already been rendered');
    }

    this.context = context ?? this.options.defaultContext;

    this.checkEligibility();
    validateProps(this.props, this.options.props);
    this.options.validate?.({ props: this.props });
    this.container = this.resolveContainer(container);

    this.event.emit(EVENT.PRERENDER);
    this.callPropCallback('onPrerender');

    await this.prerender();

    this.event.emit(EVENT.PRERENDERED);
    this.callPropCallback('onPrerendered');

    this.event.emit(EVENT.RENDER);
    this.callPropCallback('onRender');

    try {
      await this.open();
      await this.waitForHost();
      if (this.context === CONTEXT.IFRAME && this.iframe && this.prerenderElement) {
        await this.renderer.swapPrerenderContentIfNeeded();
      }
    } catch (err) {
      await this.destroy().catch(() => undefined);
      throw err;
    }

    this.rendered = true;

    this.event.emit(EVENT.RENDERED);
    this.callPropCallback('onRendered');

    this.event.emit(EVENT.DISPLAY);
    this.callPropCallback('onDisplay');
  }

  /**
   * Renders the component into a container in a different window.
   *
   * @remarks
   * Currently delegates to regular render. Full cross-window rendering
   * would require additional complexity.
   *
   * @param _win - Target window (currently unused)
   * @param container - CSS selector or HTMLElement to render into
   * @param context - Override the default rendering context
   */
  async renderTo(
    _win: Window,
    container?: string | HTMLElement,
    context?: ContextType
  ): Promise<void> {
    return this.render(container, context);
  }

  /**
   * Closes and destroys the component.
   *
   * @remarks
   * Emits the 'close' event before destruction. Safe to call multiple times.
   */
  async close(): Promise<void> {
    if (this.destroyed) return;

    this.event.emit(EVENT.CLOSE);

    await this.destroy();
  }

  /**
   * Focuses the component window.
   *
   * @remarks
   * For iframes, focuses the iframe element. For popups, brings the window to front.
   */
  async focus(): Promise<void> {
    this.renderer.focus(this.hostWindow);

    this.event.emit(EVENT.FOCUS);
    this.callPropCallback('onFocus');
  }

  /**
   * Resizes the component to the specified dimensions.
   *
   * @param dimensions - New width and height for the component
   */
  async resize(dimensions: Dimensions): Promise<void> {
    this.renderer.resize(dimensions, this.hostWindow);

    this.event.emit(EVENT.RESIZE, dimensions);
    this.callPropCallback('onResize', dimensions);
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
  async updateProps(newProps: Partial<P>): Promise<void> {
    return this.applyPropsUpdate(newProps);
  }

  /**
   * Applies a props update and synchronizes it to the host when connected.
   * @internal
   */
  private async applyPropsUpdate(newProps: Partial<P>): Promise<void> {
    const hooks: ConsumerPropsUpdateHooks<P> = {
      resolveUrl: (nextProps) => this.resolveUrl(nextProps),
      resolveUrlOrigin: (url) => this.resolveUrlOrigin(url),
      assertStableRenderedOrigin: (nextHostOrigin) =>
        this.assertStableRenderedOrigin(nextHostOrigin),
      isRendered: () => this.rendered,
      syncTrustedDomainForUrl: (url) => this.syncTrustedDomainForUrl(url),
      shouldSendPropsToHost: () => this.transport.isHostConnected(),
      sendPropsUpdateToHost: (nextProps) => this.sendPropsUpdateToHost(nextProps),
      emitPropsUpdated: () => this.emitPropsUpdated(),
    };

    await this.propsPipeline.updateProps(newProps, hooks);
  }

  /**
   * Prevents origin changes after render for security and routing consistency.
   * @internal
   */
  private assertStableRenderedOrigin(nextHostOrigin: string | null): void {
    if (
      this.rendered &&
      this.openedHostDomain &&
      nextHostOrigin &&
      nextHostOrigin !== this.openedHostDomain
    ) {
      throw new Error(
        `Cannot change component URL origin after render (from "${this.openedHostDomain}" to "${nextHostOrigin}")`
      );
    }
  }

  /**
   * Sends the current props snapshot to the host window when available.
   * @internal
   */
  private async sendPropsUpdateToHost(nextProps: P): Promise<void> {
    await this.transport.sendPropsUpdateToHost(nextProps, this.options.props);
  }

  /**
   * Emits prop update lifecycle hooks.
   * @internal
   */
  private emitPropsUpdated(): void {
    this.event.emit(EVENT.PROPS, this.props);
    this.callPropCallback('onProps', this.props);
  }

  /**
   * Creates a clone of this instance with the same props.
   *
   * @returns A new unrendered component instance with identical configuration
   */
  clone(): ForgeFrameComponentInstance<P, X> {
    const cloned = new ConsumerComponent<P, X>(this.options, this.props);
    cloned.inputProps = { ...this.inputProps };
    return cloned;
  }

  /**
   * Checks if the component is eligible to render based on the eligible option.
   *
   * @returns True if eligible or no eligibility check defined
   */
  isEligible(): boolean {
    if (!this.options.eligible) return true;

    const result = this.options.eligible({ props: this.props });
    return result.eligible;
  }

  /**
   * Normalizes component options with default values.
   * @internal
   */
  private normalizeOptions(options: ComponentOptions<P>): NormalizedOptions<P> {
    return {
      ...options,
      props: options.props ?? ({} as PropsDefinition<P>),
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
  private resolveUrl(props: P = this.props): string {
    return typeof this.options.url === 'function'
      ? this.options.url(props)
      : this.options.url;
  }

  /**
   * Resolves dimensions from static or function options.
   * @internal
   */
  private resolveDimensions(): Dimensions {
    return typeof this.options.dimensions === 'function'
      ? this.options.dimensions(this.props)
      : this.options.dimensions;
  }

  /**
   * Resolves a URL to an origin, supporting relative URLs.
   * @internal
   */
  private resolveUrlOrigin(url: string): string | null {
    try {
      return new URL(url, window.location.origin).origin;
    } catch {
      return null;
    }
  }

  /**
   * Returns true when the domain option explicitly includes this origin.
   * @internal
   */
  private isExplicitDomainTrust(origin: string): boolean {
    return this.transport.isExplicitDomainTrust(origin);
  }

  /**
   * Ensures the messenger trusts the origin for a resolved host URL.
   * @internal
   */
  private syncTrustedDomainForUrl(url: string): void {
    const origin = this.resolveUrlOrigin(url);
    if (origin) {
      this.isExplicitDomainTrust(origin);
    }
    this.transport.syncTrustedDomainForUrl(url);
  }

  /**
   * Creates the prop context passed to prop callbacks and validators.
   * @internal
   */
  private createPropContext(props: P = this.props) {
    return {
      props,
      state: this.state,
      close: () => this.close(),
      focus: () => this.focus(),
      onError: (err: Error) => this.handleError(err),
      container: this.container,
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

    const result = this.options.eligible({ props: this.props });
    if (!result.eligible) {
      throw new Error(`Component not eligible: ${result.reason ?? 'Unknown reason'}`);
    }
  }

  /**
   * Creates and displays the prerender (loading) content.
   * @internal
   */
  private async prerender(): Promise<void> {
    await this.renderer.prerender(
      (windowName) => this.createIframeElement(windowName),
      () => this.buildWindowName()
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
  private async open(): Promise<void> {
    const baseUrl = this.resolveUrl();
    this.syncTrustedDomainForUrl(baseUrl);
    this.openedHostDomain = this.resolveUrlOrigin(baseUrl);

    this.hostWindow = this.renderer.open({
      baseUrl,
      buildUrl: (resolvedBaseUrl) => this.buildUrl(resolvedBaseUrl),
      buildBodyParams: () => this.buildBodyParams(),
      buildWindowName: () => this.buildWindowName(),
      submitBodyForm: (target, actionUrl, params) =>
        this.submitBodyForm(target, actionUrl, params),
      onPopupClose: () => {
        void this.close();
      },
      registerCleanup: (cleanupFn) => {
        this.cleanup.register(cleanupFn);
      },
    });

    if (this.hostWindow) {
      registerWindow(this.uid, this.hostWindow);
    }
  }

  /**
   * Builds the URL for the host window including query parameters.
   * @internal
   */
  private buildUrl(baseUrl: string = this.resolveUrl()): string {
    const queryParams = propsToQueryParams(this.props, this.options.props);
    const queryString = queryParams.toString();

    if (!queryString) return baseUrl;

    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${queryString}`;
  }

  /**
   * Builds POST body parameters from props marked with bodyParam.
   * @internal
   */
  private buildBodyParams(): URLSearchParams {
    return propsToBodyParams(this.props, this.options.props);
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
  private buildWindowName(): string {
    return this.transport.buildWindowName({
      tag: this.options.tag,
      context: this.context,
      props: this.props,
      propDefinitions: this.options.props,
      hostDomain: this.getHostDomain(),
      children: this.buildNestedHostRefs(),
      exports: this.createConsumerExports(),
    });
  }

  /**
   * Builds component references for nested host components.
   * @internal
   */
  private buildNestedHostRefs(): Record<string, HostComponentRef> | undefined {
    if (!this.options.children) return undefined;

    const nestedComponents = this.options.children({ props: this.props });
    const refs: Record<string, HostComponentRef> = {};

    for (const [name, component] of Object.entries(nestedComponents)) {
      const nestedOptions = getComponentOptions(component);
      if (!nestedOptions) {
        throw new Error(`Nested component "${name}" is missing component metadata`);
      }

      if (typeof nestedOptions.url !== 'string') {
        throw new Error(
          `Nested component "${name}" must use a static string URL. Function URLs are not supported in children.`
        );
      }

      refs[name] = {
        tag: nestedOptions.tag,
        url: nestedOptions.url,
        props: nestedOptions.props as
          | PropsDefinition<Record<string, unknown>>
          | undefined,
        dimensions:
          typeof nestedOptions.dimensions === 'function'
            ? undefined
            : nestedOptions.dimensions,
        defaultContext: nestedOptions.defaultContext,
      };
    }

    return Object.keys(refs).length > 0 ? refs : undefined;
  }

  /**
   * Creates the exports object sent to the host.
   * @internal
   */
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
   * Extracts the origin domain from the component URL.
   * @internal
   */
  private getHostDomain(): string {
    return this.transport.getHostDomain();
  }

  /**
   * Waits for the host to send the init message.
   * @internal
   */
  private async waitForHost(): Promise<void> {
    await this.transport.waitForHost(
      this.options.timeout,
      this.options.tag,
      (error) => this.handleError(error)
    );
  }

  /**
   * Sets up message handlers for host communication.
   * @internal
   */
  private setupMessageHandlers(): void {
    this.transport.setupMessageHandlers({
      onClose: async () => this.close(),
      onResize: async (dimensions) => this.resize(dimensions),
      onFocus: async () => this.focus(),
      onShow: async () => this.show(),
      onHide: async () => this.hide(),
      onError: (error) => this.handleError(error),
      onExport: (exports) => {
        this.exports = exports;
      },
      onConsumerExport: (data) => {
        this.consumerExports = data;
      },
      onGetSiblings: (request) => this.getSiblingInstances(request),
    });
  }

  /**
   * Gets sibling component instances for a request.
   * @internal
   */
  private getSiblingInstances(request: {
    uid: string;
    tag: string;
    options?: GetPeerInstancesOptions;
  }): SiblingInfo[] {
    const siblings: SiblingInfo[] = [];

    if (request.options?.anyConsumer) {
      for (const [tag, component] of getRegisteredComponents()) {
        for (const instance of component.instances) {
          if (instance.uid === request.uid) continue;
          siblings.push({
            uid: instance.uid,
            tag,
            exports: instance.exports,
          });
        }
      }
      return siblings;
    }

    const component = getComponent(request.tag);
    if (!component) {
      return siblings;
    }

    for (const instance of component.instances) {
      if (instance.uid === request.uid) continue;

      siblings.push({
        uid: instance.uid,
        tag: request.tag,
        exports: instance.exports,
      });
    }

    return siblings;
  }

  /**
   * Registers cleanup handlers for the instance.
   * @internal
   */
  private setupCleanup(): void {
    this.cleanup.register(() => {
      this.messenger.destroy();
      this.bridge.destroy();
      unregisterWindow(this.uid);
    });
  }

  /**
   * Handles errors by emitting events and calling callbacks.
   * @internal
   */
  private handleError(error: Error): void {
    this.event.emit(EVENT.ERROR, error);
    this.callPropCallback('onError', error);
  }

  /**
   * Calls a prop callback if it exists.
   * @internal
   */
  private callPropCallback(name: string, ...args: unknown[]): void {
    const callback = (this.props as Record<string, unknown>)[name];
    if (typeof callback === 'function') {
      try {
        const result = callback(...args);
        if (
          result &&
          typeof result === 'object' &&
          'catch' in result &&
          typeof result.catch === 'function'
        ) {
          (result as Promise<unknown>).catch((err: unknown) => {
            console.error(`Error in async ${name} callback:`, err);
          });
        }
      } catch (err) {
        console.error(`Error in ${name} callback:`, err);
      }
    }
  }

  /**
   * Destroys the component and cleans up all resources.
   * @internal
   */
  private async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.initPromise) {
      this.initPromise.reject(
        new Error(
          `Component "${this.options.tag}" was destroyed before initialization completed`
        )
      );
      this.initPromise = null;
    }
    this.hostInitialized = false;

    this.renderer.destroy(this.hostWindow);

    this.hostWindow = null;
    this.openedHostDomain = null;
    this.dynamicUrlTrustedOrigin = null;
    this.pendingPropsUpdate = null;

    await this.cleanup.cleanup();

    this.event.emit(EVENT.DESTROY);
    this.callPropCallback('onDestroy');
    this.event.removeAllListeners();
  }
}
