/**
 * Removes a prop's supplied value so normalization can apply its fallback again.
 * Unlike explicit `undefined`, this marker deletes the key from the next snapshot.
 * @internal
 */
export const PROP_RESET = Symbol("forgeframe.prop-reset");

/**
 * Applies canonical keys to a shallow copy without mutating either input.
 * `PROP_RESET` deletes a key; explicit `undefined` remains an own property.
 * Nested values retain their original references.
 * @internal
 */
export function mergePropPatch(
	previous: Record<string, unknown>,
	patch: Record<string, unknown>,
): Record<string, unknown> {
	const next = { ...previous };
	for (const [key, value] of Object.entries(patch)) {
		if (value === PROP_RESET) Reflect.deleteProperty(next, key);
		else next[key] = value;
	}
	return next;
}

/** Selects defined own inputs for schema revalidation. @internal */
export function definedInputKeys(
	props: Record<string, unknown>,
	candidates: Iterable<string> = Object.keys(props),
): Set<string> {
	return new Set(
		[...candidates].filter(
			(key) => Object.hasOwn(props, key) && props[key] !== undefined,
		),
	);
}
