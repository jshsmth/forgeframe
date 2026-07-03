/**
 * @packageDocumentation
 * Message protocol for ForgeFrame communication.
 *
 * @remarks
 * This module defines the message format and serialization for cross-domain
 * communication. Messages are prefixed to identify ForgeFrame traffic.
 */

import type { Message } from './types';
import { MESSAGE_TYPE } from '../constants';

/**
 * Protocol prefix to identify ForgeFrame messages.
 * @public
 */
export const PROTOCOL_PREFIX = 'forgeframe:';

/**
 * Serializes a message for postMessage transmission.
 *
 * @param message - The message to serialize
 * @returns JSON string prefixed with the protocol identifier
 *
 * @public
 */
export function serializeMessage(message: Message): string {
  return PROTOCOL_PREFIX + JSON.stringify(message);
}

/**
 * Deserializes a message from postMessage data.
 *
 * @param data - The raw data received from postMessage
 * @returns The parsed message, or null if not a valid ForgeFrame message
 *
 * @public
 */
export function deserializeMessage(data: unknown): Message | null {
  if (typeof data !== 'string') return null;
  if (!data.startsWith(PROTOCOL_PREFIX)) return null;

  try {
    const json = data.slice(PROTOCOL_PREFIX.length);
    const message = JSON.parse(json) as Message;

    if (!message.id || !message.type || !message.name || !message.source) {
      return null;
    }

    return message;
  } catch {
    return null;
  }
}

/**
 * Creates a request message.
 *
 * @param id - Unique message identifier
 * @param name - Message name/type
 * @param data - Message payload
 * @param source - Sender identification
 * @returns A formatted request message
 *
 * @public
 */
export function createRequestMessage(
  id: string,
  name: string,
  data: unknown,
  source: { uid: string; domain: string }
): Message {
  return {
    id,
    type: MESSAGE_TYPE.REQUEST,
    name,
    data,
    source,
  };
}

/**
 * Creates a response message.
 *
 * @param requestId - The ID of the request being responded to
 * @param data - Response payload
 * @param source - Sender identification
 * @param error - Optional error if the request failed
 * @returns A formatted response message
 *
 * @public
 */
export function createResponseMessage(
  requestId: string,
  data: unknown,
  source: { uid: string; domain: string },
  error?: Error
): Message {
  return {
    id: requestId,
    type: MESSAGE_TYPE.RESPONSE,
    name: 'response',
    data,
    source,
    error: error
      ? {
          message: error.message,
          stack: error.stack,
        }
      : undefined,
  };
}

/**
 * Creates an acknowledgement message.
 *
 * @param requestId - The ID of the request being acknowledged
 * @param source - Sender identification
 * @returns A formatted acknowledgement message
 *
 * @public
 */
export function createAckMessage(
  requestId: string,
  source: { uid: string; domain: string }
): Message {
  return {
    id: requestId,
    type: MESSAGE_TYPE.ACK,
    name: 'ack',
    source,
  };
}
