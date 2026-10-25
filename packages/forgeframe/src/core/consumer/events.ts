/**
 * @packageDocumentation
 * Consumer lifecycle event names.
 *
 * @remarks
 * Defines which names `instance.event` accepts and how removed v1 names are
 * reported, so JavaScript callers learn the replacement instead of waiting
 * for an event that never fires.
 */

import { EVENT } from "../../constants";

/** Names `instance.event.on()` and `once()` accept. @internal */
export const CONSUMER_EVENT_NAMES: ReadonlySet<string> = new Set(
	Object.values(EVENT),
);

/** Removed v1 event names and the events that replace them. */
const REMOVED_CONSUMER_EVENTS: Readonly<Record<string, string>> = {
	prerender: EVENT.RENDER,
	prerendered: EVENT.RENDER,
	display: EVENT.RENDERED,
	destroy: EVENT.CLOSED,
};

/**
 * Describes a name outside the consumer event map, naming the replacement of
 * a removed event.
 * @internal
 */
export function describeUnknownConsumerEvent(event: string): string {
	const replacement = Object.hasOwn(REMOVED_CONSUMER_EVENTS, event)
		? REMOVED_CONSUMER_EVENTS[event]
		: undefined;
	if (replacement) {
		return `The "${event}" event was removed in ForgeFrame 2; subscribe to "${replacement}" instead`;
	}
	return `Unknown component event "${event}". Supported events: ${[...CONSUMER_EVENT_NAMES].join(", ")}`;
}
