import type { ContextType } from '../../constants';
import { CONTEXT } from '../../constants';
import type { Dimensions, TemplateContext } from '../../types';
import type { NormalizedOptions } from './types';
import {
  destroyIframe,
  focusIframe,
  hideIframe,
  resizeIframe,
  showIframe,
} from '../../render/iframe';
import {
  closePopup,
  focusPopup,
  openPopup,
  resizePopup,
  watchPopupClose,
} from '../../render/popup';
import {
  defaultContainerTemplate,
  defaultPrerenderTemplate,
  swapPrerenderContent,
} from '../../render/templates';

/**
 * Parameters required to open iframe/popup host content.
 * @internal
 */
export interface ConsumerOpenParams {
  baseUrl: string;
  buildUrl: (baseUrl: string) => string;
  buildBodyParams: () => URLSearchParams;
  buildWindowName: () => string;
  submitBodyForm: (
    target: string,
    actionUrl: string,
    params: URLSearchParams
  ) => void;
  onPopupClose: () => void;
  registerCleanup: (cleanupFn: () => void) => void;
}

/**
 * Owns consumer rendering concerns (container resolution, prerender, iframe/popup lifecycle).
 * @internal
 */
export class ConsumerRenderer<P extends Record<string, unknown>> {
  /** Active rendering context. */
  public context: ContextType;

  /** Active iframe instance when rendering in iframe mode. */
  public iframe: HTMLIFrameElement | null = null;

  /** Resolved container element. */
  public container: HTMLElement | null = null;

  /** Prerender element currently displayed while host initializes. */
  public prerenderElement: HTMLElement | null = null;

  constructor(
    private options: NormalizedOptions<P>,
    private uid: string,
    private getProps: () => P,
    private resolveDimensions: () => Dimensions,
    private callbacks: {
      close: () => Promise<void>;
      focus: () => Promise<void>;
    }
  ) {
    this.context = this.options.defaultContext;
  }

  /**
   * Resolves a container selector or element to an HTMLElement.
   */
  resolveContainer(container?: string | HTMLElement): HTMLElement {
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
   * Creates and displays prerender/loading content.
   */
  async prerender(createIframeElement: (windowName: string) => HTMLIFrameElement, buildWindowName: () => string): Promise<void> {
    if (!this.container) return;

    const props = this.getProps();
    const prerenderTemplateFn =
      this.options.prerenderTemplate ?? defaultPrerenderTemplate;
    const containerTemplateFn =
      this.options.containerTemplate ?? defaultContainerTemplate;

    const dimensions = this.resolveDimensions();
    const cspNonce = (props as Record<string, unknown>).cspNonce as
      | string
      | undefined;

    if (this.context === CONTEXT.IFRAME) {
      const windowName = buildWindowName();
      this.iframe = createIframeElement(windowName);
      hideIframe(this.iframe);
    }

    const prerenderContext: TemplateContext<P> & { cspNonce?: string } = {
      uid: this.uid,
      tag: this.options.tag,
      context: this.context,
      dimensions,
      props,
      doc: document,
      container: this.container,
      frame: this.iframe,
      prerenderFrame: null,
      close: () => this.callbacks.close(),
      focus: () => this.callbacks.focus(),
      cspNonce,
    };

    this.prerenderElement = prerenderTemplateFn(prerenderContext);

    const templateContext: TemplateContext<P> & { cspNonce?: string } = {
      uid: this.uid,
      tag: this.options.tag,
      context: this.context,
      dimensions,
      props,
      doc: document,
      container: this.container,
      frame: this.iframe,
      prerenderFrame: this.prerenderElement,
      close: () => this.callbacks.close(),
      focus: () => this.callbacks.focus(),
      cspNonce,
    };

    const containerEl = containerTemplateFn(templateContext);
    if (containerEl) {
      this.container.appendChild(containerEl);
      this.container = containerEl;
    }

    if (this.prerenderElement && !this.prerenderElement.parentNode) {
      this.container.appendChild(this.prerenderElement);
    }
    if (this.iframe && !this.iframe.parentNode) {
      this.container.appendChild(this.iframe);
    }
  }

  /**
   * Creates an iframe element without setting src (for prerender phase).
   */
  createIframeElement(windowName: string): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    const dimensions = this.resolveDimensions();
    const props = this.getProps();
    const attributes =
      typeof this.options.attributes === 'function'
        ? this.options.attributes(props)
        : this.options.attributes ?? {};
    const style =
      typeof this.options.style === 'function'
        ? this.options.style(props)
        : this.options.style ?? {};

    iframe.name = windowName;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowtransparency', 'true');
    iframe.setAttribute('scrolling', 'auto');

    if (dimensions.width !== undefined) {
      iframe.style.width =
        typeof dimensions.width === 'number'
          ? `${dimensions.width}px`
          : dimensions.width;
    }
    if (dimensions.height !== undefined) {
      iframe.style.height =
        typeof dimensions.height === 'number'
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

    if (!attributes.sandbox) {
      iframe.setAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox'
      );
    }

    return iframe;
  }

  /**
   * Opens host content in iframe or popup context.
   */
  open(params: ConsumerOpenParams): Window | null {
    const url = params.buildUrl(params.baseUrl);
    const bodyParams = params.buildBodyParams();
    const hasBodyParams = bodyParams.toString().length > 0;

    if (this.context === CONTEXT.IFRAME) {
      if (!this.iframe) {
        throw new Error('Iframe not created during prerender');
      }

      if (hasBodyParams) {
        params.submitBodyForm(this.iframe.name, url, bodyParams);
      } else {
        this.iframe.src = url;
      }

      return this.iframe.contentWindow;
    }

    const windowName = params.buildWindowName();
    const popup = openPopup({
      url: hasBodyParams ? 'about:blank' : url,
      name: windowName,
      dimensions: this.resolveDimensions(),
    });

    if (hasBodyParams) {
      params.submitBodyForm(windowName, url, bodyParams);
    }

    const stopWatching = watchPopupClose(popup, () => {
      params.onPopupClose();
    });
    params.registerCleanup(stopWatching);

    return popup;
  }

  /**
   * Swaps prerender content with the live iframe after host initialization.
   */
  async swapPrerenderContentIfNeeded(): Promise<void> {
    if (
      this.context === CONTEXT.IFRAME &&
      this.iframe &&
      this.prerenderElement &&
      this.container
    ) {
      await swapPrerenderContent(this.container, this.prerenderElement, this.iframe);
      this.prerenderElement = null;
    }
  }

  /**
   * Submits a hidden form to navigate a target window via POST.
   */
  submitBodyForm(
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
   * Focuses iframe/popup context.
   */
  focus(hostWindow: Window | null): void {
    if (this.context === CONTEXT.IFRAME && this.iframe) {
      focusIframe(this.iframe);
    } else if (this.context === CONTEXT.POPUP && hostWindow) {
      focusPopup(hostWindow);
    }
  }

  /**
   * Resizes iframe/popup context.
   */
  resize(dimensions: Dimensions, hostWindow: Window | null): void {
    if (this.context === CONTEXT.IFRAME && this.iframe) {
      resizeIframe(this.iframe, dimensions);
    } else if (this.context === CONTEXT.POPUP && hostWindow) {
      resizePopup(hostWindow, dimensions);
    }
  }

  /**
   * Shows iframe context.
   */
  show(): void {
    if (this.context === CONTEXT.IFRAME && this.iframe) {
      showIframe(this.iframe);
    }
  }

  /**
   * Hides iframe context.
   */
  hide(): void {
    if (this.context === CONTEXT.IFRAME && this.iframe) {
      hideIframe(this.iframe);
    }
  }

  /**
   * Destroys rendered iframe/popup DOM artifacts.
   */
  destroy(hostWindow: Window | null): void {
    if (this.iframe) {
      destroyIframe(this.iframe);
      this.iframe = null;
    }

    if (this.context === CONTEXT.POPUP && hostWindow) {
      closePopup(hostWindow);
    }

    if (this.prerenderElement) {
      this.prerenderElement.remove();
      this.prerenderElement = null;
    }
  }
}
