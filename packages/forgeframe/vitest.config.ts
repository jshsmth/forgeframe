import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const packageJson = JSON.parse(
	readFileSync(resolve(import.meta.dirname, "package.json"), "utf8"),
) as { version: string };

export default defineConfig({
	define: {
		__FORGEFRAME_VERSION__: JSON.stringify(packageJson.version),
	},
	resolve: {
		// Exact matches, so the bare `forgeframe` alias cannot capture `forgeframe/react`.
		alias: [
			{ find: /^@\//, replacement: `${resolve(import.meta.dirname, "src")}/` },
			{
				find: /^forgeframe$/,
				replacement: resolve(import.meta.dirname, "src/index.ts"),
			},
			{
				find: /^forgeframe\/react$/,
				replacement: resolve(import.meta.dirname, "src/react.ts"),
			},
		],
	},
	test: {
		environment: "jsdom",
		include: ["tests/**/*.test.ts"],
		restoreMocks: true,
		clearMocks: true,
		// Stubbed globals and env vars never leak into the next test.
		unstubGlobals: true,
		unstubEnvs: true,
		coverage: {
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.d.ts",
				"src/**/index.ts",
				"src/types.ts",
				"src/types/**",
				"src/**/types.ts",
				"src/props/prop.ts",
			],
			// Just under the current totals, so a real drop fails the run.
			thresholds: {
				statements: 99,
				branches: 96.5,
				functions: 99,
				lines: 99,
				// Security-critical checks stay fully covered.
				"src/core/host/consumer-origin-policy.ts": {
					statements: 100,
					branches: 100,
					functions: 100,
					lines: 100,
				},
				"src/render/iframe-configuration.ts": {
					statements: 100,
					branches: 100,
					functions: 100,
					lines: 100,
				},
				"src/window/name-payload.ts": {
					statements: 100,
					branches: 100,
					functions: 100,
					lines: 100,
				},
				"src/{communication/messenger,core/host/security,utils/origin-pattern}.ts":
					{
						statements: 100,
						functions: 100,
						lines: 100,
					},
			},
		},
	},
});
