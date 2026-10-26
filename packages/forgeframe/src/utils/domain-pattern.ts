/**
 * @packageDocumentation
 * Internal domain-pattern helpers shared by ForgeFrame trust and origin checks.
 *
 * @remarks
 * Centralizes wildcard compilation and stateless `RegExp` evaluation so
 * window helpers and the messenger preserve identical domain-matching behavior.
 */

import type { OriginMatcher } from "../types/utility";

const wildcardPatternCache = new Map<string, RegExp>();
const WILDCARD_CACHE_LIMIT = 200;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compiles a wildcard domain pattern into an anchored `RegExp`.
 *
 * @param pattern - Domain pattern that may contain `*` wildcards.
 * @returns Compiled `RegExp`, or `null` when the pattern has no wildcards.
 *
 * @remarks
 * Compiled patterns are cached with a bounded, oldest-entry eviction policy to
 * preserve the prior helper-level wildcard cache behavior.
 *
 * @internal
 */
export function compileWildcardDomainPattern(pattern: string): RegExp | null {
	if (!pattern.includes("*")) {
		return null;
	}

	const cachedPattern = wildcardPatternCache.get(pattern);
	if (cachedPattern) {
		return cachedPattern;
	}

	const escaped = pattern
		.split("*")
		.map((segment) => escapeRegExp(segment))
		.join(".*");

	const compiledPattern = new RegExp(`^${escaped}$`);
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
 * Tests a domain `RegExp` without mutating `lastIndex` on global or sticky patterns.
 *
 * @param pattern - Pattern to test.
 * @param value - Domain string to match.
 * @returns `true` when the pattern matches the provided value.
 *
 * @remarks
 * Global and sticky flags are stripped from a cloned `RegExp` before testing so
 * repeated trust checks behave consistently regardless of prior matches.
 *
 * @internal
 */
export function testDomainRegExpStateless(
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
 * them, is an empty array where `emptyArray` is `"rejected"`, or lists a
 * string without a scheme, such as `example.com`.
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
		throw new Error(
			`${option} must list at least one origin; an empty array matches none`,
		);
	}
	const entries = Array.isArray(value) ? value : [value];
	if (!entries.every(isPattern)) {
		throw new Error(
			`${option} must be a non-empty origin string, a RegExp, or an array of them`,
		);
	}
	const bareHost = entries.find(isBareHostPattern);
	if (bareHost !== undefined) {
		throw new Error(
			`${option} lists "${bareHost}", which is not an origin and can never match one; write the scheme too, such as "https://${bareHost}"`,
		);
	}
}

/**
 * Whether a string pattern lacks the scheme every origin starts with, such as
 * `example.com` or `"true"`. `'*'` and patterns that start with a wildcard can
 * still match an origin.
 */
function isBareHostPattern(entry: unknown): entry is string {
	return (
		typeof entry === "string" &&
		!entry.startsWith("*") &&
		!entry.includes("://")
	);
}
