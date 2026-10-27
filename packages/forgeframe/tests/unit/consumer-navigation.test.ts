import { afterEach, describe, expect, it, vi } from "vitest";
import { clearComponents, create } from "@/core/component";
import { ConsumerComponent } from "@/core/consumer";
import { prop } from "@/props/prop";
import { forgeFrameError } from "../forgeframe-error";

const consumers: ConsumerComponent<Record<string, unknown>>[] = [];

function setBase(href: string): HTMLBaseElement {
	const base = document.createElement("base");
	base.href = href;
	document.head.appendChild(base);
	return base;
}

function mount(consumer: ConsumerComponent<Record<string, unknown>>) {
	consumers.push(consumer);
	// No host page answers in jsdom, so render() skips the private handshake wait.
	vi.spyOn(consumer, "waitForHost").mockResolvedValue();
	const container = document.createElement("div");
	document.body.appendChild(container);
	return { container };
}

afterEach(async () => {
	for (const consumer of consumers.splice(0)) await consumer.close();
	clearComponents();
	document.body.innerHTML = "";
	for (const base of document.querySelectorAll("base")) base.remove();
	vi.restoreAllMocks();
});

describe("Consumer navigation admission", () => {
	it("should apply declaration-time policy to the actual document base origin", () => {
		setBase("https://untrusted.example/");
		expect(() =>
			create({
				tag: "relative-origin-policy",
				url: "/widget",
				hostOrigins: window.location.origin,
			}),
		).toThrow(
			forgeFrameError(
				"ORIGIN_REJECTED",
				'Component URL origin "https://untrusted.example" is not allowed',
			),
		);
	});

	it.each([false, true])(
		"should reject a changed base before navigation with dynamic URL = %s",
		async (dynamic) => {
			const consumer = new ConsumerComponent<Record<string, unknown>>({
				tag: "changed-base-policy",
				...(dynamic
					? { url: () => "/widget", hostOrigins: window.location.origin }
					: { url: "/widget", hostOrigins: window.location.origin }),
			});
			const { container } = mount(consumer);
			setBase("https://untrusted.example/");
			await expect(consumer.render(container)).rejects.toThrow(
				forgeFrameError(
					"ORIGIN_REJECTED",
					'Component URL origin "https://untrusted.example" is not allowed',
				),
			);
			expect(container.querySelector("iframe")).toBeNull();
		},
	);

	it("should pin navigation before a lifecycle listener changes the base", async () => {
		const base = setBase("https://host.example/nested/");
		const consumer = new ConsumerComponent<Record<string, unknown>>(
			{
				tag: "pinned-base-navigation",
				url: () => "widget#checkout?step=2",
				hostOrigins: "https://host.example",
				props: {
					order: {
						schema: prop.string(),
						deliverTo: ["https://host.example"],
						queryParam: true,
					},
				},
			},
			{ order: "order-123" },
		);
		consumer.event.once("render", () => {
			base.href = "https://untrusted.example/";
		});
		const { container } = mount(consumer);
		await consumer.render(container);
		expect(container.querySelector("iframe")?.src).toBe(
			"https://host.example/nested/widget?order=order-123#checkout?step=2",
		);
		expect(consumer.getOpenedHostOrigin()).toBe("https://host.example");
		await expect(
			consumer.updateProps({ order: "changed-order" }),
		).rejects.toThrow(
			forgeFrameError(
				"ORIGIN_REJECTED",
				"is not allowed by the component's hostOrigins",
			),
		);
	});
});
