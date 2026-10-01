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
import ForgeFrame, { VERSION, create, isHost, initHost, prop, createReactComponent } from 'forgeframe';
assert.equal(VERSION, ${JSON.stringify(version)});
assert.equal(ForgeFrame.create, create);
assert.equal(typeof createReactComponent, 'function');
assert.equal(isHost(), false);
assert.equal(initHost(), null);
assert.deepEqual(prop.string().trim()['~standard'].validate(' value '), { value: 'value' });
const callback = () => 42;
assert.deepEqual(prop.function().default(() => callback)['~standard'].validate(undefined), { value: callback });
assert.ok(prop.function().default(() => 42)['~standard'].validate(undefined).issues);
assert.equal(create({ tag: 'installed-package', url: 'https://example.com/widget' }).isHost(), false);
`,
	);
	run(process.execPath, ["smoke.mjs"]);
	writeFileSync(
		resolve(directory, "consumer.mts"),
		`import ForgeFrame, { prop, type HostProps, type RemoteValue } from 'forgeframe';
const Component = ForgeFrame.create({
 tag: 'typed-package', url: 'https://example.com/widget',
 props: { count: prop.number().default(1), callback: prop.function<(n: number) => string>(), defaultedCallback: prop.function<() => number>().default(() => () => 42) },
});
const instance = Component({ callback: n => String(n) });
void instance.updateProps({ count: 2 });
declare const host: HostProps<{ callback: (n: number) => string }>;
const result: Promise<string> = host.callback(1);
declare const exports: RemoteValue<{ nested: { method: () => number } }>;
const remoteResult: Promise<number> = exports.nested.method();
void result; void remoteResult;
`,
	);
	const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
	const componentSection = readme.split("### 1. Define a Component")[1];
	const readmeExample = componentSection?.match(
		/```typescript\r?\n([\s\S]*?)```/,
	)?.[1];
	assert.ok(readmeExample, "Missing README Define a Component example");
	writeFileSync(resolve(directory, "readme-consumer.mts"), readmeExample);
	const reactSection = readme.split("## React Integration (Optional)")[1];
	const reactExample = reactSection?.match(/```tsx\r?\n([\s\S]*?)```/)?.[1];
	assert.ok(reactExample, "Missing README React Basic Usage example");
	writeFileSync(resolve(directory, "readme-react.tsx"), reactExample);
	// React is an optional adapter dependency; use the repository's pinned fixture runtime.
	mkdirSync(resolve(directory, "node_modules/@types"), { recursive: true });
	for (const dependency of ["react", "@types/react"]) {
		symlinkSync(
			resolve(repoRoot, "node_modules", dependency),
			resolve(directory, "node_modules", dependency),
			"dir",
		);
	}
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
		"consumer.mts",
		"readme-consumer.mts",
		"readme-react.tsx",
	]);
	console.log(
		`Installed forgeframe@${version}: ESM runtime and NodeNext consumer types passed`,
	);
} finally {
	rmSync(directory, { recursive: true, force: true });
}
