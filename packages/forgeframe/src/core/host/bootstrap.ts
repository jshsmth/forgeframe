/**
 * @packageDocumentation
 * Host start-up and singleton lifecycle.
 *
 * @remarks
 * This internal module owns the only host start path: it checks `initHost()`
 * arguments, enforces one active host per window, starts the runtime from the
 * channel metadata, and returns the narrow `Host` object.
 */

import { EVENT, PROTOCOL_VERSION } from "../../constants";
import { assertNoRemovedPropOptions } from "../../props/removed-options";
import type { EventHandler } from "../../types/events";
import type { HostPropsDefinition } from "../../types/props";
import type {
	ComponentOptions,
	ForgeFrameComponent,
	ForgeFrameComponentReference,
	Host,
	InitHostOptions,
} from "../../types/runtime";
import type { DomainMatcher } from "../../types/utility";
import { hasBrowserWindow } from "../../utils/browser";
import { assertDomainMatcher } from "../../utils/domain-pattern";
import {
	readWindowNamePayload,
	type WindowNamePayloadClassification,
} from "../../window/name-payload";
import type { WindowNamePayload } from "../../window/types";
import { getComponentOptions } from "../component-registry";
import { assertNoReservedPropDefinitions } from "./builtin-keys";
import { HostComponent } from "./component";
import {
	CONSUMER_WINDOW_RESOLUTION_ERROR,
	resolveConsumerWindow,
} from "./security";

let hostInstance: HostComponent<
	Record<string, unknown>,
	Record<string, unknown>
> | null = null;

/**
 * Reads the channel metadata the host starts from.
 *
 * @throws For a payload from another protocol in a window with a consumer,
 * before anything is sent to that unverified consumer.
 */
function readInitialPayload(): WindowNamePayload | null {
	const result = readWindowNamePayload();
	if (!result) return null;
	if (result.kind === "unsupported") {
		// A stale name with no parent or opener has no consumer to upgrade, so it
		// starts nothing, as a current payload without a consumer window does.
		if (!hasConsumerWindow()) return null;
		throw new Error(describeUnsupportedPayload(result));
	}
	if (result.kind === "invalid") {
		console.error("Failed to parse ForgeFrame payload from window.name");
		return null;
	}
	return result.payload;
}

/** Whether this window has a parent or opener that could be its consumer. */
function hasConsumerWindow(): boolean {
	try {
		resolveConsumerWindow();
		return true;
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === CONSUMER_WINDOW_RESOLUTION_ERROR
		) {
			return false;
		}
		throw error;
	}
}

/** Names the consumer's ForgeFrame line and which side must upgrade. */
function describeUnsupportedPayload(
	result: Extract<WindowNamePayloadClassification, { kind: "unsupported" }>,
): string {
	const { tag, protocolVersion, version } = result;
	const protocol =
		protocolVersion === undefined
			? "no protocol version"
			: `protocol ${protocolVersion}`;
	const evidence = version ? `${protocol}, package ${version}` : protocol;
	const prefix = `ForgeFrame host for "${tag}" cannot start:`;
	if (protocolVersion !== undefined && protocolVersion > PROTOCOL_VERSION) {
		return `${prefix} the consumer uses a newer ForgeFrame protocol (${evidence}). Upgrade the host to the consumer's ForgeFrame version.`;
	}
	const line = protocolVersion === 2 ? "1.x" : "0.x";
	return `${prefix} the consumer uses ForgeFrame ${line} (${evidence}). Upgrade the consumer and host to ForgeFrame 2 together.`;
}

const INIT_HOST_CALL_SHAPE =
	"initHost(Component, { consumerOrigins }) or initHost({ props, consumerOrigins })";

const HOST_ALREADY_ACTIVE_ERROR =
	"A ForgeFrame host is already active in this window; call destroy() first";

/** Options accepted by the component form, which supplies its own props. */
type ComponentInitHostOptions = Omit<InitHostOptions, "props">;

/** Validated `initHost()` arguments, before any environment check. */
interface InitHostArguments {
	/** The component's registered options, for the component form. */
	definition?: ComponentOptions;
	options: InitHostOptions;
}

/**
 * Checks the call shape without reading the environment.
 *
 * @throws TypeError for a bare call, a non-ForgeFrame component, v1
 * positional arguments, or an unknown option.
 */
function readInitHostArguments(args: readonly unknown[]): InitHostArguments {
	const [first, second] = args;
	if (typeof first === "function") {
		const definition = getComponentOptions(
			first as unknown as ForgeFrameComponentReference,
		);
		if (!definition) {
			throw new TypeError(
				`initHost() expects a component returned by create() as its first argument. Use ${INIT_HOST_CALL_SHAPE}.`,
			);
		}
		if (args.length > 2) {
			throw new TypeError(
				`initHost() takes a component and one options object. Use ${INIT_HOST_CALL_SHAPE}.`,
			);
		}
		return { definition, options: readInitHostOptions(second, false) };
	}
	if (args.length > 1) {
		throw new TypeError(
			`initHost() no longer takes a positional allowlist. Pass consumerOrigins in the options object: ${INIT_HOST_CALL_SHAPE}.`,
		);
	}
	return { options: readInitHostOptions(first, true) };
}

/** Checks the options object's own keys and values. */
function readInitHostOptions(
	value: unknown,
	acceptsProps: boolean,
): InitHostOptions {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new TypeError(
			`initHost() requires an options object with consumerOrigins. Use ${INIT_HOST_CALL_SHAPE}.`,
		);
	}
	for (const key of Object.keys(value)) {
		if (key === "props" && !acceptsProps) {
			throw new TypeError(
				"initHost(Component, options) does not take props; the component supplies its own prop definitions.",
			);
		}
		if (key !== "consumerOrigins" && key !== "autoInit" && key !== "props") {
			throw new TypeError(
				`initHost() does not accept the "${key}" option. Use ${INIT_HOST_CALL_SHAPE}.`,
			);
		}
	}
	const { consumerOrigins, autoInit, props } = value as Record<string, unknown>;
	if (consumerOrigins === undefined) {
		throw new TypeError(
			`initHost() requires consumerOrigins, the consumer origins allowed to embed this host; pass '*' to allow any origin. Use ${INIT_HOST_CALL_SHAPE}.`,
		);
	}
	try {
		assertDomainMatcher(consumerOrigins, "initHost() consumerOrigins");
	} catch (error) {
		throw new TypeError(
			`${(error as Error).message}. Use ${INIT_HOST_CALL_SHAPE}.`,
		);
	}
	if (autoInit !== undefined && typeof autoInit !== "boolean") {
		throw new TypeError(
			`initHost() autoInit must be a boolean. Use ${INIT_HOST_CALL_SHAPE}.`,
		);
	}
	if (props !== undefined) {
		if (typeof props !== "object" || props === null || Array.isArray(props)) {
			throw new TypeError(
				`initHost() props must be a prop definitions object. Use ${INIT_HOST_CALL_SHAPE}.`,
			);
		}
		assertNoReservedPropDefinitions(props as Record<string, unknown>);
		assertNoRemovedPropOptions(props);
	}
	return {
		consumerOrigins: consumerOrigins as DomainMatcher,
		autoInit,
		props: props as HostPropsDefinition<Record<string, unknown>> | undefined,
	};
}

/**
 * Starts the host runtime for a ForgeFrame iframe or popup.
 *
 * @remarks
 * Pass the shared component definition, so the host validates props with the
 * consumer's schemas and infers their types. The tag-agnostic
 * `initHost({ props, consumerOrigins })` form accepts a window opened for any
 * tag. Await `ready` before reading consumer props; until then `hostProps`
 * holds only the built-in controls.
 *
 * Only one host can be active in a window. Call `destroy()`, or let `ready`
 * reject, before starting another.
 *
 * @example
 * ```typescript
 * import { initHost } from 'forgeframe';
 * import { PaymentForm } from './payment-form';
 *
 * const host = initHost(PaymentForm, { consumerOrigins: ['https://shop.example.com'] });
 * if (host) {
 *   const { amount, onSuccess } = await host.ready;
 * }
 * ```
 *
 * @returns The started host, or `null` without browser globals, outside a
 * ForgeFrame window, for malformed channel metadata, or when the consumer
 * window cannot be resolved.
 * @throws For invalid arguments, in every environment. In a ForgeFrame window,
 * also while another host is active, when the window was opened for another
 * component's tag, when the consumer origin is not in `consumerOrigins`, or
 * when the consumer runs another ForgeFrame major version.
 * @public
 */
export function initHost<
	P extends Record<string, unknown>,
	X,
	I,
	RequireProps extends boolean,
	SchemaInputs,
>(
	component: ForgeFrameComponent<P, X, I, RequireProps, SchemaInputs>,
	options: ComponentInitHostOptions,
): Host<P> | null;
export function initHost<
	P extends Record<string, unknown> = Record<string, unknown>,
	SchemaInputs = P,
>(options: InitHostOptions<P, SchemaInputs>): Host<P> | null;
export function initHost(...args: unknown[]): Host | null {
	const { definition, options } = readInitHostArguments(args);
	if (!hasBrowserWindow()) return null;
	if (hostInstance) throw new Error(HOST_ALREADY_ACTIVE_ERROR);

	const payload = readInitialPayload();
	if (!payload) return null;
	if (definition && definition.tag !== payload.tag) {
		throw new Error(
			`initHost() received component "${definition.tag}", but this window was opened for "${payload.tag}"`,
		);
	}

	const runtime = startHostRuntime(
		payload,
		(definition?.props ?? options.props) as
			| HostPropsDefinition<Record<string, unknown>>
			| undefined,
		options,
	);
	return runtime && createHost(runtime);
}

/**
 * Constructs the runtime and makes it the active host until it is destroyed
 * or its start fails.
 */
function startHostRuntime(
	payload: WindowNamePayload,
	propDefinitions: HostPropsDefinition<Record<string, unknown>> | undefined,
	options: InitHostOptions,
): HostComponent<Record<string, unknown>> | null {
	let runtime: HostComponent<Record<string, unknown>>;
	try {
		runtime = new HostComponent(
			payload,
			propDefinitions,
			options.consumerOrigins,
			options.autoInit ?? true,
			() => {
				if (hostInstance === runtime) hostInstance = null;
			},
		);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === CONSUMER_WINDOW_RESOLUTION_ERROR
		) {
			return null;
		}

		throw error;
	}
	hostInstance = runtime;
	// Registered before the caller can observe ready, so a rejection handler
	// can retry immediately.
	void runtime.ready.catch(() => {
		if (hostInstance === runtime) clearHostInstance();
	});
	return runtime;
}

/** Exposes only the documented `Host` members of one runtime. */
function createHost(runtime: HostComponent<Record<string, unknown>>): Host {
	const on = (event: string, handler: EventHandler<never>): (() => void) => {
		if (event !== EVENT.PROPS && event !== EVENT.ERROR) {
			throw new TypeError(
				`Host.on() supports the "props" and "error" events, not "${event}"`,
			);
		}
		return runtime.event.on(event, handler);
	};
	return Object.freeze({
		ready: runtime.ready,
		hostProps: runtime.hostProps,
		init: () => runtime.init(),
		destroy: () => runtime.destroy(),
		on: on as Host["on"],
	});
}

export function getHost<
	P extends Record<string, unknown>,
	SchemaInputs = P,
>(): HostComponent<P, SchemaInputs> | null {
	return hostInstance as HostComponent<P, SchemaInputs> | null;
}

export function clearHostInstance(): void {
	const previousHost = hostInstance;
	hostInstance = null;
	previousHost?.destroy();
}
