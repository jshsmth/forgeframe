import { afterEach, describe, expect, it, vi } from "vitest";
import { clearComponents, closeAll, getComponent } from "@/core/component";
import { getComponentOptions } from "@/core/component-registry";
import { ConsumerComponent } from "@/core/consumer";
import { create, prop } from "@/index";
import { generateCode } from "../../../playground/consumer/code-generator";
import { createComponent } from "../../../playground/consumer/renderer";
import { resetPropValues } from "../../../playground/consumer/state";
import type { PlaygroundConfig } from "../../../playground/consumer/types";
import { checkRenderValidation } from "../render-validation";
import { requireValue } from "../require-value";

afterEach(async () => {
	await closeAll();
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
		"keeps playground callback overrides in copied $context/$style examples",
		async ({ context, style }) => {
			vi.spyOn(ConsumerComponent.prototype, "render").mockImplementation(
				async function (this: ConsumerComponent<Record<string, unknown>>) {
					await this.updateProps({});
				},
			);
			for (const [type, defaultValue] of [
				["string", "text"],
				["number", 1],
				["boolean", true],
			] as const) {
				const config: PlaygroundConfig = {
					tag: `generated-callback-overrides-${type}`,
					url: "https://example.com",
					props: {
						onClose: { type, default: defaultValue },
						onGreet: { type, default: defaultValue },
					},
				};
				const code = generateCode(config, context, style);
				const run = new Function(
					"create",
					"prop",
					`return (async () => {${code.replace(/^import .*\n/, "")} })()`,
				);
				await run(create, prop);
				// onClose is an ordinary prop now; lifecycle uses events.
				expect(code).toContain('"onClose":');
				expect(code).not.toContain('"onGreet":');
				expect(code).toContain("myComponent.event.on('close'");
				expect(code).toContain("myComponent.event.on('error'");
				const Component = requireValue(getComponent(config.tag));
				expect(Component.instances).toHaveLength(1);
			}
		},
	);

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
				"create",
				"prop",
				`return (async () => {${code.replace(/^import .*\n/, "")} })()`,
			);
			await run(create, prop);
			expect(render).toHaveBeenCalledOnce();
			expect(code).toContain("onGreet: prop.function().optional()");
		},
	);

	it("executes quoted property names, composite values, and modal styles", async () => {
		vi.spyOn(ConsumerComponent.prototype, "render").mockImplementation(
			async function (this: ConsumerComponent<Record<string, unknown>>) {
				// Real normalization and validation still run before this browser-effect stub.
				expect(() => checkRenderValidation(this)).not.toThrow();
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
			"create",
			"prop",
			`return (async () => {${code.replace(/^import .*\n/, "")} })()`,
		);
		await run(create, prop);
		const Component = requireValue(getComponent(config.tag));
		expect(Component.instances).toHaveLength(1);
	});

	it.each([undefined, { width: 620, height: 450 }])(
		"copies the live popup dimensions with modalStyle %j",
		async (modalStyle) => {
			const config: PlaygroundConfig = {
				tag: "generated-popup-dimensions",
				url: "https://example.com",
				dimensions: { width: "100%", height: "100%" },
				modalStyle,
			};
			const render = vi
				.spyOn(ConsumerComponent.prototype, "render")
				.mockResolvedValue();
			const liveComponent = createComponent(config, "popup");
			await liveComponent({
				onGreet: () => undefined,
			}).render("#container", "popup");
			const code = generateCode(config, "popup", "embedded");
			const run = new Function(
				"create",
				"prop",
				`return (async () => {${code.replace(/^import .*\n/, "")} })()`,
			);
			await run(create, prop);
			expect(render).toHaveBeenCalledTimes(2);
			const generated = requireValue(getComponent(config.tag));
			const expected = {
				width: modalStyle?.width ?? 500,
				height: modalStyle?.height ?? 400,
			};
			expect(getComponentOptions(liveComponent)?.dimensions).toEqual(expected);
			expect(getComponentOptions(generated)?.dimensions).toEqual(expected);
		},
	);
});
