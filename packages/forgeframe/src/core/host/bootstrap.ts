import type { AnyFactoryInput } from "../../types/runtime";
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
import { createEventSubscriber } from "../../events/emitter";
import type {
	ForgeFrameComponent,
	Host,
	InitHostOptions,
} from "../../types/runtime";
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
import {
	CONSUMER_WINDOW_RESOLUTION_ERROR,
	resolveConsumerWindow,
} from "./security";

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

const HOST_ALREADY_ACTIVE_ERROR =
	"A ForgeFrame host is already active in this window; call destroy() first";

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
	RequireProps extends boolean,
>(
	component: ForgeFrameComponent<P, X, RequireProps, AnyFactoryInput>,
	options: Omit<InitHostOptions, "props">,
): Host<P> | null;
/**
 * Starts the host runtime for a window opened for any tag.
 *
 * @remarks
 * For hosts that serve many components. `props` validates the consumer's
 * props and types them; without it, delivered props are not validated. It
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
export function initHost<
	P extends Record<string, unknown> = Record<string, unknown>,
>(options: InitHostOptions<P>): Host<P> | null;
export function initHost(...args: unknown[]): Host | null {
	const start = readInitHostArguments(args);
	if (!hasBrowserWindow()) return null;
	if (hostInstance) throw new Error(HOST_ALREADY_ACTIVE_ERROR);

	const payload = readInitialPayload();
	if (!payload) return null;
	if (start.componentTag !== undefined && start.componentTag !== payload.tag) {
		throw new Error(
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
	let runtime: HostComponent<Record<string, unknown>>;
	try {
		runtime = new HostComponent(payload, {
			props: start.props,
			consumerOrigins: start.consumerOrigins,
			autoInit: start.autoInit,
			onDestroy: () => {
				if (hostInstance === runtime) hostInstance = null;
			},
		});
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
	const events = createEventSubscriber(
		runtime.event,
		HOST_EVENT_NAMES,
		describeUnknownHostEvent,
	);
	return Object.freeze({
		ready: runtime.ready,
		hostProps: runtime.hostProps,
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
