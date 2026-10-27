/**
 * Integration tests for the component `exports` schema.
 *
 * Drives two windows through the public API: the consumer validates every
 * export before replacing `instance.exports`, and a host started from the
 * component checks its exports before sending them.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { create, prop, type StandardSchemaV1 } from "@/index";
import { forgeFrameError } from "../forgeframe-error";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

const HOST_URL = "https://host.example.com/widget";

describe("Exports schema integration", () => {
	let harness: IframeIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	/**
	 * Renders a component and starts its host from the component, or in the
	 * tag-agnostic form, which has no exports schema.
	 */
	async function renderWithHost(
		tag: string,
		exports: StandardSchemaV1 | undefined,
		hostForm: "component" | "tag-agnostic",
	) {
		harness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.append(container);
		const Component = create({ tag, url: HOST_URL, exports });
		const instance = Component();
		const errors: Error[] = [];
		instance.event.on("error", (error) => {
			errors.push(error);
		});
		const rendering = instance.render(container);
		const { host } =
			hostForm === "component"
				? await harness.bootstrapIframeHost(container, Component)
				: await harness.bootstrapIframeHost(container, {});
		await rendering;
		return { instance, host, errors, activeHarness: harness };
	}

	it.each(["tag-agnostic", "component"] as const)(
		"stores valid exports and keeps exported methods callable (%s host)",
		async (hostForm) => {
			const { instance, host, errors, activeHarness } = await renderWithHost(
				`exports-schema-valid-${hostForm}`,
				prop.object({
					ready: prop.boolean(),
					total: prop.function<() => number>(),
					createdAt: prop.date(),
				}),
				hostForm,
			);
			await activeHarness.withHostGlobalsAsync(() =>
				host.export({
					ready: true,
					total: () => 42,
					createdAt: new Date("2026-10-26T00:00:00.000Z"),
				}),
			);
			const exports = instance.exports as {
				ready: boolean;
				total: () => Promise<number>;
				createdAt: Date;
			};
			expect(exports.ready).toBe(true);
			expect(exports.createdAt).toBeInstanceOf(Date);
			await expect(exports.total()).resolves.toBe(42);
			expect(errors).toEqual([]);
		},
	);

	it("rejects invalid exports, keeps the previous exports and emits one error", async () => {
		const { instance, host, errors, activeHarness } = await renderWithHost(
			"exports-schema-invalid",
			prop.object({ ready: prop.boolean() }),
			"tag-agnostic",
		);
		const exported: unknown[] = [];
		instance.event.on("exports", (exports) => {
			exported.push(exports);
		});
		await activeHarness.withHostGlobalsAsync(() =>
			host.export({ ready: true }),
		);
		const previous = instance.exports;
		await expect(
			activeHarness.withHostGlobalsAsync(() => host.export({ ready: "yes" })),
		).rejects.toThrow(
			forgeFrameError("VALIDATION", "Validation failed: exports.ready"),
		);
		expect(instance.exports).toBe(previous);
		expect(instance.exports).toEqual({ ready: true });
		expect(exported).toHaveLength(1);
		expect(errors).toHaveLength(1);
		expect(errors[0]?.message).toContain("Validation failed: exports.ready");
	});

	it("rejects exports that a transforming schema would change", async () => {
		const { instance, host, errors, activeHarness } = await renderWithHost(
			"exports-schema-transform",
			z.object({ label: z.string().transform((value) => value.trim()) }),
			"tag-agnostic",
		);
		await expect(
			activeHarness.withHostGlobalsAsync(() =>
				host.export({ label: " padded " }),
			),
		).rejects.toThrow(
			forgeFrameError(
				"VALIDATION",
				"Validation failed: exports: the exports schema must return the exported value unchanged",
			),
		);
		expect(instance.exports).toBeUndefined();
		expect(errors).toHaveLength(1);
		await activeHarness.withHostGlobalsAsync(() =>
			host.export({ label: "trimmed" }),
		);
		expect(instance.exports).toEqual({ label: "trimmed" });
	});

	it("rejects invalid exports locally on a host started from the component", async () => {
		const { instance, host, errors, activeHarness } = await renderWithHost(
			"exports-schema-host-check",
			prop.object({ ready: prop.boolean() }),
			"component",
		);
		await expect(
			activeHarness.withHostGlobalsAsync(() => host.export({ ready: "yes" })),
		).rejects.toThrow(
			forgeFrameError("VALIDATION", "Validation failed: exports.ready"),
		);
		// Nothing was sent, so the consumer neither stored nor reported it.
		expect(instance.exports).toBeUndefined();
		expect(errors).toEqual([]);
		await activeHarness.withHostGlobalsAsync(() =>
			host.export({ ready: true }),
		);
		expect(instance.exports).toEqual({ ready: true });
	});

	it("validates a tag-agnostic host's unchecked exports on the consumer", async () => {
		const { instance, host, errors, activeHarness } = await renderWithHost(
			"exports-schema-tag-agnostic",
			prop.object({ ready: prop.boolean() }),
			"tag-agnostic",
		);
		await expect(
			activeHarness.withHostGlobalsAsync(() => host.export({ ready: 1 })),
		).rejects.toThrow(
			forgeFrameError("VALIDATION", "Validation failed: exports.ready"),
		);
		expect(instance.exports).toBeUndefined();
		expect(errors).toHaveLength(1);
	});

	it("accepts any exports when the component has no exports schema", async () => {
		const { instance, host, activeHarness } = await renderWithHost(
			"exports-schema-none",
			undefined,
			"tag-agnostic",
		);
		await activeHarness.withHostGlobalsAsync(() => host.export(["any", 1]));
		expect(instance.exports).toEqual(["any", 1]);
	});
});
