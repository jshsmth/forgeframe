/**
 * @packageDocumentation
 * Props serialization module for cross-domain transfer.
 *
 * @remarks
 * This module handles serializing and deserializing props for transfer
 * between consumer and host windows across domain boundaries.
 */

import type { PropDefinition, PropsDefinition, SerializedProps } from '../types';
import { PROP_SERIALIZATION } from '../constants';
import {
  FunctionBridge,
  serializeFunctions,
  deserializeFunctions,
} from '../communication/bridge';
import type { Messenger } from '../communication/messenger';
import { BUILTIN_PROP_DEFINITIONS } from './definitions';

const UNSAFE_OBJECT_KEYS = new Set(['__proto__']);
const DOTIFY_FRAMED_PATH_PREFIX = '__forgeframe.dotify_path__:';
const DOTIFY_EMPTY_OBJECT_PAYLOAD = '__forgeframe.dotify_empty_object__';
const DOTIFY_EMPTY_OBJECT_MARKER_KEY = '__forgeframe.dotify_empty_object_marker__';

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
function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Encodes a DOTIFY path using the framed path format.
 * @internal
 */
function encodeDotNotationPath(path: string[]): string {
  return `${DOTIFY_FRAMED_PATH_PREFIX}${encodeURIComponent(
    JSON.stringify(path)
  )}`;
}

/**
 * Encodes a DOTIFY value segment.
 * @internal
 */
function encodeDotNotationValue(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value));
}

/**
 * Creates a DOTIFY key/value pair for a path.
 * @internal
 */
function createDotNotationPair(path: string[], value: unknown): string {
  return `${encodeDotNotationPath(path)}=${encodeDotNotationValue(value)}`;
}

/**
 * Returns the internal marker used to preserve empty DOTIFY object branches.
 * @internal
 */
function createDotifyEmptyObjectMarker(): Record<string, true> {
  return {
    [DOTIFY_EMPTY_OBJECT_MARKER_KEY]: true,
  };
}

/**
 * Returns true when a DOTIFY value represents an empty object branch.
 * @internal
 */
function isDotifyEmptyObjectMarker(
  value: unknown
): value is Record<string, true> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === 1 &&
    (value as Record<string, unknown>)[DOTIFY_EMPTY_OBJECT_MARKER_KEY] === true
  );
}

/**
 * Defines an enumerable data property without triggering prototype setters.
 * @internal
 */
function defineDataProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown
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
  path: string[] = []
): string {
  const entries = Object.entries(obj);
  if (entries.length === 0 && isPlainObject(obj)) {
    if (path.length === 0) {
      return DOTIFY_EMPTY_OBJECT_PAYLOAD;
    }

    return createDotNotationPair(path, createDotifyEmptyObjectMarker());
  }

  const parts: string[] = [];

  for (const [key, value] of entries) {
    const nextPath = [...path, key];

    if (isPlainObject(value)) {
      parts.push(toDotNotation(value, nextPath));
    } else {
      parts.push(createDotNotationPair(nextPath, value));
    }
  }

  return parts.filter(Boolean).join('&');
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

  if (!str) return result;
  if (str === DOTIFY_EMPTY_OBJECT_PAYLOAD) return result;

  const pairs = str.split('&');

  for (const pair of pairs) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) continue;

    const path = pair.slice(0, separatorIndex);
    const encodedValue = pair.slice(separatorIndex + 1);
    if (!path || encodedValue === undefined) continue;

    let value: unknown;
    try {
      value = JSON.parse(decodeURIComponent(encodedValue));
    } catch {
      value = decodeURIComponent(encodedValue);
    }

    const keys = decodeDotNotationPath(path);
    if (keys.some((key) => !isSafeObjectKey(key))) continue;

    let current = result;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      const existing = current[key];
      if (
        !Object.prototype.hasOwnProperty.call(current, key) ||
        typeof existing !== 'object' ||
        existing === null ||
        Array.isArray(existing)
      ) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    const leafKey = keys[keys.length - 1];
    defineDataProperty(
      current,
      leafKey,
      isDotifyEmptyObjectMarker(value) ? {} : value
    );
  }

  return result;
}

/**
 * Decodes a DOTIFY path using the explicit framed format.
 * @internal
 */
function decodeDotNotationPath(path: string): string[] {
  if (!path.startsWith(DOTIFY_FRAMED_PATH_PREFIX)) {
    throw new Error('Invalid DOTIFY path framing');
  }

  const decodedPath = decodeURIComponent(
    path.slice(DOTIFY_FRAMED_PATH_PREFIX.length)
  );
  const parsed = JSON.parse(decodedPath);
  if (
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every((segment) => typeof segment === 'string')
  ) {
    return parsed;
  }

  throw new Error('Invalid DOTIFY path framing');
}

/**
 * Checks if a value is dotify encoded.
 * @internal
 */
function isDotifyEncoded(
  value: unknown
): value is { __type__: 'dotify'; __value__: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).__type__ === 'dotify' &&
    typeof (value as Record<string, unknown>).__value__ === 'string'
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
export function serializeProps<P extends Record<string, unknown>>(
  props: P,
  definitions: PropsDefinition<P>,
  bridge: FunctionBridge
): SerializedProps {
  const allDefs = {
    ...BUILTIN_PROP_DEFINITIONS,
    ...definitions,
  } as PropsDefinition<P>;

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
  bridge: FunctionBridge
): unknown {
  if (typeof value === 'function') {
    return bridge.serialize(value as (...args: unknown[]) => unknown);
  }

  const serialization = definition?.serialization ?? PROP_SERIALIZATION.JSON;

  if (serialization === PROP_SERIALIZATION.BASE64) {
    if (typeof value === 'object') {
      const json = JSON.stringify(value);
      return {
        __type__: 'base64',
        __value__: btoa(encodeURIComponent(json)),
      };
    }
  }

  if (serialization === PROP_SERIALIZATION.DOTIFY) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return {
        __type__: 'dotify',
        __value__: toDotNotation(value as Record<string, unknown>),
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
export function deserializeProps<P extends Record<string, unknown>>(
  serialized: SerializedProps,
  definitions: PropsDefinition<P>,
  messenger: Messenger,
  bridge: FunctionBridge,
  consumerWin: Window,
  consumerDomain: string
): P {
  const allDefs = {
    ...BUILTIN_PROP_DEFINITIONS,
    ...definitions,
  } as PropsDefinition<P>;

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
      consumerDomain
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
  consumerDomain: string
): unknown {
  if (isBase64Encoded(value)) {
    try {
      const json = decodeURIComponent(atob(value.__value__));
      return JSON.parse(json);
    } catch {
      return value;
    }
  }

  if (isDotifyEncoded(value)) {
    try {
      return fromDotNotation(value.__value__);
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
  value: unknown
): value is { __type__: 'base64'; __value__: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).__type__ === 'base64' &&
    typeof (value as Record<string, unknown>).__value__ === 'string'
  );
}

/**
 * Creates a deep clone of props.
 *
 * @remarks
 * Functions are preserved by reference at any depth, objects and arrays are
 * recursively cloned, and primitives are copied directly.
 *
 * @typeParam P - The props type
 * @param props - Props to clone
 * @returns Cloned props
 *
 * @public
 */
export function cloneProps<P extends Record<string, unknown>>(
  props: P
): P {
  const result = {} as P;
  const seen = new WeakMap<object, unknown>();
  seen.set(props, result);

  for (const [key, value] of Object.entries(props)) {
    if (!isSafeObjectKey(key)) continue;

    defineDataProperty(
      result as Record<string, unknown>,
      key,
      clonePropValue(value, seen)
    );
  }

  return result;
}

/**
 * Recursively clones a prop value while preserving function references.
 * @internal
 */
function clonePropValue(
  value: unknown,
  seen: WeakMap<object, unknown>
): unknown {
  if (typeof value === 'function' || value === null || typeof value !== 'object') {
    return value;
  }

  const cached = seen.get(value);
  if (cached !== undefined) {
    return cached;
  }

  if (Array.isArray(value)) {
    const clonedArray: unknown[] = [];
    seen.set(value, clonedArray);

    for (const item of value) {
      clonedArray.push(clonePropValue(item, seen));
    }

    return clonedArray;
  }

  if (value instanceof Date) {
    const clonedDate = new Date(value.getTime());
    seen.set(value, clonedDate);
    return clonedDate;
  }

  if (value instanceof RegExp) {
    const clonedRegExp = new RegExp(value.source, value.flags);
    seen.set(value, clonedRegExp);
    return clonedRegExp;
  }

  if (value instanceof Map) {
    const clonedMap = new Map<unknown, unknown>();
    seen.set(value, clonedMap);

    for (const [entryKey, entryValue] of value.entries()) {
      clonedMap.set(
        clonePropValue(entryKey, seen),
        clonePropValue(entryValue, seen)
      );
    }

    return clonedMap;
  }

  if (value instanceof Set) {
    const clonedSet = new Set<unknown>();
    seen.set(value, clonedSet);

    for (const item of value.values()) {
      clonedSet.add(clonePropValue(item, seen));
    }

    return clonedSet;
  }

  if (value instanceof ArrayBuffer) {
    const clonedBuffer = value.slice(0);
    seen.set(value, clonedBuffer);
    return clonedBuffer;
  }

  if (ArrayBuffer.isView(value)) {
    const clonedView = structuredClone(value);
    seen.set(value, clonedView);
    return clonedView;
  }

  const clonedObject = Object.create(
    Object.getPrototypeOf(value)
  ) as Record<string, unknown>;
  seen.set(value, clonedObject);

  for (const [key, nestedValue] of Object.entries(value)) {
    defineDataProperty(clonedObject, key, clonePropValue(nestedValue, seen));
  }

  return clonedObject;
}
