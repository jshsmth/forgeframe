/**
 * @packageDocumentation
 * Internal domain-pattern helpers shared by ForgeFrame trust and origin checks.
 *
 * @remarks
 * Centralizes wildcard compilation and stateless `RegExp` evaluation so
 * window helpers and the messenger preserve identical domain-matching behavior.
 */

const wildcardPatternCache = new Map<string, RegExp>();
const WILDCARD_CACHE_LIMIT = 200;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  if (!pattern.includes('*')) {
    return null;
  }

  const cachedPattern = wildcardPatternCache.get(pattern);
  if (cachedPattern) {
    return cachedPattern;
  }

  const escaped = pattern
    .split('*')
    .map((segment) => escapeRegExp(segment))
    .join('.*');

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
export function testDomainRegExpStateless(pattern: RegExp, value: string): boolean {
  if (pattern.global || pattern.sticky) {
    const stateless = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
    return stateless.test(value);
  }

  return pattern.test(value);
}
