/**
 * Applies canonical keys to a shallow copy without mutating either input.
 * A key whose patch value is `undefined` is not supplied, so it is deleted:
 * normalization then applies its schema default again, leaves an optional
 * prop without a value, or rejects a required one. Nested values retain their
 * original references.
 * @internal
 */
export function mergePropPatch(
	previous: Record<string, unknown>,
	patch: Record<string, unknown>,
): Record<string, unknown> {
	const next = { ...previous };
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) Reflect.deleteProperty(next, key);
		else next[key] = value;
	}
	return next;
}

/**
 * Selects the keys an update must normalize: every defined key while a
 * construction failure is pending, otherwise only the patched keys.
 * @internal
 */
export function selectNormalizationKeys(
	patch: Record<string, unknown>,
	hasPendingNormalizationError: boolean,
): ReadonlySet<string> | undefined {
	return hasPendingNormalizationError ? undefined : new Set(Object.keys(patch));
}

/**
 * Overlays freshly normalized values on the current normalized snapshot.
 * Normalization returns every selected defined key, including those without a
 * value, so a reset key replaces its previous value.
 * @internal
 */
export function mergeNormalizedPatch<P extends Record<string, unknown>>(
	current: P,
	normalized: Record<string, unknown>,
): P {
	return { ...current, ...normalized };
}

/**
 * Selects defined own inputs for schema revalidation, skipping keys that the
 * current update has just normalized.
 * @internal
 */
export function definedInputKeys(
	props: Record<string, unknown>,
	excluded?: ReadonlySet<string>,
): Set<string> {
	return new Set(
		Object.keys(props).filter(
			(key) => props[key] !== undefined && !excluded?.has(key),
		),
	);
}

/**
 * Chooses the origin an update is delivered to: the host's verified or opened
 * origin once rendered, otherwise the origin of the URL the update resolves.
 * Teardown clears both origins only once the instance is closing, which the
 * caller checks first, so the update rejects as closed.
 * @internal
 */
export function selectUpdateDeliveryOrigin(
	rendered: boolean,
	hostOrigin: string | null,
	nextUrlOrigin: string,
): string {
	return (rendered && hostOrigin) || nextUrlOrigin;
}
