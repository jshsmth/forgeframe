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
