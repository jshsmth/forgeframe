import { afterEach, describe, expect, it, vi } from "vitest";
import { clearComponents, destroyAll, getComponent } from "@/core/component";
import { ConsumerComponent } from "@/core/consumer";
import ForgeFrame, { prop } from "@/index";
import { generateCode } from "../../../playground/consumer/code-generator";
import { resetPropValues } from "../../../playground/consumer/state";
import type { PlaygroundConfig } from "../../../playground/consumer/types";
import { requireValue } from "../require-value";

afterEach(async () => {
	await destroyAll();
	clearComponents();
	resetPropValues();
	vi.restoreAllMocks();
});

describe("playground generated examples", () => {
	it.each([
		{ context: "iframe", style: "embedded" },
		{ context: "iframe", style: "modal" },
		{ context: "popup", style: "embedded" },
	] as const)(
		"executes a $context/$style example without custom props",
		async ({ context, style }) => {
			const render = vi
				.spyOn(ConsumerComponent.prototype, "render")
				.mockResolvedValue();
			const code = generateCode(
				{ tag: "generated-example", url: "https://example.com" },
				context,
				style,
			);
			const run = new Function(
				"ForgeFrame",
				"prop",
				`return (async () => {${code.replace(/^import .*\n/, "")} })()`,
			);
			await run(ForgeFrame, prop);
			expect(render).toHaveBeenCalledOnce();
			expect(code).toContain("onGreet: prop.function().optional()");
		},
	);

	it("executes quoted property names, composite values, and modal styles", async () => {
		vi.spyOn(ConsumerComponent.prototype, "render").mockImplementation(
			async function (this: ConsumerComponent<Record<string, unknown>>) {
				// Real normalization and validation still run before this browser-effect stub.
				expect(this.isEligible()).toBe(true);
			},
		);
		const config: PlaygroundConfig = {
			tag: "generated-composite-example",
			url: "https://example.com",
			props: {
				"display-name": { type: "string", required: true, default: "O'Reilly" },
				items: { type: "array", required: true },
				record: { type: "object", required: true },
				onRun: { type: "function", required: true },
			},
			modalStyle: { borderColor: "var(--border, 'red')" },
		};
		const code = generateCode(config, "iframe", "modal");
		const run = new Function(
			"ForgeFrame",
			"prop",
			`return (async () => {${code.replace(/^import .*\n/, "")} })()`,
		);
		await run(ForgeFrame, prop);
		const Component = requireValue(getComponent(config.tag));
		expect(Component.instances).toHaveLength(1);
	});
});
