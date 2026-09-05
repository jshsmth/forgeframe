/**
 * Generates a unique identifier by combining a timestamp with a random string.
 *
 * @returns A unique identifier string in the format `{timestamp}_{random}`
 *
 * @remarks
 * The UID is composed of two parts separated by an underscore:
 * - A base-36 encoded timestamp from `Date.now()`
 * - A random base-36 string of up to 9 characters
 *
 * This combination provides both temporal ordering and collision resistance.
 *
 * @example
 * ```typescript
 * const id = generateUID();
 * // Returns something like: "lxyz123_abc456def"
 * ```
 *
 * @public
 */
export function generateUID(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 11);
  return `${timestamp}_${random}`;
}

/**
 * Generates a short unique identifier suitable for function references and internal use.
 *
 * @returns A short random string of up to 9 characters
 *
 * @remarks
 * Unlike {@link generateUID}, this function does not include a timestamp component,
 * making it shorter but without temporal ordering guarantees. Use this for cases
 * where a compact identifier is preferred over strict uniqueness.
 *
 * @example
 * ```typescript
 * const shortId = generateShortUID();
 * // Returns something like: "abc456def"
 * ```
 *
 * @public
 */
export function generateShortUID(): string {
  return Math.random().toString(36).slice(2, 11);
}
