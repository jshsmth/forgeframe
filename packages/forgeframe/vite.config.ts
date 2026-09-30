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
		lib: {
			entry: resolve(import.meta.dirname, "src/index.ts"),
			formats: ["es"],
			fileName: "forgeframe",
		},
		rolldownOptions: {
			external: ["react", "react-dom"],
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
