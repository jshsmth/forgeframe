/**
 * Unit tests for wildcard domain helpers in `@/utils/domain-pattern`.
 *
 * Covers wildcard compilation caching/eviction and stateless `RegExp`
 * evaluation for global and sticky patterns.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadDomainPatternModule() {
  vi.resetModules();
  return import('@/utils/domain-pattern');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('compileWildcardDomainPattern', () => {
  it('should return null for exact domain strings without wildcards', async () => {
    const { compileWildcardDomainPattern } = await loadDomainPatternModule();

    expect(compileWildcardDomainPattern('https://example.com')).toBeNull();
  });

  it('should cache compiled wildcard patterns and escape literal metacharacters', async () => {
    const { compileWildcardDomainPattern, testDomainRegExpStateless } =
      await loadDomainPatternModule();

    const pattern = 'https://*.example.com:8443/path?foo=bar+baz';
    const compiled = compileWildcardDomainPattern(pattern);
    const cached = compileWildcardDomainPattern(pattern);

    expect(compiled).toBeInstanceOf(RegExp);
    expect(cached).toBe(compiled);

    if (!compiled) {
      return;
    }

    expect(
      testDomainRegExpStateless(
        compiled,
        'https://api.example.com:8443/path?foo=bar+baz'
      )
    ).toBe(true);
    expect(
      testDomainRegExpStateless(
        compiled,
        'https://api.example.com:8443/pathXfoo=bar+baz'
      )
    ).toBe(false);
    expect(
      testDomainRegExpStateless(
        compiled,
        'https://api.example.com:8443/path?foo=barxbaz'
      )
    ).toBe(false);
  });

  it('should evict the oldest wildcard pattern once the cache limit is exceeded', async () => {
    const { compileWildcardDomainPattern } = await loadDomainPatternModule();

    const oldestPattern = 'https://host-0.*.example.com';
    const oldestCompiled = compileWildcardDomainPattern(oldestPattern);
    const newestPattern = 'https://host-200.*.example.com';

    let newestCompiled: RegExp | null = null;
    for (let index = 1; index <= 200; index += 1) {
      newestCompiled = compileWildcardDomainPattern(
        `https://host-${index}.*.example.com`
      );
    }

    expect(oldestCompiled).toBeInstanceOf(RegExp);
    expect(newestCompiled).toBeInstanceOf(RegExp);
    expect(compileWildcardDomainPattern(newestPattern)).toBe(newestCompiled);

    const recompiledOldest = compileWildcardDomainPattern(oldestPattern);

    expect(recompiledOldest).toBeInstanceOf(RegExp);
    expect(recompiledOldest).not.toBe(oldestCompiled);
    expect(compileWildcardDomainPattern(oldestPattern)).toBe(recompiledOldest);
    expect(compileWildcardDomainPattern(newestPattern)).toBe(newestCompiled);
  });
});

describe('testDomainRegExpStateless', () => {
  it('should test exact regular expressions directly', async () => {
    const { testDomainRegExpStateless } = await loadDomainPatternModule();

    const pattern = /^https:\/\/trusted\.example\.com$/;

    expect(
      testDomainRegExpStateless(pattern, 'https://trusted.example.com')
    ).toBe(true);
    expect(testDomainRegExpStateless(pattern, 'https://api.example.com')).toBe(
      false
    );
  });

  it('should strip the global flag before testing without mutating lastIndex', async () => {
    const { testDomainRegExpStateless } = await loadDomainPatternModule();

    const pattern = /trusted\.example\.com/gi;
    pattern.lastIndex = 8;

    expect(
      testDomainRegExpStateless(pattern, 'https://TRUSTED.example.com')
    ).toBe(true);
    expect(pattern.lastIndex).toBe(8);
    expect(testDomainRegExpStateless(pattern, 'https://evil.example.com')).toBe(
      false
    );
    expect(pattern.lastIndex).toBe(8);
  });

  it('should strip the sticky flag before testing without mutating lastIndex', async () => {
    const { testDomainRegExpStateless } = await loadDomainPatternModule();

    const pattern = /trusted\.example\.com/iy;
    pattern.lastIndex = 5;

    expect(
      testDomainRegExpStateless(pattern, 'https://TRUSTED.example.com')
    ).toBe(true);
    expect(pattern.lastIndex).toBe(5);
    expect(testDomainRegExpStateless(pattern, 'https://evil.example.com')).toBe(
      false
    );
    expect(pattern.lastIndex).toBe(5);
  });
});
