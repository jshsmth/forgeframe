/**
 * @packageDocumentation
 * Host-side consumer window and origin verification helpers.
 *
 * @remarks
 * This internal module resolves the consumer window, derives browser-verifiable
 * origins, and applies allowlist checks so host bootstrap and reconfiguration
 * can share one security policy.
 */

import type { DomainMatcher } from '../../types/utility';
import {
  getConsumer,
  getOpener,
  isIframe,
  isPopup,
  matchDomain,
} from '../../window/helpers';
import type { HostSecurityContext } from './types';

export const CONSUMER_WINDOW_RESOLUTION_ERROR = 'Could not resolve consumer window';
export const CONSUMER_ORIGIN_VERIFICATION_ERROR = 'Could not verify consumer origin';

function assertAllowedConsumerDomain(
  allowedConsumerDomains: DomainMatcher,
  consumerDomain: string,
  tag: string
): void {
  if (!consumerDomain) {
    throw new Error(
      `${CONSUMER_ORIGIN_VERIFICATION_ERROR} for component "${tag}"`
    );
  }

  if (!matchDomain(allowedConsumerDomains, consumerDomain)) {
    throw new Error(
      `Consumer domain "${consumerDomain}" is not allowed for component "${tag}"`
    );
  }
}

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

export function getReferrerOrigin(
  hostDocument: Document = document,
  hostWindow: Window = window
): string | null {
  if (!hostDocument.referrer) {
    return null;
  }

  try {
    return new URL(hostDocument.referrer, hostWindow.location.href).origin;
  } catch {
    return null;
  }
}

export function getAccessibleConsumerOrigin(consumerWindow: Window): string | null {
  try {
    return consumerWindow.location.origin;
  } catch {
    return null;
  }
}

export function getVerifiedConsumerOrigin(
  consumerWindow: Window,
  hostDocument: Document = document,
  hostWindow: Window = window
): string | null {
  return getReferrerOrigin(hostDocument, hostWindow) ?? getAccessibleConsumerOrigin(consumerWindow);
}

export function resolveConsumerSecurityContext(options: {
  consumerWindow: Window;
  claimedConsumerDomain: string;
  allowedConsumerDomains?: DomainMatcher;
  tag: string;
}): HostSecurityContext {
  const verifiedConsumerDomain = getVerifiedConsumerOrigin(options.consumerWindow);

  if (verifiedConsumerDomain) {
    if (options.allowedConsumerDomains) {
      assertAllowedConsumerDomain(
        options.allowedConsumerDomains,
        verifiedConsumerDomain,
        options.tag
      );
    }

    return {
      consumerDomain: verifiedConsumerDomain,
      consumerDomainVerified: true,
    };
  }

  if (options.allowedConsumerDomains) {
    throw new Error(
      `${CONSUMER_ORIGIN_VERIFICATION_ERROR} for component "${options.tag}"`
    );
  }

  return {
    consumerDomain: options.claimedConsumerDomain,
    consumerDomainVerified: false,
  };
}

export function reassertAllowedConsumerDomain(options: {
  consumerWindow: Window;
  consumerDomain: string;
  consumerDomainVerified: boolean;
  allowedConsumerDomains: DomainMatcher;
  tag: string;
  onConsumerDomainChange?: (previousDomain: string, nextDomain: string) => void;
}): HostSecurityContext {
  const verifiedConsumerDomain = getVerifiedConsumerOrigin(options.consumerWindow);
  let consumerDomain = options.consumerDomain;
  let consumerDomainVerified = options.consumerDomainVerified;

  if (verifiedConsumerDomain) {
    if (verifiedConsumerDomain !== consumerDomain) {
      options.onConsumerDomainChange?.(consumerDomain, verifiedConsumerDomain);
    }

    consumerDomain = verifiedConsumerDomain;
    consumerDomainVerified = true;
  }

  if (!consumerDomainVerified) {
    throw new Error(
      `${CONSUMER_ORIGIN_VERIFICATION_ERROR} for component "${options.tag}"`
    );
  }

  assertAllowedConsumerDomain(
    options.allowedConsumerDomains,
    consumerDomain,
    options.tag
  );

  return {
    consumerDomain,
    consumerDomainVerified,
  };
}
