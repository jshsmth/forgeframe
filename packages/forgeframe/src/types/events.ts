/**
 * Shared public event types.
 */

import type { EventType } from '../constants';

/**
 * Handler function for component events.
 *
 * @typeParam T - The type of data passed to the handler
 *
 * @public
 */
export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

/**
 * Event emitter interface for component lifecycle events.
 *
 * @public
 */
export interface EventEmitterInterface {
  /**
   * Subscribe to an event.
   *
   * @param event - Event name to listen for
   * @param handler - Handler function to call
   * @returns Unsubscribe function
   */
  on<T = unknown>(event: EventType | string, handler: EventHandler<T>): () => void;

  /**
   * Subscribe to an event for a single emission.
   *
   * @param event - Event name to listen for
   * @param handler - Handler function to call
   * @returns Unsubscribe function
   */
  once<T = unknown>(event: EventType | string, handler: EventHandler<T>): () => void;

  /**
   * Emit an event with optional data.
   *
   * @param event - Event name to emit
   * @param data - Data to pass to handlers
   */
  emit<T = unknown>(event: EventType | string, data?: T): void;

  /**
   * Unsubscribe a handler from an event.
   *
   * @param event - Event name
   * @param handler - Handler to remove (optional, removes all if not provided)
   */
  off(event: EventType | string, handler?: EventHandler): void;

  /**
   * Remove all event listeners.
   */
  removeAllListeners(): void;
}
