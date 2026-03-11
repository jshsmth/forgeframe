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

export { Messenger, type MessageHandler } from './messenger';
export {
  FunctionBridge,
  serializeFunctions,
  deserializeFunctions,
} from './bridge';
export {
  PROTOCOL_PREFIX,
  serializeMessage,
  deserializeMessage,
  createRequestMessage,
  createResponseMessage,
  createAckMessage,
} from './protocol';
