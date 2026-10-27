/**
 * Generates a unique identifier by combining a timestamp with a random string.
 *
 * @returns A unique identifier string in the format `{timestamp}_{random}`
 *
 * @remarks
 * The UID is composed of two parts separated by an underscore:
 * - A base-36 encoded timestamp from `Date.now()`
 * - A random base-36 string from 64 bits of `crypto.getRandomValues()`
 *
 * This combination provides both temporal ordering and collision resistance.
 *
 * @example
 * ```typescript
 * const id = generateUID();
 * // Returns something like: "lxyz123_abc456def"
 * ```
 *
 * @internal
 */
export function generateUID(): string {
	const timestamp = Date.now().toString(36);
	return `${timestamp}_${randomBase36()}`;
}

/**
 * Generates a short unique identifier suitable for function references and internal use.
 *
 * @returns A random 14-character base-36 string (64 bits)
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
 * @internal
 */
export function generateShortUID(): string {
	return randomBase36();
}

/**
 * 64 bits from the platform CSPRNG in base 36. Session, message and callback
 * ids are not secrets, since origin and source checks guard every message,
 * but unpredictable ids keep a forged message from guessing a live one.
 */
function randomBase36(): string {
	const [high = 0, low = 0] = crypto.getRandomValues(new Uint32Array(2));
	// Each 32-bit word fills 7 base-36 digits, so the halves never run together.
	return high.toString(36).padStart(7, "0") + low.toString(36).padStart(7, "0");
}
