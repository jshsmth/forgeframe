import { spawnSync } from "node:child_process";

const version = "1.4.0";
const installed = spawnSync("wiki", ["--version"], { encoding: "utf8" });

if (installed.status !== 0 || installed.stdout.trim() !== version) {
	console.error(
		`plasma-wiki ${version} is required. Install with: uv tool install plasma-wiki==${version}`,
	);
	process.exit(1);
}

for (const args of [
	["update", "--path", "docs", "--check"],
	["lint", "--path", "docs"],
]) {
	const result = spawnSync("wiki", args, { stdio: "inherit" });
	if (result.error) console.error(result.error.message);
	if (result.status !== 0) process.exit(result.status ?? 1);
}
