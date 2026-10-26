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
import { errorFromWire, ForgeFrameError } from "../../errors";
import { getPropsForHost, serializeProps } from "../../props";
import { createDeliveryTarget } from "../../props/normalize";
import type { SerializedProps } from "../../props/types";
import type { PropsDefinition } from "../../types/props";
import type {
	GetPeerInstancesOptions,
	PeerInfo,
	RemoteValue,
} from "../../types/runtime";
import type { Dimensions, OriginMatcher } from "../../types/utility";
import { createDeferred, promiseTimeout } from "../../utils/promise";
import { getOrigin, isWindowClosed, matchOrigin } from "../../window/helpers";
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
export interface ConsumerTransportHandlers<Exports> {
	onBootstrap: (
		source: VerifiedMessageSource,
		resetLocalReferences: boolean,
	) => Promise<HostBootstrapData>;
	onReconnect: () => void;
	onClose: () => Promise<void>;
	onResize: (dimensions: Dimensions) => void;
	onFocus: () => void;
	onShow: () => void;
	onHide: () => void;
	onError: (error: Error) => void;
	onExport: (exports: RemoteValue<Exports>) => void;
	onGetPeers: (
		request: ConsumerPeerRequest,
	) => PeerInfo[] | Promise<PeerInfo[]>;
}

/**
 * Owns consumer transport concerns (messenger, function bridge, trust management, handshake).
 * @internal
 */
export class ConsumerTransport<
	P extends Record<string, unknown>,
	Exports = unknown,
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
	public openedHostOrigin: string | null = null;

	/** Browser-verified origin of the initialized host window. */
	public activeHostOrigin: string | null = null;

	/**
	 * The static URL origin the messenger trusts when `hostOrigins` is not
	 * configured; `null` while `hostOrigins` is the whole trust policy.
	 */
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
		private resolveUrlOrigin: (url: string) => string,
	) {
		this.staticUrlTrustedOrigin = this.resolveStaticUrlOrigin();
		const trustedOrigins = selectInitialTrustedOrigins(
			this.options.hostOrigins,
			this.staticUrlTrustedOrigin,
		);
		// Unrendered instances never receive host messages, so listening waits
		// until host content opens.
		this.messenger = new Messenger(
			this.uid,
			window,
			getOrigin(),
			trustedOrigins,
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

	/** Resolves the origin of the static URL trusted without `hostOrigins`. */
	private resolveStaticUrlOrigin(): string | null {
		const url = staticTrustedUrl(this.options);
		return url === null ? null : this.resolveUrlOrigin(url);
	}

	/**
	 * Ensures the messenger trusts the origin for a resolved host URL.
	 *
	 * @remarks
	 * A configured `hostOrigins` is the whole trust policy, and every resolved
	 * URL was checked against it. Without one the URL is static (`create()`
	 * requires `hostOrigins` for a function URL), and a relative URL's origin
	 * follows the document base, so the trusted origin moves with it.
	 */
	syncTrustedOriginForUrl(url: string): void {
		if (this.options.hostOrigins !== undefined) return;
		const origin = this.resolveUrlOrigin(url);
		const previousOrigin = this.staticUrlTrustedOrigin;
		if (previousOrigin && previousOrigin !== origin) {
			this.messenger.removeTrustedOrigin(previousOrigin);
		}

		this.messenger.addTrustedOrigin(origin);
		this.staticUrlTrustedOrigin = origin;
	}

	/**
	 * Returns the verified host origin, else the opened one, else `null`
	 * once teardown has cleared both.
	 */
	getHostOrigin(): string | null {
		return this.activeHostOrigin ?? this.openedHostOrigin;
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
		// attachHostWindow() records the opened origin with the window, so a
		// connected window always has one.
		const hostOrigin = this.getHostOrigin();
		if (!this.hostWindow || isWindowClosed(this.hostWindow) || !hostOrigin) {
			return;
		}

		const propsForHost = getPropsForHost(
			nextProps,
			propDefinitions,
			createDeliveryTarget(hostOrigin, window.location.origin),
		);
		const serialized = this.serializePropsForHost(
			propsForHost as Record<string, unknown>,
			{ finishBatch: false },
		);

		let deliveryAttempted = false;
		try {
			await this.messenger.send(
				this.hostWindow,
				hostOrigin,
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
			consumerDomain: getOrigin(),
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
					new ForgeFrameError(
						"INIT_TIMEOUT",
						`Host component "${tag}" (uid: ${this.uid}) did not initialize within ${timeout}ms. ` +
							(this.hostInitFailure?.message ??
								"Check that the host page loads correctly and calls the initialization code, " +
									"and that consumer and host run the same ForgeFrame major version."),
						this.hostInitFailure ? { cause: this.hostInitFailure } : undefined,
					),
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
	setupMessageHandlers(handlers: ConsumerTransportHandlers<Exports>): void {
		this.onHostControl<{ sessionId: string }>(
			MESSAGE_NAME.BOOTSTRAP,
			async (data, source) => {
				if (!data || typeof data.sessionId !== "string" || !data.sessionId) {
					throw new ForgeFrameError(
						"VALIDATION",
						"Invalid host bootstrap request",
					);
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
						new ForgeFrameError(
							"CLOSED",
							"Host reconnected before the call completed",
						),
					);
				}
				const snapshot = await handlers.onBootstrap(
					source,
					resetLocalReferences,
				);
				this.activeHostOrigin = source.domain;
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
				this.activeHostOrigin = source.domain;
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
			handlers.onResize(dimensions);
			return { success: true };
		});

		this.onHostControl(MESSAGE_NAME.FOCUS, async () => {
			handlers.onFocus();
			// An unfocused page cannot pass focus on, so the host need not wait for it.
			return { success: true, focused: document.hasFocus() };
		});

		this.onHostControl(MESSAGE_NAME.SHOW, async () => {
			handlers.onShow();
			return { success: true };
		});

		this.onHostControl(MESSAGE_NAME.HIDE, async () => {
			handlers.onHide();
			return { success: true };
		});

		this.onHostControl<{
			message: string;
			initFailed?: boolean;
			code?: string;
		}>(MESSAGE_NAME.ERROR, async (errorData) => {
			const error = readHostError(errorData);
			// The host can still retry initialization on the same page, so a
			// pending handshake keeps waiting and reports this reason once, at
			// its timeout. Outside a handshake the failure is reported now.
			if (errorData.initFailed === true && this.initPromise) {
				this.hostInitFailure = error;
			} else {
				handlers.onError(error);
			}
			return { success: true };
		});

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
					) as RemoteValue<Exports>,
				);
				return { success: true };
			},
		);

		this.onHostControl<{ options?: GetPeerInstancesOptions } | undefined>(
			MESSAGE_NAME.GET_PEERS,
			async (request, source) => {
				// Scope discovery to this instance, its own peers setting and the
				// browser-verified host origin; claimed uid/tag fields could
				// otherwise reach other origins' exports.
				const peers = await handlers.onGetPeers({
					uid: this.uid,
					tag: this.options.tag,
					peers: this.options.peers,
					hostOrigin: source.domain,
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
				this.openedHostOrigin &&
				source.window === this.hostWindow &&
				matchOrigin(
					this.options.hostOrigins ?? this.openedHostOrigin,
					source.domain,
				),
		);
	}

	/**
	 * Records opened host content and the origin it was opened at, then starts
	 * listening for its messages. Unrendered instances never listen.
	 */
	attachHostWindow(hostWindow: Window | null, openedHostOrigin: string): void {
		this.openedHostOrigin = openedHostOrigin;
		this.hostWindow = hostWindow;
		if (hostWindow) this.messenger.listen();
	}

	/**
	 * Clears render-owned window and origin bookkeeping after resource teardown.
	 * The caller remains responsible for closing windows and destroying transport resources.
	 */
	resetHostWindow(): void {
		this.hostWindow = null;
		this.openedHostOrigin = null;
		this.activeHostOrigin = null;
		// staticUrlTrustedOrigin stays: it mirrors the messenger's trust, which
		// the next render's syncTrustedOriginForUrl() replaces.
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

/**
 * Rebuilds an ERROR notice. An initialization failure keeps its code; an error
 * the host application reports with `reportError()` is a plain `Error`.
 */
function readHostError(data: {
	message: string;
	initFailed?: boolean;
	code?: string;
}): Error {
	return data.initFailed === true
		? errorFromWire(data.message, data.code)
		: new Error(data.message);
}

/**
 * The static URL whose origin the messenger trusts when no `hostOrigins` is
 * configured, which {@link ConsumerTransport.syncTrustedOriginForUrl} then tracks.
 * @internal
 */
function staticTrustedUrl(options: {
	readonly hostOrigins?: OriginMatcher;
	readonly url: unknown;
}): string | null {
	return options.hostOrigins === undefined && typeof options.url === "string"
		? options.url
		: null;
}

/**
 * Selects the origins the messenger trusts first: `hostOrigins`, or else the
 * static URL's origin.
 * @internal
 */
function selectInitialTrustedOrigins(
	hostOrigins: OriginMatcher | undefined,
	staticUrlOrigin: string | null,
): OriginMatcher | undefined {
	return hostOrigins ?? staticUrlOrigin ?? undefined;
}
