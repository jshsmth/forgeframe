/**
 * @packageDocumentation
 * Classifies host start-up failures for `ready` and the `error` event.
 */

import { isAcknowledgementTimeout } from "../../communication/messenger";
import { ForgeFrameError } from "../../errors";
import { normalizeError } from "../../utils/error";

/**
 * Gives a failed bootstrap or INIT exchange its code.
 *
 * @remarks
 * During the handshake, a request the consumer never answered (the
 * messenger's own acknowledgement timeout) means the handshake timed out, so
 * it becomes `INIT_TIMEOUT` with the original as `cause`. Other ForgeFrame
 * failures keep their code, including a `CLOSED` the consumer sent back;
 * anything else is a `VALIDATION` failure of the exchange.
 * @internal
 */
export function toHandshakeFailure(error: unknown): ForgeFrameError {
	if (isAcknowledgementTimeout(error)) {
		return new ForgeFrameError(
			"INIT_TIMEOUT",
			`The consumer did not complete the handshake: ${(error as Error).message}`,
			{ cause: error },
		);
	}
	if (error instanceof ForgeFrameError) return error;
	const cause = normalizeError(error);
	return new ForgeFrameError("VALIDATION", cause.message, { cause });
}
