/**
 * @packageDocumentation
 * Props serialization module for cross-domain transfer.
 *
 * @remarks
 * This module handles serializing and deserializing props for transfer
 * between consumer and host windows across domain boundaries.
 */

import type { SerializedProps } from './types';
import type { PropDefinition, PropsDefinition } from '../types/props';
import { PROP_SERIALIZATION } from '../constants';
import {
  FunctionBridge,
  serializeFunctions,
  deserializeFunctions,
} from '../communication/bridge';
import type { Messenger } from '../communication/messenger';
import { BUILTIN_PROP_DEFINITIONS } from './definitions';
import {
  decodeDateWireValue,
  encodeDateWireValue,
  isDateWireValue,
  parseWireValue,
  stringifyWireValue,
} from '../utils/wire-value';

const UNSAFE_OBJECT_KEYS = new Set(['__proto__']);
const DOTIFY_FRAMED_PATH_PREFIX = '__forgeframe.dotify_path__:';
const DOTIFY_EMPTY_OBJECT_PATH_PREFIX = '__forgeframe.dotify_empty_object_path__:';
const DOTIFY_EMPTY_OBJECT_PAYLOAD = '__forgeframe.dotify_empty_object__';

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
function encodeDotNotationPath(
  path: string[],
  prefix = DOTIFY_FRAMED_PATH_PREFIX
): string {
  return `${prefix}${encodeURIComponent(JSON.stringify(path))}`;
}

/**
 * Encodes a DOTIFY value segment.
 * @internal
 */
function encodeDotNotationValue(value: unknown): string {
  return encodeURIComponent(stringifyWireValue(value));
}

/**
 * Creates a DOTIFY key/value pair for a path.
 * @internal
 */
function createDotNotationPair(path: string[], value: unknown): string {
  return `${encodeDotNotationPath(path)}=${encodeDotNotationValue(value)}`;
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

    return createDotNotationEmptyObjectPair(path);
  }

  const parts: string[] = [];

  for (const [key, value] of entries) {
    if (value === undefined) continue;

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

    const isEmptyObjectPath = path.startsWith(DOTIFY_EMPTY_OBJECT_PATH_PREFIX);
    let value: unknown;
    if (isEmptyObjectPath) {
      if (encodedValue !== '1') {
        throw new Error('Invalid empty-object DOTIFY entry');
      }
      value = {};
    } else {
      try {
        value = parseWireValue(decodeURIComponent(encodedValue));
      } catch {
        value = decodeURIComponent(encodedValue);
      }
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
    defineDataProperty(current, leafKey, value);
  }

  return result;
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
    throw new Error('Invalid DOTIFY path framing');
  }

  const decodedPath = decodeURIComponent(path.slice(prefix.length));
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

  if (value instanceof Date) {
    return encodeDateWireValue(value);
  }

  const serialization = definition?.serialization ?? PROP_SERIALIZATION.JSON;

  if (serialization === PROP_SERIALIZATION.BASE64) {
    if (typeof value === 'object') {
      const json = stringifyWireValue(value);
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
export function deserializeProps<
  P extends Record<string, unknown>,
  I = P,
>(
  serialized: SerializedProps,
  definitions: PropsDefinition<P, I>,
  messenger: Messenger,
  bridge: FunctionBridge,
  consumerWin: Window,
  consumerDomain: string
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
  if (isDateWireValue(value)) {
    return decodeDateWireValue(value);
  }

  if (isBase64Encoded(value)) {
    try {
      const json = decodeURIComponent(atob(value.__value__));
      return parseWireValue(json);
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
