/**
 * @packageDocumentation
 * Host props state and reconciliation helpers.
 *
 * @remarks
 * This internal module owns the live props object, reserved name filtering,
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
import type { RemoteValue } from "../../types/runtime";
import { normalizeError } from "../../utils/error";
import { getOrigin } from "../../window/helpers";
import type { HostBootstrapData } from "../../window/types";
import { RESERVED_PROP_NAMES } from "./reserved-props";
import type { HostPropDefinitions, HostPropsRuntimeOptions } from "./types";

/** Drops fields no host receives, such as a `then` from an unchecked consumer. */
function omitReservedPropNames<P extends Record<string, unknown>>(props: P): P {
	const kept: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(props)) {
		if (!RESERVED_PROP_NAMES.has(key)) kept[key] = value;
	}
	return kept as P;
}

export class HostPropsRuntime<P extends Record<string, unknown>> {
	/** The live props object `ready` resolves to; its identity never changes. */
	public readonly props = {} as RemoteValue<P>;

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
	 * Stale keys are removed while the live props object keeps its identity.
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
			const nextProps = omitReservedPropNames(
				this.deserialize(serializedProps),
			);
			validateNormalizedProps(nextProps as P, this.expectedDefinitions());
			this.commitProps(nextProps, serializedProps);
			return nextProps;
		} catch (error) {
			const propsError = toPropsFailure(error);
			console.error("Error deserializing props:", propsError);
			this.options.event.emit(EVENT.ERROR, propsError);
			throw propsError;
		}
	}

	/** Replaces the live props object's fields with the next snapshot's. */
	private commitProps(
		nextProps: RemoteValue<P>,
		serializedProps: SerializedProps,
	): void {
		for (const key of Object.keys(this.props)) {
			if (!Object.hasOwn(nextProps, key))
				delete (this.props as Record<string, unknown>)[key];
		}
		Object.assign(this.props, nextProps);
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

	onProps(handler: (props: RemoteValue<P>) => void): () => void {
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
