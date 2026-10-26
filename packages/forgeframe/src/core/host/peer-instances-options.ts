/**
 * @packageDocumentation
 * `getPeerInstances()` argument policy.
 *
 * @remarks
 * Pure checks of the options a host passes before anything is sent, kept
 * apart from the transport like `init-host-arguments.ts`.
 */

import type { GetPeerInstancesOptions } from "../../types/runtime";

/**
 * Checks `getPeerInstances()` options before anything is sent, so a renamed
 * or mistyped option rejects instead of silently narrowing discovery.
 * @throws Error naming the option
 * @internal
 */
export function assertPeerInstancesOptions(options: unknown): void {
	if (options === undefined) return;
	if (typeof options !== "object" || options === null) {
		throw new Error("getPeerInstances() options must be an object");
	}
	if (Object.hasOwn(options, "anyConsumer")) {
		throw new Error(
			'getPeerInstances() option "anyConsumer" was renamed. Use { allTags: true } to include other component tags.',
		);
	}
	const { allTags } = options as GetPeerInstancesOptions;
	if (allTags !== undefined && typeof allTags !== "boolean") {
		throw new Error("getPeerInstances() allTags must be a boolean");
	}
}
