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
import type { HostEvents } from "../../types/events";
import type { HostPropsDefinition } from "../../types/props";
import type { HostProps } from "../../types/runtime";
import type { DomainMatcher } from "../../types/utility";
import { normalizeError } from "../../utils/error";
import type { HostBootstrapData, WindowNamePayload } from "../../window/types";
import { assertAllowedConsumerDomain } from "./consumer-origin-policy";
import { HostPropsRuntime } from "./props-runtime";
import {
	resolveConsumerWindow,
	resolveMessagingConsumerContext,
} from "./security";
import { HostTransport } from "./transport";
import type { HostRuntimeOptions } from "./types";

export class HostComponent<
	P extends Record<string, unknown>,
	SchemaInputs = P,
> {
	public event: EventEmitter<HostEvents>;

	/** Resolves to `hostProps` once initial props have passed the host schemas. */
	public readonly ready: Promise<HostProps<P>>;

	private uid: string;

	private tag: string;

	private consumerWindow!: Window;

	private consumerDomain!: string;

	private transport!: HostTransport;

	private propsRuntime!: HostPropsRuntime<P, SchemaInputs>;

	private destroyed = false;

	private readonly consumerOrigins: DomainMatcher;

	private readonly onDestroy?: () => void;

	/** Selects and checks the consumer origin, then requests BOOTSTRAP. */
	constructor(
		payload: WindowNamePayload,
		options: HostRuntimeOptions<P, SchemaInputs>,
	) {
		this.uid = payload.uid;
		this.tag = payload.tag;
		this.event = new EventEmitter();
		this.consumerOrigins = options.consumerOrigins;
		this.onDestroy = options.onDestroy;

		let transport: HostTransport | null = null;
		let propsRuntime: HostPropsRuntime<P, SchemaInputs> | null = null;

		try {
			this.consumerWindow = resolveConsumerWindow();

			// The bootstrap exchange verifies this target before any props arrive.
			this.consumerDomain = resolveMessagingConsumerContext({
				consumerWindow: this.consumerWindow,
				claimedConsumerDomain: payload.consumerDomain,
				consumerOrigins: this.consumerOrigins,
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

			propsRuntime = new HostPropsRuntime(
				options.props ??
					(EMPTY_PROP_DEFINITIONS as HostPropsDefinition<P, SchemaInputs>),
				{
					uid: this.uid,
					tag: this.tag,
					event: this.event,
					controls: {
						close: () => this.transport.close(),
						focus: () => this.transport.focus(),
						resize: (dimensions) => this.transport.resize(dimensions),
						show: () => this.transport.show(),
						hide: () => this.transport.hide(),
						reportError: (error) => this.transport.reportError(error),
						exportData: <T>(exports: T) => this.transport.exportData(exports),
						getPeerInstances: (options) =>
							this.transport.getPeerInstances(options),
					},
					getConsumerWindow: () => this.consumerWindow,
					getConsumerDomain: () => this.consumerDomain,
					getBridge: () => this.transport.bridge,
				},
			);
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

	private async initializeFromConsumer(): Promise<HostProps<P>> {
		const data = await this.receiveBootstrap();
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
			return data;
		} catch (error) {
			if (!this.destroyed)
				this.transport.emitInitFailure(normalizeError(error));
			throw error;
		}
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
		this.event.dispose();
		this.propsRuntime.destroy();
	}
}
