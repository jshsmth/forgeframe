/**
 * Package contract checks for the public npm artifact shape.
 *
 * These tests keep README/package/build configuration aligned with the
 * decision to ship ESM only, with no public UMD build: the root `forgeframe`
 * entry and the `forgeframe/react` subpath, built together.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type RootPackageJson = {
	scripts: Record<string, string>;
};

type PackageEntry = {
	types: string;
	import: string;
	require?: string;
	default?: string;
};

type ForgeFramePackageJson = {
	version: string;
	scripts: Record<string, string>;
	module: string;
	exports: Record<string, PackageEntry>;
	peerDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, { optional?: boolean }>;
	dependencies?: Record<string, string>;
};

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../../..");
const packageRoot = resolve(repoRoot, "packages/forgeframe");

function readText(path: string): string {
	return readFileSync(path, "utf8");
}

function readJson<T>(path: string): T {
	return JSON.parse(readText(path)) as T;
}

describe("package contract", () => {
	it("should expose the root and React ESM entrypoints only", () => {
		const packageJson = readJson<ForgeFramePackageJson>(
			resolve(packageRoot, "package.json"),
		);

		expect(packageJson.module).toBe("./dist/forgeframe.js");
		expect(packageJson.exports).toEqual({
			".": { types: "./dist/index.d.ts", import: "./dist/forgeframe.js" },
			"./react": { types: "./dist/react.d.ts", import: "./dist/react.js" },
		});
	});

	it("should declare React and its types as optional peers only", () => {
		const packageJson = readJson<ForgeFramePackageJson>(
			resolve(packageRoot, "package.json"),
		);

		expect(packageJson.dependencies).toBeUndefined();
		expect(packageJson.peerDependencies).toEqual({
			"@types/react": ">=16.8.0",
			react: ">=16.8.0",
		});
		expect(packageJson.peerDependenciesMeta).toEqual({
			"@types/react": { optional: true },
			react: { optional: true },
		});
	});

	it("should build both entries in one ESM library build", () => {
		const viteConfig = readText(resolve(packageRoot, "vite.config.ts"));

		expect(viteConfig).toMatch(/formats:\s*\[\s*["']es["']\s*,?\s*\]/);
		expect(viteConfig).not.toMatch(/\bumd\b/i);
		expect(viteConfig).toMatch(
			/forgeframe:\s*resolve\([^)]*"src\/index\.ts"\)/,
		);
		expect(viteConfig).toMatch(/react:\s*resolve\([^)]*"src\/react\.ts"\)/);
	});

	it("should keep README package claims aligned with ESM-only output", () => {
		const rootReadme = readText(resolve(repoRoot, "README.md"));
		const packageReadme = readText(resolve(packageRoot, "README.md"));

		for (const readme of [rootReadme, packageReadme]) {
			expect(readme).toContain("ESM build");
			expect(readme).not.toMatch(/\bUMD\b/);
		}
	});

	it("should gate release scripts on the full prepublish check", () => {
		const rootPackageJson = readJson<RootPackageJson>(
			resolve(repoRoot, "package.json"),
		);
		const releaseCheck = rootPackageJson.scripts["release:check"];
		const typecheck = rootPackageJson.scripts.typecheck;

		const packageJson = readJson<ForgeFramePackageJson>(
			resolve(packageRoot, "package.json"),
		);
		expect(rootPackageJson.scripts.release).toBe("npm publish -w forgeframe");
		expect(packageJson.scripts.prepublishOnly).toBe(
			"npm run release:check --prefix ../..",
		);
		expect(typecheck).toContain("npm run typecheck -w forgeframe");
		expect(typecheck).toContain("npm run typecheck -w @forgeframe/playground");
		expect(releaseCheck).toContain("npm run lint");
		expect(releaseCheck).toContain("npm run typecheck");
		expect(releaseCheck).toContain("npm run test:coverage");
		expect(releaseCheck).toContain("npm run build");
		expect(releaseCheck).toContain("npm run build:playground");
		expect(releaseCheck).toContain("npm audit");
		expect(releaseCheck).not.toContain("npm audit --omit=dev");
		expect(releaseCheck).toContain("npm pack --dry-run -w forgeframe");
		expect(releaseCheck).toMatch(/npm run build && npm run size/);
	});

	it.each([
		{ label: "within", shared: 1024, react: 1024, failing: [] },
		// Random bytes do not compress, so these exceed both budgets. The root
		// entry counts the shared chunk it imports.
		{
			label: "over",
			shared: 140 * 1024,
			react: 1024,
			failing: ["forgeframe.js"],
		},
		{ label: "over", shared: 1024, react: 20 * 1024, failing: ["react.js"] },
	])(
		"should check each entry's size budget, with its shared chunks, for a build $label budget",
		({ shared, react, failing }) => {
			const dir = mkdtempSync(join(tmpdir(), "forgeframe-size-"));
			try {
				const filler = (bytes: number) => randomBytes(bytes).toString("base64");
				writeFileSync(join(dir, "shared-abc.js"), filler((shared * 3) / 4));
				// Compact, as a minifier writes it.
				writeFileSync(
					join(dir, "forgeframe.js"),
					`import{a as e}from"./shared-abc.js";\n`,
				);
				writeFileSync(
					join(dir, "react.js"),
					`import "./shared-abc.js";\n${filler((react * 3) / 4)}`,
				);
				const result = spawnSync(
					process.execPath,
					[resolve(packageRoot, "scripts/check-bundle-size.mjs"), dir],
					{ encoding: "utf8" },
				);
				expect(result.error).toBeUndefined();
				expect(result.status).toBe(failing.length === 0 ? 0 : 1);
				for (const entry of failing) {
					expect(result.stderr).toContain(
						`${entry} exceeds its minified and gzip budget`,
					);
				}
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
	);

	it.each([
		{ refType: "tag", matching: true, succeeds: true },
		{ refType: "tag", matching: false, succeeds: false },
		{ refType: "branch", matching: true, succeeds: false },
	])(
		"should validate release refs: $refType, matching version $matching",
		({ refType, matching, succeeds }) => {
			const { version } = readJson<ForgeFramePackageJson>(
				resolve(packageRoot, "package.json"),
			);
			const result = spawnSync(
				process.execPath,
				[resolve(packageRoot, "scripts/check-release-tag.mjs")],
				{
					encoding: "utf8",
					env: {
						...process.env,
						GITHUB_REF_TYPE: refType,
						GITHUB_REF_NAME: matching ? `v${version}` : `v${version}-wrong`,
					},
				},
			);
			expect(result.error).toBeUndefined();
			expect(result.status).toBe(succeeds ? 0 : 1);
			if (!succeeds) {
				expect(result.stderr).toContain(
					`Release must run from tag v${version}`,
				);
			}
		},
	);
});
