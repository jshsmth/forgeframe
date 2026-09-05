import type { Dimensions } from "../types/utility";
import { normalizeDimensionToNumber } from "../utils/dimension";

/**
 * Configuration options for opening a popup window.
 *
 * @public
 */
export interface PopupOptions {
	/**
	 * The URL to load in the popup window.
	 */
	url: string;

	/**
	 * The name/target for the popup window.
	 *
	 * @remarks
	 * This is used as the window name for `window.open()`. If a window with
	 * this name already exists, the URL will be loaded in that window.
	 */
	name: string;

	/**
	 * The dimensions for the popup window.
	 *
	 * @remarks
	 * String dimension values will be parsed as integers (e.g., `'500px'` becomes `500`).
	 * If a dimension cannot be parsed, a default of 500 pixels is used.
	 */
	dimensions: Dimensions;
}

/**
 * Error thrown when a popup window is blocked by the browser.
 *
 * @remarks
 * Modern browsers block popup windows that are not triggered by direct user
 * interaction (e.g., click events). This error is thrown by {@link openPopup}
 * when the browser prevents the popup from opening.
 *
 * @example
 * ```typescript
 * try {
 *   const popup = openPopup({ ... });
 * } catch (error) {
 *   if (error instanceof PopupOpenError) {
 *     alert('Please allow popups for this site');
 *   }
 * }
 * ```
 *
 * @public
 */
export class PopupOpenError extends Error {
	constructor(message = "Popup blocked by browser") {
		super(message);
		this.name = "PopupOpenError";
	}
}

/**
 * Opens a popup window centered on the screen with the specified options.
 *
 * @remarks
 * This function creates a popup window using `window.open()` with sensible
 * defaults for security and usability:
 * - The popup is centered relative to the parent window
 * - The location bar is always shown (required for security)
 * - The popup is resizable and has scrollbars
 * - Menu bar, toolbar, and status bar are hidden
 *
 * If the popup is blocked by the browser (e.g., due to popup blockers or
 * lack of user interaction), a {@link PopupOpenError} is thrown.
 *
 * @param options - Configuration options for the popup
 * @returns The opened Window object
 * @throws {@link PopupOpenError} If the popup is blocked by the browser
 *
 * @example
 * ```typescript
 * // Open a popup for authentication
 * try {
 *   const authPopup = openPopup({
 *     url: 'https://auth.example.com/login',
 *     name: 'auth-popup',
 *     dimensions: { width: 500, height: 600 }
 *   });
 *
 *   // Watch for the popup to close
 *   watchPopupClose(authPopup, () => {
 *     console.log('Authentication completed');
 *   });
 * } catch (error) {
 *   if (error instanceof PopupOpenError) {
 *     // Handle blocked popup
 *   }
 * }
 * ```
 *
 * @public
 */
export function openPopup(options: PopupOptions): Window {
	const { url, name, dimensions } = options;

	const width = normalizeDimensionToNumber(dimensions.width, 500);
	const height = normalizeDimensionToNumber(dimensions.height, 500);

	const left = Math.floor(window.screenX + (window.outerWidth - width) / 2);
	const top = Math.floor(window.screenY + (window.outerHeight - height) / 2);

	const features = [
		`width=${width}`,
		`height=${height}`,
		`left=${left}`,
		`top=${top}`,
		"menubar=no",
		"toolbar=no",
		"location=yes", // Required for security
		"status=no",
		"resizable=yes",
		"scrollbars=yes",
	].join(",");

	const win = window.open(url, name, features);

	if (!win || isPopupBlocked(win)) {
		throw new PopupOpenError();
	}

	return win;
}

/**
 * Closes a popup window if it is still open.
 *
 * @remarks
 * This function safely closes a popup window by first checking if it is
 * already closed. Any errors during the close operation (e.g., due to
 * cross-origin restrictions) are silently ignored.
 *
 * @param win - The popup Window object to close
 *
 * @example
 * ```typescript
 * const popup = openPopup({ ... });
 * // Later, when done:
 * closePopup(popup);
 * ```
 *
 * @public
 */
export function closePopup(win: Window): void {
	try {
		if (!win.closed) {
			win.close();
		}
	} catch {
		// Close may fail cross-origin
	}
}

/**
 * Brings a popup window to the foreground by focusing it.
 *
 * @remarks
 * This function attempts to focus a popup window if it is still open.
 * Any errors during the focus operation are silently ignored, as some
 * browsers may restrict focusing windows in certain contexts.
 *
 * @param win - The popup Window object to focus
 *
 * @example
 * ```typescript
 * // Refocus the popup when user clicks a button
 * button.addEventListener('click', () => {
 *   focusPopup(popup);
 * });
 * ```
 *
 * @public
 */
export function focusPopup(win: Window): void {
	try {
		if (!win.closed) {
			win.focus();
		}
	} catch {
		// Focus may fail cross-origin
	}
}

/**
 * Checks if a popup window was blocked by the browser.
 *
 * @remarks
 * This function uses multiple heuristics to detect blocked popups:
 * - `null` window reference indicates the popup was blocked
 * - Attempting to access properties on a blocked popup throws an error
 * - Some browsers return a window with zero dimensions when blocked
 *
 * @param win - The Window object to check, or `null` if the popup failed to open
 * @returns `true` if the popup appears to be blocked, `false` otherwise
 *
 * @example
 * ```typescript
 * const win = window.open(url, name, features);
 * if (isPopupBlocked(win)) {
 *   console.error('Popup was blocked by the browser');
 * }
 * ```
 *
 * @public
 */
export function isPopupBlocked(win: Window | null): boolean {
	if (!win) return true;

	try {
		// Try to access a property - blocked popups throw errors
		if (win.closed) return true;

		// Some browsers return a window that's not really usable
		if (win.innerHeight === 0 || win.innerWidth === 0) return true;

		return false;
	} catch {
		return true;
	}
}

/**
 * Watches a popup window and invokes a callback when it closes.
 *
 * @remarks
 * This function polls the popup window's `closed` property using exponential
 * backoff - starting with fast checks and slowing down over time. This approach
 * catches quick closes immediately while reducing CPU usage for long-running popups.
 *
 * If the window becomes inaccessible (e.g., due to navigation to a different
 * origin), the callback is also invoked and polling stops.
 *
 * @param win - The popup Window object to watch
 * @param callback - Function to call when the popup closes
 * @param options - Optional configuration for polling intervals
 * @returns A cleanup function that stops watching when called
 *
 * @example
 * ```typescript
 * const popup = openPopup({ ... });
 *
 * const stopWatching = watchPopupClose(popup, () => {
 *   console.log('Popup was closed');
 *   // Handle post-close logic (e.g., check authentication state)
 * });
 *
 * // Optionally stop watching early
 * stopWatching();
 * ```
 *
 * @public
 */
export function watchPopupClose(
	win: Window,
	callback: () => void,
	options: {
		initialInterval?: number;
		maxInterval?: number;
		multiplier?: number;
	} = {},
): () => void {
	const {
		initialInterval = 100, // Start fast to catch quick closes
		maxInterval = 2000, // Cap at 2 seconds
		multiplier = 1.5, // Exponential backoff multiplier
	} = options;

	let currentInterval = initialInterval;
	let timer: ReturnType<typeof setTimeout>;
	let stopped = false;

	const invokeCallback = (): void => {
		try {
			callback();
		} catch (err) {
			console.error("Error in popup close callback:", err);
		}
	};

	const check = (): void => {
		if (stopped) return;

		try {
			if (win.closed) {
				invokeCallback();
				return;
			}
		} catch {
			// Window might be inaccessible (cross-origin navigation)
			invokeCallback();
			return;
		}

		// Schedule next check with exponential backoff
		currentInterval = Math.min(currentInterval * multiplier, maxInterval);
		timer = setTimeout(check, currentInterval);
	};

	timer = setTimeout(check, currentInterval);

	return () => {
		stopped = true;
		clearTimeout(timer);
	};
}

/**
 * Resizes a popup window to the specified dimensions.
 *
 * @remarks
 * This function attempts to resize the popup window using `window.resizeTo()`.
 * Some browsers may restrict window resizing for security reasons, in which
 * case errors are silently ignored.
 *
 * If a dimension is not specified, the current window dimension is preserved.
 *
 * @param win - The popup Window object to resize
 * @param dimensions - The new dimensions for the popup
 *
 * @example
 * ```typescript
 * resizePopup(popup, { width: 800, height: 600 });
 * ```
 *
 * @public
 */
export function resizePopup(win: Window, dimensions: Dimensions): void {
	try {
		const width = normalizeDimensionToNumber(dimensions.width, win.outerWidth);
		const height = normalizeDimensionToNumber(
			dimensions.height,
			win.outerHeight,
		);
		win.resizeTo(width, height);
	} catch {
		// Resize might be blocked
	}
}
