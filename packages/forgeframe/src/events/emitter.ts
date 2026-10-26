import { ForgeFrameError } from "../errors";
import type { EventHandler, EventSubscriber } from "../types/events";

/** One handler's subscription; its object identity is the registration token. */
interface ListenerRegistration {
	once: boolean;
}

/**
 * A typed event emitter for component lifecycle events.
 *
 * @remarks
 * ForgeFrame keeps each emitter private to the runtime that owns it. Callers
 * receive an {@link EventSubscriber} facade from {@link createEventSubscriber},
 * so only the owning runtime can emit.
 *
 * @example
 * ```typescript
 * const emitter = new EventEmitter<{ message: string }>();
 * const unsubscribe = emitter.on('message', (data) => {
 *   console.log('Received:', data);
 * });
 * emitter.emit('message', 'Hello, World!');
 * unsubscribe();
 * ```
 *
 * @internal
 */
export class EventEmitter<Events extends object> {
	/**
	 * Internal storage for event listeners mapped by event name. Each handler
	 * has at most one registration per event, whose identity is its token.
	 * @internal
	 */
	private listeners = new Map<
		keyof Events,
		Map<EventHandler, ListenerRegistration>
	>();

	/** Set by {@link EventEmitter.dispose}; later registrations are inert. */
	private disposed = false;

	/**
	 * Subscribes a handler to a specific event.
	 *
	 * @param event - The name of the event to subscribe to
	 * @param handler - The callback function to invoke when the event is emitted
	 * @returns A function that, when called, unsubscribes the handler from the event
	 *
	 * @internal
	 */
	on<K extends keyof Events>(
		event: K,
		handler: EventHandler<Events[K]>,
	): () => void {
		return this.register(event, handler as EventHandler, false);
	}

	/**
	 * Subscribes a handler to an event that will automatically unsubscribe after the first invocation.
	 *
	 * @param event - The name of the event to subscribe to
	 * @param handler - The callback function to invoke once when the event is emitted
	 * @returns A function that, when called, unsubscribes the handler before it fires
	 *
	 * @internal
	 */
	once<K extends keyof Events>(
		event: K,
		handler: EventHandler<Events[K]>,
	): () => void {
		return this.register(event, handler as EventHandler, true);
	}

	/**
	 * Adds a registration unless the handler already has one, as DOM listeners do.
	 * The returned function removes only the registration it was created for.
	 */
	private register(
		event: keyof Events,
		handler: EventHandler,
		once: boolean,
	): () => void {
		if (this.disposed) return () => {};
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
		event: keyof Events,
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
	 * @param event - The name of the event to emit
	 * @param data - Data to pass to all registered handlers; `undefined` for
	 * events without a payload, so every payload-carrying event must supply one
	 *
	 * @remarks
	 * Handlers are invoked synchronously in the order they were registered.
	 * Newly registered handlers wait for the next emission. A handler removed
	 * before its turn is skipped.
	 * If a handler throws an error, it is caught and logged to the console,
	 * allowing subsequent handlers to still execute.
	 *
	 * @internal
	 */
	emit<K extends keyof Events>(event: K, data: Events[K]): void {
		const handlers = this.listeners.get(event);
		if (!handlers) return;

		for (const [handler, registration] of [...handlers]) {
			if (
				this.listeners.get(event) !== handlers ||
				handlers.get(handler) !== registration
			)
				continue;
			if (registration.once) this.removeRegistration(event, handlers, handler);
			this.invokeHandler(String(event), handler, data);
		}
	}

	/** Executes one observer while isolating both synchronous and asynchronous failures. */
	private invokeHandler(
		event: string,
		handler: EventHandler,
		data: unknown,
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
	 * Removes all event listeners for good.
	 *
	 * @remarks
	 * The owning runtime calls this at the end of teardown. Later
	 * subscriptions are accepted and never called.
	 *
	 * @internal
	 */
	dispose(): void {
		this.disposed = true;
		this.listeners.clear();
	}
}

/**
 * Creates the frozen `on`/`once` facade that callers receive for an emitter.
 *
 * @param emitter - The private emitter the facade subscribes to
 * @param events - Event names callers may subscribe to
 * @param describeUnknown - Builds the error message for any other name
 * @returns A facade that cannot emit or remove other code's listeners
 *
 * @internal
 */
export function createEventSubscriber<Events extends object>(
	emitter: EventEmitter<Events>,
	events: ReadonlySet<string>,
	describeUnknown: (event: string) => string,
): EventSubscriber<Events> {
	const assertKnown = (event: unknown, handler: unknown): void => {
		if (typeof event !== "string" || !events.has(event)) {
			throw new ForgeFrameError("VALIDATION", describeUnknown(String(event)));
		}
		if (typeof handler !== "function") {
			throw new ForgeFrameError(
				"VALIDATION",
				`The "${event}" event handler must be a function`,
			);
		}
	};
	return Object.freeze({
		on: (event, handler) => {
			assertKnown(event, handler);
			return emitter.on(event, handler);
		},
		once: (event, handler) => {
			assertKnown(event, handler);
			return emitter.once(event, handler);
		},
	} satisfies EventSubscriber<Events>);
}
