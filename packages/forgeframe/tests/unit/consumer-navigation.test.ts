import { afterEach, describe, expect, it, vi } from "vitest";
import { clearComponents, create } from "@/core/component";
import { ConsumerComponent } from "@/core/consumer";
import { prop } from "@/props/prop";

const consumers: ConsumerComponent<Record<string, unknown>>[] = [];

function setBase(href: string): HTMLBaseElement {
	const base = document.createElement("base");
	base.href = href;
	document.head.appendChild(base);
	return base;
}

function mount(consumer: ConsumerComponent<Record<string, unknown>>) {
	consumers.push(consumer);
	const internals = consumer as unknown as {
		waitForHost: () => Promise<void>;
		renderer: { iframe: HTMLIFrameElement };
		transport: { openedHostDomain: string };
	};
	vi.spyOn(internals, "waitForHost").mockResolvedValue();
	const container = document.createElement("div");
	document.body.appendChild(container);
	return { container, internals };
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
				domain: window.location.origin,
			}),
		).toThrow(
			'Component URL origin "https://untrusted.example" is not allowed',
		);
	});

	it.each([false, true])(
		"should reject a changed base before navigation with dynamic URL = %s",
		async (dynamic) => {
			const consumer = new ConsumerComponent<Record<string, unknown>>({
				tag: "changed-base-policy",
				url: dynamic ? () => "/widget" : "/widget",
				domain: window.location.origin,
			});
			const { container } = mount(consumer);
			setBase("https://untrusted.example/");
			await expect(consumer.render(container)).rejects.toThrow(
				'Component URL origin "https://untrusted.example" is not allowed',
			);
			expect(container.querySelector("iframe")).toBeNull();
		},
	);

	it.each(["lifecycle", "converter"])(
		"should pin navigation before a %s changes the base",
		async (mutation) => {
			const base = setBase("https://host.example/nested/");
			const consumer = new ConsumerComponent<Record<string, unknown>>(
				{
					tag: "pinned-base-navigation",
					url: () => "widget#checkout?step=2",
					domain: "https://host.example",
					props: {
						order: {
							schema: prop.string(),
							trustedDomains: ["https://host.example"],
							queryParam: ({ value }) => {
								if (mutation === "converter")
									base.href = "https://untrusted.example/";
								return String(value);
							},
						},
					},
				},
				{
					order: "order-123",
					onRender: () => {
						if (mutation === "lifecycle")
							base.href = "https://untrusted.example/";
					},
				},
			);
			const { container, internals } = mount(consumer);
			await consumer.render(container);
			expect(internals.renderer.iframe.src).toBe(
				"https://host.example/nested/widget?order=order-123#checkout?step=2",
			);
			expect(internals.transport.openedHostDomain).toBe("https://host.example");
			await expect(
				consumer.updateProps({ order: "changed-order" }),
			).rejects.toThrow("not allowed by the configured domain policy");
		},
	);
});
