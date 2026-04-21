/**
 * Unit tests for `@/props/serialize` serialization modes.
 *
 * Covers BASE64/DOTIFY round-trips, malformed wrapper fallback behavior, and undefined key omission in payload serialization.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FunctionBridge } from '@/communication/bridge';
import { PROP_SERIALIZATION } from '@/constants';
import { prop } from '@/props/prop';
import { serializeProps, deserializeProps } from '@/props/serialize';
import type { Messenger } from '@/communication/messenger';
import type { SerializedProps } from '@/types';

type GenericHandler = (...args: unknown[]) => unknown;

/**
 * Creates a bridge paired with a messenger mock that captures registered handlers.
 */
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
  it('should round-trip Date props through the default serializer', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const publishedAt = new Date('2026-01-02T03:04:05.678Z');
    const definitions = {
      publishedAt: prop.date(),
    };

    const serialized = serializeProps(
      { publishedAt },
      definitions,
      bridge
    ) as Record<string, unknown>;

    expect(serialized.publishedAt).toEqual({
      __type__: 'date',
      __value__: publishedAt.toJSON(),
    });

    const deserialized = deserializeProps(
      serialized,
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as { publishedAt: Date };

    expect(deserialized.publishedAt).toBeInstanceOf(Date);
    expect(deserialized.publishedAt.toISOString()).toBe(publishedAt.toISOString());
  });

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

  it('should round-trip BASE64-serialized Date values nested in objects', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const publishedAt = new Date('2026-01-02T03:04:05.678Z');
    const definitions = {
      metadata: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.BASE64,
      },
    };

    const serialized = serializeProps(
      {
        metadata: {
          publishedAt,
          nested: {
            updatedAt: publishedAt,
          },
        },
      },
      definitions,
      bridge
    ) as Record<string, unknown>;

    const deserialized = deserializeProps(
      serialized,
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as { metadata: { publishedAt: Date; nested: { updatedAt: Date } } };

    expect(deserialized.metadata.publishedAt).toBeInstanceOf(Date);
    expect(deserialized.metadata.publishedAt.toISOString()).toBe(publishedAt.toISOString());
    expect(deserialized.metadata.nested.updatedAt).toBeInstanceOf(Date);
    expect(deserialized.metadata.nested.updatedAt.toISOString()).toBe(publishedAt.toISOString());
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
    expect(encoded.__value__).toContain('__forgeframe.dotify_path__:');
    expect(encoded.__value__).not.toContain('user.id=');

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

  it('should round-trip DOTIFY-serialized Date values nested in objects', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const publishedAt = new Date('2026-01-02T03:04:05.678Z');
    const definitions = {
      config: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };

    const serialized = serializeProps(
      {
        config: {
          publishedAt,
          nested: {
            updatedAt: publishedAt,
          },
        },
      },
      definitions,
      bridge
    ) as Record<string, unknown>;

    const deserialized = deserializeProps(
      serialized,
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as { config: { publishedAt: Date; nested: { updatedAt: Date } } };

    expect(deserialized.config.publishedAt).toBeInstanceOf(Date);
    expect(deserialized.config.publishedAt.toISOString()).toBe(publishedAt.toISOString());
    expect(deserialized.config.nested.updatedAt).toBeInstanceOf(Date);
    expect(deserialized.config.nested.updatedAt.toISOString()).toBe(publishedAt.toISOString());
  });

  it('should round-trip DOTIFY-serialized nested empty object branches', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      config: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };

    const serialized = serializeProps(
      {
        config: {
          settings: {
            filters: {},
          },
        },
      },
      definitions,
      bridge
    ) as Record<string, unknown>;

    const deserialized = deserializeProps(
      serialized,
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as { config: { settings: { filters: Record<string, unknown> } } };

    expect(deserialized.config).toEqual({
      settings: {
        filters: {},
      },
    });
  });

  it('should round-trip DOTIFY-serialized empty object branches with sibling values', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      payload: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };

    const serialized = serializeProps(
      {
        payload: {
          metadata: {},
          nested: {
            empty: {},
            flag: true,
          },
          version: 2,
        },
      },
      definitions,
      bridge
    ) as Record<string, unknown>;

    const deserialized = deserializeProps(
      serialized,
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as {
      payload: {
        metadata: Record<string, unknown>;
        nested: { empty: Record<string, unknown>; flag: boolean };
        version: number;
      };
    };

    expect(deserialized.payload).toEqual({
      metadata: {},
      nested: {
        empty: {},
        flag: true,
      },
      version: 2,
    });
  });

  it('should round-trip entirely empty DOTIFY object payloads', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      payload: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };

    const serialized = serializeProps(
      {
        payload: {},
      },
      definitions,
      bridge
    ) as Record<string, unknown>;
    const encoded = serialized.payload as { __type__: string; __value__: string };

    expect(encoded).toEqual({
      __type__: 'dotify',
      __value__: '__forgeframe.dotify_empty_object__',
    });

    const deserialized = deserializeProps(
      serialized,
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as { payload: Record<string, unknown> };

    expect(deserialized.payload).toEqual({});
  });

  it('should preserve real values that serialize to the old empty-object marker shape', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      payload: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };

    class MarkerValue {
      toJSON() {
        return {
          ['__forgeframe.dotify_empty_object_marker__']: true,
        };
      }
    }

    const serialized = serializeProps(
      {
        payload: {
          weird: new MarkerValue(),
        },
      },
      definitions,
      bridge
    ) as Record<string, unknown>;

    const deserialized = deserializeProps(
      serialized,
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as {
      payload: {
        weird: Record<string, unknown>;
      };
    };

    expect(deserialized.payload.weird).toEqual({
      ['__forgeframe.dotify_empty_object_marker__']: true,
    });
  });

  it('should omit nested undefined DOTIFY values instead of deserializing them as strings', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      payload: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };

    const serialized = serializeProps(
      {
        payload: {
          present: true,
          nested: {
            missing: undefined,
            kept: 'value',
          },
        },
      },
      definitions,
      bridge
    ) as Record<string, unknown>;

    const deserialized = deserializeProps(
      serialized,
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as {
      payload: {
        present: boolean;
        nested: { kept: string; missing?: unknown };
      };
    };

    expect(deserialized.payload).toEqual({
      present: true,
      nested: {
        kept: 'value',
      },
    });
    expect('missing' in deserialized.payload.nested).toBe(false);
  });

  it('should round-trip DOTIFY-serialized object props with dotted and reserved keys', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      config: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };

    const serialized = serializeProps(
      {
        config: {
          'user.id': {
            'plan=tier': 'pro',
            'feature&flag': true,
          },
          nested: {
            'literal%key': 'preserved',
          },
        },
      },
      definitions,
      bridge
    ) as Record<string, unknown>;
    const encoded = serialized.config as { __type__: string; __value__: string };

    expect(encoded.__type__).toBe('dotify');
    expect(encoded.__value__).toContain('__forgeframe.dotify_path__:');
    expect(encoded.__value__).not.toContain('user.id=');
    expect(encoded.__value__).not.toContain('feature&flag');

    const deserialized = deserializeProps(
      serialized,
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as {
      config: {
        'user.id': {
          'plan=tier': string;
          'feature&flag': boolean;
        };
        nested: {
          'literal%key': string;
        };
      };
    };

    expect(deserialized.config).toEqual({
      'user.id': {
        'plan=tier': 'pro',
        'feature&flag': true,
      },
      nested: {
        'literal%key': 'preserved',
      },
    });
  });

  it('should round-trip keys that look like JSON arrays', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      payload: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };

    const serialized = serializeProps(
      {
        payload: {
          '["a"]': 'value',
        },
      },
      definitions,
      bridge
    ) as Record<string, unknown>;

    const deserialized = deserializeProps(
      serialized,
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as { payload: Record<string, unknown> };

    expect(deserialized.payload).toEqual({
      '["a"]': 'value',
    });
  });

  it('should preserve unframed DOTIFY wrappers during deserialization fallback', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      payload: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };
    const legacyWrapper = {
      __type__: 'dotify',
      __value__: '["a"]=%22value%22',
    };

    const deserialized = deserializeProps(
      {
        payload: legacyWrapper,
      },
      definitions,
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as { payload: unknown };

    expect(deserialized.payload).toEqual(legacyWrapper);
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

  it('should preserve empty-path DOTIFY wrappers during deserialization fallback', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      payload: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };
    const malformed = {
      __type__: 'dotify',
      __value__: '__forgeframe.dotify_path__:%5B%5D=1',
    };

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

  it('should preserve malformed empty-object-path DOTIFY wrappers during deserialization fallback', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      payload: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };
    const malformed = {
      __type__: 'dotify',
      __value__:
        '__forgeframe.dotify_empty_object_path__:%5B%22payload%22%2C%22empty%22%5D=false',
    };

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

  it('should block __proto__ while preserving safe top-level keys during deserialization', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const serialized: SerializedProps = {
      safe: 'ok',
      ['__proto__']: 'unsafe',
      constructor: 'allowed-constructor',
      prototype: 'allowed-prototype',
    };

    const deserialized = deserializeProps(
      serialized,
      { safe: prop.string() },
      messenger,
      bridge,
      window,
      'https://consumer.example.com'
    ) as Record<string, unknown>;

    expect(deserialized.safe).toBe('ok');
    expect(Object.getPrototypeOf(deserialized)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(deserialized, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(deserialized, 'constructor')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(deserialized, 'prototype')).toBe(true);
    expect(deserialized.constructor).toBe('allowed-constructor');
    expect(deserialized.prototype).toBe('allowed-prototype');
  });

  it('should block __proto__ DOTIFY paths while preserving constructor/prototype keys', () => {
    const { messenger, bridge } = createBridgeWithMessenger();
    const definitions = {
      payload: {
        schema: prop.object(),
        serialization: PROP_SERIALIZATION.DOTIFY,
      },
    };
    const prototypePollutionKey = '__forgeframe_dotify_polluted__';

    delete (Object.prototype as Record<string, unknown>)[prototypePollutionKey];
    try {
      const deserialized = deserializeProps(
        {
          payload: {
            __type__: 'dotify',
            __value__: [
              '__forgeframe.dotify_path__:%5B%22safe%22%2C%22value%22%5D=1',
              `__forgeframe.dotify_path__:%5B%22__proto__%22%2C%22${prototypePollutionKey}%22%5D=true`,
              '__forgeframe.dotify_path__:%5B%22constructor%22%2C%22prototype%22%2C%22version%22%5D=%22v1%22',
            ].join('&'),
          },
        },
        definitions,
        messenger,
        bridge,
        window,
        'https://consumer.example.com'
      ) as { payload: Record<string, unknown> };

      expect(
        (Object.prototype as Record<string, unknown>)[prototypePollutionKey]
      ).toBeUndefined();
      expect(deserialized.payload).toEqual({
        constructor: {
          prototype: {
            version: 'v1',
          },
        },
        safe: {
          value: 1,
        },
      });
    } finally {
      delete (Object.prototype as Record<string, unknown>)[prototypePollutionKey];
    }
  });
});
