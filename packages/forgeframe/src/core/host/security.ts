/**
 * @packageDocumentation
 * Host-side consumer window and origin verification helpers.
 *
 * @remarks
 * This internal module resolves the consumer window, derives browser-verifiable
 * origins, and applies allowlist checks so host bootstrap and reconfiguration
 * can share one security policy.
 */

import type { DomainMatcher } from "../../types/utility";
import {
	getConsumer,
	getOpener,
	isIframe,
	isPopup,
} from "../../window/helpers";
import type { HostSecurityContext } from "./types";

export const CONSUMER_WINDOW_RESOLUTION_ERROR =
	"Could not resolve consumer window";
export { CONSUMER_ORIGIN_VERIFICATION_ERROR } from "./consumer-origin-policy";

import {
	assertVerifiedConsumerContext,
	selectConsumerSecurityContext,
	selectObservedConsumerContext,
	validateMessagingConsumerContext,
} from "./consumer-origin-policy";

export function resolveConsumerWindow(hostWindow: Window = window): Window {
	if (isIframe(hostWindow)) {
		const consumerWindow = getConsumer(hostWindow);
		if (consumerWindow) {
			return consumerWindow;
		}
	}

	if (isPopup(hostWindow)) {
		const openerWindow = getOpener(hostWindow);
		if (openerWindow) {
			return openerWindow;
		}
	}

	throw new Error(CONSUMER_WINDOW_RESOLUTION_ERROR);
}

/**
 * Reads the consumer origin only when the browser exposes it directly.
 *
 * @remarks
 * `document.referrer` is not consumer evidence: it names the page that started
 * the host navigation, which need not be the parent or opener window.
 */
export function getAccessibleConsumerOrigin(
	consumerWindow: Window,
): string | null {
	try {
		return consumerWindow.location.origin;
	} catch {
		return null;
	}
}

export function resolveConsumerSecurityContext(options: {
	consumerWindow: Window;
	claimedConsumerDomain: string;
	allowedConsumerDomains?: DomainMatcher;
	tag: string;
}): HostSecurityContext {
	return selectConsumerSecurityContext(
		options,
		getAccessibleConsumerOrigin(options.consumerWindow),
	);
}

/** Selects an exact messaging target; the bootstrap response verifies it. */
export function resolveMessagingConsumerContext(options: {
	consumerWindow: Window;
	claimedConsumerDomain: string;
	allowedConsumerDomains?: DomainMatcher;
	tag: string;
}): HostSecurityContext {
	const consumerDomain =
		getAccessibleConsumerOrigin(options.consumerWindow) ??
		options.claimedConsumerDomain;
	return validateMessagingConsumerContext(
		consumerDomain,
		options.allowedConsumerDomains,
		options.tag,
	);
}

/**
 * Re-observes the consumer origin and enforces verified identity plus the allowlist.
 * An origin-change callback runs before the allowlist check, allowing obsolete
 * transport trust to be removed even when the newly observed origin is rejected.
 */
export function reassertAllowedConsumerDomain(options: {
	consumerWindow: Window;
	consumerDomain: string;
	consumerDomainVerified: boolean;
	allowedConsumerDomains: DomainMatcher;
	tag: string;
	onConsumerDomainChange?: (previousDomain: string, nextDomain: string) => void;
}): HostSecurityContext {
	const context = selectObservedConsumerContext(
		getAccessibleConsumerOrigin(options.consumerWindow),
		options,
	);
	if (context.consumerDomain !== options.consumerDomain) {
		options.onConsumerDomainChange?.(
			options.consumerDomain,
			context.consumerDomain,
		);
	}
	assertVerifiedConsumerContext(
		context,
		options.allowedConsumerDomains,
		options.tag,
	);
	return context;
}
