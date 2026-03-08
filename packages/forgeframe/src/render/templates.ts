import type { TemplateContext, Dimensions } from '@/types';
import { normalizeDimensionToCSS } from '@/utils/dimension';

const SPINNER_STYLE_ID = 'forgeframe-spinner-style';

function ensureSpinnerKeyframes(doc: Document, nonce?: string): void {
  const existing = doc.getElementById(SPINNER_STYLE_ID);
  if (existing) {
    const existingNonce = existing.getAttribute('nonce');
    if (!nonce || existingNonce === nonce) {
      return;
    }
    existing.remove();
  }

  const style = doc.createElement('style');
  style.id = SPINNER_STYLE_ID;
  if (nonce) {
    style.setAttribute('nonce', nonce);
  }
  style.textContent = `
    @keyframes forgeframe-spin {
      to { transform: rotate(360deg); }
    }
  `;

  (doc.head ?? doc.documentElement).appendChild(style);
}

/**
 * Creates the default container element for ForgeFrame components.
 *
 * @remarks
 * This template creates a wrapper `<div>` element that holds the iframe or
 * popup content. The container is styled as an inline-block with relative
 * positioning to support absolute positioning of child elements like
 * prerender overlays.
 *
 * The container includes:
 * - A unique ID based on the component's UID
 * - A `data-forgeframe-tag` attribute for identification
 * - Base styles for dimensions and overflow handling
 *
 * @typeParam P - The props type for the component
 * @param ctx - The template context containing document, dimensions, and metadata
 * @returns The created container HTMLElement
 *
 * @example
 * ```typescript
 * const container = defaultContainerTemplate({
 *   doc: document,
 *   dimensions: { width: 400, height: 300 },
 *   uid: 'abc123',
 *   tag: 'payment-button',
 *   props: {}
 * });
 * document.body.appendChild(container);
 * ```
 *
 * @public
 */
export function defaultContainerTemplate<P>(
  ctx: TemplateContext<P>
): HTMLElement {
  const { doc, dimensions, uid, tag } = ctx;

  const container = doc.createElement('div');
  container.id = `forgeframe-container-${uid}`;
  container.setAttribute('data-forgeframe-tag', tag);

  Object.assign(container.style, {
    display: 'inline-block',
    position: 'relative',
    width: normalizeDimensionToCSS(dimensions.width),
    height: normalizeDimensionToCSS(dimensions.height),
    overflow: 'hidden',
  });

  return container;
}

/**
 * Creates the default prerender template showing a loading spinner.
 *
 * @remarks
 * This template creates an overlay element displayed while the actual
 * component content is loading. It includes:
 * - A centered wrapper with a light gray background
 * - An animated spinning loader
 * - CSS keyframes for the spin animation
 *
 * The overlay uses absolute positioning to cover the container and
 * a high z-index to appear above other content.
 *
 * If a CSP (Content Security Policy) nonce is provided, it will be
 * applied to the inline style element to comply with security policies.
 *
 * @typeParam P - The props type for the component
 * @param ctx - The template context with optional CSP nonce
 * @returns The created prerender overlay HTMLElement
 *
 * @example
 * ```typescript
 * const prerender = defaultPrerenderTemplate({
 *   doc: document,
 *   dimensions: { width: 400, height: 300 },
 *   uid: 'abc123',
 *   tag: 'payment-button',
 *   props: {},
 *   cspNonce: 'abc123xyz'
 * });
 * container.appendChild(prerender);
 * ```
 *
 * @public
 */
export function defaultPrerenderTemplate<P>(
  ctx: TemplateContext<P> & { cspNonce?: string }
): HTMLElement {
  const { doc, dimensions, cspNonce } = ctx;
  ensureSpinnerKeyframes(doc, cspNonce);

  const wrapper = doc.createElement('div');
  Object.assign(wrapper.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: normalizeDimensionToCSS(dimensions.width),
    height: normalizeDimensionToCSS(dimensions.height),
    backgroundColor: '#f5f5f5',
    position: 'absolute',
    top: '0',
    left: '0',
    zIndex: '100',
  });

  const spinner = doc.createElement('div');
  Object.assign(spinner.style, {
    width: '40px',
    height: '40px',
    border: '3px solid #e0e0e0',
    borderTopColor: '#3498db',
    borderRadius: '50%',
    animation: 'forgeframe-spin 1s linear infinite',
  });

  wrapper.appendChild(spinner);

  return wrapper;
}

/**
 * Applies width and height dimensions to an HTML element.
 *
 * @remarks
 * Only dimensions that are defined will be applied. Numeric values are
 * automatically converted to pixel strings. This function can be used
 * to resize any HTML element, not just iframes.
 *
 * @param element - The HTML element to apply dimensions to
 * @param dimensions - The dimensions object containing width and/or height
 *
 * @example
 * ```typescript
 * const div = document.createElement('div');
 * applyDimensions(div, { width: 400, height: 300 });
 * applyDimensions(div, { width: '100%' }); // Only width, height unchanged
 * ```
 *
 * @public
 */
export function applyDimensions(
  element: HTMLElement,
  dimensions: Dimensions
): void {
  if (dimensions.width !== undefined) {
    element.style.width = normalizeDimensionToCSS(dimensions.width);
  }
  if (dimensions.height !== undefined) {
    element.style.height = normalizeDimensionToCSS(dimensions.height);
  }
}

/**
 * Creates a `<style>` element with the provided CSS content.
 *
 * @remarks
 * This utility function creates an inline style element that can be appended
 * to the document. If a CSP (Content Security Policy) nonce is provided,
 * it will be set on the style element to allow the styles to be applied
 * in environments with strict CSP rules.
 *
 * @param doc - The Document object to create the element in
 * @param css - The CSS content to include in the style element
 * @param nonce - Optional CSP nonce for security compliance
 * @returns The created HTMLStyleElement
 *
 * @example
 * ```typescript
 * const style = createStyleElement(
 *   document,
 *   '.my-class { color: red; }',
 *   'abc123xyz'
 * );
 * document.head.appendChild(style);
 * ```
 *
 * @public
 */
export function createStyleElement(
  doc: Document,
  css: string,
  nonce?: string
): HTMLStyleElement {
  const style = doc.createElement('style');
  if (nonce) {
    style.setAttribute('nonce', nonce);
  }
  style.textContent = css;
  return style;
}

/**
 * Animates an element fading in from transparent to fully opaque.
 *
 * @remarks
 * This function applies a CSS opacity transition to create a smooth fade-in
 * effect. It sets the initial opacity to 0, triggers a reflow to ensure the
 * transition applies, then sets opacity to 1.
 *
 * The returned Promise resolves after the animation duration completes.
 * Note that the Promise uses `setTimeout` rather than `transitionend` events
 * for more predictable behavior across browsers.
 *
 * @param element - The HTML element to fade in
 * @param duration - Animation duration in milliseconds (default: 200)
 * @returns A Promise that resolves when the animation completes
 *
 * @example
 * ```typescript
 * const element = document.getElementById('my-element')!;
 * await fadeIn(element, 300);
 * console.log('Fade in complete');
 * ```
 *
 * @public
 */
export function fadeIn(element: HTMLElement, duration = 200): Promise<void> {
  return new Promise((resolve) => {
    element.style.opacity = '0';
    element.style.transition = `opacity ${duration}ms ease-in`;

    // Force reflow
    void element.offsetHeight;

    element.style.opacity = '1';

    setTimeout(resolve, duration);
  });
}

/**
 * Animates an element fading out from its current opacity to transparent.
 *
 * @remarks
 * This function applies a CSS opacity transition to create a smooth fade-out
 * effect. Unlike {@link fadeIn}, it does not force a reflow since the element
 * is already visible and the transition can begin immediately.
 *
 * The returned Promise resolves after the animation duration completes.
 * Note that this function only changes opacity; the element remains in the
 * DOM and may need to be removed or hidden separately after fading out.
 *
 * @param element - The HTML element to fade out
 * @param duration - Animation duration in milliseconds (default: 200)
 * @returns A Promise that resolves when the animation completes
 *
 * @example
 * ```typescript
 * const element = document.getElementById('my-element')!;
 * await fadeOut(element, 300);
 * element.remove(); // Remove after fade completes
 * ```
 *
 * @public
 */
export function fadeOut(element: HTMLElement, duration = 200): Promise<void> {
  return new Promise((resolve) => {
    element.style.transition = `opacity ${duration}ms ease-out`;
    element.style.opacity = '0';

    setTimeout(resolve, duration);
  });
}

/**
 * Swaps the prerender placeholder with the actual content using fade animations.
 *
 * @remarks
 * This function performs a smooth transition from the prerender loading state
 * to the actual content. The process:
 * 1. If a prerender element exists, fade it out and remove it from the DOM
 * 2. Set the actual content's initial opacity to 0
 * 3. Append the actual content to the container
 * 4. Fade in the actual content
 *
 * Both fade animations use a 150ms duration for a quick but smooth transition.
 *
 * @param container - The parent container element
 * @param prerenderElement - The prerender placeholder element, or `null` if none exists
 * @param actualElement - The actual content element to display
 * @returns A Promise that resolves when the swap animation completes
 *
 * @example
 * ```typescript
 * const container = document.getElementById('widget-container')!;
 * const prerender = container.querySelector('.prerender');
 * const iframe = createIframe({ ... });
 *
 * await swapPrerenderContent(container, prerender, iframe);
 * ```
 *
 * @public
 */
export async function swapPrerenderContent(
  _container: HTMLElement,
  prerenderElement: HTMLElement | null,
  actualElement: HTMLElement
): Promise<void> {
  if (prerenderElement) {
    await fadeOut(prerenderElement, 150);
    prerenderElement.remove();
  }

  actualElement.style.display = '';
  actualElement.style.visibility = 'visible';
  actualElement.style.opacity = '0';

  await fadeIn(actualElement, 150);
}
