import { fileURLToPath } from "node:url";
import { build } from "vite";

/**
 * The production library build, in memory, keyed by the path each file is
 * served at: `/library.js` (the root `forgeframe` entry), `/react.js` (the
 * `forgeframe/react` entry) and every shared chunk at its own file name, which
 * is where the entries' relative imports resolve.
 */
export async function buildLibrary(): Promise<ReadonlyMap<string, string>> {
	const result = await build({
		configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
		logLevel: "silent",
		build: { write: false },
	});
	const built = Array.isArray(result) ? result[0] : result;
	if (built === undefined || !("output" in built))
		throw new Error("Unexpected watch build");
	const files = new Map<string, string>();
	for (const entry of built.output) {
		if (entry.type !== "chunk") continue;
		const path =
			entry.fileName === "forgeframe.js" ? "library.js" : entry.fileName;
		files.set(`/${path}`, entry.code);
	}
	if (!files.has("/library.js") || !files.has("/react.js"))
		throw new Error("Missing library entry chunks");
	return files;
}
