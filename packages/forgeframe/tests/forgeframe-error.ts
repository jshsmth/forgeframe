import { expect } from "vitest";
import { ForgeFrameError, type ForgeFrameErrorCode } from "@/errors";

type MessageMatch = string | RegExp;

expect.extend({
	toBeForgeFrameError(
		received: unknown,
		code: ForgeFrameErrorCode,
		message?: MessageMatch,
	) {
		const pass =
			received instanceof ForgeFrameError &&
			received.code === code &&
			(message === undefined ||
				(typeof message === "string"
					? received.message.includes(message)
					: received.message.search(message) !== -1));
		const expected = `ForgeFrameError ${code}${message === undefined ? "" : ` with message ${this.utils.printExpected(message)}`}`;
		return {
			pass,
			message: () =>
				`expected ${this.utils.printReceived(received)} ${pass ? "not " : ""}to be a ${expected}`,
		};
	},
});

/** Vitest's own asymmetric matchers are typed this way. */
type AsymmetricMatcher = ReturnType<typeof expect.objectContaining>;

declare module "vitest" {
	/** `expect.extend` above registers the asymmetric form too. */
	interface AsymmetricMatchersContaining {
		toBeForgeFrameError(
			code: ForgeFrameErrorCode,
			message?: MessageMatch,
		): AsymmetricMatcher;
	}
}

/**
 * Matches a `ForgeFrameError` instance by its `code`, the contract callers
 * branch on, and optionally by message text (a substring or a pattern). Use
 * it wherever an error is expected: `toThrow`, `rejects.toThrow`, `toEqual`
 * and `toHaveBeenCalledWith`.
 */
export function forgeFrameError(
	code: ForgeFrameErrorCode,
	message?: string | RegExp,
): AsymmetricMatcher {
	// Omit an absent message so failure output reads toBeForgeFrameError<"CODE">.
	return message === undefined
		? expect.toBeForgeFrameError(code)
		: expect.toBeForgeFrameError(code, message);
}
