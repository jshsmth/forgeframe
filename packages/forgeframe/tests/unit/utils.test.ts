/**
 * Unit tests for utility modules (`uid`, `cleanup`, and `promise`).
 *
 * Covers UID generation, cleanup task ordering, deferred promises, and timeout behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateUID,
  generateShortUID,
} from '@/utils/uid';
import { CleanupManager } from '@/utils/cleanup';
import {
  createDeferred,
  promiseTimeout,
} from '@/utils/promise';

describe('UID Utils', () => {
  it('should generate unique UIDs', () => {
    const uid1 = generateUID();
    const uid2 = generateUID();

    expect(uid1).not.toBe(uid2);
    expect(uid1).toMatch(/^[a-z0-9]+_[a-z0-9]+$/);
  });

  it('should generate short UIDs', () => {
    const uid = generateShortUID();
    expect(uid.length).toBeGreaterThan(0);
    expect(uid.length).toBeLessThan(15);
  });
});

describe('CleanupManager', () => {
  it('should execute cleanup tasks in reverse order', async () => {
    const manager = new CleanupManager();
    const order: number[] = [];

    manager.register(() => order.push(1));
    manager.register(() => order.push(2));
    manager.register(() => order.push(3));

    await manager.cleanup();

    expect(order).toEqual([3, 2, 1]);
  });

  it('should handle async cleanup tasks', async () => {
    const manager = new CleanupManager();
    const results: string[] = [];
    const deferred = createDeferred<void>();

    manager.register(async () => {
      await deferred.promise;
      results.push('async');
    });
    manager.register(() => results.push('sync'));

    const cleanup = manager.cleanup();
    expect(results).toEqual(['sync']);
    deferred.resolve();
    await cleanup;

    expect(results).toEqual(['sync', 'async']);
  });

  it('should only cleanup once', async () => {
    const manager = new CleanupManager();
    let count = 0;

    manager.register(() => count++);

    await manager.cleanup();
    await manager.cleanup();

    expect(count).toBe(1);
  });

  it('should execute immediate cleanup if already cleaned', async () => {
    const manager = new CleanupManager();
    const executed = vi.fn();

    await manager.cleanup();
    manager.register(executed);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(executed).toHaveBeenCalled();
  });

  it('should catch async errors for tasks registered after cleanup', async () => {
    const manager = new CleanupManager();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await manager.cleanup();
    manager.register(async () => {
      throw new Error('late async cleanup failure');
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error in cleanup task:',
      expect.any(Error)
    );
  });
});

describe('Promise Utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('createDeferred should create resolvable promise', async () => {
    const deferred = createDeferred<number>();

    setTimeout(() => deferred.resolve(42), 10);
    vi.advanceTimersByTime(10);

    const result = await deferred.promise;
    expect(result).toBe(42);
  });

  it('createDeferred should create rejectable promise', async () => {
    const deferred = createDeferred<number>();

    setTimeout(() => deferred.reject(new Error('test error')), 10);
    vi.advanceTimersByTime(10);

    await expect(deferred.promise).rejects.toThrow('test error');
  });

  it('promiseTimeout should preserve the result and clear its timer on success', async () => {
    const deferred = createDeferred<string>();
    const result = promiseTimeout(deferred.promise, 100);

    deferred.resolve('success');

    await expect(result).resolves.toBe('success');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('promiseTimeout should preserve the error and clear its timer on failure', async () => {
    const deferred = createDeferred<string>();
    const result = promiseTimeout(deferred.promise, 100);
    const error = new Error('operation failed');

    deferred.reject(error);

    await expect(result).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('promiseTimeout should reject at the deadline and allow the operation to settle later', async () => {
    const deferred = createDeferred<string>();
    const result = promiseTimeout(deferred.promise, 10, 'Host did not initialize');
    const assertion = expect(result).rejects.toThrow('Host did not initialize (10ms)');

    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);

    deferred.resolve('late result');
    await expect(deferred.promise).resolves.toBe('late result');
    await expect(result).rejects.toThrow('Host did not initialize (10ms)');
  });
});
