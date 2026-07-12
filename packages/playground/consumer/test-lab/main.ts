import { runScenario } from './scenarios';
import type { ScenarioId } from './types';
import {
  getSandbox,
  renderOverview,
  renderResults,
  renderScenario,
  SCENARIOS,
  setRunning,
} from './ui';

const scenarioId = window.location.pathname.split('/').filter(Boolean)[1] as
  | ScenarioId
  | undefined;
const scenario = SCENARIOS.find((entry) => entry.id === scenarioId);

if (!scenario) {
  document.title = 'ForgeFrame Browser Test Lab';
  renderOverview();
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
