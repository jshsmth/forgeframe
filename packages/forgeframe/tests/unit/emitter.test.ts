import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '@/events/emitter';

describe('EventEmitter', () => {
  it('should emit events to subscribed handlers', () => {
    const emitter = new EventEmitter();
    const handler = vi.fn();

    emitter.on('test', handler);
    emitter.emit('test', { value: 42 });

    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('should return unsubscribe function from on()', () => {
    const emitter = new EventEmitter();
    const handler = vi.fn();

    const unsubscribe = emitter.on('test', handler);
    unsubscribe();
    emitter.emit('test', 'data');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle once() correctly', () => {
    const emitter = new EventEmitter();
    const handler = vi.fn();

    emitter.once('test', handler);
    emitter.emit('test', 'first');
    emitter.emit('test', 'second');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('first');
  });

  it('should remove all listeners for an event with off()', () => {
    const emitter = new EventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('test', handler1);
    emitter.on('test', handler2);
    emitter.off('test');
    emitter.emit('test', 'data');

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('should remove specific handler with off()', () => {
    const emitter = new EventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('test', handler1);
    emitter.on('test', handler2);
    emitter.off('test', handler1);
    emitter.emit('test', 'data');

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledWith('data');
  });

  it('should clear all listeners with removeAllListeners()', () => {
    const emitter = new EventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('event1', handler1);
    emitter.on('event2', handler2);
    emitter.removeAllListeners();
    emitter.emit('event1', 'data');
    emitter.emit('event2', 'data');

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('should handle errors in handlers without breaking other handlers', () => {
    const emitter = new EventEmitter();
    const errorHandler = vi.fn(() => {
      throw new Error('Handler error');
    });
    const normalHandler = vi.fn();

    // Spy on console.error to suppress the expected error output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    emitter.on('test', errorHandler);
    emitter.on('test', normalHandler);
    emitter.emit('test', 'data');

    expect(normalHandler).toHaveBeenCalledWith('data');
    consoleSpy.mockRestore();
  });

  it('should catch rejected async handlers and continue notifying others', async () => {
    const emitter = new EventEmitter();
    const asyncErrorHandler = vi.fn(async () => {
      throw new Error('Async handler error');
    });
    const normalHandler = vi.fn();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    emitter.on('test', asyncErrorHandler);
    emitter.on('test', normalHandler);
    emitter.emit('test', 'data');
    await Promise.resolve();

    expect(normalHandler).toHaveBeenCalledWith('data');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error in async event handler for "test":',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('should report listener counts as handlers are added and removed', () => {
    const emitter = new EventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const unsubscribe = emitter.on('count-test', handler1);
    emitter.on('count-test', handler2);
    expect(emitter.listenerCount('count-test')).toBe(2);

    unsubscribe();
    expect(emitter.listenerCount('count-test')).toBe(1);

    emitter.off('count-test', handler2);
    expect(emitter.listenerCount('count-test')).toBe(0);

    emitter.on('other-event', vi.fn());
    emitter.removeAllListeners();
    expect(emitter.listenerCount('other-event')).toBe(0);
  });
});
