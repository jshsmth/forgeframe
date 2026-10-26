/**
 * @packageDocumentation
 * Host runtime messaging and handshake helpers.
 *
 * @remarks
 * This internal module owns the host messenger/function bridge pair, the
 * one-time INIT send, outbound control messages, and inbound PROPS message
 * registration for the host runtime.
 */

import {
	deserializeFunctions,
	FunctionBridge,
	serializeFunctions,
} from "../../communication/bridge";
import { Messenger } from "../../communication/messenger";
import { CONTEXT, EVENT, MESSAGE_NAME } from "../../constants";
import type { SerializedProps } from "../../props/types";
import { resizePopup } from "../../render/popup";
import type { GetPeerInstancesOptions, PeerInfo } from "../../types/runtime";
import { normalizeError } from "../../utils/error";
import { generateShortUID } from "../../utils/uid";
import { getDomain, waitForWindowFocus } from "../../window/helpers";
import type { HostBootstrapData } from "../../window/types";
import type { HostTransportOptions, HostTransportPropsHandler } from "./types";

/** Longest wait in `focus()` for this window to receive the consumer's focus. */
const FRAME_FOCUS_WAIT_MS = 500;

export class HostTransport {
	public messenger: Messenger;

	public bridge: FunctionBridge;

	private peerBridge: FunctionBridge;

	private destroyed = false;

	private initSent = false;

	private exportQueue: Promise<void> = Promise.resolve();
	private sessionId = generateShortUID();

	constructor(private options: HostTransportOptions) {
		this.messenger = new Messenger(
			this.options.uid,
			window,
			getDomain(),
			this.options.consumerDomain,
		);
		this.bridge = new FunctionBridge(
			this.messenger,
			(source) =>
				source.window === this.options.consumerWindow &&
				source.domain === this.options.getConsumerDomain(),
		);
		this.peerBridge = new FunctionBridge(
			this.messenger,
			(source) =>
				source.window === this.options.consumerWindow &&
				source.domain === this.options.getConsumerDomain(),
			MESSAGE_NAME.PEER_CALL,
		);
	}

	registerPropsHandler(handler: HostTransportPropsHandler): void {
		this.messenger.on<SerializedProps>(
			MESSAGE_NAME.PROPS,
			(serializedProps, source) => {
				if (
					source.domain !== this.options.getConsumerDomain() ||
					!handler.isConsumerSource(source)
				) {
					return { success: false };
				}

				return handler.applySerializedProps(serializedProps);
			},
		);
	}

	/** Sends INIT once the verified bootstrap completes; later calls do nothing. */
	sendInitOnce(): void {
		if (this.destroyed || this.initSent) {
			return;
		}

		this.initSent = true;
		void this.sendInit();
	}

	async requestBootstrap(): Promise<HostBootstrapData> {
		return this.messenger.send(
			this.options.consumerWindow,
			this.options.getConsumerDomain(),
			MESSAGE_NAME.BOOTSTRAP,
			{ sessionId: this.sessionId },
		);
	}

	async close(): Promise<void> {
		await this.sendMessage(MESSAGE_NAME.CLOSE, {});
	}

	async focus(): Promise<void> {
		window.focus();
		const ack = await this.messenger.send<
			Record<string, never>,
			{ focused?: boolean } | undefined
		>(
			this.options.consumerWindow,
			this.options.getConsumerDomain(),
			MESSAGE_NAME.FOCUS,
			{},
		);
		// Focus never arrives from a consumer page without focus. Otherwise its
		// frame focus can arrive after this acknowledgement.
		if (ack?.focused === false) return;
		await waitForWindowFocus(window, FRAME_FOCUS_WAIT_MS);
	}

	async resize(dimensions: {
		width?: string | number;
		height?: string | number;
	}): Promise<void> {
		// The consumer cannot resize a cross-origin popup, so the popup resizes itself.
		if (this.options.context === CONTEXT.POPUP) resizePopup(window, dimensions);
		await this.sendMessage(MESSAGE_NAME.RESIZE, dimensions);
	}

	async show(): Promise<void> {
		await this.sendMessage(MESSAGE_NAME.SHOW, {});
	}

	async hide(): Promise<void> {
		await this.sendMessage(MESSAGE_NAME.HIDE, {});
	}

	async reportError(error: Error): Promise<void> {
		await this.sendMessage(MESSAGE_NAME.ERROR, {
			message: error.message,
		});
	}

	/** Reports a failed start or INIT delivery on the host `error` event. */
	emitInitFailure(error: Error): void {
		this.options.event.emit(
			EVENT.ERROR,
			new Error(`Failed to initialize host component: ${error.message}`, {
				cause: error,
			}),
		);
	}

	/**
	 * Tells the consumer why initialization failed, so it can report the host's
	 * reason while the page may still retry. Teardown may follow immediately,
	 * so delivery is best effort.
	 */
	reportInitFailure(error: Error): void {
		if (this.destroyed) return;
		void this.sendMessage(MESSAGE_NAME.ERROR, {
			message: `Host initialization failed: ${error.message}`,
			initFailed: true,
		}).catch(() => undefined);
	}

	exportData<T>(exports: T): Promise<void> {
		const operation = this.exportQueue.then(() =>
			this.sendExportBatch(exports),
		);
		this.exportQueue = operation.catch(() => undefined);
		return operation;
	}

	private async sendExportBatch<T>(exports: T): Promise<void> {
		this.bridge.startBatch();
		let serialized: unknown;
		try {
			serialized = serializeFunctions(exports, this.bridge);
		} catch (error) {
			this.bridge.abortBatch();
			throw error;
		}
		let deliveryAttempted = false;
		try {
			await this.sendMessage(MESSAGE_NAME.EXPORT, serialized, () => {
				deliveryAttempted = true;
			});
			this.bridge.finishBatch();
		} catch (error) {
			if (deliveryAttempted) this.bridge.finishBatch(true);
			else this.bridge.abortBatch();
			throw error;
		}
	}

	async getPeerInstances(
		options?: GetPeerInstancesOptions,
	): Promise<PeerInfo[]> {
		assertPeerInstancesOptions(options);
		const response = await this.messenger.send<
			{ options?: GetPeerInstancesOptions },
			PeerInfo[]
		>(
			this.options.consumerWindow,
			this.options.getConsumerDomain(),
			MESSAGE_NAME.GET_SIBLINGS,
			{ options },
		);

		return deserializeFunctions(
			response ?? [],
			this.peerBridge,
			this.options.consumerWindow,
			this.options.getConsumerDomain(),
		) as PeerInfo[];
	}

	destroy(): void {
		if (this.destroyed) {
			return;
		}

		this.destroyed = true;
		// The consumer's calls wait without a timeout, so tell it this session
		// ended; calls not yet dispatched would otherwise never be answered.
		try {
			this.messenger.post(
				this.options.consumerWindow,
				this.options.getConsumerDomain(),
				MESSAGE_NAME.TEARDOWN,
				{},
			);
		} catch {
			// The consumer window may already be closed.
		}
		this.messenger.destroy();
		this.bridge.destroy();
		this.peerBridge.destroy();
	}

	private async sendInit(): Promise<void> {
		try {
			await this.options.beforeInit();
		} catch {
			// The coordinator reports a failed start; no INIT was attempted.
			return;
		}
		try {
			if (this.destroyed) return;
			await this.sendMessage(MESSAGE_NAME.INIT, { sessionId: this.sessionId });
		} catch (error) {
			// Teardown rejects pending work; that is not an initialization failure.
			if (this.destroyed) return;
			this.emitInitFailure(normalizeError(error));
			console.error("Failed to send init message:", error);
		}
	}

	private async sendMessage<T>(
		name: string,
		data: T,
		onDeliveryAttempt?: () => void,
	): Promise<void> {
		await this.messenger.send(
			this.options.consumerWindow,
			this.options.getConsumerDomain(),
			name,
			data,
			undefined,
			onDeliveryAttempt,
		);
	}
}

/**
 * Checks `getPeerInstances()` options before anything is sent, so a renamed
 * or mistyped option rejects instead of silently narrowing discovery.
 * @throws Error naming the option
 * @internal
 */
export function assertPeerInstancesOptions(options: unknown): void {
	if (options === undefined) return;
	if (typeof options !== "object" || options === null) {
		throw new Error("getPeerInstances() options must be an object");
	}
	if (Object.hasOwn(options, "anyConsumer")) {
		throw new Error(
			'getPeerInstances() option "anyConsumer" was renamed. Use { allTags: true } to include other component tags.',
		);
	}
	const { allTags } = options as GetPeerInstancesOptions;
	if (allTags !== undefined && typeof allTags !== "boolean") {
		throw new Error("getPeerInstances() allTags must be a boolean");
	}
}
