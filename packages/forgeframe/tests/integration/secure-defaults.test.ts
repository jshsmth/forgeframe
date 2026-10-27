/**
 * Integration tests for v2's secure defaults.
 *
 * Exercises the host consumer allowlist, function URLs that need a host-origin
 * allowlist, and the iframe sandbox option through the public package API and
 * the two-window jsdom harness.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { create, prop } from "@/index";
import { forgeFrameError } from "../forgeframe-error";
import {
	createIframeIntegrationHarness,
	createPopupIntegrationHarness,
	type IframeIntegrationHarness,
	type PopupIntegrationHarness,
} from "./helpers";

const HOST_URL = "https://host.example.com/widget";

describe("Secure defaults integration", () => {
	let harness: IframeIntegrationHarness | PopupIntegrationHarness | null = null;

	afterEach(async () => {
		await harness?.cleanup();
		harness = null;
		document.body.innerHTML = "";
		vi.restoreAllMocks();
	});

	function mountContainer(): HTMLDivElement {
		const container = document.createElement("div");
		document.body.append(container);
		return container;
	}

	describe("consumer allowlist", () => {
		it("binds the exact verified consumer origin when '*' admits every origin", async () => {
			const activeHarness = createIframeIntegrationHarness();
			harness = activeHarness;
			const definitions = { amount: prop.number() };
			const Component = create({
				tag: "secure-any-consumer",
				url: HOST_URL,
				props: definitions,
			});
			const container = mountContainer();
			const rendering = Component({ amount: 1 }).render(container);

			const { host, hostProps } = await activeHarness.bootstrapIframeHost(
				container,
				Component,
				{ consumerOrigins: "*" },
			);
			await rendering;

			expect(host.consumerOrigin).toBe(activeHarness.consumerOrigin);
			expect(hostProps.amount).toBe(1);
		});
	});

	describe("function URLs", () => {
		it("rejects a function URL without domain before registering the component", () => {
			expect(() =>
				// @ts-expect-error a function url requires hostOrigins; this checks the runtime error
				create({
					tag: "secure-function-url-no-domain",
					url: () => HOST_URL,
				}),
			).toThrow(
				forgeFrameError(
					"VALIDATION",
					"Component hostOrigins is required when url is a function",
				),
			);
		});

		it.each([
			["a matching origin", "https://host.example.com"],
			["'*'", "*"],
		])(
			"renders and delivers props and callbacks when %s admits the resolved URL",
			async (_label, domain) => {
				const activeHarness = createIframeIntegrationHarness();
				harness = activeHarness;
				const onReady = vi.fn();
				const definitions = {
					path: prop.string(),
					onReady: prop.function<(value: string) => void>(),
				};
				const Component = create({
					tag: `secure-function-url-${domain === "*" ? "any" : "listed"}`,
					url: (props) => `https://host.example.com/${props.path}`,
					hostOrigins: domain,
					props: definitions,
				});
				const container = mountContainer();
				const rendering = Component({ path: "widget", onReady }).render(
					container,
				);

				const { hostProps } = await activeHarness.bootstrapIframeHost(
					container,
					definitions,
				);
				await rendering;
				await activeHarness.withHostGlobalsAsync(() =>
					hostProps.onReady("ready"),
				);

				expect(hostProps.path).toBe("widget");
				expect(onReady).toHaveBeenCalledWith("ready");
			},
		);

		it("rejects render before any iframe exists when the resolved origin is not listed", async () => {
			harness = createIframeIntegrationHarness();
			const Component = create({
				tag: "secure-function-url-unlisted",
				url: () => "https://attacker.example.com/widget",
				hostOrigins: "https://host.example.com",
			});
			const container = mountContainer();

			await expect(Component().render(container)).rejects.toThrow(
				forgeFrameError(
					"ORIGIN_REJECTED",
					'Component URL origin "https://attacker.example.com" is not allowed',
				),
			);
			expect(container.querySelector("iframe")).toBeNull();
		});

		it("rejects render before any popup opens when the resolved origin is not listed", async () => {
			const activeHarness = createPopupIntegrationHarness();
			harness = activeHarness;
			const Component = create({
				tag: "secure-function-url-unlisted-popup",
				url: () => "https://attacker.example.com/widget",
				hostOrigins: "https://host.example.com",
			});

			await expect(
				Component().render(mountContainer(), "popup"),
			).rejects.toThrow(
				forgeFrameError(
					"ORIGIN_REJECTED",
					'Component URL origin "https://attacker.example.com" is not allowed',
				),
			);
			expect(activeHarness.getLastPopupOpen()).toBeNull();
		});
	});

	describe("sandbox", () => {
		it.each([
			[
				"the default tokens when sandbox is omitted",
				undefined,
				"allow-scripts allow-same-origin allow-forms allow-popups",
			],
			[
				"a custom string verbatim",
				"allow-scripts allow-same-origin allow-modals",
				"allow-scripts allow-same-origin allow-modals",
			],
			["no attribute for false", false, null],
		] as const)(
			"writes %s and completes the handshake",
			async (_label, sandbox, expected) => {
				const activeHarness = createIframeIntegrationHarness();
				harness = activeHarness;
				const Component = create({
					tag: `secure-sandbox-${String(sandbox).length}`,
					url: HOST_URL,
					...(sandbox === undefined ? {} : { sandbox }),
				});
				const container = mountContainer();
				const rendering = Component().render(container);

				const { iframe } = await activeHarness.bootstrapIframeHost(container);
				await expect(rendering).resolves.toBeUndefined();

				expect(iframe.getAttribute("sandbox")).toBe(expected);
			},
		);

		it("rejects a computed sandbox attribute before any iframe is created", async () => {
			harness = createIframeIntegrationHarness();
			const Component = create({
				tag: "secure-computed-sandbox-attribute",
				url: HOST_URL,
				attributes: () =>
					({ SANDBOX: "allow-scripts" }) as Record<string, string>,
			});
			const container = mountContainer();

			await expect(Component().render(container)).rejects.toThrow(
				forgeFrameError(
					"VALIDATION",
					`Iframe attribute "SANDBOX" is not allowed; set the component's sandbox option instead`,
				),
			);
			expect(container.querySelector("iframe")).toBeNull();
		});

		it("ignores sandbox in popup context", async () => {
			const activeHarness = createPopupIntegrationHarness();
			harness = activeHarness;
			const Component = create({
				tag: "secure-popup-sandbox",
				url: HOST_URL,
				sandbox: "allow-scripts allow-same-origin",
			});
			const rendering = Component().render(mountContainer(), "popup");

			await activeHarness.bootstrapPopupHost();
			await expect(rendering).resolves.toBeUndefined();
			expect(activeHarness.getLastPopupOpen()?.url).toBe(HOST_URL);
		});
	});
});
