/**
 * @packageDocumentation
 * Function bridge for cross-domain function calls.
 *
 * @remarks
 * This module enables passing functions as props across domain boundaries
 * by converting them to references that can be called via postMessage.
 */

import { MESSAGE_NAME } from "../constants";
import { generateShortUID } from "../utils/uid";
import {
	decodeDateWireValue,
	encodeDateWireValue,
	isDateWireValue,
} from "../utils/wire-value";
import type { MessageHandler, Messenger } from "./messenger";
import type { FunctionRef } from "./types";

/**
 * Generic function type for cross-domain callable functions.
 * @internal
 */
type CallableFunction = (...args: unknown[]) => unknown | Promise<unknown>;

/** Cached callable together with the remote identity it targets. @internal */
interface RemoteFunctionEntry {
	wrapper: CallableFunction;
	targetWin: Window;
	targetDomain: string;
}

/**
 * Maximum number of function references to keep in each registry.
 * @internal
 */
const MAX_FUNCTIONS = 500;
const UNSAFE_OBJECT_KEYS = new Set(["__proto__"]);

/**
 * Checks if a key is safe to assign on reconstructed objects.
 * @internal
 */
function isSafeObjectKey(key: string): boolean {
	return !UNSAFE_OBJECT_KEYS.has(key);
}

/**
 * Handles serialization and deserialization of functions for cross-domain calls.
 *
 * @remarks
 * When you pass a function as a prop, it gets converted to a reference
 * that can be called across domains via postMessage. The bridge maintains
 * mappings of local and remote functions.
 *
 * @example
 * ```typescript
 * const bridge = new FunctionBridge(messenger);
 *
 * // Serialize a local function
 * const ref = bridge.serialize(() => console.log('Hello'));
 *
 * // Deserialize a remote reference
 * const remoteFn = bridge.deserialize(ref, targetWin, targetDomain);
 * await remoteFn(); // Calls the original function cross-domain
 * ```
 *
 * @public
 */
export class FunctionBridge {
	/** @internal */
	private localFunctions = new Map<string, CallableFunction>();

	/** @internal */
	private localFunctionIds = new WeakMap<CallableFunction, string>();

	/** @internal */
	private remoteFunctions = new Map<string, RemoteFunctionEntry>();

	/**
	 * Tracks function IDs from the current serialization batch.
	 * Used for cleanup of stale references when props are updated.
	 * @internal
	 */
	private currentBatchIds = new Set<string>();

	/**
	 * Creates a new FunctionBridge instance.
	 *
	 * @param messenger - The messenger to use for cross-domain calls
	 */
	constructor(
		private messenger: Messenger,
		private isExpectedSource: (
			source: Parameters<MessageHandler>[1],
		) => boolean = () => true,
	) {
		this.setupCallHandler();
	}

	/**
	 * Serializes a local function to a transferable reference.
	 *
	 * @remarks
	 * A retained function reuses its ID until eviction or batch reconciliation removes
	 * it. Serialization also records that identity in the current batch.
	 *
	 * @param fn - The function to serialize
	 * @param name - Optional name for debugging
	 * @returns A function reference that can be sent across domains
	 */
	serialize(fn: CallableFunction, name?: string): FunctionRef {
		return createFunctionRef(
			this.retainLocalFunction(fn),
			name || fn.name || "anonymous",
		);
	}

	/** Reconciles the retained identity, capacity and current batch as one registry operation. */
	private retainLocalFunction(fn: CallableFunction): string {
		const existingId = this.localFunctionIds.get(fn);
		if (existingId && this.localFunctions.get(existingId) === fn) {
			this.currentBatchIds.add(existingId);
			return existingId;
		}
		this.evictOldestLocal();
		const id = generateShortUID();
		this.localFunctions.set(id, fn);
		this.localFunctionIds.set(fn, id);
		this.currentBatchIds.add(id);
		return id;
	}

	/**
	 * Deserializes a function reference to a callable wrapper.
	 *
	 * @remarks
	 * The returned function, when called, will invoke the original function
	 * in the remote window via postMessage and return the result.
	 * A cached wrapper is reused only when ID, target window and target origin all match.
	 *
	 * @param ref - The function reference to deserialize
	 * @param targetWin - The window containing the original function
	 * @param targetDomain - The origin of the target window
	 * @returns A callable wrapper function
	 */
	deserialize(
		ref: FunctionRef,
		targetWin: Window,
		targetDomain: string,
	): CallableFunction {
		const cacheKey = `${ref.__id__}`;
		const cached = this.findRemoteWrapper(cacheKey, targetWin, targetDomain);
		if (cached) return cached;
		this.evictOldestRemote(cacheKey);
		const wrapper = this.createRemoteWrapper(ref, targetWin, targetDomain);
		this.remoteFunctions.set(cacheKey, { wrapper, targetWin, targetDomain });
		return wrapper;
	}

	/** A remote ID is reusable only for the same browser window and verified origin. */
	private findRemoteWrapper(
		cacheKey: string,
		targetWin: Window,
		targetDomain: string,
	): CallableFunction | undefined {
		const cached = this.remoteFunctions.get(cacheKey);
		return cached &&
			cached.targetWin === targetWin &&
			cached.targetDomain === targetDomain
			? cached.wrapper
			: undefined;
	}

	private evictOldestRemote(cacheKey: string): void {
		if (
			this.remoteFunctions.has(cacheKey) ||
			this.remoteFunctions.size < MAX_FUNCTIONS
		)
			return;
		const oldestKey = this.remoteFunctions.keys().next().value;
		if (oldestKey) this.remoteFunctions.delete(oldestKey);
	}

	/** Keeps local registry capacity policy separate from reference construction. */
	private evictOldestLocal(): void {
		if (this.localFunctions.size < MAX_FUNCTIONS) return;
		const oldestKey = this.localFunctions.keys().next().value;
		if (oldestKey) this.removeLocal(oldestKey);
	}

	private createRemoteWrapper(
		ref: FunctionRef,
		targetWin: Window,
		targetDomain: string,
	): CallableFunction {
		const wrapper = async (...args: unknown[]): Promise<unknown> =>
			this.messenger.send(targetWin, targetDomain, MESSAGE_NAME.CALL, {
				id: ref.__id__,
				args,
			});
		Object.defineProperty(wrapper, "name", {
			value: ref.__name__,
			configurable: true,
		});
		return wrapper;
	}

	/**
	 * Type guard to check if a value is a function reference.
	 *
	 * @param value - The value to check
	 * @returns True if the value is a FunctionRef
	 */
	static isFunctionRef(value: unknown): value is FunctionRef {
		return (
			typeof value === "object" &&
			value !== null &&
			(value as FunctionRef).__type__ === "function" &&
			typeof (value as FunctionRef).__id__ === "string"
		);
	}

	/**
	 * Sets up the handler for incoming function call messages.
	 * @internal
	 */
	private setupCallHandler(): void {
		this.messenger.on<{ id: string; args: unknown[] }>(
			MESSAGE_NAME.CALL,
			async ({ id, args }, source) => {
				if (!this.isExpectedSource(source)) {
					throw new Error("Function call rejected from unexpected window");
				}
				const fn = this.localFunctions.get(id);
				if (!fn) {
					throw new Error(`Function with id "${id}" not found`);
				}
				return fn(...args);
			},
		);
	}

	/**
	 * Removes a local function reference.
	 *
	 * @param id - The function reference ID to remove
	 */
	removeLocal(id: string): void {
		const fn = this.localFunctions.get(id);
		this.localFunctions.delete(id);
		if (fn && this.localFunctionIds.get(fn) === id) {
			this.localFunctionIds.delete(fn);
		}
	}

	/**
	 * Starts a new serialization batch.
	 *
	 * @remarks
	 * Call this before serializing a new set of props. After serialization,
	 * call {@link finishBatch} to clean up functions from previous batches.
	 *
	 * @example
	 * ```typescript
	 * bridge.startBatch();
	 * const serialized = serializeFunctions(props, bridge);
	 * bridge.finishBatch();
	 * ```
	 */
	startBatch(): void {
		this.currentBatchIds.clear();
	}

	/**
	 * Finishes the current batch and removes functions not in this batch.
	 *
	 * @remarks
	 * Pass `true` when serialization or delivery failed to preserve previous
	 * references. This does not roll back newly registered functions or capacity
	 * eviction; it skips stale-reference removal and clears the batch marker set.
	 *
	 * @param keepPrevious - If true, keeps previous batch functions (default: false)
	 */
	finishBatch(keepPrevious = false): void {
		if (keepPrevious) {
			this.currentBatchIds.clear();
			return;
		}

		// Remove functions not in the current batch
		for (const id of this.staleLocalIds()) this.removeLocal(id);
		this.currentBatchIds.clear();
	}

	/** Determines stale references without mutating either registry. */
	private staleLocalIds(): string[] {
		return [...this.localFunctions.keys()].filter(
			(id) => !this.currentBatchIds.has(id),
		);
	}

	/**
	 * Clears all remote function references.
	 *
	 * @remarks
	 * Call this when the remote window is no longer accessible
	 * (e.g., closed or navigated away).
	 */
	clearRemote(): void {
		this.remoteFunctions.clear();
	}

	/**
	 * Returns the current number of registered local functions.
	 * Useful for debugging and monitoring.
	 */
	get localFunctionCount(): number {
		return this.localFunctions.size;
	}

	/**
	 * Returns the current number of cached remote functions.
	 * Useful for debugging and monitoring.
	 */
	get remoteFunctionCount(): number {
		return this.remoteFunctions.size;
	}

	/**
	 * Cleans up all function references.
	 */
	destroy(): void {
		this.localFunctions.clear();
		this.localFunctionIds = new WeakMap();
		this.remoteFunctions.clear();
		this.currentBatchIds.clear();
	}
}

/**
 * Recursively serializes all functions in an object.
 *
 * @param obj - The object to process
 * @param bridge - The function bridge to use for serialization
 * @param seen - Internal set for cycle detection (do not pass manually)
 * @returns A new object with all functions replaced by references
 *
 * @public
 */
export function serializeFunctions(
	obj: unknown,
	bridge: FunctionBridge,
	stack: WeakSet<object> = new WeakSet(),
): unknown {
	if (typeof obj === "function") {
		return bridge.serialize(obj as CallableFunction);
	}

	if (obj instanceof Date) {
		return encodeDateWireValue(obj);
	}

	if (Array.isArray(obj)) {
		if (stack.has(obj)) {
			throw new Error(
				"Circular reference detected in props - arrays cannot contain circular references",
			);
		}
		stack.add(obj);
		try {
			return obj.map((item) => serializeFunctions(item, bridge, stack));
		} finally {
			stack.delete(obj);
		}
	}

	if (typeof obj === "object" && obj !== null) {
		if (stack.has(obj)) {
			throw new Error(
				"Circular reference detected in props - objects cannot contain circular references",
			);
		}
		stack.add(obj);
		try {
			const result: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(obj)) {
				if (!isSafeObjectKey(key)) continue;
				result[key] = serializeFunctions(value, bridge, stack);
			}
			return result;
		} finally {
			stack.delete(obj);
		}
	}

	return obj;
}

/**
 * Recursively deserializes all function references in an object.
 *
 * @param obj - The object to process
 * @param bridge - The function bridge to use for deserialization
 * @param targetWin - The window containing the original functions
 * @param targetDomain - The origin of the target window
 * @param seen - Internal set for cycle detection (do not pass manually)
 * @returns A new object with all references replaced by callable wrappers
 *
 * @public
 */
export function deserializeFunctions(
	obj: unknown,
	bridge: FunctionBridge,
	targetWin: Window,
	targetDomain: string,
	stack: WeakSet<object> = new WeakSet(),
): unknown {
	if (FunctionBridge.isFunctionRef(obj)) {
		return bridge.deserialize(obj, targetWin, targetDomain);
	}

	if (isDateWireValue(obj)) {
		return decodeDateWireValue(obj);
	}

	if (Array.isArray(obj)) {
		if (stack.has(obj)) {
			throw new Error("Circular reference detected in serialized props");
		}
		stack.add(obj);
		try {
			return obj.map((item) =>
				deserializeFunctions(item, bridge, targetWin, targetDomain, stack),
			);
		} finally {
			stack.delete(obj);
		}
	}

	if (typeof obj === "object" && obj !== null) {
		if (stack.has(obj)) {
			throw new Error("Circular reference detected in serialized props");
		}
		stack.add(obj);
		try {
			const result: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(obj)) {
				if (!isSafeObjectKey(key)) continue;
				result[key] = deserializeFunctions(
					value,
					bridge,
					targetWin,
					targetDomain,
					stack,
				);
			}
			return result;
		} finally {
			stack.delete(obj);
		}
	}

	return obj;
}

/** Frames one retained local identity without accessing the bridge registry. */
function createFunctionRef(id: string, name: string): FunctionRef {
	return { __type__: "function", __id__: id, __name__: name };
}
