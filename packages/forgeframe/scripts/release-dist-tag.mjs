import { readFileSync } from "node:fs";

/**
 * Prints the npm dist-tag for the package version as a step output
 * (`tag=next` or `tag=latest`). npm refuses to publish a pre-release without
 * an explicit tag, and a pre-release must never become `latest`.
 */
const { version } = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const prerelease = /^\d+\.\d+\.\d+-/.test(version);

console.log(`tag=${prerelease ? "next" : "latest"}`);
