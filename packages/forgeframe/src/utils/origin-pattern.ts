/**
 * @packageDocumentation
 * Internal origin-pattern helpers shared by ForgeFrame trust and origin checks.
 *
 * @remarks
 * Centralizes wildcard compilation and stateless `RegExp` evaluation so
 * window helpers and the messenger preserve identical origin-matching behavior.
 */

import { ForgeFrameError } from "../errors";
import type { OriginMatcher } from "../types/utility";

const wildcardPatternCache = new Map<string, RegExp>();
const WILDCARD_CACHE_LIMIT = 200;

/**
 * The one wildcard form: a scheme, then `*.` standing for one or more leading
 * host labels, then the rest of the host and an optional port.
 */
const LEADING_LABEL_WILDCARD = /^([a-z][a-z0-9+.-]*:\/\/)\*\.([^*/?#]+)$/i;

/** Matches nothing; a wildcard pattern in any other position compiles to it. */
const NO_ORIGIN = /(?!)/;

/** The whole-matcher `'*'`, which admits any origin. */
const ANY_ORIGIN = /^.*$/;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compiles a wildcard origin pattern into an anchored `RegExp`.
 *
 * @param pattern - Origin pattern that may contain `*` wildcards.
 * @returns Compiled `RegExp`, or `null` when the pattern has no wildcards.
 *
 * @remarks
 * `'*'` alone admits any origin. Otherwise only `scheme://*.rest` is a
 * wildcard: `*` stands for one or more DNS labels
 * in front of `rest`, so `https://*.example.com` matches
 * `https://app.example.com` but not `https://example.com`,
 * `https://evilexample.com` or `http://app.example.com`. A `*` anywhere else
 * matches no origin; `assertOriginMatcher` rejects it when options are
 * declared. Compiled patterns are cached with a bounded, oldest-entry
 * eviction policy.
 *
 * @internal
 */
export function compileWildcardOriginPattern(pattern: string): RegExp | null {
	if (!pattern.includes("*")) {
		return null;
	}

	const cachedPattern = wildcardPatternCache.get(pattern);
	if (cachedPattern) {
		return cachedPattern;
	}

	const wildcard = LEADING_LABEL_WILDCARD.exec(pattern);
	const compiledPattern =
		pattern === "*"
			? ANY_ORIGIN
			: wildcard
				? new RegExp(
						`^${escapeRegExp(wildcard[1] ?? "")}(?:[a-z0-9-]+\\.)+${escapeRegExp(wildcard[2] ?? "")}$`,
						"i",
					)
				: NO_ORIGIN;
	if (wildcardPatternCache.size >= WILDCARD_CACHE_LIMIT) {
		const oldestKey = wildcardPatternCache.keys().next().value;
		if (oldestKey) {
			wildcardPatternCache.delete(oldestKey);
		}
	}

	wildcardPatternCache.set(pattern, compiledPattern);
	return compiledPattern;
}

/**
 * Tests an origin `RegExp` without mutating `lastIndex` on global or sticky patterns.
 *
 * @param pattern - Pattern to test.
 * @param value - Origin string to match.
 * @returns `true` when the pattern matches the provided value.
 *
 * @remarks
 * Global and sticky flags are stripped from a cloned `RegExp` before testing so
 * repeated trust checks behave consistently regardless of prior matches.
 *
 * @internal
 */
export function testOriginRegExpStateless(
	pattern: RegExp,
	value: string,
): boolean {
	if (pattern.global || pattern.sticky) {
		const stateless = new RegExp(
			pattern.source,
			pattern.flags.replace(/[gy]/g, ""),
		);
		return stateless.test(value);
	}

	return pattern.test(value);
}

/**
 * Rejects matcher values that would silently disable or widen an origin policy.
 *
 * @param value - Configured matcher.
 * @param option - Option name used in the error message.
 * @param emptyArray - Whether an empty array, which matches no origin, is a
 * valid setting. Only allowlists that fail closed accept it.
 * @throws If the value is not a non-empty string, a `RegExp`, or an array of
 * them, is an empty array where `emptyArray` is `"rejected"`, lists a string
 * without a scheme, such as `example.com` or `*.example.com`, or puts `*`
 * anywhere but the leading host labels, as in `https://*.example.com`, or
 * lists an exact origin or wildcard in a form browsers never report, such
 * as `https://Shop.example.com`, `https://example.com:443` or
 * `https://*.example.com:443`.
 *
 * @internal
 */
export function assertOriginMatcher(
	value: unknown,
	option: string,
	emptyArray: "allowed" | "rejected" = "rejected",
): asserts value is OriginMatcher {
	const isPattern = (entry: unknown): boolean =>
		entry instanceof RegExp ||
		(typeof entry === "string" && entry.trim() !== "");
	if (Array.isArray(value) && value.length === 0 && emptyArray === "rejected") {
		throw new ForgeFrameError(
			"VALIDATION",
			`${option} must list at least one origin; an empty array matches none`,
		);
	}
	const entries = Array.isArray(value) ? value : [value];
	if (!entries.every(isPattern)) {
		throw new ForgeFrameError(
			"VALIDATION",
			`${option} must be a non-empty origin string, a RegExp, or an array of them`,
		);
	}
	const bareHost = entries.find(isBareHostPattern);
	if (bareHost !== undefined) {
		throw new ForgeFrameError(
			"VALIDATION",
			`${option} lists "${bareHost}", which is not an origin and can never match one; write the scheme too, such as "https://${bareHost}"`,
		);
	}
	const withPath = entries.find(hasPathOrQuery);
	if (withPath !== undefined) {
		const base = withPath.replace(/^([^:]+:\/\/[^/?#]*).*$/, "$1");
		const canonical = readCanonicalPattern(base);
		throw new ForgeFrameError(
			"VALIDATION",
			/^file:/i.test(base)
				? `${option} lists "${withPath}", which is not a valid origin and can never match one`
				: `${option} lists "${withPath}", but an origin has no path, query or fragment; write only the scheme, host and port, such as "${canonical && canonical !== "null" ? canonical : base}"`,
		);
	}
	const nonCanonical = entries.find(isNonCanonicalOrigin);
	if (nonCanonical !== undefined) {
		const origin = readCanonicalPattern(nonCanonical);
		throw new ForgeFrameError(
			"VALIDATION",
			origin === undefined || origin === "null"
				? `${option} lists "${nonCanonical}", which is not a valid origin and can never match one`
				: `${option} lists "${nonCanonical}", which can never match because browsers report it as "${origin}"; write that instead`,
		);
	}
	const misplacedWildcard = entries.find(isMisplacedWildcard);
	if (misplacedWildcard !== undefined) {
		throw new ForgeFrameError(
			"VALIDATION",
			`${option} lists "${misplacedWildcard}"; "*" may only stand for leading host labels, as in "https://*.example.com", or be the whole matcher '*'`,
		);
	}
}

/**
 * Whether a string pattern other than `'*'` lacks the scheme every origin
 * starts with, such as `example.com`, `*.example.com` or `"true"`.
 */
function isBareHostPattern(entry: unknown): entry is string {
	return typeof entry === "string" && entry !== "*" && !entry.includes("://");
}

/** Whether a string pattern with a scheme continues past the host and port. */
function hasPathOrQuery(entry: unknown): entry is string {
	return typeof entry === "string" && /^[^:]+:\/\/[^/?#]*[/?#]/.test(entry);
}

/**
 * Whether an exact origin string or a leading-label wildcard differs from the
 * form browsers report, such as `https://Shop.example.com`,
 * `https://*.example.com:443` or one with userinfo, so it can never match.
 * Wildcards match case-insensitively, so case alone does not count. A custom
 * scheme such as `capacitor://localhost` has no URL origin to compare, so it
 * is kept. Misplaced wildcards are left to `isMisplacedWildcard`.
 */
function isNonCanonicalOrigin(entry: unknown): entry is string {
	if (typeof entry !== "string" || entry === "*") return false;
	const wildcard = entry.includes("*");
	if (wildcard && !LEADING_LABEL_WILDCARD.test(entry)) return false;
	const canonical = readCanonicalPattern(entry);
	// A file: URL has an opaque origin, which no matcher admits.
	if (canonical === "null") return /^file:/i.test(entry);
	return wildcard
		? canonical?.toLowerCase() !== entry.toLowerCase()
		: canonical !== entry;
}

/**
 * The form browsers report for an exact origin or a `scheme://*.rest`
 * wildcard: `"null"` for a custom scheme, or `undefined` when it does not
 * parse. A wildcard is read through a probe label in place of `*`.
 */
function readCanonicalPattern(entry: string): string | undefined {
	// The URL parser reads a backslash as a path separator, which would
	// silently cut the host short.
	if (entry.includes("\\")) return undefined;
	const wildcard = LEADING_LABEL_WILDCARD.exec(entry);
	if (!wildcard) return readOrigin(entry);
	const scheme = wildcard[1] ?? "";
	const origin = readOrigin(`${scheme}x.${wildcard[2] ?? ""}`);
	if (origin === undefined || origin === "null") return origin;
	const probePrefix = `${scheme.toLowerCase()}x.`;
	return origin.startsWith(probePrefix)
		? `${scheme.toLowerCase()}*.${origin.slice(probePrefix.length)}`
		: undefined;
}

/**
 * The origin the URL parser reports for an origin string: `"null"` for a
 * custom scheme, or `undefined` when it does not parse.
 */
function readOrigin(entry: string): string | undefined {
	try {
		return new URL(entry).origin;
	} catch {
		return undefined;
	}
}

/** Whether a string pattern uses `*` other than as `scheme://*.rest`. */
function isMisplacedWildcard(entry: unknown): entry is string {
	return (
		typeof entry === "string" &&
		entry !== "*" &&
		entry.includes("*") &&
		!LEADING_LABEL_WILDCARD.test(entry)
	);
}
