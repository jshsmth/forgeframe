import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { create, prop } from "@/index";
import { forgeFrameError } from "../forgeframe-error";
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

/** `JSON` with native raw JSON, which the TypeScript lib does not declare yet. */
type RawJSONSupport = JSON & { rawJSON(text: string): object };

function hasRawJSON(json: JSON): json is RawJSONSupport {
	return "rawJSON" in json && typeof json.rawJSON === "function";
}

describe("Cross-realm prop and export delivery", () => {
	let harness: IframeIntegrationHarness | null = null;
	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
	});
	it("delivers captured Date accessors from JSON encoders through bootstrap and updates", async () => {
		harness = createIframeIntegrationHarness();
		let reads = 0;
		let encodings = 0;
		const createPayload = (createdAt: string) => {
			const date = new Date(createdAt);
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
		};
		const definitions = { payload: prop.any<Record<string, unknown>>() };
		const Component = create({
			tag: "encoded-accessor-values",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ payload: createPayload("2026-01-01") });
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
		await instance.updateProps({ payload: createPayload("2027-01-01") });
		expect(hostProps.payload).toEqual({
			custom: { createdAt: new Date("2027-01-01") },
		});
		expect(reads).toBe(2);
		expect(encodings).toBe(2);
	});
	it("preserves null-prototype and shadowed-method arrays through bootstrap, updates and exports", async () => {
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
			payload: prop.any<{ values: string[] }>(),
		};
		const Component = create({
			tag: "array-method-values",
			url: "https://host.example.com/widget",
			props: definitions,
			exports: prop.any<{ values: string[] }>(),
		});
		const instance = Component({
			payload: { values: array("initial", true) },
		});
		const container = document.createElement("div");
		document.body.append(container);
		const rendering = instance.render(container);
		const { host, hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.payload).toEqual({ values: ["initial"] });
		await instance.updateProps({
			payload: { values: array("updated", false) },
		});
		expect(hostProps.payload).toEqual({ values: ["updated"] });
		await host.export({ values: array("exported", true) });
		expect(instance.exports).toEqual({ values: ["exported"] });
		await host.export({ values: array("replaced", false) });
		expect(instance.exports).toEqual({ values: ["replaced"] });
	});

	it("preserves foreign Dates, dictionary values and callbacks through bootstrap, updates and exports", async () => {
		harness = createIframeIntegrationHarness();
		const definitions = {
			createdAt: prop.date(),
			metadata: prop.record(prop.string()),
			payload: prop.any<Payload>(),
		};
		const Component = create({
			tag: "foreign-realm-values",
			url: "https://host.example.com/widget",
			props: definitions,
			exports: prop.object({ payload: prop.any<Payload>() }),
		});
		const initial = foreignValues("2026-10-01T00:00:00.000Z", "initial");
		expect(initial.createdAt).not.toBeInstanceOf(Date);
		const instance = Component(initial);
		const container = document.createElement("div");
		document.body.append(container);
		const rendering = instance.render(container);
		const { host, hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.createdAt).toBeInstanceOf(Date);
		expect(hostProps.createdAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
		expect(hostProps.metadata).toEqual({ label: "initial" });
		expect(hostProps.payload.createdAt).toBeInstanceOf(Date);
		expect(hostProps.payload.invalid).toBeInstanceOf(Date);
		expect(Number.isNaN(hostProps.payload.invalid.getTime())).toBe(true);
		expect(hostProps.payload.nested).toEqual({ value: "initial" });
		expect(await hostProps.payload.callback()).toBe("initial");

		await expect(
			instance.updateProps({ createdAt: new Date("invalid") }),
		).rejects.toThrow(forgeFrameError("VALIDATION", "Expected valid Date"));
		const updated = foreignValues("2026-10-02T00:00:00.000Z", "updated");
		await instance.updateProps(updated);
		expect(hostProps.createdAt.toISOString()).toBe("2026-10-02T00:00:00.000Z");
		expect(hostProps.metadata).toEqual({ label: "updated" });
		expect(hostProps.payload.createdAt).toBeInstanceOf(Date);
		expect(hostProps.payload.createdAt.toISOString()).toBe(
			"2026-10-02T00:00:00.000Z",
		);
		expect(await hostProps.payload.callback()).toBe("updated");
		await host.export({ payload: updated.payload });
		const exports = instance.exports;
		expect(exports?.payload.createdAt).toBeInstanceOf(Date);
		expect(exports?.payload.createdAt.toISOString()).toBe(
			"2026-10-02T00:00:00.000Z",
		);
		expect(Number.isNaN(exports?.payload.invalid.getTime())).toBe(true);
		expect(await exports?.payload.callback()).toBe("updated");
	});

	it("delivers native and foreign raw JSON as the values their text represents", async () => {
		harness = createIframeIntegrationHarness();
		const hostJSON = harness.hostWindow.JSON;
		if (!hasRawJSON(JSON) || !hasRawJSON(hostJSON)) {
			throw new Error("The test runtime must support native raw JSON");
		}
		const { rawJSON } = JSON;
		const rawValues = (label: string): object[] => [
			...runInNewContext(
				`[JSON.rawJSON("42"), JSON.rawJSON("true"), JSON.rawJSON(${JSON.stringify(JSON.stringify(label))})]`,
			),
			rawJSON("null"),
		];
		let encodings = 0;
		class RawValues {
			constructor(private readonly label: string) {}
			toJSON() {
				encodings++;
				return { values: rawValues(this.label) };
			}
		}
		const definitions = { custom: prop.any(), nested: prop.any() };
		const Component = create({
			tag: "raw-json-values",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({
			custom: new RawValues("initial"),
			nested: { count: rawJSON("1"), label: rawJSON('"initial"') },
		});
		const container = document.createElement("div");
		document.body.append(container);
		const rendering = instance.render(container);
		const { host, hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.custom).toEqual({ values: [42, true, "initial", null] });
		expect(hostProps.nested).toEqual({ count: 1, label: "initial" });
		expect(encodings).toBe(1);

		await instance.updateProps({
			custom: new RawValues("updated"),
			nested: { count: rawJSON("2"), label: rawJSON('"updated"') },
		});
		expect(hostProps.custom).toEqual({ values: [42, true, "updated", null] });
		expect(hostProps.nested).toEqual({ count: 2, label: "updated" });
		expect(encodings).toBe(2);

		const hostRawValue = hostJSON.rawJSON("3");
		await harness.withHostGlobalsAsync(() =>
			host.export({
				custom: new RawValues("exported"),
				nested: [hostRawValue, rawJSON("4")],
			}),
		);
		expect(instance.exports).toEqual({
			custom: { values: [42, true, "exported", null] },
			nested: [3, 4],
		});
	});
});
