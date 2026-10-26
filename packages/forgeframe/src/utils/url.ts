import type { OriginMatcher } from "../types/utility";
import { matchOrigin } from "../window/helpers";

const ALLOWED_HOST_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Resolves and validates a component host URL.
 *
 * @internal
 */
export function resolveComponentHostUrl(
	value: string,
	baseUrl: string,
	allowedOrigins?: OriginMatcher,
): URL {
	let resolved: URL;

	try {
		resolved = new URL(value, baseUrl);
	} catch {
		throw new Error(
			`Invalid component URL "${value}". Must be a valid absolute or relative URL.`,
		);
	}

	if (!ALLOWED_HOST_PROTOCOLS.has(resolved.protocol)) {
		throw new Error(
			`Invalid component URL protocol "${resolved.protocol}". Only http: and https: are supported.`,
		);
	}

	if (allowedOrigins && !matchOrigin(allowedOrigins, resolved.origin)) {
		throw new Error(
			`Component URL origin "${resolved.origin}" is not allowed by the component's hostOrigins.`,
		);
	}

	return resolved;
}

/** Appends serialized parameters without changing existing query bytes or fragments. @internal */
export function appendComponentQuery(
	baseUrl: string,
	queryString: string,
): string {
	if (!queryString) return baseUrl;
	const fragmentIndex = baseUrl.indexOf("#");
	const navigationUrl =
		fragmentIndex === -1 ? baseUrl : baseUrl.slice(0, fragmentIndex);
	const fragment = fragmentIndex === -1 ? "" : baseUrl.slice(fragmentIndex);
	return `${navigationUrl}${navigationUrl.includes("?") ? "&" : "?"}${queryString}${fragment}`;
}
