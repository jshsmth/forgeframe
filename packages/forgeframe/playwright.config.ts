import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "tests/browser",
	testMatch: "**/*.spec.ts",
	workers: 1,
	use: { headless: true },
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
