/**
 * Internal helpers for preserving non-JSON runtime values on ForgeFrame's wire formats.
 */

interface DateWireValue {
  __type__: 'date';
  __value__: string | null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Encodes a Date as a JSON-safe wrapper for cross-window transport.
 * @internal
 */
export function encodeDateWireValue(value: Date): DateWireValue {
  return {
    __type__: 'date',
    __value__: value.toJSON(),
  };
}

/**
 * Returns true when a value is a ForgeFrame Date wire wrapper.
 * @internal
 */
export function isDateWireValue(value: unknown): value is DateWireValue {
  return (
    isObjectRecord(value) &&
    value.__type__ === 'date' &&
    ('__value__' in value) &&
    (typeof value.__value__ === 'string' || value.__value__ === null)
  );
}

/**
 * Decodes a Date wire wrapper back into a Date instance.
 * @internal
 */
export function decodeDateWireValue(value: DateWireValue): Date {
  return value.__value__ === null ? new Date(Number.NaN) : new Date(value.__value__);
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
