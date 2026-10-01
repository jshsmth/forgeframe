/** Converts arbitrary thrown values without letting diagnostic coercion fail. @internal */
export function normalizeError(value: unknown): Error {
	try {
		return value instanceof Error ? value : new Error(String(value));
	} catch {
		return new Error("Unknown error");
	}
}
