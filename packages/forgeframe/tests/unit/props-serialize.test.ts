/**
 * Unit tests for `@/props/serialize` serialization modes.
 *
 * Covers BASE64/DOTIFY round-trips, malformed wrapper fallback behavior, and undefined key omission in payload serialization.
 */
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FunctionBridge } from "@/communication/bridge";
import type { Messenger } from "@/communication/messenger";
import { PROP_SERIALIZATION } from "@/constants";
import { prop } from "@/props/prop";
import { deserializeProps, serializeProps } from "@/props/serialize";
import type { SerializedProps } from "@/props/types";

type GenericHandler = (...args: unknown[]) => unknown;

/**
 * Creates a bridge paired with a messenger mock that captures registered handlers.
 */
function createBridgeWithMessenger() {
	const handlers = new Map<string, GenericHandler>();
	const messenger = {
		send: vi.fn().mockResolvedValue(undefined),
		on: vi.fn((name: string, handler: GenericHandler) => {
			handlers.set(name, handler);
			return () => handlers.delete(name);
		}),
		destroy: vi.fn(),
	} as unknown as Messenger;

	return {
		messenger,
		bridge: new FunctionBridge(messenger),
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Props serialization behavior", () => {
	it.each([PROP_SERIALIZATION.BASE64, PROP_SERIALIZATION.DOTIFY])(
		"serializes ordinary records without unrelated primitive coercion in %s",
		(serialization) => {
			const { messenger, bridge } = createBridgeWithMessenger();
			const props = {
				payload: {
					records: [
						{ id: 1, label: "first" },
						{ id: 2, label: "second" },
					],
				},
			};
			const probes = [
				vi.spyOn(Number.prototype, "valueOf"),
				vi.spyOn(String.prototype, "valueOf"),
				vi.spyOn(Boolean.prototype, "valueOf"),
				vi.spyOn(BigInt.prototype, "valueOf"),
			];
			const definitions = { payload: { schema: prop.object(), serialization } };
			const wire = serializeProps<{ payload: Record<string, unknown> }>(
				props,
				definitions,
				bridge,
			);
			for (const probe of probes) expect(probe).not.toHaveBeenCalled();
			expect(
				deserializeProps(
					wire,
					definitions,
					messenger,
					bridge,
					window,
					"https://consumer.example.com",
				),
			).toEqual(props);
			bridge.destroy();
		},
	);

	it.each([PROP_SERIALIZATION.BASE64, PROP_SERIALIZATION.DOTIFY])(
		"preserves boxed values and avoids branding getters in %s",
		(serialization) => {
			const { messenger, bridge } = createBridgeWithMessenger();
			const branding = vi.fn(() => {
				throw new Error("Branding getter must not run");
			});
			const tagged = { label: "ordinary" };
			Object.defineProperty(tagged, Symbol.toStringTag, { get: branding });
			const wrappers = [Object(7), Object("boxed"), Object(true)];
			for (const wrapper of wrappers) {
				Object.setPrototypeOf(wrapper, Object.prototype);
				Object.defineProperty(wrapper, "ignored", {
					value: "field",
					enumerable: true,
				});
			}
			const customized = Object(9);
			Object.defineProperty(customized, Symbol.toStringTag, { get: branding });
			class Encoded {
				toJSON() {
					return { tagged, wrappers, customized };
				}
			}
			const expected = JSON.parse(JSON.stringify(new Encoded()));
			const definitions = { payload: { schema: prop.object(), serialization } };
			const wire = serializeProps<{ payload: Record<string, unknown> }>(
				{ payload: { encoded: new Encoded() } },
				definitions,
				bridge,
			);
			expect(
				deserializeProps(
					wire,
					definitions,
					messenger,
					bridge,
					window,
					"https://consumer.example.com",
				),
			).toEqual({ payload: { encoded: expected } });
			expect(branding).not.toHaveBeenCalled();
			bridge.destroy();
		},
	);

	it.each([PROP_SERIALIZATION.BASE64, PROP_SERIALIZATION.DOTIFY])(
		"keeps native coercion counts and avoids proxy branding reads in %s",
		(serialization) => {
			const { messenger, bridge } = createBridgeWithMessenger();
			const branding = vi.fn();
			const record = new Proxy(
				{ label: "original" },
				{
					get(target, key, receiver) {
						if (key === Symbol.toStringTag) {
							branding();
							target.label = "changed";
						}
						return Reflect.get(target, key, receiver);
					},
				},
			);
			const opaque = new Proxy(
				{ label: "opaque" },
				{
					getPrototypeOf() {
						throw new Error("Prototype metadata must not be read");
					},
				},
			);
			const number = Object(7);
			const numberCoercion = vi.fn(() => 8);
			number.valueOf = numberCoercion;
			const string = Object("boxed");
			const stringCoercion = vi.fn(() => "converted");
			string.toString = stringCoercion;
			const foreign = runInNewContext(
				"[Object(9), Object('foreign'), Object(false)]",
			);
			class Encoded {
				toJSON() {
					return {
						record,
						opaque,
						number,
						string,
						foreign,
						nonfinite: Object(Number.NaN),
					};
				}
			}
			const definitions = { payload: { schema: prop.object(), serialization } };
			const wire = serializeProps<{ payload: Record<string, unknown> }>(
				{ payload: { encoded: new Encoded() } },
				definitions,
				bridge,
			);
			expect(
				deserializeProps(
					wire,
					definitions,
					messenger,
					bridge,
					window,
					window.location.origin,
				),
			).toEqual({
				payload: {
					encoded: {
						record: { label: "original" },
						opaque: { label: "opaque" },
						number: 8,
						string: "converted",
						foreign: [9, "foreign", false],
						nonfinite: null,
					},
				},
			});
			expect(branding).not.toHaveBeenCalled();
			expect(numberCoercion).toHaveBeenCalledOnce();
			expect(stringCoercion).toHaveBeenCalledOnce();
			bridge.destroy();
		},
	);

	it.each([PROP_SERIALIZATION.BASE64, PROP_SERIALIZATION.DOTIFY])(
		"preserves native and foreign raw JSON values returned by encoders in %s",
		(serialization) => {
			const { messenger, bridge } = createBridgeWithMessenger();
			const rawValues: object[] = runInNewContext(
				"[JSON.rawJSON('42'), JSON.rawJSON('true'), JSON.rawJSON('\"raw\"')]",
			);
			if (!("rawJSON" in JSON) || typeof JSON.rawJSON !== "function") {
				throw new Error("The test runtime must support native raw JSON");
			}
			rawValues.push(JSON.rawJSON("null"));
			const encodings = vi.fn(() => ({ values: rawValues }));
			class CustomValue {
				toJSON() {
					return encodings();
				}
			}
			const definitions = { payload: { schema: prop.object(), serialization } };
			const serialized = serializeProps<{ payload: Record<string, unknown> }>(
				{ payload: { custom: new CustomValue() } },
				definitions,
				bridge,
			);
			expect(
				deserializeProps(
					serialized,
					definitions,
					messenger,
					bridge,
					window,
					"https://consumer.example.com",
				),
			).toEqual({
				payload: { custom: { values: [42, true, "raw", null] } },
			});
			expect(encodings).toHaveBeenCalledOnce();
			bridge.destroy();
		},
	);

	it.each([PROP_SERIALIZATION.BASE64, PROP_SERIALIZATION.DOTIFY])(
		"captures encoded accessors once and preserves native JSON conversion in %s",
		(serialization) => {
			const { messenger, bridge } = createBridgeWithMessenger();
			const date = new Date("2026-01-02T03:04:05.678Z");
			const dateEncoder = vi.spyOn(date, "toJSON");
			const callback = () => 42;
			let reads = 0;
			let encodings = 0;
			class CustomValue {
				#label = "original receiver";
				toJSON() {
					encodings++;
					const items: unknown[] = [];
					Object.defineProperty(items, "0", {
						enumerable: true,
						get() {
							if (++reads > 1) throw new Error("Accessor read twice");
							return date;
						},
					});
					Object.freeze(items);
					const symbol = Object(Symbol("boxed"));
					Object.defineProperty(symbol, "date", {
						enumerable: true,
						value: date,
					});
					const alteredNumber = Object(9);
					Object.setPrototypeOf(alteredNumber, null);
					alteredNumber.valueOf = () => 9;
					return {
						label: this.#label,
						items,
						callback,
						number: Object(7),
						string: Object("boxed"),
						boolean: Object(false),
						symbol,
						alteredNumber,
					};
				}
			}
			const definitions = { payload: { schema: prop.object(), serialization } };
			const serialized = serializeProps<{ payload: Record<string, unknown> }>(
				{ payload: { custom: new CustomValue() } },
				definitions,
				bridge,
			);
			const restored = deserializeProps(
				serialized,
				definitions,
				messenger,
				bridge,
				window,
				window.location.origin,
			);
			expect(reads).toBe(1);
			expect(encodings).toBe(1);
			expect(dateEncoder).toHaveBeenCalledTimes(2);
			expect(restored.payload).toEqual({
				custom: {
					label: "original receiver",
					items: [date],
					callback: expect.any(Function),
					number: 7,
					string: "boxed",
					boolean: false,
					symbol: { date },
					alteredNumber: 9,
				},
			});
			expect(bridge.localFunctionCount).toBe(1);
		},
	);

	it.each([PROP_SERIALIZATION.BASE64, PROP_SERIALIZATION.DOTIFY])(
		"retains native cycle and boxed BigInt rejection in %s",
		(serialization) => {
			const { bridge } = createBridgeWithMessenger();
			const definitions = { payload: { schema: prop.object(), serialization } };
			const cyclic: Record<string, unknown> = {};
			cyclic.self = cyclic;
			class CustomValue {
				toJSON() {
					return cyclic;
				}
			}
			expect(() =>
				serializeProps<{ payload: Record<string, unknown> }>(
					{ payload: { custom: new CustomValue() } },
					definitions,
					bridge,
				),
			).toThrow(TypeError);
			expect(() =>
				serializeProps<{ payload: Record<string, unknown> }>(
					{ payload: { custom: Object(1n) } },
					definitions,
					bridge,
				),
			).toThrow(TypeError);
		},
	);

	it("encodes the array entries captured during presence admission", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		let reads = 0;
		const values: string[] = [];
		Object.defineProperty(values, "0", {
			enumerable: true,
			get: () => (++reads === 1 ? "captured" : undefined),
		});
		const definitions = { payload: prop.array().of(prop.string()) };
		const restored = deserializeProps(
			JSON.parse(
				JSON.stringify(
					serializeProps({ payload: values }, definitions, bridge),
				),
			),
			definitions,
			messenger,
			bridge,
			window,
			window.location.origin,
		);
		expect(reads).toBe(1);
		expect(restored.payload).toEqual(["captured"]);
	});

	it.each(Object.values(PROP_SERIALIZATION))(
		"preserves null-prototype arrays and ignores shadowed map methods through %s",
		(serialization) => {
			const { messenger, bridge } = createBridgeWithMessenger();
			const shadowedMap = vi.fn(() => ["corrupted"]);
			const shadowed = ["one", "two"];
			Object.defineProperty(shadowed, "map", { value: shadowedMap });
			const nullPrototype = ["three"];
			Object.setPrototypeOf(nullPrototype, null);
			const definitions = {
				payload: {
					schema: prop.object<{
						shadowed: string[];
						nullPrototype: string[];
					}>(),
					serialization,
				},
			};
			const restored = deserializeProps(
				JSON.parse(
					JSON.stringify(
						serializeProps(
							{ payload: { shadowed, nullPrototype } },
							definitions,
							bridge,
						),
					),
				),
				definitions,
				messenger,
				bridge,
				window,
				window.location.origin,
			);
			expect(restored.payload).toEqual({
				shadowed: ["one", "two"],
				nullPrototype: ["three"],
			});
			expect(shadowedMap).not.toHaveBeenCalled();
		},
	);
	it.each([
		{ label: "Array.prototype", value: Array.prototype, expected: [] },
		{
			label: "null-prototype array",
			value: Object.setPrototypeOf(["one"], null),
			expected: ["one"],
		},
	])(
		"preserves $label as an array in nested DOTIFY values",
		({ value, expected }) => {
			const { messenger, bridge } = createBridgeWithMessenger();
			const definitions = {
				config: {
					schema: prop.object<{ nested: unknown[] }>(),
					serialization: PROP_SERIALIZATION.DOTIFY,
				},
			};
			const serialized = serializeProps<{ config: { nested: unknown[] } }>(
				{ config: { nested: value } },
				definitions,
				bridge,
			);
			const restored = deserializeProps(
				serialized,
				definitions,
				messenger,
				bridge,
				window,
				window.location.origin,
			);
			expect(restored.config).toEqual({ nested: expected });
		},
	);

	it("traverses foreign ordinary DOTIFY branches without invoking their JSON encoder", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const foreign: {
			value: Record<string, unknown>;
			state: { calls: number };
		} = runInNewContext(`(() => {
			const state = { calls: 0 };
			const value = { original: "own fields" };
			Object.defineProperty(value, "toJSON", { value() { state.calls++; return { converted: "JSON fields" }; } });
			return { value, state };
		})()`);
		const definitions = {
			payload: {
				schema: prop.object<{ nested: Record<string, unknown> }>(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};
		const serialized = serializeProps(
			{ payload: { nested: foreign.value } },
			definitions,
			bridge,
		);
		const restored = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		);
		expect(restored.payload).toEqual({ nested: { original: "own fields" } });
		expect(foreign.state.calls).toBe(0);
	});

	it.each([PROP_SERIALIZATION.BASE64, PROP_SERIALIZATION.DOTIFY])(
		"preserves encoded callbacks returned by toJSON in %s",
		(serialization) => {
			const { messenger, bridge } = createBridgeWithMessenger();
			const callback = () => 42;
			const date = new Date("2026-01-02T03:04:05.678Z");
			class CustomValue {
				toJSON() {
					return { callback, date };
				}
			}
			const definitions = { config: { schema: prop.object(), serialization } };
			const serialized = JSON.parse(
				JSON.stringify(
					serializeProps<{ config: Record<string, unknown> }>(
						{ config: { custom: new CustomValue() } },
						definitions,
						bridge,
					),
				),
			);
			const restored = deserializeProps<{ config: Record<string, unknown> }>(
				serialized,
				definitions,
				messenger,
				bridge,
				window,
				"https://consumer.example.com",
			);
			expect(restored.config.custom).toEqual({
				callback: expect.any(Function),
				date,
			});
			expect(bridge.localFunctionCount).toBe(1);
		},
	);

	it.each([
		{ __type__: "function", __id__: "ordinary", __name__: "ordinary" },
		{
			__forgeframe_wire_type__: "date",
			__forgeframe_wire_value__: "2026-01-01",
		},
		{
			__forgeframe_wire_type__: "record",
			__forgeframe_wire_value__: { kept: true },
		},
		{ __type__: "base64", __value__: "ordinary" },
		{ __type__: "dotify", __value__: "ordinary" },
	])(
		"preserves DOTIFY branches made marker-shaped by leaf conversion: %j",
		(expected) => {
			const { messenger, bridge } = createBridgeWithMessenger();
			let calls = 0;
			class EncodedLeaf {
				constructor(private readonly value: unknown) {}
				toJSON() {
					calls++;
					return this.value;
				}
			}
			const makeRecord = () =>
				Object.fromEntries(
					Object.entries(expected).map(([key, value]) => [
						key,
						new EncodedLeaf(value),
					]),
				);
			const definitions = {
				payload: {
					schema: prop.object(),
					serialization: PROP_SERIALIZATION.DOTIFY,
				},
			};
			const serialized = serializeProps<{ payload: Record<string, unknown> }>(
				{ payload: { direct: makeRecord(), nested: { record: makeRecord() } } },
				definitions,
				bridge,
			);
			const restored = deserializeProps(
				serialized,
				definitions,
				messenger,
				bridge,
				window,
				"https://consumer.example.com",
			);
			expect(restored.payload).toEqual({
				direct: expected,
				nested: { record: expected },
			});
			expect(calls).toBe(Object.keys(expected).length * 2);
		},
	);

	it("omits JSON-undefined DOTIFY leaves and retains emptied branches", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		let calls = 0;
		class OmittedLeaf {
			toJSON() {
				calls++;
				return undefined;
			}
		}
		const definitions = {
			payload: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};
		const serialized = serializeProps<{ payload: Record<string, unknown> }>(
			{
				payload: {
					kept: true,
					omitted: new OmittedLeaf(),
					symbol: Symbol("metadata"),
					empty: { omitted: new OmittedLeaf(), missing: undefined },
					deep: { empty: { symbol: Symbol("metadata") } },
				},
			},
			definitions,
			bridge,
		);
		const restored = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		);
		expect(restored.payload).toEqual({
			kept: true,
			empty: {},
			deep: { empty: {} },
		});
		expect(calls).toBe(2);
	});

	it("should round-trip Date props through the default serializer", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const publishedAt = new Date("2026-01-02T03:04:05.678Z");
		const definitions = {
			publishedAt: prop.date(),
		};

		const serialized = serializeProps(
			{ publishedAt },
			definitions,
			bridge,
		) as Record<string, unknown>;

		expect(serialized.publishedAt).toEqual({
			__forgeframe_wire_type__: "date",
			__forgeframe_wire_value__: publishedAt.toJSON(),
		});

		const deserialized = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { publishedAt: Date };

		expect(deserialized.publishedAt).toBeInstanceOf(Date);
		expect(deserialized.publishedAt.toISOString()).toBe(
			publishedAt.toISOString(),
		);
	});

	it("should not revive legacy generic Date wrappers during default deserialization", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			payload: prop.object(),
		};

		const deserialized = deserializeProps(
			{
				payload: {
					__type__: "date",
					__value__: "2026-01-02T03:04:05.678Z",
				},
			},
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { payload: Record<string, unknown> };

		expect(deserialized.payload).toEqual({
			__type__: "date",
			__value__: "2026-01-02T03:04:05.678Z",
		});
		expect(deserialized.payload).not.toBeInstanceOf(Date);
	});

	it("should not revive ForgeFrame Date wrappers with extra user fields", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			payload: prop.object(),
		};

		const deserialized = deserializeProps(
			{
				payload: {
					__forgeframe_wire_type__: "date",
					__forgeframe_wire_value__: "2026-01-02T03:04:05.678Z",
					kind: "metadata",
				},
			},
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { payload: Record<string, unknown> };

		expect(deserialized.payload).toEqual({
			__forgeframe_wire_type__: "date",
			__forgeframe_wire_value__: "2026-01-02T03:04:05.678Z",
			kind: "metadata",
		});
		expect(deserialized.payload).not.toBeInstanceOf(Date);
	});

	it("should round-trip BASE64-serialized object props", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			metadata: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.BASE64,
			},
		};

		const serialized = serializeProps<{ metadata: Record<string, unknown> }>(
			{ metadata: { amount: 10, nested: { complete: true } } },
			definitions,
			bridge,
		) as Record<string, unknown>;

		expect(serialized.metadata).toEqual(
			expect.objectContaining({
				__type__: "base64",
			}),
		);

		const deserialized = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { metadata: { amount: number; nested: { complete: boolean } } };

		expect(deserialized.metadata).toEqual({
			amount: 10,
			nested: { complete: true },
		});
	});

	it("should round-trip BASE64-serialized Date values nested in objects", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const publishedAt = new Date("2026-01-02T03:04:05.678Z");
		const definitions = {
			metadata: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.BASE64,
			},
		};

		const serialized = serializeProps<{ metadata: Record<string, unknown> }>(
			{
				metadata: {
					publishedAt,
					nested: {
						updatedAt: publishedAt,
					},
				},
			},
			definitions,
			bridge,
		) as Record<string, unknown>;

		const deserialized = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { metadata: { publishedAt: Date; nested: { updatedAt: Date } } };

		expect(deserialized.metadata.publishedAt).toBeInstanceOf(Date);
		expect(deserialized.metadata.publishedAt.toISOString()).toBe(
			publishedAt.toISOString(),
		);
		expect(deserialized.metadata.nested.updatedAt).toBeInstanceOf(Date);
		expect(deserialized.metadata.nested.updatedAt.toISOString()).toBe(
			publishedAt.toISOString(),
		);
	});

	it("should not revive BASE64 wrapper-like objects with extra fields", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			metadata: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.BASE64,
			},
		};

		const deserialized = deserializeProps(
			serializeProps<{ metadata: Record<string, unknown> }>(
				{
					metadata: {
						publishedAt: {
							__forgeframe_wire_type__: "date",
							__forgeframe_wire_value__: "2026-01-02T03:04:05.678Z",
							kind: "metadata",
						},
					},
				},
				definitions,
				bridge,
			) as Record<string, unknown>,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as {
			metadata: {
				publishedAt: Record<string, unknown>;
			};
		};

		expect(deserialized.metadata.publishedAt).toEqual({
			__forgeframe_wire_type__: "date",
			__forgeframe_wire_value__: "2026-01-02T03:04:05.678Z",
			kind: "metadata",
		});
		expect(deserialized.metadata.publishedAt).not.toBeInstanceOf(Date);
	});

	it("should round-trip DOTIFY-serialized nested object props", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			config: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};

		const serialized = serializeProps<{ config: Record<string, unknown> }>(
			{ config: { user: { id: "u_123" }, enabled: true } },
			definitions,
			bridge,
		) as Record<string, unknown>;
		const encoded = serialized.config as {
			__type__: string;
			__value__: string;
		};

		expect(encoded.__type__).toBe("dotify");
		expect(encoded.__value__).toContain("__forgeframe.dotify_path__:");
		expect(encoded.__value__).not.toContain("user.id=");

		const deserialized = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { config: { user: { id: string }; enabled: boolean } };

		expect(deserialized.config).toEqual({
			user: { id: "u_123" },
			enabled: true,
		});
	});

	it("should round-trip DOTIFY-serialized Date values nested in objects", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const publishedAt = new Date("2026-01-02T03:04:05.678Z");
		const definitions = {
			config: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};

		const serialized = serializeProps<{ config: Record<string, unknown> }>(
			{
				config: {
					publishedAt,
					nested: {
						updatedAt: publishedAt,
					},
				},
			},
			definitions,
			bridge,
		) as Record<string, unknown>;

		const deserialized = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { config: { publishedAt: Date; nested: { updatedAt: Date } } };

		expect(deserialized.config.publishedAt).toBeInstanceOf(Date);
		expect(deserialized.config.publishedAt.toISOString()).toBe(
			publishedAt.toISOString(),
		);
		expect(deserialized.config.nested.updatedAt).toBeInstanceOf(Date);
		expect(deserialized.config.nested.updatedAt.toISOString()).toBe(
			publishedAt.toISOString(),
		);
	});

	it("should not revive DOTIFY wrapper-like objects with extra fields", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			config: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};

		const deserialized = deserializeProps(
			serializeProps<{ config: Record<string, unknown> }>(
				{
					config: {
						publishedAt: {
							__forgeframe_wire_type__: "date",
							__forgeframe_wire_value__: "2026-01-02T03:04:05.678Z",
							kind: "metadata",
						},
					},
				},
				definitions,
				bridge,
			) as Record<string, unknown>,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as {
			config: {
				publishedAt: Record<string, unknown>;
			};
		};

		expect(deserialized.config.publishedAt).toEqual({
			__forgeframe_wire_type__: "date",
			__forgeframe_wire_value__: "2026-01-02T03:04:05.678Z",
			kind: "metadata",
		});
		expect(deserialized.config.publishedAt).not.toBeInstanceOf(Date);
	});

	it("should round-trip DOTIFY-serialized nested empty object branches", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			config: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};

		const serialized = serializeProps<{ config: Record<string, unknown> }>(
			{
				config: {
					settings: {
						filters: {},
					},
				},
			},
			definitions,
			bridge,
		) as Record<string, unknown>;

		const deserialized = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { config: { settings: { filters: Record<string, unknown> } } };

		expect(deserialized.config).toEqual({
			settings: {
				filters: {},
			},
		});
	});

	it("should round-trip DOTIFY-serialized empty object branches with sibling values", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			payload: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};

		const serialized = serializeProps<{ payload: Record<string, unknown> }>(
			{
				payload: {
					metadata: {},
					nested: {
						empty: {},
						flag: true,
					},
					version: 2,
				},
			},
			definitions,
			bridge,
		) as Record<string, unknown>;

		const deserialized = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as {
			payload: {
				metadata: Record<string, unknown>;
				nested: { empty: Record<string, unknown>; flag: boolean };
				version: number;
			};
		};

		expect(deserialized.payload).toEqual({
			metadata: {},
			nested: {
				empty: {},
				flag: true,
			},
			version: 2,
		});
	});

	it("should round-trip entirely empty DOTIFY object payloads", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			payload: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};

		const serialized = serializeProps(
			{
				payload: {},
			},
			definitions,
			bridge,
		) as Record<string, unknown>;
		const encoded = serialized.payload as {
			__type__: string;
			__value__: string;
		};

		expect(encoded).toEqual({
			__type__: "dotify",
			__value__: "__forgeframe.dotify_empty_object__",
		});

		const deserialized = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { payload: Record<string, unknown> };

		expect(deserialized.payload).toEqual({});
	});

	it("should preserve real values that serialize to the old empty-object marker shape", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			payload: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};

		class MarkerValue {
			toJSON() {
				return {
					"__forgeframe.dotify_empty_object_marker__": true,
				};
			}
		}

		const serialized = serializeProps<{ payload: Record<string, unknown> }>(
			{
				payload: {
					weird: new MarkerValue(),
				},
			},
			definitions,
			bridge,
		) as Record<string, unknown>;

		const deserialized = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as {
			payload: {
				weird: Record<string, unknown>;
			};
		};

		expect(deserialized.payload.weird).toEqual({
			"__forgeframe.dotify_empty_object_marker__": true,
		});
	});

	it("should omit nested undefined DOTIFY values instead of deserializing them as strings", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			payload: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};

		const serialized = serializeProps<{ payload: Record<string, unknown> }>(
			{
				payload: {
					present: true,
					nested: {
						missing: undefined,
						kept: "value",
					},
				},
			},
			definitions,
			bridge,
		) as Record<string, unknown>;

		const deserialized = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as {
			payload: {
				present: boolean;
				nested: { kept: string; missing?: unknown };
			};
		};

		expect(deserialized.payload).toEqual({
			present: true,
			nested: {
				kept: "value",
			},
		});
		expect("missing" in deserialized.payload.nested).toBe(false);
	});

	it("should round-trip DOTIFY-serialized object props with dotted and reserved keys", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			config: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};

		const serialized = serializeProps<{ config: Record<string, unknown> }>(
			{
				config: {
					"user.id": {
						"plan=tier": "pro",
						"feature&flag": true,
					},
					nested: {
						"literal%key": "preserved",
					},
				},
			},
			definitions,
			bridge,
		) as Record<string, unknown>;
		const encoded = serialized.config as {
			__type__: string;
			__value__: string;
		};

		expect(encoded.__type__).toBe("dotify");
		expect(encoded.__value__).toContain("__forgeframe.dotify_path__:");
		expect(encoded.__value__).not.toContain("user.id=");
		expect(encoded.__value__).not.toContain("feature&flag");

		const deserialized = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as {
			config: {
				"user.id": {
					"plan=tier": string;
					"feature&flag": boolean;
				};
				nested: {
					"literal%key": string;
				};
			};
		};

		expect(deserialized.config).toEqual({
			"user.id": {
				"plan=tier": "pro",
				"feature&flag": true,
			},
			nested: {
				"literal%key": "preserved",
			},
		});
	});

	it("should round-trip keys that look like JSON arrays", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			payload: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};

		const serialized = serializeProps<{ payload: Record<string, unknown> }>(
			{
				payload: {
					'["a"]': "value",
				},
			},
			definitions,
			bridge,
		) as Record<string, unknown>;

		const deserialized = deserializeProps(
			serialized,
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { payload: Record<string, unknown> };

		expect(deserialized.payload).toEqual({
			'["a"]': "value",
		});
	});

	it("should preserve unframed DOTIFY wrappers during deserialization fallback", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			payload: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};
		const legacyWrapper = {
			__type__: "dotify",
			__value__: '["a"]=%22value%22',
		};

		const deserialized = deserializeProps(
			{
				payload: legacyWrapper,
			},
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { payload: unknown };

		expect(deserialized.payload).toEqual(legacyWrapper);
	});

	it("should preserve malformed BASE64 wrappers during deserialization fallback", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			payload: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.BASE64,
			},
		};
		const malformed = { __type__: "base64", __value__: "%not-valid-base64%" };

		const deserialized = deserializeProps(
			{ payload: malformed },
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { payload: unknown };

		expect(deserialized.payload).toEqual(malformed);
	});

	it("should preserve malformed DOTIFY wrappers during deserialization fallback", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			payload: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};
		const malformed = { __type__: "dotify", __value__: "bad=%E0%A4%A" };

		const deserialized = deserializeProps(
			{ payload: malformed },
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { payload: unknown };

		expect(deserialized.payload).toEqual(malformed);
	});

	it("should preserve empty-path DOTIFY wrappers during deserialization fallback", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			payload: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};
		const malformed = {
			__type__: "dotify",
			__value__: "__forgeframe.dotify_path__:%5B%5D=1",
		};

		const deserialized = deserializeProps(
			{ payload: malformed },
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { payload: unknown };

		expect(deserialized.payload).toEqual(malformed);
	});

	it("should preserve malformed empty-object-path DOTIFY wrappers during deserialization fallback", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			payload: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};
		const malformed = {
			__type__: "dotify",
			__value__:
				"__forgeframe.dotify_empty_object_path__:%5B%22payload%22%2C%22empty%22%5D=false",
		};

		const deserialized = deserializeProps(
			{ payload: malformed },
			definitions,
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as { payload: unknown };

		expect(deserialized.payload).toEqual(malformed);
	});

	it("should skip undefined keys while serializing props", () => {
		const { bridge } = createBridgeWithMessenger();
		const serialized = serializeProps<{ defined: string; missing?: string }>(
			{
				defined: "ok",
				missing: undefined,
			},
			{
				defined: prop.string(),
				missing: prop.string().optional(),
			},
			bridge,
		);

		expect(serialized).toEqual({ defined: "ok" });
		expect("missing" in serialized).toBe(false);
	});

	it("should block __proto__ while preserving safe top-level keys during deserialization", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const serialized: SerializedProps = {
			safe: "ok",
			["__proto__"]: "unsafe",
			constructor: "allowed-constructor",
			prototype: "allowed-prototype",
		};

		const deserialized = deserializeProps(
			serialized,
			{ safe: prop.string() },
			messenger,
			bridge,
			window,
			"https://consumer.example.com",
		) as Record<string, unknown>;

		expect(deserialized.safe).toBe("ok");
		expect(Object.getPrototypeOf(deserialized)).toBe(Object.prototype);
		expect(Object.hasOwn(deserialized, "__proto__")).toBe(false);
		expect(Object.hasOwn(deserialized, "constructor")).toBe(true);
		expect(Object.hasOwn(deserialized, "prototype")).toBe(true);
		expect(deserialized.constructor).toBe("allowed-constructor");
		expect(deserialized.prototype).toBe("allowed-prototype");
	});

	it("should block __proto__ DOTIFY paths while preserving constructor/prototype keys", () => {
		const { messenger, bridge } = createBridgeWithMessenger();
		const definitions = {
			payload: {
				schema: prop.object(),
				serialization: PROP_SERIALIZATION.DOTIFY,
			},
		};
		const prototypePollutionKey = "__forgeframe_dotify_polluted__";

		delete (Object.prototype as Record<string, unknown>)[prototypePollutionKey];
		try {
			const deserialized = deserializeProps(
				{
					payload: {
						__type__: "dotify",
						__value__: [
							"__forgeframe.dotify_path__:%5B%22safe%22%2C%22value%22%5D=1",
							`__forgeframe.dotify_path__:%5B%22__proto__%22%2C%22${prototypePollutionKey}%22%5D=true`,
							"__forgeframe.dotify_path__:%5B%22constructor%22%2C%22prototype%22%2C%22version%22%5D=%22v1%22",
						].join("&"),
					},
				},
				definitions,
				messenger,
				bridge,
				window,
				"https://consumer.example.com",
			) as { payload: Record<string, unknown> };

			expect(
				(Object.prototype as Record<string, unknown>)[prototypePollutionKey],
			).toBeUndefined();
			expect(deserialized.payload).toEqual({
				constructor: {
					prototype: {
						version: "v1",
					},
				},
				safe: {
					value: 1,
				},
			});
		} finally {
			delete (Object.prototype as Record<string, unknown>)[
				prototypePollutionKey
			];
		}
	});
});
