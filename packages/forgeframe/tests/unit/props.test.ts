/**
 * Unit tests for props normalization and host/query/body mapping utilities.
 *
 * Covers defaults/computed values, schema validation, host filtering rules, parameter conversion, and deep cloning behavior.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  normalizeProps,
  validateProps,
  getPropsForHost,
  propsToQueryParams,
  propsToBodyParams,
} from '@/props/normalize';
import { cloneProps } from '@/props/clone';
import { BUILTIN_PROP_DEFINITIONS } from '@/props/definitions';
import { prop } from '@/props/prop';
import { isStandardSchema } from '@/props/schema';
import type { PropsDefinition, PropContext } from '@/types';

const Float16ArrayCtor = (
  globalThis as typeof globalThis & {
    Float16Array?: new (length: number) => ArrayBufferView;
  }
).Float16Array;

describe('Props Normalization', () => {
  const createContext = <P extends Record<string, unknown>>(
    props: Partial<P> = {}
  ): PropContext<P> => ({
    props: props as P,
    uid: 'test-uid',
    tag: 'test-tag',
    close: vi.fn(),
    focus: vi.fn(),
    resize: vi.fn(),
    onError: vi.fn(),
    event: {
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
      off: vi.fn(),
      removeAllListeners: vi.fn(),
    },
  });

  it('should merge user props with defaults', () => {
    const definitions: PropsDefinition<{ name: string; count: number }> = {
      name: prop.string().default('default-name'),
      count: prop.number().default(0),
    };

    const result = normalizeProps(
      { name: 'custom-name' },
      definitions,
      createContext()
    );

    expect(result.name).toBe('custom-name');
    expect(result.count).toBe(0);
  });

  it('should handle function defaults', () => {
    const definitions: PropsDefinition<{ timestamp: number }> = {
      timestamp: {
        schema: prop.number(),
        default: () => 12345,
      },
    };

    const result = normalizeProps({}, definitions, createContext());

    expect(result.timestamp).toBe(12345);
  });

  it('should handle computed values', () => {
    const definitions: PropsDefinition<{ computed: string }> = {
      computed: {
        schema: prop.string(),
        value: (ctx) => `uid:${ctx.uid}`,
      },
    };

    const result = normalizeProps({}, definitions, createContext());

    expect(result.computed).toBe('uid:test-uid');
  });

  it('should handle prop aliases', () => {
    const definitions: PropsDefinition<{ email: string }> = {
      email: {
        schema: prop.string(),
        alias: 'userEmail',
      },
    };

    const result = normalizeProps(
      { userEmail: 'test@example.com' } as Record<string, unknown>,
      definitions,
      createContext()
    );

    expect(result.email).toBe('test@example.com');
  });

  it('should apply decorate function', () => {
    const definitions: PropsDefinition<{ name: string }> = {
      name: {
        schema: prop.string(),
        decorate: ({ value }) => (value as string).toUpperCase(),
      },
    };

    const result = normalizeProps(
      { name: 'hello' },
      definitions,
      createContext()
    );

    expect(result.name).toBe('HELLO');
  });

  it('should include builtin props', () => {
    const result = normalizeProps({}, {}, createContext());

    // Should have builtin props with defaults
    expect(result.dimensions).toBeDefined();
    expect(result.timeout).toBeDefined();
  });
});

describe('Props Validation', () => {
  it('should throw for missing required props', () => {
    const definitions: PropsDefinition<{ email: string }> = {
      email: { schema: prop.string(), required: true },
    };

    expect(() =>
      validateProps({ email: undefined } as unknown as { email: string }, definitions)
    ).toThrow('Prop "email" is required');
  });

  it('should throw for invalid type via schema', () => {
    const definitions: PropsDefinition<{ count: number }> = {
      count: prop.number(),
    };

    expect(() =>
      validateProps({ count: 'not a number' } as unknown as { count: number }, definitions)
    ).toThrow('Expected number');
  });

  it('should validate string type', () => {
    const definitions: PropsDefinition<{ name: string }> = {
      name: prop.string(),
    };

    expect(() => validateProps({ name: 'valid' }, definitions)).not.toThrow();
    expect(() =>
      validateProps({ name: 123 } as unknown as { name: string }, definitions)
    ).toThrow();
  });

  it('should validate boolean type', () => {
    const definitions: PropsDefinition<{ active: boolean }> = {
      active: prop.boolean(),
    };

    expect(() => validateProps({ active: true }, definitions)).not.toThrow();
    expect(() =>
      validateProps({ active: 'yes' } as unknown as { active: boolean }, definitions)
    ).toThrow();
  });

  it('should validate function type', () => {
    const definitions: PropsDefinition<{ callback: () => void }> = {
      callback: prop.function(),
    };

    expect(() => validateProps({ callback: () => {} }, definitions)).not.toThrow();
    expect(() =>
      validateProps({ callback: 'not a function' } as unknown as { callback: () => void }, definitions)
    ).toThrow();
  });

  it('should validate array type', () => {
    const definitions: PropsDefinition<{ items: string[] }> = {
      items: prop.array(),
    };

    expect(() => validateProps({ items: ['a', 'b'] }, definitions)).not.toThrow();
    expect(() =>
      validateProps({ items: 'not an array' } as unknown as { items: string[] }, definitions)
    ).toThrow();
  });

  it('should validate object type', () => {
    const definitions: PropsDefinition<{ data: Record<string, unknown> }> = {
      data: prop.object(),
    };

    expect(() => validateProps({ data: { key: 'value' } }, definitions)).not.toThrow();
    expect(() =>
      validateProps({ data: [1, 2, 3] } as unknown as { data: Record<string, unknown> }, definitions)
    ).toThrow(); // Arrays should not pass as objects
  });

  it('should call custom validate function', () => {
    const customValidate = vi.fn();
    const definitions: PropsDefinition<{ email: string }> = {
      email: {
        schema: prop.string(),
        validate: customValidate,
      },
    };

    validateProps({ email: 'test@example.com' }, definitions);

    expect(customValidate).toHaveBeenCalledWith({
      value: 'test@example.com',
      props: expect.any(Object),
    });
  });

  it('should skip undefined optional props with PropDefinition', () => {
    const definitions: PropsDefinition<{ optional?: string }> = {
      optional: { schema: prop.string().optional(), required: false },
    };

    expect(() =>
      validateProps({ optional: undefined } as { optional?: string }, definitions)
    ).not.toThrow();
  });

  it('should skip undefined optional props with direct schema', () => {
    const definitions: PropsDefinition<{ optional?: string }> = {
      optional: prop.string().optional(),
    };

    expect(() =>
      validateProps({ optional: undefined } as { optional?: string }, definitions)
    ).not.toThrow();
  });
});

describe('Props for Host', () => {
  it('should filter props with sendToHost: false', () => {
    const definitions: PropsDefinition<{ visible: string; hidden: string }> = {
      visible: { schema: prop.string(), sendToHost: true },
      hidden: { schema: prop.string(), sendToHost: false },
    };

    const result = getPropsForHost(
      { visible: 'yes', hidden: 'no' },
      definitions,
      'https://host.com',
      false
    );

    expect(result.visible).toBe('yes');
    expect(result.hidden).toBeUndefined();
  });

  it('should filter sameDomain props when cross-domain', () => {
    const definitions: PropsDefinition<{ secret: string }> = {
      secret: { schema: prop.string(), sameDomain: true },
    };

    const crossDomainResult = getPropsForHost(
      { secret: 'sensitive' },
      definitions,
      'https://other.com',
      false
    );

    const sameDomainResult = getPropsForHost(
      { secret: 'sensitive' },
      definitions,
      'https://consumer.com',
      true
    );

    expect(crossDomainResult.secret).toBeUndefined();
    expect(sameDomainResult.secret).toBe('sensitive');
  });

  it('should filter by trustedDomains', () => {
    const definitions: PropsDefinition<{ data: string }> = {
      data: {
        schema: prop.string(),
        trustedDomains: ['https://trusted.com', 'https://also-trusted.com'],
      },
    };

    const trustedResult = getPropsForHost(
      { data: 'value' },
      definitions,
      'https://trusted.com',
      false
    );

    const untrustedResult = getPropsForHost(
      { data: 'value' },
      definitions,
      'https://untrusted.com',
      false
    );

    expect(trustedResult.data).toBe('value');
    expect(untrustedResult.data).toBeUndefined();
  });

  it('should apply hostDecorate function', () => {
    const definitions: PropsDefinition<{ value: string }> = {
      value: {
        schema: prop.string(),
        hostDecorate: ({ value }) => `host:${value}`,
      },
    };

    const result = getPropsForHost(
      { value: 'test' },
      definitions,
      'https://host.com',
      false
    );

    expect(result.value).toBe('host:test');
  });
});

describe('Props to Query Params', () => {
  it('should convert props with queryParam: true', () => {
    const definitions: PropsDefinition<{ token: string; secret: string }> = {
      token: { schema: prop.string(), queryParam: true },
      secret: { schema: prop.string() },
    };

    const params = propsToQueryParams(
      { token: 'abc123', secret: 'hidden' },
      definitions
    );

    expect(params.get('token')).toBe('abc123');
    expect(params.get('secret')).toBeNull();
  });

  it('should use custom param name', () => {
    const definitions: PropsDefinition<{ userId: string }> = {
      userId: { schema: prop.string(), queryParam: 'user_id' },
    };

    const params = propsToQueryParams({ userId: '123' }, definitions);

    expect(params.get('user_id')).toBe('123');
  });

  it('should use custom transform function', () => {
    const definitions: PropsDefinition<{ data: { a: number } }> = {
      data: {
        schema: prop.object(),
        queryParam: ({ value }) => btoa(JSON.stringify(value)),
      },
    };

    const params = propsToQueryParams({ data: { a: 1 } }, definitions);

    expect(params.get('data')).toBe(btoa(JSON.stringify({ a: 1 })));
  });

  it('should JSON stringify objects', () => {
    const definitions: PropsDefinition<{ config: Record<string, unknown> }> = {
      config: { schema: prop.object(), queryParam: true },
    };

    const params = propsToQueryParams(
      { config: { key: 'value' } },
      definitions
    );

    expect(params.get('config')).toBe(JSON.stringify({ key: 'value' }));
  });

  it('should skip function props', () => {
    const definitions: PropsDefinition<{ callback: () => void }> = {
      callback: { schema: prop.function(), queryParam: true },
    };

    const params = propsToQueryParams({ callback: () => {} }, definitions);

    expect(params.get('callback')).toBeNull();
  });

  it('should skip undefined values', () => {
    const definitions: PropsDefinition<{ optional?: string }> = {
      optional: { schema: prop.string().optional(), queryParam: true },
    };

    const params = propsToQueryParams({ optional: undefined } as { optional?: string }, definitions);

    expect(params.get('optional')).toBeNull();
  });
});

describe('Props to Body Params', () => {
  it('should convert props with bodyParam: true', () => {
    const definitions: PropsDefinition<{ token: string; secret: string }> = {
      token: { schema: prop.string(), bodyParam: true },
      secret: { schema: prop.string() },
    };

    const params = propsToBodyParams(
      { token: 'abc123', secret: 'hidden' },
      definitions
    );

    expect(params.get('token')).toBe('abc123');
    expect(params.get('secret')).toBeNull();
  });

  it('should use custom body param name', () => {
    const definitions: PropsDefinition<{ userId: string }> = {
      userId: { schema: prop.string(), bodyParam: 'user_id' },
    };

    const params = propsToBodyParams({ userId: '123' }, definitions);

    expect(params.get('user_id')).toBe('123');
  });

  it('should use custom body transform function', () => {
    const definitions: PropsDefinition<{ data: { a: number } }> = {
      data: {
        schema: prop.object(),
        bodyParam: ({ value }) => btoa(JSON.stringify(value)),
      },
    };

    const params = propsToBodyParams({ data: { a: 1 } }, definitions);

    expect(params.get('data')).toBe(btoa(JSON.stringify({ a: 1 })));
  });

  it('should JSON stringify objects in body params', () => {
    const definitions: PropsDefinition<{ config: Record<string, unknown> }> = {
      config: { schema: prop.object(), bodyParam: true },
    };

    const params = propsToBodyParams(
      { config: { key: 'value' } },
      definitions
    );

    expect(params.get('config')).toBe(JSON.stringify({ key: 'value' }));
  });

  it('should skip function props and undefined values', () => {
    const definitions: PropsDefinition<{ callback: () => void; optional?: string }> = {
      callback: { schema: prop.function(), bodyParam: true },
      optional: { schema: prop.string().optional(), bodyParam: true },
    };

    const params = propsToBodyParams(
      { callback: () => {}, optional: undefined } as { callback: () => void; optional?: string },
      definitions
    );

    expect(params.get('callback')).toBeNull();
    expect(params.get('optional')).toBeNull();
  });
});

describe('Clone Props', () => {
  it('should deep clone objects', () => {
    const original = {
      data: { nested: { value: 1 } },
      name: 'test',
    };

    const cloned = cloneProps(original);

    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.data).not.toBe(original.data);
  });

  it('should skip unsafe top-level __proto__ keys when cloning', () => {
    const original = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(original, '__proto__', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: { polluted: true },
    });
    original.safe = 'value';

    const cloned = cloneProps(original);

    expect(cloned.safe).toBe('value');
    expect(Object.prototype.hasOwnProperty.call(cloned, '__proto__')).toBe(false);
    expect((cloned as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('should preserve function references', () => {
    const fn = () => 'hello';
    const original = { callback: fn };

    const cloned = cloneProps(original);

    expect(cloned.callback).toBe(fn);
  });

  it('should preserve nested function references inside objects', () => {
    const fn = () => 'nested';
    const original = {
      config: {
        handler: fn,
        state: {
          ready: true,
        },
      },
    };

    const cloned = cloneProps(original);

    expect(cloned).not.toBe(original);
    expect(cloned.config).not.toBe(original.config);
    expect(cloned.config.state).not.toBe(original.config.state);
    expect(cloned.config.handler).toBe(fn);
    expect(cloned.config.state).toEqual({ ready: true });
  });

  it('should preserve nested function references inside arrays', () => {
    const fn = () => 'item';
    const original = {
      items: [
        {
          action: fn,
          value: { count: 1 },
        },
      ],
    };

    const cloned = cloneProps(original);

    expect(cloned.items).not.toBe(original.items);
    expect(cloned.items[0]).not.toBe(original.items[0]);
    expect((cloned.items[0] as { action: () => string }).action).toBe(fn);
    expect((cloned.items[0] as { value: { count: number } }).value).not.toBe(
      (original.items[0] as { value: { count: number } }).value
    );
  });

  it('should preserve sparse array holes when cloning arrays', () => {
    const items = new Array<unknown>(3);
    items[2] = 1;
    (items as unknown as { label?: string }).label = 'kept';
    const original = { items };

    const cloned = cloneProps(original);

    expect(cloned.items).not.toBe(original.items);
    expect(cloned.items.length).toBe(3);
    expect(0 in cloned.items).toBe(false);
    expect(1 in cloned.items).toBe(false);
    expect(2 in cloned.items).toBe(true);
    expect(cloned.items[2]).toBe(1);
    expect((cloned.items as unknown as { label?: string }).label).toBe('kept');
  });

  it('should preserve shared backing buffers between ArrayBuffer views', () => {
    const buf = new ArrayBuffer(4);
    const view = new Uint8Array(buf);
    view[0] = 7;
    const original = { buf, view };

    const cloned = cloneProps(original);

    expect(cloned.buf).not.toBe(buf);
    expect(cloned.view).not.toBe(view);
    expect(cloned.view.buffer).toBe(cloned.buf);
    expect(cloned.view[0]).toBe(7);
  });

  it('should clone DataView instances while preserving offsets and custom props', () => {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf, 2, 4) as DataView & { meta?: { ready: boolean } };
    view.setUint16(0, 0x1234);
    view.meta = { ready: true };
    const original = { view };

    const cloned = cloneProps(original);

    expect(cloned.view).not.toBe(view);
    expect(cloned.view).toBeInstanceOf(DataView);
    expect(cloned.view.buffer).not.toBe(buf);
    expect(cloned.view.byteOffset).toBe(2);
    expect(cloned.view.byteLength).toBe(4);
    expect(cloned.view.getUint16(0)).toBe(0x1234);
    expect(cloned.view.meta).toEqual({ ready: true });
    expect(cloned.view.meta).not.toBe(view.meta);
  });

  it('should clone typed-array subclasses as built-in views without throwing', () => {
    class CustomUint8Array extends Uint8Array {
      constructor(length: number, token: string) {
        if (token !== 'ok') {
          throw new Error('unexpected constructor call');
        }
        super(length);
      }
    }

    const view = new CustomUint8Array(4, 'ok');
    view[0] = 5;
    const original = { view };

    const cloned = cloneProps(original);

    expect(cloned.view).not.toBe(view);
    expect(cloned.view).toBeInstanceOf(Uint8Array);
    expect(cloned.view).not.toBeInstanceOf(CustomUint8Array);
    expect(cloned.view[0]).toBe(5);
  });

  it('should preserve Float16Array views without downgrading them to Uint8Array', () => {
    if (!Float16ArrayCtor) return;

    const view = new Float16ArrayCtor(2);
    view[0] = 1.5;
    const original = { view };

    const cloned = cloneProps(original);

    expect(cloned.view).not.toBe(view);
    expect(cloned.view).toBeInstanceOf(Float16ArrayCtor);
    expect(cloned.view[0]).toBe(1.5);
  });

  it('should fall back to Uint8Array when Float16Array is unavailable at module load', async () => {
    if (!Float16ArrayCtor) return;

    class Float16TaggedView extends Uint8Array {
      get [Symbol.toStringTag](): string {
        return 'Float16Array';
      }
    }

    vi.resetModules();
    vi.stubGlobal('Float16Array', undefined as unknown as typeof Float16Array);

    try {
      const { cloneProps: reloadCloneProps } = await import('@/props/clone');
      const view = new Float16TaggedView([10, 20, 30, 40]);
      const cloned = reloadCloneProps({ view });

      expect(cloned.view).toBeInstanceOf(Uint8Array);
      expect(cloned.view).not.toBeInstanceOf(Float16TaggedView);
      expect(Array.from(cloned.view)).toEqual([10, 20, 30, 40]);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('should preserve repeated references and cycles without throwing', () => {
    const shared = { value: 1 };
    const original = {
      first: shared,
      second: shared,
      nested: {
        shared,
      },
    } as {
      first: { value: number; self?: unknown };
      second: { value: number; self?: unknown };
      nested: { shared: { value: number; self?: unknown } };
      self?: unknown;
    };
    shared.self = shared;
    original.self = original;

    const cloned = cloneProps(original);

    expect(cloned).not.toBe(original);
    expect(cloned.self).toBe(cloned);
    expect(cloned.first).toBe(cloned.second);
    expect(cloned.first).toBe(cloned.nested.shared);
    expect(cloned.first).not.toBe(shared);
    expect(cloned.first.self).toBe(cloned.first);
  });

  it('should clone Date and RegExp instances', () => {
    const original = {
      createdAt: new Date('2024-01-02T03:04:05.000Z'),
      matcher: /forgeframe/gi,
    };

    const cloned = cloneProps(original);

    expect(cloned.createdAt).not.toBe(original.createdAt);
    expect(cloned.createdAt).toBeInstanceOf(Date);
    expect(cloned.createdAt.getTime()).toBe(original.createdAt.getTime());

    expect(cloned.matcher).not.toBe(original.matcher);
    expect(cloned.matcher).toBeInstanceOf(RegExp);
    expect(cloned.matcher.source).toBe('forgeframe');
    expect(cloned.matcher.flags).toBe('gi');
  });

  it('should clone Map and Set instances deeply', () => {
    const shared = { id: 1 };
    const mapKey = { role: 'admin' };
    const original = {
      map: new Map<unknown, unknown>([
        [mapKey, { shared }],
      ]),
      set: new Set<unknown>([shared, { enabled: true }]),
    };

    const cloned = cloneProps(original);

    expect(cloned.map).not.toBe(original.map);
    expect(cloned.map).toBeInstanceOf(Map);
    expect(cloned.map.size).toBe(1);

    const [[clonedMapKey, clonedMapValue]] = Array.from(cloned.map.entries()) as [[
      { role: string },
      { shared: { id: number } }
    ]];
    expect(clonedMapKey).not.toBe(mapKey);
    expect(clonedMapKey).toEqual({ role: 'admin' });
    expect(clonedMapValue).toEqual({ shared: { id: 1 } });
    expect(clonedMapValue.shared).not.toBe(shared);

    expect(cloned.set).not.toBe(original.set);
    expect(cloned.set).toBeInstanceOf(Set);
    const clonedSetValues = Array.from(cloned.set.values()) as Array<
      { id: number } | { enabled: boolean }
    >;
    expect(clonedSetValues).toContainEqual({ id: 1 });
    expect(clonedSetValues).toContainEqual({ enabled: true });
    expect(clonedSetValues.find((value) => 'id' in value)).not.toBe(shared);
  });

  it('should preserve URL instances without corrupting internal state', () => {
    const original = {
      location: new URL('https://example.com/path?x=1'),
    };

    const cloned = cloneProps(original);

    expect(cloned.location).not.toBe(original.location);
    expect(cloned.location).toBeInstanceOf(URL);
    expect(cloned.location.href).toBe('https://example.com/path?x=1');
  });

  it('should clone enumerable own props attached to URL instances', () => {
    const location = new URL('https://example.com/path?x=1') as URL & {
      state?: { ready: boolean };
    };
    location.state = { ready: true };
    const original = { location };

    const cloned = cloneProps(original);

    expect(cloned.location).not.toBe(location);
    expect(cloned.location.state).toEqual({ ready: true });
    expect(cloned.location.state).not.toBe(location.state);
  });

  it('should preserve null-prototype objects when cloning plain data objects', () => {
    const settings = Object.create(null) as Record<string, unknown>;
    settings.mode = 'embedded';
    settings.flags = { secure: true };
    const original = { settings };

    const cloned = cloneProps(original);

    expect(cloned.settings).not.toBe(settings);
    expect(Object.getPrototypeOf(cloned.settings)).toBeNull();
    expect(cloned.settings.mode).toBe('embedded');
    expect(cloned.settings.flags).toEqual({ secure: true });
    expect(cloned.settings.flags).not.toBe(settings.flags);
  });

  it('should preserve URLSearchParams instances without corrupting internal state', () => {
    const original = {
      params: new URLSearchParams('a=1&b=2'),
    };

    const cloned = cloneProps(original);

    expect(cloned.params).not.toBe(original.params);
    expect(cloned.params).toBeInstanceOf(URLSearchParams);
    expect(cloned.params.get('a')).toBe('1');
    expect(cloned.params.get('b')).toBe('2');
  });

  it('should clone enumerable own props attached to URLSearchParams instances', () => {
    const params = new URLSearchParams('a=1&b=2') as URLSearchParams & {
      state?: { ready: boolean };
    };
    params.state = { ready: true };
    const original = { params };

    const cloned = cloneProps(original);

    expect(cloned.params).not.toBe(params);
    expect(cloned.params.state).toEqual({ ready: true });
    expect(cloned.params.state).not.toBe(params.state);
  });

  it('should preserve unsupported native objects by reference', () => {
    const headers = new Headers([['x-test', '1']]);
    const original = { headers };

    const cloned = cloneProps(original);

    expect(cloned.headers).toBe(headers);
    expect(cloned.headers.get('x-test')).toBe('1');
  });

  it('should preserve Promise, WeakMap, and WeakSet instances by reference', () => {
    const key = {};
    const promise = Promise.resolve('ok');
    const weakMap = new WeakMap<object, string>([[key, 'value']]);
    const weakSet = new WeakSet<object>([key]);
    const original = { promise, weakMap, weakSet };

    const cloned = cloneProps(original);

    expect(cloned.promise).toBe(promise);
    expect(cloned.weakMap).toBe(weakMap);
    expect(cloned.weakSet).toBe(weakSet);
    expect(cloned.weakMap.get(key)).toBe('value');
    expect(cloned.weakSet.has(key)).toBe(true);
  });

  it('should clone typed-array variants using their built-in constructors', () => {
    const original = {
      int8: Int8Array.from([-1, 2]),
      clamped: Uint8ClampedArray.from([0, 255]),
      int16: Int16Array.from([1, 2]),
      uint16: Uint16Array.from([3, 4]),
      int32: Int32Array.from([5, 6]),
      uint32: Uint32Array.from([7, 8]),
      float32: Float32Array.from([1.25, 2.5]),
      float64: Float64Array.from([3.75, 4.5]),
      bigInt64: BigInt64Array.from([1n, 2n]),
      bigUint64: BigUint64Array.from([3n, 4n]),
    };

    const cloned = cloneProps(original);

    expect(cloned.int8).toBeInstanceOf(Int8Array);
    expect(Array.from(cloned.int8)).toEqual([-1, 2]);
    expect(cloned.clamped).toBeInstanceOf(Uint8ClampedArray);
    expect(Array.from(cloned.clamped)).toEqual([0, 255]);
    expect(cloned.int16).toBeInstanceOf(Int16Array);
    expect(Array.from(cloned.int16)).toEqual([1, 2]);
    expect(cloned.uint16).toBeInstanceOf(Uint16Array);
    expect(Array.from(cloned.uint16)).toEqual([3, 4]);
    expect(cloned.int32).toBeInstanceOf(Int32Array);
    expect(Array.from(cloned.int32)).toEqual([5, 6]);
    expect(cloned.uint32).toBeInstanceOf(Uint32Array);
    expect(Array.from(cloned.uint32)).toEqual([7, 8]);
    expect(cloned.float32).toBeInstanceOf(Float32Array);
    expect(Array.from(cloned.float32)).toEqual([1.25, 2.5]);
    expect(cloned.float64).toBeInstanceOf(Float64Array);
    expect(Array.from(cloned.float64)).toEqual([3.75, 4.5]);
    expect(cloned.bigInt64).toBeInstanceOf(BigInt64Array);
    expect(Array.from(cloned.bigInt64)).toEqual([1n, 2n]);
    expect(cloned.bigUint64).toBeInstanceOf(BigUint64Array);
    expect(Array.from(cloned.bigUint64)).toEqual([3n, 4n]);
  });

  it('should fall back to Uint8Array for unknown ArrayBuffer view brands', () => {
    class UnknownView extends Uint8Array {
      get [Symbol.toStringTag](): string {
        return 'UnknownView';
      }
    }

    const view = new UnknownView([9, 8, 7]);
    const original = { view };

    const cloned = cloneProps(original);

    expect(cloned.view).not.toBe(view);
    expect(cloned.view).toBeInstanceOf(Uint8Array);
    expect(cloned.view).not.toBeInstanceOf(UnknownView);
    expect(Array.from(cloned.view)).toEqual([9, 8, 7]);
  });

  it('should preserve unsupported native objects by reference when structuredClone returns the wrong brand', () => {
    const realStructuredClone = globalThis.structuredClone;
    const headers = new Headers([['x-test', '1']]);
    const structuredCloneMock = vi.fn((value: unknown) =>
      value === headers ? {} : realStructuredClone(value)
    );
    vi.stubGlobal('structuredClone', structuredCloneMock);

    try {
      const cloned = cloneProps({ headers });

      expect(structuredCloneMock).toHaveBeenCalledWith(headers);
      expect(cloned.headers).toBe(headers);
      expect(cloned.headers.get('x-test')).toBe('1');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should not overwrite existing branded-object internals after structuredClone succeeds', () => {
    const realStructuredClone = globalThis.structuredClone;
    const INTERNAL_HANDLE = Symbol('internal-handle');

    class Handle {
      read(): string {
        return 'ok';
      }
    }

    class FakeBlob {
      [INTERNAL_HANDLE]: Handle;

      constructor() {
        this[INTERNAL_HANDLE] = new Handle();
      }

      get [Symbol.toStringTag](): string {
        return 'Blob';
      }

      text(): string {
        return this[INTERNAL_HANDLE].read();
      }
    }

    const blob = new FakeBlob();
    vi.stubGlobal(
      'structuredClone',
      vi.fn((value: unknown) => (value === blob ? new FakeBlob() : realStructuredClone(value)))
    );

    try {
      const cloned = cloneProps({ blob }) as { blob: FakeBlob };

      expect(cloned.blob).not.toBe(blob);
      expect(Object.prototype.toString.call(cloned.blob)).toBe('[object Blob]');
      expect(cloned.blob.text()).toBe('ok');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should clone custom class instances as plain objects instead of fabricating invalid instances', () => {
    class SecretBox {
      #value: number;
      label: string;

      constructor(value: number) {
        this.#value = value;
        this.label = 'box';
      }

      getValue(): number {
        return this.#value;
      }
    }

    const original = {
      secret: new SecretBox(7),
    };

    const cloned = cloneProps(original) as {
      secret: { label: string; getValue?: unknown };
    };

    expect(cloned.secret).not.toBe(original.secret);
    expect(cloned.secret).not.toBeInstanceOf(SecretBox);
    expect(Object.getPrototypeOf(cloned.secret)).toBe(Object.prototype);
    expect(cloned.secret.label).toBe('box');
    expect('getValue' in cloned.secret).toBe(false);
  });

  it('should materialize own accessors when downgrading custom class instances', () => {
    class SecretWithAccessor {
      #value: number;

      constructor(value: number) {
        this.#value = value;
        Object.defineProperty(this, 'value', {
          configurable: true,
          enumerable: true,
          get: () => this.#value,
        });
      }
    }

    const original = {
      secret: new SecretWithAccessor(9),
    };

    const cloned = cloneProps(original) as {
      secret: { value: number };
    };
    const descriptor = Object.getOwnPropertyDescriptor(cloned.secret, 'value');

    expect(cloned.secret.value).toBe(9);
    expect(descriptor?.get).toBeUndefined();
    expect(descriptor?.value).toBe(9);
  });

  it('should ignore non-enumerable own accessors when cloning objects', () => {
    let getterCalls = 0;
    class SecretWithHiddenAccessor {
      constructor() {
        Object.defineProperty(this, 'hidden', {
          configurable: true,
          enumerable: false,
          get: () => {
            getterCalls += 1;
            throw new Error('hidden getter should not run');
          },
        });
      }
    }

    const original = {
      secret: new SecretWithHiddenAccessor(),
    };

    const cloned = cloneProps(original) as {
      secret: Record<string, unknown>;
    };

    expect(getterCalls).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(cloned.secret, 'hidden')).toBe(false);
  });

  it('should preserve Error instances including non-enumerable message state', () => {
    const original = {
      failure: Object.assign(new TypeError('boom'), { code: 'E_FAIL' }),
    };

    const cloned = cloneProps(original) as {
      failure: TypeError & { code: string };
    };

    expect(cloned.failure).not.toBe(original.failure);
    expect(cloned.failure).toBeInstanceOf(TypeError);
    expect(cloned.failure.message).toBe('boom');
    expect(cloned.failure.code).toBe('E_FAIL');
  });

  it('should preserve nested function references inside Error causes', () => {
    const fn = () => 'callback';
    const original = {
      failure: new Error('boom', {
        cause: {
          callback: fn,
          meta: {
            ready: true,
          },
        },
      }),
    };

    const cloned = cloneProps(original) as {
      failure: Error & {
        cause: {
          callback: () => string;
          meta: { ready: boolean };
        };
      };
    };

    expect(cloned.failure).not.toBe(original.failure);
    expect(cloned.failure).toBeInstanceOf(Error);
    expect(cloned.failure.message).toBe('boom');
    expect(cloned.failure.cause).not.toBe(original.failure.cause);
    expect(cloned.failure.cause.callback).toBe(fn);
    expect(cloned.failure.cause.meta).toEqual({ ready: true });
    expect(cloned.failure.cause.meta).not.toBe(
      (original.failure.cause as { meta: { ready: boolean } }).meta
    );
  });

  it('should ignore keys whose descriptors disappear during cloning', () => {
    const ghost = new Proxy(
      {},
      {
        ownKeys: () => ['ghost'],
        getOwnPropertyDescriptor: () => undefined,
      }
    ) as Record<string, unknown>;
    const original = { ghost };

    const cloned = cloneProps(original);

    expect(cloned.ghost).toEqual({});
    expect(Object.keys(cloned.ghost)).toEqual([]);
  });

  it.each([
    {
      label: 'AggregateError',
      create: () => Object.assign(new AggregateError([], 'boom'), { code: 'E_AGG' }),
      assert: (error: Error & { code?: string }) => {
        expect(error).toBeInstanceOf(AggregateError);
        expect(error.code).toBe('E_AGG');
      },
    },
    {
      label: 'EvalError',
      create: () => Object.assign(new EvalError('boom'), { code: 'E_EVAL' }),
      assert: (error: Error & { code?: string }) => {
        expect(error).toBeInstanceOf(EvalError);
        expect(error.code).toBe('E_EVAL');
      },
    },
    {
      label: 'RangeError',
      create: () => Object.assign(new RangeError('boom'), { code: 'E_RANGE' }),
      assert: (error: Error & { code?: string }) => {
        expect(error).toBeInstanceOf(RangeError);
        expect(error.code).toBe('E_RANGE');
      },
    },
    {
      label: 'ReferenceError',
      create: () => Object.assign(new ReferenceError('boom'), { code: 'E_REF' }),
      assert: (error: Error & { code?: string }) => {
        expect(error).toBeInstanceOf(ReferenceError);
        expect(error.code).toBe('E_REF');
      },
    },
    {
      label: 'SyntaxError',
      create: () => Object.assign(new SyntaxError('boom'), { code: 'E_SYNTAX' }),
      assert: (error: Error & { code?: string }) => {
        expect(error).toBeInstanceOf(SyntaxError);
        expect(error.code).toBe('E_SYNTAX');
      },
    },
    {
      label: 'TypeError fallback',
      create: () => Object.assign(new TypeError('boom'), { code: 'E_TYPE' }),
      assert: (error: Error & { code?: string }) => {
        expect(error).toBeInstanceOf(TypeError);
        expect(error.code).toBe('E_TYPE');
      },
    },
    {
      label: 'URIError',
      create: () => Object.assign(new URIError('boom'), { code: 'E_URI' }),
      assert: (error: Error & { code?: string }) => {
        expect(error).toBeInstanceOf(URIError);
        expect(error.code).toBe('E_URI');
      },
    },
  ])(
    'should preserve %s instances when structuredClone falls back to error constructors',
    ({ create, assert }) => {
      const realStructuredClone = globalThis.structuredClone;
      const failure = create();
      vi.stubGlobal(
        'structuredClone',
        vi.fn((value: unknown) => {
          if (value === failure) {
            throw new Error('force error clone fallback');
          }

          return realStructuredClone(value);
        })
      );

      try {
        const cloned = cloneProps({ failure }) as {
          failure: Error & { code?: string };
        };

        expect(cloned.failure).not.toBe(failure);
        expect(cloned.failure.message).toBe('boom');
        assert(cloned.failure);
      } finally {
        vi.unstubAllGlobals();
      }
    }
  );

  it('should downgrade custom Error subclasses instead of fabricating invalid instances', () => {
    class SecretError extends Error {
      #secret: number;

      constructor(message: string, secret: number) {
        super(message);
        this.#secret = secret;
        this.code = 'E_SECRET';
      }

      get secret(): number {
        return this.#secret;
      }

      code: string;
    }

    const original = {
      failure: new SecretError('boom', 42),
    };

    const cloned = cloneProps(original) as {
      failure: Error & { code?: string; secret?: unknown };
    };

    expect(cloned.failure).not.toBe(original.failure);
    expect(cloned.failure).toBeInstanceOf(Error);
    expect(cloned.failure).not.toBeInstanceOf(SecretError);
    expect(cloned.failure.message).toBe('boom');
    expect(cloned.failure.code).toBe('E_SECRET');
    expect(cloned.failure.secret).toBeUndefined();
  });

  it('should preserve boxed primitive wrappers without breaking valueOf', () => {
    const original = {
      wrapped: new String('boxed'),
    };

    const cloned = cloneProps(original);

    expect(cloned.wrapped).not.toBe(original.wrapped);
    expect(cloned.wrapped).toBeInstanceOf(String);
    expect(cloned.wrapped.valueOf()).toBe('boxed');
  });

  it('should preserve boxed number, boolean, bigint, and symbol wrappers', () => {
    const original = {
      boxedNumber: new Number(7),
      boxedBoolean: new Boolean(true),
      boxedBigInt: Object(12n),
      boxedSymbol: Object(Symbol('boxed')),
    };

    const cloned = cloneProps(original);

    expect(cloned.boxedNumber).not.toBe(original.boxedNumber);
    expect(cloned.boxedNumber).toBeInstanceOf(Number);
    expect(cloned.boxedNumber.valueOf()).toBe(7);

    expect(cloned.boxedBoolean).not.toBe(original.boxedBoolean);
    expect(cloned.boxedBoolean).toBeInstanceOf(Boolean);
    expect(cloned.boxedBoolean.valueOf()).toBe(true);

    expect(cloned.boxedBigInt).not.toBe(original.boxedBigInt);
    expect(Object.prototype.toString.call(cloned.boxedBigInt)).toBe('[object BigInt]');
    expect(cloned.boxedBigInt.valueOf()).toBe(12n);

    expect(cloned.boxedSymbol).not.toBe(original.boxedSymbol);
    expect(Object.prototype.toString.call(cloned.boxedSymbol)).toBe('[object Symbol]');
    expect(cloned.boxedSymbol.valueOf()).toBe(original.boxedSymbol.valueOf());
  });

  it('should handle primitives', () => {
    const original = {
      str: 'string',
      num: 42,
      bool: true,
      nil: null,
    };

    const cloned = cloneProps(original);

    expect(cloned).toEqual(original);
  });
});

describe('BUILTIN_PROP_DEFINITIONS', () => {
  it('should have uid prop with schema', () => {
    expect(BUILTIN_PROP_DEFINITIONS.uid).toBeDefined();
    expect(BUILTIN_PROP_DEFINITIONS.uid.schema).toBeDefined();
    expect(isStandardSchema(BUILTIN_PROP_DEFINITIONS.uid.schema)).toBe(true);
  });

  it('should have tag prop with schema', () => {
    expect(BUILTIN_PROP_DEFINITIONS.tag).toBeDefined();
    expect(BUILTIN_PROP_DEFINITIONS.tag.schema).toBeDefined();
    expect(isStandardSchema(BUILTIN_PROP_DEFINITIONS.tag.schema)).toBe(true);
  });

  it('should have dimensions prop with default', () => {
    expect(BUILTIN_PROP_DEFINITIONS.dimensions).toBeDefined();
    expect(BUILTIN_PROP_DEFINITIONS.dimensions.schema).toBeDefined();
    expect(isStandardSchema(BUILTIN_PROP_DEFINITIONS.dimensions.schema)).toBe(true);
  });

  it('should have timeout prop with default', () => {
    expect(BUILTIN_PROP_DEFINITIONS.timeout).toBeDefined();
    expect(BUILTIN_PROP_DEFINITIONS.timeout.schema).toBeDefined();
    expect(isStandardSchema(BUILTIN_PROP_DEFINITIONS.timeout.schema)).toBe(true);
  });

  it('should have lifecycle callbacks', () => {
    const lifecycleProps = [
      'onDisplay',
      'onRendered',
      'onRender',
      'onPrerendered',
      'onPrerender',
      'onClose',
      'onDestroy',
      'onResize',
      'onFocus',
      'onError',
      'onProps',
    ];

    for (const propName of lifecycleProps) {
      expect(BUILTIN_PROP_DEFINITIONS[propName]).toBeDefined();
      expect(BUILTIN_PROP_DEFINITIONS[propName].schema).toBeDefined();
      expect(isStandardSchema(BUILTIN_PROP_DEFINITIONS[propName].schema)).toBe(true);
      expect(BUILTIN_PROP_DEFINITIONS[propName].sendToHost).toBe(false);
    }
  });
});
