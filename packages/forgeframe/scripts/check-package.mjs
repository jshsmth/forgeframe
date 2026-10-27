import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { checkReadmeExamples } from "./check-readme-examples.mjs";

const repoRoot = resolve(import.meta.dirname, "../../..");
const { version } = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const directory = mkdtempSync(resolve(tmpdir(), "forgeframe-package-"));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this check with npm run test:package");

function run(command, args, cwd = directory) {
	return execFileSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });
}

try {
	const [artifact] = JSON.parse(
		run(
			process.execPath,
			[
				npmCli,
				"pack",
				"--json",
				"--pack-destination",
				directory,
				"-w",
				"forgeframe",
			],
			repoRoot,
		),
	);
	assert.equal(artifact.version, version);
	const packedFiles = artifact.files.map((file) => file.path);
	for (const file of [
		"dist/forgeframe.js",
		"dist/index.d.ts",
		"dist/react.js",
		"dist/react.d.ts",
	])
		assert.ok(packedFiles.includes(file), `Missing ${file} from the package`);
	assert.ok(
		packedFiles.some((file) => /^dist\/shared-[\w-]+\.js$/.test(file)),
		"Missing the shared chunk from the package",
	);
	writeFileSync(
		resolve(directory, "package.json"),
		JSON.stringify({ private: true, type: "module" }),
	);
	run(process.execPath, [
		npmCli,
		"install",
		"--ignore-scripts",
		"--no-audit",
		"--no-fund",
		"--package-lock=false",
		resolve(directory, artifact.filename),
	]);
	writeFileSync(
		resolve(directory, "smoke.mjs"),
		`import assert from 'node:assert/strict';
import * as entrypoint from 'forgeframe';
import { VERSION, ForgeFrameError, create, isHost, initHost, prop } from 'forgeframe';
assert.equal(VERSION, ${JSON.stringify(version)});
for (const removed of ['default', 'ForgeFrame', 'getHostProps', 'isEmbedded', 'CONTEXT', 'EVENT', 'isStandardSchema', 'StringSchema', 'PopupOpenError', 'createReactComponent', 'withReactComponent'])
	assert.equal(removed in entrypoint, false, removed + ' was removed from the root in ForgeFrame 2');
assert.equal(isHost(), false);
assert.deepEqual(prop.string().trim()['~standard'].validate(' value '), { value: 'value' });
const callback = () => 42;
assert.deepEqual(prop.function().default(() => callback)['~standard'].validate(undefined), { value: callback });
assert.ok(prop.function().default(() => 42)['~standard'].validate(undefined).issues);
const Component = create({ tag: 'installed-package', url: 'https://example.com/widget' });
assert.equal(initHost(Component, { consumerOrigins: 'https://consumer.example.com' }), null);
assert.throws(() => initHost(), (error) => error instanceof ForgeFrameError && error.code === 'VALIDATION' && error.message.includes('initHost(Component, { consumerOrigins })'));
`,
	);
	run(process.execPath, ["smoke.mjs"]);
	// The default condition lets require(esm) and CommonJS test runners load it.
	writeFileSync(
		resolve(directory, "require.cjs"),
		`const assert = require('node:assert/strict');
assert.equal(typeof require('forgeframe').create, 'function');
`,
	);
	run(process.execPath, ["require.cjs"]);
	writeFileSync(
		resolve(directory, "consumer.mts"),
		`import { create, initHost, prop, type ExportsOf, type HostOf, type HostPropsOf, type PropsOf, type RemoteValue, type StandardSchemaV1, type StringSchema } from 'forgeframe';
const Component = create({
 tag: 'typed-package', url: 'https://example.com/widget',
 props: { count: prop.number().default(1), callback: prop.function<(n: number) => string>(), defaultedCallback: prop.function<() => number>().default(() => () => 42) },
 exports: prop.object({ reset: prop.function<() => void>() }),
});
const instance = Component({ callback: n => String(n) });
void instance.updateProps({ count: 2 });
const reset: Promise<void> | undefined = instance.exports?.reset();
const propsCount: PropsOf<typeof Component>['count'] = 1;
const localExports: ExportsOf<typeof Component> = { reset: () => undefined };
const label: StringSchema = prop.string();
const parsed: StandardSchemaV1.InferOutput<typeof label> = 'value';
declare const typedHost: HostOf<typeof Component>;
void typedHost.export(localExports);
void reset; void propsCount; void parsed;
declare const hostProps: HostPropsOf<typeof Component>;
const result: Promise<string> = hostProps.callback(1);
declare const exports: RemoteValue<{ nested: { method: () => number } }>;
const remoteResult: Promise<number> = exports.nested.method();
const started = initHost(Component, { consumerOrigins: '*' });
const startedCount: number | undefined = (await started?.ready)?.count;
void result; void remoteResult; void startedCount;
// Exact checks against the published declarations, so none widens to any.
type IsEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
const exactProps: IsEqual<Simplify<PropsOf<typeof Component>>, { count: number; callback: (n: number) => string; defaultedCallback: () => number }> = true;
const exactReady: IsEqual<Simplify<Awaited<NonNullable<typeof started>['ready']>>, { count: number; callback: (n: number) => Promise<string>; defaultedCallback: () => Promise<number> }> = true;
void exactProps; void exactReady;
// @ts-expect-error a required prop cannot be reset to undefined
void instance.updateProps({ callback: undefined });
`,
	);
	// A library exporting components emits declarations that must name every
	// type the inferred component reaches through the root entry.
	writeFileSync(
		resolve(directory, "library.mts"),
		`import { create, initHost, prop } from 'forgeframe';
export const Library = create({
 tag: 'library-package', url: 'https://example.com/widget',
 props: {
  user: prop.object({ id: prop.string(), tags: prop.array(prop.string()) }),
  scores: prop.record(prop.number()), mode: prop.enum(['a', 'b']),
  pair: prop.tuple(prop.string(), prop.number()), either: prop.union(prop.string(), prop.number()),
  when: prop.date().optional(), raw: prop.any<{ a: number }>(),
  onDone: prop.function<(id: string) => void>(), wrapped: { schema: prop.string(), queryParam: true },
 },
 exports: prop.object({ reset: prop.function<() => void>() }),
});
export const host = initHost(Library, { consumerOrigins: '*' });
export const agnosticHost = initHost({ props: { n: prop.number() }, consumerOrigins: '*' });
`,
	);
	run(process.execPath, [
		resolve(repoRoot, "node_modules/typescript/bin/tsc"),
		"--ignoreConfig",
		"--declaration",
		"--emitDeclarationOnly",
		"--outDir",
		"declarations",
		"--strict",
		"--skipLibCheck",
		"--module",
		"NodeNext",
		"--moduleResolution",
		"NodeNext",
		"--target",
		"ES2022",
		"library.mts",
	]);
	const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
	const componentSection = readme.split("### 1. Define a Component")[1];
	const readmeExample = componentSection?.match(
		/```typescript\r?\n([\s\S]*?)```/,
	)?.[1];
	assert.ok(readmeExample, "Missing README Define a Component example");
	writeFileSync(resolve(directory, "readme-consumer.mts"), readmeExample);
	const typecheck = (...files) =>
		run(process.execPath, [
			resolve(repoRoot, "node_modules/typescript/bin/tsc"),
			"--ignoreConfig",
			"--noEmit",
			"--strict",
			"--skipLibCheck",
			"false",
			"--module",
			"NodeNext",
			"--moduleResolution",
			"NodeNext",
			"--target",
			"ES2022",
			"--jsx",
			"react-jsx",
			...files,
		]);
	// React is not installed yet, so the root entry's types must not need it.
	typecheck("consumer.mts", "readme-consumer.mts");
	// The declarations also compile with the oldest supported TypeScript,
	// installed apart so it never replaces the repository's compiler.
	run(process.execPath, [
		npmCli,
		"install",
		"--prefix",
		resolve(directory, "typescript-5.0"),
		"--ignore-scripts",
		"--no-audit",
		"--no-fund",
		"--package-lock=false",
		"typescript@5.0.4",
	]);
	run(process.execPath, [
		resolve(directory, "typescript-5.0/node_modules/typescript/bin/tsc"),
		"--noEmit",
		"--strict",
		"--module",
		"NodeNext",
		"--moduleResolution",
		"NodeNext",
		"--target",
		"ES2022",
		"consumer.mts",
		"readme-consumer.mts",
	]);

	const reactSection = readme.split("## React Integration (Optional)")[1];
	const reactExample = reactSection?.match(/```tsx\r?\n([\s\S]*?)```/)?.[1];
	assert.ok(reactExample, "Missing README React Basic Usage example");
	writeFileSync(resolve(directory, "readme-react.tsx"), reactExample);
	// React is an optional peer; use the repository's pinned fixture runtime.
	mkdirSync(resolve(directory, "node_modules/@types"), { recursive: true });
	for (const dependency of ["react", "@types/react"]) {
		symlinkSync(
			resolve(repoRoot, "node_modules", dependency),
			resolve(directory, "node_modules", dependency),
			"dir",
		);
	}
	writeFileSync(
		resolve(directory, "react-smoke.mjs"),
		`import assert from 'node:assert/strict';
import * as reactEntrypoint from 'forgeframe/react';
import { create, ForgeFrameError } from 'forgeframe';
assert.deepEqual(Object.keys(reactEntrypoint), ['createReactComponent']);
const Component = create({ tag: 'installed-react', url: 'https://example.com/widget' });
assert.equal(reactEntrypoint.createReactComponent(Component).displayName, 'ForgeFrame(installed-react)');
assert.throws(() => reactEntrypoint.createReactComponent(Component, { React: {} }), (error) => error instanceof ForgeFrameError && error.code === 'VALIDATION');
`,
	);
	run(process.execPath, ["react-smoke.mjs"]);
	writeFileSync(
		resolve(directory, "react-consumer.tsx"),
		`import { createRef } from 'react';
import { create, prop } from 'forgeframe';
import { createReactComponent, type ReactComponentOf, type ReactInstance } from 'forgeframe/react';
const Component = create({ tag: 'typed-react', url: 'https://example.com/widget', props: { label: prop.string() }, exports: prop.object({ total: prop.function<() => number>() }) });
const Wrapped: ReactComponentOf<typeof Component> = createReactComponent(Component);
const instanceRef = createRef<ReactInstance<{ total: () => number }>>();
const element = <Wrapped label="ready" instanceRef={instanceRef} style={{ display: 'block' }} />;
const total: Promise<number> | undefined = instanceRef.current?.exports?.total();
void element; void total;
`,
	);
	typecheck("readme-react.tsx", "react-consumer.tsx");

	// Every README example outside the v1 migration guide compiles against the
	// installed package; schema libraries come from the repository.
	for (const dependency of ["zod", "valibot"]) {
		symlinkSync(
			resolve(repoRoot, "node_modules", dependency),
			resolve(directory, "node_modules", dependency),
			"dir",
		);
	}
	const checkedExamples = checkReadmeExamples(readme, directory, (...files) =>
		run(process.execPath, [
			resolve(repoRoot, "node_modules/typescript/bin/tsc"),
			"--ignoreConfig",
			"--noEmit",
			"--strict",
			// Snippet context is declared as any, so implicit any is expected.
			"--noImplicitAny",
			"false",
			"--useUnknownInCatchVariables",
			"false",
			"--skipLibCheck",
			"--module",
			"ESNext",
			"--moduleResolution",
			"bundler",
			"--moduleDetection",
			"force",
			"--target",
			"ES2022",
			"--jsx",
			"react-jsx",
			...files,
		]),
	);
	console.log(`README: ${checkedExamples} TypeScript examples compile`);
	console.log(
		`Installed forgeframe@${version}: ESM runtime and NodeNext consumer types passed`,
	);
} finally {
	rmSync(directory, { recursive: true, force: true });
}
