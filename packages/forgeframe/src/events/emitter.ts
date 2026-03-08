import type { EventHandler, EventEmitterInterface } from '#internal/types';

/**
 * A simple typed event emitter for component lifecycle events.
 *
 * @remarks
 * This class provides a lightweight publish-subscribe pattern implementation
 * with support for typed events, one-time subscriptions, and automatic cleanup.
 * It is used internally by ForgeFrame components for lifecycle event management.
 *
 * @example
 * ```typescript
 * const emitter = new EventEmitter();
 *
 * // Subscribe to an event
 * const unsubscribe = emitter.on<string>('message', (data) => {
 *   console.log('Received:', data);
 * });
 *
 * // Emit an event
 * emitter.emit('message', 'Hello, World!');
 *
 * // Unsubscribe when done
 * unsubscribe();
 * ```
 *
 * @public
 */
export class EventEmitter implements EventEmitterInterface {
  /**
   * Internal storage for event listeners mapped by event name.
   * @internal
   */
  private listeners = new Map<string, Set<EventHandler>>();

  /**
   * Subscribes a handler to a specific event.
   *
   * @typeParam T - The type of data expected by the event handler
   * @param event - The name of the event to subscribe to
   * @param handler - The callback function to invoke when the event is emitted
   * @returns A function that, when called, unsubscribes the handler from the event
   *
   * @example
   * ```typescript
   * const unsubscribe = emitter.on<{ userId: string }>('login', (data) => {
   *   console.log('User logged in:', data.userId);
   * });
   * ```
   *
   * @public
   */
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler);

    return () => this.off(event, handler as EventHandler);
  }

  /**
   * Subscribes a handler to an event that will automatically unsubscribe after the first invocation.
   *
   * @typeParam T - The type of data expected by the event handler
   * @param event - The name of the event to subscribe to
   * @param handler - The callback function to invoke once when the event is emitted
   * @returns A function that, when called, unsubscribes the handler before it fires
   *
   * @remarks
   * This is useful for one-time event handling, such as waiting for an initialization
   * event or a single response.
   *
   * @example
   * ```typescript
   * emitter.once('ready', () => {
   *   console.log('Component is ready!');
   * });
   * ```
   *
   * @public
   */
  once<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    const onceHandler: EventHandler<T> = (data) => {
      this.off(event, onceHandler as EventHandler);
      return handler(data);
    };
    return this.on(event, onceHandler);
  }

  /**
   * Emits an event, invoking all registered handlers with the provided data.
   *
   * @typeParam T - The type of data to pass to event handlers
   * @param event - The name of the event to emit
   * @param data - Optional data to pass to all registered handlers
   *
   * @remarks
   * Handlers are invoked synchronously in the order they were registered.
   * If a handler throws an error, it is caught and logged to the console,
   * allowing subsequent handlers to still execute.
   *
   * @example
   * ```typescript
   * emitter.emit('userAction', { action: 'click', target: 'button' });
   * ```
   *
   * @public
   */
  emit<T = unknown>(event: string, data?: T): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        const result = handler(data);
        // Handle async handlers - catch promise rejections
        if (result && typeof result === 'object' && 'catch' in result && typeof result.catch === 'function') {
          (result as Promise<unknown>).catch((err: unknown) => {
            console.error(`Error in async event handler for "${event}":`, err);
          });
        }
      } catch (err) {
        console.error(`Error in event handler for "${event}":`, err);
      }
    }
  }

  /**
   * Unsubscribes a handler from an event, or removes all handlers for the event.
   *
   * @param event - The name of the event to unsubscribe from
   * @param handler - The specific handler to remove. If not provided, all handlers for the event are removed.
   *
   * @remarks
   * When a specific handler is removed and it was the last handler for that event,
   * the event entry is cleaned up from the internal map.
   *
   * @example
   * ```typescript
   * // Remove a specific handler
   * emitter.off('message', myHandler);
   *
   * // Remove all handlers for an event
   * emitter.off('message');
   * ```
   *
   * @public
   */
  off(event: string, handler?: EventHandler): void {
    if (!handler) {
      this.listeners.delete(event);
      return;
    }

    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Removes all event listeners from the emitter.
   *
   * @remarks
   * This method is typically called during component cleanup or disposal
   * to ensure no memory leaks from lingering event subscriptions.
   *
   * @example
   * ```typescript
   * // Clean up all listeners when component is destroyed
   * emitter.removeAllListeners();
   * ```
   *
   * @public
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  /**
   * Returns the number of listeners registered for a specific event.
   *
   * @param event - The name of the event to check
   * @returns The number of handlers currently subscribed to the event
   *
   * @remarks
   * This method is primarily useful for debugging and testing purposes
   * to verify that subscriptions are being properly managed.
   *
   * @example
   * ```typescript
   * console.log(`Active listeners: ${emitter.listenerCount('message')}`);
   * ```
   *
   * @public
   */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
