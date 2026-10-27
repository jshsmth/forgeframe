/**
 * Unit tests for wildcard origin helpers in `@/utils/origin-pattern`.
 *
 * Covers the leading-label wildcard rule, matcher validation, compilation
 * caching/eviction and stateless `RegExp` evaluation for global and sticky
 * patterns.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadOriginPatternModule() {
	vi.resetModules();
	return import("@/utils/origin-pattern");
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("compileWildcardOriginPattern", () => {
	it("should return null for exact domain strings without wildcards", async () => {
		const { compileWildcardOriginPattern } = await loadOriginPatternModule();

		expect(compileWildcardOriginPattern("https://example.com")).toBeNull();
	});

	it("matches one or more leading labels, with the scheme and port fixed", async () => {
		const { compileWildcardOriginPattern, testOriginRegExpStateless } =
			await loadOriginPatternModule();
		const compiled = compileWildcardOriginPattern("https://*.example.com");
		const cached = compileWildcardOriginPattern("https://*.example.com");
		expect(compiled).toBeInstanceOf(RegExp);
		expect(cached).toBe(compiled);
		if (!compiled) return;

		const matches = (origin: string) =>
			testOriginRegExpStateless(compiled, origin);
		expect(matches("https://app.example.com")).toBe(true);
		expect(matches("https://a.b.example.com")).toBe(true);
		expect(matches("https://example.com")).toBe(false);
		expect(matches("https://evilexample.com")).toBe(false);
		expect(matches("https://app.example.com.evil.net")).toBe(false);
		expect(matches("http://app.example.com")).toBe(false);
		expect(matches("https://app.example.com:8443")).toBe(false);

		const withPort = compileWildcardOriginPattern("https://*.example.com:8443");
		expect(
			withPort &&
				testOriginRegExpStateless(withPort, "https://a.example.com:8443"),
		).toBe(true);
		expect(
			withPort && testOriginRegExpStateless(withPort, "https://a.example.com"),
		).toBe(false);
	});

	it("compiles '*' to any origin and a misplaced wildcard to no origin", async () => {
		const { compileWildcardOriginPattern, testOriginRegExpStateless } =
			await loadOriginPatternModule();
		const any = compileWildcardOriginPattern("*");
		expect(any && testOriginRegExpStateless(any, "https://x.test")).toBe(true);
		for (const pattern of [
			"https://*example.com",
			"https://app.example.com*",
			"https://api.*.example.com",
			"*.example.com",
		]) {
			const compiled = compileWildcardOriginPattern(pattern);
			expect(compiled).toBeInstanceOf(RegExp);
			for (const origin of [
				"https://evilexample.com",
				"https://app.example.com.evil.net",
				"https://api.us.example.com",
				"http://app.example.com",
			])
				expect(compiled && testOriginRegExpStateless(compiled, origin)).toBe(
					false,
				);
		}
	});

	it("should evict the oldest wildcard pattern once the cache limit is exceeded", async () => {
		const { compileWildcardOriginPattern } = await loadOriginPatternModule();

		const oldestPattern = "https://*.host-0.example.com";
		const oldestCompiled = compileWildcardOriginPattern(oldestPattern);
		const newestPattern = "https://*.host-200.example.com";

		let newestCompiled: RegExp | null = null;
		for (let index = 1; index <= 200; index += 1) {
			newestCompiled = compileWildcardOriginPattern(
				`https://*.host-${index}.example.com`,
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

describe("assertOriginMatcher", () => {
	it.each([
		["https://*example.com", '"*" may only stand for leading host labels'],
		["https://app.example.com*", '"*" may only stand for leading host labels'],
		["https://api.*.example.com", '"*" may only stand for leading host labels'],
		["*.example.com", 'write the scheme too, such as "https://*.example.com"'],
		["example.com", 'write the scheme too, such as "https://example.com"'],
		[
			"https://*.example.com/",
			'an origin has no path, query or fragment; write only the scheme, host and port, such as "https://*.example.com"',
		],
		["https://app.example.com/login", 'such as "https://app.example.com"'],
		[
			"https://Shop.example.com",
			'browsers report it as "https://shop.example.com"',
		],
		["https://example.com:443", 'browsers report it as "https://example.com"'],
		["https://user@example.com", 'browsers report it as "https://example.com"'],
		["https://exa mple.com", "is not a valid origin"],
		[
			"https://*.example.com:443",
			'browsers report it as "https://*.example.com"',
		],
		["http://*.example.com:80", 'browsers report it as "http://*.example.com"'],
		["https://*.user@example.com", "is not a valid origin"],
		["https://Example.com:443/x", 'such as "https://example.com"'],
		["file://", "is not a valid origin"],
		["file:///tmp", "is not a valid origin"],
		["https://*.ex\\ample.com", "is not a valid origin"],
		["https://ex\\ample.com", "is not a valid origin"],
		[
			"https://*.bücher.example",
			'browsers report it as "https://*.xn--bcher-kva.example"',
		],
		["https://*.exa mple.com", "is not a valid origin"],
	])("rejects %s", async (pattern, message) => {
		const { assertOriginMatcher } = await loadOriginPatternModule();
		expect(() => assertOriginMatcher([pattern], "Matcher")).toThrow(message);
	});

	it.each([
		"*",
		"https://*.example.com",
		"https://*.example.com:8443",
		"https://a.test",
		"https://*.Example.com",
		"HTTPS://*.example.com",
		"capacitor://*.localhost",
		"http://localhost:5173",
		"https://[::1]:8443",
		"capacitor://localhost",
		"chrome-extension://abcdefghijklmnop",
	])("accepts %s", async (pattern) => {
		const { assertOriginMatcher } = await loadOriginPatternModule();
		expect(() => assertOriginMatcher(pattern, "Matcher")).not.toThrow();
	});
});

describe("testOriginRegExpStateless", () => {
	it("should test exact regular expressions directly", async () => {
		const { testOriginRegExpStateless } = await loadOriginPatternModule();

		const pattern = /^https:\/\/trusted\.example\.com$/;

		expect(
			testOriginRegExpStateless(pattern, "https://trusted.example.com"),
		).toBe(true);
		expect(testOriginRegExpStateless(pattern, "https://api.example.com")).toBe(
			false,
		);
	});

	it("should strip the global flag before testing without mutating lastIndex", async () => {
		const { testOriginRegExpStateless } = await loadOriginPatternModule();

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
		const { testOriginRegExpStateless } = await loadOriginPatternModule();

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
