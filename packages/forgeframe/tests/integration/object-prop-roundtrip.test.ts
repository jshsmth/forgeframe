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
