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
	serializeFunctions,
} from "../communication/bridge";
import type { Messenger } from "../communication/messenger";
import { PROP_SERIALIZATION } from "../constants";
import type { PropDefinition, PropsDefinition } from "../types/props";
import {
	decodeDateWireValue,
	encodeDateWireValue,
	isDateWireValue,
	needsRecordEscape,
	stringifyWireValue,
} from "../utils/wire-value";
import { BUILTIN_PROP_DEFINITIONS } from "./definitions";
import type { SerializedProps } from "./types";

const UNSAFE_OBJECT_KEYS = new Set(["__proto__"]);
const DOTIFY_FRAMED_PATH_PREFIX = "__forgeframe.dotify_path__:";
const DOTIFY_EMPTY_OBJECT_PATH_PREFIX =
	"__forgeframe.dotify_empty_object_path__:";
const DOTIFY_EMPTY_OBJECT_PAYLOAD = "__forgeframe.dotify_empty_object__";

/**
 * Returns true when a key can be safely assigned on reconstructed objects.
 * @internal
 */
function isSafeObjectKey(key: string): boolean {
	return !UNSAFE_OBJECT_KEYS.has(key);
}

/**
 * Returns true when a value is a plain object branch suitable for DOTIFY traversal.
 * @internal
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/**
 * Encodes a DOTIFY path using the framed path format.
 * @internal
 */
function encodeDotNotationPath(
	path: string[],
	prefix = DOTIFY_FRAMED_PATH_PREFIX,
): string {
	return `${prefix}${encodeURIComponent(JSON.stringify(path))}`;
}

/**
 * Encodes a DOTIFY value segment.
 * @internal
 */
function encodeDotNotationValue(
	value: unknown,
	bridge: FunctionBridge,
): string {
	return encodeURIComponent(
		stringifyWireValue(value, (fn) => bridge.serialize(fn)),
	);
}

/**
 * Creates a DOTIFY key/value pair for a path.
 * @internal
 */
function createDotNotationPair(
	path: string[],
	value: unknown,
	bridge: FunctionBridge,
): string {
	return `${encodeDotNotationPath(path)}=${encodeDotNotationValue(value, bridge)}`;
}

/**
 * Creates a DOTIFY entry representing an empty plain-object branch.
 * @internal
 */
function createDotNotationEmptyObjectPair(path: string[]): string {
	return `${encodeDotNotationPath(path, DOTIFY_EMPTY_OBJECT_PATH_PREFIX)}=1`;
}

/**
 * Defines an enumerable data property without triggering prototype setters.
 * @internal
 */
function defineDataProperty(
	target: Record<string, unknown>,
	key: string,
	value: unknown,
): void {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		writable: true,
		value,
	});
}

/**
 * Converts a nested object to the DOTIFY wire format string.
 *
 * @remarks
 * Every path is encoded as an explicitly-prefixed, JSON-framed array so keys
 * round-trip safely regardless of reserved separators such as `.`, `&`, or `=`.
 *
 * @internal
 */
function toDotNotation(
	obj: Record<string, unknown>,
	bridge: FunctionBridge,
	path: string[] = [],
): string {
	const entries = Object.entries(obj);
	if (entries.length === 0 && isPlainObject(obj)) {
		if (path.length === 0) {
			return DOTIFY_EMPTY_OBJECT_PAYLOAD;
		}

		return createDotNotationEmptyObjectPair(path);
	}

	const parts: string[] = [];

	for (const [key, value] of entries) {
		if (value === undefined) continue;

		const nextPath = [...path, key];

		if (isPlainObject(value) && !needsRecordEscape(value)) {
			parts.push(toDotNotation(value, bridge, nextPath));
		} else {
			parts.push(createDotNotationPair(nextPath, value, bridge));
		}
	}

	return parts.filter(Boolean).join("&");
}

/**
 * Converts a DOTIFY wire format string back to a nested object.
 *
 * @remarks
 * Only the current prefixed framed-path format is supported.
 *
 * @internal
 */
function fromDotNotation(str: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	if (!str || str === DOTIFY_EMPTY_OBJECT_PAYLOAD) return result;
	for (const pair of str.split("&")) {
		const entry = decodeDotNotationPair(pair);
		if (!entry) continue;
		const keys = decodeDotNotationPath(entry.path);
		if (keys.some((key) => !isSafeObjectKey(key))) continue;
		assignDotNotationPath(result, keys, entry.value);
	}
	return result;
}

/** Decodes one framed pair; malformed wrappers retain their existing fallback. */
function decodeDotNotationPair(
	pair: string,
): { path: string; value: unknown } | null {
	const separatorIndex = pair.indexOf("=");
	if (separatorIndex === -1) return null;

	const path = pair.slice(0, separatorIndex);
	const encodedValue = pair.slice(separatorIndex + 1);
	if (!path || encodedValue === undefined) return null;

	const isEmptyObjectPath = path.startsWith(DOTIFY_EMPTY_OBJECT_PATH_PREFIX);
	let value: unknown;
	if (isEmptyObjectPath) {
		if (encodedValue !== "1") {
			throw new Error("Invalid empty-object DOTIFY entry");
		}
		value = {};
	} else {
		try {
			value = JSON.parse(decodeURIComponent(encodedValue));
		} catch {
			value = decodeURIComponent(encodedValue);
		}
	}

	return { path, value };
}

/** Reconstructs one safe path without invoking prototype setters at its leaf. */
function assignDotNotationPath(
	result: Record<string, unknown>,
	keys: string[],
	value: unknown,
): void {
	let current = result;

	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		const existing = current[key];
		if (
			!Object.hasOwn(current, key) ||
			typeof existing !== "object" ||
			existing === null ||
			Array.isArray(existing)
		) {
			current[key] = {};
		}
		current = current[key] as Record<string, unknown>;
	}

	const leafKey = keys[keys.length - 1];
	defineDataProperty(current, leafKey, value);
}

/**
 * Decodes a DOTIFY path using the explicit framed format.
 * @internal
 */
function decodeDotNotationPath(path: string): string[] {
	const prefix = path.startsWith(DOTIFY_EMPTY_OBJECT_PATH_PREFIX)
		? DOTIFY_EMPTY_OBJECT_PATH_PREFIX
		: DOTIFY_FRAMED_PATH_PREFIX;

	if (!path.startsWith(prefix)) {
		throw new Error("Invalid DOTIFY path framing");
	}

	const decodedPath = decodeURIComponent(path.slice(prefix.length));
	const parsed = JSON.parse(decodedPath);
	if (
		Array.isArray(parsed) &&
		parsed.length > 0 &&
		parsed.every((segment) => typeof segment === "string")
	) {
		return parsed;
	}

	throw new Error("Invalid DOTIFY path framing");
}

/**
 * Checks if a value is dotify encoded.
 * @internal
 */
function isDotifyEncoded(
	value: unknown,
): value is { __type__: "dotify"; __value__: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		Reflect.ownKeys(value).length === 2 &&
		Object.hasOwn(value, "__type__") &&
		Object.hasOwn(value, "__value__") &&
		(value as Record<string, unknown>).__type__ === "dotify" &&
		typeof (value as Record<string, unknown>).__value__ === "string"
	);
}

/**
 * Serializes props for cross-domain transfer.
 *
 * @remarks
 * Functions are converted to references, objects are JSON/base64/dotify encoded
 * based on the prop definition's serialization setting.
 *
 * @typeParam P - The props type
 * @param props - Props to serialize
 * @param definitions - Prop definitions
 * @param bridge - Function bridge for serializing functions
 * @returns Serialized props ready for postMessage
 *
 * @public
 */
export function serializeProps<P extends Record<string, unknown>, I = P>(
	props: P,
	definitions: PropsDefinition<P, I>,
	bridge: FunctionBridge,
): SerializedProps {
	const allDefs = {
		...BUILTIN_PROP_DEFINITIONS,
		...definitions,
	} as PropsDefinition<P, I>;

	const result: SerializedProps = {};

	for (const [key, value] of Object.entries(props)) {
		if (value === undefined) continue;

		const definition = (allDefs as Record<string, PropDefinition>)[key];

		result[key] = serializeValue(value, definition, bridge);
	}

	return result;
}

/**
 * Serializes a single value.
 * @internal
 */
function serializeValue(
	value: unknown,
	definition: PropDefinition | undefined,
	bridge: FunctionBridge,
): unknown {
	if (typeof value === "function") {
		return bridge.serialize(value as (...args: unknown[]) => unknown);
	}

	if (value instanceof Date) {
		return encodeDateWireValue(value);
	}

	const serialization = definition?.serialization ?? PROP_SERIALIZATION.JSON;

	if (serialization === PROP_SERIALIZATION.BASE64) {
		if (typeof value === "object") {
			const json = stringifyWireValue(value, (fn) => bridge.serialize(fn));
			return {
				__type__: "base64",
				__value__: btoa(encodeURIComponent(json)),
			};
		}
	}

	if (serialization === PROP_SERIALIZATION.DOTIFY) {
		if (
			typeof value === "object" &&
			value !== null &&
			!Array.isArray(value) &&
			!needsRecordEscape(value as Record<string, unknown>)
		) {
			return {
				__type__: "dotify",
				__value__: toDotNotation(value as Record<string, unknown>, bridge),
			};
		}
	}

	return serializeFunctions(value, bridge);
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
 * @param definitions - Prop definitions
 * @param messenger - Messenger for function calls
 * @param bridge - Function bridge for deserializing functions
 * @param consumerWin - Consumer window reference
 * @param consumerDomain - Consumer origin domain
 * @returns Deserialized props
 *
 * @public
 */
export function deserializeProps<P extends Record<string, unknown>, I = P>(
	serialized: SerializedProps,
	definitions: PropsDefinition<P, I>,
	messenger: Messenger,
	bridge: FunctionBridge,
	consumerWin: Window,
	consumerDomain: string,
): P {
	const allDefs = {
		...BUILTIN_PROP_DEFINITIONS,
		...definitions,
	} as PropsDefinition<P, I>;

	const result = {} as P;

	for (const [key, value] of Object.entries(serialized)) {
		if (!isSafeObjectKey(key)) continue;

		const definition = (allDefs as Record<string, PropDefinition>)[key];

		(result as Record<string, unknown>)[key] = deserializeValue(
			value,
			definition,
			messenger,
			bridge,
			consumerWin,
			consumerDomain,
		);
	}

	return result;
}

/**
 * Deserializes a single value.
 * @internal
 */
function deserializeValue(
	value: unknown,
	_definition: PropDefinition | undefined,
	_messenger: Messenger,
	bridge: FunctionBridge,
	consumerWin: Window,
	consumerDomain: string,
): unknown {
	if (isDateWireValue(value)) {
		return decodeDateWireValue(value);
	}

	if (isBase64Encoded(value)) {
		try {
			const json = decodeURIComponent(atob(value.__value__));
			return deserializeFunctions(
				JSON.parse(json),
				bridge,
				consumerWin,
				consumerDomain,
			);
		} catch {
			return value;
		}
	}

	if (isDotifyEncoded(value)) {
		try {
			return deserializeFunctions(
				fromDotNotation(value.__value__),
				bridge,
				consumerWin,
				consumerDomain,
			);
		} catch {
			return value;
		}
	}

	return deserializeFunctions(value, bridge, consumerWin, consumerDomain);
}

/**
 * Checks if a value is base64 encoded.
 * @internal
 */
function isBase64Encoded(
	value: unknown,
): value is { __type__: "base64"; __value__: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		Reflect.ownKeys(value).length === 2 &&
		Object.hasOwn(value, "__type__") &&
		Object.hasOwn(value, "__value__") &&
		(value as Record<string, unknown>).__type__ === "base64" &&
		typeof (value as Record<string, unknown>).__value__ === "string"
	);
}
