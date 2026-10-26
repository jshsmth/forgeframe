import type { OriginMatcher } from "../types/utility";
import {
	compileWildcardOriginPattern,
	testOriginRegExpStateless,
} from "../utils/origin-pattern";

/**
 * Gets the origin of the specified window.
 *
 * @param win - The window to get the origin from. Defaults to the current window.
 * @returns The origin string (e.g., "https://example.com") or an empty string if cross-origin access is denied.
 *
 * @remarks
 * This function safely handles cross-origin windows by catching security exceptions
 * and returning an empty string instead of throwing.
 *
 * @example
 * ```typescript
 * // Get current window's origin
 * const origin = getOrigin();
 *
 * // Get an iframe's origin
 * const iframeOrigin = getOrigin(iframe.contentWindow);
 * ```
 *
 * @internal
 */
export function getOrigin(win: Window = window): string {
	try {
		return win.location.origin;
	} catch {
		return "";
	}
}

/**
 * Checks if an origin matches a given pattern.
 *
 * @param pattern - The pattern to match against. Can be a string (exact match or `"*"` wildcard),
 *                  a RegExp, or an array of patterns.
 * @param origin - The origin string to test.
 * @returns `true` if the origin matches the pattern, `false` otherwise.
 *
 * @remarks
 * Pattern matching rules:
 * - `"*"` matches any origin
 * - String patterns without wildcards require exact match
 * - String patterns with `*` use wildcard matching (for example, `'https://*.example.com'`)
 * - RegExp patterns are evaluated statelessly so global/sticky flags do not leak `lastIndex` across calls
 * - Array patterns return `true` if any element matches (OR logic)
 *
 * @example
 * ```typescript
 * // Wildcard - matches everything
 * matchOrigin('*', 'https://example.com'); // true
 *
 * // Exact match
 * matchOrigin('https://example.com', 'https://example.com'); // true
 *
 * // Wildcard string match
 * matchOrigin('https://*.example.com', 'https://sub.example.com'); // true
 *
 * // RegExp match
 * matchOrigin(/\.example\.com$/, 'https://sub.example.com'); // true
 *
 * // Array of patterns
 * matchOrigin(['https://a.com', 'https://b.com'], 'https://b.com'); // true
 * ```
 *
 * @internal
 */
export function matchOrigin(pattern: OriginMatcher, origin: string): boolean {
	if (typeof pattern === "string") {
		if (pattern === "*") return true;
		const wildcardPattern = compileWildcardOriginPattern(pattern);
		if (wildcardPattern) {
			return testOriginRegExpStateless(wildcardPattern, origin);
		}
		return pattern === origin;
	}

	if (pattern instanceof RegExp) {
		return testOriginRegExpStateless(pattern, origin);
	}

	if (Array.isArray(pattern)) {
		return pattern.some((p) => matchOrigin(p, origin));
	}

	return false;
}

/**
 * Checks if a window is closed or inaccessible.
 *
 * @param win - The window to check, or `null`.
 * @returns `true` if the window is `null`, closed, or inaccessible; `false` otherwise.
 *
 * @remarks
 * This function safely handles cross-origin errors. If accessing the window's
 * `closed` property throws, the window is considered closed or inaccessible.
 *
 * @example
 * ```typescript
 * const popup = window.open('https://example.com');
 * // Later...
 * if (isWindowClosed(popup)) {
 *   console.log('Popup was closed');
 * }
 * ```
 *
 * @internal
 */
export function isWindowClosed(win: Window | null): boolean {
	if (!win) return true;

	try {
		return win.closed;
	} catch {
		return true;
	}
}

/**
 * Gets the opener window for a popup window.
 *
 * @param win - The popup window.
 * @returns The opener window, or `null` if not a popup or cross-origin access is denied.
 *
 * @remarks
 * The opener is the window that called `window.open()` to create this popup.
 * This function safely handles cross-origin errors.
 *
 * @example
 * ```typescript
 * // In a popup window
 * const parent = getOpener(window);
 * if (parent) {
 *   // Communicate with opener
 * }
 * ```
 *
 * @internal
 */
export function getOpener(win: Window): Window | null {
	try {
		return win.opener;
	} catch {
		return null;
	}
}

/**
 * Gets the consumer window for an iframe (the embedding app).
 *
 * @param win - The iframe window.
 * @returns The consumer window, or `null` if not in an iframe or cross-origin access is denied.
 *
 * @remarks
 * Returns `null` if the window is the top-level window (i.e., `parent === self`).
 * This function safely handles cross-origin errors.
 *
 * @example
 * ```typescript
 * // In an iframe (host)
 * const consumer = getConsumer(window);
 * if (consumer) {
 *   // Communicate with consumer frame
 * }
 * ```
 *
 * @internal
 */
export function getConsumer(win: Window): Window | null {
	try {
		const parent = win.parent;
		if (parent && parent !== win) {
			return parent;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Checks if the specified window is running inside an iframe.
 *
 * @param win - The window to check.
 * @returns `true` if the window is in an iframe, `false` if it's the top-level window.
 *
 * @remarks
 * A window is considered to be in an iframe if `parent !== self`.
 * If cross-origin access throws an exception, returns `true` as a conservative assumption.
 *
 * @example
 * ```typescript
 * if (isIframe(window)) {
 *   console.log('Running inside an iframe');
 * } else {
 *   console.log('Running as top-level window');
 * }
 * ```
 *
 * @internal
 */
export function isIframe(win: Window): boolean {
	try {
		return win.parent !== win;
	} catch {
		return true;
	}
}

/**
 * Checks if the specified window is a popup (opened via `window.open()`).
 *
 * @param win - The window to check.
 * @returns `true` if the window has an opener (is a popup), `false` otherwise.
 *
 * @remarks
 * A popup window is one that was opened using `window.open()` and has an `opener` reference.
 * This function safely handles cross-origin errors by returning `false`.
 *
 * @example
 * ```typescript
 * if (isPopup(window)) {
 *   console.log('This window was opened as a popup');
 * }
 * ```
 *
 * @internal
 */
export function isPopup(win: Window): boolean {
	try {
		return win.opener !== null && win.opener !== undefined;
	} catch {
		return false;
	}
}

/**
 * Resolves once a window's document has focus, or after `timeoutMs`.
 *
 * @remarks
 * A focus request from another window can reach this document after it was
 * acknowledged, and some engines ignore `focus()` inside an unfocused
 * cross-origin frame. Waiting lets the caller focus an element afterwards.
 *
 * @internal
 */
export function waitForWindowFocus(
	win: Window,
	timeoutMs: number,
): Promise<void> {
	// A hidden document cannot gain focus, so there is nothing to wait for.
	if (win.document.hasFocus() || win.document.visibilityState === "hidden")
		return Promise.resolve();
	return new Promise((resolve) => {
		const done = (): void => {
			win.removeEventListener("focus", done);
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(done, timeoutMs);
		win.addEventListener("focus", done);
	});
}
