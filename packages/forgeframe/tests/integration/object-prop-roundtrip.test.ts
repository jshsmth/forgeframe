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
		])("preserves user fields on a $__type__-shaped object", async (record) => {
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
		});
	});
});
