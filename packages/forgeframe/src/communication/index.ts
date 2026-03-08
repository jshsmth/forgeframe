/**
 * @packageDocumentation
 * Cross-domain communication module for ForgeFrame.
 *
 * @remarks
 * This module provides the postMessage-based communication layer for
 * cross-domain consumer-host component interaction. It includes message
 * serialization, function bridging, and request/response handling.
 */

export { Messenger, type MessageHandler } from '#internal/communication/messenger';
export {
  FunctionBridge,
  serializeFunctions,
  deserializeFunctions,
} from '#internal/communication/bridge';
export {
  PROTOCOL_PREFIX,
  serializeMessage,
  deserializeMessage,
  createRequestMessage,
  createResponseMessage,
  createAckMessage,
} from '#internal/communication/protocol';
