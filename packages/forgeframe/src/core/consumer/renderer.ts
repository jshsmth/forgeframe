import type { ContextType } from "../../constants";
import { CONTEXT } from "../../constants";
import {
	createIframeElement,
	destroyIframe,
	focusIframe,
	hideIframe,
	resizeIframe,
	showIframe,
} from "../../render/iframe";
import {
	closePopup,
	focusPopup,
	openPopup,
	resizePopup,
	watchPopupClose,
} from "../../render/popup";
import {
	applyDimensions,
	defaultContainerTemplate,
	defaultPrerenderTemplate,
	swapPrerenderContent,
} from "../../render/templates";
import type { TemplateContext } from "../../types/templates";
import type { Dimensions } from "../../types/utility";
import type { NormalizedOptions } from "./types";

/**
 * Parameters required to open iframe/popup host content.
 * @internal
 */
export interface ConsumerOpenParams {
	baseUrl: string;
	assertActive: () => void;
	buildUrl: (baseUrl: string) => string;
	buildBodyParams: () => URLSearchParams;
	buildWindowName: () => string;
	submitBodyForm: (
		target: string,
		actionUrl: string,
		params: URLSearchParams,
	) => void;
	onPopupClose: () => void;
	registerCleanup: (cleanupFn: () => void) => void;
}

/**
 * Owns consumer rendering concerns (container resolution, prerender, iframe/popup lifecycle).
 * @internal
 */
export class ConsumerRenderer<
	P extends Record<string, unknown>,
	SchemaInputs = P,
> {
	/** Active rendering context. */
	public context: ContextType;

	/** Active iframe instance when rendering in iframe mode. */
	public iframe: HTMLIFrameElement | null = null;

	/** Resolved container element. */
	public container: HTMLElement | null = null;

	/** Prerender element currently displayed while host initializes. */
	public prerenderElement: HTMLElement | null = null;

	/** Wrapper element created and owned by the renderer. */
	private ownedContainer: HTMLElement | null = null;

	/** Caller mount retained while templates replace the active container. */
	private mountContainer: HTMLElement | null = null;

	/** Explicit visibility requests remain separate from the loading placeholder. */
	private hidden = false;

	constructor(
		private options: NormalizedOptions<P, SchemaInputs>,
		private uid: string,
		private getProps: () => P,
		private resolveDimensions: () => Dimensions,
		private callbacks: {
			close: () => Promise<void>;
			focus: () => Promise<void>;
		},
	) {
		this.context = this.options.defaultContext;
	}

	/**
	 * Resolves a container selector or element to an HTMLElement.
	 */
	resolveContainer(container?: string | HTMLElement): HTMLElement {
		if (!container) {
			throw new Error("Container is required for rendering");
		}

		if (typeof container === "string") {
			const el = document.querySelector(container);
			if (!el) {
				throw new Error(`Container "${container}" not found`);
			}
			return el as HTMLElement;
		}

		return container;
	}

	/**
	 * Creates and displays prerender/loading content.
	 */
	async prerender(
		createIframeElement: (windowName: string) => HTMLIFrameElement,
		buildWindowName: () => string,
		assertActive: () => void,
	): Promise<void> {
		if (!this.container) return;

		const mountContainer = this.container;
		this.mountContainer = mountContainer;
		this.ownedContainer = null;

		const props = this.getProps();
		const prerenderTemplateFn =
			this.options.prerenderTemplate ?? defaultPrerenderTemplate;
		const containerTemplateFn =
			this.options.containerTemplate ?? defaultContainerTemplate;

		const dimensions = this.resolveDimensions();
		assertActive();
		const cspNonce = (props as Record<string, unknown>).cspNonce as
			| string
			| undefined;

		if (this.context === CONTEXT.IFRAME) {
			const windowName = buildWindowName();
			assertActive();
			this.iframe = createIframeElement(windowName);
			assertActive();
			hideIframe(this.iframe);
		}

		const prerenderContext = this.createTemplateContext(
			props,
			dimensions,
			mountContainer,
			null,
			cspNonce,
		);
		this.prerenderElement = prerenderTemplateFn(prerenderContext);
		assertActive();
		const templateContext = this.createTemplateContext(
			props,
			dimensions,
			mountContainer,
			this.prerenderElement,
			cspNonce,
		);

		const containerEl = containerTemplateFn(templateContext);
		assertActive();
		this.mountPrerenderContent(mountContainer, containerEl, assertActive);
	}

	/** Constructs template data without invoking user templates. */
	private createTemplateContext(
		props: P,
		dimensions: Dimensions,
		container: HTMLElement,
		prerenderFrame: HTMLElement | null,
		cspNonce?: string,
	): TemplateContext<P> & { cspNonce?: string } {
		return {
			uid: this.uid,
			tag: this.options.tag,
			context: this.context,
			dimensions,
			props,
			doc: document,
			container,
			frame: this.iframe,
			prerenderFrame,
			close: () => this.callbacks.close(),
			focus: () => this.callbacks.focus(),
			cspNonce,
		};
	}

	/** Mounts only renderer-owned artifacts, checking cancellation after each DOM action. */
	private mountPrerenderContent(
		mountContainer: HTMLElement,
		containerEl: HTMLElement | null | undefined,
		assertActive: () => void,
	): void {
		if (containerEl) {
			if (containerEl !== mountContainer) {
				const ownsContainer = !containerEl.parentNode;
				if (ownsContainer) {
					this.ownedContainer = containerEl;
				}
				mountContainer.appendChild(containerEl);
				assertActive();
			}
			this.container = containerEl;
		}

		if (this.prerenderElement && !this.prerenderElement.parentNode) {
			(this.container as HTMLElement).appendChild(this.prerenderElement);
			assertActive();
		}
		if (this.iframe && !this.iframe.parentNode) {
			(this.container as HTMLElement).appendChild(this.iframe);
			assertActive();
		}
	}

	/**
	 * Creates an iframe element without setting src (for prerender phase).
	 */
	createIframeElement(windowName: string): HTMLIFrameElement {
		const dimensions = this.resolveDimensions();
		const props = this.getProps();
		const attributes =
			typeof this.options.attributes === "function"
				? this.options.attributes(props)
				: (this.options.attributes ?? {});
		const style =
			typeof this.options.style === "function"
				? this.options.style(props)
				: (this.options.style ?? {});

		return createIframeElement({
			name: windowName,
			dimensions,
			attributes,
			style,
		});
	}

	/**
	 * Opens host content in iframe or popup context.
	 */
	open(params: ConsumerOpenParams): Window | null {
		const url = params.buildUrl(params.baseUrl);
		params.assertActive();
		const bodyParams = params.buildBodyParams();
		params.assertActive();
		const hasBodyParams = bodyParams.toString().length > 0;

		return this.context === CONTEXT.IFRAME
			? this.openIframe(params, url, bodyParams, hasBodyParams)
			: this.openPopup(params, url, bodyParams, hasBodyParams);
	}

	private openIframe(
		params: ConsumerOpenParams,
		url: string,
		bodyParams: URLSearchParams,
		hasBodyParams: boolean,
	): Window | null {
		if (!this.iframe) {
			throw new Error("Iframe not created during prerender");
		}

		params.assertActive();
		if (hasBodyParams) {
			params.submitBodyForm(this.iframe.name, url, bodyParams);
		} else {
			this.iframe.src = url;
		}

		return this.iframe.contentWindow;
	}

	private openPopup(
		params: ConsumerOpenParams,
		url: string,
		bodyParams: URLSearchParams,
		hasBodyParams: boolean,
	): Window {
		const windowName = params.buildWindowName();
		params.assertActive();
		const dimensions = this.resolveDimensions();
		params.assertActive();
		const popup = openPopup({
			url: hasBodyParams ? "about:blank" : url,
			name: windowName,
			dimensions,
		});

		try {
			params.assertActive();
			if (hasBodyParams) {
				params.submitBodyForm(windowName, url, bodyParams);
			}
		} catch (error) {
			closePopup(popup);
			throw error;
		}

		const stopWatching = watchPopupClose(popup, () => {
			params.onPopupClose();
		});
		params.registerCleanup(stopWatching);

		return popup;
	}

	/**
	 * Completes transient loading content after initialization in either context.
	 */
	async completePrerender(): Promise<void> {
		if (this.context === CONTEXT.IFRAME && this.iframe && this.container) {
			await swapPrerenderContent(
				this.container,
				this.prerenderElement,
				this.iframe,
				() => !this.hidden,
			);
			this.prerenderElement = null;
		} else if (this.context === CONTEXT.POPUP) {
			this.prerenderElement?.remove();
			this.prerenderElement = null;
			if (this.ownedContainer && !this.options.containerTemplate) {
				this.ownedContainer.remove();
				this.ownedContainer = null;
				this.container = this.mountContainer;
			}
		}
	}

	/**
	 * Submits a hidden form to navigate a target window via POST.
	 */
	submitBodyForm(
		target: string,
		actionUrl: string,
		params: URLSearchParams,
	): void {
		const doc = this.container?.ownerDocument ?? document;
		const root = doc.body ?? doc.documentElement;
		if (!root) {
			throw new Error(
				"Document root is unavailable for bodyParam form submission",
			);
		}

		const form = doc.createElement("form");
		form.method = "POST";
		form.action = actionUrl;
		form.target = target;
		form.style.display = "none";
		const formPrototype = Object.getPrototypeOf(form) as HTMLFormElement;

		try {
			for (const [key, value] of params.entries()) {
				const input = doc.createElement("input");
				input.type = "hidden";
				input.name = key;
				input.value = value;
				formPrototype.appendChild.call(form, input);
			}

			root.appendChild(form);
			// Named form controls can shadow methods on the form instance.
			formPrototype.submit.call(form);
		} finally {
			formPrototype.remove.call(form);
		}
	}

	/**
	 * Focuses iframe/popup context.
	 */
	focus(hostWindow: Window | null): void {
		if (this.context === CONTEXT.IFRAME && this.iframe) {
			focusIframe(this.iframe);
		} else if (this.context === CONTEXT.POPUP && hostWindow) {
			focusPopup(hostWindow);
		}
	}

	/**
	 * Resizes iframe/popup context.
	 */
	resize(dimensions: Dimensions, hostWindow: Window | null): void {
		if (this.context === CONTEXT.IFRAME && this.iframe) {
			resizeIframe(this.iframe, dimensions);
			if (this.ownedContainer && !this.options.containerTemplate) {
				applyDimensions(this.ownedContainer, dimensions);
			}
			if (this.prerenderElement && !this.options.prerenderTemplate) {
				applyDimensions(this.prerenderElement, dimensions);
			}
		} else if (this.context === CONTEXT.POPUP && hostWindow) {
			resizePopup(hostWindow, dimensions);
		}
	}

	/**
	 * Shows iframe context.
	 */
	show(): void {
		if (this.context === CONTEXT.IFRAME) {
			this.hidden = false;
			if (this.iframe) showIframe(this.iframe);
		}
	}

	/**
	 * Hides iframe context.
	 */
	hide(): void {
		if (this.context === CONTEXT.IFRAME) {
			this.hidden = true;
			if (this.iframe) hideIframe(this.iframe);
		}
	}

	/**
	 * Destroys rendered iframe/popup DOM artifacts.
	 */
	destroy(hostWindow: Window | null): void {
		if (this.iframe) {
			destroyIframe(this.iframe);
			this.iframe = null;
		}

		if (this.context === CONTEXT.POPUP && hostWindow) {
			closePopup(hostWindow);
		}

		if (this.prerenderElement) {
			this.prerenderElement.remove();
			this.prerenderElement = null;
		}

		if (this.ownedContainer) {
			this.ownedContainer.remove();
			this.ownedContainer = null;
		}

		this.container = null;
		this.mountContainer = null;
	}
}
