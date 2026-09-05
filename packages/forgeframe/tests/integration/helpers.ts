/**
 * Shared cross-window helpers for ForgeFrame integration tests.
 *
 * Exercises consumer and host runtimes through real `postMessage` dispatch,
 * `window.name` bootstrap payloads, and `initHost()` running in a separate
 * jsdom window.
 */
import { JSDOM } from "jsdom";
import {
	createRequestMessage,
	serializeMessage,
} from "@/communication/protocol";
import { clearComponents, destroyAll } from "@/core/component";
import { clearHostInstance } from "@/core/host";
import { initHost } from "@/index";
import type { HostProps, HostPropsDefinition } from "@/types";

const DEFAULT_HOST_URL = "https://host.example.com/widget";
const GLOBAL_BINDINGS = ["window", "document", "self"] as const;

type GlobalBinding = (typeof GLOBAL_BINDINGS)[number];
type GlobalBindingSnapshot = Map<GlobalBinding, PropertyDescriptor | undefined>;

function captureGlobalBindings(): GlobalBindingSnapshot {
	const snapshot: GlobalBindingSnapshot = new Map();

	for (const binding of GLOBAL_BINDINGS) {
		snapshot.set(binding, Object.getOwnPropertyDescriptor(globalThis, binding));
	}

	return snapshot;
}

function setGlobalBinding(binding: GlobalBinding, value: unknown): void {
	Object.defineProperty(globalThis, binding, {
		configurable: true,
		writable: true,
		value,
	});
}

function restoreGlobalBindings(snapshot: GlobalBindingSnapshot): void {
	for (const binding of GLOBAL_BINDINGS) {
		const descriptor = snapshot.get(binding);
		if (descriptor) {
			Object.defineProperty(globalThis, binding, descriptor);
			continue;
		}

		Reflect.deleteProperty(globalThis, binding);
	}
}

function resolveRequestedOrigin(
	targetOrigin: Parameters<Window["postMessage"]>[1],
): string {
	if (typeof targetOrigin === "string") {
		return targetOrigin;
	}

	if (
		targetOrigin &&
		typeof targetOrigin === "object" &&
		"targetOrigin" in targetOrigin &&
		typeof targetOrigin.targetOrigin === "string"
	) {
		return targetOrigin.targetOrigin;
	}

	return "*";
}

function shouldDispatchMessage(
	requestedOrigin: string,
	targetOrigin: string,
	senderOrigin: string,
): boolean {
	if (requestedOrigin === "*") {
		return true;
	}

	if (requestedOrigin === "/") {
		return targetOrigin === senderOrigin;
	}

	try {
		return new URL(requestedOrigin, senderOrigin).origin === targetOrigin;
	} catch {
		return requestedOrigin === targetOrigin;
	}
}

function waitForNextTick(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

export interface FormSubmissionRecord {
	action: string;
	target: string;
	method: string;
	fields: Record<string, string>;
}

export interface PopupOpenRecord {
	url: string;
	name: string;
	features: string;
}

function collectFormFields(form: HTMLFormElement): Record<string, string> {
	const fields: Record<string, string> = {};

	for (const element of Array.from(form.elements)) {
		if (!(element instanceof HTMLInputElement)) {
			continue;
		}

		if (!element.name) {
			continue;
		}

		fields[element.name] = element.value;
	}

	return fields;
}

export function dispatchForgeFrameRequest(options: {
	targetWindow: Window & typeof globalThis;
	sourceWindow: Window;
	origin: string;
	name: string;
	data?: unknown;
	claimedUid?: string;
	claimedDomain?: string;
}): void {
	const request = createRequestMessage(
		`integration-${options.name}-${Math.random().toString(36).slice(2)}`,
		options.name,
		options.data ?? {},
		{
			uid: options.claimedUid ?? "integration-source",
			domain: options.claimedDomain ?? options.origin,
		},
	);

	options.targetWindow.dispatchEvent(
		new options.targetWindow.MessageEvent("message", {
			data: serializeMessage(request),
			origin: options.origin,
			source: options.sourceWindow,
		}),
	);
}

export function readLastPostedMessageData(sourceWindow: Window): unknown {
	const calls = (
		sourceWindow as unknown as {
			postMessage?: { mock?: { calls: unknown[][] } };
		}
	).postMessage;

	if (!calls || typeof calls !== "function" || !calls.mock) {
		return undefined;
	}

	const lastCall = calls.mock.calls.at(-1);
	if (!lastCall || typeof lastCall[0] !== "string") {
		return undefined;
	}

	return JSON.parse(lastCall[0].slice("forgeframe:".length)).data;
}

interface BaseIntegrationHarness {
	consumerWindow: Window & typeof globalThis;
	consumerOrigin: string;
	hostWindow: Window & typeof globalThis;
	hostOrigin: string;
	withHostGlobals: <T>(callback: () => T) => T;
	withHostGlobalsAsync: <T>(callback: () => Promise<T>) => Promise<T>;
	bootstrapHost: <P extends Record<string, unknown>>(
		propDefinitions?: HostPropsDefinition<P>,
	) => ReturnType<typeof initHost<P>>;
	getHostProps: <P extends Record<string, unknown>>() => HostProps<P>;
	getLastFormSubmission: () => FormSubmissionRecord | null;
	flushMessages: () => Promise<void>;
	cleanup: () => Promise<void>;
}

export interface IframeIntegrationHarness extends BaseIntegrationHarness {
	waitForIframe: (container?: ParentNode) => Promise<HTMLIFrameElement>;
	attachHostToIframe: (iframe: HTMLIFrameElement) => void;
	bootstrapHost: <P extends Record<string, unknown>>(
		propDefinitions?: HostPropsDefinition<P>,
	) => ReturnType<typeof initHost<P>>;
	bootstrapIframeHost: <P extends Record<string, unknown>>(
		container: ParentNode,
		propDefinitions?: HostPropsDefinition<P>,
	) => Promise<{
		host: NonNullable<ReturnType<typeof initHost<P>>>;
		hostProps: HostProps<P>;
		iframe: HTMLIFrameElement;
	}>;
}

export interface PopupIntegrationHarness extends BaseIntegrationHarness {
	waitForPopupOpen: () => Promise<PopupOpenRecord>;
	getLastPopupOpen: () => PopupOpenRecord | null;
	blockNextPopup: () => void;
	bootstrapPopupHost: <P extends Record<string, unknown>>(
		propDefinitions?: HostPropsDefinition<P>,
	) => Promise<{
		host: NonNullable<ReturnType<typeof initHost<P>>>;
		hostProps: HostProps<P>;
	}>;
}

/**
 * Creates a shared cross-window integration harness backed by two jsdom windows.
 */
function createBaseIntegrationHarness(options?: {
	hostUrl?: string;
	popup?: boolean;
}): BaseIntegrationHarness & {
	attachHostToIframe: (iframe: HTMLIFrameElement) => void;
	waitForIframe: (container?: ParentNode) => Promise<HTMLIFrameElement>;
	waitForPopupOpen: () => Promise<PopupOpenRecord>;
	getLastPopupOpen: () => PopupOpenRecord | null;
	blockNextPopup: () => void;
	bootstrapIframeHost: <P extends Record<string, unknown>>(
		container: ParentNode,
		propDefinitions?: HostPropsDefinition<P>,
	) => Promise<{
		host: NonNullable<ReturnType<typeof initHost<P>>>;
		hostProps: HostProps<P>;
		iframe: HTMLIFrameElement;
	}>;
	bootstrapPopupHost: <P extends Record<string, unknown>>(
		propDefinitions?: HostPropsDefinition<P>,
	) => Promise<{
		host: NonNullable<ReturnType<typeof initHost<P>>>;
		hostProps: HostProps<P>;
	}>;
} {
	const consumerWindow = window as Window & typeof globalThis;
	const consumerOrigin = consumerWindow.location.origin;

	const hostDom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: options?.hostUrl ?? DEFAULT_HOST_URL,
		pretendToBeVisual: true,
	});
	const hostWindow = hostDom.window as unknown as Window & typeof globalThis;
	const hostOrigin = hostWindow.location.origin;

	const originalConsumerPostMessage =
		consumerWindow.postMessage.bind(consumerWindow);
	const originalHostPostMessage = hostWindow.postMessage.bind(hostWindow);
	const originalWindowOpen = consumerWindow.open.bind(consumerWindow);
	const originalFormSubmit = consumerWindow.HTMLFormElement.prototype.submit;

	let cleanedUp = false;
	let popupBlocked = false;
	let lastFormSubmission: FormSubmissionRecord | null = null;
	let lastPopupOpen: PopupOpenRecord | null = null;
	let activeIframe: HTMLIFrameElement | null = null;
	let popupOpenResolve: ((record: PopupOpenRecord) => void) | null = null;
	let popupOpenPromise: Promise<PopupOpenRecord> | null = null;

	Object.defineProperty(hostWindow, "parent", {
		configurable: true,
		value: options?.popup ? hostWindow : consumerWindow,
	});
	Object.defineProperty(hostWindow, "opener", {
		configurable: true,
		value: options?.popup ? consumerWindow : null,
	});
	Object.defineProperty(hostWindow.document, "referrer", {
		configurable: true,
		value: `${consumerOrigin}/forgeframe-integration`,
	});
	Object.defineProperty(hostWindow, "focus", {
		configurable: true,
		writable: true,
		value: () => undefined,
	});

	const dispatchMessage = (
		targetWindow: Window & typeof globalThis,
		sourceWindow: Window & typeof globalThis,
		sourceOrigin: string,
		targetOrigin: string,
		data: unknown,
		requestedOrigin: string,
	): void => {
		if (!shouldDispatchMessage(requestedOrigin, targetOrigin, sourceOrigin)) {
			return;
		}

		queueMicrotask(() => {
			const event = new targetWindow.MessageEvent("message", {
				data,
				origin: sourceOrigin,
				source: sourceWindow,
			});

			targetWindow.dispatchEvent(event);
		});
	};

	consumerWindow.postMessage = ((
		data: unknown,
		targetOrigin?: string | WindowPostMessageOptions,
	) => {
		dispatchMessage(
			consumerWindow,
			hostWindow,
			hostOrigin,
			consumerOrigin,
			data,
			resolveRequestedOrigin(targetOrigin ?? "*"),
		);
	}) as Window["postMessage"];

	hostWindow.postMessage = ((
		data: unknown,
		targetOrigin?: string | WindowPostMessageOptions,
	) => {
		dispatchMessage(
			hostWindow,
			consumerWindow,
			consumerOrigin,
			hostOrigin,
			data,
			resolveRequestedOrigin(targetOrigin ?? "*"),
		);
	}) as Window["postMessage"];

	if (options?.popup) {
		consumerWindow.open = ((
			url?: string | URL,
			name?: string,
			features?: string,
		): Window | null => {
			if (popupBlocked) {
				popupBlocked = false;
				return null;
			}

			const popupUrl = typeof url === "string" ? url : (url?.toString() ?? "");
			const record: PopupOpenRecord = {
				url: popupUrl,
				name: name ?? "",
				features: features ?? "",
			};

			lastPopupOpen = record;
			hostWindow.name = record.name;

			try {
				hostDom.reconfigure({
					url: popupUrl || options.hostUrl || DEFAULT_HOST_URL,
				});
			} catch {
				hostDom.reconfigure({ url: options?.hostUrl ?? DEFAULT_HOST_URL });
			}

			if (!popupOpenPromise) {
				popupOpenPromise = new Promise((resolve) => {
					popupOpenResolve = resolve;
				});
			}
			popupOpenResolve?.(record);
			popupOpenResolve = null;

			return hostWindow;
		}) as Window["open"];
	}

	consumerWindow.HTMLFormElement.prototype.submit = function submit(
		this: HTMLFormElement,
	): void {
		lastFormSubmission = {
			action: this.action,
			target: this.target,
			method: (this.method || "get").toUpperCase(),
			fields: collectFormFields(this),
		};

		if (options?.popup) {
			if (!lastPopupOpen || this.target !== lastPopupOpen.name) {
				return;
			}
		} else if (activeIframe && this.target !== activeIframe.name) {
			return;
		}

		try {
			hostDom.reconfigure({ url: this.action });
		} catch {
			// Ignore invalid navigation targets in tests.
		}
	};

	const withHostGlobals = <T>(callback: () => T): T => {
		const snapshot = captureGlobalBindings();

		setGlobalBinding("window", hostWindow);
		setGlobalBinding("document", hostWindow.document);
		setGlobalBinding("self", hostWindow);

		try {
			return callback();
		} finally {
			restoreGlobalBindings(snapshot);
		}
	};

	const withHostGlobalsAsync = async <T>(
		callback: () => Promise<T>,
	): Promise<T> => {
		const snapshot = captureGlobalBindings();

		setGlobalBinding("window", hostWindow);
		setGlobalBinding("document", hostWindow.document);
		setGlobalBinding("self", hostWindow);

		try {
			return await callback();
		} finally {
			restoreGlobalBindings(snapshot);
		}
	};

	const waitForIframe = async (
		container: ParentNode = document,
	): Promise<HTMLIFrameElement> => {
		const timeoutAt = Date.now() + 1000;

		while (Date.now() < timeoutAt) {
			const iframe = container.querySelector("iframe");
			if (iframe instanceof consumerWindow.HTMLIFrameElement) {
				return iframe;
			}

			await waitForNextTick();
		}

		throw new Error(
			"Timed out waiting for the ForgeFrame iframe to be created",
		);
	};

	const attachHostToIframe = (iframe: HTMLIFrameElement): void => {
		activeIframe = iframe;
		Object.defineProperty(iframe, "contentWindow", {
			configurable: true,
			value: hostWindow,
		});
		Object.defineProperty(iframe, "contentDocument", {
			configurable: true,
			value: hostWindow.document,
		});
		Object.defineProperty(hostWindow, "frameElement", {
			configurable: true,
			value: iframe,
		});

		hostWindow.name = iframe.name;
		if (iframe.src && iframe.src !== "about:blank") {
			try {
				hostDom.reconfigure({ url: iframe.src });
			} catch {
				// Ignore invalid iframe navigation targets in tests.
			}
		}
	};

	const waitForPopupOpen = async (): Promise<PopupOpenRecord> => {
		if (lastPopupOpen) {
			return lastPopupOpen;
		}

		if (!popupOpenPromise) {
			popupOpenPromise = new Promise((resolve) => {
				popupOpenResolve = resolve;
			});
		}

		return popupOpenPromise;
	};

	const bootstrapHost = <P extends Record<string, unknown>>(
		propDefinitions?: HostPropsDefinition<P>,
	): ReturnType<typeof initHost<P>> => {
		return withHostGlobals(() => initHost(propDefinitions));
	};

	const getHostProps = <P extends Record<string, unknown>>(): HostProps<P> => {
		const hostProps = withHostGlobals(
			() => (window as unknown as { hostProps?: HostProps<P> }).hostProps,
		);

		if (!hostProps) {
			throw new Error("Expected window.hostProps to be initialized");
		}

		return hostProps;
	};

	const bootstrapIframeHost = async <P extends Record<string, unknown>>(
		container: ParentNode,
		propDefinitions?: HostPropsDefinition<P>,
	): Promise<{
		host: NonNullable<ReturnType<typeof initHost<P>>>;
		hostProps: HostProps<P>;
		iframe: HTMLIFrameElement;
	}> => {
		const iframe = await waitForIframe(container);
		attachHostToIframe(iframe);

		const host = bootstrapHost(propDefinitions);
		if (!host) {
			throw new Error("Expected initHost() to create a host instance");
		}

		return {
			host,
			hostProps: getHostProps<P>(),
			iframe,
		};
	};

	const bootstrapPopupHost = async <P extends Record<string, unknown>>(
		propDefinitions?: HostPropsDefinition<P>,
	): Promise<{
		host: NonNullable<ReturnType<typeof initHost<P>>>;
		hostProps: HostProps<P>;
	}> => {
		await waitForPopupOpen();

		const host = bootstrapHost(propDefinitions);
		if (!host) {
			throw new Error("Expected initHost() to create a host instance");
		}

		return {
			host,
			hostProps: getHostProps<P>(),
		};
	};

	const getLastFormSubmission = (): FormSubmissionRecord | null =>
		lastFormSubmission;

	const getLastPopupOpen = (): PopupOpenRecord | null => lastPopupOpen;

	const blockNextPopup = (): void => {
		popupBlocked = true;
	};

	const flushMessages = async (): Promise<void> => {
		await Promise.resolve();
		await Promise.resolve();
		await waitForNextTick();
		await Promise.resolve();
	};

	const cleanup = async (): Promise<void> => {
		if (cleanedUp) {
			return;
		}
		cleanedUp = true;

		try {
			await destroyAll();
		} finally {
			clearComponents();
			withHostGlobals(() => {
				clearHostInstance();
			});
			delete (consumerWindow as unknown as { hostProps?: unknown }).hostProps;

			consumerWindow.postMessage = originalConsumerPostMessage;
			hostWindow.postMessage = originalHostPostMessage;
			consumerWindow.open = originalWindowOpen;
			consumerWindow.HTMLFormElement.prototype.submit = originalFormSubmit;
			consumerWindow.document.body.innerHTML = "";
			hostWindow.close();
		}
	};

	return {
		consumerWindow,
		consumerOrigin,
		hostWindow,
		hostOrigin,
		withHostGlobals,
		withHostGlobalsAsync,
		getLastFormSubmission,
		flushMessages,
		waitForIframe,
		attachHostToIframe,
		waitForPopupOpen,
		getLastPopupOpen,
		blockNextPopup,
		bootstrapHost,
		bootstrapIframeHost,
		bootstrapPopupHost,
		getHostProps,
		cleanup,
	};
}

/**
 * Creates a consumer/host iframe harness backed by two jsdom windows.
 */
export function createIframeIntegrationHarness(options?: {
	hostUrl?: string;
}): IframeIntegrationHarness {
	return createBaseIntegrationHarness(options);
}

/**
 * Creates a consumer/host popup harness backed by two jsdom windows.
 */
export function createPopupIntegrationHarness(options?: {
	hostUrl?: string;
}): PopupIntegrationHarness {
	return createBaseIntegrationHarness({
		...options,
		popup: true,
	});
}
