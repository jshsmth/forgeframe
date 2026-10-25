/**
 * @packageDocumentation
 * Host event names.
 *
 * @remarks
 * Defines which names `host.on()` and `host.once()` accept and how the
 * removed v1 `props` event is reported, matching the consumer's event policy.
 */

import { EVENT } from "../../constants";

/** Names `host.on()` and `host.once()` accept. @internal */
export const HOST_EVENT_NAMES: ReadonlySet<string> = new Set([EVENT.ERROR]);

/**
 * Describes a name outside the host event map, naming the replacement of the
 * removed `props` event.
 * @internal
 */
export function describeUnknownHostEvent(event: string): string {
	if (event === "props") {
		return 'The host "props" event was removed in ForgeFrame 2; use hostProps.onProps(handler) instead';
	}
	return `Host events support "error", not "${event}"`;
}
