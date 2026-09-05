import { readFileSync } from "node:fs";
import process from "node:process";

const { version } = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const expectedTag = `v${version}`;

if (
	process.env.GITHUB_REF_TYPE !== "tag" ||
	process.env.GITHUB_REF_NAME !== expectedTag
) {
	throw new Error(
		`Release must run from tag ${expectedTag}, matching packages/forgeframe/package.json`,
	);
}
