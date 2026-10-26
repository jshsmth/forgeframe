import { ForgeFrameError } from "../errors";

/**
 * `JSON.stringify` for values that cross windows. A value JSON cannot encode,
 * such as a `BigInt` or a cycle, makes the encoder throw a `TypeError`, which
 * becomes a `VALIDATION` error with the `TypeError` as `cause`. Any other
 * error, such as one a caller's own `toJSON()` throws, reaches the caller
 * unchanged.
 *
 * @param value - The value to encode
 * @param context - What is being sent, for the error message, such as
 * `"a URL or body parameter"`
 * @param replacer - Passed through to `JSON.stringify`
 * @internal
 */
export function stringifyForWire(
	value: unknown,
	context: string,
	replacer?: readonly string[],
): string | undefined {
	try {
		return JSON.stringify(value, replacer as string[] | undefined);
	} catch (error) {
		if (!(error instanceof TypeError)) throw error;
		const cause = error;
		throw new ForgeFrameError(
			"VALIDATION",
			`Cannot send ${context}: ${cause.message}`,
			{ cause },
		);
	}
}
