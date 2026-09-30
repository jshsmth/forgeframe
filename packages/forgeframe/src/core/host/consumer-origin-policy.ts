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
 * Prefers browser-verified evidence over the legacy payload's claimed origin.
 * Without verified evidence, an allowlist requires rejection; otherwise the claim
 * is retained with `consumerDomainVerified` set to `false`.
 * @internal
 */
export function selectConsumerSecurityContext(
	options: {
		claimedConsumerDomain: string;
		allowedConsumerDomains?: DomainMatcher;
		tag: string;
	},
	verifiedConsumerDomain: string | null,
): HostSecurityContext {
	if (verifiedConsumerDomain) {
		if (options.allowedConsumerDomains) {
			assertAllowedConsumerDomain(
				options.allowedConsumerDomains,
				verifiedConsumerDomain,
				options.tag,
			);
		}

		return {
			consumerDomain: verifiedConsumerDomain,
			consumerDomainVerified: true,
		};
	}

	if (options.allowedConsumerDomains) {
		throw new Error(
			`${CONSUMER_ORIGIN_VERIFICATION_ERROR} for component "${options.tag}"`,
		);
	}

	return {
		consumerDomain: options.claimedConsumerDomain,
		consumerDomainVerified: false,
	};
}

/**
 * Checks an exact HTTP(S) origin and optional allowlist for messaging bootstrap.
 * A valid origin string does not establish peer identity: the returned context
 * remains unverified until the bootstrap exchange verifies the source window.
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
	if (allowedConsumerDomains) {
		assertAllowedConsumerDomain(allowedConsumerDomains, consumerDomain, tag);
	}
	return { consumerDomain, consumerDomainVerified: false };
}

/**
 * Adopts supplied verified evidence, or preserves the current context if unavailable.
 * This marks observed evidence as verified but does not enforce the allowlist;
 * the caller must validate the returned context before accepting protected work.
 * @internal
 */
export function selectObservedConsumerContext(
	verifiedOrigin: string | null,
	current: HostSecurityContext,
): HostSecurityContext {
	return verifiedOrigin
		? { consumerDomain: verifiedOrigin, consumerDomainVerified: true }
		: {
				consumerDomain: current.consumerDomain,
				consumerDomainVerified: current.consumerDomainVerified,
			};
}

/** Rejects claimed-only identities before applying the configured allowlist. @internal */
export function assertVerifiedConsumerContext(
	context: HostSecurityContext,
	allowed: DomainMatcher,
	tag: string,
): void {
	if (!context.consumerDomainVerified)
		throw new Error(
			`${CONSUMER_ORIGIN_VERIFICATION_ERROR} for component "${tag}"`,
		);
	assertAllowedConsumerDomain(allowed, context.consumerDomain, tag);
}
