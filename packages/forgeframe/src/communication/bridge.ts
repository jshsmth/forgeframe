/**
 * @packageDocumentation
 * Function bridge for cross-domain function calls.
 *
 * @remarks
 * This module enables passing functions as props across window boundaries
 * by converting them to references that can be called via postMessage.
 */

import { MESSAGE_NAME } from "../constants";
import { ForgeFrameError } from "../errors";
import { isDate } from "../utils/realm-values";
import { generateShortUID } from "../utils/uid";
import {
	assertDefinedArrayEntry,
	decodeDateWireValue,
	encodeDateWireValue,
	escapeWireRecord,
	isDateWireValue,
	isRawJsonValue,
	isRecordWireValue,
	toJsonValue,
} from "../utils/wire-value";
import type { MessageHandler, Messenger } from "./messenger";
import type { FunctionRef } from "./types";

/**
 * Generic function type for cross-domain callable functions.
 * @internal
 */
type CallableFunction = (...args: unknown[]) => unknown | Promise<unknown>;

/**
 * Delay before, and timeout of, each check that a window with pending calls
 * still answers. A document that went away without teardown never answers.
 * @internal
 */
const CALL_LIVENESS_MS = 10_000;

const UNRESPONSIVE_WINDOW_ERROR =
	"The other window stopped responding before the call completed";

/** Pending calls to one window and its next liveness check. @internal */
interface CallWatch {
	calls: number;
	timer: ReturnType<typeof setTimeout> | undefined;
}

/** Cached callable together with the remote identity it targets. @internal */
interface RemoteFunctionEntry {
	wrapper: CallableFunction;
	targetWin: Window;
	targetOrigin: string;
}

/**
 * Maximum number of function references to keep in each registry.
 * @internal
 */
const MAX_FUNCTIONS = 500;

/**
 * Wrappers this module created for functions in other windows. A relayed
 * wrapper's own failure (such as `CLOSED`) is ForgeFrame's, so it keeps its code.
 * @internal
 */
const remoteWrappers = new WeakSet<CallableFunction>();
/** Previous and possibly delivered snapshots share this bounded recovery pool. */
const MAX_RETAINED_FUNCTIONS = MAX_FUNCTIONS * 2;
const UNSAFE_OBJECT_KEYS = new Set(["__proto__"]);

/**
 * Checks if a key is safe to assign on reconstructed objects.
 * @internal
 */
export function isSafeObjectKey(key: string): boolean {
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
 * const bridge = new FunctionBridge(
 *   messenger,
 *   (source) => source.window === hostWindow && source.domain === hostOrigin,
 * );
 *
 * // Serialize a local function
 * const ref = bridge.serialize(() => console.log('Hello'));
 *
 * // Deserialize a remote reference
 * const remoteFn = bridge.deserialize(ref, targetWin, targetOrigin);
 * await remoteFn(); // Calls the original function cross-domain
 * ```
 *
 * @internal
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
	/** Rejection messages for windows whose host session ended. */
	private endedSessions = new WeakMap<Window, string>();
	/** Windows with pending calls, checked periodically for a listener. */
	private callWatches = new Map<Window, CallWatch>();

	/**
	 * Creates a new FunctionBridge instance.
	 *
	 * @param messenger - The messenger to use for cross-domain calls
	 * @param isExpectedSource - Admits browser-verified callers for this bridge;
	 * there is no permissive default.
	 * @param callMessageName - Internal call channel, separating peer relays from prop/export batches.
	 */
	constructor(
		private messenger: Messenger,
		private isExpectedSource: (
			source: Parameters<MessageHandler>[1],
		) => boolean,
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
	 * @returns A function reference that can be sent across domains
	 */
	serialize(fn: CallableFunction): FunctionRef {
		return createFunctionRef(
			this.retainLocalFunction(fn),
			fn.name || "anonymous",
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
			throw new ForgeFrameError(
				"CAPACITY",
				"Function snapshot exceeds the 500 distinct callback limit",
			);
		}
		if (existingId) return;
		const limit =
			this.batchMode === "replace" ? MAX_RETAINED_FUNCTIONS : MAX_FUNCTIONS;
		if (this.localFunctions.size >= limit) {
			throw new ForgeFrameError(
				"CAPACITY",
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
	 * @param targetOrigin - The origin of the target window
	 * @returns A callable wrapper function
	 */
	deserialize(
		ref: FunctionRef,
		targetWin: Window,
		targetOrigin: string,
	): CallableFunction {
		const cacheKey = `${ref.__id__}`;
		const cached = this.findRemoteWrapper(cacheKey, targetWin, targetOrigin);
		if (cached) return cached;
		this.evictOldestRemote(cacheKey);
		const wrapper = this.createRemoteWrapper(ref, targetWin, targetOrigin);
		this.remoteFunctions.set(cacheKey, { wrapper, targetWin, targetOrigin });
		return wrapper;
	}

	/** A remote ID is reusable only for the same browser window and verified origin. */
	private findRemoteWrapper(
		cacheKey: string,
		targetWin: Window,
		targetOrigin: string,
	): CallableFunction | undefined {
		const cached = this.remoteFunctions.get(cacheKey);
		return cached &&
			cached.targetWin === targetWin &&
			cached.targetOrigin === targetOrigin
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

	/**
	 * Remote calls have no timeout: the callback may still be running in the
	 * other window, so they settle with its result, reject on teardown, or
	 * reject when the other window stops answering liveness checks.
	 */
	private createRemoteWrapper(
		ref: FunctionRef,
		targetWin: Window,
		targetOrigin: string,
	): CallableFunction {
		const wrapper = async (...args: unknown[]): Promise<unknown> => {
			const endedMessage = this.endedSessions.get(targetWin);
			if (endedMessage !== undefined)
				throw new ForgeFrameError("CLOSED", endedMessage);
			const unwatch = this.watchRemoteCall(targetWin, targetOrigin);
			try {
				return await this.messenger.send(
					targetWin,
					targetOrigin,
					this.callMessageName,
					{ id: ref.__id__, args },
					null,
				);
			} finally {
				unwatch();
			}
		};
		Object.defineProperty(wrapper, "name", {
			value: ref.__name__,
			configurable: true,
		});
		remoteWrappers.add(wrapper);
		return wrapper;
	}

	/**
	 * Counts a pending call to a window and checks the window while any are
	 * pending. The returned function releases the call.
	 */
	private watchRemoteCall(targetWin: Window, targetOrigin: string): () => void {
		let watch = this.callWatches.get(targetWin);
		if (!watch) {
			watch = { calls: 0, timer: undefined };
			this.callWatches.set(targetWin, watch);
			this.scheduleLivenessCheck(targetWin, targetOrigin, watch);
		}
		const active = watch;
		active.calls++;
		return () => {
			if (--active.calls > 0) return;
			clearTimeout(active.timer);
			if (this.callWatches.get(targetWin) === active)
				this.callWatches.delete(targetWin);
		};
	}

	/** Rejects pending calls to a window that no longer answers a liveness check. */
	private scheduleLivenessCheck(
		targetWin: Window,
		targetOrigin: string,
		watch: CallWatch,
	): void {
		watch.timer = setTimeout(() => {
			this.messenger
				.send(
					targetWin,
					targetOrigin,
					this.livenessMessageName,
					undefined,
					CALL_LIVENESS_MS,
				)
				.then(
					() => {
						if (this.callWatches.get(targetWin) === watch)
							this.scheduleLivenessCheck(targetWin, targetOrigin, watch);
					},
					() => {
						// Calls that started after this watch ended have checks of their own.
						if (this.callWatches.get(targetWin) === watch)
							this.rejectRemoteCalls(
								targetWin,
								new ForgeFrameError("CLOSED", UNRESPONSIVE_WINDOW_ERROR),
							);
					},
				);
		}, CALL_LIVENESS_MS);
	}

	/** Liveness checks use a channel of their own, answered by the same source guard. */
	private get livenessMessageName(): string {
		return `${this.callMessageName}_liveness`;
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
					throw new ForgeFrameError(
						"ORIGIN_REJECTED",
						"Function call rejected from unexpected window",
					);
				}
				const fn = this.localFunctions.get(id);
				if (!fn) {
					throw new ForgeFrameError(
						"CLOSED",
						`Function with id "${id}" not found`,
					);
				}
				try {
					return await fn(...args);
				} catch (error) {
					// An application callback's failure is its own, so it never
					// carries a ForgeFrame code to the caller. A relayed remote
					// wrapper's failure is ForgeFrame's and keeps its code.
					throw error instanceof ForgeFrameError && !remoteWrappers.has(fn)
						? new Error(error.message)
						: error;
				}
			},
		);
		this.messenger.on(this.livenessMessageName, (_data, source) => {
			if (!this.isExpectedSource(source)) {
				throw new ForgeFrameError(
					"ORIGIN_REJECTED",
					"Liveness check rejected from unexpected window",
				);
			}
			return true;
		});
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
			throw new ForgeFrameError(
				"VALIDATION",
				"Function serialization batch already active",
			);
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
	 * Rejects this bridge's in-flight calls to a window whose document was
	 * replaced. Remote calls have no timeout, so they would otherwise never settle.
	 *
	 * @param targetWin - The window the calls were sent to
	 * @param error - The rejection reason
	 */
	rejectRemoteCalls(targetWin: Window, error: Error): void {
		this.messenger.rejectPending(this.callMessageName, targetWin, error);
	}

	/**
	 * Rejects this bridge's calls to a window whose session ended, including
	 * calls it has not dispatched yet, and later calls until
	 * {@link FunctionBridge.resumeRemoteSession}.
	 *
	 * @param targetWin - The window whose session ended
	 * @param message - The rejection message
	 */
	endRemoteSession(targetWin: Window, message: string): void {
		this.endedSessions.set(targetWin, message);
		this.rejectRemoteCalls(targetWin, new ForgeFrameError("CLOSED", message));
	}

	/**
	 * Accepts calls to a window again once it starts a new session.
	 *
	 * @param targetWin - The window that started a new session
	 */
	resumeRemoteSession(targetWin: Window): void {
		this.endedSessions.delete(targetWin);
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
	 * Cleans up all function references.
	 */
	destroy(): void {
		this.clearLocal();
		this.remoteFunctions.clear();
		for (const watch of this.callWatches.values()) clearTimeout(watch.timer);
		this.callWatches.clear();
	}
}

/**
 * Recursively serializes all functions in an object.
 *
 * @remarks
 * Objects other than arrays and dates convert through `toJSON(key)` and
 * primitive-wrapper unboxing once, as native JSON does. Arrays encode their
 * indexed entries without calling caller-controlled methods. Native raw JSON
 * stays as is, so the message's JSON encoding writes its text.
 *
 * @param obj - The object to process
 * @param bridge - The function bridge to use for serialization
 * @param stack - Internal set for cycle detection (do not pass manually)
 * @param key - Property name passed to `toJSON()`; the root uses `""`
 * @returns A new object with all functions replaced by references
 *
 * @internal
 */
export function serializeFunctions(
	obj: unknown,
	bridge: FunctionBridge,
	stack: WeakSet<object> = new WeakSet(),
	key = "",
): unknown {
	// Arrays keep their captured indexed entries and dates keep their framing;
	// other objects convert like JSON before encoding.
	if (
		typeof obj !== "object" ||
		obj === null ||
		Array.isArray(obj) ||
		isDate(obj)
	) {
		return serializeConvertedValue(obj, bridge, stack);
	}
	const converted = toJsonValue(obj, key);
	if (converted === obj) return serializeRecord(obj, bridge, stack);
	// Keep the source on the stack, so a toJSON() result that contains it is a cycle.
	enterStack(obj, stack, CIRCULAR_OBJECT_ERROR);
	try {
		return serializeConvertedValue(converted, bridge, stack);
	} finally {
		stack.delete(obj);
	}
}

const CIRCULAR_ARRAY_ERROR =
	"Circular reference detected in props - arrays cannot contain circular references";
const CIRCULAR_OBJECT_ERROR =
	"Circular reference detected in props - objects cannot contain circular references";

/** Adds a container to the traversal stack, rejecting one that is already on it. */
function enterStack(
	value: object,
	stack: WeakSet<object>,
	error: string,
): void {
	if (stack.has(value)) throw new ForgeFrameError("VALIDATION", error);
	stack.add(value);
}

/**
 * Serializes a value that has already passed native JSON conversion.
 * Nested values still convert through {@link serializeFunctions}.
 */
function serializeConvertedValue(
	value: unknown,
	bridge: FunctionBridge,
	stack: WeakSet<object>,
): unknown {
	if (typeof value === "function") {
		return bridge.serialize(value as CallableFunction);
	}
	if (typeof value !== "object" || value === null) return value;
	// Arrays are checked first: they never carry the Date brand.
	if (Array.isArray(value)) return serializeArray(value, bridge, stack);
	if (isDate(value)) return encodeDateWireValue(value);
	return serializeRecord(value, bridge, stack);
}

/** Captures indexed entries once, then encodes them, rejecting undefined entries. */
function serializeArray(
	value: unknown[],
	bridge: FunctionBridge,
	stack: WeakSet<object>,
): unknown[] {
	enterStack(value, stack, CIRCULAR_ARRAY_ERROR);
	try {
		const entries: unknown[] = [];
		const length = value.length;
		for (let index = 0; index < length; index++) {
			const entry = value[index];
			assertDefinedArrayEntry(entry, [String(index)]);
			entries.push(entry);
		}
		const result: unknown[] = [];
		for (let index = 0; index < entries.length; index++) {
			const encoded = serializeFunctions(
				entries[index],
				bridge,
				stack,
				String(index),
			);
			// toJSON() can return undefined, which JSON would turn into null.
			assertDefinedArrayEntry(encoded, [String(index)]);
			result.push(encoded);
		}
		return result;
	} finally {
		stack.delete(value);
	}
}

/**
 * Encodes own enumerable fields, skipping unsafe keys and escaping marker
 * shapes. Native raw JSON keeps its brand and is returned unchanged.
 */
function serializeRecord(
	value: object,
	bridge: FunctionBridge,
	stack: WeakSet<object>,
): unknown {
	if (isRawJsonValue(value)) return value;
	enterStack(value, stack, CIRCULAR_OBJECT_ERROR);
	try {
		const result: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) {
			if (!isSafeObjectKey(key)) continue;
			result[key] = serializeFunctions(entry, bridge, stack, key);
		}
		return escapeWireRecord(result);
	} finally {
		stack.delete(value);
	}
}

/**
 * Recursively deserializes all function references in an object.
 *
 * @remarks
 * Input always comes from parsed message data, so it cannot contain
 * cycles.
 *
 * @param obj - The object to process
 * @param bridge - The function bridge to use for deserialization
 * @param targetWin - The window containing the original functions
 * @param targetOrigin - The origin of the target window
 * @returns A new object with all references replaced by callable wrappers
 *
 * @internal
 */
export function deserializeFunctions(
	obj: unknown,
	bridge: FunctionBridge,
	targetWin: Window,
	targetOrigin: string,
): unknown {
	if (FunctionBridge.isFunctionRef(obj)) {
		return bridge.deserialize(obj, targetWin, targetOrigin);
	}

	if (isDateWireValue(obj)) {
		return decodeDateWireValue(obj);
	}

	if (Array.isArray(obj)) {
		return obj.map((item) =>
			deserializeFunctions(item, bridge, targetWin, targetOrigin),
		);
	}

	if (typeof obj === "object" && obj !== null) {
		const result: Record<string, unknown> = {};
		const record = isRecordWireValue(obj) ? obj.__forgeframe_wire_value__ : obj;
		for (const [key, value] of Object.entries(record)) {
			if (!isSafeObjectKey(key)) continue;
			result[key] = deserializeFunctions(
				value,
				bridge,
				targetWin,
				targetOrigin,
			);
		}
		return result;
	}

	return obj;
}

/** Frames one retained local identity without accessing the bridge registry. */
function createFunctionRef(id: string, name: string): FunctionRef {
	return { __type__: "function", __id__: id, __name__: name };
}
