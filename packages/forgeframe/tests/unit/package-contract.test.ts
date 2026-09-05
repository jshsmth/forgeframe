/**
 * Package contract checks for the public npm artifact shape.
 *
 * These tests keep README/package/build configuration aligned with the v1
 * decision to ship one ESM entrypoint and no public UMD build.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type RootPackageJson = {
  scripts: Record<string, string>;
};

type ForgeFramePackageJson = {
  version: string;
  scripts: Record<string, string>;
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
    const typecheck = rootPackageJson.scripts.typecheck;

    const packageJson = readJson<ForgeFramePackageJson>(resolve(packageRoot, 'package.json'));
    expect(rootPackageJson.scripts.release).toBe('npm publish -w forgeframe');
    expect(packageJson.scripts.prepublishOnly).toBe('npm run release:check --prefix ../..');
    expect(typecheck).toContain('npm run typecheck -w forgeframe');
    expect(typecheck).toContain('npm run typecheck -w @forgeframe/playground');
    expect(releaseCheck).toContain('npm run lint');
    expect(releaseCheck).toContain('npm run typecheck');
    expect(releaseCheck).toContain('npm run test:coverage');
    expect(releaseCheck).toContain('npm run build');
    expect(releaseCheck).toContain('npm run build:playground');
    expect(releaseCheck).toContain('npm audit');
    expect(releaseCheck).not.toContain('npm audit --omit=dev');
    expect(releaseCheck).toContain('npm pack --dry-run -w forgeframe');
  });

  it.each([
    { refType: 'tag', matching: true, succeeds: true },
    { refType: 'tag', matching: false, succeeds: false },
    { refType: 'branch', matching: true, succeeds: false },
  ])('should validate release refs: $refType, matching version $matching', ({ refType, matching, succeeds }) => {
    const { version } = readJson<ForgeFramePackageJson>(resolve(packageRoot, 'package.json'));
    const result = spawnSync(process.execPath, [resolve(packageRoot, 'scripts/check-release-tag.mjs')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_REF_TYPE: refType,
        GITHUB_REF_NAME: matching ? `v${version}` : `v${version}-wrong`,
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(succeeds ? 0 : 1);
    if (!succeeds) {
      expect(result.stderr).toContain(`Release must run from tag v${version}`);
    }
  });
});
