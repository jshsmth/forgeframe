/**
 * @packageDocumentation
 * Consumer component implementation module.
 *
 * @remarks
 * This module contains the ConsumerComponent class which handles the consumer-side
 * (the app embedding the component) rendering and communication with host components
 * embedded in iframes or popups.
 */

import type { ContextType } from "../constants";
import { CONTEXT, EVENT } from "../constants";
import { createEventSubscriber, EventEmitter } from "../events/emitter";
import {
	getPropsForHost,
	propsToBodyParams,
	propsToQueryParams,
} from "../props";
import { EMPTY_PROP_DEFINITIONS } from "../props/definitions";
import {
	createDeliveryTarget,
	validatePropsForHostTransport,
} from "../props/normalize";
import type { ComponentEvents, EventSubscriber } from "../types/events";
import type { PropsDefinition } from "../types/props";
import type {
	ComponentOptions,
	ForgeFrameComponentInstance,
	RemoteValue,
} from "../types/runtime";
import type { Dimensions, DomainMatcher } from "../types/utility";
import { CleanupManager } from "../utils/cleanup";
import { createDeferred, type Deferred } from "../utils/promise";
import { generateUID } from "../utils/uid";
import { appendComponentQuery, resolveComponentHostUrl } from "../utils/url";
import {
	CONSUMER_EVENT_NAMES,
	describeUnknownConsumerEvent,
} from "./consumer/events";
import {
	ConsumerPropsPipeline,
	type ConsumerPropsUpdateHooks,
} from "./consumer/props-pipeline";
import { ConsumerRenderer } from "./consumer/renderer";
import { getSiblingInstances } from "./consumer/siblings";
import { ConsumerTransport } from "./consumer/transport";
import type { NormalizedOptions } from "./consumer/types";

/**
 * Consumer-side component implementation.
 *
 * @remarks
 * This class coordinates focused subsystems for rendering, transport, and
 * prop synchronization while preserving the existing public API.
 *
 * @typeParam P - The props type passed to the component
 * @typeParam X - The exports type that the host can expose to the consumer
 * @typeParam Input - The factory input, inferred from the prop schemas
 *
 * @internal
 */
export class ConsumerComponent<
	P extends Record<string, unknown>,
	X = unknown,
	Input = P,
> implements ForgeFrameComponentInstance<P, X, Input>
{
	/** Subscribe-only view of this instance's lifecycle events. */
	public readonly event: EventSubscriber<ComponentEvents<P, X>>;

	/**
	 * Emitter behind {@link ConsumerComponent.event}. A private field, so plain
	 * JavaScript cannot reach `emit` either.
	 */
	readonly #emitter: EventEmitter<ComponentEvents<P, X>>;

	/** Data exported by the host component. */
	public exports?: RemoteValue<X>;

	/** @internal */
	private _uid: string;

	/**
	 * Unique instance identifier.
	 * @readonly
	 */
	public get uid(): string {
		return this._uid;
	}

	/** @internal */
	private options: NormalizedOptions<P>;

	/** @internal */
	private cleanup: CleanupManager;

	/** @internal */
	private transport!: ConsumerTransport<P, X>;

	/** @internal */
	private renderer!: ConsumerRenderer<P>;

	/** @internal */
	private propsPipeline!: ConsumerPropsPipeline<P>;

	/** @internal */
	private rendered = false;

	/** @internal */
	private renderPromise: Promise<void> | null = null;

	/** @internal */
	private activeRenderTask: Deferred<void> | null = null;

	/** @internal */
	private destroyed = false;

	/** @internal */
	private closing = false;

	/** Completion shared by direct and reentrant close requests. @internal */
	private closePromise: Promise<void> | null = null;

	/** Completion shared by close and teardown initiated by failed rendering. @internal */
	private destroyPromise: Promise<void> | null = null;

	/**
	 * Creates a new ConsumerComponent instance.
	 *
	 * @param options - Component configuration options
	 * @param props - Initial props to pass to the component
	 * @param untrackInstance - Owning factory cleanup independent of public observers
	 */
	constructor(
		options: ComponentOptions<P>,
		props?: Input,
		private untrackInstance?: (
			instance: ConsumerComponent<P, X, Input>,
		) => void,
	) {
		this._uid = generateUID();
		this.options = this.normalizeOptions(options);

		this.#emitter = new EventEmitter();
		this.event = createEventSubscriber(
			this.#emitter,
			CONSUMER_EVENT_NAMES,
			describeUnknownConsumerEvent,
		);
		this.cleanup = new CleanupManager();

		this.renderer = new ConsumerRenderer(
			this.options,
			this.uid,
			() => this.propsPipeline.props,
			() => this.resolveDimensions(),
			{
				close: () => this.close(),
				focus: () => this.focus(),
			},
		);

		this.propsPipeline = new ConsumerPropsPipeline(this.options, { ...props });

		this.transport = new ConsumerTransport(
			this.uid,
			this.options,
			() => this.resolveUrl(),
			(url) => this.resolveUrlOrigin(url),
		);

		this.setupMessageHandlers();
		this.setupCleanup();
	}

	/**
	 * Renders the component into a DOM container.
	 *
	 * @remarks
	 * This is the primary method for displaying the component. It creates
	 * an iframe or popup, establishes communication with the host, and
	 * handles the prerender/render lifecycle.
	 *
	 * @param container - CSS selector or HTMLElement to render into
	 * @param context - Override the default rendering context (iframe or popup)
	 * @throws Error if component was already destroyed or rendered
	 *
	 * @example
	 * ```typescript
	 * await instance.render('#container');
	 * await instance.render(document.getElementById('target'), 'popup');
	 * ```
	 */
	async render(
		container: string | HTMLElement,
		context?: ContextType,
	): Promise<void> {
		this.assertRenderAllowed();

		if (this.renderPromise) {
			return this.renderPromise;
		}

		const renderTask = createDeferred<void>();
		const operation = renderTask.promise;
		this.renderPromise = operation;
		this.activeRenderTask = renderTask;
		const pendingPropsUpdate = this.propsPipeline.pendingPropsUpdate;
		void this.performRender(container, context, pendingPropsUpdate).then(
			renderTask.resolve,
			renderTask.reject,
		);
		try {
			await operation;
		} finally {
			this.finishRenderTask(renderTask, operation);
		}
	}

	private assertRenderAllowed(): void {
		if (this.destroyed) {
			throw new Error("Component has been destroyed");
		}

		if (this.rendered) {
			throw new Error("Component has already been rendered");
		}
	}

	/**
	 * Releases this render task's bookkeeping without clearing a newer task.
	 * Another attempt is permitted only while the instance remains unrendered and active.
	 */
	private finishRenderTask(
		renderTask: Deferred<void>,
		operation: Promise<void>,
	): void {
		if (this.activeRenderTask === renderTask) {
			this.activeRenderTask = null;
		}
		if (!this.rendered && !this.destroyed && this.renderPromise === operation) {
			this.renderPromise = null;
		}
	}

	/** @internal */
	private async performRender(
		container: string | HTMLElement,
		context: ContextType | undefined,
		pendingPropsUpdate: Promise<void> | null,
	): Promise<void> {
		const resolvedContext = context ?? this.options.defaultContext;
		if (
			resolvedContext !== CONTEXT.IFRAME &&
			resolvedContext !== CONTEXT.POPUP
		) {
			throw new Error('Render context must be "iframe" or "popup"');
		}
		this.renderer.context = resolvedContext;
		if (pendingPropsUpdate) {
			await pendingPropsUpdate;
			this.assertRenderActive();
		}

		this.validateForRender();

		const rawUrl = this.resolveUrl();
		this.assertRenderActive();

		let baseUrl: string;
		try {
			baseUrl = resolveComponentHostUrl(
				rawUrl,
				document.baseURI,
				this.options.domain,
			).href;
			this.transport.syncTrustedDomainForUrl(baseUrl);
		} catch (error) {
			await this.destroy().catch(() => undefined);
			throw error;
		}

		// Configuration/container guard failures remain retryable until rendering
		// has begun and resources may need lifecycle cleanup.
		validatePropsForHostTransport(
			this.propsPipeline.props,
			this.options.props,
			// A host on the consumer's origin may become a same-origin recipient,
			// so arrays of the props it may receive are checked now.
			createDeliveryTarget(new URL(baseUrl).origin, window.location.origin),
		);
		this.renderer.container = this.resolveContainer(container);

		try {
			this.#emitter.emit(EVENT.RENDER, undefined);
			this.assertRenderActive();

			await this.prerender();
			this.assertRenderActive();
			await this.open(baseUrl);
			this.assertRenderActive();
			await this.waitForHost();
			this.assertRenderActive();
			await this.renderer.completePrerender();
			this.assertRenderActive();

			this.rendered = true;

			this.#emitter.emit(EVENT.RENDERED, undefined);
		} catch (err) {
			const renderWasCancelled = this.isRenderCancelled();
			await this.destroy().catch(() => undefined);
			if (renderWasCancelled) {
				this.teardownRenderResources();
				throw this.createRenderCancellationError();
			}
			throw err;
		}
	}

	private validateForRender(): void {
		this.propsPipeline.revalidateSchemaValues();
		this.assertRenderActive();
		this.options.validate?.({ props: this.propsPipeline.props });
		this.assertRenderActive();
	}

	/**
	 * Closes and destroys the component.
	 *
	 * @remarks
	 * Emits the 'close' event before destruction. Safe to call multiple times.
	 */
	async close(): Promise<void> {
		if (this.closePromise) return this.closePromise;
		if (this.destroyed) return this.destroyPromise ?? undefined;

		const closeTask = createDeferred<void>();
		this.closePromise = closeTask.promise;

		this.closing = true;
		this.activeRenderTask?.reject(this.createRenderCancellationError());
		void this.performClose().then(closeTask.resolve, closeTask.reject);
		return closeTask.promise;
	}

	/** Completes the one admitted close operation before its shared promise settles. */
	private async performClose(): Promise<void> {
		try {
			this.#emitter.emit(EVENT.CLOSE, undefined);

			await this.destroy();
		} finally {
			this.closing = false;
		}
	}

	/**
	 * Focuses the component window.
	 *
	 * @remarks
	 * For iframes, focuses the iframe element. For popups, brings the window to
	 * front. Emits `focus` only when an iframe is mounted or a popup is open.
	 */
	async focus(): Promise<void> {
		if (this.renderer.focus(this.transport.hostWindow)) {
			this.#emitter.emit(EVENT.FOCUS, undefined);
		}
	}

	/**
	 * Resizes the component to the specified dimensions.
	 *
	 * @remarks
	 * Browsers do not let the consumer resize a cross-origin popup. That call
	 * rejects without emitting `resize`; the host can resize its own popup with
	 * `hostProps.resize()`.
	 *
	 * A popup that is not open has nothing to resize, so the call does nothing.
	 *
	 * @param dimensions - New width and height for the component
	 * @throws Error if the browser denies resizing the popup window
	 */
	async resize(dimensions: Dimensions): Promise<void> {
		const hostWindow = this.transport.hostWindow;
		if (this.renderer.context === CONTEXT.POPUP && !hostWindow) return;
		if (!this.renderer.resize(dimensions, hostWindow)) {
			throw new Error(
				`Cannot resize the popup for component "${this.options.tag}": the browser blocks resizing a cross-origin window. Call hostProps.resize() from the host instead.`,
			);
		}
		this.emitResize(dimensions);
	}

	/**
	 * Applies a host resize request. A popup host has already resized its own
	 * window, so only an iframe is resized here.
	 * @internal
	 */
	private resizeForHost(dimensions: Dimensions): void {
		// Without a host window the renderer resizes only an iframe.
		this.renderer.resize(dimensions, null);
		this.emitResize(dimensions);
	}

	/** Notifies resize observers. @internal */
	private emitResize(dimensions: Dimensions): void {
		this.#emitter.emit(EVENT.RESIZE, dimensions);
	}

	/**
	 * Shows the component if hidden.
	 *
	 * @remarks
	 * Only applicable to iframe context.
	 */
	async show(): Promise<void> {
		this.renderer.show();
	}

	/**
	 * Hides the component.
	 *
	 * @remarks
	 * Only applicable to iframe context.
	 */
	async hide(): Promise<void> {
		this.renderer.hide();
	}

	/**
	 * Updates the component props and sends them to the host.
	 *
	 * @remarks
	 * Props are normalized and validated before being sent to the host window.
	 *
	 * @param newProps - Partial props object to merge with existing props
	 */
	async updateProps(newProps: Partial<Input>): Promise<void> {
		this.assertPropsUpdateActive();
		if (this.renderPromise && !this.rendered) {
			throw new Error("Cannot update props while the component is rendering");
		}
		return this.applyPropsUpdate(newProps);
	}

	/**
	 * Applies a props update and synchronizes it to the host when connected.
	 * @internal
	 */
	private async applyPropsUpdate(newProps: Partial<Input>): Promise<void> {
		const hooks: ConsumerPropsUpdateHooks<P> = {
			assertActive: () => this.assertPropsUpdateActive(),
			resolveUrl: (nextProps) => this.resolveUrl(nextProps),
			resolveUrlOrigin: (url) => this.resolveUrlOrigin(url),
			assertStableRenderedOrigin: (nextHostOrigin) =>
				this.assertStableRenderedOrigin(nextHostOrigin),
			validateTransportProps: (props, hostOrigin) => {
				validatePropsForHostTransport(
					props,
					this.options.props,
					createDeliveryTarget(
						this.rendered ? this.transport.getHostDomain() : hostOrigin,
						window.location.origin,
					),
				);
			},
			isRendered: () => this.rendered,
			syncTrustedDomainForUrl: (url) => this.syncTrustedDomainForUrl(url),
			shouldSendPropsToHost: () => this.transport.isHostConnected(),
			sendPropsUpdateToHost: (nextProps) =>
				this.sendPropsUpdateToHost(nextProps),
			emitPropsUpdated: (nextProps) => {
				this.#emitter.emit(EVENT.PROPS, nextProps);
			},
		};

		await this.propsPipeline.updateProps({ ...newProps }, hooks);
	}

	/** Queued updates must recheck lifecycle state before running user code. @internal */
	private assertPropsUpdateActive(): void {
		if (this.destroyed || this.closing) {
			throw new Error("Cannot update props after the component has closed");
		}
	}

	/**
	 * Prevents origin changes after render for security and routing consistency.
	 * @internal
	 */
	private assertStableRenderedOrigin(nextHostOrigin: string): void {
		const openedHostDomain = this.transport.openedHostDomain;

		if (
			(this.rendered || this.renderPromise !== null) &&
			openedHostDomain &&
			nextHostOrigin !== openedHostDomain
		) {
			throw new Error(
				`Cannot change component URL origin after render (from "${openedHostDomain}" to "${nextHostOrigin}")`,
			);
		}
	}

	/**
	 * Sends the current props snapshot to the host window when available.
	 * @internal
	 */
	private async sendPropsUpdateToHost(nextProps: P): Promise<void> {
		await this.transport.sendPropsUpdateToHost(nextProps, this.options.props);
	}

	/** Returns whether construction or lifecycle callbacks destroyed this instance. @internal */
	isDestroyed(): boolean {
		return this.destroyed;
	}

	/** Returns the browser-verified origin of the connected host window, if any. @internal */
	getVerifiedHostDomain(): string | null {
		return this.transport.activeHostDomain;
	}

	/** Returns the origin this instance opened its host at, before verification. @internal */
	getOpenedHostDomain(): string | null {
		return this.transport.openedHostDomain;
	}

	/** Returns other host origins allowed to discover this instance as a peer. @internal */
	getPeerDomains(): DomainMatcher | undefined {
		return this.options.peerDomains;
	}

	/**
	 * Normalizes component options with default values.
	 * @internal
	 */
	private normalizeOptions(options: ComponentOptions<P>): NormalizedOptions<P> {
		return {
			...options,
			props: options.props ?? (EMPTY_PROP_DEFINITIONS as PropsDefinition<P>),
			defaultContext: options.defaultContext ?? CONTEXT.IFRAME,
			dimensions: options.dimensions ?? { width: "100%", height: "100%" },
			timeout: options.timeout ?? 10000,
		};
	}

	/**
	 * Resolves the host URL from static or function options.
	 * @internal
	 */
	private resolveUrl(props?: P): string {
		if (props === undefined) {
			this.propsPipeline.revalidateSchemaValues();
		}
		const resolvedProps = props ?? this.propsPipeline.props;
		return typeof this.options.url === "function"
			? this.options.url(resolvedProps)
			: this.options.url;
	}

	/**
	 * Resolves dimensions from static or function options.
	 * @internal
	 */
	private resolveDimensions(): Dimensions {
		this.propsPipeline.revalidateSchemaValues();
		return typeof this.options.dimensions === "function"
			? this.options.dimensions(this.propsPipeline.props)
			: this.options.dimensions;
	}

	/**
	 * Resolves a URL to an origin, supporting relative URLs.
	 * @internal
	 */
	private resolveUrlOrigin(url: string): string {
		return resolveComponentHostUrl(url, document.baseURI, this.options.domain)
			.origin;
	}

	/**
	 * Ensures the messenger trusts the origin for a resolved host URL.
	 * @internal
	 */
	private syncTrustedDomainForUrl(url: string): void {
		this.transport.syncTrustedDomainForUrl(url);
	}

	/**
	 * Resolves a container selector or element to an HTMLElement.
	 * @internal
	 */
	private resolveContainer(container?: string | HTMLElement): HTMLElement {
		return this.renderer.resolveContainer(container);
	}

	/**
	 * Creates and displays the prerender (loading) content.
	 * @internal
	 */
	private async prerender(): Promise<void> {
		await this.renderer.prerender(
			(windowName) => this.createIframeElement(windowName),
			() => this.buildWindowName(),
			() => this.assertRenderActive(),
		);
	}

	/**
	 * Creates an iframe element without setting src (for prerender phase).
	 * The window name is set immediately as it carries the payload for the host.
	 * @internal
	 */
	private createIframeElement(windowName: string): HTMLIFrameElement {
		return this.renderer.createIframeElement(windowName);
	}

	/**
	 * Opens the host window (iframe or popup).
	 * @internal
	 */
	private async open(baseUrl: string): Promise<void> {
		this.syncTrustedDomainForUrl(baseUrl);
		const openedHostDomain = this.resolveUrlOrigin(baseUrl);
		this.transport.activeHostDomain = null;

		this.transport.attachHostWindow(
			this.renderer.open({
				baseUrl,
				assertActive: () => this.assertRenderActive(),
				buildUrl: (resolvedBaseUrl) => this.buildUrl(resolvedBaseUrl),
				buildBodyParams: () => this.buildBodyParams(baseUrl),
				buildWindowName: () => this.buildWindowName(),
				submitBodyForm: (target, actionUrl, params) =>
					this.submitBodyForm(target, actionUrl, params),
				onPopupClose: () => {
					void this.close();
				},
				registerCleanup: (cleanupFn) => {
					this.cleanup.register(cleanupFn);
				},
			}),
			openedHostDomain,
		);
	}

	/**
	 * Builds the URL for the host window including query parameters.
	 * @internal
	 */
	private buildUrl(baseUrl: string): string {
		this.propsPipeline.revalidateSchemaValues();
		const queryParams = propsToQueryParams(
			this.propsPipeline.props,
			this.options.props,
			this.resolveUrlOrigin(baseUrl),
		);
		return appendComponentQuery(baseUrl, queryParams.toString());
	}

	/**
	 * Builds POST body parameters from props marked with bodyParam.
	 * @internal
	 */
	private buildBodyParams(baseUrl: string): URLSearchParams {
		this.propsPipeline.revalidateSchemaValues();
		return propsToBodyParams(
			this.propsPipeline.props,
			this.options.props,
			this.resolveUrlOrigin(baseUrl),
		);
	}

	/**
	 * Submits a hidden form to navigate a target window via POST.
	 * @internal
	 */
	private submitBodyForm(
		target: string,
		actionUrl: string,
		params: URLSearchParams,
	): void {
		this.renderer.submitBodyForm(target, actionUrl, params);
	}

	/**
	 * Builds the window.name payload for the host window.
	 * @internal
	 */
	private buildWindowName(): string {
		// Dimension and URL functions run user code after the previous check
		// and can mutate prop values, so recheck them before the
		// host window is created.
		this.propsPipeline.revalidateSchemaValues();
		return this.transport.buildWindowName({
			tag: this.options.tag,
			context: this.renderer.context,
		});
	}

	/**
	 * Waits for the host to send the init message.
	 * @internal
	 */
	private async waitForHost(): Promise<void> {
		await this.transport.waitForHost(
			this.options.timeout,
			this.options.tag,
			(error) => {
				if (!this.isRenderCancelled()) {
					this.#emitter.emit(EVENT.ERROR, error);
				}
			},
		);
	}

	/** Returns an error describing intentional cancellation of an in-flight render. @internal */
	private createRenderCancellationError(): Error {
		return new Error(
			`Component "${this.options.tag}" was closed before rendering completed`,
		);
	}

	/** Returns whether close/destroy has cancelled the active render operation. @internal */
	private isRenderCancelled(): boolean {
		return this.closing || this.destroyed;
	}

	/** Stops a cancelled render before it can advance to another lifecycle stage. @internal */
	private assertRenderActive(): void {
		if (!this.isRenderCancelled()) {
			return;
		}

		this.teardownRenderResources();
		throw this.createRenderCancellationError();
	}

	/**
	 * Sets up message handlers for host communication.
	 * @internal
	 */
	private setupMessageHandlers(): void {
		this.transport.setupMessageHandlers({
			onBootstrap: (source, resetLocalReferences) =>
				this.propsPipeline.readCurrentProps((props) => {
					this.assertPropsUpdateActive();
					const propsForHost = getPropsForHost(
						props,
						this.options.props,
						createDeliveryTarget(source.domain, window.location.origin),
					);
					return {
						props: this.transport.serializePropsForHost(
							propsForHost as Record<string, unknown>,
							{ resetLocalReferences },
						),
					};
				}),
			onReconnect: () => {
				this.exports = undefined;
			},
			onClose: async () => this.close(),
			onResize: async (dimensions) => this.resizeForHost(dimensions),
			onFocus: async () => this.focus(),
			onShow: async () => this.show(),
			onHide: async () => this.hide(),
			onError: (error) => this.#emitter.emit(EVENT.ERROR, error),
			onExport: (exports) => {
				this.exports = exports;
				this.#emitter.emit(EVENT.EXPORTS, exports);
			},
			onGetSiblings: (request) => getSiblingInstances(request),
		});
	}

	/**
	 * Registers cleanup handlers for the instance.
	 * @internal
	 */
	private setupCleanup(): void {
		this.cleanup.register(() => {
			this.transport.destroy();
		});
	}

	/**
	 * Removes render artifacts, including resources created after destroy began.
	 * Safe to call repeatedly while an asynchronous render unwinds.
	 * @internal
	 */
	private teardownRenderResources(): void {
		this.renderer.destroy(this.transport.hostWindow);
		this.transport.resetHostWindow();
	}

	/**
	 * Destroys the component and cleans up all resources.
	 * @internal
	 */
	private async destroy(): Promise<void> {
		if (this.destroyPromise) return this.destroyPromise;
		const destroyTask = createDeferred<void>();
		this.destroyPromise = destroyTask.promise;
		void this.performDestroy().then(destroyTask.resolve, destroyTask.reject);
		return destroyTask.promise;
	}

	/** Sequences teardown, deregistration and notifications for one destruction task. */
	private async performDestroy(): Promise<void> {
		if (!this.beginDestroy()) return;

		this.teardownRenderResources();
		this.propsPipeline.pendingPropsUpdate = null;

		await this.cleanup.cleanup();

		this.untrackInstance?.(this);
		this.#emitter.emit(EVENT.CLOSED, undefined);
		this.#emitter.dispose();
	}

	/**
	 * Marks destruction and rejects an outstanding handshake before teardown starts.
	 * @returns `false` when destruction had already begun
	 */
	private beginDestroy(): boolean {
		if (this.destroyed) return false;
		this.destroyed = true;

		if (this.transport.initPromise) {
			this.transport.initPromise.reject(
				new Error(
					`Component "${this.options.tag}" was destroyed before initialization completed`,
				),
			);
			this.transport.initPromise = null;
		}
		this.transport.hostInitialized = false;
		return true;
	}
}
