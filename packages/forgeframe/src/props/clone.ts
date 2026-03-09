/**
 * @packageDocumentation
 * Props cloning helpers.
 *
 * @remarks
 * These utilities create local prop snapshots without routing through the
 * cross-window serializer pipeline.
 */

const UNSAFE_OBJECT_KEYS = new Set(['__proto__']);

/**
 * Returns true when a key can be safely assigned on cloned objects.
 * @internal
 */
function isSafeObjectKey(key: string): boolean {
  return !UNSAFE_OBJECT_KEYS.has(key);
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

    if (
      !descriptor.enumerable ||
      (typeof key === 'string' && !isSafeObjectKey(key))
    ) {
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
