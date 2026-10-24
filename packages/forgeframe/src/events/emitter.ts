import type { EventEmitterInterface, EventHandler } from "../types/events";

/** One handler's subscription; its object identity is the registration token. */
interface ListenerRegistration {
	once: boolean;
}

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
	 * Internal storage for event listeners mapped by event name. Each handler
	 * has at most one registration per event, whose identity is its token.
	 * @internal
	 */
	private listeners = new Map<
		string,
		Map<EventHandler, ListenerRegistration>
	>();

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
		return this.register(event, handler as EventHandler, false);
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
		return this.register(event, handler as EventHandler, true);
	}

	/**
	 * Adds a registration unless the handler already has one, as DOM listeners do.
	 * The returned function removes only the registration it was created for.
	 */
	private register(
		event: string,
		handler: EventHandler,
		once: boolean,
	): () => void {
		let handlers = this.listeners.get(event);
		if (!handlers) {
			handlers = new Map();
			this.listeners.set(event, handlers);
		}
		const registration = handlers.get(handler) ?? { once };
		// Re-setting an existing key keeps its registration and position.
		handlers.set(handler, registration);

		return () => {
			const current = this.listeners.get(event);
			if (current?.get(handler) === registration)
				this.removeRegistration(event, current, handler);
		};
	}

	/** Removes one handler's registration and drops the event when it has none. */
	private removeRegistration(
		event: string,
		handlers: Map<EventHandler, ListenerRegistration>,
		handler: EventHandler,
	): void {
		handlers.delete(handler);
		if (handlers.size === 0 && this.listeners.get(event) === handlers) {
			this.listeners.delete(event);
		}
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
	 * Newly registered handlers wait for the next emission. A handler removed
	 * before its turn is skipped.
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

		for (const [handler, registration] of [...handlers]) {
			if (
				this.listeners.get(event) !== handlers ||
				handlers.get(handler) !== registration
			)
				continue;
			if (registration.once) this.removeRegistration(event, handlers, handler);
			this.invokeHandler(event, handler, data);
		}
	}

	/** Executes one observer while isolating both synchronous and asynchronous failures. */
	private invokeHandler<T>(
		event: string,
		handler: EventHandler,
		data?: T,
	): void {
		try {
			const result = handler(data);
			// Handle async handlers - catch promise rejections
			if (
				result &&
				typeof result === "object" &&
				"catch" in result &&
				typeof result.catch === "function"
			) {
				(result as Promise<unknown>).catch((err: unknown) => {
					console.error(`Error in async event handler for "${event}":`, err);
				});
			}
		} catch (err) {
			console.error(`Error in event handler for "${event}":`, err);
		}
	}

	/**
	 * Unsubscribes a handler from an event, or removes all handlers for the event.
	 *
	 * @typeParam T - The event data expected by the handler
	 * @param event - The name of the event to unsubscribe from
	 * @param handler - The specific handler to remove. If not provided, all handlers for the event are removed.
	 *
	 * @remarks
	 * Removing a specific handler also cancels its pending `once` registration.
	 * When it was the last handler for that event, the event entry is cleaned up
	 * from the internal map.
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
	off<T = unknown>(event: string, handler?: EventHandler<T>): void {
		if (!handler) {
			this.listeners.delete(event);
			return;
		}

		const handlers = this.listeners.get(event);
		if (handlers) {
			this.removeRegistration(event, handlers, handler as EventHandler);
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
