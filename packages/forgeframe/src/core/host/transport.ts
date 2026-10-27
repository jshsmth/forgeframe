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
import { ForgeFrameError, hasErrorCode, wireErrorCode } from "../../errors";
import type { SerializedProps } from "../../props/types";
import { resizePopup } from "../../render/popup";
import type { GetPeerInstancesOptions, PeerInfo } from "../../types/runtime";
import { generateShortUID } from "../../utils/uid";
import { getOrigin, waitForWindowFocus } from "../../window/helpers";
import type { HostBootstrapData } from "../../window/types";
import { toHandshakeFailure } from "./handshake-failure";
import { assertPeerInstancesOptions } from "./peer-instances-options";
import type {
	HostTransportOptions,
	HostTransportPropsHandler,
	VerifiedMessageSource,
} from "./types";

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
			getOrigin(),
			this.options.consumerOrigin,
		);
		this.bridge = new FunctionBridge(this.messenger, (source) =>
			this.isConsumerSource(source),
		);
		this.peerBridge = new FunctionBridge(
			this.messenger,
			(source) => this.isConsumerSource(source),
			MESSAGE_NAME.PEER_CALL,
		);
	}

	/** Whether a verified message came from the consumer window at its origin. */
	private isConsumerSource(source: VerifiedMessageSource): boolean {
		return (
			source.window === this.options.consumerWindow &&
			source.domain === this.options.getConsumerOrigin()
		);
	}

	registerPropsHandler(handler: HostTransportPropsHandler): void {
		this.messenger.on<SerializedProps>(
			MESSAGE_NAME.PROPS,
			(serializedProps, source) => {
				if (
					source.domain !== this.options.getConsumerOrigin() ||
					!handler.isConsumerWindow(source)
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
			this.options.getConsumerOrigin(),
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
			this.options.getConsumerOrigin(),
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

	/** Reports a failed start or INIT delivery on the host `error` event, keeping its code. */
	emitInitFailure(error: ForgeFrameError): void {
		this.options.event.emit(
			EVENT.ERROR,
			new ForgeFrameError(
				error.code,
				`Failed to initialize host component: ${error.message}`,
				{ cause: error },
			),
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
			code: wireErrorCode(error),
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
			if (exportMayBeStored(deliveryAttempted, error))
				this.bridge.finishBatch(true);
			else this.bridge.abortBatch();
			throw error;
		}
	}

	async getPeerInstances(
		options?: GetPeerInstancesOptions,
	): Promise<PeerInfo[]> {
		assertPeerInstancesOptions(options);
		const response = await this.messenger.send<
			{ options?: GetPeerInstancesOptions | undefined },
			PeerInfo[]
		>(
			this.options.consumerWindow,
			this.options.getConsumerOrigin(),
			MESSAGE_NAME.GET_PEERS,
			{ options },
		);

		// The verified consumer built this list (consumer/peers.ts getPeerInstances);
		// deserializing replaces function references and keeps its shape.
		return deserializeFunctions(
			response ?? [],
			this.peerBridge,
			this.options.consumerWindow,
			this.options.getConsumerOrigin(),
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
				this.options.getConsumerOrigin(),
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
			this.emitInitFailure(toHandshakeFailure(error));
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
			this.options.getConsumerOrigin(),
			name,
			data,
			undefined,
			onDeliveryAttempt,
		);
	}
}

/**
 * Whether a failed export may still have reached the consumer's state, so its
 * callbacks must stay callable. A consumer that rejected the export with
 * `VALIDATION` kept its previous exports instead.
 */
function exportMayBeStored(
	deliveryAttempted: boolean,
	error: unknown,
): boolean {
	return deliveryAttempted && !hasErrorCode(error, "VALIDATION");
}
