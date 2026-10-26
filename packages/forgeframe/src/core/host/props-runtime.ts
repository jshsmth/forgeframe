/**
 * @packageDocumentation
 * Host props state and reconciliation helpers.
 *
 * @remarks
 * This internal module owns `hostProps` construction, reserved key filtering,
 * bootstrap validation, and live prop reconciliation.
 */

import { EVENT } from "../../constants";
import { ForgeFrameError } from "../../errors";
import { EMPTY_PROP_DEFINITIONS } from "../../props/definitions";
import {
	createDeliveryTarget,
	getDeliveredPropDefinitions,
	selectExpectedFields,
	validateNormalizedProps,
} from "../../props/normalize";
import { deserializeProps } from "../../props/serialize";
import type { SerializedProps } from "../../props/types";
import type { PropsDefinition } from "../../types/props";
import type { HostProps, RemoteValue } from "../../types/runtime";
import { normalizeError } from "../../utils/error";
import { getOrigin } from "../../window/helpers";
import type { HostBootstrapData } from "../../window/types";
import { HOST_PROPS_BUILTIN_KEYS } from "./builtin-keys";
import type { HostPropDefinitions, HostPropsRuntimeOptions } from "./types";

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

export class HostPropsRuntime<P extends Record<string, unknown>> {
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
	private readonly hostOrigin = getOrigin();
	/** Definitions of the props this host expects, selected on first use. */
	private deliveredPropDefinitions?: Partial<PropsDefinition<P>>;

	/**
	 * @param propDefinitions - The host's definitions, or `"unchecked"` for a
	 * tag-agnostic host without `props`, which accepts every field unchecked
	 */
	constructor(
		private readonly propDefinitions: HostPropDefinitions<P>,
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
		const hostProps = {
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
			export: <T>(exports: T) => this.options.controls.exportData(exports),
			consumer: {
				props: this.consumerProps,
			},
			getPeerInstances: (options) =>
				this.options.controls.getPeerInstances(options),
		} as Omit<HostProps<P>, "consumerOrigin">;
		Object.defineProperty(hostProps, "consumerOrigin", {
			value: this.options.getConsumerOrigin(),
			enumerable: true,
		});
		return hostProps as HostProps<P>;
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

	/**
	 * Validates and commits one wire snapshot, reporting a rejection as a host
	 * error. The `error` event and the thrown error (which rejects `ready` during
	 * bootstrap) are the same `ForgeFrameError`.
	 */
	private commitSerializedProps(
		serializedProps: SerializedProps,
	): RemoteValue<P> {
		try {
			const previousProps = this.consumerProps;
			const nextProps = this.deserialize(serializedProps);

			validateNormalizedProps(nextProps as P, this.expectedDefinitions());
			const nextHostProps = filterReservedHostPropKeys(nextProps);

			this.commitHostProps(
				previousProps,
				nextProps,
				nextHostProps,
				serializedProps,
			);
			return nextProps;
		} catch (error) {
			const propsError = toPropsFailure(error);
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
			this.filterUndeliveredProps(serializedProps),
			this.options.getBridge(),
			this.options.getConsumerWindow(),
			this.options.getConsumerOrigin(),
		) as RemoteValue<P>;
	}

	/**
	 * Discards every field this host does not expect: undeclared fields,
	 * including those of `undefined` definition entries, and declared props
	 * that are not delivered to this host. A host without definitions keeps
	 * every field.
	 */
	private filterUndeliveredProps<T extends Record<string, unknown>>(
		props: T,
	): T {
		if (this.propDefinitions === "unchecked") return props;
		return selectExpectedFields(props, this.expectedDefinitions());
	}

	/**
	 * Selects the props this host expects: consumer-only props and props whose
	 * `deliverTo` excludes this host are never delivered, so they are neither
	 * required nor accepted.
	 */
	private expectedDefinitions(): Partial<PropsDefinition<P>> {
		// Both origins are fixed once the host starts, so the selection is too.
		this.deliveredPropDefinitions ??= getDeliveredPropDefinitions(
			// An unchecked host requires and validates no prop.
			this.propDefinitions === "unchecked"
				? (EMPTY_PROP_DEFINITIONS as PropsDefinition<P>)
				: this.propDefinitions,
			createDeliveryTarget(this.hostOrigin, this.options.getConsumerOrigin()),
		);
		return this.deliveredPropDefinitions;
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

/**
 * Gives a rejected props snapshot a code: ForgeFrame failures keep theirs, and
 * anything else, such as a throwing third-party schema, becomes `VALIDATION`
 * with the original as `cause`.
 * @internal
 */
function toPropsFailure(error: unknown): ForgeFrameError {
	if (error instanceof ForgeFrameError) return error;
	const cause = normalizeError(error);
	return new ForgeFrameError("VALIDATION", cause.message, { cause });
}
