import { afterEach, describe, expect, it } from "vitest";
import { create, PROP_SERIALIZATION, prop } from "@/index";
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

	it("omits BASE64 roots whose JSON encoder returns undefined during bootstrap and updates", async () => {
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
			record: {
				schema: prop.object().optional(),
				serialization: PROP_SERIALIZATION.BASE64,
			},
		};
		const Component = create({
			tag: "omitted-base64-root",
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

	describe.each([
		PROP_SERIALIZATION.JSON,
		PROP_SERIALIZATION.BASE64,
		PROP_SERIALIZATION.DOTIFY,
	])("%s serialization", (serialization) => {
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
					record: {
						schema: prop.object<Record<string, unknown>>(),
						serialization,
					},
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
		])(
			"preserves user fields on a marker-shaped object: %j",
			async (record) => {
				harness = createIframeIntegrationHarness();
				const container = document.createElement("div");
				document.body.append(container);
				const definitions = {
					record: {
						schema: prop.object<Record<string, unknown>>(),
						serialization,
					},
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
			},
		);
	});
	describe.each([
		{ serialization: PROP_SERIALIZATION.BASE64, shape: "root" },
		{ serialization: PROP_SERIALIZATION.BASE64, shape: "array" },
		{ serialization: PROP_SERIALIZATION.DOTIFY, shape: "root" },
		{ serialization: PROP_SERIALIZATION.DOTIFY, shape: "object" },
		{ serialization: PROP_SERIALIZATION.DOTIFY, shape: "array" },
	])("$serialization / shape=$shape", ({ serialization, shape }) => {
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
					record: {
						schema: prop.object<Record<string, unknown>>(),
						serialization,
					},
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

	// DOTIFY walks a root's own fields by design and converts only its leaves.
	it.each([PROP_SERIALIZATION.JSON, PROP_SERIALIZATION.BASE64])(
		"delivers only toJSON() output for class instances in %s props at bootstrap and update",
		async (serialization) => {
			harness = createIframeIntegrationHarness();
			keys.length = 0;
			const container = document.createElement("div");
			document.body.append(container);
			const definitions = {
				session: { schema: prop.any(), serialization },
				nested: { schema: prop.any(), serialization },
			};
			const Component = create({
				tag: `tojson-class-${serialization}`,
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
		},
	);

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
