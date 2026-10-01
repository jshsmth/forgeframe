/**
 * @packageDocumentation
 * Host runtime coordinator.
 *
 * @remarks
 * This internal module keeps `HostComponent` focused on orchestration. It wires
 * together security checks, message transport, and host props state while
 * preserving the public host runtime surface exported from `src/core/host.ts`.
 */

import { PROTOCOL_VERSION } from "../../constants";
import { EventEmitter } from "../../events/emitter";
import { EMPTY_PROP_DEFINITIONS } from "../../props/definitions";
import type { HostPropsDefinition } from "../../types/props";
import type { HostProps } from "../../types/runtime";
import type { DomainMatcher } from "../../types/utility";
import { matchDomain } from "../../window/helpers";
import type { WindowNamePayload } from "../../window/types";
import { HostPropsRuntime } from "./props-runtime";
import {
	reassertAllowedConsumerDomain,
	resolveConsumerSecurityContext,
	resolveConsumerWindow,
	resolveMessagingConsumerContext,
} from "./security";
import { HostTransport } from "./transport";

export class HostComponent<
	P extends Record<string, unknown>,
	SchemaInputs = P,
> {
	public event: EventEmitter;

	/** Resolves once initial props have arrived and passed the host schemas. */
	public readonly ready: Promise<void>;

	private uid: string;

	private tag: string;

	private consumerWindow!: Window;

	private consumerDomain!: string;

	private consumerDomainVerified = false;

	private allowedConsumerDomains?: DomainMatcher;

	private transport!: HostTransport;

	private propsRuntime!: HostPropsRuntime<P, SchemaInputs>;

	private destroyed = false;
	private messagingBootstrap: boolean;
	private bootstrapCompleted = false;

	constructor(
		payload: WindowNamePayload<P>,
		propDefinitions: HostPropsDefinition<
			P,
			SchemaInputs
		> = EMPTY_PROP_DEFINITIONS as HostPropsDefinition<P, SchemaInputs>,
		allowedConsumerDomains?: DomainMatcher,
		deferInit = false,
		private readonly onDestroy?: () => void,
	) {
		this.uid = payload.uid;
		this.tag = payload.tag;
		this.event = new EventEmitter();
		this.allowedConsumerDomains = allowedConsumerDomains;
		const deferredProps = payload.protocolVersion === PROTOCOL_VERSION;
		this.messagingBootstrap = deferredProps;

		let transport: HostTransport | null = null;
		let propsRuntime: HostPropsRuntime<P, SchemaInputs> | null = null;

		try {
			this.consumerWindow = resolveConsumerWindow();

			const securityContext = (
				deferredProps
					? resolveMessagingConsumerContext
					: resolveConsumerSecurityContext
			)({
				consumerWindow: this.consumerWindow,
				claimedConsumerDomain: payload.consumerDomain,
				allowedConsumerDomains: this.allowedConsumerDomains,
				tag: this.tag,
			});

			this.consumerDomain = securityContext.consumerDomain;
			this.consumerDomainVerified = securityContext.consumerDomainVerified;

			transport = new HostTransport({
				uid: this.uid,
				tag: this.tag,
				event: this.event,
				consumerWindow: this.consumerWindow,
				consumerDomain: this.consumerDomain,
				getConsumerDomain: () => this.consumerDomain,
				deferInit,
				beforeInit: deferredProps ? () => this.ready : undefined,
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
				isConsumerDomainVerified: () => this.consumerDomainVerified,
				getMessenger: () => this.transport.messenger,
				getBridge: () => this.transport.bridge,
				onFirstHostPropsAccess: () => this.transport.handleHostPropsAccess(),
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
				consumerProps: {
					configurable: true,
					get: () => this.propsRuntime.consumerProps,
				},
				propsHandlers: {
					configurable: true,
					get: () => this.propsRuntime.propsHandlers,
				},
			});

			this.transport.registerPropsHandler({
				isConsumerSource: (source) => source.window === this.consumerWindow,
				applySerializedProps: (serializedProps) =>
					this.propsRuntime.applySerializedProps(serializedProps),
			});

			this.hostProps = this.propsRuntime.initializeHostProps(
				deferredProps
					? { ...payload, props: {}, children: undefined }
					: payload,
				!deferredProps,
			);
			this.propsRuntime.exposeHostProps();
			// Legacy props have already passed synchronous validation above.
			this.bootstrapCompleted = !deferredProps;
			this.ready = deferredProps
				? this.initializeFromConsumer()
				: Promise.resolve();
			// Callers can await ready; deferred initialization must not create an
			// unhandled rejection when the embedding consumer has already closed.
			void this.ready.then(
				() => {
					this.bootstrapCompleted = true;
				},
				() => undefined,
			);

			if (!deferInit) {
				this.flushInit();
			}
		} catch (error) {
			propsRuntime?.destroy();
			transport?.destroy();
			this.event.removeAllListeners();
			throw error;
		}
	}

	private async initializeFromConsumer(): Promise<void> {
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
		this.consumerDomainVerified = true;
		if (this.allowedConsumerDomains)
			this.assertAllowedConsumerDomain(this.allowedConsumerDomains);
		this.propsRuntime.applyBootstrap(data);
		if (this.destroyed)
			throw new Error("Host destroyed before bootstrap completed");
	}

	public get hostProps(): HostProps<P> {
		return this.propsRuntime.hostProps;
	}

	public set hostProps(value: HostProps<P>) {
		this.propsRuntime.hostProps = value;
	}

	/** Distinguishes replacement configuration from deferred initial validation. @internal */
	hasCompletedBootstrap(): boolean {
		return this.bootstrapCompleted;
	}

	flushInit(): void {
		this.transport.flushInit();
	}

	getProps(): HostProps<P> {
		return this.hostProps;
	}

	getInitError(): Error | null {
		return this.transport.getInitError();
	}

	applyHostConfiguration(
		propDefinitions?: HostPropsDefinition<P, SchemaInputs>,
		allowedConsumerDomains?: DomainMatcher,
	): void {
		if (propDefinitions !== undefined) {
			this.propsRuntime.applyHostConfiguration(propDefinitions);
		}

		if (allowedConsumerDomains !== undefined) {
			this.allowedConsumerDomains = allowedConsumerDomains;
		}
	}

	assertAllowedConsumerDomain(allowedConsumerDomains: DomainMatcher): void {
		if (this.messagingBootstrap) {
			if (!matchDomain(allowedConsumerDomains, this.consumerDomain)) {
				throw new Error(
					`Consumer domain "${this.consumerDomain}" is not allowed for component "${this.tag}"`,
				);
			}
			return;
		}
		const securityContext = reassertAllowedConsumerDomain({
			consumerWindow: this.consumerWindow,
			consumerDomain: this.consumerDomain,
			consumerDomainVerified: this.consumerDomainVerified,
			allowedConsumerDomains,
			tag: this.tag,
			onConsumerDomainChange: (previousDomain, nextDomain) => {
				this.transport.updateTrustedConsumerDomain(previousDomain, nextDomain);
			},
		});

		this.consumerDomain = securityContext.consumerDomain;
		this.consumerDomainVerified = securityContext.consumerDomainVerified;
	}

	destroy(): void {
		if (this.destroyed) {
			return;
		}

		this.destroyed = true;
		this.transport.destroy();
		this.event.removeAllListeners();
		this.propsRuntime.destroy();
		this.onDestroy?.();
	}
}
