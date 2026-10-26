import { ForgeFrameError } from "../errors";

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

/** Attributes ForgeFrame writes itself, so `attributes` may not set them. */
const MANAGED_IFRAME_ATTRIBUTES = new Set(["name", "src", "srcdoc"]);

/**
 * Checks iframe attribute names in any letter case, as HTML folds them:
 * ForgeFrame manages `name`, `src` and `srcdoc`, and the sandbox has its own
 * component option. Anything but an attributes object, such as a computed
 * `attributes` function before it runs, has no names to check yet.
 * @throws Error naming the attribute
 * @internal
 */
export function assertIframeAttributeNames(attributes: unknown): void {
	if (typeof attributes !== "object" || attributes === null) return;
	for (const key of Object.keys(attributes)) {
		const name = key.toLowerCase();
		if (name === "sandbox") {
			throw new ForgeFrameError(
				"VALIDATION",
				`Iframe attribute "${key}" is not allowed; set the component's sandbox option instead`,
			);
		}
		if (MANAGED_IFRAME_ATTRIBUTES.has(name)) {
			throw new ForgeFrameError(
				"VALIDATION",
				`Iframe attribute "${key}" is managed by ForgeFrame`,
			);
		}
	}
}

/**
 * Sandbox tokens an iframe gets when its component sets no `sandbox`.
 * @internal
 */
export const DEFAULT_IFRAME_SANDBOX =
	"allow-scripts allow-same-origin allow-forms allow-popups";

/**
 * Tokens every custom sandbox needs, each with the reason. The host runs
 * script to call `initHost()`, and without `allow-same-origin` its document
 * has an opaque origin, which no allowlist matches.
 */
const REQUIRED_SANDBOX_TOKENS: ReadonlyArray<readonly [string, string]> = [
	["allow-scripts", "the host runs script to call initHost()"],
	[
		"allow-same-origin",
		"without it the host has an opaque origin, which ForgeFrame never trusts",
	],
];

/**
 * Checks a `sandbox` component option: omitted, `false`, or a token string
 * that keeps the tokens a host needs. Tokens are split on ASCII whitespace and
 * compared case-insensitively, as HTML does; unknown tokens are left to the
 * browser.
 * @throws Error naming the option or the missing token
 * @internal
 */
export function assertSandboxOption(value: unknown): void {
	if (value === undefined || value === false) return;
	if (typeof value !== "string") {
		throw new ForgeFrameError(
			"VALIDATION",
			"Component sandbox must be a string of sandbox tokens, or false to write no sandbox attribute",
		);
	}
	const tokens = new Set(value.toLowerCase().split(/[\t\n\f\r ]+/));
	for (const [token, reason] of REQUIRED_SANDBOX_TOKENS) {
		if (!tokens.has(token)) {
			throw new ForgeFrameError(
				"VALIDATION",
				`Component sandbox must include "${token}": ${reason}`,
			);
		}
	}
}

/**
 * Resolves the sandbox attribute an iframe gets from its component option:
 * the default tokens when omitted, the given tokens, or `null` for none.
 * @internal
 */
export function resolveIframeSandbox(
	option: string | false | undefined,
): string | null {
	if (option === false) return null;
	return option ?? DEFAULT_IFRAME_SANDBOX;
}
