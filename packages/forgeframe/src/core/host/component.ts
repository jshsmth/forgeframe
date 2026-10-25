/**
 * @packageDocumentation
 * Host runtime coordinator.
 *
 * @remarks
 * This internal module keeps `HostComponent` focused on orchestration. It wires
 * together security checks, message transport, and host props state. Callers
 * reach it only through the `Host` object that `initHost()` returns.
 */

import { EventEmitter } from "../../events/emitter";
import { EMPTY_PROP_DEFINITIONS } from "../../props/definitions";
import type { HostPropsDefinition } from "../../types/props";
import type { HostProps } from "../../types/runtime";
import type { DomainMatcher } from "../../types/utility";
import { normalizeError } from "../../utils/error";
import type { WindowNamePayload } from "../../window/types";
import { assertAllowedConsumerDomain } from "./consumer-origin-policy";
import { HostPropsRuntime } from "./props-runtime";
import {
	resolveConsumerWindow,
	resolveMessagingConsumerContext,
} from "./security";
import { HostTransport } from "./transport";

export class HostComponent<
	P extends Record<string, unknown>,
	SchemaInputs = P,
> {
	public event: EventEmitter;

	/** Resolves to `hostProps` once initial props have passed the host schemas. */
	public readonly ready: Promise<HostProps<P>>;

	private uid: string;

	private tag: string;

	private consumerWindow!: Window;

	private consumerDomain!: string;

	private transport!: HostTransport;

	private propsRuntime!: HostPropsRuntime<P, SchemaInputs>;

	private destroyed = false;

	/**
	 * Selects and checks the consumer origin, then requests BOOTSTRAP.
	 *
	 * @param consumerOrigins - Checked against the selected consumer origin
	 * before BOOTSTRAP is sent.
	 * @param autoInit - Sends INIT as soon as `ready` resolves; otherwise INIT
	 * waits for {@link HostComponent.init}.
	 * @param onDestroy - Runs first in `destroy()`, before resources are released.
	 */
	constructor(
		payload: WindowNamePayload,
		propDefinitions: HostPropsDefinition<
			P,
			SchemaInputs
		> = EMPTY_PROP_DEFINITIONS as HostPropsDefinition<P, SchemaInputs>,
		private readonly consumerOrigins: DomainMatcher,
		autoInit = true,
		private readonly onDestroy?: () => void,
	) {
		this.uid = payload.uid;
		this.tag = payload.tag;
		this.event = new EventEmitter();

		let transport: HostTransport | null = null;
		let propsRuntime: HostPropsRuntime<P, SchemaInputs> | null = null;

		try {
			this.consumerWindow = resolveConsumerWindow();

			// The bootstrap exchange verifies this target before any props arrive.
			this.consumerDomain = resolveMessagingConsumerContext({
				consumerWindow: this.consumerWindow,
				claimedConsumerDomain: payload.consumerDomain,
				allowedConsumerDomains: this.consumerOrigins,
				tag: this.tag,
			});

			transport = new HostTransport({
				uid: this.uid,
				context: payload.context,
				event: this.event,
				consumerWindow: this.consumerWindow,
				consumerDomain: this.consumerDomain,
				getConsumerDomain: () => this.consumerDomain,
				beforeInit: () => this.ready,
			});
			this.transport = transport;

			propsRuntime = new HostPropsRuntime(propDefinitions, {
				uid: this.uid,
				tag: this.tag,
				event: this.event,
				controls: {
					close: () => this.transport.close(),
					focus: () => this.transport.focus(),
					resize: (dimensions) => this.transport.resize(dimensions),
					show: () => this.transport.show(),
					hide: () => this.transport.hide(),
					onError: (error) => this.transport.onError(error),
					exportData: <T>(exports: T) => this.transport.exportData(exports),
					consumerExport: <T>(data: T) => this.transport.consumerExport(data),
					getPeerInstances: (options) =>
						this.transport.getPeerInstances(options),
				},
				getConsumerWindow: () => this.consumerWindow,
				getConsumerDomain: () => this.consumerDomain,
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

			this.propsRuntime.initializeHostProps();
			this.ready = this.initializeFromConsumer();
			// Callers can await ready; a failed start must not create an unhandled
			// rejection when the embedding consumer has already closed.
			void this.ready.catch(() => undefined);

			if (autoInit) {
				this.init();
			}
		} catch (error) {
			propsRuntime?.destroy();
			transport?.destroy();
			this.event.removeAllListeners();
			throw error;
		}
	}

	private async initializeFromConsumer(): Promise<HostProps<P>> {
		const data = await this.transport.requestBootstrap();
		if (this.destroyed)
			throw new Error("Host destroyed before bootstrap completed");
		if (
			!data ||
			typeof data.props !== "object" ||
			data.props === null ||
			Array.isArray(data.props)
		) {
			throw new Error("Invalid consumer bootstrap response");
		}
		// Defence in depth: the origin was checked before BOOTSTRAP was sent, and
		// the messenger accepts this response only from that origin.
		assertAllowedConsumerDomain(
			this.consumerOrigins,
			this.consumerDomain,
			this.tag,
		);
		try {
			this.propsRuntime.applyBootstrap(data);
		} catch (error) {
			// Only the verified, allowed consumer learns why its props were rejected.
			this.transport.reportInitFailure(normalizeError(error));
			throw error;
		}
		if (this.destroyed)
			throw new Error("Host destroyed before bootstrap completed");
		return this.propsRuntime.hostProps;
	}

	public get hostProps(): HostProps<P> {
		return this.propsRuntime.hostProps;
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
		this.event.removeAllListeners();
		this.propsRuntime.destroy();
	}
}
