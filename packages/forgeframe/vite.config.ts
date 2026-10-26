import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const packageJson = JSON.parse(
	readFileSync(resolve(import.meta.dirname, "package.json"), "utf8"),
) as { version: string };

export default defineConfig({
	define: {
		__FORGEFRAME_VERSION__: JSON.stringify(packageJson.version),
	},
	build: {
		// One build for both entries, so modules they share are emitted once and
		// exist once per page.
		lib: {
			entry: {
				forgeframe: resolve(import.meta.dirname, "src/index.ts"),
				react: resolve(import.meta.dirname, "src/react.ts"),
			},
			formats: ["es"],
			fileName: (_format, entryName) => `${entryName}.js`,
		},
		rolldownOptions: {
			external: ["react", "react-dom"],
			output: { chunkFileNames: "shared-[hash].js" },
		},
		sourcemap: false,
		minify: "oxc",
		target: "es2022",
	},
	resolve: {
		alias: {
			"@": resolve(import.meta.dirname, "src"),
		},
	},
});
