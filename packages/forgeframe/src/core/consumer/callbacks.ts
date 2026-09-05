/**
 * @packageDocumentation
 * Consumer callback helper module.
 *
 * @remarks
 * Centralizes consumer-side prop callback invocation and error dispatch so the
 * main consumer component can stay focused on lifecycle orchestration.
 */

import { EVENT } from "../../constants";
import type { EventEmitter } from "../../events/emitter";

/**
 * Calls a prop callback if it exists while isolating sync and async failures.
 * @internal
 */
export function invokePropCallback(
	props: Record<string, unknown>,
	name: string,
	...args: unknown[]
): void {
	const callback = props[name];
	if (typeof callback !== "function") {
		return;
	}

	try {
		const result = callback(...args);
		if (
			result &&
			typeof result === "object" &&
			"catch" in result &&
			typeof result.catch === "function"
		) {
			(result as Promise<unknown>).catch((error: unknown) => {
				console.error(`Error in async ${name} callback:`, error);
			});
		}
	} catch (error) {
		console.error(`Error in ${name} callback:`, error);
	}
}

/**
 * Emits a consumer error event and forwards it to the `onError` prop callback.
 * @internal
 */
export function emitConsumerError(
	event: EventEmitter,
	props: Record<string, unknown>,
	error: Error,
): void {
	event.emit(EVENT.ERROR, error);
	invokePropCallback(props, "onError", error);
}
