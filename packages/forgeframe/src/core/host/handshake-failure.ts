/**
 * @packageDocumentation
 * Classifies host start-up failures for `ready` and the `error` event.
 */

import { ForgeFrameError, hasErrorCode } from "../../errors";
import { normalizeError } from "../../utils/error";

/**
 * Gives a failed bootstrap or INIT exchange its code.
 *
 * @remarks
 * During the handshake, a request the consumer never answered (`CLOSED`, as a
 * timed-out acknowledgement) means the handshake timed out, so it becomes
 * `INIT_TIMEOUT` with the original as `cause`. Other ForgeFrame failures keep
 * their code; anything else is a `VALIDATION` failure of the exchange.
 * @internal
 */
export function toHandshakeFailure(error: unknown): ForgeFrameError {
	if (error instanceof ForgeFrameError && !hasErrorCode(error, "CLOSED"))
		return error;
	const cause = normalizeError(error);
	return hasErrorCode(error, "CLOSED")
		? new ForgeFrameError(
				"INIT_TIMEOUT",
				`The consumer did not complete the handshake: ${cause.message}`,
				{ cause },
			)
		: new ForgeFrameError("VALIDATION", cause.message, { cause });
}
