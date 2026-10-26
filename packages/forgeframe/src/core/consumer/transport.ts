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
import type { ContextType } from "../../constants";
import { MESSAGE_NAME } from "../../constants";
import { getPropsForHost, serializeProps } from "../../props";
import { createDeliveryTarget } from "../../props/normalize";
import type { SerializedProps } from "../../props/types";
import type { PropsDefinition } from "../../types/props";
import type {
	GetPeerInstancesOptions,
	PeerInfo,
	RemoteValue,
} from "../../types/runtime";
import type { Dimensions, DomainMatcher } from "../../types/utility";
import { createDeferred, promiseTimeout } from "../../utils/promise";
import { getDomain, isWindowClosed, matchDomain } from "../../window/helpers";
import {
	buildWindowName,
	createWindowPayload,
} from "../../window/name-payload";
import type { HostBootstrapData } from "../../window/types";
import type { ConsumerPeerRequest } from "./peers";
import type { NormalizedOptions } from "./types";

type VerifiedMessageSource = Parameters<MessageHandler>[1];

/**
 * Callbacks used by transport to map inbound host messages to component behavior.
 * @internal
 */
export interface ConsumerTransportHandlers<X> {
	onBootstrap: (
		source: VerifiedMessageSource,
		resetLocalReferences: boolean,
	) => Promise<HostBootstrapData>;
	onReconnect: () => void;
	onClose: () => Promise<void>;
	onResize: (dimensions: Dimensions) => Promise<void>;
	onFocus: () => Promise<void>;
	onShow: () => Promise<void>;
	onHide: () => Promise<void>;
	onError: (error: Error) => void;
	onExport: (exports: RemoteValue<X>) => void;
	onGetPeers: (
		request: ConsumerPeerRequest,
	) => PeerInfo[] | Promise<PeerInfo[]>;
}

/**
 * Owns consumer transport concerns (messenger, function bridge, trust management, handshake).
 * @internal
 */
export class ConsumerTransport<P extends Record<string, unknown>, X = unknown> {
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

	/** Static URL origin currently trusted when no `domain` is configured. */
	public staticUrlTrustedOrigin: string | null = null;

	/** Deferred host initialization handshake promise. */
	public initPromise: ReturnType<typeof createDeferred<void>> | null = null;

	/** Whether host initialization handshake has completed. */
	public hostInitialized = false;

	/** Latest initialization failure the host reported during this handshake. */
	private hostInitFailure: Error | null = null;

	private bootstrapSessionId: string | null = null;
	/** Keeps reset intent across bootstrap failures without admitting stale INIT messages. */
	private localReferenceSessionId: string | null = null;

	constructor(
		private uid: string,
		private options: NormalizedOptions<P>,
		private resolveUrl: () => string,
		private resolveUrlOrigin: (url: string) => string,
	) {
		const trustedDomains = this.buildTrustedDomains();
		// Unrendered instances never receive host messages, so listening waits
		// until host content opens.
		this.messenger = new Messenger(
			this.uid,
			window,
			getDomain(),
			trustedDomains,
			false,
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
		if (hostOrigin) this.staticUrlTrustedOrigin = hostOrigin;
		return collectTrustedDomains(this.options.domain, hostOrigin);
	}

	/**
	 * Ensures the messenger trusts the origin for a resolved host URL.
	 *
	 * @remarks
	 * A configured `domain` is the whole trust policy, and every resolved URL
	 * was checked against it. Without one the URL is static (`create()`
	 * requires `domain` for a function URL), and a relative URL's origin
	 * follows the document base, so the trusted origin moves with it.
	 */
	syncTrustedDomainForUrl(url: string): void {
		if (this.options.domain !== undefined) return;
		const origin = this.resolveUrlOrigin(url);
		const previousOrigin = this.staticUrlTrustedOrigin;
		if (previousOrigin && previousOrigin !== origin) {
			this.messenger.removeTrustedDomain(previousOrigin);
		}

		this.messenger.addTrustedDomain(origin);
		this.staticUrlTrustedOrigin = origin;
	}

	/**
	 * Returns the current host domain target used for messaging.
	 */
	getHostDomain(): string {
		// Without a host origin, as after teardown cleared both, fall back to
		// the committed props' URL origin.
		return this.getHostOrigin() ?? this.resolveUrlOrigin(this.resolveUrl());
	}

	/** Returns the verified host origin, else the opened one, else `null`. */
	getHostOrigin(): string | null {
		return this.activeHostDomain ?? this.openedHostDomain;
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
		options?: { finishBatch?: boolean; resetLocalReferences?: boolean },
	): SerializedProps {
		if (options?.resetLocalReferences) this.bridge.clearLocal(true);
		this.bridge.startBatch();
		const finishBatch = options?.finishBatch ?? true;
		try {
			const serialized = serializeProps(propsForHost, this.bridge);
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
		propDefinitions: PropsDefinition<P>,
	): Promise<void> {
		if (!this.hostWindow || isWindowClosed(this.hostWindow)) {
			return;
		}

		const hostDomain = this.getHostDomain();
		const propsForHost = getPropsForHost(
			nextProps,
			propDefinitions,
			createDeliveryTarget(hostDomain, window.location.origin),
		);
		const serialized = this.serializePropsForHost(
			propsForHost as Record<string, unknown>,
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
	 * Builds the window.name channel metadata for host initialization.
	 *
	 * @remarks
	 * Props and child definitions never travel in `window.name`; the host
	 * receives them through the verified bootstrap.
	 */
	buildWindowName(options: { tag: string; context: ContextType }): string {
		const payload = createWindowPayload({
			uid: this.uid,
			tag: options.tag,
			context: options.context,
			consumerDomain: getDomain(),
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
				() =>
					`Host component "${tag}" (uid: ${this.uid}) did not initialize within ${timeout}ms. ` +
					(this.hostInitFailure?.message ??
						"Check that the host page loads correctly and calls the initialization code, " +
							"and that consumer and host run the same ForgeFrame major version."),
			);
		} catch (err) {
			onError(err as Error);
			throw err;
		} finally {
			if (this.initPromise === initPromise) {
				this.initPromise = null;
				// A reported reason belongs to this handshake only.
				this.hostInitFailure = null;
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
				if (!data || typeof data.sessionId !== "string" || !data.sessionId) {
					throw new Error("Invalid host bootstrap request");
				}
				const resetLocalReferences =
					this.localReferenceSessionId !== null &&
					this.localReferenceSessionId !== data.sessionId;
				this.hostInitialized = false;
				this.bootstrapSessionId = null;
				this.bridge.resumeRemoteSession(source.window);
				if (resetLocalReferences) {
					// Calls into the replaced host session can never be answered.
					this.bridge.rejectRemoteCalls(
						source.window,
						new Error("Host reconnected before the call completed"),
					);
				}
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
				handlers.onReconnect();
				return snapshot;
			},
		);
		this.onHostControl<{ sessionId?: string }>(
			MESSAGE_NAME.INIT,
			(data, source) => {
				// buildWindowName() always precedes the host window, so INIT is
				// accepted only for the current verified bootstrap session.
				if (
					!this.bootstrapSessionId ||
					data?.sessionId !== this.bootstrapSessionId
				) {
					return { success: false };
				}
				this.activeHostDomain = source.domain;
				this.hostInitialized = true;
				this.hostInitFailure = null;
				this.bridge.resumeRemoteSession(source.window);
				if (this.initPromise) {
					this.initPromise.resolve();
				}

				return { success: true };
			},
		);

		this.onHostControl(MESSAGE_NAME.TEARDOWN, (_data, source) => {
			// Calls into the destroyed runtime, queued or running, are never answered.
			this.bridge.endRemoteSession(
				source.window,
				"Host was destroyed before the call completed",
			);
			return { success: true };
		});

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
			// An unfocused page cannot pass focus on, so the host need not wait for it.
			return { success: true, focused: document.hasFocus() };
		});

		this.onHostControl(MESSAGE_NAME.SHOW, async () => {
			await handlers.onShow();
			return { success: true };
		});

		this.onHostControl(MESSAGE_NAME.HIDE, async () => {
			await handlers.onHide();
			return { success: true };
		});

		this.onHostControl<{ message: string; initFailed?: boolean }>(
			MESSAGE_NAME.ERROR,
			async (errorData) => {
				const error = new Error(errorData.message);
				// The host can still retry initialization on the same page, so a
				// pending handshake keeps waiting and reports this reason once, at
				// its timeout. Outside a handshake the failure is reported now.
				if (errorData.initFailed === true && this.initPromise) {
					this.hostInitFailure = error;
				} else {
					handlers.onError(error);
				}
				return { success: true };
			},
		);

		this.onHostControl<unknown>(
			MESSAGE_NAME.EXPORT,
			async (exports, source) => {
				// The host-control guard has matched source.window to hostWindow.
				handlers.onExport(
					deserializeFunctions(
						exports,
						this.bridge,
						source.window,
						source.domain,
					) as RemoteValue<X>,
				);
				return { success: true };
			},
		);

		this.onHostControl<{ options?: GetPeerInstancesOptions } | undefined>(
			MESSAGE_NAME.GET_SIBLINGS,
			async (request, source) => {
				// Scope discovery to this instance, its own peers setting and the
				// browser-verified host origin; claimed uid/tag fields could
				// otherwise reach other origins' exports.
				const peers = await handlers.onGetPeers({
					uid: this.uid,
					tag: this.options.tag,
					peers: this.options.peers,
					hostDomain: source.domain,
					allTags: request?.options?.allTags === true,
				});
				this.peerBridge.startBatch("append");
				try {
					const serialized = serializeFunctions(peers, this.peerBridge);
					// Native response encoding must succeed before retaining new relay IDs.
					JSON.stringify(serialized);
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
		// attachHostWindow() records the opened origin with the window, and
		// resetHostWindow() clears both.
		return Boolean(
			this.hostWindow &&
				this.openedHostDomain &&
				source.window === this.hostWindow &&
				matchDomain(
					this.options.domain ?? this.openedHostDomain,
					source.domain,
				),
		);
	}

	/**
	 * Records opened host content and the origin it was opened at, then starts
	 * listening for its messages. Unrendered instances never listen.
	 */
	attachHostWindow(hostWindow: Window | null, openedHostDomain: string): void {
		this.openedHostDomain = openedHostDomain;
		this.hostWindow = hostWindow;
		if (hostWindow) this.messenger.listen();
	}

	/**
	 * Clears render-owned window and origin bookkeeping after resource teardown.
	 * The caller remains responsible for closing windows and destroying transport resources.
	 */
	resetHostWindow(): void {
		this.hostWindow = null;
		this.openedHostDomain = null;
		this.activeHostDomain = null;
		this.staticUrlTrustedOrigin = null;
	}

	/**
	 * Rejects an outstanding host handshake and forgets host initialization,
	 * so a destroyed instance never reports a ready host.
	 */
	rejectPendingInit(error: Error): void {
		this.initPromise?.reject(error);
		this.initPromise = null;
		this.hostInitialized = false;
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
