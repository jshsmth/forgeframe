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
		{ serialization: PROP_SERIALIZATION.BASE64, nested: false },
		{ serialization: PROP_SERIALIZATION.BASE64, nested: true },
		{ serialization: PROP_SERIALIZATION.DOTIFY, nested: true },
	])("$serialization / nested=$nested", ({ serialization, nested }) => {
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
				const makeRecord = () =>
					kind === "convert"
						? {
								...expected,
								__type__: {
									toJSON: () => {
										encoderCalls++;
										return "function";
									},
								},
							}
						: {
								...expected,
								extra: {
									toJSON: () => {
										encoderCalls++;
										return undefined;
									},
								},
							};
				const wrap = (record: unknown) =>
					nested ? { items: [record] } : record;
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
