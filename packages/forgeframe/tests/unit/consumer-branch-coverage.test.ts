/**
 * Branch coverage tests for `@/core/consumer` internals.
 *
 * Covers domain trust variants, render helper delegation, prop update edge paths, and guarded branches around URL/origin handling.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTEXT, EVENT } from "@/constants";
import { ConsumerComponent } from "@/core/consumer";
import { emitConsumerError } from "@/core/consumer/callbacks";
import { buildNestedHostRefs } from "@/core/consumer/child-refs";
import { EventEmitter } from "@/events/emitter";
import { prop } from "@/props/prop";
import * as iframeRender from "@/render/iframe";
import * as popupRender from "@/render/popup";

const createdConsumers: Array<ConsumerComponent<Record<string, unknown>>> = [];

type ConsumerInternals = {
	transport: {
		hostWindow: Window | null;
		openedHostDomain: string | null;
		messenger: {
			allowedOrigins: Set<string>;
			allowedOriginPatterns: RegExp[];
			addTrustedDomain: (domain: string) => void;
			send: (...args: unknown[]) => Promise<unknown>;
		};
		bridge: {
			localFunctionCount: number;
			localFunctions: Map<string, unknown>;
		};
	};
	renderer: {
		context: string;
		iframe: HTMLIFrameElement | null;
		container: HTMLElement | null;
		prerenderElement: HTMLElement | null;
	};
	propsPipeline: {
		props: Record<string, unknown>;
	};
	cleanup: {
		register: (cleanupFn: () => void) => void;
	};
	options: Record<string, unknown>;
	resolveUrlOrigin: (url: string) => string | null;
	syncTrustedDomainForUrl: (url: string) => void;
	createPropContext: () => {
		close: () => Promise<void>;
		focus: () => Promise<void>;
		onError: (err: Error) => void;
	};
	resolveContainer: (container?: string | HTMLElement) => HTMLElement;
	checkEligibility: () => void;
	prerender: () => Promise<void>;
	createIframeElement: (windowName: string) => HTMLIFrameElement;
	open: () => Promise<void>;
	submitBodyForm: (
		target: string,
		actionUrl: string,
		params: URLSearchParams,
	) => void;
	buildUrl: (baseUrl?: string) => string;
	getHostDomain: () => string;
	destroy: () => Promise<void>;
};

function getInternals(
	component: ConsumerComponent<Record<string, unknown>>,
): ConsumerInternals {
	return component as unknown as ConsumerInternals;
}

/**
 * Creates a consumer instance and tracks it for teardown at the end of each test.
 */
function createConsumer(
	options: Record<string, unknown> = {},
	props: Record<string, unknown> = {},
): ConsumerComponent<Record<string, unknown>> {
	const consumer = new ConsumerComponent<Record<string, unknown>>(
		{
			tag: "consumer-internal-branches-component",
			url: "https://host.example.com/widget",
			...options,
		} as never,
		props,
	);
	createdConsumers.push(consumer);
	return consumer;
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
			domain: "https://trusted.example.com",
		});
		const allowedOrigins = Array.from(
			getInternals(consumer).transport.messenger.allowedOrigins,
		);

		expect(allowedOrigins).toContain("https://trusted.example.com");
	});

	it("should trust domain option when configured as array", () => {
		const consumer = createConsumer({
			url: "https://trusted-a.example.com/widget",
			domain: [
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
			domain: [
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
			domain: /^https:\/\/.*\.trusted\.example\.com$/,
		});
		const patterns =
			getInternals(consumer).transport.messenger.allowedOriginPatterns;

		expect(patterns).toHaveLength(1);
		expect(patterns[0].test("https://api.trusted.example.com")).toBe(true);
	});

	it("should delegate renderTo to render", async () => {
		const consumer = createConsumer();
		const renderSpy = vi.spyOn(consumer, "render").mockResolvedValue(undefined);
		const container = document.createElement("div");

		await (
			consumer as unknown as {
				renderTo: (
					win: Window,
					container?: string | HTMLElement,
					context?: "iframe" | "popup",
				) => Promise<void>;
			}
		).renderTo(window, container, CONTEXT.POPUP);

		expect(renderSpy).toHaveBeenCalledWith(container, CONTEXT.POPUP);
	});

	it("should throw when renderTo receives a different window", async () => {
		const consumer = createConsumer();
		const renderSpy = vi.spyOn(consumer, "render").mockResolvedValue(undefined);
		const otherWindow = {} as Window;

		await expect(
			(
				consumer as unknown as {
					renderTo: (
						win: Window,
						container?: string | HTMLElement,
						context?: "iframe" | "popup",
					) => Promise<void>;
				}
			).renderTo(otherWindow),
		).rejects.toThrow(
			"Cross-window renderTo is not supported; pass the current window",
		);

		expect(renderSpy).not.toHaveBeenCalled();
	});

	it("should focus iframe and popup contexts through dedicated render helpers", async () => {
		const consumer = createConsumer();
		const internal = getInternals(consumer);
		const iframe = document.createElement("iframe");
		const popup = { closed: false, focus: vi.fn() } as unknown as Window;
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
		internal.transport.hostWindow = popup;

		await consumer.focus();
		expect(focusPopupSpy).toHaveBeenCalledWith(popup);
	});

	it("should resize/show/hide through iframe and popup render helpers", async () => {
		const consumer = createConsumer();
		const internal = getInternals(consumer);
		const iframe = document.createElement("iframe");
		const popup = { closed: false } as unknown as Window;

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
			.mockImplementation(() => {});

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
		internal.transport.hostWindow = popup;

		await consumer.resize({ width: 480, height: 300 });
		expect(resizePopupSpy).toHaveBeenCalledWith(popup, {
			width: 480,
			height: 300,
		});
	});

	it("should reject invalid origins when resolving URL origin", () => {
		const consumer = createConsumer();
		expect(() => getInternals(consumer).resolveUrlOrigin("http://%")).toThrow(
			"Invalid component URL",
		);
	});

	it("should reject a URL origin outside the configured domain policy", () => {
		expect(() =>
			createConsumer({ domain: "https://trusted.example.com" }),
		).toThrow("is not allowed by the configured domain policy");
	});

	it("should reject invalid URLs during trusted-domain sync", () => {
		const consumer = createConsumer();
		expect(() =>
			getInternals(consumer).syncTrustedDomainForUrl("http://%"),
		).toThrow("Invalid component URL");
	});

	it("should expose working close/focus/onError callbacks from prop context", () => {
		const consumer = createConsumer();
		const closeSpy = vi.spyOn(consumer, "close").mockResolvedValue(undefined);
		const focusSpy = vi.spyOn(consumer, "focus").mockResolvedValue(undefined);
		const onError = vi.fn();
		consumer.event.on(EVENT.ERROR, onError);

		const ctx = getInternals(consumer).createPropContext();

		void ctx.close();
		void ctx.focus();
		ctx.onError(new Error("context-error"));

		expect(closeSpy).toHaveBeenCalledTimes(1);
		expect(focusSpy).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(expect.any(Error));
	});

	it("should provide initial user props to value callbacks during construction", () => {
		const consumer = createConsumer(
			{
				props: {
					derived: {
						schema: prop.string(),
						value: (ctx: { props: Record<string, unknown> }) =>
							`seed:${ctx.props.seed}`,
					},
				},
			},
			{ seed: "abc" },
		);

		const internalProps = getInternals(consumer).propsPipeline.props;
		expect(internalProps.derived).toBe("seed:abc");
	});

	it("should preserve materialized value props on unrelated updateProps patches", async () => {
		let derivedCalls = 0;
		const consumer = createConsumer(
			{
				props: {
					seed: {
						schema: prop.string(),
						required: true,
					},
					amount: {
						schema: prop.number().optional(),
					},
					derived: {
						schema: prop.string(),
						value: (ctx: { props: Record<string, unknown> }) => {
							derivedCalls += 1;
							return `seed:${ctx.props.seed}`;
						},
					},
				},
			},
			{ seed: "abc" },
		);

		await consumer.updateProps({ amount: 1 });

		const internalProps = getInternals(consumer).propsPipeline.props;
		expect(internalProps.seed).toBe("abc");
		expect(internalProps.amount).toBe(1);
		expect(internalProps.derived).toBe("seed:abc");
		expect(derivedCalls).toBe(1);
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

		getInternals(consumer).transport.hostWindow = window;

		vi.spyOn(
			getInternals(consumer).transport.messenger,
			"send",
		).mockResolvedValue(undefined);

		await consumer.updateProps({ onSubmit: vi.fn() });
		const firstBatchCount =
			getInternals(consumer).transport.bridge.localFunctionCount;

		await consumer.updateProps({ onSubmit: vi.fn() });
		const secondBatchCount =
			getInternals(consumer).transport.bridge.localFunctionCount;

		expect(firstBatchCount).toBe(1);
		expect(secondBatchCount).toBe(1);
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

		getInternals(consumer).transport.hostWindow = window;

		const bridge = getInternals(consumer).transport.bridge;

		const sendSpy = vi
			.spyOn(getInternals(consumer).transport.messenger, "send")
			.mockResolvedValue(undefined);

		await consumer.updateProps({ onSubmit: vi.fn() });
		const previousRefId = Array.from(bridge.localFunctions.keys())[0];
		expect(previousRefId).toBeDefined();
		if (!previousRefId) {
			throw new Error("Expected previous function ref ID");
		}

		sendSpy.mockImplementationOnce(async () => {
			if (!bridge.localFunctions.has(previousRefId)) {
				throw new Error(
					"Previous function ref was pruned before host acknowledged prop update",
				);
			}
			return undefined;
		});

		await expect(
			consumer.updateProps({ onSubmit: vi.fn() }),
		).resolves.toBeUndefined();
		expect(bridge.localFunctions.has(previousRefId)).toBe(false);
		expect(bridge.localFunctionCount).toBe(1);
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

		getInternals(consumer).transport.hostWindow = window;

		const bridge = getInternals(consumer).transport.bridge;

		let resolveFirstSend: (() => void) | null = null;
		let resolveSecondSend: (() => void) | null = null;
		const firstSend = new Promise<void>((resolve) => {
			resolveFirstSend = resolve;
		});
		const secondSend = new Promise<void>((resolve) => {
			resolveSecondSend = resolve;
		});

		const sendSpy = vi
			.spyOn(getInternals(consumer).transport.messenger, "send")
			.mockImplementation(async () => {
				return sendSpy.mock.calls.length === 1 ? firstSend : secondSend;
			});

		const firstUpdate = consumer.updateProps({ onSubmit: vi.fn() });
		const secondUpdate = consumer.updateProps({ onSubmit: vi.fn() });

		await Promise.resolve();
		expect(sendSpy).toHaveBeenCalledTimes(1);

		if (!resolveFirstSend) {
			throw new Error("Expected first send resolver to be initialized");
		}
		resolveFirstSend();
		await firstUpdate;

		await Promise.resolve();
		expect(sendSpy).toHaveBeenCalledTimes(2);

		if (!resolveSecondSend) {
			throw new Error("Expected second send resolver to be initialized");
		}
		resolveSecondSend();

		await expect(secondUpdate).resolves.toBeUndefined();
		expect(bridge.localFunctionCount).toBe(1);
	});

	it("should resolve existing selector containers to HTMLElement", () => {
		const consumer = createConsumer();
		const container = document.createElement("div");
		container.id = "resolve-container-target";
		document.body.appendChild(container);

		const resolved = (
			consumer as unknown as {
				resolveContainer: (container?: string | HTMLElement) => HTMLElement;
			}
		).resolveContainer("#resolve-container-target");

		expect(resolved).toBe(container);
	});

	it("should throw when eligibility check returns false", () => {
		const consumer = createConsumer({
			eligible: () => ({ eligible: false, reason: "Account blocked" }),
		});

		expect(() =>
			(
				consumer as unknown as {
					checkEligibility: () => void;
				}
			).checkEligibility(),
		).toThrow("Component not eligible: Account blocked");
	});

	it("should invoke close/focus callbacks exposed to prerender and container templates", async () => {
		const closeSpy = vi.fn().mockResolvedValue(undefined);
		const focusSpy = vi.fn().mockResolvedValue(undefined);
		const consumer = createConsumer({
			prerenderTemplate: (ctx: {
				close: () => Promise<void>;
				focus: () => Promise<void>;
			}) => {
				void ctx.close();
				void ctx.focus();
				return document.createElement("div");
			},
			containerTemplate: (ctx: {
				close: () => Promise<void>;
				focus: () => Promise<void>;
			}) => {
				void ctx.close();
				void ctx.focus();
				return document.createElement("div");
			},
		});

		vi.spyOn(consumer, "close").mockImplementation(closeSpy);
		vi.spyOn(consumer, "focus").mockImplementation(focusSpy);

		getInternals(consumer).renderer.container = document.createElement("div");

		await (
			consumer as unknown as {
				prerender: () => Promise<void>;
			}
		).prerender();

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

		const iframe = (
			consumer as unknown as {
				createIframeElement: (windowName: string) => HTMLIFrameElement;
			}
		).createIframeElement("window-name");

		expect(iframe.hasAttribute("allowfullscreen")).toBe(true);
		expect(iframe.getAttribute("title")).toBe("Hosted iframe");
		expect(iframe.style.getPropertyValue("margin-top")).toBe("8px");
		expect(iframe.style.getPropertyValue("border")).toBe("1px solid red");
	});

	it("should apply default sandbox when creating iframe element without a sandbox attribute", () => {
		const consumer = createConsumer();

		const iframe = (
			consumer as unknown as {
				createIframeElement: (windowName: string) => HTMLIFrameElement;
			}
		).createIframeElement("window-name");

		expect(iframe.getAttribute("sandbox")).toBe(
			"allow-scripts allow-same-origin allow-forms allow-popups",
		);
	});

	it("should preserve an explicit sandbox when creating iframe element", () => {
		const consumer = createConsumer({
			attributes: {
				sandbox: "allow-scripts allow-forms",
			},
		});

		const iframe = (
			consumer as unknown as {
				createIframeElement: (windowName: string) => HTMLIFrameElement;
			}
		).createIframeElement("window-name");

		expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-forms");
	});

	it("should preserve an explicit empty sandbox when creating iframe element", () => {
		const consumer = createConsumer({
			attributes: {
				sandbox: "",
			},
		});

		const iframe = (
			consumer as unknown as {
				createIframeElement: (windowName: string) => HTMLIFrameElement;
			}
		).createIframeElement("window-name");

		expect(iframe.getAttribute("sandbox")).toBe("");
	});

	it("should open popup context and register popup close watcher cleanup", async () => {
		const consumer = createConsumer({
			dimensions: { width: 460, height: 320 },
		});
		const internal = getInternals(consumer);
		const popupWindow = { closed: false } as unknown as Window;
		const stopWatching = vi.fn();
		const openPopupSpy = vi
			.spyOn(popupRender, "openPopup")
			.mockReturnValue(popupWindow);
		const watchSpy = vi
			.spyOn(popupRender, "watchPopupClose")
			.mockReturnValue(stopWatching);
		const cleanupRegisterSpy = vi.spyOn(internal.cleanup, "register");

		internal.renderer.context = CONTEXT.POPUP;

		await (
			consumer as unknown as {
				open: () => Promise<void>;
			}
		).open();

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
		internal.renderer.context = CONTEXT.IFRAME;
		internal.renderer.iframe = iframe;

		const submitBodyFormSpy = vi
			.spyOn(
				consumer as unknown as {
					submitBodyForm: (
						target: string,
						actionUrl: string,
						params: URLSearchParams,
					) => void;
				},
				"submitBodyForm",
			)
			.mockImplementation(() => {});

		await (
			consumer as unknown as {
				open: () => Promise<void>;
			}
		).open();

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

		const popupWindow = { closed: false } as unknown as Window;
		const stopWatching = vi.fn();
		const openPopupSpy = vi
			.spyOn(popupRender, "openPopup")
			.mockReturnValue(popupWindow);
		vi.spyOn(popupRender, "watchPopupClose").mockReturnValue(stopWatching);
		getInternals(consumer).renderer.context = CONTEXT.POPUP;

		const submitBodyFormSpy = vi
			.spyOn(
				consumer as unknown as {
					submitBodyForm: (
						target: string,
						actionUrl: string,
						params: URLSearchParams,
					) => void;
				},
				"submitBodyForm",
			)
			.mockImplementation(() => {});

		await (
			consumer as unknown as {
				open: () => Promise<void>;
			}
		).open();

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

		const url = (
			consumer as unknown as {
				buildUrl: (baseUrl?: string) => string;
			}
		).buildUrl("https://host.example.com/path?mode=embedded");

		expect(url).toContain("mode=embedded&token=abc123");
	});

	it("should throw when child component metadata cannot be resolved", () => {
		const consumer = createConsumer({
			children: () => ({
				InvalidChild: (() => undefined) as unknown as (
					...args: unknown[]
				) => unknown,
			}),
		});

		expect(() =>
			buildNestedHostRefs(
				getInternals(consumer).options as {
					children?: (args: {
						props: Record<string, unknown>;
					}) => Record<string, unknown>;
				},
				getInternals(consumer).propsPipeline.props,
			),
		).toThrow('Nested component "InvalidChild" is missing component metadata');
	});

	it("should close popup windows and remove prerender elements during destroy", async () => {
		const consumer = createConsumer();
		const internal = getInternals(consumer);
		const popupWindow = { closed: false, close: vi.fn() } as unknown as Window;
		const prerenderElement = document.createElement("div");
		const removeSpy = vi.spyOn(prerenderElement, "remove");
		const closePopupSpy = vi
			.spyOn(popupRender, "closePopup")
			.mockImplementation(() => {});

		internal.renderer.context = CONTEXT.POPUP;
		internal.transport.hostWindow = popupWindow;
		internal.renderer.prerenderElement = prerenderElement;

		await (
			consumer as unknown as {
				destroy: () => Promise<void>;
			}
		).destroy();

		expect(closePopupSpy).toHaveBeenCalledWith(popupWindow);
		expect(removeSpy).toHaveBeenCalledTimes(1);
	});

	it("should emit error events before invoking the onError prop callback helper", () => {
		const order: string[] = [];
		const event = new EventEmitter();
		const error = new Error("helper-error");

		event.on(EVENT.ERROR, () => {
			order.push("event");
		});

		emitConsumerError(
			event,
			{
				onError: (received: Error) => {
					order.push("callback");
					expect(received).toBe(error);
				},
			},
			error,
		);

		expect(order).toEqual(["event", "callback"]);
	});
});
