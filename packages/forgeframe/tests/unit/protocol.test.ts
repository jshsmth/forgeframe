/**
 * Unit tests for `#internal/communication/protocol` message helpers.
 *
 * Covers protocol prefixing, serialization/deserialization validation, message factory helpers, and round-trip integrity.
 */
import { describe, it, expect } from 'vitest';
import {
  serializeMessage,
  deserializeMessage,
  createRequestMessage,
  createResponseMessage,
  createAckMessage,
  PROTOCOL_PREFIX,
} from '#internal/communication/protocol';
import { MESSAGE_TYPE } from '#internal/constants';

describe('PROTOCOL_PREFIX', () => {
  it('should equal the forgeframe protocol prefix literal', () => {
    expect(PROTOCOL_PREFIX).toBe('forgeframe:');
  });
});

describe('serializeMessage', () => {
  it('should prefix message with protocol identifier', () => {
    const message = createRequestMessage('id-1', 'test', { data: 'value' }, {
      uid: 'sender-uid',
      domain: 'https://sender.com',
    });

    const serialized = serializeMessage(message);

    expect(serialized.startsWith(PROTOCOL_PREFIX)).toBe(true);
  });

  it('should JSON stringify message', () => {
    const message = createRequestMessage('id-1', 'test', { key: 'value' }, {
      uid: 'uid',
      domain: 'https://example.com',
    });

    const serialized = serializeMessage(message);
    const json = serialized.slice(PROTOCOL_PREFIX.length);

    expect(JSON.parse(json)).toEqual(message);
  });
});

describe('deserializeMessage', () => {
  it('should return null for non-string data', () => {
    expect(deserializeMessage(123)).toBeNull();
    expect(deserializeMessage(null)).toBeNull();
    expect(deserializeMessage(undefined)).toBeNull();
    expect(deserializeMessage({})).toBeNull();
  });

  it('should return null for non-prefixed string', () => {
    expect(deserializeMessage('not a forgeframe message')).toBeNull();
    expect(deserializeMessage('{"type": "request"}')).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    expect(deserializeMessage(`${PROTOCOL_PREFIX}not valid json`)).toBeNull();
  });

  it('should return null for missing required fields', () => {
    expect(deserializeMessage(`${PROTOCOL_PREFIX}{}`)).toBeNull();
    expect(deserializeMessage(`${PROTOCOL_PREFIX}{"id": "1"}`)).toBeNull();
    expect(deserializeMessage(`${PROTOCOL_PREFIX}{"id": "1", "type": "request"}`)).toBeNull();
  });

  it('should parse valid message', () => {
    const message = createRequestMessage('id-1', 'greeting', { name: 'World' }, {
      uid: 'sender-uid',
      domain: 'https://sender.com',
    });

    const serialized = serializeMessage(message);
    const parsed = deserializeMessage(serialized);

    expect(parsed).toEqual(message);
  });
});

describe('createRequestMessage', () => {
  it('should create request message with correct type', () => {
    const message = createRequestMessage('msg-123', 'testAction', { foo: 'bar' }, {
      uid: 'component-uid',
      domain: 'https://origin.com',
    });

    expect(message.id).toBe('msg-123');
    expect(message.type).toBe(MESSAGE_TYPE.REQUEST);
    expect(message.name).toBe('testAction');
    expect(message.data).toEqual({ foo: 'bar' });
    expect(message.source.uid).toBe('component-uid');
    expect(message.source.domain).toBe('https://origin.com');
  });

  it('should handle undefined data', () => {
    const message = createRequestMessage('msg-123', 'noData', undefined, {
      uid: 'uid',
      domain: 'https://example.com',
    });

    expect(message.data).toBeUndefined();
  });
});

describe('createResponseMessage', () => {
  it('should create response message with correct type', () => {
    const message = createResponseMessage('req-456', { result: 'success' }, {
      uid: 'responder-uid',
      domain: 'https://responder.com',
    });

    expect(message.id).toBe('req-456');
    expect(message.type).toBe(MESSAGE_TYPE.RESPONSE);
    expect(message.name).toBe('response');
    expect(message.data).toEqual({ result: 'success' });
    expect(message.source.uid).toBe('responder-uid');
    expect(message.source.domain).toBe('https://responder.com');
    expect(message.error).toBeUndefined();
  });

  it('should include error when provided', () => {
    const error = new Error('Something went wrong');
    error.stack = 'Error: Something went wrong\n    at test';

    const message = createResponseMessage('req-456', null, {
      uid: 'responder-uid',
      domain: 'https://responder.com',
    }, error);

    expect(message.error).toBeDefined();
    expect(message.error?.message).toBe('Something went wrong');
    expect(message.error?.stack).toContain('Something went wrong');
  });

  it('should not include error when not provided', () => {
    const message = createResponseMessage('req-456', { data: 'value' }, {
      uid: 'uid',
      domain: 'https://example.com',
    });

    expect(message.error).toBeUndefined();
  });
});

describe('createAckMessage', () => {
  it('should create ack message with correct type', () => {
    const message = createAckMessage('req-789', {
      uid: 'acker-uid',
      domain: 'https://acker.com',
    });

    expect(message.id).toBe('req-789');
    expect(message.type).toBe(MESSAGE_TYPE.ACK);
    expect(message.name).toBe('ack');
    expect(message.source.uid).toBe('acker-uid');
    expect(message.source.domain).toBe('https://acker.com');
    expect(message.data).toBeUndefined();
  });
});

describe('round-trip serialization', () => {
  it('should preserve request message through serialization', () => {
    const original = createRequestMessage('id-1', 'complexAction', {
      nested: { deep: { value: 42 } },
      array: [1, 2, 3],
      special: 'unicode: \u00e9\u00e8\u00ea',
    }, {
      uid: 'test-uid',
      domain: 'https://test.com',
    });

    const serialized = serializeMessage(original);
    const deserialized = deserializeMessage(serialized);

    expect(deserialized).toEqual(original);
  });

  it('should preserve response message with error', () => {
    const error = new Error('Test error');
    const original = createResponseMessage('id-2', null, {
      uid: 'test-uid',
      domain: 'https://test.com',
    }, error);

    const serialized = serializeMessage(original);
    const deserialized = deserializeMessage(serialized);

    expect(deserialized?.error?.message).toBe('Test error');
  });
});
