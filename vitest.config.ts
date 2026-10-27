import { defineConfig } from "vitest/config";

// Lets `vitest` run from the repository root and editor test runners find
// the library suite. Coverage thresholds live in the package config and run
// through `npm run test:coverage`.
export default defineConfig({
	test: {
		projects: ["packages/forgeframe"],
	},
});
