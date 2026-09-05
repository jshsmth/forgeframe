import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");

async function exists(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

async function declarationSpecifier(file, specifier) {
	if (!specifier.startsWith(".") || /\.[a-z0-9]+$/i.test(specifier)) {
		return specifier;
	}

	const target = resolve(dirname(file), specifier);
	if (await exists(`${target}.d.ts`)) {
		return `${specifier}.js`;
	}
	if (await exists(join(target, "index.d.ts"))) {
		return `${specifier}/index.js`;
	}
	return specifier;
}

async function processFile(file) {
	const source = await readFile(file, "utf8");
	const pattern = /(from\s+|import\(\s*)(['"])(\.\.?\/[^'"]+)\2/g;
	const matches = [...source.matchAll(pattern)];
	let output = source;

	for (const match of matches.reverse()) {
		const specifier = match[3];
		const replacement = await declarationSpecifier(file, specifier);
		if (replacement === specifier || match.index === undefined) continue;
		const specifierOffset = match[0].indexOf(specifier);
		const start = match.index + specifierOffset;
		output = `${output.slice(0, start)}${replacement}${output.slice(start + specifier.length)}`;
	}

	if (output !== source) {
		await writeFile(file, output);
	}
}

async function walk(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			await walk(path);
		} else if (entry.name.endsWith(".d.ts")) {
			await processFile(path);
		}
	}
}

await walk(distDir);
