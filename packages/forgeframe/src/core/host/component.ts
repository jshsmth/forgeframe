/**
 * @packageDocumentation
 * Host runtime coordinator.
 *
 * @remarks
 * This internal module keeps `HostComponent` focused on orchestration. It wires
 * together security checks, message transport, and host props state. Callers
 * reach it only through the `Host` object that `initHost()` returns.
 */

import { ForgeFrameError } from "../../errors";
import { EventEmitter } from "../../events/emitter";
import { validateExports } from "../../props/exports";
import type { StandardSchemaV1 } from "../../props/schema";
import type { HostEvents } from "../../types/events";
import type {
	GetPeerInstancesOptions,
	PeerInfo,
	RemoteValue,
} from "../../types/runtime";
import type { Dimensions, OriginMatcher } from "../../types/utility";
import type { HostBootstrapData, WindowNamePayload } from "../../window/types";
import { assertAllowedConsumerOrigin } from "./consumer-origin-policy";
import { toHandshakeFailure } from "./handshake-failure";
import { HostPropsRuntime } from "./props-runtime";
import { resolveMessagingConsumerContext } from "./security";
import { HostTransport } from "./transport";
import type { HostRuntimeOptions } from "./types";

/**
 * Checks the shape of the consumer's BOOTSTRAP response.
 * @throws ForgeFrameError `VALIDATION` unless it carries a props object
 */
function assertBootstrapResponse(
	data: unknown,
): asserts data is HostBootstrapData {
	const props = (data as Partial<HostBootstrapData> | null | undefined)?.props;
	if (typeof props !== "object" || props === null || Array.isArray(props)) {
		throw new ForgeFrameError(
			"VALIDATION",
			"Invalid consumer bootstrap response",
		);
	}
}

export class HostComponent<P extends Record<string, unknown>> {
	public event: EventEmitter<HostEvents>;

	/** Resolves to the live props once initial props have passed the host schemas. */
	public readonly ready: Promise<RemoteValue<P>>;

	public readonly uid: string;

	public readonly tag: string;

	private consumerWindow!: Window;

	/** Selected and checked before BOOTSTRAP is sent; fixed for the session. */
	public readonly consumerOrigin!: string;

	private transport!: HostTransport;

	private propsRuntime!: HostPropsRuntime<P>;

	private destroyed = false;

	private readonly consumerOrigins: OriginMatcher;

	private readonly exportsSchema?: StandardSchemaV1;

	private readonly onDestroy?: () => void;

	/** Selects and checks the consumer origin, then requests BOOTSTRAP. */
	constructor(payload: WindowNamePayload, options: HostRuntimeOptions<P>) {
		this.uid = payload.uid;
		this.tag = payload.tag;
		this.event = new EventEmitter();
		this.consumerOrigins = options.consumerOrigins;
		this.exportsSchema = options.exportsSchema;
		this.onDestroy = options.onDestroy;

		let transport: HostTransport | null = null;
		let propsRuntime: HostPropsRuntime<P> | null = null;

		try {
			this.consumerWindow = options.consumerWindow;

			// The bootstrap exchange verifies this target before any props arrive.
			this.consumerOrigin = resolveMessagingConsumerContext({
				consumerWindow: this.consumerWindow,
				claimedConsumerOrigin: payload.consumerDomain,
				consumerOrigins: this.consumerOrigins,
				tag: this.tag,
			});

			transport = new HostTransport({
				uid: this.uid,
				context: payload.context,
				event: this.event,
				consumerWindow: this.consumerWindow,
				consumerOrigin: this.consumerOrigin,
				getConsumerOrigin: () => this.consumerOrigin,
				beforeInit: () => this.ready,
			});
			this.transport = transport;

			propsRuntime = new HostPropsRuntime(options.props, {
				event: this.event,
				getConsumerWindow: () => this.consumerWindow,
				getConsumerOrigin: () => this.consumerOrigin,
				getBridge: () => this.transport.bridge,
			});
			this.propsRuntime = propsRuntime;
			Object.defineProperties(this, {
				messenger: {
					configurable: true,
					get: () => this.transport.messenger,
				},
				bridge: {
					configurable: true,
					get: () => this.transport.bridge,
				},
			});

			this.transport.registerPropsHandler({
				isConsumerSource: (source) => source.window === this.consumerWindow,
				applySerializedProps: (serializedProps) =>
					this.propsRuntime.applySerializedProps(serializedProps),
			});

			this.ready = this.initializeFromConsumer();
			// Callers can await ready; a failed start must not create an unhandled
			// rejection when the embedding consumer has already closed.
			void this.ready.catch(() => undefined);

			if (options.autoInit ?? true) {
				this.init();
			}
		} catch (error) {
			propsRuntime?.destroy();
			transport?.destroy();
			this.event.dispose();
			throw error;
		}
	}

	private async initializeFromConsumer(): Promise<RemoteValue<P>> {
		const data = await this.receiveBootstrap();
		try {
			this.propsRuntime.applyBootstrap(data);
		} catch (error) {
			const failure = toHandshakeFailure(error);
			// Only the verified, allowed consumer learns why its props were rejected.
			this.transport.reportInitFailure(failure);
			throw failure;
		}
		if (this.destroyed)
			throw new ForgeFrameError(
				"CLOSED",
				"Host destroyed before bootstrap completed",
			);
		return this.propsRuntime.props;
	}

	/**
	 * Requests BOOTSTRAP and checks the response before any props are applied.
	 *
	 * @remarks
	 * A failure here is reported on the `error` event, unless the host was
	 * destroyed; a schema rejection is reported by the props runtime instead.
	 */
	private async receiveBootstrap(): Promise<HostBootstrapData> {
		try {
			const data = await this.transport.requestBootstrap();
			if (this.destroyed)
				throw new ForgeFrameError(
					"CLOSED",
					"Host destroyed before bootstrap completed",
				);
			assertBootstrapResponse(data);
			// Defence in depth: the origin was checked before BOOTSTRAP was sent, and
			// the messenger accepts this response only from that origin.
			assertAllowedConsumerOrigin(
				this.consumerOrigins,
				this.consumerOrigin,
				this.tag,
			);
			return data;
		} catch (error) {
			if (this.destroyed) throw error;
			const failure = toHandshakeFailure(error);
			this.transport.emitInitFailure(failure);
			throw failure;
		}
	}

	/**
	 * Checks exports against the component's `exports` schema, then queues
	 * them, so an invalid export rejects here without being sent.
	 */
	async export(exports: unknown): Promise<void> {
		validateExports(this.exportsSchema, exports);
		return this.transport.exportData(exports);
	}

	close(): Promise<void> {
		return this.transport.close();
	}

	focus(): Promise<void> {
		return this.transport.focus();
	}

	resize(dimensions: Dimensions): Promise<void> {
		return this.transport.resize(dimensions);
	}

	show(): Promise<void> {
		return this.transport.show();
	}

	hide(): Promise<void> {
		return this.transport.hide();
	}

	reportError(error: Error): Promise<void> {
		return this.transport.reportError(error);
	}

	getPeerInstances(options?: GetPeerInstancesOptions): Promise<PeerInfo[]> {
		return this.transport.getPeerInstances(options);
	}

	/** Subscribes to committed prop updates; returns the unsubscribe function. */
	onProps(handler: (props: RemoteValue<P>) => void): () => void {
		return this.propsRuntime.onProps(handler);
	}

	/** Sends INIT once `ready` resolves; idempotent, and inert after `destroy()`. */
	init(): void {
		this.transport.sendInitOnce();
	}

	destroy(): void {
		if (this.destroyed) {
			return;
		}

		this.destroyed = true;
		// Release this runtime first, so teardown never clears a replacement.
		this.onDestroy?.();
		this.transport.destroy();
		this.event.dispose();
		this.propsRuntime.destroy();
	}
}
