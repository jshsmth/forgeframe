import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { create, prop } from "@/index";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

describe("Ordinary object prop round trips", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
	});

	it("omits roots whose JSON encoder returns undefined during bootstrap and updates", async () => {
		harness = createIframeIntegrationHarness();
		let calls = 0;
		class OmittedValue {
			[key: string]: unknown;
			toJSON() {
				calls++;
				return undefined;
			}
		}
		const definitions = {
			record: prop.any<Record<string, unknown>>().optional(),
		};
		const Component = create({
			tag: "omitted-encoded-root",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const container = document.createElement("div");
		document.body.append(container);
		const instance = Component({ record: new OmittedValue() });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.record).toBeUndefined();
		expect(calls).toBe(1);
		await instance.updateProps({ record: { value: "visible" } });
		expect(hostProps.record).toEqual({ value: "visible" });
		await instance.updateProps({ record: new OmittedValue() });
		expect(hostProps.record).toBeUndefined();
		expect(Object.hasOwn(hostProps, "record")).toBe(false);
		expect(calls).toBe(2);
	});

	it.each([
		{
			__type__: "function",
			__id__: "ordinary-id",
			__name__: "ordinary-name",
		},
		{
			__forgeframe_wire_type__: "date",
			__forgeframe_wire_value__: "2026-01-01T00:00:00.000Z",
		},
	])(
		"preserves ordinary marker records when JSON drops symbol metadata: %j",
		async (expected) => {
			harness = createIframeIntegrationHarness();
			const container = document.createElement("div");
			document.body.append(container);
			const definitions = {
				record: prop.any<Record<string, unknown>>(),
			};
			const Component = create({
				tag: "symbol-marker-record",
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const record = { ...expected, metadata: Symbol("local metadata") };
			const instance = Component({ record });
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			expect(hostProps.record).toEqual(expected);
			await instance.updateProps({ record: { nested: record } });
			expect(hostProps.record).toEqual({ nested: expected });
			await hostProps.export({ record });
			expect(instance.exports).toEqual({ record: expected });
		},
	);

	it.each([
		{
			__type__: "function",
			__id__: "ordinary-id",
			__name__: "ordinary-name",
		},
		{
			__type__: "function",
			__id__: "ordinary-id",
			__name__: "ordinary-name",
			optional: undefined,
		},
		{
			__forgeframe_wire_type__: "date",
			__forgeframe_wire_value__: "2026-01-01T00:00:00.000Z",
		},
		{
			__forgeframe_wire_type__: "date",
			__forgeframe_wire_value__: null,
			optional: undefined,
		},
		{
			__type__: "base64",
			__value__: "JTdCJTIyZGVjb2RlZCUyMiUzQXRydWUlN0Q=",
			optional: undefined,
		},
		{ __type__: "dotify", __value__: "", optional: undefined },
		{
			__forgeframe_wire_type__: "record",
			__forgeframe_wire_value__: {
				__type__: "function",
				__id__: "nested-id",
				__name__: "nested-name",
			},
		},
		{
			__type__: "base64",
			__value__: "JTdCJTIyZGVjb2RlZCUyMiUzQXRydWUlN0Q=",
			kind: "ordinary user data",
		},
		{ __type__: "dotify", __value__: "", kind: "ordinary user data" },
		{
			__type__: "function",
			__id__: "ordinary-record-id",
			__name__: "ordinary-record-name",
			kind: "ordinary user data",
		},
	])("preserves user fields on a marker-shaped object: %j", async (record) => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = {
			record: prop.any<Record<string, unknown>>(),
		};
		const Component = create({
			tag: "ordinary-object-roundtrip",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ record });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.record).toEqual(record);
		const updated = { ...record, kind: "updated user data" };
		await instance.updateProps({ record: updated });
		expect(hostProps.record).toEqual(updated);
		await instance.updateProps({
			record: { nested: record, records: [record] },
		});
		expect(hostProps.record).toEqual({ nested: record, records: [record] });
		await hostProps.export({ record });
		expect(instance.exports).toEqual({ record });
	});
	it.each([
		[
			"native",
			(text: string): object => {
				const { rawJSON } = JSON as unknown as {
					rawJSON?: (text: string) => object;
				};
				if (typeof rawJSON !== "function") {
					throw new Error("The test runtime must support native raw JSON");
				}
				return rawJSON(text);
			},
		],
		[
			"foreign",
			(text: string): object =>
				runInNewContext(`JSON.rawJSON(${JSON.stringify(text)})`),
		],
	])(
		"escapes records whose marker fields are %s raw JSON through bootstrap, updates and exports",
		async (_realm, raw) => {
			harness = createIframeIntegrationHarness();
			const container = document.createElement("div");
			document.body.append(container);
			const definitions = { record: prop.any<Record<string, unknown>>() };
			const Component = create({
				tag: "raw-json-marker-record",
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const records = () => ({
				callback: {
					__type__: raw('"function"'),
					__id__: "ordinary-id",
					__name__: "ordinary-name",
				},
				date: {
					__forgeframe_wire_type__: raw('"date"'),
					__forgeframe_wire_value__: "2026-01-01T00:00:00.000Z",
				},
				escaped: {
					__forgeframe_wire_type__: raw('"record"'),
					__forgeframe_wire_value__: { kept: true },
				},
			});
			const expected = {
				callback: {
					__type__: "function",
					__id__: "ordinary-id",
					__name__: "ordinary-name",
				},
				date: {
					__forgeframe_wire_type__: "date",
					__forgeframe_wire_value__: "2026-01-01T00:00:00.000Z",
				},
				escaped: {
					__forgeframe_wire_type__: "record",
					__forgeframe_wire_value__: { kept: true },
				},
			};
			const instance = Component({ record: records() });
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			expect(hostProps.record).toEqual(expected);
			await instance.updateProps({ record: { nested: records() } });
			expect(hostProps.record).toEqual({ nested: expected });
			await hostProps.export({ record: records() });
			expect(instance.exports).toEqual({ record: expected });
		},
	);

	describe.each(["root", "object", "array"])("shape=%s", (shape) => {
		it.each(["convert", "omit"])(
			"escapes a record after custom encoders %s its marker shape",
			async (kind) => {
				harness = createIframeIntegrationHarness();
				const container = document.createElement("div");
				document.body.append(container);
				let encoderCalls = 0;
				const expected = {
					__type__: "function",
					__id__: "ordinary",
					__name__: "ordinary",
				};
				class EncodedLeaf {
					toJSON() {
						encoderCalls++;
						return kind === "convert" ? "function" : undefined;
					}
				}
				const makeRecord = () =>
					kind === "convert"
						? { ...expected, __type__: new EncodedLeaf() }
						: { ...expected, extra: new EncodedLeaf() };
				const wrap = (record: unknown) => {
					if (shape === "array") return { items: [record] };
					if (shape === "object") return { nested: record };
					return record;
				};
				const definitions = {
					record: prop.any<Record<string, unknown>>(),
				};
				const Component = create({
					tag: "encoded-marker-record",
					url: "https://host.example.com/widget",
					props: definitions,
				});
				const instance = Component({
					record: wrap(makeRecord()) as Record<string, unknown>,
				});
				const rendering = instance.render(container);
				const { hostProps } = await harness.bootstrapIframeHost(
					container,
					definitions,
				);
				await rendering;
				expect(hostProps.record).toEqual(wrap(expected));
				expect(encoderCalls).toBe(1);
				await instance.updateProps({
					record: wrap(makeRecord()) as Record<string, unknown>,
				});
				expect(hostProps.record).toEqual(wrap(expected));
				expect(encoderCalls).toBe(2);
			},
		);
	});
});

describe("JSON encoder conversion", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	class Session {
		constructor(
			readonly userId: string,
			readonly refreshToken: string,
		) {}
		toJSON(key: string) {
			keys.push(key);
			return { userId: this.userId };
		}
	}
	const keys: string[] = [];

	it("delivers only toJSON() output for class instances in props at bootstrap and update", async () => {
		harness = createIframeIntegrationHarness();
		keys.length = 0;
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = {
			session: prop.any(),
			nested: prop.any(),
		};
		const Component = create({
			tag: "tojson-class",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({
			session: new Session("user-1", "secret-1"),
			nested: { session: new Session("user-2", "secret-2") },
		});
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;

		expect(hostProps.session).toEqual({ userId: "user-1" });
		expect(hostProps.nested).toEqual({ session: { userId: "user-2" } });
		expect(keys).toEqual(["", "session"]);

		await instance.updateProps({
			session: new Session("user-3", "secret-3"),
		});
		expect(hostProps.session).toEqual({ userId: "user-3" });
		expect(JSON.stringify(hostProps)).not.toContain("secret");
	});

	it("converts URLs and boxed primitives in JSON props as native JSON does", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = {
			link: prop.any(),
			values: prop.any(),
		};
		const Component = create({
			tag: "tojson-native-values",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({
			link: new URL("https://example.com/path?q=1"),
			values: {
				text: new String("ab"),
				count: new Number(2),
				flag: new Boolean(false),
				items: [new String("c")],
			},
		});
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;

		expect(hostProps.link).toBe("https://example.com/path?q=1");
		expect(hostProps.values).toEqual({
			text: "ab",
			count: 2,
			flag: false,
			items: ["c"],
		});
	});

	it("encodes ordinary records without unrelated primitive coercion", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = { payload: prop.any<Record<string, unknown>>() };
		const Component = create({
			tag: "ordinary-record-coercion",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const records = (label: string) => ({
			records: [
				{ id: 1, label },
				{ id: 2, label: `${label} again` },
			],
		});
		const instance = Component({ payload: records("initial") });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.payload).toEqual(records("initial"));

		const probes = [
			vi.spyOn(Number.prototype, "valueOf"),
			vi.spyOn(String.prototype, "valueOf"),
			vi.spyOn(Boolean.prototype, "valueOf"),
			vi.spyOn(BigInt.prototype, "valueOf"),
		];
		await instance.updateProps({ payload: records("updated") });
		for (const probe of probes) expect(probe).not.toHaveBeenCalled();
		expect(hostProps.payload).toEqual(records("updated"));
	});

	it("keeps encoder receivers and reads encoded accessors and Dates once at bootstrap and update", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const date = new Date("2026-01-02T03:04:05.678Z");
		const dateEncoder = vi.spyOn(date, "toJSON");
		let reads = 0;
		let encodings = 0;
		class CustomValue {
			#label: string;
			constructor(label: string) {
				this.#label = label;
			}
			toJSON() {
				encodings++;
				const items: unknown[] = [];
				Object.defineProperty(items, "0", {
					enumerable: true,
					get() {
						reads++;
						return date;
					},
				});
				Object.freeze(items);
				const symbol = Object(Symbol("boxed"));
				Object.defineProperty(symbol, "date", {
					enumerable: true,
					value: date,
				});
				const label = this.#label;
				return {
					label,
					items,
					pair: { toJSON: () => [label, () => label] },
					callback: () => label,
					number: Object(7),
					string: Object("boxed"),
					boolean: Object(false),
					symbol,
				};
			}
		}
		const definitions = { custom: prop.any() };
		const Component = create({
			tag: "tojson-receivers-and-accessors",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const delivered = (label: string) => ({
			label,
			items: [date],
			pair: [label, expect.any(Function)],
			callback: expect.any(Function),
			number: 7,
			string: "boxed",
			boolean: false,
			symbol: { date },
		});
		const instance = Component({ custom: new CustomValue("initial") });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		const custom = () =>
			hostProps.custom as {
				callback: () => Promise<string>;
				pair: [string, () => Promise<string>];
			};
		expect(hostProps.custom).toEqual(delivered("initial"));
		expect(reads).toBe(1);
		expect(encodings).toBe(1);
		expect(dateEncoder).toHaveBeenCalledTimes(2);
		await expect(custom().callback()).resolves.toBe("initial");
		await expect(custom().pair[1]()).resolves.toBe("initial");

		await instance.updateProps({ custom: new CustomValue("updated") });
		expect(hostProps.custom).toEqual(delivered("updated"));
		expect(reads).toBe(2);
		expect(encodings).toBe(2);
		expect(dateEncoder).toHaveBeenCalledTimes(4);
		await expect(custom().callback()).resolves.toBe("updated");
		await expect(custom().pair[1]()).resolves.toBe("updated");
	});

	it("rejects cyclic encoder results and boxed BigInts while host props stay unchanged", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = { payload: prop.any() };
		const Component = create({
			tag: "tojson-rejected-values",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ payload: { stage: "initial" } });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		class CyclicValue {
			toJSON() {
				return cyclic;
			}
		}

		await expect(
			instance.updateProps({ payload: { custom: new CyclicValue() } }),
		).rejects.toThrow("Circular reference detected");
		await expect(
			instance.updateProps({ payload: { custom: Object(1n) } }),
		).rejects.toThrow(TypeError);
		expect(hostProps.payload).toEqual({ stage: "initial" });
		await instance.updateProps({ payload: { stage: "recovered" } });
		expect(hostProps.payload).toEqual({ stage: "recovered" });
	});

	it("delivers a boxed primitive whose prototype was removed as an ordinary record", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		// Native JSON would unbox it to 9; the bridge treats null-prototype
		// objects as records and sends their own fields.
		const boxed = (label: string) => {
			const value = Object(9);
			Object.setPrototypeOf(value, null);
			value.label = label;
			return value;
		};
		const definitions = { payload: prop.any() };
		const Component = create({
			tag: "null-prototype-boxed-primitive",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ payload: { boxed: boxed("initial") } });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.payload).toEqual({ boxed: { label: "initial" } });
		await instance.updateProps({ payload: { boxed: boxed("updated") } });
		expect(hostProps.payload).toEqual({ boxed: { label: "updated" } });
	});

	it("delivers only toJSON() output for class instances in host exports", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const Component = create({
			tag: "tojson-host-export",
			url: "https://host.example.com/widget",
		});
		const instance = Component();
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(container);
		await rendering;

		await harness.withHostGlobalsAsync(() =>
			hostProps.export({ session: new Session("user-4", "secret-4") }),
		);
		expect(instance.exports).toEqual({ session: { userId: "user-4" } });
	});
});
