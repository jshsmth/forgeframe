/**
 * Encodes camelCase CSS names and treats every numeric configured value as pixels.
 * No unitless-property inference or DOM mutation occurs here.
 * @internal
 */
export function encodeIframeStyle(
	key: string,
	value: string | number,
): { property: string; value: string } {
	return {
		property: key.replace(/([A-Z])/g, "-$1").toLowerCase(),
		value: typeof value === "number" ? `${value}px` : value,
	};
}

/**
 * Encodes `true` as an empty HTML attribute; `false` and `undefined` skip the write.
 * Skipping a write does not request removal of an existing attribute.
 * @internal
 */
export function encodeIframeAttribute(
	value: string | boolean | undefined,
): string | undefined {
	if (value === undefined || value === false) return undefined;
	return value === true ? "" : value;
}
