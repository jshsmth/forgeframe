import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/**
 * Size budgets for each published ESM entry, counted together with the
 * chunks it statically imports: the size measured for 2.0.0 plus about 4%,
 * rounded up to a whole KiB. "raw" is the bytes as published; the build
 * shortens identifiers but keeps whitespace, so it is not fully minified.
 * Raise a budget only in the change that needs the extra bytes, and say why
 * in its description.
 */
const budgets = {
	"forgeframe.js": { raw: 111 * 1024, gzip: 29 * 1024 },
	"react.js": { raw: 8 * 1024, gzip: 4 * 1024 },
};

const distDir =
	process.argv[2] ?? fileURLToPath(new URL("../dist", import.meta.url));

/**
 * An entry's file and every chunk it statically imports, each once. Matches
 * minified forms such as `import{a}from"./x.js"` and `export*from"./x.js"`.
 */
function staticGraph(file, seen = new Set()) {
	if (seen.has(file)) return seen;
	seen.add(file);
	const code = readFileSync(file, "utf8");
	for (const [, specifier] of code.matchAll(
		/(?:^|[;\s}])(?:import|export)\s*(?:[^"'`;]*?[\s}*]from\s*)?["'](\.{1,2}\/[^"']+)["']/g,
	)) {
		staticGraph(resolve(dirname(file), specifier), seen);
	}
	return seen;
}

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
let failed = false;
for (const [entry, budget] of Object.entries(budgets)) {
	const files = [...staticGraph(resolve(distDir, entry))];
	const bundle = Buffer.concat(files.map((file) => readFileSync(file)));
	const sizes = {
		raw: bundle.length,
		gzip: gzipSync(bundle, { level: 9 }).length,
	};
	const chunks = files.length - 1;
	console.log(
		`${entry} (+${chunks} shared chunk${chunks === 1 ? "" : "s"}): raw ${kib(sizes.raw)} (budget ${kib(budget.raw)}), gzip ${kib(sizes.gzip)} (budget ${kib(budget.gzip)})`,
	);
	const over = Object.keys(budget).filter((kind) => sizes[kind] > budget[kind]);
	if (over.length > 0) {
		console.error(`${entry} exceeds its ${over.join(" and ")} budget`);
		failed = true;
	}
}
if (failed) process.exit(1);
