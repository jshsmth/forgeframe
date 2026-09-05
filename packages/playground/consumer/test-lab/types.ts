import type { TEST_SCENARIO_IDS } from "./scenario-ids";

export type ScenarioId = (typeof TEST_SCENARIO_IDS)[number];

export interface TestResult {
	name: string;
	status: "pass" | "skip" | "fail";
	detail: string;
}

export interface ScenarioDefinition {
	id: ScenarioId;
	title: string;
	description: string;
	autoRun?: boolean;
}
