import { ForgeFrameError } from "../errors";
import { normalizeError } from "./error";

/**
 * `JSON.stringify` for values that cross windows. A value JSON cannot encode,
 * such as a `BigInt` or a cycle, becomes a `VALIDATION` error with the
 * encoder's error as `cause`. Any other error thrown while encoding is
 * wrapped the same way, so a caller sees one code for an unsendable value.
 *
 * @param value - The value to encode
 * @param context - What is being sent, for the message, such as `"PROPS"`
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
		const cause = normalizeError(error);
		throw new ForgeFrameError(
			"VALIDATION",
			`Cannot send ${context}: ${cause.message}`,
			{ cause },
		);
	}
}
