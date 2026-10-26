/**
 * Shared public event types.
 */

import type { RemoteValue } from "./runtime";
import type { Dimensions } from "./utility";

/**
 * Handler function for component events.
 *
 * @typeParam T - The type of data passed to the handler
 *
 * @public
 */
export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

/**
 * Subscribe-only view of a typed event map.
 *
 * @typeParam Events - Maps each event name to its payload type
 *
 * @remarks
 * Handlers run synchronously in registration order. A handler registered
 * twice for the same event keeps its first registration. Handlers added
 * during an emission wait for the next one, and handlers removed before
 * their turn are skipped. Thrown errors and rejected promises are logged.
 * An unsubscribe function removes only the registration it created, and
 * also cancels a pending `once`.
 *
 * Subscribing to a name outside the event map throws a `TypeError`.
 *
 * @public
 */
export interface EventSubscriber<Events extends object> {
	/**
	 * Subscribes to every emission of an event.
	 *
	 * @param event - Event name to listen for
	 * @param handler - Handler that receives the event's payload
	 * @returns A function that removes this registration
	 */
	on<K extends keyof Events>(
		event: K,
		handler: EventHandler<Events[K]>,
	): () => void;

	/**
	 * Subscribes to the next emission of an event.
	 *
	 * @param event - Event name to listen for
	 * @param handler - Handler that receives the event's payload
	 * @returns A function that removes this registration before it fires
	 */
	once<K extends keyof Events>(
		event: K,
		handler: EventHandler<Events[K]>,
	): () => void;
}

/**
 * Names of the lifecycle events a consumer instance emits.
 *
 * @example
 * ```typescript
 * instance.event.on('rendered', () => {
 *   console.log('Component is ready!');
 * });
 * ```
 *
 * @public
 */
export type EventType = keyof ComponentEvents;

/**
 * Lifecycle events of a consumer instance, with their payloads.
 *
 * @typeParam P - The props type for the component
 * @typeParam Exports - The type of exports from the host, from the `exports` schema
 *
 * @remarks
 * Subscribe with `instance.event.on(name, handler)`.
 *
 * @public
 */
export interface ComponentEvents<
	P = Record<string, unknown>,
	Exports = unknown,
> {
	/**
	 * Rendering started. Fires once per render attempt, after props are
	 * validated and the container is resolved, and before any iframe, popup
	 * or placeholder exists. Calling `close()` here stops the render.
	 */
	render: undefined;
	/**
	 * The host initialized and the component is visible. Fires before the
	 * `render()` promise resolves.
	 */
	rendered: undefined;
	/**
	 * Closing started, from `close()`, the host's `close()`, or the user
	 * closing the popup. It does not fire when a failed render tears the
	 * instance down.
	 */
	close: undefined;
	/**
	 * Teardown finished. Always the last event; ForgeFrame removes every
	 * listener afterwards.
	 */
	closed: undefined;
	/**
	 * The handshake timed out, or the host reported an error with
	 * `hostProps.reportError()`.
	 */
	error: Error;
	/**
	 * A props update was committed and, when a host is connected,
	 * acknowledged by it.
	 */
	props: P;
	/** A resize from the consumer or the host was applied. */
	resize: Dimensions;
	/** A focus request was applied to a mounted iframe or an open popup. */
	focus: undefined;
	/**
	 * The host exported values with `hostProps.export()`. `instance.exports`
	 * already holds them.
	 */
	exports: RemoteValue<Exports>;
}

/**
 * Events of a running host, with their payloads.
 *
 * @remarks
 * Subscribe with `host.on(name, handler)` on the object `initHost()` returns.
 *
 * @public
 */
export interface HostEvents {
	/**
	 * Props were rejected, start-up failed, or INIT could not be delivered.
	 * A wrapped failure keeps the original error on `cause`.
	 */
	error: Error;
}
