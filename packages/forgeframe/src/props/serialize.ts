/**
 * @packageDocumentation
 * Props serialization module for cross-domain transfer.
 *
 * @remarks
 * This module handles serializing and deserializing props for transfer
 * between consumer and host windows across domain boundaries.
 */

import type { PropDefinition, PropsDefinition, SerializedProps } from '@/types';
import { PROP_SERIALIZATION } from '@/constants';
import {
  FunctionBridge,
  serializeFunctions,
  deserializeFunctions,
} from '@/communication/bridge';
import type { Messenger } from '@/communication/messenger';
import { BUILTIN_PROP_DEFINITIONS } from '@/props/definitions';

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
        value = JSON.parse(decodeURIComponent(encodedValue));
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
    return cloneArrayValue(value, seen);
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
    return cloneArrayBufferViewValue(value, seen);
  }

  if (value instanceof URL) {
    const clonedUrl = new URL(value.toString());
    seen.set(value, clonedUrl);
    cloneOwnProperties(value, clonedUrl, seen);
    return clonedUrl;
  }

  if (value instanceof URLSearchParams) {
    const clonedSearchParams = new URLSearchParams(value.toString());
    seen.set(value, clonedSearchParams);
    cloneOwnProperties(value, clonedSearchParams, seen);
    return clonedSearchParams;
  }

  if (value instanceof Error) {
    return cloneErrorValue(value, seen);
  }

  if (isBoxedPrimitiveObject(value)) {
    const clonedBoxed = Object(value.valueOf());
    seen.set(value, clonedBoxed);
    cloneOwnProperties(value, clonedBoxed, seen);
    return clonedBoxed;
  }

  if (
    value instanceof Promise ||
    value instanceof WeakMap ||
    value instanceof WeakSet
  ) {
    return value;
  }

  if (isBrandedObjectInstance(value)) {
    return cloneBrandedObjectValue(value, seen);
  }

  const clonedObject = createPlainObjectCloneTarget(value);
  seen.set(value, clonedObject);
  cloneOwnProperties(value, clonedObject, seen);

  return clonedObject;
}

/**
 * Represents a boxed primitive wrapper object.
 * @internal
 */
interface BoxedPrimitiveObject {
  valueOf(): bigint | boolean | number | string | symbol;
}

type ArrayBufferViewConstructor = new (
  buffer: ArrayBufferLike,
  byteOffset?: number,
  length?: number
) => ArrayBufferView;

type SizedArrayBufferViewConstructor = new (length: number) => ArrayBufferView;

const Float16ArrayConstructor = (
  globalThis as typeof globalThis & {
    Float16Array?: ArrayBufferViewConstructor & SizedArrayBufferViewConstructor;
  }
).Float16Array;

/**
 * Clones an ArrayBuffer view while preserving shared backing buffers.
 * @internal
 */
function cloneArrayBufferViewValue(
  value: ArrayBufferView,
  seen: WeakMap<object, unknown>
): ArrayBufferView {
  const clonedBuffer = clonePropValue(
    value.buffer,
    seen
  ) as ArrayBufferLike;

  let clonedView: ArrayBufferView;
  if (value instanceof DataView) {
    clonedView = new DataView(
      clonedBuffer,
      value.byteOffset,
      value.byteLength
    );
  } else {
    const TypedArrayConstructor = getArrayBufferViewConstructor(value);
    const elementLength =
      'length' in value ? (value as { length: number }).length : undefined;
    clonedView = new TypedArrayConstructor(
      clonedBuffer,
      value.byteOffset,
      elementLength
    );
  }

  seen.set(value, clonedView);
  cloneOwnProperties(value, clonedView, seen);

  return clonedView;
}

/**
 * Returns the built-in constructor for a typed-array view.
 *
 * @remarks
 * Custom typed-array subclasses are downgraded to their built-in brand so we do
 * not depend on subclass-specific constructor signatures when rebuilding views.
 *
 * @internal
 */
function getArrayBufferViewConstructor(
  value: ArrayBufferView
): ArrayBufferViewConstructor {
  switch (Object.prototype.toString.call(value)) {
    case '[object Int8Array]':
      return Int8Array;
    case '[object Uint8Array]':
      return Uint8Array;
    case '[object Uint8ClampedArray]':
      return Uint8ClampedArray;
    case '[object Int16Array]':
      return Int16Array;
    case '[object Uint16Array]':
      return Uint16Array;
    case '[object Int32Array]':
      return Int32Array;
    case '[object Uint32Array]':
      return Uint32Array;
    case '[object Float16Array]':
      return Float16ArrayConstructor ?? Uint8Array;
    case '[object Float32Array]':
      return Float32Array;
    case '[object Float64Array]':
      return Float64Array;
    case '[object BigInt64Array]':
      return BigInt64Array;
    case '[object BigUint64Array]':
      return BigUint64Array;
    default:
      return Uint8Array;
  }
}

/**
 * Clones an array while preserving sparse holes and custom enumerable properties.
 * @internal
 */
function cloneArrayValue(
  value: unknown[],
  seen: WeakMap<object, unknown>
): unknown[] {
  const clonedArray = new Array<unknown>(value.length);
  seen.set(value, clonedArray);
  cloneOwnProperties(
    value,
    clonedArray,
    seen,
    new Set<PropertyKey>(['length'])
  );

  return clonedArray;
}

/**
 * Creates the target object for cloning non-branded object values.
 * @internal
 */
function createPlainObjectCloneTarget(value: object): object {
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null) {
    return Object.create(null) as object;
  }

  if (prototype === Object.prototype) {
    return {};
  }

  // Custom class instances are cloned as plain data objects so we do not
  // fabricate instances that are missing private/internal slots.
  return {};
}

/**
 * Returns true when a value is a boxed primitive wrapper object.
 * @internal
 */
function isBoxedPrimitiveObject(
  value: object
): value is BoxedPrimitiveObject {
  const tag = Object.prototype.toString.call(value);
  return (
    tag === '[object Boolean]' ||
    tag === '[object Number]' ||
    tag === '[object String]' ||
    tag === '[object BigInt]' ||
    tag === '[object Symbol]'
  );
}

/**
 * Returns true when a value exposes a branded object tag rather than the
 * default plain-object tag.
 * @internal
 */
function isBrandedObjectInstance(value: object): boolean {
  return Object.prototype.toString.call(value) !== '[object Object]';
}

/**
 * Clones a branded object instance using structuredClone when possible and
 * otherwise preserves the original reference to avoid corrupting internal-slot
 * state.
 * @internal
 */
function cloneBrandedObjectValue<T extends object>(
  value: T,
  seen: WeakMap<object, unknown>
): T {
  try {
    const clonedValue = structuredClone(value);
    if (!hasMatchingBrand(value, clonedValue)) {
      seen.set(value, value);
      return value;
    }

    seen.set(value, clonedValue);
    cloneOwnProperties(value, clonedValue, seen, undefined, true);
    return clonedValue;
  } catch {
    // Preserve unsupported branded objects by reference rather than fabricating
    // invalid instances with missing internal slots.
    seen.set(value, value);
    return value;
  }
}

/**
 * Returns true when the clone result preserves the source object's brand.
 * @internal
 */
function hasMatchingBrand(source: object, clone: unknown): clone is object {
  return (
    typeof clone === 'object' &&
    clone !== null &&
    Object.prototype.toString.call(source) === Object.prototype.toString.call(clone)
  );
}

/**
 * Clones an Error instance while preserving non-enumerable state like message.
 * @internal
 */
function cloneErrorValue(
  value: Error,
  seen: WeakMap<object, unknown>
): Error {
  let clonedError: Error;
  try {
    clonedError = structuredClone(value);
  } catch {
    clonedError = createErrorCloneTarget(value);
  }

  seen.set(value, clonedError);

  cloneOwnProperties(value, clonedError, seen);

  return clonedError as unknown as Error;
}

/**
 * Creates a safe Error clone target without fabricating custom subclass
 * instances that may depend on private/internal state.
 * @internal
 */
function createErrorCloneTarget(value: Error): Error {
  if (value instanceof AggregateError) {
    return new AggregateError([], value.message);
  }

  if (value instanceof EvalError) {
    return new EvalError(value.message);
  }

  if (value instanceof RangeError) {
    return new RangeError(value.message);
  }

  if (value instanceof ReferenceError) {
    return new ReferenceError(value.message);
  }

  if (value instanceof SyntaxError) {
    return new SyntaxError(value.message);
  }

  if (value instanceof TypeError) {
    return new TypeError(value.message);
  }

  if (value instanceof URIError) {
    return new URIError(value.message);
  }

  return new Error(value.message);
}

/**
 * Clones own property descriptors onto a target object.
 * @internal
 */
function cloneOwnProperties(
  source: object,
  target: object,
  seen: WeakMap<object, unknown>,
  excludedKeys: ReadonlySet<PropertyKey> = new Set<PropertyKey>(),
  skipExistingKeys = false
): void {
  for (const key of Reflect.ownKeys(source)) {
    if (excludedKeys.has(key)) continue;
    if (skipExistingKeys && Object.prototype.hasOwnProperty.call(target, key)) {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor) continue;

    if ('value' in descriptor) {
      descriptor.value = clonePropValue(descriptor.value, seen);
      Object.defineProperty(target, key, descriptor);
      continue;
    }

    if (!descriptor.enumerable) {
      continue;
    }

    const materializedValue = clonePropValue(Reflect.get(source, key), seen);
    Object.defineProperty(target, key, {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      writable: true,
      value: materializedValue,
    });
  }
}
