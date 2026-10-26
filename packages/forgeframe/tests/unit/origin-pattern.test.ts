/**
 * Unit tests for wildcard domain helpers in `@/utils/origin-pattern`.
 *
 * Covers wildcard compilation caching/eviction and stateless `RegExp`
 * evaluation for global and sticky patterns.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadDomainPatternModule() {
	vi.resetModules();
	return import("@/utils/origin-pattern");
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("compileWildcardOriginPattern", () => {
	it("should return null for exact domain strings without wildcards", async () => {
		const { compileWildcardOriginPattern } = await loadDomainPatternModule();

		expect(compileWildcardOriginPattern("https://example.com")).toBeNull();
	});

	it("should cache compiled wildcard patterns and escape literal metacharacters", async () => {
		const { compileWildcardOriginPattern, testOriginRegExpStateless } =
			await loadDomainPatternModule();

		const pattern = "https://*.example.com:8443/path?foo=bar+baz";
		const compiled = compileWildcardOriginPattern(pattern);
		const cached = compileWildcardOriginPattern(pattern);

		expect(compiled).toBeInstanceOf(RegExp);
		expect(cached).toBe(compiled);

		if (!compiled) {
			return;
		}

		expect(
			testOriginRegExpStateless(
				compiled,
				"https://api.example.com:8443/path?foo=bar+baz",
			),
		).toBe(true);
		expect(
			testOriginRegExpStateless(
				compiled,
				"https://api.example.com:8443/pathXfoo=bar+baz",
			),
		).toBe(false);
		expect(
			testOriginRegExpStateless(
				compiled,
				"https://api.example.com:8443/path?foo=barxbaz",
			),
		).toBe(false);
	});

	it("should evict the oldest wildcard pattern once the cache limit is exceeded", async () => {
		const { compileWildcardOriginPattern } = await loadDomainPatternModule();

		const oldestPattern = "https://host-0.*.example.com";
		const oldestCompiled = compileWildcardOriginPattern(oldestPattern);
		const newestPattern = "https://host-200.*.example.com";

		let newestCompiled: RegExp | null = null;
		for (let index = 1; index <= 200; index += 1) {
			newestCompiled = compileWildcardOriginPattern(
				`https://host-${index}.*.example.com`,
			);
		}

		expect(oldestCompiled).toBeInstanceOf(RegExp);
		expect(newestCompiled).toBeInstanceOf(RegExp);
		expect(compileWildcardOriginPattern(newestPattern)).toBe(newestCompiled);

		const recompiledOldest = compileWildcardOriginPattern(oldestPattern);

		expect(recompiledOldest).toBeInstanceOf(RegExp);
		expect(recompiledOldest).not.toBe(oldestCompiled);
		expect(compileWildcardOriginPattern(oldestPattern)).toBe(recompiledOldest);
		expect(compileWildcardOriginPattern(newestPattern)).toBe(newestCompiled);
	});
});

describe("testOriginRegExpStateless", () => {
	it("should test exact regular expressions directly", async () => {
		const { testOriginRegExpStateless } = await loadDomainPatternModule();

		const pattern = /^https:\/\/trusted\.example\.com$/;

		expect(
			testOriginRegExpStateless(pattern, "https://trusted.example.com"),
		).toBe(true);
		expect(testOriginRegExpStateless(pattern, "https://api.example.com")).toBe(
			false,
		);
	});

	it("should strip the global flag before testing without mutating lastIndex", async () => {
		const { testOriginRegExpStateless } = await loadDomainPatternModule();

		const pattern = /trusted\.example\.com/gi;
		pattern.lastIndex = 8;

		expect(
			testOriginRegExpStateless(pattern, "https://TRUSTED.example.com"),
		).toBe(true);
		expect(pattern.lastIndex).toBe(8);
		expect(testOriginRegExpStateless(pattern, "https://evil.example.com")).toBe(
			false,
		);
		expect(pattern.lastIndex).toBe(8);
	});

	it("should strip the sticky flag before testing without mutating lastIndex", async () => {
		const { testOriginRegExpStateless } = await loadDomainPatternModule();

		const pattern = /trusted\.example\.com/iy;
		pattern.lastIndex = 5;

		expect(
			testOriginRegExpStateless(pattern, "https://TRUSTED.example.com"),
		).toBe(true);
		expect(pattern.lastIndex).toBe(5);
		expect(testOriginRegExpStateless(pattern, "https://evil.example.com")).toBe(
			false,
		);
		expect(pattern.lastIndex).toBe(5);
	});
});
