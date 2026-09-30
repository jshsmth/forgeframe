/**
 * Internal helpers for preserving non-JSON runtime values on ForgeFrame's wire formats.
 */

import { PROP_SERIALIZATION, type SerializationType } from "../constants";

interface DateWireValue {
	__forgeframe_wire_type__: "date";
	__forgeframe_wire_value__: string | null;
}

interface RecordWireValue {
	__forgeframe_wire_type__: "record";
	__forgeframe_wire_value__: Record<string, unknown>;
}

/** Detects ordinary records that would look like codec markers after JSON omission. */
export function needsRecordEscape(value: Record<string, unknown>): boolean {
	const keys = Object.keys(value).filter((key) => value[key] !== undefined);
	if (keys.length === 3 && value.__type__ === "function") {
		return keys.includes("__id__") && keys.includes("__name__");
	}
	if (keys.length !== 2) return false;
	return (
		((value.__type__ === "base64" || value.__type__ === "dotify") &&
			keys.includes("__value__")) ||
		((value.__forgeframe_wire_type__ === "date" ||
			value.__forgeframe_wire_type__ === "record") &&
			keys.includes("__forgeframe_wire_value__"))
	);
}

/** Escapes marker-shaped user data, including the escape marker itself. */
export function escapeWireRecord(
	value: Record<string, unknown>,
): Record<string, unknown> | RecordWireValue {
	return needsRecordEscape(value)
		? { __forgeframe_wire_type__: "record", __forgeframe_wire_value__: value }
		: value;
}

/** Recognizes escaped data without interpreting its inner record as a marker. */
export function isRecordWireValue(value: unknown): value is RecordWireValue {
	return (
		isObjectRecord(value) &&
		Reflect.ownKeys(value).length === 2 &&
		hasOwnKey(value, "__forgeframe_wire_type__") &&
		hasOwnKey(value, "__forgeframe_wire_value__") &&
		value.__forgeframe_wire_type__ === "record" &&
		isObjectRecord(value.__forgeframe_wire_value__) &&
		!Array.isArray(value.__forgeframe_wire_value__)
	);
}

/** Rejects array entries that JSON would silently change to null. @internal */
export function assertDefinedArrayEntry(value: unknown, path: string[]): void {
	if (value === undefined) {
		throw new Error(
			`Cannot serialize undefined array entry at ${JSON.stringify(path)}; use null with nullable() or an item default`,
		);
	}
}

/** Checks array contents without running custom JSON encoders. @internal */
export function assertDefinedArrayEntries(
	value: unknown,
	path: string[] = [],
	encoding: SerializationType = PROP_SERIALIZATION.JSON,
	seen = new WeakSet<object>(),
): void {
	if (typeof value !== "object" || value === null || seen.has(value)) return;
	if (value instanceof Date) return;
	// DOTIFY falls back to bridge encoding for a top-level array.
	const nodeEncoding =
		encoding === PROP_SERIALIZATION.DOTIFY && Array.isArray(value)
			? PROP_SERIALIZATION.JSON
			: encoding;
	// Encoded leaves are checked by the replacer after their encoder runs.
	if (nodeEncoding === PROP_SERIALIZATION.BASE64 && hasJsonEncoder(value))
		return;
	seen.add(value);
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			assertDefinedArrayEntry(value[index], [...path, String(index)]);
			assertDefinedArrayEntries(
				value[index],
				[...path, String(index)],
				nodeEncoding,
				seen,
			);
		}
		return;
	}
	for (const [key, entry] of Object.entries(value)) {
		// Bridge/DOTIFY decoding discards this field; JSON bridge encoding also
		// omits it before serialization. It cannot change a delivered array.
		if (key === "__proto__" && nodeEncoding === PROP_SERIALIZATION.JSON)
			continue;
		const childEncoding =
			nodeEncoding === PROP_SERIALIZATION.DOTIFY && !isDotifyObjectBranch(entry)
				? PROP_SERIALIZATION.BASE64
				: nodeEncoding;
		assertDefinedArrayEntries(entry, [...path, key], childEncoding, seen);
	}
}

/** Mirrors DOTIFY's own-field object traversal rather than JSON leaf encoding. */
function isDotifyObjectBranch(value: unknown): boolean {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	const prototype = Object.getPrototypeOf(value);
	return (
		(prototype === Object.prototype || prototype === null) &&
		!needsRecordEscape(value as Record<string, unknown>)
	);
}

/** Detects methods without invoking computed encoders during admission. */
function hasJsonEncoder(value: object): boolean {
	for (
		let current: object | null = value;
		current;
		current = Object.getPrototypeOf(current)
	) {
		const descriptor = Object.getOwnPropertyDescriptor(current, "toJSON");
		if (descriptor)
			return "value" in descriptor
				? typeof descriptor.value === "function"
				: typeof descriptor.get === "function";
	}
	return false;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function hasOwnKey(value: Record<string, unknown>, key: string): boolean {
	return Object.hasOwn(value, key);
}

/**
 * Encodes a Date as a JSON-safe wrapper for cross-window transport.
 * @internal
 */
export function encodeDateWireValue(value: Date): DateWireValue {
	return {
		__forgeframe_wire_type__: "date",
		__forgeframe_wire_value__: value.toJSON(),
	};
}

/**
 * Returns true when a value is a ForgeFrame Date wire wrapper.
 * @internal
 */
export function isDateWireValue(value: unknown): value is DateWireValue {
	if (
		!isObjectRecord(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	) {
		return false;
	}

	const ownKeys = Reflect.ownKeys(value);
	if (ownKeys.length !== 2) {
		return false;
	}

	return (
		hasOwnKey(value, "__forgeframe_wire_type__") &&
		hasOwnKey(value, "__forgeframe_wire_value__") &&
		value.__forgeframe_wire_type__ === "date" &&
		(typeof value.__forgeframe_wire_value__ === "string" ||
			value.__forgeframe_wire_value__ === null)
	);
}

/**
 * Decodes a Date wire wrapper back into a Date instance.
 * @internal
 */
export function decodeDateWireValue(value: DateWireValue): Date {
	return value.__forgeframe_wire_value__ === null
		? new Date(Number.NaN)
		: new Date(value.__forgeframe_wire_value__);
}

/**
 * Stringifies a value while preserving Date instances through JSON transport.
 *
 * @param encodeFunction - Optional prop-codec encoder; omitted callbacks keep JSON behavior.
 * @internal
 */
export function stringifyWireValue(
	value: unknown,
	encodeFunction?: (fn: (...args: unknown[]) => unknown) => unknown,
): string {
	const escapedRecords = new WeakSet<object>();
	return JSON.stringify(value, function wireValueReplacer(key, jsonValue) {
		const holder = this as Record<string, unknown>;
		const originalValue = key === "" ? value : holder[key];
		if (encodeFunction && Array.isArray(holder)) {
			assertDefinedArrayEntry(jsonValue, [key]);
		}

		if (originalValue instanceof Date)
			return encodeDateWireValue(originalValue);
		if (
			encodeFunction &&
			isObjectRecord(jsonValue) &&
			!Array.isArray(jsonValue) &&
			!escapedRecords.has(jsonValue) &&
			needsRecordEscape(jsonValue)
		) {
			const record = { ...jsonValue };
			escapedRecords.add(record);
			return escapeWireRecord(record);
		}
		return typeof jsonValue === "function" && encodeFunction
			? encodeFunction(jsonValue)
			: jsonValue;
	});
}

/**
 * Parses a JSON string and revives any ForgeFrame Date wire wrappers.
 * @internal
 */
export function parseWireValue(json: string): unknown {
	return JSON.parse(json, (_key, value) =>
		isDateWireValue(value) ? decodeDateWireValue(value) : value,
	);
}
