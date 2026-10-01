/** CSS properties whose numeric values are counts, ratios, or other unitless values. */
const UNITLESS_CSS_PROPERTIES = new Set([
	"animation",
	"animation-iteration-count",
	"aspect-ratio",
	"border-image-outset",
	"border-image",
	"border-image-slice",
	"border-image-width",
	"box-flex",
	"box-flex-group",
	"box-ordinal-group",
	"column-count",
	"columns",
	"flex",
	"flex-grow",
	"flex-positive",
	"flex-shrink",
	"flex-negative",
	"flex-order",
	"flex-line-count",
	"grid-area",
	"grid-row",
	"grid-row-end",
	"grid-row-span",
	"grid-row-start",
	"grid-column",
	"grid-column-end",
	"grid-column-span",
	"grid-column-start",
	"font-weight",
	"font-size-adjust",
	"force-broken-image-icon",
	"hyphenate-limit-chars",
	"hyphenate-limit-after",
	"hyphenate-limit-before",
	"hyphenate-limit-lines",
	"initial-letter",
	"line-clamp",
	"line-height",
	"mask-border",
	"mask-border-slice",
	"mask-border-width",
	"mask-box-image",
	"mask-box-image-slice",
	"math-depth",
	"opacity",
	"order",
	"orphans",
	"reading-order",
	"scale",
	"shape-image-threshold",
	"tab-size",
	"widows",
	"z-index",
	"zoom",
	"fill-opacity",
	"flood-opacity",
	"stop-opacity",
	"stroke-dasharray",
	"stroke-dashoffset",
	"stroke-miterlimit",
	"stroke-opacity",
	"stroke-width",
]);

/**
 * Encodes CSS names and numeric lengths while preserving unitless values and custom properties.
 * @internal
 */
export function encodeIframeStyle(
	key: string,
	value: string | number,
): { property: string; value: string } {
	const customProperty = key.startsWith("--");
	const property = customProperty
		? key
		: key
				.replace(/([A-Z])/g, "-$1")
				.toLowerCase()
				.replace(/^ms-/, "-ms-");
	const unitless =
		customProperty ||
		UNITLESS_CSS_PROPERTIES.has(property.replace(/^-(?:webkit|moz|ms|o)-/, ""));
	return {
		property,
		value:
			typeof value === "number"
				? unitless
					? String(value)
					: `${value}px`
				: value,
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
