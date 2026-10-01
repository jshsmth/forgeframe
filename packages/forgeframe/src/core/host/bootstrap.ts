/**
 * @packageDocumentation
 * Host bootstrap and singleton lifecycle helpers.
 *
 * @remarks
 * This internal module owns host instance creation, singleton reuse, deferred
 * init flushing decisions, and cleanup for `initHost()`/`clearHostInstance()`.
 */

import type { HostPropsDefinition } from "../../types/props";
import type { HostProps } from "../../types/runtime";
import type { DomainMatcher } from "../../types/utility";
import { hasBrowserWindow } from "../../utils/browser";
import {
	consumeInitialPayload,
	isForgeFrameWindow,
} from "../../window/name-payload";
import type { WindowNamePayload } from "../../window/types";
import { HostComponent } from "./component";
import { CONSUMER_WINDOW_RESOLUTION_ERROR } from "./security";

let hostInstance: HostComponent<
	Record<string, unknown>,
	Record<string, unknown>
> | null = null;
let pendingInitialPayload: WindowNamePayload<Record<string, unknown>> | null =
	null;

function readInitialPayload<P>(): WindowNamePayload<P> | null {
	if (isForgeFrameWindow()) {
		const payload = consumeInitialPayload<P>();
		if (!payload) {
			console.error("Failed to parse ForgeFrame payload from window.name");
			return null;
		}

		pendingInitialPayload = payload as WindowNamePayload<
			Record<string, unknown>
		>;
		return payload;
	}

	return pendingInitialPayload as WindowNamePayload<P> | null;
}

/**
 * Initializes or reuses the host runtime in a ForgeFrame iframe or popup.
 *
 * @remarks
 * Await the returned host's `ready` promise before reading consumer props or
 * children. It rejects if the verified bootstrap or host schema validation fails.
 *
 * @returns The host runtime, or `null` outside a ForgeFrame host context or
 * when validation destroys or replaces the runtime being configured.
 * @public
 */
export function initHost<P extends Record<string, unknown>, SchemaInputs = P>(
	propDefinitions?: HostPropsDefinition<P, SchemaInputs>,
	allowedConsumerDomains?: DomainMatcher,
	options: { deferInit?: boolean } = {},
): HostComponent<P, SchemaInputs> | null {
	if (!hasBrowserWindow()) return null;
	if (hostInstance) {
		const configuredHost = hostInstance;
		try {
			configuredHost.applyHostConfiguration(
				propDefinitions as
					| HostPropsDefinition<
							Record<string, unknown>,
							Record<string, unknown>
					  >
					| undefined,
				allowedConsumerDomains,
			);
		} catch (error) {
			// A rejected replacement preserves the working runtime. Failed initial
			// validation still invalidates a host whose bootstrap has not completed.
			if (
				hostInstance === configuredHost &&
				!configuredHost.hasCompletedBootstrap()
			)
				clearHostInstance();
			throw error;
		}
		// Validation may synchronously tear down or replace the configured runtime.
		// The outer call must not flush or reconfigure its replacement.
		if (hostInstance !== configuredHost) return null;

		try {
			if (allowedConsumerDomains) {
				hostInstance.assertAllowedConsumerDomain(allowedConsumerDomains);
			}
		} catch (error) {
			clearHostInstance();
			throw error;
		}

		if (!options.deferInit) {
			hostInstance.flushInit();
		}

		return hostInstance as HostComponent<P, SchemaInputs>;
	}

	const payload = readInitialPayload<P>();
	if (!payload) {
		return null;
	}

	try {
		const nextHostInstance = new HostComponent<P, SchemaInputs>(
			payload,
			propDefinitions,
			allowedConsumerDomains,
			options.deferInit ?? false,
			() => {
				if (hostInstance === nextHostInstance) clearHostInstance();
			},
		) as HostComponent<Record<string, unknown>, Record<string, unknown>>;
		hostInstance = nextHostInstance;
		pendingInitialPayload = null;
		void nextHostInstance.ready.catch(() => {
			// Async validation failures must allow the same-page retry that
			// synchronous bootstrap failures already support.
			if (hostInstance === nextHostInstance) {
				clearHostInstance();
			}
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

	return hostInstance as HostComponent<P, SchemaInputs>;
}

export function getHost<
	P extends Record<string, unknown>,
	SchemaInputs = P,
>(): HostComponent<P, SchemaInputs> | null {
	return hostInstance as HostComponent<P, SchemaInputs> | null;
}

export function clearHostInstance(): void {
	pendingInitialPayload = null;
	const previousHost = hostInstance;
	hostInstance = null;
	previousHost?.destroy();

	if (hasBrowserWindow()) {
		delete (
			window as unknown as { hostProps?: HostProps<Record<string, unknown>> }
		).hostProps;
	}
}
