/**
 * Package contract checks for the public npm artifact shape.
 *
 * These tests keep README/package/build configuration aligned with the v1
 * decision to ship one ESM entrypoint and no public UMD build.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type RootPackageJson = {
  scripts: Record<string, string>;
};

type ForgeFramePackageJson = {
  module: string;
  exports: {
    '.': {
      types: string;
      import: string;
      require?: string;
      default?: string;
    };
  };
};

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '../../../..');
const packageRoot = resolve(repoRoot, 'packages/forgeframe');

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

function readJson<T>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

describe('package contract', () => {
  it('should expose a single ESM package entrypoint', () => {
    const packageJson = readJson<ForgeFramePackageJson>(
      resolve(packageRoot, 'package.json')
    );

    expect(packageJson.module).toBe('./dist/forgeframe.js');
    expect(packageJson.exports['.']).toEqual({
      types: './dist/index.d.ts',
      import: './dist/forgeframe.js',
    });
    expect(packageJson.exports['.'].require).toBeUndefined();
    expect(packageJson.exports['.'].default).toBeUndefined();
  });

  it('should build only the ESM library format', () => {
    const viteConfig = readText(resolve(packageRoot, 'vite.config.ts'));

    expect(viteConfig).toContain("formats: ['es']");
    expect(viteConfig).not.toMatch(/\bumd\b/i);
  });

  it('should keep README package claims aligned with ESM-only output', () => {
    const rootReadme = readText(resolve(repoRoot, 'README.md'));
    const packageReadme = readText(resolve(packageRoot, 'README.md'));

    for (const readme of [rootReadme, packageReadme]) {
      expect(readme).toContain('ESM build');
      expect(readme).not.toMatch(/\bUMD\b/);
    }
  });

  it('should gate release scripts on the full prepublish check', () => {
    const rootPackageJson = readJson<RootPackageJson>(
      resolve(repoRoot, 'package.json')
    );
    const releaseCheck = rootPackageJson.scripts['release:check'];

    expect(rootPackageJson.scripts.release).toContain('release:check');
    expect(rootPackageJson.scripts.prepublishOnly).toBe('npm run release:check');
    expect(releaseCheck).toContain('npm run lint');
    expect(releaseCheck).toContain('npm run typecheck');
    expect(releaseCheck).toContain('npm run test:run');
    expect(releaseCheck).toContain('npm run test:coverage');
    expect(releaseCheck).toContain('npm run build');
    expect(releaseCheck).toContain('npm run build:playground');
    expect(releaseCheck).toContain('npm audit --omit=dev');
    expect(releaseCheck).toContain('npm pack --dry-run -w forgeframe');
    expect(rootPackageJson.scripts).not.toHaveProperty('test:browser');
    expect(rootPackageJson.scripts.lint).not.toContain('playwright');
    expect(rootPackageJson.scripts.typecheck).not.toContain('tsconfig.browser.json');
    expect(releaseCheck).not.toContain('test:browser');
    expect(releaseCheck).not.toContain('playwright');
    expect(releaseCheck).not.toContain('/private/tmp');
  });
});
