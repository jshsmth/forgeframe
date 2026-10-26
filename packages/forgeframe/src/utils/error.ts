/**
 * Converts arbitrary thrown values without letting diagnostic coercion fail.
 * A value that is not an `Error` becomes the `cause` of the returned one.
 * @internal
 */
export function normalizeError(value: unknown): Error {
	try {
		return value instanceof Error
			? value
			: new Error(String(value), { cause: value });
	} catch {
		return new Error("Unknown error", { cause: value });
	}
}
