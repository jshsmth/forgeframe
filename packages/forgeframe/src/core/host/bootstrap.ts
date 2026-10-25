/**
 * @packageDocumentation
 * Host bootstrap and singleton lifecycle helpers.
 *
 * @remarks
 * This internal module owns host instance creation, singleton reuse, deferred
 * init flushing decisions, and cleanup for `initHost()`/`clearHostInstance()`.
 */

import { PROTOCOL_VERSION } from "../../constants";
import { assertNoRemovedPropOptions } from "../../props/removed-options";
import type { HostPropsDefinition } from "../../types/props";
import type { ComponentOptions, HostProps } from "../../types/runtime";
import type { DomainMatcher } from "../../types/utility";
import { hasBrowserWindow } from "../../utils/browser";
import { assertDomainMatcher } from "../../utils/domain-pattern";
import {
	readWindowNamePayload,
	type WindowNamePayloadClassification,
} from "../../window/name-payload";
import type { WindowNamePayload } from "../../window/types";
import {
	getComponentOptions,
	getRegisteredComponent,
} from "../component-registry";
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

/**
 * Initializes or reuses the host runtime in a ForgeFrame iframe or popup.
 *
 * @remarks
 * Await the returned host's `ready` promise before reading consumer props or
 * children. It rejects if the verified bootstrap or host schema validation fails.
 *
 * @returns The host runtime, or `null` outside a ForgeFrame host context or
 * when validation destroys or replaces the runtime being configured.
 * @throws When the window was opened by a consumer on another ForgeFrame
 * major version; consumer and host must be upgraded together.
 * @public
 */
export function initHost<P extends Record<string, unknown>, SchemaInputs = P>(
	propDefinitions?: HostPropsDefinition<P, SchemaInputs>,
	allowedConsumerDomains?: DomainMatcher,
	options: { deferInit?: boolean } = {},
): HostComponent<P, SchemaInputs> | null {
	if (!hasBrowserWindow()) return null;
	if (allowedConsumerDomains !== undefined)
		assertDomainMatcher(allowedConsumerDomains, "allowedConsumerDomains");
	if (propDefinitions) assertNoRemovedPropOptions(propDefinitions);
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
			if (allowedConsumerDomains !== undefined) {
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

	const payload = readInitialPayload();
	if (!payload) {
		return null;
	}

	// A bare initHost() keeps the schema and allowlist of a component defined
	// for this tag, including after that definition rejected the consumer.
	const definition = definedComponentOptions(payload.tag);
	try {
		const nextHostInstance = new HostComponent<P, SchemaInputs>(
			payload,
			propDefinitions ??
				(definition?.props as HostPropsDefinition<P, SchemaInputs> | undefined),
			allowedConsumerDomains ?? definition?.allowedConsumerDomains,
			options.deferInit ?? false,
			() => {
				if (hostInstance === nextHostInstance) clearHostInstance();
			},
		) as HostComponent<Record<string, unknown>, Record<string, unknown>>;
		hostInstance = nextHostInstance;
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

/** Reads the options of the component registered for a tag. */
function definedComponentOptions(tag: string): ComponentOptions | undefined {
	const component = getRegisteredComponent(tag);
	return component ? getComponentOptions(component) : undefined;
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

	if (hasBrowserWindow()) {
		delete (
			window as unknown as { hostProps?: HostProps<Record<string, unknown>> }
		).hostProps;
	}
}
