import { defineConfig } from "@playwright/test";

const ci = Boolean(process.env.CI);

export default defineConfig({
	testDir: "tests/browser",
	testMatch: "**/*.spec.ts",
	// One worker: the focus tests need the only active window.
	workers: 1,
	// A stray test.only must not silently skip the rest of the suite in CI.
	forbidOnly: ci,
	// A retry tells a flake from a hard failure; a test that passes only on
	// retry still fails the run.
	retries: ci ? 1 : 0,
	failOnFlakyTests: ci,
	timeout: 30_000,
	expect: { timeout: 5_000 },
	globalTimeout: ci ? 30 * 60_000 : 0,
	reporter: ci
		? [["github"], ["html", { open: "never" }], ["list"]]
		: [["list"]],
	use: {
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{ name: "chromium", use: { browserName: "chromium" } },
		{ name: "firefox", use: { browserName: "firefox" } },
		{ name: "webkit", use: { browserName: "webkit" } },
	],
});
