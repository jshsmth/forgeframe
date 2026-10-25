import type { DomainMatcher } from "../../types/utility";
import { matchDomain } from "../../window/helpers";
import type { HostSecurityContext } from "./types";

export const CONSUMER_ORIGIN_VERIFICATION_ERROR =
	"Could not verify consumer origin";

/**
 * Checks a supplied origin against the configured allowlist, without observing a window.
 * @throws If the origin is empty or does not match the allowlist.
 * @internal
 */
export function assertAllowedConsumerDomain(
	allowedConsumerDomains: DomainMatcher,
	consumerDomain: string,
	tag: string,
): void {
	if (!consumerDomain) {
		throw new Error(
			`${CONSUMER_ORIGIN_VERIFICATION_ERROR} for component "${tag}"`,
		);
	}

	if (!matchDomain(allowedConsumerDomains, consumerDomain)) {
		throw new Error(
			`Consumer domain "${consumerDomain}" is not allowed for component "${tag}"`,
		);
	}
}

/**
 * Checks an exact HTTP(S) origin and optional allowlist for messaging bootstrap.
 * A valid origin string does not establish peer identity: the returned target
 * stays unverified until the bootstrap exchange verifies the source window.
 * @internal
 */
export function validateMessagingConsumerContext(
	consumerDomain: string,
	allowedConsumerDomains: DomainMatcher | undefined,
	tag: string,
): HostSecurityContext {
	let origin: URL;
	try {
		origin = new URL(consumerDomain);
	} catch {
		throw new Error(CONSUMER_ORIGIN_VERIFICATION_ERROR);
	}
	if (
		!["http:", "https:"].includes(origin.protocol) ||
		origin.origin !== consumerDomain
	) {
		throw new Error(CONSUMER_ORIGIN_VERIFICATION_ERROR);
	}
	if (allowedConsumerDomains !== undefined) {
		assertAllowedConsumerDomain(allowedConsumerDomains, consumerDomain, tag);
	}
	return { consumerDomain };
}
