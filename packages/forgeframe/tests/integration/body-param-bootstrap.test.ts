/**
 * Integration tests covering initial bodyParam bootstrap flows.
 *
 * Verifies that iframe and popup hosts both use hidden-form POST bootstrap
 * while still completing host initialization through `window.name`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { create, prop } from "@/index";
import type { PropsDefinition } from "@/types";
import {
	createIframeIntegrationHarness,
	createPopupIntegrationHarness,
	type IframeIntegrationHarness,
	type PopupIntegrationHarness,
} from "./helpers";

type BodyParamProps = {
	token: string;
	mode: string;
};

const BODY_PARAM_PROP_DEFINITIONS: PropsDefinition<BodyParamProps> = {
	token: { schema: prop.string(), required: true, bodyParam: true },
	mode: { schema: prop.string(), required: true, queryParam: true },
};

describe("Body param bootstrap integration", () => {
	let iframeHarness: IframeIntegrationHarness | null = null;
	let popupHarness: PopupIntegrationHarness | null = null;

	afterEach(async () => {
		await iframeHarness?.cleanup();
		await popupHarness?.cleanup();
		iframeHarness = null;
		popupHarness = null;
		vi.restoreAllMocks();
	});

	it("should submit iframe body params through a hidden form and still initialize host props", async () => {
		iframeHarness = createIframeIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const BodyParamComponent = create<BodyParamProps>({
			tag: "integration-iframe-body-param-component",
			url: "https://host.example.com/widget",
			props: BODY_PARAM_PROP_DEFINITIONS,
		});

		const instance = BodyParamComponent({
			token: "abc123",
			mode: "embedded",
		});

		const renderPromise = instance.render(container);
		const { hostProps, iframe } = await iframeHarness.bootstrapIframeHost(
			container,
			BODY_PARAM_PROP_DEFINITIONS,
		);

		await expect(renderPromise).resolves.toBeUndefined();

		expect(iframeHarness.getLastFormSubmission()).toEqual({
			action: "https://host.example.com/widget?mode=embedded",
			target: iframe.name,
			method: "POST",
			fields: { token: "abc123" },
		});
		expect(document.querySelector("form")).toBeNull();
		expect(hostProps.consumer.props).toEqual({
			token: "abc123",
			mode: "embedded",
		});
		expect(iframeHarness.withHostGlobals(() => window.location.href)).toBe(
			"https://host.example.com/widget?mode=embedded",
		);
	});

	it("should open a popup on about:blank, submit body params, and initialize host props", async () => {
		popupHarness = createPopupIntegrationHarness();

		const container = document.createElement("div");
		document.body.appendChild(container);

		const BodyParamComponent = create<BodyParamProps>({
			tag: "integration-popup-body-param-component",
			url: "https://host.example.com/widget",
			props: BODY_PARAM_PROP_DEFINITIONS,
		});

		const instance = BodyParamComponent({
			token: "popup-token",
			mode: "popup",
		});

		const renderPromise = instance.render(container, "popup");
		const popupOpen = await popupHarness.waitForPopupOpen();
		const { hostProps } = await popupHarness.bootstrapPopupHost(
			BODY_PARAM_PROP_DEFINITIONS,
		);

		await expect(renderPromise).resolves.toBeUndefined();

		expect(popupOpen.url).toBe("about:blank");
		expect(popupHarness.getLastFormSubmission()).toEqual({
			action: "https://host.example.com/widget?mode=popup",
			target: popupOpen.name,
			method: "POST",
			fields: { token: "popup-token" },
		});
		expect(document.querySelector("form")).toBeNull();
		expect(hostProps.consumer.props).toEqual({
			token: "popup-token",
			mode: "popup",
		});
		expect(popupHarness.withHostGlobals(() => window.location.href)).toBe(
			"https://host.example.com/widget?mode=popup",
		);
	});

	it("rejects a detached iframe container before posting body params, and renders once attached", async () => {
		iframeHarness = createIframeIntegrationHarness();
		const BodyParamComponent = create<BodyParamProps>({
			tag: "integration-detached-body-param-component",
			url: "https://host.example.com/widget",
			props: BODY_PARAM_PROP_DEFINITIONS,
		});
		const instance = BodyParamComponent({ token: "secret", mode: "embedded" });
		const open = vi.spyOn(window, "open");
		const detached = document.createElement("div");

		await expect(instance.render(detached)).rejects.toThrow(
			"Iframe container must be attached to the document",
		);
		expect(iframeHarness.getLastFormSubmission()).toBeNull();
		expect(open).not.toHaveBeenCalled();
		expect(detached.childElementCount).toBe(0);

		document.body.appendChild(detached);
		const renderPromise = instance.render(detached);
		const { hostProps } = await iframeHarness.bootstrapIframeHost(
			detached,
			BODY_PARAM_PROP_DEFINITIONS,
		);
		await expect(renderPromise).resolves.toBeUndefined();
		expect(iframeHarness.getLastFormSubmission()?.fields).toEqual({
			token: "secret",
		});
		expect(hostProps.token).toBe("secret");
	});

	it("sends dates as ISO strings and omits null values in initial query and body parameters", async () => {
		iframeHarness = createIframeIntegrationHarness();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const definitions = {
			startsAt: { schema: prop.date(), queryParam: true },
			endsAt: { schema: prop.date(), bodyParam: true },
			note: { schema: prop.string().nullable(), queryParam: true },
			memo: { schema: prop.string().nullable(), bodyParam: true },
		};
		const Component = create({
			tag: "integration-date-null-params",
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const instance = Component({
			startsAt: new Date("2026-01-02T03:04:05.000Z"),
			endsAt: new Date("2026-02-03T04:05:06.000Z"),
			note: null,
			memo: null,
		});

		const renderPromise = instance.render(container);
		const { iframe } = await iframeHarness.bootstrapIframeHost(
			container,
			definitions,
		);
		await renderPromise;

		expect(iframeHarness.getLastFormSubmission()).toEqual({
			action:
				"https://host.example.com/widget?startsAt=2026-01-02T03%3A04%3A05.000Z",
			target: iframe.name,
			method: "POST",
			fields: { endsAt: "2026-02-03T04:05:06.000Z" },
		});
	});
});
