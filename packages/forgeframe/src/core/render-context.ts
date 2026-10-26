/**
 * @packageDocumentation
 * Render context policy shared by `create()` and `render()`.
 */

import { CONTEXT, type ContextType } from "../constants";

/**
 * Selects the requested context, or the fallback when none is given, and
 * checks that it names a rendering context.
 *
 * @param context - The requested context, if any
 * @param fallback - The context used when `context` is `undefined`
 * @param label - What the error names, such as `"Render context"`
 * @throws If the selected value is not `"iframe"` or `"popup"`
 * @internal
 */
export function resolveRenderContext(
	context: unknown,
	fallback: ContextType,
	label: string,
): ContextType {
	const selected = context ?? fallback;
	if (selected !== CONTEXT.IFRAME && selected !== CONTEXT.POPUP) {
		throw new Error(`${label} must be "iframe" or "popup"`);
	}
	return selected;
}
