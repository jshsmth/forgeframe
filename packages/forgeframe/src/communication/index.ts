/**
 * @packageDocumentation
 * Internal source barrel for ForgeFrame communication primitives.
 *
 * @remarks
 * This file groups the postMessage protocol, function bridge, and messenger
 * internals for source organization. The published package does not expose a
 * `forgeframe/communication` subpath, so consumers should treat this barrel as
 * internal implementation structure.
 */

export {
	deserializeFunctions,
	FunctionBridge,
	serializeFunctions,
} from "./bridge";
export { type MessageHandler, Messenger } from "./messenger";
export {
	createRequestMessage,
	createResponseMessage,
	deserializeMessage,
	PROTOCOL_PREFIX,
	serializeMessage,
} from "./protocol";
