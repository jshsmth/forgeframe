/**
 * Unit tests for `@/communication/bridge`.
 *
 * Covers function reference lifecycle, recursive serialization/deserialization, and bridge call routing through messenger handlers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FunctionBridge,
  serializeFunctions,
  deserializeFunctions,
} from '@/communication/bridge';
import { Messenger } from '@/communication/messenger';
import { MESSAGE_NAME } from '@/constants';

type GenericFunction = (...args: unknown[]) => unknown;

/**
 * Creates a messenger test double with handler storage and a `CALL` trigger helper.
 */
const createMockMessenger = () => {
  const handlers = new Map<string, GenericFunction>();

  return {
    send: vi.fn().mockResolvedValue(undefined),
    post: vi.fn(),
    on: vi.fn((name: string, handler: GenericFunction) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    }),
    destroy: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    handlers,
    // Helper to simulate incoming call
    simulateCall: async (id: string, args: unknown[]) => {
      const handler = handlers.get(MESSAGE_NAME.CALL);
      if (handler) {
        return handler(
          { id, args },
          {
            uid: 'test',
            domain: 'https://test.com',
            window: { postMessage: vi.fn() } as unknown as Window,
          }
        );
      }
      throw new Error('No handler registered');
    },
  } as unknown as Messenger & { handlers: Map<string, GenericFunction>; simulateCall: (id: string, args: unknown[]) => Promise<unknown> };
};

describe('FunctionBridge', () => {
  let messenger: ReturnType<typeof createMockMessenger>;
  let bridge: FunctionBridge;

  beforeEach(() => {
    messenger = createMockMessenger();
    bridge = new FunctionBridge(messenger);
  });

  afterEach(() => {
    bridge.destroy();
  });

  describe('serialize', () => {
    it('should create function reference', () => {
      const fn = () => 'hello';
      const ref = bridge.serialize(fn);

      expect(ref.__type__).toBe('function');
      expect(typeof ref.__id__).toBe('string');
      expect(ref.__name__).toBe('fn');
    });

    it('should use function name', () => {
      function namedFunction() {
        return 42;
      }

      const ref = bridge.serialize(namedFunction);

      expect(ref.__name__).toBe('namedFunction');
    });

    it('should use custom name when provided', () => {
      const ref = bridge.serialize(() => {}, 'customName');

      expect(ref.__name__).toBe('customName');
    });

    it('should use "anonymous" for unnamed functions', () => {
      const ref = bridge.serialize(() => {});

      expect(ref.__name__).toBe('anonymous');
    });

    it('should generate unique IDs', () => {
      const ref1 = bridge.serialize(() => {});
      const ref2 = bridge.serialize(() => {});

      expect(ref1.__id__).not.toBe(ref2.__id__);
    });

    it('should preserve the ID of the same function across serialization batches', async () => {
      const fn = () => 'stable';
      bridge.startBatch();
      const first = bridge.serialize(fn);
      bridge.finishBatch();

      bridge.startBatch();
      const second = bridge.serialize(fn);
      bridge.finishBatch();

      expect(second.__id__).toBe(first.__id__);
      await expect(messenger.simulateCall(first.__id__, [])).resolves.toBe('stable');
    });

    it('should reject calls from an unexpected peer window', async () => {
      const guardedBridge = new FunctionBridge(messenger, () => false);
      const ref = guardedBridge.serialize(() => 'private');

      await expect(messenger.simulateCall(ref.__id__, [])).rejects.toThrow(
        'Function call rejected from unexpected window'
      );
      guardedBridge.destroy();
    });

    it('should evict the oldest local function reference when capacity is exceeded', async () => {
      const firstRef = bridge.serialize(() => 'first');

      for (let index = 0; index < 500; index += 1) {
        bridge.serialize(() => index);
      }

      expect(bridge.localFunctionCount).toBe(500);
      await expect(messenger.simulateCall(firstRef.__id__, [])).rejects.toThrow(
        `Function with id "${firstRef.__id__}" not found`
      );
    });
  });

  describe('deserialize', () => {
    it('should create callable wrapper', () => {
      const targetWin = {} as Window;
      const ref = { __type__: 'function' as const, __id__: 'fn-123', __name__: 'test' };

      const wrapper = bridge.deserialize(ref, targetWin, 'https://target.com');

      expect(typeof wrapper).toBe('function');
    });

    it('should send call message when invoked', async () => {
      const targetWin = {} as Window;
      const ref = { __type__: 'function' as const, __id__: 'fn-123', __name__: 'test' };

      const wrapper = bridge.deserialize(ref, targetWin, 'https://target.com') as (...args: unknown[]) => Promise<unknown>;

      await wrapper('arg1', 'arg2');

      expect(messenger.send).toHaveBeenCalledWith(
        targetWin,
        'https://target.com',
        MESSAGE_NAME.CALL,
        { id: 'fn-123', args: ['arg1', 'arg2'] }
      );
    });

    it('should cache deserialized functions', () => {
      const targetWin = {} as Window;
      const ref = { __type__: 'function' as const, __id__: 'fn-123', __name__: 'test' };

      const wrapper1 = bridge.deserialize(ref, targetWin, 'https://target.com');
      const wrapper2 = bridge.deserialize(ref, targetWin, 'https://target.com');

      expect(wrapper1).toBe(wrapper2);
    });

    it('should not reuse a cached wrapper for a different remote window', async () => {
      const firstTarget = {} as Window;
      const secondTarget = {} as Window;
      const ref = { __type__: 'function' as const, __id__: 'fn-shared', __name__: 'test' };

      const firstWrapper = bridge.deserialize(ref, firstTarget, 'https://target.com');
      const secondWrapper = bridge.deserialize(ref, secondTarget, 'https://target.com') as (
        ...args: unknown[]
      ) => Promise<unknown>;

      expect(secondWrapper).not.toBe(firstWrapper);
      await secondWrapper('next-window');
      expect(messenger.send).toHaveBeenLastCalledWith(
        secondTarget,
        'https://target.com',
        MESSAGE_NAME.CALL,
        { id: 'fn-shared', args: ['next-window'] }
      );
    });

    it('should set function name', () => {
      const targetWin = {} as Window;
      const ref = { __type__: 'function' as const, __id__: 'fn-123', __name__: 'myFunction' };

      const wrapper = bridge.deserialize(ref, targetWin, 'https://target.com');

      expect(wrapper.name).toBe('myFunction');
    });

    it('should evict the oldest cached remote wrapper when capacity is exceeded', () => {
      const targetWin = {} as Window;
      const firstRef = {
        __type__: 'function' as const,
        __id__: 'fn-first',
        __name__: 'first',
      };
      const firstWrapper = bridge.deserialize(firstRef, targetWin, 'https://target.com');

      for (let index = 0; index < 500; index += 1) {
        bridge.deserialize(
          {
            __type__: 'function' as const,
            __id__: `fn-${index}`,
            __name__: `wrapped-${index}`,
          },
          targetWin,
          'https://target.com'
        );
      }

      expect(bridge.remoteFunctionCount).toBe(500);

      const recreatedWrapper = bridge.deserialize(
        firstRef,
        targetWin,
        'https://target.com'
      );

      expect(bridge.remoteFunctionCount).toBe(500);
      expect(recreatedWrapper).not.toBe(firstWrapper);
      expect(recreatedWrapper.name).toBe('first');
    });
  });

  describe('isFunctionRef', () => {
    it('should return true for valid function ref', () => {
      expect(FunctionBridge.isFunctionRef({
        __type__: 'function',
        __id__: 'fn-123',
        __name__: 'test',
      })).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(FunctionBridge.isFunctionRef(null)).toBe(false);
      expect(FunctionBridge.isFunctionRef(undefined)).toBe(false);
      expect(FunctionBridge.isFunctionRef('string')).toBe(false);
      expect(FunctionBridge.isFunctionRef({ __type__: 'other' })).toBe(false);
      expect(FunctionBridge.isFunctionRef({ __type__: 'function' })).toBe(false);
      expect(FunctionBridge.isFunctionRef({ __id__: 'test' })).toBe(false);
    });
  });

  describe('call handler', () => {
    it('should setup call handler on construction', () => {
      expect(messenger.on).toHaveBeenCalledWith(
        MESSAGE_NAME.CALL,
        expect.any(Function)
      );
    });

    it('should invoke local function when called', async () => {
      const localFn = vi.fn().mockReturnValue('result');
      const ref = bridge.serialize(localFn);

      const result = await messenger.simulateCall(ref.__id__, ['arg1', 'arg2']);

      expect(localFn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(result).toBe('result');
    });

    it('should throw for unknown function ID', async () => {
      await expect(messenger.simulateCall('unknown-id', [])).rejects.toThrow(
        'Function with id "unknown-id" not found'
      );
    });
  });

  describe('removeLocal', () => {
    it('should remove local function reference', async () => {
      const localFn = vi.fn();
      const ref = bridge.serialize(localFn);

      bridge.removeLocal(ref.__id__);

      await expect(messenger.simulateCall(ref.__id__, [])).rejects.toThrow(
        `Function with id "${ref.__id__}" not found`
      );
    });
  });

  describe('destroy', () => {
    it('should clear all function references', async () => {
      const localFn = vi.fn();
      const ref = bridge.serialize(localFn);

      bridge.destroy();

      await expect(messenger.simulateCall(ref.__id__, [])).rejects.toThrow();
    });
  });

  describe('batch lifecycle', () => {
    it('should keep previous function references when finishBatch(true) is used', async () => {
      const firstRef = bridge.serialize(() => 'first');

      bridge.startBatch();
      const secondRef = bridge.serialize(() => 'second');
      bridge.finishBatch(true);

      expect(bridge.localFunctionCount).toBe(2);
      await expect(messenger.simulateCall(firstRef.__id__, [])).resolves.toBe('first');
      await expect(messenger.simulateCall(secondRef.__id__, [])).resolves.toBe('second');
    });

    it('should remove stale local references when finishing a new batch', async () => {
      const firstRef = bridge.serialize(() => 'first');
      bridge.startBatch();
      const secondRef = bridge.serialize(() => 'second');

      bridge.finishBatch();

      expect(bridge.localFunctionCount).toBe(1);
      await expect(messenger.simulateCall(firstRef.__id__, [])).rejects.toThrow(
        `Function with id "${firstRef.__id__}" not found`
      );
      await expect(messenger.simulateCall(secondRef.__id__, [])).resolves.toBe('second');
    });
  });
});

describe('serializeFunctions', () => {
  let messenger: ReturnType<typeof createMockMessenger>;
  let bridge: FunctionBridge;

  beforeEach(() => {
    messenger = createMockMessenger();
    bridge = new FunctionBridge(messenger);
  });

  afterEach(() => {
    bridge.destroy();
  });

  it('should serialize top-level function', () => {
    const fn = () => 'hello';
    const result = serializeFunctions(fn, bridge);

    expect(FunctionBridge.isFunctionRef(result)).toBe(true);
  });

  it('should serialize functions in object', () => {
    const obj = {
      callback: () => 'callback',
      value: 42,
    };

    const result = serializeFunctions(obj, bridge) as Record<string, unknown>;

    expect(FunctionBridge.isFunctionRef(result.callback)).toBe(true);
    expect(result.value).toBe(42);
  });

  it('should serialize functions in nested object', () => {
    const obj = {
      nested: {
        deep: {
          fn: () => 'deep',
        },
      },
    };

    const result = serializeFunctions(obj, bridge) as { nested: { deep: { fn: unknown } } };

    expect(FunctionBridge.isFunctionRef(result.nested.deep.fn)).toBe(true);
  });

  it('should serialize functions in array', () => {
    const arr = [() => 'first', 'string', () => 'second'];

    const result = serializeFunctions(arr, bridge) as unknown[];

    expect(FunctionBridge.isFunctionRef(result[0])).toBe(true);
    expect(result[1]).toBe('string');
    expect(FunctionBridge.isFunctionRef(result[2])).toBe(true);
  });

  it('should preserve primitives', () => {
    expect(serializeFunctions('string', bridge)).toBe('string');
    expect(serializeFunctions(42, bridge)).toBe(42);
    expect(serializeFunctions(true, bridge)).toBe(true);
    expect(serializeFunctions(null, bridge)).toBe(null);
  });

  it('should allow shared object references that are not circular', () => {
    const shared = { fn: () => 'ok' };
    const value = { first: shared, second: shared };

    const result = serializeFunctions(value, bridge) as {
      first: { fn: unknown };
      second: { fn: unknown };
    };

    expect(FunctionBridge.isFunctionRef(result.first.fn)).toBe(true);
    expect(FunctionBridge.isFunctionRef(result.second.fn)).toBe(true);
  });

  it('should throw on circular object references', () => {
    const value: Record<string, unknown> = {};
    value.self = value;

    expect(() => serializeFunctions(value, bridge)).toThrow('Circular reference detected');
  });

  it('should throw on circular array references', () => {
    const value: unknown[] = [];
    value.push(value);

    expect(() => serializeFunctions(value, bridge)).toThrow(
      'Circular reference detected in props - arrays cannot contain circular references'
    );
  });

  it('should block __proto__ while preserving constructor/prototype keys when serializing objects', () => {
    const value: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    value.safe = 42;
    value.__proto__ = {
      leaked: true,
    };
    value.constructor = {
      prototype: {
        ignored: true,
      },
    };

    const result = serializeFunctions(value, bridge) as Record<string, unknown>;

    expect(result.safe).toBe(42);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect('leaked' in result).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(true);
    expect(result.constructor).toEqual({
      prototype: {
        ignored: true,
      },
    });
  });
});

describe('deserializeFunctions', () => {
  let messenger: ReturnType<typeof createMockMessenger>;
  let bridge: FunctionBridge;
  const targetWin = {} as Window;
  const targetDomain = 'https://target.com';

  beforeEach(() => {
    messenger = createMockMessenger();
    bridge = new FunctionBridge(messenger);
  });

  afterEach(() => {
    bridge.destroy();
  });

  it('should deserialize function reference', () => {
    const ref = { __type__: 'function' as const, __id__: 'fn-1', __name__: 'test' };

    const result = deserializeFunctions(ref, bridge, targetWin, targetDomain);

    expect(typeof result).toBe('function');
  });

  it('should deserialize functions in object', () => {
    const obj = {
      callback: { __type__: 'function' as const, __id__: 'fn-1', __name__: 'callback' },
      value: 42,
    };

    const result = deserializeFunctions(obj, bridge, targetWin, targetDomain) as Record<string, unknown>;

    expect(typeof result.callback).toBe('function');
    expect(result.value).toBe(42);
  });

  it('should deserialize functions in nested object', () => {
    const obj = {
      nested: {
        fn: { __type__: 'function' as const, __id__: 'fn-1', __name__: 'nested' },
      },
    };

    const result = deserializeFunctions(obj, bridge, targetWin, targetDomain) as { nested: { fn: unknown } };

    expect(typeof result.nested.fn).toBe('function');
  });

  it('should deserialize functions in array', () => {
    const arr = [
      { __type__: 'function' as const, __id__: 'fn-1', __name__: 'first' },
      'string',
    ];

    const result = deserializeFunctions(arr, bridge, targetWin, targetDomain) as unknown[];

    expect(typeof result[0]).toBe('function');
    expect(result[1]).toBe('string');
  });

  it('should preserve primitives', () => {
    expect(deserializeFunctions('string', bridge, targetWin, targetDomain)).toBe('string');
    expect(deserializeFunctions(42, bridge, targetWin, targetDomain)).toBe(42);
    expect(deserializeFunctions(true, bridge, targetWin, targetDomain)).toBe(true);
    expect(deserializeFunctions(null, bridge, targetWin, targetDomain)).toBe(null);
  });

  it('should allow shared object references that are not circular', () => {
    const shared = { __type__: 'function' as const, __id__: 'shared', __name__: 'sharedFn' };
    const value = { first: shared, second: shared };

    const result = deserializeFunctions(value, bridge, targetWin, targetDomain) as {
      first: unknown;
      second: unknown;
    };

    expect(typeof result.first).toBe('function');
    expect(typeof result.second).toBe('function');
  });

  it('should throw on circular serialized references', () => {
    const value: Record<string, unknown> = {};
    value.self = value;

    expect(() =>
      deserializeFunctions(value, bridge, targetWin, targetDomain)
    ).toThrow('Circular reference detected');
  });

  it('should throw on circular serialized arrays', () => {
    const value: unknown[] = [];
    value.push(value);

    expect(() =>
      deserializeFunctions(value, bridge, targetWin, targetDomain)
    ).toThrow('Circular reference detected in serialized props');
  });

  it('should block __proto__ while preserving constructor/prototype keys when deserializing objects', () => {
    const value: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    value.safe = 42;
    value.__proto__ = {
      leaked: true,
    };
    value.constructor = {
      prototype: {
        ignored: true,
      },
    };

    const result = deserializeFunctions(
      value,
      bridge,
      targetWin,
      targetDomain
    ) as Record<string, unknown>;

    expect(result.safe).toBe(42);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect('leaked' in result).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(true);
    expect(result.constructor).toEqual({
      prototype: {
        ignored: true,
      },
    });
  });
});

describe('round-trip serialization', () => {
  it('should preserve function calls through serialize/deserialize', async () => {
    const consumerMessenger = createMockMessenger();
    const hostMessenger = createMockMessenger();

    const consumerBridge = new FunctionBridge(consumerMessenger);
    const hostBridge = new FunctionBridge(hostMessenger);

    const targetWin = {} as Window;
    const targetDomain = 'https://host.com';

    // Consumer serializes a function
    const originalFn = vi.fn().mockReturnValue('success');
    const serialized = consumerBridge.serialize(originalFn, 'myCallback');

    // Host deserializes it
    const deserialized = hostBridge.deserialize(
      serialized,
      targetWin,
      targetDomain
    ) as (...args: unknown[]) => Promise<unknown>;

    // Host calls the function
    await deserialized('arg1');

    // Verify the call was sent to consumer
    expect(hostMessenger.send).toHaveBeenCalledWith(
      targetWin,
      targetDomain,
      MESSAGE_NAME.CALL,
      { id: serialized.__id__, args: ['arg1'] }
    );

    // Simulate the consumer receiving and handling the call
    const result = await consumerMessenger.simulateCall(serialized.__id__, ['arg1']);
    expect(result).toBe('success');
    expect(originalFn).toHaveBeenCalledWith('arg1');

    consumerBridge.destroy();
    hostBridge.destroy();
  });
});
