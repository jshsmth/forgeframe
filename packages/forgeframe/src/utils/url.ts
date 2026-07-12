import type { DomainMatcher } from '../types/utility';
import { matchDomain } from '../window/helpers';

const ALLOWED_HOST_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Resolves and validates a component host URL.
 *
 * @internal
 */
export function resolveComponentHostUrl(
  value: string,
  baseUrl: string,
  allowedDomains?: DomainMatcher
): URL {
  let resolved: URL;

  try {
    resolved = new URL(value, baseUrl);
  } catch {
    throw new Error(
      `Invalid component URL "${value}". Must be a valid absolute or relative URL.`
    );
  }

  if (!ALLOWED_HOST_PROTOCOLS.has(resolved.protocol)) {
    throw new Error(
      `Invalid component URL protocol "${resolved.protocol}". Only http: and https: are supported.`
    );
  }

  if (allowedDomains && !matchDomain(allowedDomains, resolved.origin)) {
    throw new Error(
      `Component URL origin "${resolved.origin}" is not allowed by the configured domain policy.`
    );
  }

  return resolved;
}
