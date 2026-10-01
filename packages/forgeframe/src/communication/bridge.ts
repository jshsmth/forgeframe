/**
 * @packageDocumentation
 * Function bridge for cross-domain function calls.
 *
 * @remarks
 * This module enables passing functions as props across domain boundaries
 * by converting them to references that can be called via postMessage.
 */

import { MESSAGE_NAME } from "../constants";
import { isDate } from "../utils/realm-values";
import { generateShortUID } from "../utils/uid";
import {
	assertDefinedArrayEntry,
	decodeDateWireValue,
	encodeDateWireValue,
	escapeWireRecord,
	isDateWireValue,
	isRecordWireValue,
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
/** Previous and possibly delivered snapshots share this bounded recovery pool. */
const MAX_RETAINED_FUNCTIONS = MAX_FUNCTIONS * 2;
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
	/** Registrations created by a batch, removable before any delivery attempt. */
	private newBatchIds = new Set<string>();
	private batchMode: "replace" | "append" | null = null;

	/**
	 * Creates a new FunctionBridge instance.
	 *
	 * @param messenger - The messenger to use for cross-domain calls
	 * @param isExpectedSource - Admits browser-verified callers for this bridge.
	 * @param callMessageName - Internal call channel, separating peer relays from prop/export batches.
	 */
	constructor(
		private messenger: Messenger,
		private isExpectedSource: (
			source: Parameters<MessageHandler>[1],
		) => boolean = () => true,
		private callMessageName: string = MESSAGE_NAME.CALL,
	) {
		this.setupCallHandler();
	}

	/**
	 * Serializes a local function to a transferable reference.
	 *
	 * @remarks
	 * A retained function reuses its ID until batch reconciliation removes
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
			this.assertLocalCapacity(existingId);
			this.currentBatchIds.add(existingId);
			return existingId;
		}
		this.assertLocalCapacity();
		// A new host session may already have acknowledged queued props using this ID.
		const id = existingId ?? generateShortUID();
		this.localFunctions.set(id, fn);
		this.localFunctionIds.set(fn, id);
		this.currentBatchIds.add(id);
		if (this.batchMode) this.newBatchIds.add(id);
		return id;
	}

	/** Rejects additions before mutating either registry; retained identities never get evicted. */
	private assertLocalCapacity(existingId?: string): void {
		if (
			!this.currentBatchIds.has(existingId ?? "") &&
			this.currentBatchIds.size >= MAX_FUNCTIONS
		) {
			throw new Error(
				"Function snapshot exceeds the 500 distinct callback limit",
			);
		}
		if (existingId) return;
		const limit =
			this.batchMode === "replace" ? MAX_RETAINED_FUNCTIONS : MAX_FUNCTIONS;
		if (this.localFunctions.size >= limit) {
			throw new Error(
				limit === MAX_RETAINED_FUNCTIONS
					? "Function recovery pool is full (1000 callbacks); retry retained callbacks or reconnect"
					: "Function registry exceeds the 500 distinct callback limit",
			);
		}
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

	private createRemoteWrapper(
		ref: FunctionRef,
		targetWin: Window,
		targetDomain: string,
	): CallableFunction {
		const wrapper = async (...args: unknown[]): Promise<unknown> =>
			this.messenger.send(targetWin, targetDomain, this.callMessageName, {
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
			Reflect.ownKeys(value).length === 3 &&
			Object.hasOwn(value, "__type__") &&
			Object.hasOwn(value, "__id__") &&
			Object.hasOwn(value, "__name__") &&
			(value as FunctionRef).__type__ === "function" &&
			typeof (value as FunctionRef).__id__ === "string" &&
			typeof (value as FunctionRef).__name__ === "string"
		);
	}

	/**
	 * Sets up the handler for incoming function call messages.
	 * @internal
	 */
	private setupCallHandler(): void {
		this.messenger.on<{ id: string; args: unknown[] }>(
			this.callMessageName,
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
		this.currentBatchIds.delete(id);
		this.newBatchIds.delete(id);
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
	startBatch(mode: "replace" | "append" = "replace"): void {
		if (this.batchMode)
			throw new Error("Function serialization batch already active");
		this.currentBatchIds.clear();
		this.newBatchIds.clear();
		this.batchMode = mode;
	}

	/**
	 * Finishes the current batch and removes functions not in this batch.
	 *
	 * @remarks
	 * Pass `true` after a delivery failure or successful append batch to retain both
	 * previous and newly registered references. Serialization failures use {@link abortBatch}.
	 *
	 * @param keepPrevious - If true, keeps previous batch functions (default: false)
	 */
	finishBatch(keepPrevious = false): void {
		if (!keepPrevious) {
			for (const id of this.staleLocalIds()) this.removeLocal(id);
		}
		this.clearBatch();
	}

	/** Rolls back only new registrations when serialization failed before delivery. */
	abortBatch(): void {
		for (const id of this.newBatchIds) this.removeLocal(id);
		this.clearBatch();
	}

	/** Settles the serialization transaction without changing retained functions. */
	private clearBatch(): void {
		this.currentBatchIds.clear();
		this.newBatchIds.clear();
		this.batchMode = null;
	}

	/**
	 * Releases local registrations. Bootstrap preserves weak IDs for callbacks already
	 * acknowledged by the new document; teardown also discards those identities.
	 * @param preserveIds - Keep weak callback identities without retaining callable functions.
	 */
	clearLocal(preserveIds = false): void {
		this.localFunctions.clear();
		if (!preserveIds) this.localFunctionIds = new WeakMap();
		this.clearBatch();
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
		this.clearLocal();
		this.remoteFunctions.clear();
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

	if (isDate(obj)) {
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
			for (let index = 0; index < obj.length; index++) {
				assertDefinedArrayEntry(obj[index], [String(index)]);
			}
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
			return escapeWireRecord(result);
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
			const record = isRecordWireValue(obj)
				? obj.__forgeframe_wire_value__
				: obj;
			for (const [key, value] of Object.entries(record)) {
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
