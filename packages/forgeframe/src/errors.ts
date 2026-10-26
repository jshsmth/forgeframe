/**
 * @packageDocumentation
 * The one error class ForgeFrame raises, and its codes.
 */

/**
 * What kind of failure a {@link ForgeFrameError} reports.
 *
 * @remarks
 * - `POPUP_BLOCKED`: the browser refused to open the popup.
 * - `INIT_TIMEOUT`: the initial handshake did not complete in time. When the
 *   host reported why it failed, `cause` holds that reason.
 * - `VALIDATION`: invalid options, props, arguments or calls, and values
 *   that cannot cross windows, such as a `BigInt` or a cycle.
 * - `VERSION_MISMATCH`: the other window runs a ForgeFrame version that cannot
 *   talk to this one, such as a 1.x consumer, or a request this version does
 *   not know.
 * - `ORIGIN_REJECTED`: a trust policy refused an origin or a window.
 * - `CANCELLED`: the consumer's own `close()` interrupted `render()`.
 * - `CLOSED`: the instance, the host or the other window is gone or no longer
 *   answering.
 * - `CAPACITY`: a callback or payload size limit was reached.
 *
 * @public
 */
export type ForgeFrameErrorCode =
	| "POPUP_BLOCKED"
	| "INIT_TIMEOUT"
	| "VALIDATION"
	| "VERSION_MISMATCH"
	| "ORIGIN_REJECTED"
	| "CANCELLED"
	| "CLOSED"
	| "CAPACITY";

/** Every code once; the record type fails to compile if one is missing. */
const ERROR_CODES: Readonly<Record<ForgeFrameErrorCode, true>> = {
	POPUP_BLOCKED: true,
	INIT_TIMEOUT: true,
	VALIDATION: true,
	VERSION_MISMATCH: true,
	ORIGIN_REJECTED: true,
	CANCELLED: true,
	CLOSED: true,
	CAPACITY: true,
};

/**
 * An error ForgeFrame raised, with a `code` to branch on.
 *
 * @remarks
 * The `message` is for people and may change in any release; branch on
 * `code`. Minor releases may add codes, so keep a `default` branch. A code
 * this version does not know, received from a newer peer, arrives as a plain
 * `Error` with the peer's message. The standard `cause` holds the underlying failure, when there is
 * one. Errors thrown by your own callbacks, templates and URL functions reach
 * you unchanged, not wrapped in a `ForgeFrameError`.
 *
 * @example
 * ```typescript
 * try {
 *   await instance.render('#container', 'popup');
 * } catch (error) {
 *   if (error instanceof ForgeFrameError && error.code === 'POPUP_BLOCKED') {
 *     showAllowPopupsHint();
 *   }
 * }
 * ```
 *
 * @public
 */
export class ForgeFrameError extends Error {
	/** What kind of failure this is. */
	readonly code: ForgeFrameErrorCode;

	/**
	 * @param code - What kind of failure this is
	 * @param message - A description for people; not a contract
	 * @param options - `cause`, the underlying failure
	 */
	constructor(
		code: ForgeFrameErrorCode,
		message: string,
		options?: { cause?: unknown },
	) {
		super(message, options);
		this.name = "ForgeFrameError";
		this.code = code;
	}
}

/** Whether a value names one of the error codes, as a received code must. @internal */
export function isForgeFrameErrorCode(
	value: unknown,
): value is ForgeFrameErrorCode {
	return typeof value === "string" && Object.hasOwn(ERROR_CODES, value);
}

/**
 * Rebuilds an error received from the other window: a `ForgeFrameError` when
 * it carries a known code, otherwise a plain `Error` with its message.
 * @internal
 */
export function errorFromWire(message: string, code: unknown): Error {
	return isForgeFrameErrorCode(code)
		? new ForgeFrameError(code, message)
		: new Error(message);
}

/** The code to send with an error, or `undefined` for one ForgeFrame did not raise. @internal */
export function wireErrorCode(error: Error): ForgeFrameErrorCode | undefined {
	return error instanceof ForgeFrameError ? error.code : undefined;
}

/** Whether an error is a {@link ForgeFrameError} with the given code. @internal */
export function hasErrorCode(
	error: unknown,
	code: ForgeFrameErrorCode,
): boolean {
	return error instanceof ForgeFrameError && error.code === code;
}
