import type { MessageHandler } from "@/communication/messenger";
import { MESSAGE_NAME } from "@/constants";

type HandlerSource = Parameters<MessageHandler>[1];

/** Internal transport accessor that reaches the messenger's registered handlers. */
interface TransportWithMessenger {
	messenger: unknown;
}

/**
 * Invokes a consumer callback the way the host does, through the function
 * bridge's CALL handler, so tests can check whether a callback is still held.
 */
export function callConsumerCallback(
	transport: TransportWithMessenger,
	id: string,
	source: HandlerSource,
): unknown {
	const call = (
		transport.messenger as {
			handlers: Map<string, (data: unknown, source: HandlerSource) => unknown>;
		}
	).handlers.get(MESSAGE_NAME.CALL);
	if (!call) throw new Error("Missing bridge call handler");
	return call({ id, args: [] }, source);
}
