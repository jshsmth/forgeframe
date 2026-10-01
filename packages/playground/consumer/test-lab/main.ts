import { requireValue } from "../../require-value";
import { runScenario } from "./scenarios";
import type { ScenarioId, TestResult } from "./types";
import {
	getSandbox,
	renderOverview,
	renderResults,
	renderScenario,
	SCENARIOS,
	setRunning,
	setSandboxState,
	setSuiteRunning,
} from "./ui";

const scenarioId = window.location.pathname.split("/").filter(Boolean)[1] as
	| ScenarioId
	| undefined;
const scenario = SCENARIOS.find((entry) => entry.id === scenarioId);

if (!scenario) {
	document.title = "ForgeFrame Browser Test Lab";
	renderOverview();
	const runAllButton = requireValue(
		document.querySelector<HTMLButtonElement>("#run-all-scenarios"),
	);
	const automaticScenarios = SCENARIOS.filter(
		(entry) => entry.autoRun !== false,
	);
	let stopRequested = false;
	const stopButton = requireValue(
		document.querySelector<HTMLButtonElement>("#stop-suite"),
	);
	stopButton.addEventListener("click", () => {
		stopRequested = true;
		stopButton.disabled = true;
		requireValue(document.querySelector("#scenario-summary")).textContent =
			"Stopping after the current scenario finishes…";
	});
	const executeAll = async () => {
		if (runAllButton.disabled) return;
		stopRequested = false;
		const results: TestResult[] = [];
		let completed = 0;
		const sandbox = getSandbox();
		renderResults(results);
		setSuiteRunning(true, `Starting ${automaticScenarios.length} scenarios…`);
		for (const [index, entry] of automaticScenarios.entries()) {
			if (stopRequested) break;
			setSuiteRunning(
				true,
				`Running ${index + 1}/${automaticScenarios.length}: ${entry.title}`,
			);
			try {
				const scenarioResults = await runScenario(entry.id, sandbox);
				results.push(
					...scenarioResults.map((result) => ({
						...result,
						scenarioId: entry.id,
						name: `${entry.title}: ${result.name}`,
					})),
				);
			} catch (error) {
				results.push({
					scenarioId: entry.id,
					name: `${entry.title}: scenario runner`,
					status: "fail",
					detail: error instanceof Error ? error.message : String(error),
				});
			} finally {
				sandbox.replaceChildren();
			}
			renderResults(results);
			completed += 1;
		}
		const stopped = stopRequested && completed < automaticScenarios.length;
		setSuiteRunning(
			false,
			stopped
				? `Stopped after ${completed}/${automaticScenarios.length} scenarios. Run the suite again or choose an individual route.`
				: `Completed ${completed}/${automaticScenarios.length} scenarios. ${results.some((result) => result.status === "fail") ? "Open a failed scenario below to investigate and rerun." : "Temporary components removed."}`,
		);
		if (stopped) {
			setSandboxState("stopped");
			document.body.dataset.testStatus = "stopped";
		}
	};
	runAllButton.addEventListener("click", () => void executeAll());
} else {
	document.title = `${scenario.title} · ForgeFrame Test Lab`;
	renderScenario(scenario);
	const runButton = requireValue(
		document.querySelector<HTMLButtonElement>("#run-scenario"),
	);
	const execute = async () => {
		if (runButton.disabled) return;
		renderResults([]);
		setRunning(true);
		const sandbox = getSandbox();
		try {
			renderResults(
				(await runScenario(scenario.id, sandbox)).map((result) => ({
					...result,
					scenarioId: scenario.id,
				})),
			);
		} catch (error) {
			renderResults([
				{
					scenarioId: scenario.id,
					name: "Scenario runner",
					status: "fail",
					detail: error instanceof Error ? error.message : String(error),
				},
			]);
		} finally {
			sandbox.replaceChildren();
			setRunning(false);
		}
	};

	runButton.addEventListener("click", () => void execute());
	if (scenario.autoRun !== false) {
		void execute();
	}
}
