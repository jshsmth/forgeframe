/**
 * @packageDocumentation
 * Host props state and reconciliation helpers.
 *
 * @remarks
 * This internal module owns `hostProps` construction, reserved key filtering,
 * bootstrap validation, and live prop reconciliation.
 */

import { EVENT } from "../../constants";
import {
	getDeliveredPropDefinitions,
	validateNormalizedProps,
} from "../../props/normalize";
import { deserializeProps } from "../../props/serialize";
import type { SerializedProps } from "../../props/types";
import type { HostPropsDefinition } from "../../types/props";
import type { HostProps, RemoteValue } from "../../types/runtime";
import { normalizeError } from "../../utils/error";
import { getDomain } from "../../window/helpers";
import type { HostBootstrapData } from "../../window/types";
import { HOST_PROPS_BUILTIN_KEYS } from "./builtin-keys";
import type { HostPropsRuntimeOptions } from "./types";

function filterReservedHostPropKeys<P extends Record<string, unknown>>(
	props: P,
): P {
	const filteredProps: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(props)) {
		if (HOST_PROPS_BUILTIN_KEYS.has(key)) {
			continue;
		}

		filteredProps[key] = value;
	}

	return filteredProps as P;
}

export class HostPropsRuntime<
	P extends Record<string, unknown>,
	SchemaInputs = P,
> {
	public hostProps!: HostProps<P>;

	public consumerProps!: RemoteValue<P>;

	public propsHandlers: Set<(props: RemoteValue<P>) => void> = new Set();
	private propsHandlerRegistrations = new WeakMap<
		(props: RemoteValue<P>) => void,
		object
	>();
	private initialized = false;
	private pendingBootstrapProps: SerializedProps | null = null;
	/** This host's own origin, read once when the host starts. */
	private readonly hostOrigin = getDomain();

	constructor(
		private readonly propDefinitions: HostPropsDefinition<P, SchemaInputs>,
		private options: HostPropsRuntimeOptions,
	) {}

	/** Starts with built-in controls only; consumer props arrive through bootstrap. */
	initializeHostProps(): HostProps<P> {
		this.consumerProps = {} as RemoteValue<P>;
		this.hostProps = this.createHostProps();
		return this.hostProps;
	}

	/** Constructs the host API surface; callbacks defer control work until invoked. */
	private createHostProps(): HostProps<P> {
		return {
			uid: this.options.uid,
			tag: this.options.tag,
			close: () => this.options.controls.close(),
			focus: () => this.options.controls.focus(),
			resize: (dimensions) => this.options.controls.resize(dimensions),
			show: () => this.options.controls.show(),
			hide: () => this.options.controls.hide(),
			onProps: (handler: (props: RemoteValue<P>) => void) =>
				this.onProps(handler),
			reportError: (error: Error) => this.options.controls.reportError(error),
			getConsumer: () => this.options.getConsumerWindow(),
			getConsumerDomain: () => this.options.getConsumerDomain(),
			export: <T>(exports: T) => this.options.controls.exportData(exports),
			consumer: {
				props: this.consumerProps,
			},
			getPeerInstances: (options) =>
				this.options.controls.getPeerInstances(options),
		} as HostProps<P>;
	}

	/**
	 * Completes bootstrap using any newer acknowledged props received while it was pending.
	 * The selected snapshot is validated against the host definitions.
	 * Subscribers are notified once.
	 */
	applyBootstrap(data: HostBootstrapData): void {
		// An acknowledged PROPS update can arrive before this response. Preserve
		// that newer snapshot.
		const nextProps = this.commitSerializedProps(
			this.pendingBootstrapProps ?? data.props,
		);
		this.initialized = true;
		this.pendingBootstrapProps = null;
		this.notifyPropsHandlers(nextProps);
	}

	/**
	 * Validates and commits a wire snapshot before notifying subscribers.
	 * Stale custom keys are removed while built-in controls keep their identity.
	 * Validation failure preserves the current prop snapshot and emits an error.
	 * An update acknowledged before bootstrap completes is published by bootstrap.
	 */
	applySerializedProps(serializedProps: SerializedProps): { success: true } {
		const nextProps = this.commitSerializedProps(serializedProps);
		if (this.initialized) this.notifyPropsHandlers(nextProps);
		return { success: true };
	}

	/** Validates and commits one wire snapshot, reporting a rejection as a host error. */
	private commitSerializedProps(
		serializedProps: SerializedProps,
	): RemoteValue<P> {
		try {
			const previousProps = this.consumerProps;
			const nextProps = this.deserialize(serializedProps);

			validateNormalizedProps(
				nextProps as P,
				this.getDeliveredPropDefinitions(),
			);
			const nextHostProps = filterReservedHostPropKeys(nextProps);

			this.commitHostProps(
				previousProps,
				nextProps,
				nextHostProps,
				serializedProps,
			);
			return nextProps;
		} catch (error) {
			const propsError = normalizeError(error);
			console.error("Error deserializing props:", propsError);
			this.options.event.emit(EVENT.ERROR, propsError);
			throw propsError;
		}
	}

	private commitHostProps(
		previousProps: RemoteValue<P>,
		nextProps: RemoteValue<P>,
		nextHostProps: Record<string, unknown>,
		serializedProps: SerializedProps,
	): void {
		this.removeStaleHostProps(previousProps, nextHostProps);
		this.consumerProps = nextProps;
		Object.assign(this.hostProps, nextHostProps);
		// The consumer object keeps its identity; only its snapshot is replaced.
		(this.hostProps.consumer as { props: RemoteValue<P> }).props =
			this.consumerProps;
		if (!this.initialized) {
			this.pendingBootstrapProps = serializedProps;
		}
	}

	/**
	 * Defers new subscriptions until the next update and skips cancelled observers.
	 * Observes async failures without awaiting subscribers or delaying acknowledgement.
	 */
	private notifyPropsHandlers(nextProps: RemoteValue<P>): void {
		const subscriptions = [...this.propsHandlers].map((handler) => ({
			handler,
			registration: this.propsHandlerRegistrations.get(handler),
		}));
		for (const { handler, registration } of subscriptions) {
			if (
				!this.propsHandlers.has(handler) ||
				this.propsHandlerRegistrations.get(handler) !== registration
			)
				continue;
			try {
				void Promise.resolve(handler(nextProps)).catch((error: unknown) => {
					console.error("Error in props handler:", error);
				});
			} catch (error) {
				console.error("Error in props handler:", error);
			}
		}
	}

	destroy(): void {
		this.propsHandlers.clear();
		this.pendingBootstrapProps = null;
	}

	private onProps(handler: (props: RemoteValue<P>) => void): () => void {
		if (!this.propsHandlers.has(handler))
			this.propsHandlerRegistrations.set(handler, {});
		this.propsHandlers.add(handler);
		const registration = this.propsHandlerRegistrations.get(handler);

		return () => {
			if (this.propsHandlerRegistrations.get(handler) === registration)
				this.propsHandlers.delete(handler);
		};
	}

	private deserialize(serializedProps: SerializedProps): RemoteValue<P> {
		return deserializeProps(
			this.filterConsumerOnlyProps(serializedProps),
			this.options.getBridge(),
			this.options.getConsumerWindow(),
			this.options.getConsumerDomain(),
		) as RemoteValue<P>;
	}

	/** Discards fields for defined props this host does not expect. */
	private filterConsumerOnlyProps<T extends Record<string, unknown>>(
		props: T,
	): T {
		const deliveredDefinitions = this.getDeliveredPropDefinitions();
		const entries = Object.entries(props);
		const deliveredEntries = entries.filter(
			([key]) =>
				!Object.hasOwn(this.propDefinitions, key) ||
				Object.hasOwn(deliveredDefinitions, key),
		);
		return deliveredEntries.length === entries.length
			? props
			: (Object.fromEntries(deliveredEntries) as T);
	}

	/**
	 * Selects the props this host expects: consumer-only props and props whose
	 * `deliverTo` excludes this host are never delivered, so they are neither
	 * required nor accepted.
	 */
	private getDeliveredPropDefinitions(): HostPropsDefinition<P, SchemaInputs> {
		const { hostOrigin } = this;
		return getDeliveredPropDefinitions(this.propDefinitions, {
			hostOrigin,
			sameOrigin:
				hostOrigin !== "null" &&
				this.options.getConsumerDomain() === hostOrigin,
		});
	}

	private removeStaleHostProps(
		previousProps: RemoteValue<P>,
		nextHostProps: Record<string, unknown>,
	): void {
		for (const key of Object.keys(previousProps)) {
			if (
				HOST_PROPS_BUILTIN_KEYS.has(key) ||
				Object.hasOwn(nextHostProps, key)
			) {
				continue;
			}

			delete (this.hostProps as Record<string, unknown>)[key];
		}
	}
}
