import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { create, PROP_SERIALIZATION, prop } from "@/index";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

interface Payload {
	createdAt: Date;
	invalid: Date;
	callback: () => string;
	nested: { value: string };
}

function foreignValues(
	timestamp: string,
	value: string,
): {
	createdAt: Date;
	metadata: Record<string, string>;
	payload: Payload;
} {
	return runInNewContext(`({
		createdAt: new Date(${JSON.stringify(timestamp)}),
		metadata: { label: ${JSON.stringify(value)} },
		payload: {
			createdAt: new Date(${JSON.stringify(timestamp)}),
			invalid: new Date("invalid"),
			callback: () => ${JSON.stringify(value)},
			nested: { value: ${JSON.stringify(value)} }
		}
	})`);
}

describe("Cross-realm prop and export delivery", () => {
	let harness: IframeIntegrationHarness | null = null;
	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
	});
	it.each([PROP_SERIALIZATION.BASE64, PROP_SERIALIZATION.DOTIFY])(
		"delivers captured Date accessors from JSON encoders through %s bootstrap and updates",
		async (serialization) => {
			harness = createIframeIntegrationHarness();
			let reads = 0;
			let encodings = 0;
			const definitions = {
				payload: {
					schema: prop.object<Record<string, unknown>>(),
					serialization,
					hostDecorate: ({ value }: { value: Record<string, unknown> }) => {
						const date = new Date(
							value.stage === "updated" ? "2027-01-01" : "2026-01-01",
						);
						class CustomValue {
							toJSON() {
								encodings++;
								let captured = false;
								return Object.defineProperty({}, "createdAt", {
									enumerable: true,
									get() {
										reads++;
										if (captured) throw new Error("Accessor read twice");
										captured = true;
										return date;
									},
								});
							}
						}
						return { custom: new CustomValue() };
					},
				},
			};
			const Component = create({
				tag: "encoded-accessor-values",
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const instance = Component({ payload: { stage: "initial" } });
			const container = document.createElement("div");
			document.body.append(container);
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			expect(hostProps.payload).toEqual({
				custom: { createdAt: new Date("2026-01-01") },
			});
			expect(reads).toBe(1);
			expect(encodings).toBe(1);
			await instance.updateProps({ payload: { stage: "updated" } });
			expect(hostProps.payload).toEqual({
				custom: { createdAt: new Date("2027-01-01") },
			});
			expect(reads).toBe(2);
			expect(encodings).toBe(2);
		},
	);
	it.each(Object.values(PROP_SERIALIZATION))(
		"preserves null-prototype and shadowed-method arrays through %s bootstrap, updates and exports",
		async (serialization) => {
			harness = createIframeIntegrationHarness();
			const array = (value: string, nullPrototype: boolean): string[] => {
				const values = [value];
				if (nullPrototype) Object.setPrototypeOf(values, null);
				else
					Object.defineProperty(values, "map", {
						value: () => ["corrupted"],
					});
				return values;
			};
			const definitions = {
				payload: { schema: prop.object<{ values: string[] }>(), serialization },
			};
			const Component = create<typeof definitions, { values: string[] }>({
				tag: "array-method-values",
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const instance = Component({
				payload: { values: array("initial", true) },
			});
			const container = document.createElement("div");
			document.body.append(container);
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			expect(hostProps.payload).toEqual({ values: ["initial"] });
			await instance.updateProps({
				payload: { values: array("updated", false) },
			});
			expect(hostProps.payload).toEqual({ values: ["updated"] });
			await hostProps.export({ values: array("exported", true) });
			expect(instance.exports).toEqual({ values: ["exported"] });
			await hostProps.export({ values: array("replaced", false) });
			expect(instance.exports).toEqual({ values: ["replaced"] });
		},
	);

	it.each(Object.values(PROP_SERIALIZATION))(
		"preserves foreign Dates, dictionary values and callbacks through %s bootstrap, updates and exports",
		async (serialization) => {
			harness = createIframeIntegrationHarness();
			const definitions = {
				createdAt: prop.date(),
				metadata: prop.record(prop.string()),
				payload: { schema: prop.object<Payload>(), serialization },
			};
			const Component = create<typeof definitions, { payload: Payload }>({
				tag: "foreign-realm-values",
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const initial = foreignValues("2026-10-01T00:00:00.000Z", "initial");
			expect(initial.createdAt).not.toBeInstanceOf(Date);
			const instance = Component(initial);
			const container = document.createElement("div");
			document.body.append(container);
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			expect(hostProps.createdAt).toBeInstanceOf(Date);
			expect(hostProps.createdAt.toISOString()).toBe(
				"2026-10-01T00:00:00.000Z",
			);
			expect(hostProps.metadata).toEqual({ label: "initial" });
			expect(hostProps.payload.createdAt).toBeInstanceOf(Date);
			expect(hostProps.payload.invalid).toBeInstanceOf(Date);
			expect(Number.isNaN(hostProps.payload.invalid.getTime())).toBe(true);
			expect(hostProps.payload.nested).toEqual({ value: "initial" });
			expect(await hostProps.payload.callback()).toBe("initial");

			await expect(
				instance.updateProps({ createdAt: new Date("invalid") }),
			).rejects.toThrow("Expected valid Date");
			const updated = foreignValues("2026-10-02T00:00:00.000Z", "updated");
			await instance.updateProps(updated);
			expect(hostProps.createdAt.toISOString()).toBe(
				"2026-10-02T00:00:00.000Z",
			);
			expect(hostProps.metadata).toEqual({ label: "updated" });
			expect(hostProps.payload.createdAt).toBeInstanceOf(Date);
			expect(hostProps.payload.createdAt.toISOString()).toBe(
				"2026-10-02T00:00:00.000Z",
			);
			expect(await hostProps.payload.callback()).toBe("updated");
			await hostProps.export({ payload: updated.payload });
			const exports = instance.exports;
			expect(exports?.payload.createdAt).toBeInstanceOf(Date);
			expect(exports?.payload.createdAt.toISOString()).toBe(
				"2026-10-02T00:00:00.000Z",
			);
			expect(Number.isNaN(exports?.payload.invalid.getTime())).toBe(true);
			expect(await exports?.payload.callback()).toBe("updated");
		},
	);
});
