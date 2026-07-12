import { runScenario } from './scenarios';
import type { ScenarioId, TestResult } from './types';
import {
  getSandbox,
  renderOverview,
  renderResults,
  renderScenario,
  SCENARIOS,
  setRunning,
  setSuiteRunning,
} from './ui';

const scenarioId = window.location.pathname.split('/').filter(Boolean)[1] as
  | ScenarioId
  | undefined;
const scenario = SCENARIOS.find((entry) => entry.id === scenarioId);

if (!scenario) {
  document.title = 'ForgeFrame Browser Test Lab';
  renderOverview();
  const runAllButton = document.querySelector<HTMLButtonElement>('#run-all-scenarios')!;
  const automaticScenarios = SCENARIOS.filter((entry) => entry.autoRun !== false);
  const executeAll = async () => {
    const results: TestResult[] = [];
    const sandbox = getSandbox();
    renderResults(results);
    setSuiteRunning(true, `Starting ${automaticScenarios.length} scenarios…`);
    for (const [index, entry] of automaticScenarios.entries()) {
      setSuiteRunning(
        true,
        `Running ${index + 1}/${automaticScenarios.length}: ${entry.title}`
      );
      try {
        const scenarioResults = await runScenario(entry.id, sandbox);
        results.push(...scenarioResults.map((result) => ({
          ...result,
          name: `${entry.title}: ${result.name}`,
        })));
      } catch (error) {
        results.push({
          name: `${entry.title}: scenario runner`,
          status: 'fail',
          detail: error instanceof Error ? error.message : String(error),
        });
      } finally {
        sandbox.replaceChildren();
      }
      renderResults(results);
    }
    setSuiteRunning(false);
  };
  runAllButton.addEventListener('click', () => void executeAll());
} else {
  document.title = `${scenario.title} · ForgeFrame Test Lab`;
  renderScenario(scenario);
  const runButton = document.querySelector<HTMLButtonElement>('#run-scenario')!;
  const execute = async () => {
    setRunning(true);
    const sandbox = getSandbox();
    try {
      renderResults(await runScenario(scenario.id, sandbox));
    } catch (error) {
      renderResults([{
        name: 'Scenario runner',
        status: 'fail',
        detail: error instanceof Error ? error.message : String(error),
      }]);
    } finally {
      sandbox.replaceChildren();
      setRunning(false);
    }
  };

  runButton.addEventListener('click', () => void execute());
  if (scenario.autoRun !== false) {
    void execute();
  }
}
