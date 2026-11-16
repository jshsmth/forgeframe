import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** The wiki, whose pages' examples compile along with the README's. */
const WIKI_DIRECTORY = "docs";
/** The migration guide quotes v1 code, which must not compile against v2. */
const SKIPPED_DOCUMENTS = new Set(["docs/guide/migrating-v1-to-v2.md"]);
/** Put this comment on the line before a fence that is not meant to compile. */
const SKIP_MARKER = "<!-- readme-check: skip -->";

/**
 * Reads the documents whose examples are compiled: the root README and every
 * wiki page, in any folder, except the v1 migration guide.
 *
 * @param repoRoot - The repository root
 * @returns Each document's repository-relative path and text, README first
 */
export function readExampleDocuments(repoRoot) {
	const pages = readdirSync(resolve(repoRoot, WIKI_DIRECTORY), {
		recursive: true,
	})
		.filter((name) => name.endsWith(".md"))
		.map((name) => `${WIKI_DIRECTORY}/${name.replaceAll("\\", "/")}`)
		.filter((path) => !SKIPPED_DOCUMENTS.has(path))
		.sort();
	return ["README.md", ...pages].map((path) => ({
		path,
		text: readFileSync(resolve(repoRoot, path), "utf8"),
	}));
}

/**
 * Lists the documents' TypeScript examples, without blocks marked with
 * {@link SKIP_MARKER}.
 */
function readExamples(documents) {
	const examples = [];
	for (const { path, text } of documents) {
		for (const match of text.matchAll(
			/```(typescript|tsx)\r?\n([\s\S]*?)```/g,
		)) {
			const before = text.slice(0, match.index);
			if (before.trimEnd().endsWith(SKIP_MARKER)) continue;
			// The line of the first code line, after the fence.
			const line = before.split("\n").length + 1;
			examples.push({ language: match[1], code: match[2], line, path });
		}
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
 * The prelude line that declares a name a snippet uses without declaring: an
 * import for a package export or a schema library, a `Host` for `host`,
 * otherwise `any` as both a value and a type. A typed `host` keeps its
 * callback parameters contextually typed, so `noImplicitAny` stays on.
 */
function declareName(name, packageExports) {
	if (packageExports.has(name)) return `import { ${name} } from 'forgeframe';`;
	if (name === "z") return "import { z } from 'zod';";
	if (name === "v") return "import * as v from 'valibot';";
	if (name === "host")
		return "declare const host: import('forgeframe').Host<Record<string, unknown>>;";
	return `declare const ${name}: any; type ${name} = any;`;
}

/** A first line such as `// payment-form.ts` names the module a block defines. */
function moduleName(code) {
	return code.match(/^\/\/ ([\w/-]+)\.ts\b/)?.[1];
}

/** The number of examples in each document that has any, keyed by path. */
function countByDocument(examples) {
	const counts = new Map();
	for (const { path } of examples)
		counts.set(path, (counts.get(path) ?? 0) + 1);
	return counts;
}

/**
 * The module names the examples define. Named modules share one namespace
 * across documents, so a name defined twice would overwrite the first block.
 */
function definedModules(examples) {
	const owners = new Map();
	for (const example of examples) {
		const name = moduleName(example.code);
		if (!name) continue;
		const owner = owners.get(name);
		if (owner)
			throw new Error(
				`Documentation examples both define ${name}.ts: ${owner.path}:${owner.line} and ${example.path}:${example.line}`,
			);
		owners.set(name, example);
	}
	return new Set(owners.keys());
}

/**
 * Type-checks every example in the given documents against the installed
 * package.
 *
 * @remarks
 * Each block is its own module. A block that names its file defines that
 * module for the others, in any document; other relative imports get stubs, typed
 * `AnyComponent` for capitalized names and `any` otherwise. A ForgeFrame
 * export a snippet uses without importing is imported; other undeclared
 * names are declared as in {@link declareName}, so the check catches wrong
 * ForgeFrame API usage rather than snippet context.
 *
 * @param documents - The documents from {@link readExampleDocuments}
 * @param directory - The directory with the installed package
 * @param typecheck - Runs tsc on the given files; returns its output, and
 * throws with the output on errors
 * @returns The number of compiled examples per document path, for the
 * documents that have any
 * @throws When two blocks name the same module, or an example does not compile
 */
export function checkDocumentExamples(documents, directory, typecheck) {
	const examples = readExamples(documents);
	const counts = countByDocument(examples);
	const files = [];
	const stubs = new Map();
	const defined = definedModules(examples);
	for (const [index, example] of examples.entries()) {
		const name = moduleName(example.code);
		const file = name
			? `${name}.ts`
			: `example-${index}.${example.language === "tsx" ? "tsx" : "ts"}`;
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
		return counts;
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
			(location, file, line) => {
				const entry = files.find((candidate) => candidate.file === file);
				// A generated stub has no document line to point at.
				if (!entry) return location;
				// The prelude takes one line per declared name, or one empty line.
				const preludeLines = Math.max(declarations.get(file)?.size ?? 0, 1);
				const documentLine =
					entry.example.line + Number(line) - preludeLines - 1;
				return `${entry.example.path}:${documentLine} (${file}:${line},`;
			},
		);
		throw new Error(`Documentation examples do not compile:\n${located}`);
	}
	return counts;
}
