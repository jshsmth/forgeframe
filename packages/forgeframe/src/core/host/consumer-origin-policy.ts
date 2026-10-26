import { ForgeFrameError } from "../../errors";
import type { OriginMatcher } from "../../types/utility";
import { matchOrigin } from "../../window/helpers";

export const CONSUMER_ORIGIN_VERIFICATION_ERROR =
	"Could not verify consumer origin";

/**
 * Checks a supplied origin against the configured allowlist, without observing a window.
 * @throws If the origin is empty or does not match the allowlist.
 * @internal
 */
export function assertAllowedConsumerOrigin(
	consumerOrigins: OriginMatcher,
	consumerOrigin: string,
	tag: string,
): void {
	if (!consumerOrigin) {
		throw new ForgeFrameError(
			"ORIGIN_REJECTED",
			`${CONSUMER_ORIGIN_VERIFICATION_ERROR} for component "${tag}"`,
		);
	}

	if (!matchOrigin(consumerOrigins, consumerOrigin)) {
		throw new ForgeFrameError(
			"ORIGIN_REJECTED",
			`Consumer origin "${consumerOrigin}" is not allowed by consumerOrigins for component "${tag}"`,
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
	consumerOrigin: string,
	consumerOrigins: OriginMatcher,
	tag: string,
): string {
	let origin: URL;
	try {
		origin = new URL(consumerOrigin);
	} catch {
		throw new ForgeFrameError(
			"ORIGIN_REJECTED",
			CONSUMER_ORIGIN_VERIFICATION_ERROR,
		);
	}
	if (
		!["http:", "https:"].includes(origin.protocol) ||
		origin.origin !== consumerOrigin
	) {
		throw new ForgeFrameError(
			"ORIGIN_REJECTED",
			CONSUMER_ORIGIN_VERIFICATION_ERROR,
		);
	}
	assertAllowedConsumerOrigin(consumerOrigins, consumerOrigin, tag);
	return consumerOrigin;
}
