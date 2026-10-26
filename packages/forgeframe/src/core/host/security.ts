/**
 * @packageDocumentation
 * Host-side consumer window and origin verification helpers.
 *
 * @remarks
 * This internal module resolves the consumer window and reads the consumer
 * origin when the browser exposes it, then passes that observation to the
 * pure policy in `consumer-origin-policy.ts` to select the messaging target.
 */

import type { OriginMatcher } from "../../types/utility";
import {
	getConsumer,
	getOpener,
	isIframe,
	isPopup,
} from "../../window/helpers";

export const CONSUMER_WINDOW_RESOLUTION_ERROR =
	"Could not resolve consumer window";
export { CONSUMER_ORIGIN_VERIFICATION_ERROR } from "./consumer-origin-policy";

import { validateMessagingConsumerContext } from "./consumer-origin-policy";

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

/**
 * Selects an exact messaging target origin and checks it against the
 * allowlist; the bootstrap response verifies it. A directly readable consumer
 * origin wins over the payload's claimed origin.
 */
export function resolveMessagingConsumerContext(options: {
	consumerWindow: Window;
	claimedConsumerDomain: string;
	consumerOrigins: OriginMatcher;
	tag: string;
}): string {
	const consumerDomain =
		getAccessibleConsumerOrigin(options.consumerWindow) ??
		options.claimedConsumerDomain;
	return validateMessagingConsumerContext(
		consumerDomain,
		options.consumerOrigins,
		options.tag,
	);
}
