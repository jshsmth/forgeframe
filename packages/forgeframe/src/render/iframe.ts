import type {
	Dimensions,
	IframeAttributes,
	IframeStyles,
} from "../types/utility";
import {
	assertIframeAttributeNames,
	encodeIframeAttribute,
	encodeIframeStyle,
} from "./iframe-configuration";
import { applyDimensions } from "./templates";

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

	/**
	 * The sandbox attribute to write, as `resolveIframeSandbox` decided it, or
	 * `null` to write none.
	 */
	sandbox: string | null;
}

/**
 * Creates a configured iframe element without appending it or setting `src`.
 *
 * @internal
 */
export function createIframeElement(
	options: IframeElementOptions,
): HTMLIFrameElement {
	const { name, dimensions, attributes = {}, style = {}, sandbox } = options;
	assertIframeAttributeNames(attributes);
	const iframe = document.createElement("iframe");

	iframe.name = name;
	iframe.setAttribute("frameborder", "0");
	iframe.setAttribute("allowtransparency", "true");
	iframe.setAttribute("scrolling", "auto");

	applyDimensions(iframe, dimensions);
	applyAttributes(iframe, attributes);
	applyStyles(iframe, style);
	applySandbox(iframe, sandbox);

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
 * const iframe = createIframeElement({ name, dimensions });
 * // Later, when done with the iframe:
 * destroyIframe(iframe);
 * ```
 *
 * @internal
 */
export function destroyIframe(iframe: HTMLIFrameElement): void {
	try {
		iframe.src = "about:blank";
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
 * @internal
 */
export function resizeIframe(
	iframe: HTMLIFrameElement,
	dimensions: Dimensions,
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
 * @internal
 */
export function showIframe(iframe: HTMLIFrameElement): void {
	iframe.style.display = "";
	iframe.style.visibility = "visible";
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
 * @internal
 */
export function hideIframe(iframe: HTMLIFrameElement): void {
	iframe.style.display = "none";
	iframe.style.visibility = "hidden";
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
 * @internal
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
function applyStyles(iframe: HTMLIFrameElement, style: IframeStyles): void {
	for (const [key, value] of Object.entries(style)) {
		if (value === undefined) continue;

		const encoded = encodeIframeStyle(key, value);
		iframe.style.setProperty(encoded.property, encoded.value);
	}
}

/**
 * Applies HTML attributes to an iframe element.
 *
 * @internal
 */
function applyAttributes(
	iframe: HTMLIFrameElement,
	attributes: IframeAttributes,
): void {
	for (const [key, value] of Object.entries(attributes)) {
		const encoded = encodeIframeAttribute(value);
		if (encoded !== undefined) iframe.setAttribute(key, encoded);
	}
}

/**
 * Writes the resolved sandbox attribute, or none for `null`.
 *
 * @internal
 */
function applySandbox(iframe: HTMLIFrameElement, sandbox: string | null): void {
	if (sandbox !== null) iframe.setAttribute("sandbox", sandbox);
}
