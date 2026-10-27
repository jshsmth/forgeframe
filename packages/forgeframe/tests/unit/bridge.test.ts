/**
 * Unit tests for `@/communication/bridge`.
 *
 * Covers function reference lifecycle, recursive serialization/deserialization, and bridge call routing through messenger handlers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	deserializeFunctions,
	FunctionBridge,
	serializeFunctions,
} from "@/communication/bridge";
import type { Messenger } from "@/communication/messenger";
import { MESSAGE_NAME } from "@/constants";
import { ForgeFrameError } from "@/errors";
import { createDeferred } from "@/utils/promise";
import { forgeFrameError } from "../forgeframe-error";
import { requireValue } from "../require-value";

type GenericFunction = (...args: unknown[]) => unknown;

/**
 * Creates a messenger test double with handler storage and a `CALL` trigger helper.
 */
/** Admits every caller where a test exercises serialization rather than source checks. */
const acceptAnySource = () => true;

const createMockMessenger = () => {
	const handlers = new Map<string, GenericFunction>();

	return {
		send: vi.fn().mockResolvedValue(undefined),
		post: vi.fn(),
		rejectPending: vi.fn(),
		on: vi.fn((name: string, handler: GenericFunction) => {
			handlers.set(name, handler);
			return () => handlers.delete(name);
		}),
		destroy: vi.fn(),
		handlers,
		// Helper to simulate incoming call
		simulateCall: async (id: string, args: unknown[]) => {
			const handler = handlers.get(MESSAGE_NAME.CALL);
			if (handler) {
				return handler(
					{ id, args },
					{
						uid: "test",
						domain: "https://test.com",
						window: { postMessage: vi.fn() } as unknown as Window,
					},
				);
			}
			throw new Error("No handler registered");
		},
	};
};

describe("FunctionBridge", () => {
	let messenger: ReturnType<typeof createMockMessenger>;
	let bridge: FunctionBridge;

	beforeEach(() => {
		messenger = createMockMessenger();
		bridge = new FunctionBridge(
			messenger as unknown as Messenger,
			acceptAnySource,
		);
	});

	afterEach(() => {
		bridge.destroy();
	});

	describe("serialize", () => {
		it("should create function reference", () => {
			const fn = () => "hello";
			const ref = bridge.serialize(fn);

			expect(ref.__type__).toBe("function");
			expect(typeof ref.__id__).toBe("string");
			expect(ref.__name__).toBe("fn");
		});

		it("should use function name", () => {
			function namedFunction() {
				return 42;
			}

			const ref = bridge.serialize(namedFunction);

			expect(ref.__name__).toBe("namedFunction");
		});

		it('should use "anonymous" for unnamed functions', () => {
			const ref = bridge.serialize(() => {});

			expect(ref.__name__).toBe("anonymous");
		});

		it("should generate unique IDs", () => {
			const ref1 = bridge.serialize(() => {});
			const ref2 = bridge.serialize(() => {});

			expect(ref1.__id__).not.toBe(ref2.__id__);
		});

		it("should preserve the ID of the same function across serialization batches", async () => {
			const fn = () => "stable";
			bridge.startBatch();
			const first = bridge.serialize(fn);
			bridge.finishBatch();

			bridge.startBatch();
			const second = bridge.serialize(fn);
			bridge.finishBatch();

			expect(second.__id__).toBe(first.__id__);
			await expect(messenger.simulateCall(first.__id__, [])).resolves.toBe(
				"stable",
			);
		});

		it("should reject calls from an unexpected peer window", async () => {
			const guardedBridge = new FunctionBridge(
				messenger as unknown as Messenger,
				() => false,
			);
			const ref = guardedBridge.serialize(() => "private");

			await expect(messenger.simulateCall(ref.__id__, [])).rejects.toThrow(
				forgeFrameError(
					"ORIGIN_REJECTED",
					"Function call rejected from unexpected window",
				),
			);
			guardedBridge.destroy();
		});

		it("answers liveness checks only from the expected peer window", () => {
			const guardedBridge = new FunctionBridge(
				messenger as unknown as Messenger,
				(source) => source.domain === "https://expected.example",
			);
			// The mock keeps the latest registration: the guarded bridge's handler.
			const liveness = requireValue(
				messenger.handlers.get(`${MESSAGE_NAME.CALL}_liveness`),
			);
			const source = (domain: string) => ({
				uid: "test",
				domain,
				window: { postMessage: vi.fn() } as unknown as Window,
			});

			expect(() => liveness({}, source("https://other.example"))).toThrow(
				forgeFrameError(
					"ORIGIN_REJECTED",
					"Liveness check rejected from unexpected window",
				),
			);
			expect(liveness({}, source("https://expected.example"))).toBe(true);
			guardedBridge.destroy();
		});

		it("refuses to start a batch while one is active", () => {
			bridge.startBatch();
			expect(() => bridge.startBatch()).toThrow(
				forgeFrameError("VALIDATION", "batch already active"),
			);
			bridge.abortBatch();
		});

		it("rejects excess local references without evicting existing callbacks", async () => {
			const firstRef = bridge.serialize(() => "first");

			for (let index = 0; index < 499; index += 1) {
				bridge.serialize(() => index);
			}

			expect(() => bridge.serialize(() => "excess")).toThrow(
				forgeFrameError("CAPACITY", "500 distinct callback limit"),
			);
			await expect(messenger.simulateCall(firstRef.__id__, [])).resolves.toBe(
				"first",
			);
		});
	});

	describe("deserialize", () => {
		it("should create callable wrapper", () => {
			const targetWin = {} as Window;
			const ref = {
				__type__: "function" as const,
				__id__: "fn-123",
				__name__: "test",
			};

			const wrapper = bridge.deserialize(ref, targetWin, "https://target.com");

			expect(typeof wrapper).toBe("function");
		});

		it("should send call message when invoked", async () => {
			const targetWin = {} as Window;
			const ref = {
				__type__: "function" as const,
				__id__: "fn-123",
				__name__: "test",
			};

			const wrapper = bridge.deserialize(
				ref,
				targetWin,
				"https://target.com",
			) as (...args: unknown[]) => Promise<unknown>;

			await wrapper("arg1", "arg2");

			expect(messenger.send).toHaveBeenCalledWith(
				targetWin,
				"https://target.com",
				MESSAGE_NAME.CALL,
				{ id: "fn-123", args: ["arg1", "arg2"] },
				null,
			);
		});

		it("should cache deserialized functions", () => {
			const targetWin = {} as Window;
			const ref = {
				__type__: "function" as const,
				__id__: "fn-123",
				__name__: "test",
			};

			const wrapper1 = bridge.deserialize(ref, targetWin, "https://target.com");
			const wrapper2 = bridge.deserialize(ref, targetWin, "https://target.com");

			expect(wrapper1).toBe(wrapper2);
		});

		it("should not reuse a cached wrapper for a different remote window", async () => {
			const firstTarget = {} as Window;
			const secondTarget = {} as Window;
			const ref = {
				__type__: "function" as const,
				__id__: "fn-shared",
				__name__: "test",
			};

			const firstWrapper = bridge.deserialize(
				ref,
				firstTarget,
				"https://target.com",
			);
			const secondWrapper = bridge.deserialize(
				ref,
				secondTarget,
				"https://target.com",
			) as (...args: unknown[]) => Promise<unknown>;

			expect(secondWrapper).not.toBe(firstWrapper);
			await secondWrapper("next-window");
			expect(messenger.send).toHaveBeenLastCalledWith(
				secondTarget,
				"https://target.com",
				MESSAGE_NAME.CALL,
				{ id: "fn-shared", args: ["next-window"] },
				null,
			);
		});

		it("should set function name", () => {
			const targetWin = {} as Window;
			const ref = {
				__type__: "function" as const,
				__id__: "fn-123",
				__name__: "myFunction",
			};

			const wrapper = bridge.deserialize(ref, targetWin, "https://target.com");

			expect(wrapper.name).toBe("myFunction");
		});

		it("should evict the oldest cached remote wrapper when capacity is exceeded", () => {
			const targetWin = {} as Window;
			const firstRef = {
				__type__: "function" as const,
				__id__: "fn-first",
				__name__: "first",
			};
			const firstWrapper = bridge.deserialize(
				firstRef,
				targetWin,
				"https://target.com",
			);

			const refAt = (index: number) => ({
				__type__: "function" as const,
				__id__: `fn-${index}`,
				__name__: `wrapped-${index}`,
			});
			const wrappers = Array.from({ length: 500 }, (_, index) =>
				bridge.deserialize(refAt(index), targetWin, "https://target.com"),
			);

			const recreatedWrapper = bridge.deserialize(
				firstRef,
				targetWin,
				"https://target.com",
			);

			expect(recreatedWrapper).not.toBe(firstWrapper);
			expect(recreatedWrapper.name).toBe("first");
			// The newest wrapper stays cached; re-adding the first evicted the next oldest.
			expect(
				bridge.deserialize(refAt(499), targetWin, "https://target.com"),
			).toBe(wrappers[499]);
			expect(
				bridge.deserialize(refAt(0), targetWin, "https://target.com"),
			).not.toBe(wrappers[0]);
		});
	});

	describe("isFunctionRef", () => {
		it("should return true for valid function ref", () => {
			expect(
				FunctionBridge.isFunctionRef({
					__type__: "function",
					__id__: "fn-123",
					__name__: "test",
				}),
			).toBe(true);
		});

		it("should return false for invalid objects", () => {
			expect(FunctionBridge.isFunctionRef(null)).toBe(false);
			expect(FunctionBridge.isFunctionRef(undefined)).toBe(false);
			expect(FunctionBridge.isFunctionRef("string")).toBe(false);
			expect(FunctionBridge.isFunctionRef({ __type__: "other" })).toBe(false);
			expect(FunctionBridge.isFunctionRef({ __type__: "function" })).toBe(
				false,
			);
			expect(FunctionBridge.isFunctionRef({ __id__: "test" })).toBe(false);
		});
	});

	describe("call handler", () => {
		it("should setup call handler on construction", () => {
			expect(messenger.on).toHaveBeenCalledWith(
				MESSAGE_NAME.CALL,
				expect.any(Function),
			);
		});

		it("should invoke local function when called", async () => {
			const localFn = vi.fn().mockReturnValue("result");
			const ref = bridge.serialize(localFn);

			const result = await messenger.simulateCall(ref.__id__, ["arg1", "arg2"]);

			expect(localFn).toHaveBeenCalledWith("arg1", "arg2");
			expect(result).toBe("result");
		});

		it("should throw for unknown function ID", async () => {
			await expect(messenger.simulateCall("unknown-id", [])).rejects.toThrow(
				forgeFrameError("CLOSED", 'Function with id "unknown-id" not found'),
			);
		});

		it("strips the code from an application callback's ForgeFrameError", async () => {
			const ref = bridge.serialize(() => {
				throw new ForgeFrameError("CAPACITY", "app failure");
			});

			const error = await messenger
				.simulateCall(ref.__id__, [])
				.catch((caught: unknown) => caught);

			expect(error).not.toBeInstanceOf(ForgeFrameError);
			expect((error as Error).message).toBe("app failure");
		});

		it("keeps the code of a relayed remote wrapper's own failure", async () => {
			const peerWindow = {} as Window;
			const relayed = bridge.deserialize(
				{ __type__: "function", __id__: "peer-fn", __name__: "reset" },
				peerWindow,
				"https://peer.example",
			);
			bridge.endRemoteSession(peerWindow, "Peer closed");
			const ref = bridge.serialize(relayed);

			const error = await messenger
				.simulateCall(ref.__id__, [])
				.catch((caught: unknown) => caught);

			expect(error).toEqual(forgeFrameError("CLOSED"));
		});
	});

	describe("removeLocal", () => {
		it("should remove local function reference", async () => {
			const localFn = vi.fn();
			const ref = bridge.serialize(localFn);

			bridge.removeLocal(ref.__id__);

			// A retired reference is CLOSED: the callback it named is gone.
			await expect(
				messenger.simulateCall(ref.__id__, []),
			).rejects.toMatchObject({
				code: "CLOSED",
				message: `Function with id "${ref.__id__}" not found`,
			});
		});
	});

	describe("liveness checks", () => {
		it("ignores a timed-out check whose calls already settled", async () => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			try {
				const targetWin = {} as Window;
				const livenessName = `${MESSAGE_NAME.CALL}_liveness`;
				const firstCheck = createDeferred<unknown>();
				const firstCall = createDeferred<unknown>();
				let calls = 0;
				messenger.send.mockImplementation(
					(_win: Window, _domain: string, name: string) => {
						if (name === livenessName)
							return messenger.send.mock.calls.filter(
								([, , sent]) => sent === livenessName,
							).length === 1
								? firstCheck.promise
								: new Promise(() => {});
						calls++;
						return calls === 1 ? firstCall.promise : new Promise(() => {});
					},
				);
				const wrapper = bridge.deserialize(
					{ __type__: "function", __id__: "fn-live", __name__: "live" },
					targetWin,
					"https://target.com",
				) as () => Promise<unknown>;

				const settled = wrapper();
				await vi.advanceTimersByTimeAsync(10_000);
				firstCall.resolve("done");
				await settled;
				void wrapper();
				firstCheck.reject(new Error("Liveness check timed out"));
				await vi.advanceTimersByTimeAsync(0);

				// The newer call keeps waiting and gets a check of its own.
				expect(messenger.rejectPending).not.toHaveBeenCalled();
				await vi.advanceTimersByTimeAsync(10_000);
				expect(
					messenger.send.mock.calls.filter(
						([, , name]) => name === livenessName,
					),
				).toHaveLength(2);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe("destroy", () => {
		it("should clear all function references", async () => {
			const localFn = vi.fn();
			const ref = bridge.serialize(localFn);

			bridge.destroy();

			await expect(messenger.simulateCall(ref.__id__, [])).rejects.toThrow(
				forgeFrameError("CLOSED", "not found"),
			);
		});
	});

	describe("batch lifecycle", () => {
		it("preserves callback IDs across a new-session reset without retaining old functions", async () => {
			const callback = () => 42;
			const previous = bridge.serialize(callback);
			bridge.clearLocal(true);
			await expect(messenger.simulateCall(previous.__id__, [])).rejects.toThrow(
				forgeFrameError("CLOSED", "not found"),
			);
			bridge.startBatch();
			expect(bridge.serialize(callback).__id__).toBe(previous.__id__);
			bridge.finishBatch();
			await expect(messenger.simulateCall(previous.__id__, [])).resolves.toBe(
				42,
			);
		});

		it("replaces all 500 callbacks atomically and admits staged calls before acknowledgement", async () => {
			bridge.startBatch();
			const previous = Array.from({ length: 500 }, (_, index) =>
				bridge.serialize(() => index),
			);
			bridge.finishBatch();
			bridge.startBatch();
			const next = Array.from({ length: 500 }, (_, index) =>
				bridge.serialize(() => index + 500),
			);
			await expect(
				messenger.simulateCall(previous[0]?.__id__ ?? "", []),
			).resolves.toBe(0);
			await expect(
				messenger.simulateCall(next[499]?.__id__ ?? "", []),
			).resolves.toBe(999);
			expect(() => bridge.serialize(() => 1000)).toThrow(
				forgeFrameError("CAPACITY", "500 distinct callback limit"),
			);
			bridge.finishBatch();
			await expect(
				messenger.simulateCall(previous[0]?.__id__ ?? "", []),
			).rejects.toThrow(forgeFrameError("CLOSED", "not found"));
			await expect(
				messenger.simulateCall(next[0]?.__id__ ?? "", []),
			).resolves.toBe(500);
		});

		it("rolls back partial serialization and reuses existing identities", async () => {
			const original = () => "original";
			const previous = bridge.serialize(original);
			bridge.startBatch();
			for (let index = 0; index < 600; index++) {
				expect(bridge.serialize(original).__id__).toBe(previous.__id__);
			}
			const staged = bridge.serialize(() => "staged");
			bridge.abortBatch();
			await expect(messenger.simulateCall(previous.__id__, [])).resolves.toBe(
				"original",
			);
			await expect(messenger.simulateCall(staged.__id__, [])).rejects.toThrow(
				forgeFrameError("CLOSED", "not found"),
			);
			bridge.startBatch();
			expect(bridge.serialize(original).__id__).toBe(previous.__id__);
			bridge.finishBatch();
		});

		it("bounds failed-delivery retention and recovers through an acknowledged retry", async () => {
			bridge.startBatch();
			const previous = Array.from({ length: 500 }, (_, index) =>
				bridge.serialize(() => index),
			);
			bridge.finishBatch();
			const callbacks = Array.from(
				{ length: 500 },
				(_, index) => () => index + 500,
			);
			bridge.startBatch();
			const next = callbacks.map((fn) => bridge.serialize(fn));
			bridge.finishBatch(true);
			for (let attempt = 0; attempt < 3; attempt++) {
				bridge.startBatch();
				expect(() => bridge.serialize(() => attempt)).toThrow(
					forgeFrameError("CAPACITY", "recovery pool is full"),
				);
				bridge.abortBatch();
			}
			await expect(
				messenger.simulateCall(previous[0]?.__id__ ?? "", []),
			).resolves.toBe(0);
			await expect(
				messenger.simulateCall(next[0]?.__id__ ?? "", []),
			).resolves.toBe(500);
			bridge.startBatch();
			callbacks.forEach((fn, index) => {
				expect(bridge.serialize(fn).__id__).toBe(next[index]?.__id__);
			});
			bridge.finishBatch();
			await expect(
				messenger.simulateCall(previous[0]?.__id__ ?? "", []),
			).rejects.toThrow(forgeFrameError("CLOSED", "not found"));
			await expect(
				messenger.simulateCall(next[499]?.__id__ ?? "", []),
			).resolves.toBe(999);
			bridge.startBatch();
			const fresh = bridge.serialize(() => "new capacity");
			bridge.finishBatch();
			await expect(
				messenger.simulateCall(next[0]?.__id__ ?? "", []),
			).rejects.toThrow(forgeFrameError("CLOSED", "not found"));
			await expect(messenger.simulateCall(fresh.__id__, [])).resolves.toBe(
				"new capacity",
			);
		});

		it("rejects append overflow atomically and clears recovery references on reset", async () => {
			bridge.startBatch("append");
			const first = bridge.serialize(() => "first");
			for (let index = 0; index < 498; index++) bridge.serialize(() => index);
			bridge.finishBatch(true);
			bridge.startBatch("append");
			const staged = bridge.serialize(() => "staged");
			expect(() => bridge.serialize(() => "overflow")).toThrow(
				forgeFrameError("CAPACITY", "500 distinct callback limit"),
			);
			bridge.abortBatch();
			await expect(messenger.simulateCall(first.__id__, [])).resolves.toBe(
				"first",
			);
			await expect(messenger.simulateCall(staged.__id__, [])).rejects.toThrow(
				forgeFrameError("CLOSED", "not found"),
			);
			bridge.clearLocal();
			await expect(messenger.simulateCall(first.__id__, [])).rejects.toThrow(
				forgeFrameError("CLOSED", "not found"),
			);
			bridge.startBatch();
			const fresh = bridge.serialize(() => "fresh session");
			bridge.finishBatch();
			await expect(messenger.simulateCall(fresh.__id__, [])).resolves.toBe(
				"fresh session",
			);
			bridge.destroy();
			await expect(messenger.simulateCall(fresh.__id__, [])).rejects.toThrow(
				forgeFrameError("CLOSED", "not found"),
			);
		});

		it("should keep previous function references when finishBatch(true) is used", async () => {
			const firstRef = bridge.serialize(() => "first");

			bridge.startBatch();
			const secondRef = bridge.serialize(() => "second");
			bridge.finishBatch(true);

			await expect(messenger.simulateCall(firstRef.__id__, [])).resolves.toBe(
				"first",
			);
			await expect(messenger.simulateCall(secondRef.__id__, [])).resolves.toBe(
				"second",
			);
		});

		it("should remove stale local references when finishing a new batch", async () => {
			const firstRef = bridge.serialize(() => "first");
			bridge.startBatch();
			const secondRef = bridge.serialize(() => "second");

			bridge.finishBatch();

			await expect(messenger.simulateCall(firstRef.__id__, [])).rejects.toThrow(
				forgeFrameError(
					"CLOSED",
					`Function with id "${firstRef.__id__}" not found`,
				),
			);
			await expect(messenger.simulateCall(secondRef.__id__, [])).resolves.toBe(
				"second",
			);
		});
	});
});

describe("serializeFunctions", () => {
	let messenger: ReturnType<typeof createMockMessenger>;
	let bridge: FunctionBridge;

	beforeEach(() => {
		messenger = createMockMessenger();
		bridge = new FunctionBridge(
			messenger as unknown as Messenger,
			acceptAnySource,
		);
	});

	afterEach(() => {
		bridge.destroy();
	});

	it("should serialize top-level function", () => {
		const fn = () => "hello";
		const result = serializeFunctions(fn, bridge);

		expect(FunctionBridge.isFunctionRef(result)).toBe(true);
	});

	it("should serialize functions in object", () => {
		const obj = {
			callback: () => "callback",
			value: 42,
		};

		const result = serializeFunctions(obj, bridge) as Record<string, unknown>;

		expect(FunctionBridge.isFunctionRef(result.callback)).toBe(true);
		expect(result.value).toBe(42);
	});

	it("should serialize functions in nested object", () => {
		const obj = {
			nested: {
				deep: {
					fn: () => "deep",
				},
			},
		};

		const result = serializeFunctions(obj, bridge) as {
			nested: { deep: { fn: unknown } };
		};

		expect(FunctionBridge.isFunctionRef(result.nested.deep.fn)).toBe(true);
	});

	it("should serialize functions in array", () => {
		const arr = [() => "first", "string", () => "second"];

		const result = serializeFunctions(arr, bridge) as unknown[];

		expect(FunctionBridge.isFunctionRef(result[0])).toBe(true);
		expect(result[1]).toBe("string");
		expect(FunctionBridge.isFunctionRef(result[2])).toBe(true);
	});

	it("rejects a toJSON() result that contains its own source as a cycle", () => {
		class SelfReferencing {
			toJSON() {
				return { self: this };
			}
		}
		expect(() => serializeFunctions(new SelfReferencing(), bridge)).toThrow(
			forgeFrameError("VALIDATION", "Circular reference detected in props"),
		);
		expect(() =>
			serializeFunctions({ items: [new SelfReferencing()] }, bridge),
		).toThrow(
			forgeFrameError("VALIDATION", "Circular reference detected in props"),
		);
	});

	it("should preserve primitives", () => {
		expect(serializeFunctions("string", bridge)).toBe("string");
		expect(serializeFunctions(42, bridge)).toBe(42);
		expect(serializeFunctions(true, bridge)).toBe(true);
		expect(serializeFunctions(null, bridge)).toBe(null);
	});

	it("should allow shared object references that are not circular", () => {
		const shared = { fn: () => "ok" };
		const value = { first: shared, second: shared };

		const result = serializeFunctions(value, bridge) as {
			first: { fn: unknown };
			second: { fn: unknown };
		};

		expect(FunctionBridge.isFunctionRef(result.first.fn)).toBe(true);
		expect(FunctionBridge.isFunctionRef(result.second.fn)).toBe(true);
	});

	it("should throw on circular object references", () => {
		const value: Record<string, unknown> = {};
		value.self = value;

		expect(() => serializeFunctions(value, bridge)).toThrow(
			forgeFrameError("VALIDATION", "Circular reference detected"),
		);
	});

	it("should throw on circular array references", () => {
		const value: unknown[] = [];
		value.push(value);

		expect(() => serializeFunctions(value, bridge)).toThrow(
			forgeFrameError(
				"VALIDATION",
				"Circular reference detected in props - arrays cannot contain circular references",
			),
		);
	});

	it("should block __proto__ while preserving constructor/prototype keys when serializing objects", () => {
		const value: Record<string, unknown> = Object.create(null) as Record<
			string,
			unknown
		>;
		value.safe = 42;
		// biome-ignore lint/suspicious/noProto: Exercise an own __proto__ data property to verify prototype-safe handling.
		value.__proto__ = {
			leaked: true,
		};
		Reflect.set(value, "constructor", {
			prototype: {
				ignored: true,
			},
		});

		const result = serializeFunctions(value, bridge) as Record<string, unknown>;

		expect(result.safe).toBe(42);
		expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
		expect("leaked" in result).toBe(false);
		expect(Object.hasOwn(result, "__proto__")).toBe(false);
		expect(Object.hasOwn(result, "constructor")).toBe(true);
		expect(result.constructor).toEqual({
			prototype: {
				ignored: true,
			},
		});
	});
});

describe("deserializeFunctions", () => {
	let messenger: ReturnType<typeof createMockMessenger>;
	let bridge: FunctionBridge;
	const targetWin = {} as Window;
	const targetOrigin = "https://target.com";

	beforeEach(() => {
		messenger = createMockMessenger();
		bridge = new FunctionBridge(
			messenger as unknown as Messenger,
			acceptAnySource,
		);
	});

	afterEach(() => {
		bridge.destroy();
	});

	it("should deserialize function reference", () => {
		const ref = {
			__type__: "function" as const,
			__id__: "fn-1",
			__name__: "test",
		};

		const result = deserializeFunctions(ref, bridge, targetWin, targetOrigin);

		expect(typeof result).toBe("function");
	});

	it("should deserialize functions in object", () => {
		const obj = {
			callback: {
				__type__: "function" as const,
				__id__: "fn-1",
				__name__: "callback",
			},
			value: 42,
		};

		const result = deserializeFunctions(
			obj,
			bridge,
			targetWin,
			targetOrigin,
		) as Record<string, unknown>;

		expect(typeof result.callback).toBe("function");
		expect(result.value).toBe(42);
	});

	it("should deserialize functions in nested object", () => {
		const obj = {
			nested: {
				fn: {
					__type__: "function" as const,
					__id__: "fn-1",
					__name__: "nested",
				},
			},
		};

		const result = deserializeFunctions(
			obj,
			bridge,
			targetWin,
			targetOrigin,
		) as { nested: { fn: unknown } };

		expect(typeof result.nested.fn).toBe("function");
	});

	it("should deserialize functions in array", () => {
		const arr = [
			{ __type__: "function" as const, __id__: "fn-1", __name__: "first" },
			"string",
		];

		const result = deserializeFunctions(
			arr,
			bridge,
			targetWin,
			targetOrigin,
		) as unknown[];

		expect(typeof result[0]).toBe("function");
		expect(result[1]).toBe("string");
	});

	it("should preserve primitives", () => {
		expect(
			deserializeFunctions("string", bridge, targetWin, targetOrigin),
		).toBe("string");
		expect(deserializeFunctions(42, bridge, targetWin, targetOrigin)).toBe(42);
		expect(deserializeFunctions(true, bridge, targetWin, targetOrigin)).toBe(
			true,
		);
		expect(deserializeFunctions(null, bridge, targetWin, targetOrigin)).toBe(
			null,
		);
	});

	it("should allow shared object references that are not circular", () => {
		const shared = {
			__type__: "function" as const,
			__id__: "shared",
			__name__: "sharedFn",
		};
		const value = { first: shared, second: shared };

		const result = deserializeFunctions(
			value,
			bridge,
			targetWin,
			targetOrigin,
		) as {
			first: unknown;
			second: unknown;
		};

		expect(typeof result.first).toBe("function");
		expect(typeof result.second).toBe("function");
	});

	it("should block __proto__ while preserving constructor/prototype keys when deserializing objects", () => {
		const value: Record<string, unknown> = Object.create(null) as Record<
			string,
			unknown
		>;
		value.safe = 42;
		// biome-ignore lint/suspicious/noProto: Exercise an own __proto__ data property to verify prototype-safe handling.
		value.__proto__ = {
			leaked: true,
		};
		Reflect.set(value, "constructor", {
			prototype: {
				ignored: true,
			},
		});

		const result = deserializeFunctions(
			value,
			bridge,
			targetWin,
			targetOrigin,
		) as Record<string, unknown>;

		expect(result.safe).toBe(42);
		expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
		expect("leaked" in result).toBe(false);
		expect(Object.hasOwn(result, "__proto__")).toBe(false);
		expect(Object.hasOwn(result, "constructor")).toBe(true);
		expect(result.constructor).toEqual({
			prototype: {
				ignored: true,
			},
		});
	});
});

describe("round-trip serialization", () => {
	it("should preserve function calls through serialize/deserialize", async () => {
		const consumerMessenger = createMockMessenger();
		const hostMessenger = createMockMessenger();

		const consumerBridge = new FunctionBridge(
			consumerMessenger as unknown as Messenger,
			acceptAnySource,
		);
		const hostBridge = new FunctionBridge(
			hostMessenger as unknown as Messenger,
			acceptAnySource,
		);

		const targetWin = {} as Window;
		const targetOrigin = "https://host.com";

		// Consumer serializes a function
		const originalFn = vi.fn().mockReturnValue("success");
		const serialized = consumerBridge.serialize(originalFn);

		// Host deserializes it
		const deserialized = hostBridge.deserialize(
			serialized,
			targetWin,
			targetOrigin,
		) as (...args: unknown[]) => Promise<unknown>;

		// Host calls the function
		await deserialized("arg1");

		// Verify the call was sent to consumer
		expect(hostMessenger.send).toHaveBeenCalledWith(
			targetWin,
			targetOrigin,
			MESSAGE_NAME.CALL,
			{ id: serialized.__id__, args: ["arg1"] },
			null,
		);

		// Simulate the consumer receiving and handling the call
		const result = await consumerMessenger.simulateCall(serialized.__id__, [
			"arg1",
		]);
		expect(result).toBe("success");
		expect(originalFn).toHaveBeenCalledWith("arg1");

		consumerBridge.destroy();
		hostBridge.destroy();
	});
});
