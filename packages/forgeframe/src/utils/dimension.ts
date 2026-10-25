/**
 * @packageDocumentation
 * Dimension normalization utilities for consistent handling of width/height values.
 */

/**
 * Normalizes a dimension value to a CSS-compatible string.
 *
 * @remarks
 * Numeric values are converted to pixel strings (e.g., `400` becomes `'400px'`).
 * String values are returned as-is, allowing for units like `'100%'` or `'auto'`.
 * Undefined values fill the container (`'100%'`).
 *
 * @param value - The dimension value (number for pixels, string with units, or undefined)
 * @returns A CSS-compatible dimension string
 *
 * @example
 * ```typescript
 * normalizeDimensionToCSS(400);        // '400px'
 * normalizeDimensionToCSS('100%');     // '100%'
 * normalizeDimensionToCSS(undefined);  // '100%'
 * ```
 *
 * @internal
 */
export function normalizeDimensionToCSS(
	value: string | number | undefined,
): string {
	if (value === undefined) return "100%";
	if (typeof value === "number") return `${value}px`;
	return value;
}

/**
 * Normalizes a dimension value to a numeric pixel value.
 *
 * @remarks
 * This function is useful for popup window APIs that require numeric values.
 * Numeric strings and `px` strings are truncated to integer pixels.
 * Undefined, nonfinite, or nonpixel values return the fallback.
 *
 * @param value - The dimension value to normalize
 * @param fallback - The fallback value to use if normalization fails
 * @returns A numeric pixel value
 *
 * @example
 * ```typescript
 * normalizeDimensionToNumber(400, 500);      // 400
 * normalizeDimensionToNumber('500px', 500);  // 500
 * normalizeDimensionToNumber('100%', 500);   // 500 (cannot parse percentage)
 * normalizeDimensionToNumber(undefined, 500); // 500
 * ```
 *
 * @internal
 */
export function normalizeDimensionToNumber(
	value: string | number | undefined,
	fallback: number,
): number {
	if (value === undefined) return fallback;
	if (typeof value === "number")
		return Number.isFinite(value) ? value : fallback;

	const pixels = value.trim();
	if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/i.test(pixels)) return fallback;
	const parsed = Number.parseFloat(pixels);
	return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}
