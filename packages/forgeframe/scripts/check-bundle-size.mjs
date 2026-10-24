import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/**
 * Size budgets for the published, minified ESM bundle. Raise a budget only in
 * the change that needs the extra bytes, and say why in its description.
 */
const budgets = { minified: 130 * 1024, gzip: 33 * 1024 };

const bundlePath =
	process.argv[2] ??
	fileURLToPath(new URL("../dist/forgeframe.js", import.meta.url));
const bundle = readFileSync(bundlePath);
const sizes = {
	minified: bundle.length,
	gzip: gzipSync(bundle, { level: 9 }).length,
};

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const failures = Object.entries(budgets).filter(
	([kind, budget]) => sizes[kind] > budget,
);
for (const [kind, budget] of Object.entries(budgets)) {
	console.log(`${kind}: ${kib(sizes[kind])} (budget ${kib(budget)})`);
}
if (failures.length > 0) {
	console.error(
		`Bundle exceeds its ${failures.map(([kind]) => kind).join(" and ")} budget: ${bundlePath}`,
	);
	process.exit(1);
}
