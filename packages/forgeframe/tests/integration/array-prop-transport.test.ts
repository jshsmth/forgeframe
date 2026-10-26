import { afterEach, describe, expect, it } from "vitest";
import { create, prop } from "@/index";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

describe("Array prop transport", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
	});

	it("ignores arrays in JSON fields discarded by the prototype-safety filter", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = { record: prop.any<Record<string, unknown>>() };
		const Component = create({
			tag: "filtered-array-transport",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({
			record: { safe: "initial", ["__proto__"]: [undefined] },
		});
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.record).toEqual({ safe: "initial" });
		await instance.updateProps({
			record: { safe: "updated", ["__proto__"]: [undefined] },
		});
		expect(hostProps.record).toEqual({ safe: "updated" });
	});

	it.each(["original", "redirected"])(
		"uses the verified host delivery policy for %s-only arrays after a redirect",
		async (allowedOrigin) => {
			const original = "https://host.example.com";
			const redirected = "https://redirected.example.com";
			harness = createIframeIntegrationHarness({
				hostUrl: `${redirected}/widget`,
			});
			const container = document.createElement("div");
			document.body.append(container);
			const definitions = {
				visible: prop.string(),
				restricted: {
					schema: prop.array(prop.string().optional()),
					deliverTo: [allowedOrigin === "original" ? original : redirected],
				},
			};
			const Component = create({
				tag: "redirect-array-transport",
				url: `${original}/redirect`,
				hostOrigins: [original, redirected],
				props: definitions,
			});
			const instance = Component({
				visible: "initial",
				restricted: ["initial"],
			});
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			const update = instance.updateProps({
				visible: "updated",
				restricted: [undefined],
			});
			if (allowedOrigin === "original") {
				await expect(update).resolves.toBeUndefined();
				expect(hostProps.visible).toBe("updated");
				expect(hostProps).not.toHaveProperty("restricted");
			} else {
				await expect(update).rejects.toThrow(
					"Cannot serialize undefined array entry",
				);
				expect(hostProps.visible).toBe("initial");
				// A follow-up unrelated patch proves the rejected candidate did not commit.
				await instance.updateProps({ visible: "recovered" });
				expect(hostProps.restricted).toEqual(["initial"]);
				expect(hostProps.visible).toBe("recovered");
			}
		},
	);

	it.each(["render", "update"])(
		"ignores an array's toJSON() and checks its entries before %s admission",
		async (action) => {
			harness = createIframeIntegrationHarness();
			const container = document.createElement("div");
			document.body.append(container);
			let encoderCalls = 0;
			const encodedArray = (entries: (string | undefined)[]) =>
				Object.assign(entries, {
					toJSON: () => {
						encoderCalls++;
						return ["encoded"];
					},
				});
			const valid = () => ({ items: encodedArray(["initial"]) });
			const invalid = () => ({ items: encodedArray([undefined]) });
			const definitions = { record: prop.any<Record<string, unknown>>() };
			const Component = create({
				tag: "array-tojson-admission",
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const instance = Component({
				record: action === "render" ? invalid() : valid(),
			});
			if (action === "render") {
				await expect(instance.render(container)).rejects.toThrow(
					"Cannot serialize undefined array entry",
				);
				expect(container.children).toHaveLength(0);
				await instance.updateProps({ record: valid() });
			} else {
				await expect(
					instance.updateProps({ record: invalid() }),
				).rejects.toThrow("Cannot serialize undefined array entry");
				await instance.updateProps({});
			}
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			expect(hostProps.record).toEqual({ items: ["initial"] });
			expect(encoderCalls).toBe(0);
		},
	);

	it.each(["undefined", "hole"])(
		"rejects an %s array entry before opening the host and permits a corrected render",
		async (kind) => {
			harness = createIframeIntegrationHarness();
			const container = document.createElement("div");
			document.body.append(container);
			const definitions = {
				items: prop.array(prop.string().optional()),
			};
			const Component = create({
				tag: "array-transport-admission",
				url: "https://host.example.com/widget",
				props: definitions,
				initTimeout: 100,
			});
			const instance = Component({
				items: kind === "hole" ? new Array<string | undefined>(1) : [undefined],
			});
			await expect(instance.render(container)).rejects.toThrow(
				"Cannot serialize undefined array entry",
			);
			expect(container.children).toHaveLength(0);
			await instance.updateProps({ items: ["corrected"] });
			const rendering = instance.render(container);
			const { hostProps } = await harness.bootstrapIframeHost(
				container,
				definitions,
			);
			await rendering;
			expect(hostProps.items).toEqual(["corrected"]);
		},
	);

	it("rejects an undefined array update before committing and recovers on the next update", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = {
			items: prop.array(prop.string().optional()),
		};
		const Component = create({
			tag: "array-transport-update",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ items: ["initial"] });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		await expect(instance.updateProps({ items: [undefined] })).rejects.toThrow(
			"Cannot serialize undefined array entry",
		);
		expect(hostProps.items).toEqual(["initial"]);
		await instance.updateProps({});
		expect(hostProps.items).toEqual(["initial"]);
		await instance.updateProps({ items: ["recovered"] });
		expect(hostProps.items).toEqual(["recovered"]);
	});

	it("delivers nullable entries and item defaults after normalization", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = {
			items: prop.array(prop.string().default("fallback")),
			nullable: prop.array(prop.string().nullable()),
		};
		const Component = create({
			tag: "array-transport-defaults",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ items: [undefined], nullable: [null] });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.items).toEqual(["fallback"]);
		expect(hostProps.nullable).toEqual([null]);
		await instance.updateProps({
			items: ["updated", undefined],
			nullable: ["updated", null],
		});
		expect(hostProps.items).toEqual(["updated", "fallback"]);
		expect(hostProps.nullable).toEqual(["updated", null]);
	});

	it("rejects undefined entries nested in objects without changing the host snapshot", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = {
			record: prop.object({ items: prop.array(prop.string().optional()) }),
		};
		const Component = create({
			tag: "array-transport-nested",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ record: { items: ["initial"] } });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		await expect(
			instance.updateProps({ record: { items: [undefined] } }),
		).rejects.toThrow('at ["record","items","0"]');
		await instance.updateProps({});
		expect(hostProps.record).toEqual({ items: ["initial"] });
	});

	it("allows undefined array entries in props excluded by delivery policy", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const schema = prop.array(prop.string().optional()).optional();
		const definitions = {
			visible: prop.string(),
			local: { schema, sendToHost: false },
			sameOrigin: { schema, deliverTo: "same-origin" },
			restricted: { schema, deliverTo: ["https://other.example.com"] },
		};
		const Component = create({
			tag: "array-transport-private",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({
			visible: "initial",
			local: [undefined],
			sameOrigin: [undefined],
			restricted: [undefined],
		});
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		await instance.updateProps({
			visible: "updated",
			local: [undefined],
			sameOrigin: [undefined],
			restricted: [undefined],
		});
		expect(hostProps.visible).toBe("updated");
		expect(hostProps).not.toHaveProperty("local");
		expect(hostProps).not.toHaveProperty("sameOrigin");
		expect(hostProps).not.toHaveProperty("restricted");
	});

	it("applies a record's toJSON() before checking the arrays it returns", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = { record: prop.any<Record<string, unknown>>() };
		const Component = create({
			tag: "array-transport-tojson",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({
			record: { items: [undefined], toJSON: () => ({ items: ["encoded"] }) },
		});
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		expect(hostProps.record).toEqual({ items: ["encoded"] });
		await expect(
			instance.updateProps({
				record: { toJSON: () => ({ items: [undefined] }) },
			}),
		).rejects.toThrow("Cannot serialize undefined array entry");
		expect(hostProps.record).toEqual({ items: ["encoded"] });
		await instance.updateProps({
			record: { toJSON: () => ({ items: ["recovered"] }) },
		});
		expect(hostProps.record).toEqual({ items: ["recovered"] });
	});

	it("rejects ordinary arrays before commitment despite a non-callable toJSON field", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = { record: prop.any<Record<string, unknown>>() };
		const Component = create({
			tag: "array-transport-tojson-field",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ record: { items: ["initial"] } });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		await expect(
			instance.updateProps({
				record: { items: [undefined], toJSON: "ordinary field" },
			}),
		).rejects.toThrow('at ["record","items","0"]');
		await instance.updateProps({});
		expect(hostProps.record).toEqual({ items: ["initial"] });
	});

	it("reads a computed toJSON once, at delivery rather than admission", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		let reads = 0;
		const record = Object.defineProperty({ items: [undefined] }, "toJSON", {
			get: () => {
				reads++;
				return () => ({ items: ["encoded"] });
			},
		});
		const definitions = { record: prop.any<Record<string, unknown>>() };
		const Component = create({
			tag: "array-transport-computed-encoder",
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
		expect(hostProps.record).toEqual({ items: ["encoded"] });
		expect(reads).toBe(1);
	});

	it("checks setter-only toJSON fields before committing updates", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = { record: prop.any<Record<string, unknown>>() };
		const Component = create({
			tag: "array-transport-setter-only",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ record: { items: ["initial"] } });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		const record = Object.defineProperty({ items: [undefined] }, "toJSON", {
			set: () => {
				throw new Error("unexpected setter");
			},
		});
		await expect(instance.updateProps({ record })).rejects.toThrow(
			'at ["record","items","0"]',
		);
		await instance.updateProps({});
		expect(hostProps.record).toEqual({ items: ["initial"] });
	});

	it("rejects undefined exported array entries without replacing acknowledged exports", async () => {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const definitions = { label: prop.string() };
		const Component = create({
			tag: "array-transport-exports",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({ label: "initial" });
		const rendering = instance.render(container);
		const { hostProps } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await rendering;
		await harness.withHostGlobalsAsync(() =>
			hostProps.export({ items: ["initial"] }),
		);
		await expect(
			harness.withHostGlobalsAsync(() =>
				hostProps.export({ items: [undefined] }),
			),
		).rejects.toThrow("Cannot serialize undefined array entry");
		expect(instance.exports).toEqual({ items: ["initial"] });
		await harness.withHostGlobalsAsync(() =>
			hostProps.export({ items: ["recovered"] }),
		);
		expect(instance.exports).toEqual({ items: ["recovered"] });
	});
});
