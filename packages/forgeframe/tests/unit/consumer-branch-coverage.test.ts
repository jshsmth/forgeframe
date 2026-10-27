/**
 * Branch coverage tests for `@/core/consumer` internals.
 *
 * Covers domain trust variants, render helper delegation, prop update edge paths, and guarded branches around URL/origin handling.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTEXT, EVENT } from "@/constants";
import { ConsumerComponent } from "@/core/consumer";
import { prop } from "@/props/prop";
import * as iframeRender from "@/render/iframe";
import * as popupRender from "@/render/popup";
import type {
	ComponentBaseOptions,
	ComponentUrlOptions,
} from "@/types/runtime";
import { createDeferred } from "@/utils/promise";
import {
	callConsumerCallback,
	HOST_ORIGIN,
	hostSource,
	sentCallbackId,
} from "../consumer-bridge";
import { forgeFrameError } from "../forgeframe-error";
import { createFrameWindow } from "../frame-window";

const createdConsumers: Array<ConsumerComponent<Record<string, unknown>>> = [];

type Consumer = ConsumerComponent<Record<string, unknown>>;
type Transport = Consumer["transport"];

/**
 * Private consumer members these branch tests drive directly. Each one is read
 * from the class, so a renamed or retyped internal fails to compile here. The
 * messenger's trusted-origin sets are private and have no public reader.
 */
type ConsumerInternals = {
	transport: Omit<Transport, "messenger"> & {
		messenger: Pick<Transport["messenger"], "send"> & {
			allowedOrigins: Set<string>;
			allowedOriginPatterns: RegExp[];
		};
	};
	renderer: Consumer["renderer"];
	cleanup: Consumer["cleanup"];
	resolveUrlOrigin: Consumer["resolveUrlOrigin"];
	resolveContainer: Consumer["resolveContainer"];
	resizeForHost: Consumer["resizeForHost"];
	prerender: Consumer["prerender"];
	createIframeElement: Consumer["createIframeElement"];
	open: Consumer["open"];
	submitBodyForm: Consumer["submitBodyForm"];
	buildUrl: Consumer["buildUrl"];
	destroy: Consumer["destroy"];
};

/**
 * Reads private consumer members, which TypeScript only exposes through an
 * assertion; widening to `object` first lets one assertion do it.
 */
function getInternals(component: Consumer): ConsumerInternals {
	const members: object = component;
	return members as ConsumerInternals;
}

/**
 * Creates a consumer instance and tracks it for teardown at the end of each test.
 */
function createConsumer(
	options: Partial<
		ComponentBaseOptions & Extract<ComponentUrlOptions, { url: string }>
	> = {},
	props: Record<string, unknown> = {},
): ConsumerComponent<Record<string, unknown>> {
	const consumer = new ConsumerComponent<Record<string, unknown>>(
		{
			tag: "consumer-internal-branches-component",
			url: "https://host.example.com/widget",
			...options,
		},
		props,
	);
	createdConsumers.push(consumer);
	return consumer;
}

/** Calls a callback the consumer sent to the host, as the opened host window. */
function callHostCallback(
	consumer: ConsumerComponent<Record<string, unknown>>,
	id: string,
): unknown {
	return callConsumerCallback(
		getInternals(consumer).transport,
		id,
		hostSource(window),
	);
}

afterEach(async () => {
	for (const consumer of createdConsumers.splice(0)) {
		await consumer.close();
	}
	vi.useRealTimers();
	vi.restoreAllMocks();
	document.body.innerHTML = "";
});

describe("Consumer branch coverage and edge paths", () => {
	it("should trust domain option when configured as string", () => {
		const consumer = createConsumer({
			url: "https://trusted.example.com/widget",
			hostOrigins: "https://trusted.example.com",
		});
		const allowedOrigins = Array.from(
			getInternals(consumer).transport.messenger.allowedOrigins,
		);

		expect(allowedOrigins).toContain("https://trusted.example.com");
	});

	it("should trust domain option when configured as array", () => {
		const consumer = createConsumer({
			url: "https://trusted-a.example.com/widget",
			hostOrigins: [
				"https://trusted-a.example.com",
				"https://trusted-b.example.com",
			],
		});
		const allowedOrigins = Array.from(
			getInternals(consumer).transport.messenger.allowedOrigins,
		);

		expect(allowedOrigins).toContain("https://trusted-a.example.com");
		expect(allowedOrigins).toContain("https://trusted-b.example.com");
	});

	it("should trust mixed array domain option entries including RegExp", () => {
		const consumer = createConsumer({
			url: "https://api.trusted.example.com/widget",
			hostOrigins: [
				"https://trusted-a.example.com",
				/^https:\/\/.*\.trusted\.example\.com$/,
			],
		});
		const internalMessenger = getInternals(consumer).transport.messenger;

		expect(Array.from(internalMessenger.allowedOrigins)).toContain(
			"https://trusted-a.example.com",
		);
		expect(internalMessenger.allowedOriginPatterns).toHaveLength(1);
		expect(
			internalMessenger.allowedOriginPatterns[0]?.test(
				"https://api.trusted.example.com",
			),
		).toBe(true);
	});

	it("should trust domain option when configured as RegExp", () => {
		const consumer = createConsumer({
			url: "https://api.trusted.example.com/widget",
			hostOrigins: /^https:\/\/.*\.trusted\.example\.com$/,
		});
		const patterns =
			getInternals(consumer).transport.messenger.allowedOriginPatterns;

		expect(patterns).toHaveLength(1);
		expect(patterns[0].test("https://api.trusted.example.com")).toBe(true);
	});

	it("should focus iframe and popup contexts through dedicated render helpers", async () => {
		const consumer = createConsumer();
		const internal = getInternals(consumer);
		const iframe = document.createElement("iframe");
		const popup = createFrameWindow();
		const focusIframeSpy = vi
			.spyOn(iframeRender, "focusIframe")
			.mockImplementation(() => {});
		const focusPopupSpy = vi
			.spyOn(popupRender, "focusPopup")
			.mockImplementation(() => {});

		internal.renderer.context = CONTEXT.IFRAME;
		internal.renderer.iframe = iframe;

		await consumer.focus();
		expect(focusIframeSpy).toHaveBeenCalledWith(iframe);

		internal.renderer.context = CONTEXT.POPUP;
		internal.transport.attachHostWindow(popup, HOST_ORIGIN);

		await consumer.focus();
		expect(focusPopupSpy).toHaveBeenCalledWith(popup);
	});

	it("should resize/show/hide through iframe and popup render helpers", async () => {
		const consumer = createConsumer();
		const internal = getInternals(consumer);
		const iframe = document.createElement("iframe");
		const popup = createFrameWindow();

		const resizeIframeSpy = vi
			.spyOn(iframeRender, "resizeIframe")
			.mockImplementation(() => {});
		const showIframeSpy = vi
			.spyOn(iframeRender, "showIframe")
			.mockImplementation(() => {});
		const hideIframeSpy = vi
			.spyOn(iframeRender, "hideIframe")
			.mockImplementation(() => {});
		const resizePopupSpy = vi
			.spyOn(popupRender, "resizePopup")
			.mockImplementation(() => true);

		internal.renderer.context = CONTEXT.IFRAME;
		internal.renderer.iframe = iframe;

		await consumer.resize({ width: 400, height: 220 });
		await consumer.show();
		await consumer.hide();

		expect(resizeIframeSpy).toHaveBeenCalledWith(iframe, {
			width: 400,
			height: 220,
		});
		expect(showIframeSpy).toHaveBeenCalledWith(iframe);
		expect(hideIframeSpy).toHaveBeenCalledWith(iframe);

		internal.renderer.context = CONTEXT.POPUP;
		internal.transport.attachHostWindow(popup, HOST_ORIGIN);

		await consumer.resize({ width: 480, height: 300 });
		expect(resizePopupSpy).toHaveBeenCalledWith(popup, {
			width: 480,
			height: 300,
		});

		// A popup that is not open has nothing to resize and reports no resize.
		internal.transport.attachHostWindow(null, HOST_ORIGIN);
		resizePopupSpy.mockClear();
		const resized = vi.fn();
		consumer.event.on(EVENT.RESIZE, resized);
		await consumer.resize({ width: 500, height: 320 });
		expect(resizePopupSpy).not.toHaveBeenCalled();
		expect(resized).not.toHaveBeenCalled();
	});

	it("emits resize for a host request only when something was resized", () => {
		const consumer = createConsumer();
		const internal = getInternals(consumer);
		const resized = vi.fn();
		consumer.event.on(EVENT.RESIZE, resized);

		// An iframe context with nothing mounted applies nothing.
		internal.resizeForHost({ width: 300, height: 200 });
		expect(resized).not.toHaveBeenCalled();

		// A popup that is not open did not resize itself.
		internal.renderer.context = CONTEXT.POPUP;
		internal.resizeForHost({ width: 310, height: 220 });
		expect(resized).not.toHaveBeenCalled();

		// An open popup host has already resized its own window.
		internal.transport.attachHostWindow(createFrameWindow(), HOST_ORIGIN);
		internal.resizeForHost({ width: 320, height: 240 });
		expect(resized).toHaveBeenCalledExactlyOnceWith({
			width: 320,
			height: 240,
		});
	});

	it("should reject invalid origins when resolving URL origin", () => {
		const consumer = createConsumer();
		expect(() => getInternals(consumer).resolveUrlOrigin("http://%")).toThrow(
			forgeFrameError("VALIDATION", "Invalid component URL"),
		);
	});

	it("should reject a URL origin outside the component's hostOrigins", () => {
		const consumer = createConsumer({
			hostOrigins: "https://trusted.example.com",
		});
		expect(() =>
			getInternals(consumer).resolveUrlOrigin("https://host.example.com"),
		).toThrow(
			forgeFrameError(
				"ORIGIN_REJECTED",
				"is not allowed by the component's hostOrigins",
			),
		);
	});

	it("should reject invalid URLs during trusted-origin sync", () => {
		const consumer = createConsumer();
		expect(() =>
			getInternals(consumer).transport.syncTrustedOriginForUrl("http://%"),
		).toThrow(
			expect.objectContaining({
				code: "VALIDATION",
				message: expect.stringContaining("Invalid component URL"),
			}),
		);
	});

	it("should prune stale function refs after each host serialization batch", async () => {
		const consumer = createConsumer(
			{
				props: {
					onSubmit: prop.function().optional(),
				},
			},
			{
				onSubmit: vi.fn(),
			},
		);

		getInternals(consumer).transport.attachHostWindow(window, HOST_ORIGIN);

		const sendSpy = vi
			.spyOn(getInternals(consumer).transport.messenger, "send")
			.mockResolvedValue(undefined);

		await consumer.updateProps({ onSubmit: () => "first" });
		await consumer.updateProps({ onSubmit: () => "second" });

		await expect(
			callHostCallback(consumer, sentCallbackId(sendSpy, 0, "onSubmit")),
		).rejects.toThrow(forgeFrameError("CLOSED", "not found"));
		await expect(
			callHostCallback(consumer, sentCallbackId(sendSpy, 1, "onSubmit")),
		).resolves.toBe("second");
	});

	it("should keep previous function refs until host props update is sent", async () => {
		const consumer = createConsumer(
			{
				props: {
					onSubmit: prop.function().optional(),
				},
			},
			{
				onSubmit: vi.fn(),
			},
		);

		getInternals(consumer).transport.attachHostWindow(window, HOST_ORIGIN);

		const sendSpy = vi
			.spyOn(getInternals(consumer).transport.messenger, "send")
			.mockResolvedValue(undefined);

		await consumer.updateProps({ onSubmit: () => "previous" });
		const previousRefId = sentCallbackId(sendSpy, 0, "onSubmit");

		sendSpy.mockImplementationOnce(async () => {
			// The host may still call the previous callback until it acknowledges.
			await expect(callHostCallback(consumer, previousRefId)).resolves.toBe(
				"previous",
			);
			return undefined;
		});

		await expect(
			consumer.updateProps({ onSubmit: () => "next" }),
		).resolves.toBeUndefined();
		await expect(callHostCallback(consumer, previousRefId)).rejects.toThrow(
			forgeFrameError("CLOSED", "not found"),
		);
		await expect(
			callHostCallback(consumer, sentCallbackId(sendSpy, 1, "onSubmit")),
		).resolves.toBe("next");
	});

	it("should serialize concurrent prop updates to avoid batch ref races", async () => {
		const consumer = createConsumer(
			{
				props: {
					onSubmit: prop.function().optional(),
				},
			},
			{
				onSubmit: vi.fn(),
			},
		);

		getInternals(consumer).transport.attachHostWindow(window, HOST_ORIGIN);

		const firstSend = createDeferred<void>();
		const secondSend = createDeferred<void>();

		const sendSpy = vi
			.spyOn(getInternals(consumer).transport.messenger, "send")
			.mockImplementation(async () => {
				return sendSpy.mock.calls.length === 1
					? firstSend.promise
					: secondSend.promise;
			});

		const firstUpdate = consumer.updateProps({ onSubmit: () => "first" });
		const secondUpdate = consumer.updateProps({ onSubmit: () => "second" });

		await Promise.resolve();
		expect(sendSpy).toHaveBeenCalledTimes(1);

		firstSend.resolve();
		await firstUpdate;

		await Promise.resolve();
		expect(sendSpy).toHaveBeenCalledTimes(2);

		secondSend.resolve();

		await expect(secondUpdate).resolves.toBeUndefined();
		await expect(
			callHostCallback(consumer, sentCallbackId(sendSpy, 0, "onSubmit")),
		).rejects.toThrow(forgeFrameError("CLOSED", "not found"));
		await expect(
			callHostCallback(consumer, sentCallbackId(sendSpy, 1, "onSubmit")),
		).resolves.toBe("second");
	});

	it("should resolve existing selector containers to HTMLElement", () => {
		const consumer = createConsumer();
		const container = document.createElement("div");
		container.id = "resolve-container-target";
		document.body.appendChild(container);

		const resolved = getInternals(consumer).resolveContainer(
			"#resolve-container-target",
		);

		expect(resolved).toBe(container);
	});

	it("should invoke close/focus callbacks exposed to prerender and container templates", async () => {
		const closeSpy = vi.fn().mockResolvedValue(undefined);
		const focusSpy = vi.fn();
		const consumer = createConsumer({
			prerenderTemplate: (ctx) => {
				void ctx.close();
				ctx.focus();
				return document.createElement("div");
			},
			containerTemplate: (ctx) => {
				void ctx.close();
				ctx.focus();
				return document.createElement("div");
			},
		});

		vi.spyOn(consumer, "close").mockImplementation(closeSpy);
		vi.spyOn(consumer, "focus").mockImplementation(focusSpy);

		getInternals(consumer).renderer.container = document.createElement("div");

		await getInternals(consumer).prerender();

		expect(closeSpy).toHaveBeenCalled();
		expect(focusSpy).toHaveBeenCalled();
	});

	it("should apply boolean attributes and numeric styles when creating iframe element", () => {
		const consumer = createConsumer(
			{
				attributes: {
					allowfullscreen: true,
					title: "Hosted iframe",
				},
				style: {
					marginTop: 8,
					border: "1px solid red",
				},
			},
			{},
		);

		const iframe = getInternals(consumer).createIframeElement("window-name");

		expect(iframe.hasAttribute("allowfullscreen")).toBe(true);
		expect(iframe.getAttribute("title")).toBe("Hosted iframe");
		expect(iframe.style.getPropertyValue("margin-top")).toBe("8px");
		expect(iframe.style.getPropertyValue("border")).toBe("1px solid red");
	});

	it("should apply default sandbox when creating iframe element without a sandbox attribute", () => {
		const consumer = createConsumer();

		const iframe = getInternals(consumer).createIframeElement("window-name");

		expect(iframe.getAttribute("sandbox")).toBe(
			"allow-scripts allow-same-origin allow-forms allow-popups",
		);
	});

	it.each([
		[
			"the default",
			undefined,
			"allow-scripts allow-same-origin allow-forms allow-popups",
		],
		[
			"a custom string",
			"allow-scripts allow-same-origin",
			"allow-scripts allow-same-origin",
		],
		["false", false, null],
	] as const)(
		"writes %s sandbox when creating the iframe element",
		(_label, sandbox, expected) => {
			const consumer = createConsumer(sandbox === undefined ? {} : { sandbox });

			const iframe = getInternals(consumer).createIframeElement("window-name");

			expect(iframe.getAttribute("sandbox")).toBe(expected);
		},
	);

	it("rejects a computed sandbox attribute before creating the iframe", () => {
		const createElement = vi.spyOn(document, "createElement");
		const consumer = createConsumer({
			attributes: () => ({ SandBox: "allow-scripts" }),
		});

		expect(() =>
			getInternals(consumer).createIframeElement("window-name"),
		).toThrow(
			forgeFrameError(
				"VALIDATION",
				`Iframe attribute "SandBox" is not allowed; set the component's sandbox option instead`,
			),
		);
		expect(createElement).not.toHaveBeenCalledWith("iframe");
	});

	it("should open popup context and register popup close watcher cleanup", async () => {
		const consumer = createConsumer({
			dimensions: { width: 460, height: 320 },
		});
		const internal = getInternals(consumer);
		const popupWindow = createFrameWindow();
		const stopWatching = vi.fn();
		const openPopupSpy = vi
			.spyOn(popupRender, "openPopup")
			.mockReturnValue(popupWindow);
		const watchSpy = vi
			.spyOn(popupRender, "watchPopupClose")
			.mockReturnValue(stopWatching);
		const cleanupRegisterSpy = vi.spyOn(internal.cleanup, "register");

		internal.renderer.context = CONTEXT.POPUP;

		await getInternals(consumer).open("https://host.example.com/widget");

		expect(openPopupSpy).toHaveBeenCalledTimes(1);
		expect(watchSpy).toHaveBeenCalledWith(popupWindow, expect.any(Function));
		expect(cleanupRegisterSpy).toHaveBeenCalledWith(stopWatching);
		expect(internal.transport.hostWindow).toBe(popupWindow);
	});

	it("should submit iframe body params via hidden form when bodyParam props exist", async () => {
		const consumer = createConsumer(
			{
				props: {
					token: { schema: prop.string(), bodyParam: true },
					mode: { schema: prop.string(), queryParam: true },
				},
			},
			{ token: "abc123", mode: "embedded" },
		);

		const internal = getInternals(consumer);
		const iframe = document.createElement("iframe");
		iframe.name = "target-iframe";
		document.body.append(iframe);
		internal.renderer.context = CONTEXT.IFRAME;
		internal.renderer.iframe = iframe;

		const submitBodyFormSpy = vi
			.spyOn(getInternals(consumer), "submitBodyForm")
			.mockImplementation(() => {});

		await getInternals(consumer).open("https://host.example.com/widget");

		expect(submitBodyFormSpy).toHaveBeenCalledTimes(1);
		expect(submitBodyFormSpy).toHaveBeenCalledWith(
			"target-iframe",
			"https://host.example.com/widget?mode=embedded",
			expect.any(URLSearchParams),
		);
		expect(internal.transport.hostWindow).toBe(iframe.contentWindow);
	});

	it("should open popup on about:blank and submit body params when bodyParam props exist", async () => {
		const consumer = createConsumer(
			{
				props: {
					token: { schema: prop.string(), bodyParam: true },
					mode: { schema: prop.string(), queryParam: true },
				},
			},
			{ token: "abc123", mode: "embedded" },
		);

		const popupWindow = createFrameWindow();
		const stopWatching = vi.fn();
		const openPopupSpy = vi
			.spyOn(popupRender, "openPopup")
			.mockReturnValue(popupWindow);
		vi.spyOn(popupRender, "watchPopupClose").mockReturnValue(stopWatching);
		getInternals(consumer).renderer.context = CONTEXT.POPUP;

		const submitBodyFormSpy = vi
			.spyOn(getInternals(consumer), "submitBodyForm")
			.mockImplementation(() => {});

		await getInternals(consumer).open("https://host.example.com/widget");

		expect(openPopupSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				url: "about:blank",
			}),
		);
		const popupName = openPopupSpy.mock.calls[0]?.[0]?.name;
		expect(typeof popupName).toBe("string");
		expect(submitBodyFormSpy).toHaveBeenCalledWith(
			popupName,
			"https://host.example.com/widget?mode=embedded",
			expect.any(URLSearchParams),
		);
	});

	it("should append query params with ampersand when base URL already has query", () => {
		const consumer = createConsumer(
			{
				props: {
					token: { schema: prop.string(), queryParam: true },
				},
			},
			{ token: "abc123" },
		);

		const url = getInternals(consumer).buildUrl(
			"https://host.example.com/path?mode=embedded",
		);

		expect(url).toContain("mode=embedded&token=abc123");
	});

	it("should close popup windows and remove prerender elements during destroy", async () => {
		const consumer = createConsumer();
		const internal = getInternals(consumer);
		const popupWindow = createFrameWindow();
		const prerenderElement = document.createElement("div");
		const removeSpy = vi.spyOn(prerenderElement, "remove");
		const closePopupSpy = vi
			.spyOn(popupRender, "closePopup")
			.mockImplementation(() => {});

		internal.renderer.context = CONTEXT.POPUP;
		internal.transport.attachHostWindow(popupWindow, HOST_ORIGIN);
		internal.renderer.prerenderElement = prerenderElement;

		await getInternals(consumer).destroy();

		expect(closePopupSpy).toHaveBeenCalledWith(popupWindow);
		expect(removeSpy).toHaveBeenCalledTimes(1);
	});
});
