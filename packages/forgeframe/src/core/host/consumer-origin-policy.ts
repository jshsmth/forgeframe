import type { DomainMatcher } from "../../types/utility";
import { matchDomain } from "../../window/helpers";

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
 * Checks an exact HTTP(S) origin and the allowlist for messaging bootstrap.
 * A valid origin string does not establish peer identity: the returned target
 * stays unverified until the bootstrap exchange verifies the source window.
 * @returns The origin, unchanged, to use as the messaging target.
 * @internal
 */
export function validateMessagingConsumerContext(
	consumerDomain: string,
	allowedConsumerDomains: DomainMatcher,
	tag: string,
): string {
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
	assertAllowedConsumerDomain(allowedConsumerDomains, consumerDomain, tag);
	return consumerDomain;
}
