/**
 * @packageDocumentation
 * Consumer transport subsystem module.
 *
 * @remarks
 * Owns consumer-side messaging, function bridging, trust management, and host
 * handshake concerns for embedded iframe and popup instances.
 */

import {
	deserializeFunctions,
	FunctionBridge,
	serializeFunctions,
} from "../../communication/bridge";
import { type MessageHandler, Messenger } from "../../communication/messenger";
import type { ConsumerExports } from "../../communication/types";
import type { ContextType } from "../../constants";
import { MESSAGE_NAME } from "../../constants";
import { getPropsForHost, serializeProps } from "../../props";
import type { SerializedProps } from "../../props/types";
import type { PropsDefinition } from "../../types/props";
import type { RemoteValue, SiblingInfo } from "../../types/runtime";
import type { Dimensions, DomainMatcher } from "../../types/utility";
import { createDeferred, promiseTimeout } from "../../utils/promise";
import {
	getDomain,
	isSameDomain,
	isWindowClosed,
	matchDomain,
} from "../../window/helpers";
import {
	buildWindowName,
	createWindowPayload,
} from "../../window/name-payload";
import type { HostBootstrapData, HostComponentRef } from "../../window/types";
import type { ConsumerSiblingRequest } from "./siblings";
import type { NormalizedOptions } from "./types";

type VerifiedMessageSource = Parameters<MessageHandler>[1];

/**
 * Callbacks used by transport to map inbound host messages to component behavior.
 * @internal
 */
export interface ConsumerTransportHandlers<X> {
	onBootstrap?: (
		source: VerifiedMessageSource,
		resetLocalReferences: boolean,
	) => Promise<HostBootstrapData>;
	onReconnect?: () => void;
	onInit?: () => void | Promise<void>;
	onClose: () => Promise<void>;
	onResize: (dimensions: Dimensions) => Promise<void>;
	onFocus: () => Promise<void>;
	onShow: () => Promise<void>;
	onHide: () => Promise<void>;
	onError: (error: Error) => void;
	onExport: (exports: RemoteValue<X>) => void;
	onConsumerExport: (data: unknown) => void;
	onGetSiblings: (
		request: ConsumerSiblingRequest,
	) => SiblingInfo[] | Promise<SiblingInfo[]>;
}

/**
 * Owns consumer transport concerns (messenger, function bridge, trust management, handshake).
 * @internal
 */
export class ConsumerTransport<
	P extends Record<string, unknown>,
	X = unknown,
	SchemaInputs = P,
> {
	/** Messenger for host communication. */
	public messenger: Messenger;

	/** Function bridge for serializing callable props across windows. */
	public bridge: FunctionBridge;

	/** Peer relays have a lifetime independent of consumer prop batches. */
	private peerBridge: FunctionBridge;

	/** Connected host window reference. */
	public hostWindow: Window | null = null;

	/** Origin of currently opened host content. */
	public openedHostDomain: string | null = null;

	/** Browser-verified origin of the initialized host window. */
	public activeHostDomain: string | null = null;

	/** Dynamic origin currently trusted due to resolved URL. */
	public dynamicUrlTrustedOrigin: string | null = null;

	/** Deferred host initialization handshake promise. */
	public initPromise: ReturnType<typeof createDeferred<void>> | null = null;

	/** Whether host initialization handshake has completed. */
	public hostInitialized = false;

	private requiresBootstrap = false;
	private bootstrapSessionId: string | null = null;
	/** Keeps reset intent across bootstrap failures without admitting stale INIT messages. */
	private localReferenceSessionId: string | null = null;

	constructor(
		private uid: string,
		private options: NormalizedOptions<P, SchemaInputs>,
		private resolveUrl: () => string,
		private resolveUrlOrigin: (url: string) => string | null,
	) {
		const trustedDomains = this.buildTrustedDomains();
		this.messenger = new Messenger(
			this.uid,
			window,
			getDomain(),
			trustedDomains,
		);
		this.bridge = new FunctionBridge(this.messenger, (source) =>
			this.isHostControlSource(source),
		);
		this.peerBridge = new FunctionBridge(
			this.messenger,
			(source) => this.isHostControlSource(source),
			MESSAGE_NAME.PEER_CALL,
		);
	}

	/**
	 * Builds trusted domains used to initialize messenger security checks.
	 */
	private buildTrustedDomains(): DomainMatcher | undefined {
		const hostOrigin =
			typeof this.options.url === "string"
				? this.resolveUrlOrigin(this.options.url)
				: null;
		if (hostOrigin) this.dynamicUrlTrustedOrigin = hostOrigin;
		return collectTrustedDomains(this.options.domain, hostOrigin);
	}

	/**
	 * Ensures the messenger trusts the origin for a resolved host URL.
	 */
	syncTrustedDomainForUrl(url: string): void {
		const origin = this.resolveUrlOrigin(url);
		if (!origin) {
			return;
		}

		const previousOrigin = this.dynamicUrlTrustedOrigin;
		if (this.options.domain) {
			this.dynamicUrlTrustedOrigin = origin;
			return;
		}

		if (previousOrigin && previousOrigin !== origin) {
			this.messenger.removeTrustedDomain(previousOrigin);
		}

		this.messenger.addTrustedDomain(origin);
		this.dynamicUrlTrustedOrigin = origin;
	}

	/**
	 * Returns the current host domain target used for messaging.
	 */
	getHostDomain(): string {
		if (this.activeHostDomain) {
			return this.activeHostDomain;
		}

		if (this.openedHostDomain) {
			return this.openedHostDomain;
		}

		return this.resolveUrlOrigin(this.resolveUrl()) ?? "*";
	}

	/**
	 * Returns true when the host window is connected and not closed.
	 */
	isHostConnected(): boolean {
		return Boolean(this.hostWindow && !isWindowClosed(this.hostWindow));
	}

	/**
	 * Serializes host props while keeping function bridge references in sync.
	 */
	serializePropsForHost(
		propsForHost: Record<string, unknown>,
		propDefinitions: PropsDefinition<Record<string, unknown>>,
		options?: { finishBatch?: boolean; resetLocalReferences?: boolean },
	): SerializedProps {
		if (options?.resetLocalReferences) this.bridge.clearLocal(true);
		this.bridge.startBatch();
		const finishBatch = options?.finishBatch ?? true;
		try {
			const serialized = serializeProps(
				propsForHost,
				propDefinitions,
				this.bridge,
			);
			if (finishBatch) {
				this.bridge.finishBatch();
			}
			return serialized;
		} catch (error) {
			this.bridge.abortBatch();
			throw error;
		}
	}

	/**
	 * Sends the current props snapshot to the host window when available.
	 */
	async sendPropsUpdateToHost(
		nextProps: P,
		propDefinitions: PropsDefinition<P, SchemaInputs>,
	): Promise<void> {
		if (!this.hostWindow || isWindowClosed(this.hostWindow)) {
			return;
		}

		const hostDomain = this.getHostDomain();
		const propsForHost = getPropsForHost(
			nextProps,
			propDefinitions,
			hostDomain,
			isSameDomain(this.hostWindow),
		);
		const serialized = this.serializePropsForHost(
			propsForHost as Record<string, unknown>,
			propDefinitions as PropsDefinition<Record<string, unknown>>,
			{ finishBatch: false },
		);

		let deliveryAttempted = false;
		try {
			await this.messenger.send(
				this.hostWindow,
				hostDomain,
				MESSAGE_NAME.PROPS,
				serialized,
				undefined,
				() => {
					deliveryAttempted = true;
				},
			);
			this.bridge.finishBatch();
		} catch (error) {
			if (deliveryAttempted) this.bridge.finishBatch(true);
			else this.bridge.abortBatch();
			throw error;
		}
	}

	/**
	 * Builds the window.name payload for host initialization.
	 */
	buildWindowName(options: {
		tag: string;
		context: ContextType;
		props: P;
		propDefinitions: PropsDefinition<P, SchemaInputs>;
		hostDomain?: string;
		children?: Record<string, HostComponentRef>;
		exports: ConsumerExports;
	}): string {
		this.requiresBootstrap = true;
		const payload = createWindowPayload({
			uid: this.uid,
			tag: options.tag,
			context: options.context,
			consumerDomain: getDomain(),
			props: {},
			exports: options.exports,
		});

		return buildWindowName(payload);
	}

	/**
	 * Waits for the host to send the initialization handshake.
	 */
	async waitForHost(
		timeout: number,
		tag: string,
		onError: (error: Error) => void,
	): Promise<void> {
		if (this.hostInitialized) {
			return;
		}

		const initPromise = createDeferred<void>();
		this.initPromise = initPromise;

		try {
			await promiseTimeout(
				initPromise.promise,
				timeout,
				`Host component "${tag}" (uid: ${this.uid}) did not initialize within ${timeout}ms. ` +
					"Check that the host page loads correctly and calls the initialization code.",
			);
		} catch (err) {
			onError(err as Error);
			throw err;
		} finally {
			if (this.initPromise === initPromise) {
				this.initPromise = null;
			}
		}
	}

	/**
	 * Sets up host message handlers.
	 */
	setupMessageHandlers(handlers: ConsumerTransportHandlers<X>): void {
		this.onHostControl<{ sessionId: string }>(
			MESSAGE_NAME.BOOTSTRAP,
			async (data, source) => {
				if (
					!data ||
					typeof data.sessionId !== "string" ||
					!data.sessionId ||
					!handlers.onBootstrap
				) {
					throw new Error("Invalid host bootstrap request");
				}
				const resetLocalReferences =
					this.localReferenceSessionId !== null &&
					this.localReferenceSessionId !== data.sessionId;
				this.hostInitialized = false;
				this.bootstrapSessionId = null;
				const snapshot = await handlers.onBootstrap(
					source,
					resetLocalReferences,
				);
				this.activeHostDomain = source.domain;
				this.bootstrapSessionId = data.sessionId;
				this.localReferenceSessionId = data.sessionId;
				this.bridge.clearRemote();
				this.peerBridge.startBatch();
				this.peerBridge.finishBatch();
				handlers.onReconnect?.();
				return snapshot;
			},
		);
		this.onHostControl<{ sessionId?: string }>(
			MESSAGE_NAME.INIT,
			(data, source) => {
				if (
					this.requiresBootstrap &&
					(!this.bootstrapSessionId ||
						data?.sessionId !== this.bootstrapSessionId)
				) {
					return { success: false };
				}
				this.activeHostDomain = source.domain;
				this.hostInitialized = true;
				if (this.initPromise) {
					this.initPromise.resolve();
				}

				if (handlers.onInit) {
					queueMicrotask(() => {
						void Promise.resolve(handlers.onInit?.()).catch((error) => {
							handlers.onError(error as Error);
						});
					});
				}

				return { success: true };
			},
		);

		this.onHostControl(MESSAGE_NAME.CLOSE, async () => {
			await handlers.onClose();
			return { success: true };
		});

		this.onHostControl<Dimensions>(MESSAGE_NAME.RESIZE, async (dimensions) => {
			await handlers.onResize(dimensions);
			return { success: true };
		});

		this.onHostControl(MESSAGE_NAME.FOCUS, async () => {
			await handlers.onFocus();
			return { success: true };
		});

		this.onHostControl(MESSAGE_NAME.SHOW, async () => {
			await handlers.onShow();
			return { success: true };
		});

		this.onHostControl(MESSAGE_NAME.HIDE, async () => {
			await handlers.onHide();
			return { success: true };
		});

		this.onHostControl<{ message: string }>(
			MESSAGE_NAME.ERROR,
			async (errorData) => {
				const error = new Error(errorData.message);
				handlers.onError(error);
				return { success: true };
			},
		);

		this.onHostControl<unknown>(
			MESSAGE_NAME.EXPORT,
			async (exports, source) => {
				if (!this.hostWindow) {
					return { success: false };
				}
				handlers.onExport(
					deserializeFunctions(
						exports,
						this.bridge,
						this.hostWindow,
						source.domain,
					) as RemoteValue<X>,
				);
				return { success: true };
			},
		);

		this.onHostControl<unknown>(MESSAGE_NAME.CONSUMER_EXPORT, async (data) => {
			handlers.onConsumerExport(data);
			return { success: true };
		});

		this.onHostControl<ConsumerSiblingRequest>(
			MESSAGE_NAME.GET_SIBLINGS,
			async (request) => {
				const peers = await handlers.onGetSiblings(request);
				this.peerBridge.startBatch("append");
				try {
					const serialized = serializeFunctions(peers, this.peerBridge);
					// Repeated discovery and prop updates must preserve held peer snapshots.
					this.peerBridge.finishBatch(true);
					return serialized;
				} catch (error) {
					this.peerBridge.abortBatch();
					throw error;
				}
			},
		);
	}

	/**
	 * Registers a host-control message handler behind the opened-window source guard.
	 */
	private onHostControl<T = unknown, R = unknown>(
		name: string,
		handler: MessageHandler<T, R>,
	): void {
		this.messenger.on<T, R | { success: false }>(name, (data, source) => {
			if (!this.isHostControlSource(source)) {
				return { success: false };
			}

			return handler(data, source);
		});
	}

	/**
	 * Returns true when a lifecycle/control message came from the opened host window.
	 */
	private isHostControlSource(source: VerifiedMessageSource): boolean {
		return Boolean(
			this.hostWindow &&
				source.window === this.hostWindow &&
				matchDomain(
					this.options.domain ??
						this.openedHostDomain ??
						this.dynamicUrlTrustedOrigin ??
						this.getHostDomain(),
					source.domain,
				),
		);
	}

	/**
	 * Clears render-owned window and origin bookkeeping after resource teardown.
	 * The caller remains responsible for closing windows and destroying transport resources.
	 */
	resetHostWindow(): void {
		this.hostWindow = null;
		this.openedHostDomain = null;
		this.activeHostDomain = null;
		this.dynamicUrlTrustedOrigin = null;
	}

	/**
	 * Destroys transport resources.
	 */
	destroy(): void {
		this.messenger.destroy();
		this.bridge.destroy();
		this.peerBridge.destroy();
	}
}

/** Selects configured matchers or the static URL origin from supplied data. */
function collectTrustedDomains(
	configuredDomain: DomainMatcher | undefined,
	hostOrigin: string | null,
): DomainMatcher | undefined {
	const domains: Array<string | RegExp> = [];
	if (hostOrigin && !configuredDomain) domains.push(hostOrigin);

	if (configuredDomain) {
		if (typeof configuredDomain === "string") {
			domains.push(configuredDomain);
		} else if (Array.isArray(configuredDomain)) {
			domains.push(...configuredDomain);
		} else if (configuredDomain instanceof RegExp) {
			domains.push(configuredDomain);
		}
	}

	if (domains.length === 0) {
		return undefined;
	}

	return domains.length === 1 ? domains[0] : domains;
}
