import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const packageJson = JSON.parse(
	readFileSync(resolve(__dirname, "package.json"), "utf8"),
) as { version: string };

export default defineConfig({
	define: {
		__FORGEFRAME_VERSION__: JSON.stringify(packageJson.version),
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
		},
	},
	test: {
		environment: "jsdom",
		include: ["tests/**/*.test.ts"],
		restoreMocks: true,
		clearMocks: true,
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
			thresholds: {
				statements: 90,
				branches: 85,
				functions: 95,
				lines: 90,
			},
		},
	},
});
