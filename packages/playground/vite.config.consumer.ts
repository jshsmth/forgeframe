import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";
import { TEST_SCENARIO_IDS } from "./consumer/test-lab/scenario-ids.ts";

const forgeframePackageJson = JSON.parse(
	readFileSync(
		resolve(import.meta.dirname, "../forgeframe/package.json"),
		"utf8",
	),
) as { version: string };

const shouldOpenBrowser = process.env.FORGEFRAME_PLAYGROUND_OPEN !== "0";
const consumerOutDir = resolve(import.meta.dirname, "dist/consumer");

function staticConsumerRoutes(): Plugin {
	let outDir = consumerOutDir;
	let write = true;
	return {
		name: "forgeframe-static-consumer-routes",
		apply: "build",
		configResolved(config) {
			outDir = resolve(config.root, config.build.outDir);
			write = config.build.write;
		},
		closeBundle() {
			if (!write) return;
			const source = resolve(outDir, "index.html");
			const routeDirectories = [
				resolve(outDir, "company"),
				resolve(outDir, "tests"),
				...TEST_SCENARIO_IDS.map((scenarioId) =>
					resolve(outDir, "tests", scenarioId),
				),
			];

			for (const routeDirectory of routeDirectories) {
				mkdirSync(routeDirectory, { recursive: true });
				copyFileSync(source, resolve(routeDirectory, "index.html"));
			}
		},
	};
}

export default defineConfig(({ command }) => {
	const shouldUseMkcert =
		command === "serve" && process.env.FORGEFRAME_SKIP_MKCERT !== "1";

	return {
		plugins: [...(shouldUseMkcert ? [mkcert()] : []), staticConsumerRoutes()],
		root: resolve(import.meta.dirname, "consumer"),
		cacheDir: resolve(import.meta.dirname, "node_modules/.vite-consumer"),
		define: {
			__FORGEFRAME_VERSION__: JSON.stringify(forgeframePackageJson.version),
		},
		resolve: {
			alias: {
				forgeframe: resolve(import.meta.dirname, "../forgeframe/src/index.ts"),
			},
		},
		server: {
			port: 5173,
			strictPort: true,
			open: shouldOpenBrowser,
		},
		build: {
			outDir: consumerOutDir,
			emptyOutDir: true,
			rolldownOptions: {
				input: {
					main: resolve(import.meta.dirname, "consumer/index.html"),
					redirect: resolve(import.meta.dirname, "consumer/redirect.html"),
				},
			},
		},
	};
});
