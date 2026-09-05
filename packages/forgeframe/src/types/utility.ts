/**
 * Shared public utility types for ForgeFrame component configuration.
 */

/**
 * Pattern for matching domains in security configurations.
 *
 * @remarks
 * Can be a single domain string, a RegExp pattern, or an array of string/RegExp patterns.
 * String patterns support `*` wildcards (for example, `'https://*.example.com'`).
 *
 * @example
 * ```typescript
 * // Single domain
 * const domain: DomainMatcher = 'https://example.com';
 *
 * // RegExp pattern
 * const pattern: DomainMatcher = /^https:\/\/.*\.example\.com$/;
 *
 * // Multiple patterns (can mix strings and RegExp)
 * const domains: DomainMatcher = ['https://*.example.com', /^https:\/\/api\d+\.example\.com$/];
 * ```
 *
 * @public
 */
type DomainPattern = string | RegExp;
export type DomainMatcher = DomainPattern | DomainPattern[];

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
	/** Sandbox restrictions */
	sandbox?: string;
	/** Additional custom attributes */
	[key: string]: string | boolean | undefined;
}

/**
 * CSS styles that can be applied to the iframe element.
 *
 * @remarks
 * These styles are applied directly to the iframe's style property.
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

/**
 * Result of an eligibility check for component rendering.
 *
 * @public
 */
export interface EligibilityResult {
	/** Whether the component is eligible to render */
	eligible: boolean;
	/** Reason for ineligibility (if not eligible) */
	reason?: string;
}
