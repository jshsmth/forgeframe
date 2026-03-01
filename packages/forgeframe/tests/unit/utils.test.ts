import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateUID,
  generateShortUID,
  isValidUID,
} from '@/utils/uid';
import { CleanupManager } from '@/utils/cleanup';
import {
  createDeferred,
  promiseTimeout,
  delay,
  waitFor,
  tryCatch,
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

  it('should validate UIDs correctly', () => {
    expect(isValidUID('abc123_xyz789')).toBe(true);
    expect(isValidUID('invalid')).toBe(false);
    expect(isValidUID('')).toBe(false);
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

    manager.register(async () => {
      await delay(10);
      results.push('async');
    });
    manager.register(() => results.push('sync'));

    await manager.cleanup();

    expect(results).toEqual(['sync', 'async']);
  });

  it('should only cleanup once', async () => {
    const manager = new CleanupManager();
    let count = 0;

    manager.register(() => count++);

    await manager.cleanup();
    await manager.cleanup();

    expect(count).toBe(1);
    expect(manager.isCleaned()).toBe(true);
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

  it('should reset manager to initial state', async () => {
    const manager = new CleanupManager();
    const task = vi.fn();

    manager.register(task);
    await manager.cleanup();

    expect(manager.isCleaned()).toBe(true);
    expect(task).toHaveBeenCalledTimes(1);

    // Reset the manager
    manager.reset();

    expect(manager.isCleaned()).toBe(false);

    // Should be able to register and cleanup again
    const newTask = vi.fn();
    manager.register(newTask);
    await manager.cleanup();

    expect(newTask).toHaveBeenCalledTimes(1);
    expect(manager.isCleaned()).toBe(true);
  });

  it('should clear pending tasks on reset', async () => {
    const manager = new CleanupManager();
    const task1 = vi.fn();
    const task2 = vi.fn();

    manager.register(task1);
    manager.register(task2);

    // Reset before cleanup
    manager.reset();

    // Cleanup should not execute the cleared tasks
    await manager.cleanup();

    expect(task1).not.toHaveBeenCalled();
    expect(task2).not.toHaveBeenCalled();
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

  it('promiseTimeout should resolve before timeout', async () => {
    const promise = delay(10).then(() => 'success');
    vi.advanceTimersByTime(10);

    const result = await promiseTimeout(promise, 100);
    expect(result).toBe('success');
  });

  it('promiseTimeout should reject after timeout', async () => {
    const promise = delay(100).then(() => 'success');
    const timeoutPromise = promiseTimeout(promise, 10);

    vi.advanceTimersByTime(10);

    await expect(timeoutPromise).rejects.toThrow('timed out');
  });

  it('delay should wait specified time', async () => {
    const callback = vi.fn();
    delay(50).then(callback);

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    await Promise.resolve(); // flush microtasks

    expect(callback).toHaveBeenCalled();
  });

  describe('waitFor', () => {
    it('should resolve immediately when condition is true', async () => {
      let resolved = false;
      const conditionMet = true;

      waitFor(() => conditionMet).then(() => {
        resolved = true;
      });

      await Promise.resolve();
      expect(resolved).toBe(true);
    });

    it('should poll until condition becomes true', async () => {
      let counter = 0;

      const waitPromise = waitFor(
        () => {
          counter++;
          return counter >= 3;
        },
        { interval: 50 }
      );

      // First check - counter = 1, false
      await Promise.resolve();
      expect(counter).toBe(1);

      // Advance timer for next poll
      vi.advanceTimersByTime(50);
      await Promise.resolve();
      expect(counter).toBe(2);

      // Advance timer for final poll
      vi.advanceTimersByTime(50);
      await Promise.resolve();

      await waitPromise;
      expect(counter).toBe(3);
    });

    it('should reject on timeout', async () => {
      const waitPromise = waitFor(
        () => false, // Never true
        { timeout: 100, interval: 20 }
      );

      vi.advanceTimersByTime(100);

      await expect(waitPromise).rejects.toThrow('waitFor timed out');
    });

    it('should use default timeout of 5000ms', async () => {
      const waitPromise = waitFor(() => false);

      // Advance just before timeout
      vi.advanceTimersByTime(4999);
      await Promise.resolve();

      // Should still be pending
      let rejected = false;
      waitPromise.catch(() => {
        rejected = true;
      });

      await Promise.resolve();
      expect(rejected).toBe(false);

      // Advance past timeout
      vi.advanceTimersByTime(1);
      await Promise.resolve();

      await expect(waitPromise).rejects.toThrow('waitFor timed out');
    });

    it('should use default interval of 50ms', async () => {
      let checkCount = 0;

      const waitPromise = waitFor(
        () => {
          checkCount++;
          return checkCount >= 3;
        },
        { timeout: 1000 }
      );

      // Initial check
      await Promise.resolve();
      expect(checkCount).toBe(1);

      // After 49ms, no new check
      vi.advanceTimersByTime(49);
      await Promise.resolve();
      expect(checkCount).toBe(1);

      // After 50ms, second check
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      expect(checkCount).toBe(2);

      // After another 50ms, third check and resolve
      vi.advanceTimersByTime(50);
      await waitPromise;
      expect(checkCount).toBe(3);
    });
  });

  describe('tryCatch', () => {
    it('should return function result on success', async () => {
      const result = await tryCatch(() => 42, 0);
      expect(result).toBe(42);
    });

    it('should return fallback on synchronous error', async () => {
      const result = await tryCatch(() => {
        throw new Error('sync error');
      }, 'fallback');

      expect(result).toBe('fallback');
    });

    it('should handle async functions successfully', async () => {
      const result = await tryCatch(async () => {
        await Promise.resolve();
        return 'async result';
      }, 'fallback');

      expect(result).toBe('async result');
    });

    it('should return fallback on async error', async () => {
      const result = await tryCatch(async () => {
        await Promise.resolve();
        throw new Error('async error');
      }, 'fallback');

      expect(result).toBe('fallback');
    });

    it('should return fallback for rejected promise', async () => {
      const result = await tryCatch(
        () => Promise.reject(new Error('rejected')),
        'default'
      );

      expect(result).toBe('default');
    });

    it('should work with complex fallback values', async () => {
      const fallbackObj = { key: 'value', nested: { data: [1, 2, 3] } };

      const result = await tryCatch(() => {
        throw new Error('error');
      }, fallbackObj);

      expect(result).toBe(fallbackObj);
      expect(result.key).toBe('value');
    });

    it('should work with array fallbacks', async () => {
      const result = await tryCatch(() => {
        throw new Error('error');
      }, [1, 2, 3]);

      expect(result).toEqual([1, 2, 3]);
    });
  });
});
