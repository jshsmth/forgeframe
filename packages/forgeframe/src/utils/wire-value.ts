/**
 * Internal helpers for preserving non-JSON runtime values on ForgeFrame's wire formats.
 */

interface DateWireValue {
  __forgeframe_wire_type__: 'date';
  __forgeframe_wire_value__: string | null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasOwnKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Encodes a Date as a JSON-safe wrapper for cross-window transport.
 * @internal
 */
export function encodeDateWireValue(value: Date): DateWireValue {
  return {
    __forgeframe_wire_type__: 'date',
    __forgeframe_wire_value__: value.toJSON(),
  };
}

/**
 * Returns true when a value is a ForgeFrame Date wire wrapper.
 * @internal
 */
export function isDateWireValue(value: unknown): value is DateWireValue {
  if (!isObjectRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== 2) {
    return false;
  }

  return (
    hasOwnKey(value, '__forgeframe_wire_type__') &&
    hasOwnKey(value, '__forgeframe_wire_value__') &&
    value.__forgeframe_wire_type__ === 'date' &&
    (typeof value.__forgeframe_wire_value__ === 'string' ||
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
 * @internal
 */
export function stringifyWireValue(value: unknown): string {
  return JSON.stringify(value, function wireValueReplacer(key, jsonValue) {
    const holder = this as Record<string, unknown>;
    const originalValue =
      key === ''
        ? value
        : holder[key];

    return originalValue instanceof Date
      ? encodeDateWireValue(originalValue)
      : jsonValue;
  });
}

/**
 * Parses a JSON string and revives any ForgeFrame Date wire wrappers.
 * @internal
 */
export function parseWireValue(json: string): unknown {
  return JSON.parse(json, (_key, value) =>
    isDateWireValue(value) ? decodeDateWireValue(value) : value
  );
}
