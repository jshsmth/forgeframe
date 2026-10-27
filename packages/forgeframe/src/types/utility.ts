/**
 * Shared public utility types for ForgeFrame component configuration.
 */

/** One origin string or `RegExp` in an {@link OriginMatcher}. @internal */
type OriginPattern = string | RegExp;

/**
 * Pattern for matching origins in security configurations.
 *
 * @remarks
 * An origin is a scheme, host and port, such as `https://app.example.com`;
 * a bare host such as `example.com` never matches. Can be a single origin
 * string, a RegExp pattern, or an array of string/RegExp patterns. A string
 * is an exact origin or `'*'`, which matches any origin; the only wildcard is
 * a leading `*.` in the host, which stands for one or more labels, as in
 * `'https://*.example.com'`. Use a `RegExp` for anything else. Write an
 * exact origin as browsers report it: lowercase host, no default port.
 *
 * @example
 * ```typescript
 * // Single origin
 * const origin: OriginMatcher = 'https://example.com';
 *
 * // RegExp pattern
 * const pattern: OriginMatcher = /^https:\/\/.*\.example\.com$/;
 *
 * // Multiple patterns (can mix strings and RegExp)
 * const origins: OriginMatcher = ['https://*.example.com', /^https:\/\/api\d+\.example\.com$/];
 * ```
 *
 * @public
 */
export type OriginMatcher = OriginPattern | readonly OriginPattern[];

/**
 * Component dimension specification.
 *
 * @remarks
 * Dimensions can be specified as CSS values (strings) or pixel numbers.
 *
 * @public
 */
export interface Dimensions {
	/** Width of the component (e.g., '100%', 400, '500px') */
	width?: string | number;
	/** Height of the component (e.g., '100%', 300, '400px') */
	height?: string | number;
}

/**
 * HTML attributes that can be applied to an iframe element.
 *
 * @remarks
 * These attributes are passed directly to the iframe element when rendering.
 *
 * @public
 */
export interface IframeAttributes {
	/** Title attribute for accessibility */
	title?: string;
	/** Permissions policy (e.g., 'camera; microphone') */
	allow?: string;
	/** Allow fullscreen mode */
	allowFullscreen?: boolean;
	/** Loading strategy */
	loading?: "lazy" | "eager";
	/** Referrer policy */
	referrerPolicy?: ReferrerPolicy;
	/** Not allowed: set the sandbox with the component's `sandbox` option. */
	sandbox?: never;
	/** Additional custom attributes */
	[key: string]: string | boolean | undefined;
}

/**
 * CSS styles that can be applied to the iframe element.
 *
 * @remarks
 * These styles are applied directly to the iframe's style property.
 * Numeric dimensional values use pixels; unitless CSS values keep their numeric meaning.
 * Custom property names preserve case and their values do not receive automatic units.
 * Common use cases include setting borders, shadows, border-radius, etc.
 *
 * @example
 * ```typescript
 * const styles: IframeStyles = {
 *   border: 'none',
 *   borderRadius: '8px',
 *   boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
 * };
 * ```
 *
 * @public
 */
export interface IframeStyles {
	/** CSS properties to apply to the iframe */
	[key: string]: string | number | undefined;
}
