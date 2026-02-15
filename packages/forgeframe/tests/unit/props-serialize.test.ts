import { afterEach, describe, expect, it, vi } from 'vitest';
import { FunctionBridge } from '@/communication/bridge';
import { PROP_SERIALIZATION } from '@/constants';
import { prop } from '@/props/prop';
import { serializeProps, deserializeProps } from '@/props/serialize';
import type { Messenger } from '@/communication/messenger';

type GenericHandler = (...args: unknown[]) => unknown;

function createBridgeWithMessenger() {
  const handlers = new Map<string, GenericHandler>();
  const messenger = {
    send: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((name: string, handler: GenericHandler) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    }),
    destroy: vi.fn(),
  } as unknown as Messenger;

  return {
    messenger,
    bridge: new FunctionBridge(messenger),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Props serialization behavior', () => {
  it('should round-trip BASE64-serialized object props', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      metadata: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.BASE64,
      },
    };

    const serialized = serializeProps(
      { metadata: { amount: 10, nested: { complete: true } } },
      definitions,
      bridge
    ) as Record<string, unknown>;

    expect(serialized.metadata).toEqual(
      expect.objectContaining({
        __type__: 'base64',
      })
    );

    const deserialized = deserializeProps(
      serialized,
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as { metadata: { amount: number; nested: { complete: boolean } } };

    expect(deserialized.metadata).toEqual({
      amount: 10,
      nested: { complete: true },
    });
  });

  it('should round-trip DOTIFY-serialized nested object props', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      config: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };

    const serialized = serializeProps(
      { config: { user: { id: 'u_123' }, enabled: true } },
      definitions,
      bridge
    ) as Record<string, unknown>;
    const encoded = serialized.config as { __type__: string; __value__: string };

    expect(encoded.__type__).toBe('dotify');
    expect(encoded.__value__).toContain('user.id=');

    const deserialized = deserializeProps(
      serialized,
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as { config: { user: { id: string }; enabled: boolean } };

    expect(deserialized.config).toEqual({
      user: { id: 'u_123' },
      enabled: true,
    });
  });

  it('should preserve malformed BASE64 wrappers during deserialization fallback', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      payload: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.BASE64,
      },
    };
    const malformed = { __type__: 'base64', __value__: '%not-valid-base64%' };

    const deserialized = deserializeProps(
      { payload: malformed },
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as { payload: unknown };

    expect(deserialized.payload).toEqual(malformed);
  });

  it('should preserve malformed DOTIFY wrappers during deserialization fallback', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      payload: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };
    const malformed = { __type__: 'dotify', __value__: 'bad=%E0%A4%A' };

    const deserialized = deserializeProps(
      { payload: malformed },
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as { payload: unknown };

    expect(deserialized.payload).toEqual(malformed);
  });

  it('should skip undefined keys while serializing props', () => {
    const { bridge } = createBridgeWithMessenger();
    const serialized = serializeProps(
      {
        defined: 'ok',
        missing: undefined,
      },
      {
        defined: prop.string(),
        missing: prop.string().optional(),
      },
      bridge
    );

    expect(serialized).toEqual({ defined: 'ok' });
    expect('missing' in serialized).toBe(false);
  });
});
