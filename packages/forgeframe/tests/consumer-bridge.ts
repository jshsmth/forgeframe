import type { MessageHandler } from "@/communication/messenger";
import { MESSAGE_NAME } from "@/constants";

type HandlerSource = Parameters<MessageHandler>[1];

/** Origin of the default test component URL, `https://host.example.com/widget`. */
export const HOST_ORIGIN = "https://host.example.com";

/** A browser-verified message source for host content opened at {@link HOST_ORIGIN}. */
export function hostSource(window: Window): HandlerSource {
	return { uid: "host-uid", domain: HOST_ORIGIN, window };
}

/** Reads the callback ID of `prop` from the props update at `index` sent to the host. */
export function sentCallbackId(
	sendSpy: { mock: { calls: unknown[][] } },
	index: number,
	prop: string,
): string {
	const updates = sendSpy.mock.calls.filter(
		(args) => args[2] === MESSAGE_NAME.PROPS,
	);
	const update = updates[index]?.[3] as
		| Record<string, { __id__: string }>
		| undefined;
	const ref = update?.[prop];
	if (!ref) throw new Error(`No callback "${prop}" in props update ${index}`);
	return ref.__id__;
}

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
