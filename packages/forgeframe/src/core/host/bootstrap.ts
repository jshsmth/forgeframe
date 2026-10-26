/**
 * @packageDocumentation
 * Host start-up and singleton lifecycle.
 *
 * @remarks
 * This internal module owns the only host start path: after
 * `init-host-arguments.ts` checks the call shape, it enforces one active host
 * per window, starts the runtime from the channel metadata, and returns the
 * narrow `Host` object.
 */

import { PROTOCOL_VERSION } from "../../constants";
import { ForgeFrameError } from "../../errors";
import { createEventSubscriber } from "../../events/emitter";
import type { InferProps } from "../../types/props";
import type {
	AnyComponent,
	CheckedPropsDefinition,
	ExportsOf,
	GetPeerInstancesOptions,
	Host,
	InferablePropsDefinition,
	InitHostOptions,
	PropsOf,
} from "../../types/runtime";
import type { Dimensions } from "../../types/utility";
import { hasBrowserWindow } from "../../utils/browser";
import {
	readWindowNamePayload,
	type WindowNamePayloadClassification,
} from "../../window/name-payload";
import type { WindowNamePayload } from "../../window/types";
import { HostComponent } from "./component";
import { describeUnknownHostEvent, HOST_EVENT_NAMES } from "./events";
import {
	type HostStartOptions,
	readInitHostArguments,
} from "./init-host-arguments";
import { isConsumerWindowUnavailable, resolveConsumerWindow } from "./security";

let hostInstance: HostComponent<Record<string, unknown>> | null = null;

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
		throw new ForgeFrameError(
			"VERSION_MISMATCH",
			describeUnsupportedPayload(result),
		);
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
		if (isConsumerWindowUnavailable(error)) return false;
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

const HOST_ALREADY_ACTIVE_ERROR =
	"A ForgeFrame host is already active in this window; call destroy() first";

/**
 * Starts the host runtime for a ForgeFrame iframe or popup.
 *
 * @remarks
 * Pass the shared component definition, so the host validates props with the
 * consumer's schemas and infers their types. The tag-agnostic
 * `initHost({ props, consumerOrigins })` form accepts a window opened for any
 * tag. Await `ready` to read the consumer's props; the returned handle
 * carries the host controls.
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
export function initHost<C extends AnyComponent>(
	component: C,
	options: Omit<InitHostOptions, "props">,
): Host<PropsOf<C>, ExportsOf<C>> | null;
/**
 * Starts the host runtime for a window opened for any tag.
 *
 * @remarks
 * For hosts that serve many components. `props` validates the consumer's
 * props, and their types are inferred from it; without it, delivered props
 * are not validated and are typed `Record<string, unknown>`. This form has no
 * exports schema, so `export()` sends any value and the consumer validates
 * it. It
 * otherwise behaves like `initHost(Component, options)`: await `ready` before
 * reading consumer props, and only one host can be active in a window.
 *
 * @example
 * ```typescript
 * import { initHost } from 'forgeframe';
 * import { paymentProps } from './payment-props';
 *
 * const host = initHost({ props: paymentProps, consumerOrigins: ['https://shop.example.com'] });
 * if (host) {
 *   const { amount } = await host.ready;
 * }
 * ```
 *
 * @returns The started host, or `null` without browser globals, outside a
 * ForgeFrame window, for malformed channel metadata, or when the consumer
 * window cannot be resolved.
 * @throws For invalid arguments, in every environment. In a ForgeFrame window,
 * also while another host is active, when the consumer origin is not in
 * `consumerOrigins`, or when the consumer runs another ForgeFrame major
 * version.
 * @public
 */
export function initHost<const D extends InferablePropsDefinition = never>(
	options: Omit<InitHostOptions, "props"> & {
		props?: D & CheckedPropsDefinition<D>;
	},
): Host<[D] extends [never] ? Record<string, unknown> : InferProps<D>> | null;
export function initHost(...args: unknown[]): Host | null {
	const start = readInitHostArguments(args);
	if (!hasBrowserWindow()) return null;
	if (hostInstance)
		throw new ForgeFrameError("VALIDATION", HOST_ALREADY_ACTIVE_ERROR);

	const payload = readInitialPayload();
	if (!payload) return null;
	if (start.componentTag !== undefined && start.componentTag !== payload.tag) {
		throw new ForgeFrameError(
			"VALIDATION",
			`initHost() received component "${start.componentTag}", but this window was opened for "${payload.tag}"`,
		);
	}

	const runtime = startHostRuntime(payload, start);
	return runtime && createHost(runtime);
}

/**
 * Constructs the runtime and makes it the active host until it is destroyed
 * or its start fails.
 */
function startHostRuntime(
	payload: WindowNamePayload,
	start: HostStartOptions,
): HostComponent<Record<string, unknown>> | null {
	let consumerWindow: Window;
	try {
		consumerWindow = resolveConsumerWindow();
	} catch (error) {
		if (isConsumerWindowUnavailable(error)) return null;
		throw error;
	}
	const runtime: HostComponent<Record<string, unknown>> = new HostComponent(
		payload,
		{
			props: start.props,
			exportsSchema: start.exportsSchema,
			consumerOrigins: start.consumerOrigins,
			consumerWindow,
			autoInit: start.autoInit,
			onDestroy: () => {
				if (hostInstance === runtime) hostInstance = null;
			},
		},
	);
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
	const events = createEventSubscriber(
		runtime.event,
		HOST_EVENT_NAMES,
		describeUnknownHostEvent,
	);
	return Object.freeze({
		ready: runtime.ready,
		uid: runtime.uid,
		tag: runtime.tag,
		consumerOrigin: runtime.consumerOrigin,
		close: () => runtime.close(),
		focus: () => runtime.focus(),
		resize: (dimensions: Dimensions) => runtime.resize(dimensions),
		show: () => runtime.show(),
		hide: () => runtime.hide(),
		export: (exports: unknown) => runtime.export(exports),
		onProps: (handler: (props: Record<string, unknown>) => void) =>
			runtime.onProps(handler),
		reportError: (error: Error) => runtime.reportError(error),
		getPeerInstances: (options?: GetPeerInstancesOptions) =>
			runtime.getPeerInstances(options),
		init: () => runtime.init(),
		destroy: () => runtime.destroy(),
		on: events.on,
		once: events.once,
	});
}

export function getHost<
	P extends Record<string, unknown>,
>(): HostComponent<P> | null {
	return hostInstance as HostComponent<P> | null;
}

export function clearHostInstance(): void {
	const previousHost = hostInstance;
	hostInstance = null;
	previousHost?.destroy();
}
