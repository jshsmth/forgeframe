/** Requires an expected value without silently skipping work when it is absent. */
export function requireValue<T>(value: T): NonNullable<T> {
	if (value === null || value === undefined)
		throw new Error("Expected a defined value");
	return value;
}
