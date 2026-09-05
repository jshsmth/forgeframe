import type { DomainMatcher } from "../types/utility";
import {
	compileWildcardDomainPattern,
	testDomainRegExpStateless,
} from "../utils/domain-pattern";

/**
 * Gets the domain (origin) of the specified window.
 *
 * @param win - The window to get the domain from. Defaults to the current window.
 * @returns The origin string (e.g., "https://example.com") or an empty string if cross-origin access is denied.
 *
 * @remarks
 * This function safely handles cross-origin windows by catching security exceptions
 * and returning an empty string instead of throwing.
 *
 * @example
 * ```typescript
 * // Get current window's domain
 * const domain = getDomain();
 *
 * // Get an iframe's domain
 * const iframeDomain = getDomain(iframe.contentWindow);
 * ```
 *
 * @public
 */
export function getDomain(win: Window = window): string {
	try {
		return win.location.origin;
	} catch {
		return "";
	}
}

/**
 * Checks if a window is from the same domain as a reference window.
 *
 * @param win - The window to check.
 * @param reference - The reference window to compare against. Defaults to the current window.
 * @returns `true` if both windows share the same origin, `false` otherwise.
 *
 * @remarks
 * This function compares the origin of both windows. If cross-origin access
 * throws a security exception, it returns `false`.
 *
 * @example
 * ```typescript
 * // Check if an iframe is same-origin
 * if (isSameDomain(iframe.contentWindow)) {
 *   // Safe to access iframe's DOM directly
 * }
 * ```
 *
 * @public
 */
export function isSameDomain(win: Window, reference: Window = window): boolean {
	try {
		return win.location.origin === reference.location.origin;
	} catch {
		return false;
	}
}

/**
 * Checks if a domain matches a given pattern.
 *
 * @param pattern - The pattern to match against. Can be a string (exact match or `"*"` wildcard),
 *                  a RegExp, or an array of patterns.
 * @param domain - The domain string to test.
 * @returns `true` if the domain matches the pattern, `false` otherwise.
 *
 * @remarks
 * Pattern matching rules:
 * - `"*"` matches any domain
 * - String patterns without wildcards require exact match
 * - String patterns with `*` use wildcard matching (for example, `'https://*.example.com'`)
 * - RegExp patterns are evaluated statelessly so global/sticky flags do not leak `lastIndex` across calls
 * - Array patterns return `true` if any element matches (OR logic)
 *
 * @example
 * ```typescript
 * // Wildcard - matches everything
 * matchDomain('*', 'https://example.com'); // true
 *
 * // Exact match
 * matchDomain('https://example.com', 'https://example.com'); // true
 *
 * // Wildcard string match
 * matchDomain('https://*.example.com', 'https://sub.example.com'); // true
 *
 * // RegExp match
 * matchDomain(/\.example\.com$/, 'https://sub.example.com'); // true
 *
 * // Array of patterns
 * matchDomain(['https://a.com', 'https://b.com'], 'https://b.com'); // true
 * ```
 *
 * @public
 */
export function matchDomain(pattern: DomainMatcher, domain: string): boolean {
	if (typeof pattern === "string") {
		if (pattern === "*") return true;
		const wildcardPattern = compileWildcardDomainPattern(pattern);
		if (wildcardPattern) {
			return testDomainRegExpStateless(wildcardPattern, domain);
		}
		return pattern === domain;
	}

	if (pattern instanceof RegExp) {
		return testDomainRegExpStateless(pattern, domain);
	}

	if (Array.isArray(pattern)) {
		return pattern.some((p) => matchDomain(p, domain));
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
 * @public
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
 * @param win - The popup window. Defaults to the current window.
 * @returns The opener window, or `null` if not a popup or cross-origin access is denied.
 *
 * @remarks
 * The opener is the window that called `window.open()` to create this popup.
 * This function safely handles cross-origin errors.
 *
 * @example
 * ```typescript
 * // In a popup window
 * const parent = getOpener();
 * if (parent) {
 *   // Communicate with opener
 * }
 * ```
 *
 * @public
 */
export function getOpener(win: Window = window): Window | null {
	try {
		return win.opener;
	} catch {
		return null;
	}
}

/**
 * Gets the consumer window for an iframe (the embedding app).
 *
 * @param win - The iframe window. Defaults to the current window.
 * @returns The consumer window, or `null` if not in an iframe or cross-origin access is denied.
 *
 * @remarks
 * Returns `null` if the window is the top-level window (i.e., `parent === self`).
 * This function safely handles cross-origin errors.
 *
 * @example
 * ```typescript
 * // In an iframe (host)
 * const consumer = getConsumer();
 * if (consumer) {
 *   // Communicate with consumer frame
 * }
 * ```
 *
 * @public
 */
export function getConsumer(win: Window = window): Window | null {
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
 * Gets the top-level window in the frame hierarchy.
 *
 * @param win - The window to get the top from. Defaults to the current window.
 * @returns The top-level window, or `null` if cross-origin access is denied.
 *
 * @remarks
 * The top window is the outermost window in a nested iframe hierarchy.
 * This function safely handles cross-origin errors.
 *
 * @example
 * ```typescript
 * const topWindow = getTop();
 * if (topWindow === window) {
 *   console.log('We are the top-level window');
 * }
 * ```
 *
 * @public
 */
export function getTop(win: Window = window): Window | null {
	try {
		return win.top;
	} catch {
		return null;
	}
}

/**
 * Checks if the specified window is running inside an iframe.
 *
 * @param win - The window to check. Defaults to the current window.
 * @returns `true` if the window is in an iframe, `false` if it's the top-level window.
 *
 * @remarks
 * A window is considered to be in an iframe if `parent !== self`.
 * If cross-origin access throws an exception, returns `true` as a conservative assumption.
 *
 * @example
 * ```typescript
 * if (isIframe()) {
 *   console.log('Running inside an iframe');
 * } else {
 *   console.log('Running as top-level window');
 * }
 * ```
 *
 * @public
 */
export function isIframe(win: Window = window): boolean {
	try {
		return win.parent !== win;
	} catch {
		return true;
	}
}

/**
 * Checks if the specified window is a popup (opened via `window.open()`).
 *
 * @param win - The window to check. Defaults to the current window.
 * @returns `true` if the window has an opener (is a popup), `false` otherwise.
 *
 * @remarks
 * A popup window is one that was opened using `window.open()` and has an `opener` reference.
 * This function safely handles cross-origin errors by returning `false`.
 *
 * @example
 * ```typescript
 * if (isPopup()) {
 *   console.log('This window was opened as a popup');
 * }
 * ```
 *
 * @public
 */
export function isPopup(win: Window = window): boolean {
	try {
		return win.opener !== null && win.opener !== undefined;
	} catch {
		return false;
	}
}

/**
 * Gets an ancestor window at a specific distance in the frame hierarchy.
 *
 * @param win - The starting window. Defaults to the current window.
 * @param distance - The number of levels to traverse up. 1 = consumer, 2 = grandparent, etc.
 * @returns The ancestor window at the specified distance, or `null` if not found.
 *
 * @remarks
 * This function traverses up the parent chain the specified number of times.
 * Returns `null` if the chain ends before reaching the target distance.
 *
 * @example
 * ```typescript
 * // Get the grandparent window (2 levels up)
 * const grandparent = getAncestor(window, 2);
 *
 * // Get the consumer window (equivalent to getConsumer())
 * const consumer = getAncestor(window, 1);
 * ```
 *
 * @public
 */
export function getAncestor(
	win: Window = window,
	distance: number,
): Window | null {
	let current: Window | null = win;

	for (let i = 0; i < distance; i++) {
		current = getConsumer(current);
		if (!current) return null;
	}

	return current;
}

/**
 * Calculates the distance (number of levels) from a host window to a consumer window.
 *
 * @param host - The host window to start from.
 * @param consumer - The target consumer window.
 * @returns The number of levels between host and consumer, or `-1` if the consumer is not an ancestor.
 *
 * @remarks
 * This function traverses up the parent chain from the host window, counting levels
 * until it finds the target consumer. Has a safety limit of 100 levels to prevent infinite loops.
 *
 * @example
 * ```typescript
 * // If iframe is nested 2 levels deep
 * const distance = getDistanceToConsumer(iframe.contentWindow, window.top);
 * console.log(distance); // 2
 *
 * // If not an ancestor
 * const notFound = getDistanceToConsumer(windowA, windowB);
 * console.log(notFound); // -1
 * ```
 *
 * @public
 */
export function getDistanceToConsumer(host: Window, consumer: Window): number {
	let current: Window | null = host;
	let distance = 0;

	while (current) {
		if (current === consumer) {
			return distance;
		}
		current = getConsumer(current);
		distance++;

		if (distance > 100) {
			break;
		}
	}

	return -1;
}

/**
 * Attempts to focus a window.
 *
 * @param win - The window to focus.
 *
 * @remarks
 * This function safely attempts to focus the specified window.
 * Focus may fail silently due to browser restrictions or cross-origin policies.
 *
 * @example
 * ```typescript
 * const popup = window.open('https://example.com');
 * focusWindow(popup);
 * ```
 *
 * @public
 */
export function focusWindow(win: Window): void {
	try {
		win.focus();
	} catch {
		// May fail cross-origin
	}
}

/**
 * Attempts to close a window.
 *
 * @param win - The window to close.
 *
 * @remarks
 * This function safely attempts to close the specified window.
 * Close may fail silently due to browser restrictions (e.g., scripts can only
 * close windows they opened).
 *
 * @example
 * ```typescript
 * const popup = window.open('https://example.com');
 * // Later, close the popup
 * closeWindow(popup);
 * ```
 *
 * @public
 */
export function closeWindow(win: Window): void {
	try {
		win.close();
	} catch {
		// May fail cross-origin
	}
}

/**
 * Gets all child frames (iframes) within a window.
 *
 * @param win - The window to get frames from. Defaults to the current window.
 * @returns An array of Window objects representing the child frames.
 *
 * @remarks
 * This function iterates over the window's frames collection and returns them as an array.
 * If cross-origin access is denied, returns an empty array.
 *
 * @example
 * ```typescript
 * const childFrames = getFrames();
 * console.log(`Found ${childFrames.length} iframes`);
 *
 * childFrames.forEach((frame, index) => {
 *   console.log(`Frame ${index}:`, getDomain(frame));
 * });
 * ```
 *
 * @public
 */
export function getFrames(win: Window = window): Window[] {
	const frames: Window[] = [];

	try {
		for (let i = 0; i < win.frames.length; i++) {
			frames.push(win.frames[i] as Window);
		}
	} catch {
		// Cross-origin errors result in returning an empty array
	}

	return frames;
}
