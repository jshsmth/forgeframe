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
 * anywhere but the leading host labels, as in `https://*.example.com`.
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
		throw new ForgeFrameError(
			"VALIDATION",
			`${option} lists "${withPath}", but an origin has no path, query or fragment; write only the scheme, host and port, such as "${withPath.replace(/^([^:]+:\/\/[^/?#]*).*$/, "$1")}"`,
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

/** Whether a string pattern uses `*` other than as `scheme://*.rest`. */
function isMisplacedWildcard(entry: unknown): entry is string {
	return (
		typeof entry === "string" &&
		entry !== "*" &&
		entry.includes("*") &&
		!LEADING_LABEL_WILDCARD.test(entry)
	);
}
