import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** The migration guide quotes v1 code, which must not compile against v2. */
const SKIPPED_SECTIONS = [["## Migrating from v1 to v2", "## API Reference"]];
/** Put this comment on the line before a fence that is not meant to compile. */
const SKIP_MARKER = "<!-- readme-check: skip -->";

/**
 * Lists the README's TypeScript examples, without the migration guide and
 * blocks marked with {@link SKIP_MARKER}.
 */
function readExamples(readme) {
	const skipped = SKIPPED_SECTIONS.map(([start, end]) => [
		readme.indexOf(start),
		readme.indexOf(end),
	]);
	const examples = [];
	for (const match of readme.matchAll(
		/```(typescript|tsx)\r?\n([\s\S]*?)```/g,
	)) {
		const before = readme.slice(0, match.index);
		if (before.trimEnd().endsWith(SKIP_MARKER)) continue;
		if (
			skipped.some(([start, end]) => match.index > start && match.index < end)
		)
			continue;
		// The line of the first code line, after the fence.
		const line = before.split("\n").length + 1;
		examples.push({ language: match[1], code: match[2], line });
	}
	return examples;
}

/** The names the installed root entry exports, read from its declarations. */
function readPackageExports(directory) {
	const declarations = readFileSync(
		resolve(directory, "node_modules/forgeframe/dist/index.d.ts"),
		"utf8",
	);
	const names = new Set();
	for (const block of declarations.matchAll(/^export (?:type )?\{([^}]*)\}/gm))
		for (const specifier of block[1].split(","))
			if (specifier.trim())
				names.add(specifier.replace(/^\s*type\s+/, "").trim());
	return names;
}

/**
 * The prelude line that declares a name a snippet uses without declaring:
 * an import for a package export or a schema library, otherwise `any`.
 */
function declareName(name, packageExports) {
	if (packageExports.has(name)) return `import { ${name} } from 'forgeframe';`;
	if (name === "z") return "import { z } from 'zod';";
	if (name === "v") return "import * as v from 'valibot';";
	return `declare const ${name}: any; type ${name} = any;`;
}

/** A first line such as `// payment-form.ts` names the module a block defines. */
function moduleName(code) {
	return code.match(/^\/\/ ([\w/-]+)\.ts\b/)?.[1];
}

/**
 * Type-checks every README example against the installed package.
 *
 * @remarks
 * Each block is its own module. A block that names its file defines that
 * module for the others; other relative imports get stubs, typed
 * `AnyComponent` for capitalized names and `any` otherwise. A ForgeFrame
 * export a snippet uses without importing is imported; other undeclared
 * names, such as `instance` or `consumerOrigins`, are declared as `any`, so
 * the check catches wrong ForgeFrame API usage rather than snippet context.
 *
 * @param readme - The README text
 * @param directory - The directory with the installed package
 * @param typecheck - Runs tsc on the given files; returns its output, and
 * throws with the output on errors
 */
export function checkReadmeExamples(readme, directory, typecheck) {
	const examples = readExamples(readme);
	const files = [];
	const stubs = new Map();
	const defined = new Set(
		examples.map((example) => moduleName(example.code)).filter(Boolean),
	);
	for (const [index, example] of examples.entries()) {
		const name = moduleName(example.code);
		const file = name
			? `${name}.ts`
			: `readme-example-${index}.${example.language === "tsx" ? "tsx" : "ts"}`;
		for (const imported of example.code.matchAll(
			/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'\.\/([\w/-]+)'/g,
		)) {
			if (defined.has(imported[2])) continue;
			const names = stubs.get(imported[2]) ?? new Set();
			for (const specifier of imported[1].split(","))
				if (specifier.trim())
					names.add(specifier.replace(/^\s*type\s+/, "").trim());
			stubs.set(imported[2], names);
		}
		files.push({ file, code: `${example.code}\nexport {};\n`, example });
	}
	for (const [path, names] of stubs) {
		const target = resolve(directory, "readme", `${path}.ts`);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(
			target,
			[...names]
				.map((name) =>
					/^[A-Z]/.test(name)
						? `export declare const ${name}: import('forgeframe').AnyComponent;`
						: `export declare const ${name}: any;\nexport type ${name} = any;`,
				)
				.join("\n"),
		);
	}
	const write = (declarations) => {
		for (const { file, code } of files) {
			const target = resolve(directory, "readme", file);
			mkdirSync(dirname(target), { recursive: true });
			const prelude = [...(declarations.get(file) ?? [])]
				.map((name) => declareName(name, packageExports))
				.join("\n");
			writeFileSync(target, `${prelude}\n${code}`);
		}
	};
	const packageExports = readPackageExports(directory);
	const paths = files.map(({ file }) => `readme/${file}`);
	const declarations = new Map();
	write(declarations);
	let output = "";
	try {
		typecheck(...paths);
		return examples.length;
	} catch (error) {
		output = String(error.stdout ?? error.message);
	}
	for (const match of output.matchAll(
		/^readme\/(\S+)\(\d+,\d+\): error TS(?:2304|2552|2580|18004): (?:Cannot find name|No value exists in scope for the shorthand property) '(\w+)'/gm,
	)) {
		const names = declarations.get(match[1]) ?? new Set();
		names.add(match[2]);
		declarations.set(match[1], names);
	}
	write(declarations);
	try {
		typecheck(...paths);
	} catch (error) {
		const located = String(error.stdout ?? error.message).replace(
			/^readme\/(\S+?)\((\d+),/gm,
			(_, file, line) => {
				const entry = files.find((candidate) => candidate.file === file);
				// The prelude takes one line per declared name, or one empty line.
				const preludeLines = Math.max(declarations.get(file)?.size ?? 0, 1);
				const readmeLine =
					(entry?.example.line ?? 0) + Number(line) - preludeLines - 1;
				return `README.md:${readmeLine} (${file}:${line},`;
			},
		);
		throw new Error(`README examples do not compile:\n${located}`);
	}
	return examples.length;
}
