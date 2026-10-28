/**
 * Internal helpers for preserving non-JSON runtime values on ForgeFrame's wire formats.
 */

import { ForgeFrameError } from "../errors";
import { stringifyForWire } from "./json";
import { isDate, isPlainObject } from "./realm-values";

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
	const keys = Object.keys(value).filter(
		(key) => value[key] !== undefined && typeof value[key] !== "symbol",
	);
	if (keys.length === 3 && toWrittenJsonValue(value.__type__) === "function") {
		return keys.includes("__id__") && keys.includes("__name__");
	}
	if (keys.length !== 2) return false;
	const wireType = toWrittenJsonValue(value.__forgeframe_wire_type__);
	return (
		(wireType === "date" || wireType === "record") &&
		keys.includes("__forgeframe_wire_value__")
	);
}

/** Reads a marker field as the receiver will parse it; raw JSON yields the value its text represents. */
function toWrittenJsonValue(value: unknown): unknown {
	return isObjectRecord(value) && isRawJsonValue(value)
		? JSON.parse((value as { rawJSON: string }).rawJSON)
		: value;
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
		throw new ForgeFrameError(
			"VALIDATION",
			`Cannot serialize undefined array entry at ${JSON.stringify(path)}; use null with nullable() or an item default`,
		);
	}
}

/** Checks array contents without running custom JSON encoders. @internal */
export function assertDefinedArrayEntries(
	value: unknown,
	path: string[] = [],
	seen: WeakSet<object> = new WeakSet<object>(),
): void {
	if (typeof value !== "object" || value === null || seen.has(value)) return;
	if (isDate(value)) return;
	// Encoded values are checked during delivery after their encoder runs.
	if (convertsThroughJsonEncoder(value)) return;
	seen.add(value);
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			assertDefinedArrayEntry(value[index], [...path, String(index)]);
			assertDefinedArrayEntries(value[index], [...path, String(index)], seen);
		}
		return;
	}
	for (const [key, entry] of Object.entries(value)) {
		// Bridge encoding omits this field, so it cannot change a delivered array.
		if (key === "__proto__") continue;
		assertDefinedArrayEntries(entry, [...path, key], seen);
	}
}

/** Mirrors the JSON bridge, which converts non-array objects through `toJSON()`. */
function convertsThroughJsonEncoder(value: object): boolean {
	return !Array.isArray(value) && hasJsonEncoder(value);
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
		!isPlainObject(value) ||
		Object.getPrototypeOf(value) === null
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

/** The platform's raw-JSON brand check, resolved once when the runtime has one. */
const nativeIsRawJSON = (JSON as { isRawJSON?: unknown }).isRawJSON;

/**
 * Recognizes native raw JSON, including values from another realm, when the
 * runtime supports it.
 * @internal
 */
export function isRawJsonValue(value: object): boolean {
	return typeof nativeIsRawJSON === "function" && nativeIsRawJSON(value);
}

/**
 * Applies native JSON conversion once: a callable `toJSON(key)`, then
 * primitive-wrapper unboxing. The result is not converted again. Callers
 * decide which values convert; bridge arrays never do.
 * @internal
 */
export function toJsonValue(value: object, key: string): unknown {
	const toJSON = (value as { toJSON?: unknown }).toJSON;
	const converted =
		typeof toJSON === "function" ? toJSON.call(value, key) : value;
	return isObjectRecord(converted) && !isPlainObject(converted)
		? unboxJsonPrimitive(converted)
		: converted;
}

/** Uses native unboxing without probing records through throwing slot checks. */
function unboxJsonPrimitive(value: object): unknown {
	if (Array.isArray(value)) return value;
	// The dummy encoder returns the value after the native toJSON lookup.
	// An empty property list skips record fields entirely, while native JSON
	// still unboxes primitive wrappers. Return that conversion so coercion
	// hooks run once, including for wrappers with customized prototypes.
	const json = stringifyForWire({ toJSON: () => value }, "a value", []);
	return json === "{}" || json === undefined ? value : JSON.parse(json);
}
