/**
 * @packageDocumentation
 * Props serialization module for cross-domain transfer.
 *
 * @remarks
 * This module handles serializing and deserializing props for transfer
 * between consumer and host windows across domain boundaries.
 */

import {
	deserializeFunctions,
	type FunctionBridge,
	isSafeObjectKey,
	serializeFunctions,
} from "../communication/bridge";
import type { SerializedProps } from "./types";

/**
 * Serializes props for cross-domain transfer.
 *
 * @remarks
 * Every prop value is JSON-encoded through the function bridge: functions
 * become references, Dates become Date wrappers, and other values convert as
 * native JSON does. A prop whose root `toJSON()` returns `undefined` is omitted.
 *
 * @typeParam P - The props type
 * @param props - Props to serialize
 * @param bridge - Function bridge for serializing functions
 * @returns Serialized props ready for postMessage
 *
 * @internal
 */
export function serializeProps<P extends Record<string, unknown>>(
	props: P,
	bridge: FunctionBridge,
): SerializedProps {
	const result: SerializedProps = {};

	for (const [key, value] of Object.entries(props)) {
		if (value === undefined) continue;

		const serializedValue = serializeFunctions(value, bridge);
		if (serializedValue !== undefined) result[key] = serializedValue;
	}

	return result;
}

/**
 * Deserializes props received from the consumer.
 *
 * @remarks
 * Function references are converted back to callable functions that
 * invoke the original via postMessage.
 *
 * @typeParam P - The props type
 * @param serialized - Serialized props from consumer
 * @param bridge - Function bridge for deserializing functions
 * @param consumerWin - Consumer window reference
 * @param consumerDomain - Consumer origin domain
 * @returns Deserialized props
 *
 * @internal
 */
export function deserializeProps<P extends Record<string, unknown>>(
	serialized: SerializedProps,
	bridge: FunctionBridge,
	consumerWin: Window,
	consumerDomain: string,
): P {
	const result = {} as P;

	for (const [key, value] of Object.entries(serialized)) {
		if (!isSafeObjectKey(key)) continue;

		(result as Record<string, unknown>)[key] = deserializeFunctions(
			value,
			bridge,
			consumerWin,
			consumerDomain,
		);
	}

	return result;
}
