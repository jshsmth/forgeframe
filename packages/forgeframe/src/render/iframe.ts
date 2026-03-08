import type { Dimensions, IframeAttributes, IframeStyles } from '@/types';
import { normalizeDimensionToCSS } from '@/utils/dimension';

/**
 * Configuration options for creating an iframe.
 *
 * @public
 */
export interface IframeOptions {
  /**
   * The URL to load in the iframe.
   */
  url: string;

  /**
   * The name attribute for the iframe, used for targeting.
   */
  name: string;

  /**
   * The parent HTML element that will contain the iframe.
   */
  container: HTMLElement;

  /**
   * The width and height dimensions for the iframe.
   */
  dimensions: Dimensions;

  /**
   * Optional additional HTML attributes to set on the iframe element.
   */
  attributes?: IframeAttributes;

  /**
   * Optional CSS styles to apply to the iframe element.
   */
  style?: IframeStyles;
}

/**
 * Configuration for creating an iframe element before navigation.
 *
 * @internal
 */
interface IframeElementOptions {
  /**
   * The name attribute for the iframe, used for targeting.
   */
  name: string;

  /**
   * The width and height dimensions for the iframe.
   */
  dimensions: Dimensions;

  /**
   * Optional additional HTML attributes to set on the iframe element.
   */
  attributes?: IframeAttributes;

  /**
   * Optional CSS styles to apply to the iframe element.
   */
  style?: IframeStyles;
}

/**
 * Creates a configured iframe element without appending it or setting `src`.
 *
 * @internal
 */
export function createIframeElement(
  options: IframeElementOptions
): HTMLIFrameElement {
  const { name, dimensions, attributes = {}, style = {} } = options;
  const iframe = document.createElement('iframe');

  iframe.name = name;
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('scrolling', 'auto');

  applyDimensions(iframe, dimensions);
  applyAttributes(iframe, attributes);
  applyStyles(iframe, style);
  applyDefaultSandbox(iframe, attributes);

  return iframe;
}

/**
 * Creates an iframe element with the specified options and appends it to a container.
 *
 * @remarks
 * This function creates a fully configured iframe with sensible defaults for
 * security and appearance. It sets up sandbox restrictions, removes borders,
 * and ensures cross-browser compatibility.
 *
 * The iframe is appended to the container before setting the `src` attribute,
 * as some browsers require the iframe to be in the DOM before loading content.
 *
 * If no sandbox attribute is provided, a default secure sandbox policy is applied:
 * `allow-scripts allow-same-origin allow-forms allow-popups`
 *
 * @param options - Configuration options for the iframe
 * @returns The created HTMLIFrameElement, already appended to the container
 *
 * @example
 * ```typescript
 * const iframe = createIframe({
 *   url: 'https://example.com/widget',
 *   name: 'my-widget',
 *   container: document.getElementById('widget-container')!,
 *   dimensions: { width: 400, height: 300 },
 *   attributes: { allow: 'payment' }
 * });
 * ```
 *
 * @public
 */
export function createIframe(options: IframeOptions): HTMLIFrameElement {
  const { url, name, container, dimensions, attributes = {}, style = {} } = options;
  const iframe = createIframeElement({ name, dimensions, attributes, style });

  // Add to container first (some browsers need this before setting src)
  container.appendChild(iframe);
  iframe.src = url;

  return iframe;
}

/**
 * Creates an iframe for displaying a prerender/loading state.
 *
 * @remarks
 * This function creates a lightweight iframe intended to show a loading
 * placeholder while the actual content iframe is being prepared. The iframe
 * uses `srcdoc` with an empty HTML document, avoiding any external network requests.
 *
 * The prerender iframe uses a special reserved name `__forgeframe_prerender__`
 * to distinguish it from content iframes.
 *
 * @param container - The parent HTML element to append the iframe to
 * @param dimensions - The width and height for the prerender iframe
 * @returns The created prerender HTMLIFrameElement
 *
 * @example
 * ```typescript
 * const prerenderIframe = createPrerenderIframe(
 *   document.getElementById('container')!,
 *   { width: 400, height: 300 }
 * );
 * ```
 *
 * @public
 */
export function createPrerenderIframe(
  container: HTMLElement,
  dimensions: Dimensions
): HTMLIFrameElement {
  const iframe = document.createElement('iframe');

  iframe.name = '__forgeframe_prerender__';
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('scrolling', 'no');

  applyDimensions(iframe, dimensions);

  // Prerender iframe doesn't need to load external content
  iframe.srcdoc = '<!DOCTYPE html><html><head></head><body></body></html>';

  container.appendChild(iframe);

  return iframe;
}

/**
 * Destroys an iframe by clearing its source and removing it from the DOM.
 *
 * @remarks
 * This function performs a clean teardown of an iframe by first navigating
 * it to `about:blank` to stop any ongoing loading or scripts, then removing
 * it from its parent node. Any errors during cleanup are silently ignored
 * to ensure the cleanup process completes without throwing.
 *
 * @param iframe - The iframe element to destroy
 *
 * @example
 * ```typescript
 * const iframe = createIframe({ ... });
 * // Later, when done with the iframe:
 * destroyIframe(iframe);
 * ```
 *
 * @public
 */
export function destroyIframe(iframe: HTMLIFrameElement): void {
  try {
    iframe.src = 'about:blank';
    iframe.parentNode?.removeChild(iframe);
  } catch {
    // Cleanup errors are expected for cross-origin iframes
  }
}

/**
 * Resizes an iframe to the specified dimensions.
 *
 * @param iframe - The iframe element to resize
 * @param dimensions - The new width and height to apply
 *
 * @example
 * ```typescript
 * resizeIframe(iframe, { width: 600, height: 400 });
 * resizeIframe(iframe, { width: '100%', height: 'auto' });
 * ```
 *
 * @public
 */
export function resizeIframe(
  iframe: HTMLIFrameElement,
  dimensions: Dimensions
): void {
  applyDimensions(iframe, dimensions);
}

/**
 * Makes an iframe visible by resetting its display and visibility styles.
 *
 * @remarks
 * This function clears the `display` style (reverting to default) and sets
 * `visibility` to `'visible'`. Use this in conjunction with {@link hideIframe}
 * to toggle iframe visibility.
 *
 * @param iframe - The iframe element to show
 *
 * @example
 * ```typescript
 * hideIframe(iframe);
 * // Later:
 * showIframe(iframe);
 * ```
 *
 * @public
 */
export function showIframe(iframe: HTMLIFrameElement): void {
  iframe.style.display = '';
  iframe.style.visibility = 'visible';
}

/**
 * Hides an iframe by setting display to none and visibility to hidden.
 *
 * @remarks
 * This function sets both `display: none` and `visibility: hidden` to ensure
 * the iframe is completely hidden and does not affect layout. Use
 * {@link showIframe} to make the iframe visible again.
 *
 * @param iframe - The iframe element to hide
 *
 * @example
 * ```typescript
 * showIframe(iframe);
 * // Later:
 * hideIframe(iframe);
 * ```
 *
 * @public
 */
export function hideIframe(iframe: HTMLIFrameElement): void {
  iframe.style.display = 'none';
  iframe.style.visibility = 'hidden';
}

/**
 * Attempts to focus an iframe and its content window.
 *
 * @remarks
 * This function tries to focus both the iframe element itself and its
 * `contentWindow`. Cross-origin restrictions may prevent focusing the
 * content window, in which case errors are silently caught and ignored.
 *
 * @param iframe - The iframe element to focus
 *
 * @example
 * ```typescript
 * // Focus the iframe after user interaction
 * button.addEventListener('click', () => {
 *   focusIframe(iframe);
 * });
 * ```
 *
 * @public
 */
export function focusIframe(iframe: HTMLIFrameElement): void {
  try {
    iframe.focus();
    iframe.contentWindow?.focus();
  } catch {
    // Cross-origin focus might fail
  }
}

/**
 * Applies width and height dimensions to an iframe element.
 *
 * @remarks
 * Only dimensions that are defined will be applied. Numeric values are
 * automatically converted to pixel strings via {@link normalizeDimension}.
 *
 * @param iframe - The iframe element to apply dimensions to
 * @param dimensions - The dimensions object containing width and/or height
 *
 * @internal
 */
function applyDimensions(
  iframe: HTMLIFrameElement,
  dimensions: Dimensions
): void {
  if (dimensions.width !== undefined) {
    iframe.style.width = normalizeDimensionToCSS(dimensions.width);
  }
  if (dimensions.height !== undefined) {
    iframe.style.height = normalizeDimensionToCSS(dimensions.height);
  }
}

/**
 * Applies CSS styles to an iframe element.
 *
 * @remarks
 * Iterates through the style object and applies each property to the iframe's
 * style. Numeric values are converted to pixel strings for properties that
 * typically use pixels.
 *
 * @param iframe - The iframe element to style
 * @param style - Object containing CSS property-value pairs
 *
 * @internal
 */
function applyStyles(
  iframe: HTMLIFrameElement,
  style: IframeStyles
): void {
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined) continue;

    // Convert camelCase to kebab-case for CSS properties
    const cssValue = typeof value === 'number' ? `${value}px` : value;
    iframe.style.setProperty(
      key.replace(/([A-Z])/g, '-$1').toLowerCase(),
      cssValue
    );
  }
}

/**
 * Applies HTML attributes to an iframe element.
 *
 * @internal
 */
function applyAttributes(
  iframe: HTMLIFrameElement,
  attributes: IframeAttributes
): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue;

    if (typeof value === 'boolean') {
      if (value) {
        iframe.setAttribute(key, '');
      }
      continue;
    }

    iframe.setAttribute(key, value);
  }
}

/**
 * Applies the default security sandbox when one was not explicitly provided.
 *
 * @internal
 */
function applyDefaultSandbox(
  iframe: HTMLIFrameElement,
  attributes: IframeAttributes
): void {
  if (attributes.sandbox !== undefined) {
    return;
  }

  iframe.setAttribute(
    'sandbox',
    'allow-scripts allow-same-origin allow-forms allow-popups'
  );
}


/**
 * Retrieves the content dimensions from an iframe for auto-resize functionality.
 *
 * @remarks
 * This function attempts to read the actual content dimensions from the iframe's
 * document. It calculates the maximum of various dimension properties (`scrollWidth`,
 * `offsetWidth`, `clientWidth`, etc.) from both the body and documentElement to
 * ensure accurate measurements across different browsers.
 *
 * This function will return `null` if:
 * - The iframe's content document is not accessible (cross-origin restrictions)
 * - Any error occurs while reading dimensions
 *
 * @param iframe - The iframe element to measure
 * @returns The content dimensions, or `null` if dimensions cannot be determined
 *
 * @example
 * ```typescript
 * const dimensions = getIframeContentDimensions(iframe);
 * if (dimensions) {
 *   resizeIframe(iframe, dimensions);
 * }
 * ```
 *
 * @public
 */
export function getIframeContentDimensions(
  iframe: HTMLIFrameElement
): Dimensions | null {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return null;

    const body = doc.body;
    const html = doc.documentElement;

    return {
      width: Math.max(
        body.scrollWidth,
        body.offsetWidth,
        html.clientWidth,
        html.scrollWidth,
        html.offsetWidth
      ),
      height: Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight
      ),
    };
  } catch {
    // Cross-origin access denied
    return null;
  }
}
