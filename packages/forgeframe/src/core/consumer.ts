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
  DomainMatcher,
  ForgeFrameComponentInstance,
  Dimensions,
  PropsDefinition,
  TemplateContext,
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
import { createDeferred, promiseTimeout } from '../utils/promise';
import { Messenger } from '../communication/messenger';
import { FunctionBridge } from '../communication/bridge';
import {
  getDomain,
  matchDomain,
  isSameDomain,
  isWindowClosed,
} from '../window/helpers';
import { buildWindowName, createWindowPayload } from '../window/name-payload';
import { registerWindow, unregisterWindow } from '../window/proxy';
import {
  normalizeProps,
  validateProps,
  getPropsForHost,
  serializeProps,
  propsToQueryParams,
  propsToBodyParams,
} from '../props';
import {
  destroyIframe,
  resizeIframe,
  showIframe,
  hideIframe,
  focusIframe,
} from '../render/iframe';
import {
  openPopup,
  closePopup,
  focusPopup,
  watchPopupClose,
  resizePopup,
} from '../render/popup';
import {
  defaultContainerTemplate,
  defaultPrerenderTemplate,
  swapPrerenderContent,
} from '../render/templates';
import { getComponent, getComponentOptions } from './component';

/**
 * Normalized and validated component options.
 * @internal
 */
interface NormalizedOptions<P> {
  tag: string;
  url: string | ((props: P) => string);
  props: PropsDefinition<P>;
  defaultContext: ContextType;
  dimensions: Dimensions | ((props: P) => Dimensions);
  timeout: number;
  domain?: ComponentOptions<P>['domain'];
  allowedConsumerDomains?: ComponentOptions<P>['allowedConsumerDomains'];
  containerTemplate?: ComponentOptions<P>['containerTemplate'];
  prerenderTemplate?: ComponentOptions<P>['prerenderTemplate'];
  eligible?: ComponentOptions<P>['eligible'];
  validate?: ComponentOptions<P>['validate'];
  attributes?: ComponentOptions<P>['attributes'];
  style?: ComponentOptions<P>['style'];
  autoResize?: ComponentOptions<P>['autoResize'];
  children?: ComponentOptions<P>['children'];
}

/**
 * Consumer-side component implementation.
 *
 * @remarks
 * This class manages the lifecycle of a component from the consumer (embedding app) perspective.
 * It handles rendering the component into iframes or popups, communicating with
 * the host window via postMessage, and managing component state.
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
  private props: P;

  /** @internal */
  private context: ContextType;

  /** @internal */
  private messenger: Messenger;

  /** @internal */
  private bridge: FunctionBridge;

  /** @internal */
  private cleanup: CleanupManager;

  /** @internal */
  private hostWindow: Window | null = null;

  /** @internal */
  private openedHostDomain: string | null = null;

  /** @internal */
  private dynamicUrlTrustedOrigin: string | null = null;

  /** @internal */
  private iframe: HTMLIFrameElement | null = null;

  /** @internal */
  private container: HTMLElement | null = null;

  /** @internal */
  private prerenderElement: HTMLElement | null = null;

  /** @internal */
  private initPromise: ReturnType<typeof createDeferred<void>> | null = null;

  /** @internal */
  private hostInitialized = false;

  /** @internal */
  private rendered = false;

  /** @internal */
  private destroyed = false;

  /**
   * Creates a new ConsumerComponent instance.
   *
   * @param options - Component configuration options
   * @param props - Initial props to pass to the component
   */
  constructor(options: ComponentOptions<P>, props: Partial<P> = {}) {
    this._uid = generateUID();
    this.options = this.normalizeOptions(options);
    this.context = this.options.defaultContext;

    this.event = new EventEmitter();
    this.cleanup = new CleanupManager();

    const propContext = this.createPropContext();
    this.props = normalizeProps(props as Partial<P>, this.options.props, propContext);

    // Create messenger with trusted domains for security
    const trustedDomains = this.buildTrustedDomains();
    this.messenger = new Messenger(this.uid, window, getDomain(), trustedDomains);
    this.bridge = new FunctionBridge(this.messenger);

    this.setupMessageHandlers();
    this.setupCleanup();
  }

  /**
   * Builds the list of trusted domains for messenger communication.
   * @internal
   */
  private buildTrustedDomains(): DomainMatcher | undefined {
    const domains: Array<string | RegExp> = [];

    const hostOrigin = this.resolveUrlOrigin(this.resolveUrl());
    if (hostOrigin) {
      domains.push(hostOrigin);
      this.dynamicUrlTrustedOrigin = hostOrigin;
    }

    if (this.options.domain) {
      if (typeof this.options.domain === 'string') {
        domains.push(this.options.domain);
      } else if (Array.isArray(this.options.domain)) {
        domains.push(...this.options.domain);
      } else if (this.options.domain instanceof RegExp) {
        domains.push(this.options.domain);
      }
    }

    if (domains.length === 0) {
      return undefined;
    }

    return domains.length === 1 ? domains[0] : domains;
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
        await swapPrerenderContent(
          this.container,
          this.prerenderElement,
          this.iframe
        );
        this.prerenderElement = null;
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
    // For now, delegate to regular render
    // Full cross-window rendering would require additional complexity
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
    if (this.context === CONTEXT.IFRAME && this.iframe) {
      focusIframe(this.iframe);
    } else if (this.context === CONTEXT.POPUP && this.hostWindow) {
      focusPopup(this.hostWindow);
    }

    this.event.emit(EVENT.FOCUS);
    this.callPropCallback('onFocus');
  }

  /**
   * Resizes the component to the specified dimensions.
   *
   * @param dimensions - New width and height for the component
   */
  async resize(dimensions: Dimensions): Promise<void> {
    if (this.context === CONTEXT.IFRAME && this.iframe) {
      resizeIframe(this.iframe, dimensions);
    } else if (this.context === CONTEXT.POPUP && this.hostWindow) {
      resizePopup(this.hostWindow, dimensions);
    }

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
    if (this.context === CONTEXT.IFRAME && this.iframe) {
      showIframe(this.iframe);
    }
  }

  /**
   * Hides the component.
   *
   * @remarks
   * Only applicable to iframe context.
   */
  async hide(): Promise<void> {
    if (this.context === CONTEXT.IFRAME && this.iframe) {
      hideIframe(this.iframe);
    }
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
    const propContext = this.createPropContext();
    const nextProps = normalizeProps(
      { ...this.props, ...newProps },
      this.options.props,
      propContext
    );
    validateProps(nextProps, this.options.props);
    this.options.validate?.({ props: nextProps });

    const resolvedUrl = this.resolveUrl(nextProps);
    const nextHostOrigin = this.resolveUrlOrigin(resolvedUrl);
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

    this.props = nextProps;

    if (!this.rendered) {
      this.syncTrustedDomainForUrl(resolvedUrl);
    }

    if (this.hostWindow && !isWindowClosed(this.hostWindow)) {
      const hostDomain = this.openedHostDomain ?? this.getHostDomain();
      const propsForHost = getPropsForHost(
        nextProps,
        this.options.props,
        hostDomain,
        isSameDomain(this.hostWindow)
      );
      const serialized = serializeProps(
        propsForHost as Record<string, unknown>,
        this.options.props as PropsDefinition<Record<string, unknown>>,
        this.bridge
      );

      await this.messenger.send(
        this.hostWindow,
        hostDomain,
        MESSAGE_NAME.PROPS,
        serialized
      );
    }

    this.event.emit(EVENT.PROPS, this.props);
    this.callPropCallback('onProps', this.props);
  }

  /**
   * Creates a clone of this instance with the same props.
   *
   * @returns A new unrendered component instance with identical configuration
   */
  clone(): ForgeFrameComponentInstance<P, X> {
    return new ConsumerComponent(this.options, this.props);
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
    if (!this.options.domain) {
      return false;
    }

    return matchDomain(this.options.domain, origin);
  }

  /**
   * Ensures the messenger trusts the origin for a resolved host URL.
   * @internal
   */
  private syncTrustedDomainForUrl(url: string): void {
    const origin = this.resolveUrlOrigin(url);
    if (!origin) {
      return;
    }

    const previousOrigin = this.dynamicUrlTrustedOrigin;
    if (
      previousOrigin &&
      previousOrigin !== origin &&
      !this.isExplicitDomainTrust(previousOrigin)
    ) {
      this.messenger.removeTrustedDomain(previousOrigin);
    }

    this.messenger.addTrustedDomain(origin);
    this.dynamicUrlTrustedOrigin = origin;
  }

  /**
   * Creates the prop context passed to prop callbacks and validators.
   * @internal
   */
  private createPropContext() {
    return {
      props: this.props,
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
    if (!container) {
      throw new Error('Container is required for rendering');
    }

    if (typeof container === 'string') {
      const el = document.querySelector(container);
      if (!el) {
        throw new Error(`Container "${container}" not found`);
      }
      return el as HTMLElement;
    }

    return container;
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
    if (!this.container) return;

    const prerenderTemplateFn =
      this.options.prerenderTemplate ?? defaultPrerenderTemplate;
    const containerTemplateFn =
      this.options.containerTemplate ?? defaultContainerTemplate;

    const dimensions = this.resolveDimensions();
    const cspNonce = (this.props as Record<string, unknown>).cspNonce as string | undefined;

    // Pre-create iframe element for iframe context (zoid-style)
    // This allows containerTemplate to place it anywhere in the DOM
    // We set the window name now (carries payload) but not src (loads content)
    if (this.context === CONTEXT.IFRAME) {
      const windowName = this.buildWindowName();
      this.iframe = this.createIframeElement(windowName);
      hideIframe(this.iframe);
    }

    const prerenderContext: TemplateContext<P> & { cspNonce?: string } = {
      uid: this.uid,
      tag: this.options.tag,
      context: this.context,
      dimensions,
      props: this.props,
      doc: document,
      container: this.container,
      frame: this.iframe,
      prerenderFrame: null,
      close: () => this.close(),
      focus: () => this.focus(),
      cspNonce,
    };

    this.prerenderElement = prerenderTemplateFn(prerenderContext);

    const templateContext: TemplateContext<P> & { cspNonce?: string } = {
      uid: this.uid,
      tag: this.options.tag,
      context: this.context,
      dimensions,
      props: this.props,
      doc: document,
      container: this.container,
      frame: this.iframe,
      prerenderFrame: this.prerenderElement,
      close: () => this.close(),
      focus: () => this.focus(),
      cspNonce,
    };

    // Call containerTemplate - it's responsible for placing frame and prerenderFrame
    const containerEl = containerTemplateFn(templateContext);
    if (containerEl) {
      this.container.appendChild(containerEl);
      this.container = containerEl;
    }

    // If containerTemplate didn't place the elements, append them to container
    // This maintains backwards compatibility with simple templates
    if (this.prerenderElement && !this.prerenderElement.parentNode) {
      this.container.appendChild(this.prerenderElement);
    }
    if (this.iframe && !this.iframe.parentNode) {
      this.container.appendChild(this.iframe);
    }
  }

  /**
   * Creates an iframe element without setting src (for prerender phase).
   * The window name is set immediately as it carries the payload for the host.
   * @internal
   */
  private createIframeElement(windowName: string): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    const dimensions = this.resolveDimensions();
    const attributes = typeof this.options.attributes === 'function'
      ? this.options.attributes(this.props)
      : this.options.attributes ?? {};
    const style = typeof this.options.style === 'function'
      ? this.options.style(this.props)
      : this.options.style ?? {};

    // Set name first - carries the payload that host reads from window.name
    iframe.name = windowName;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowtransparency', 'true');
    iframe.setAttribute('scrolling', 'auto');

    if (dimensions.width !== undefined) {
      iframe.style.width = typeof dimensions.width === 'number'
        ? `${dimensions.width}px`
        : dimensions.width;
    }
    if (dimensions.height !== undefined) {
      iframe.style.height = typeof dimensions.height === 'number'
        ? `${dimensions.height}px`
        : dimensions.height;
    }

    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined) continue;
      if (typeof value === 'boolean') {
        if (value) iframe.setAttribute(key, '');
      } else {
        iframe.setAttribute(key, value);
      }
    }

    for (const [key, value] of Object.entries(style)) {
      if (value === undefined) continue;
      const cssValue = typeof value === 'number' ? `${value}px` : value;
      iframe.style.setProperty(
        key.replace(/([A-Z])/g, '-$1').toLowerCase(),
        String(cssValue)
      );
    }

    // Default sandbox if not specified
    if (!attributes.sandbox) {
      iframe.setAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox'
      );
    }

    return iframe;
  }

  /**
   * Opens the host window (iframe or popup).
   * @internal
   */
  private async open(): Promise<void> {
    const baseUrl = this.resolveUrl();
    this.syncTrustedDomainForUrl(baseUrl);
    this.openedHostDomain = this.resolveUrlOrigin(baseUrl);
    const url = this.buildUrl(baseUrl);
    const bodyParams = this.buildBodyParams();
    const hasBodyParams = bodyParams.toString().length > 0;

    if (this.context === CONTEXT.IFRAME) {
      // Iframe was pre-created in prerender() with name already set
      // Now just set src to start loading content
      if (!this.iframe) {
        throw new Error('Iframe not created during prerender');
      }

      if (hasBodyParams) {
        this.submitBodyForm(this.iframe.name, url, bodyParams);
      } else {
        this.iframe.src = url;
      }
      this.hostWindow = this.iframe.contentWindow;
    } else {
      const windowName = this.buildWindowName();
      this.hostWindow = openPopup({
        url: hasBodyParams ? 'about:blank' : url,
        name: windowName,
        dimensions: this.resolveDimensions(),
      });

      if (hasBodyParams) {
        this.submitBodyForm(windowName, url, bodyParams);
      }

      const stopWatching = watchPopupClose(this.hostWindow, () => {
        void this.close();
      });
      this.cleanup.register(stopWatching);
    }

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
    const doc = this.container?.ownerDocument ?? document;
    const root = doc.body ?? doc.documentElement;
    if (!root) {
      throw new Error('Document root is unavailable for bodyParam form submission');
    }

    const form = doc.createElement('form');
    form.method = 'POST';
    form.action = actionUrl;
    form.target = target;
    form.style.display = 'none';

    for (const [key, value] of params.entries()) {
      const input = doc.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      form.appendChild(input);
    }

    root.appendChild(form);
    try {
      form.submit();
    } finally {
      form.remove();
    }
  }

  /**
   * Builds the window.name payload for the host window.
   * @internal
   */
  private buildWindowName(): string {
    const hostDomain = this.getHostDomain();
    const propsForHost = getPropsForHost(
      this.props,
      this.options.props,
      hostDomain,
      false // Assume cross-domain for initial payload
    );

    const serializedProps = serializeProps(
      propsForHost as Record<string, unknown>,
      this.options.props as PropsDefinition<Record<string, unknown>>,
      this.bridge
    );

    const nestedHostRefs = this.buildNestedHostRefs();

    const payload = createWindowPayload({
      uid: this.uid,
      tag: this.options.tag,
      context: this.context,
      consumerDomain: getDomain(),
      props: serializedProps,
      exports: this.createConsumerExports(),
      children: nestedHostRefs,
    });

    return buildWindowName(payload);
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
        props: nestedOptions.props as PropsDefinition<Record<string, unknown>> | undefined,
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
    if (this.openedHostDomain) {
      return this.openedHostDomain;
    }

    return this.resolveUrlOrigin(this.resolveUrl()) ?? '*';
  }

  /**
   * Waits for the host to send the init message.
   * @internal
   */
  private async waitForHost(): Promise<void> {
    if (this.hostInitialized) {
      return;
    }

    const initPromise = createDeferred<void>();
    this.initPromise = initPromise;

    try {
      await promiseTimeout(
        initPromise.promise,
        this.options.timeout,
        `Host component "${this.options.tag}" (uid: ${this._uid}) did not initialize within ${this.options.timeout}ms. ` +
        `Check that the host page loads correctly and calls the initialization code.`
      );
    } catch (err) {
      this.handleError(err as Error);
      throw err;
    } finally {
      if (this.initPromise === initPromise) {
        this.initPromise = null;
      }
    }
  }

  /**
   * Sets up message handlers for host communication.
   * @internal
   */
  private setupMessageHandlers(): void {
    this.setupHostLifecycleHandlers();
    this.setupHostDataHandlers();
  }

  /**
   * Sets up host lifecycle command handlers.
   * @internal
   */
  private setupHostLifecycleHandlers(): void {
    this.messenger.on(MESSAGE_NAME.INIT, () => {
      this.hostInitialized = true;
      if (this.initPromise) {
        this.initPromise.resolve();
      }
      return { success: true };
    });

    this.messenger.on(MESSAGE_NAME.CLOSE, async () => {
      await this.close();
      return { success: true };
    });

    this.messenger.on<Dimensions>(MESSAGE_NAME.RESIZE, async (dimensions) => {
      await this.resize(dimensions);
      return { success: true };
    });

    this.messenger.on(MESSAGE_NAME.FOCUS, async () => {
      await this.focus();
      return { success: true };
    });

    this.messenger.on(MESSAGE_NAME.SHOW, async () => {
      await this.show();
      return { success: true };
    });

    this.messenger.on(MESSAGE_NAME.HIDE, async () => {
      await this.hide();
      return { success: true };
    });

    this.messenger.on<{ message: string; stack?: string }>(
      MESSAGE_NAME.ERROR,
      async (errorData) => {
        const error = new Error(errorData.message);
        error.stack = errorData.stack;
        this.handleError(error);
        return { success: true };
      }
    );
  }

  /**
   * Sets up host data exchange handlers.
   * @internal
   */
  private setupHostDataHandlers(): void {
    this.messenger.on<X>(MESSAGE_NAME.EXPORT, async (exports) => {
      this.exports = exports;
      return { success: true };
    });

    this.messenger.on<unknown>(MESSAGE_NAME.CONSUMER_EXPORT, async (data) => {
      this.consumerExports = data;
      return { success: true };
    });

    this.messenger.on<{ uid: string; tag: string; options?: GetPeerInstancesOptions }>(
      MESSAGE_NAME.GET_SIBLINGS,
      async (request) => {
        return this.getSiblingInstances(request);
      }
    );
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
        // Handle async callbacks - catch promise rejections
        if (result && typeof result === 'object' && 'catch' in result && typeof result.catch === 'function') {
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

    // Reject any pending init promise to prevent hanging
    if (this.initPromise) {
      this.initPromise.reject(
        new Error(`Component "${this.options.tag}" was destroyed before initialization completed`)
      );
      this.initPromise = null;
    }
    this.hostInitialized = false;

    if (this.iframe) {
      destroyIframe(this.iframe);
      this.iframe = null;
    }

    if (this.context === CONTEXT.POPUP && this.hostWindow) {
      closePopup(this.hostWindow);
    }

    this.hostWindow = null;
    this.openedHostDomain = null;
    this.dynamicUrlTrustedOrigin = null;

    if (this.prerenderElement) {
      this.prerenderElement.remove();
      this.prerenderElement = null;
    }

    await this.cleanup.cleanup();

    this.event.emit(EVENT.DESTROY);
    this.callPropCallback('onDestroy');
    this.event.removeAllListeners();
  }
}
