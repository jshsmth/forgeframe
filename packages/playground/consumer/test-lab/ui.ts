import type { ScenarioDefinition, TestResult } from './types';

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'lifecycle',
    title: 'Lifecycle and re-entry',
    description: 'Concurrent render, lifecycle callback re-entry, prop guards, and cleanup.',
  },
  {
    id: 'security',
    title: 'URL and iframe security',
    description: 'Protocol restrictions, domain policy, reserved attributes, and allowed rendering.',
  },
  {
    id: 'bridge',
    title: 'Function bridge',
    description: 'Consumer callbacks, callable host exports, return values, and Date transport.',
  },
  {
    id: 'props',
    title: 'Props and delivery policy',
    description: 'Query confidentiality rules and live postMessage prop synchronization.',
  },
  {
    id: 'controls',
    title: 'Consumer controls',
    description: 'Resize, hide, show, focus, lifecycle events, and deterministic cleanup.',
  },
  {
    id: 'nested',
    title: 'Nested components',
    description: 'Host-side child registration, two-level rendering, and nested exports.',
  },
  {
    id: 'errors',
    title: 'Error transport',
    description: 'Host-reported errors, thrown remote functions, and stack-trace privacy.',
  },
  {
    id: 'configuration',
    title: 'Configuration surface',
    description: 'Dynamic URL and dimensions, schemas, eligibility, validation, attributes, styles, and templates.',
  },
  {
    id: 'instances',
    title: 'Instances and peers',
    description: 'Clone snapshots, active-instance tracking, peer discovery, and destroy-by-tag cleanup.',
  },
  {
    id: 'host-controls',
    title: 'Host-initiated controls',
    description: 'The embedded host resizes, focuses, hides, shows, and closes its consumer-owned frame.',
  },
  {
    id: 'transport',
    title: 'POST and trust policy',
    description: 'POST body bootstrap plus trusted-domain and private-prop delivery boundaries.',
  },
  {
    id: 'reliability',
    title: 'Reliability and isolation',
    description: 'Single URL resolution, teardown recovery, concurrent instances, prop isolation, and cleanup.',
  },
  {
    id: 'common-actions',
    title: 'Common actions',
    description: 'Render, ready exports, prop updates, remote methods, callbacks, controls, and close in one everyday journey.',
  },
  {
    id: 'redirect',
    title: 'Redirect journey',
    description: 'A frame changes to a second allowed origin before INIT, then completes props, exports, and callbacks.',
  },
  {
    id: 'timeout-recovery',
    title: 'Timeout and recovery',
    description: 'A delayed host times out and cleans up before a fresh component renders successfully.',
  },
  {
    id: 'stress',
    title: 'Twenty-instance stress journey',
    description: 'Twenty render, update, remote-call, and destroy cycles finish without leaked frames or instances.',
  },
  {
    id: 'popup',
    title: 'Popup end to end',
    description: 'A user-initiated popup opens, handshakes, exports data, focuses, resizes, and closes.',
    autoRun: false,
  },
  {
    id: 'checkout-e2e',
    title: 'Customer checkout journey',
    description: 'A realistic render, ready, prop update, remote submit, callback, receipt, and teardown journey.',
  },
];

const LAB_STYLES = `
  * { box-sizing: border-box; }
  body { min-height: 100vh; margin: 0; background: #f5f6f8; color: #25262b; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; }
  .lab-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18px 28px; background: #fff; border-bottom: 1px solid #e5e7eb; }
  .lab-brand { color: #25262b; font-size: 20px; font-weight: 700; text-decoration: none; }
  .lab-brand span { color: #e94560; }
  .lab-nav { display: flex; flex-wrap: wrap; gap: 8px; }
  .lab-nav a { padding: 7px 10px; border-radius: 7px; color: #5f6570; font-size: 13px; font-weight: 600; text-decoration: none; }
  .lab-nav a:hover, .lab-nav a.active { color: #e94560; background: #fff0f3; }
  .lab-main { width: min(1080px, calc(100% - 32px)); margin: 34px auto; }
  .lab-kicker { margin: 0 0 8px; color: #e94560; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .lab-title { margin: 0; font-size: clamp(28px, 5vw, 44px); line-height: 1.08; }
  .lab-description { max-width: 720px; margin: 14px 0 0; color: #69707d; font-size: 16px; line-height: 1.6; }
  .section-title { margin: 34px 0 0; font-size: 20px; }
  .scenario-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; margin-top: 30px; }
  .scenario-card { min-height: 170px; padding: 22px; border: 1px solid #e1e4e8; border-radius: 14px; background: #fff; color: inherit; text-decoration: none; box-shadow: 0 8px 30px rgba(30, 35, 45, .05); }
  .scenario-card:hover { border-color: #e94560; transform: translateY(-1px); }
  .scenario-card strong { display: block; margin-bottom: 10px; font-size: 17px; }
  .scenario-card p { margin: 0; color: #747b87; font-size: 14px; line-height: 1.5; }
  .scenario-card span { display: block; margin-top: 18px; color: #e94560; font-size: 13px; font-weight: 700; }
  .lab-toolbar { display: flex; align-items: center; gap: 12px; margin: 26px 0 16px; }
  .run-button { border: 0; border-radius: 8px; padding: 10px 16px; background: #e94560; color: #fff; cursor: pointer; font: inherit; font-size: 14px; font-weight: 700; }
  .run-button:disabled { cursor: wait; opacity: .6; }
  .summary { color: #69707d; font-size: 14px; }
  .results { display: grid; gap: 10px; }
  .result { display: grid; grid-template-columns: 22px minmax(180px, .7fr) 1fr; gap: 10px; align-items: start; padding: 14px 16px; border: 1px solid #e1e4e8; border-radius: 10px; background: #fff; }
  .result.pass { border-left: 4px solid #1f9d55; }
  .result.fail { border-left: 4px solid #d64545; }
  .result-icon { font-weight: 900; }
  .result.pass .result-icon { color: #1f9d55; }
  .result.fail .result-icon { color: #d64545; }
  .result-name { font-size: 14px; font-weight: 700; }
  .result-detail { color: #69707d; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .sandbox { min-height: 180px; margin-top: 18px; padding: 12px; border: 1px dashed #cfd4dc; border-radius: 12px; background: #fff; }
  .sandbox:empty::before { content: 'The live ForgeFrame component will render here while the scenario runs.'; color: #9aa0aa; font-size: 13px; }
  @media (max-width: 720px) { .lab-header { align-items: flex-start; flex-direction: column; } .result { grid-template-columns: 22px 1fr; } .result-detail { grid-column: 2; } }
`;

export function renderOverview(): void {
  renderHeader();
  document.querySelector('main')!.innerHTML = `
    <p class="lab-kicker">Browser test lab</p>
    <h1 class="lab-title">Focused ForgeFrame scenarios</h1>
    <p class="lab-description">Each route runs against the real consumer and host dev servers and reports its assertions in the page.</p>
    <div class="lab-toolbar">
      <button class="run-button" id="run-all-scenarios">Run all automatic scenarios</button>
      <span class="summary" id="scenario-summary">Ready to run ${SCENARIOS.filter((scenario) => scenario.autoRun !== false).length} scenarios</span>
    </div>
    <div class="results" id="scenario-results"></div>
    <div class="sandbox" id="scenario-sandbox"></div>
    <h2 class="section-title">Individual scenarios</h2>
    <div class="scenario-grid">
      ${SCENARIOS.map((scenario) => `
        <a class="scenario-card" href="/tests/${scenario.id}">
          <strong>${scenario.title}</strong>
          <p>${scenario.description}</p>
          <span>Open scenario →</span>
        </a>
      `).join('')}
    </div>
  `;
}

export function renderScenario(scenario: ScenarioDefinition): void {
  renderHeader();
  document.querySelector('main')!.innerHTML = `
    <p class="lab-kicker">Browser scenario</p>
    <h1 class="lab-title">${scenario.title}</h1>
    <p class="lab-description">${scenario.description}</p>
    <div class="lab-toolbar">
      <button class="run-button" id="run-scenario">Run scenario</button>
      <span class="summary" id="scenario-summary">${scenario.autoRun === false ? 'Click Run scenario to allow the popup' : 'Ready'}</span>
    </div>
    <div class="results" id="scenario-results"></div>
    <div class="sandbox" id="scenario-sandbox"></div>
  `;
}

export function setRunning(running: boolean): void {
  const button = document.querySelector<HTMLButtonElement>('#run-scenario');
  if (button) {
    button.disabled = running;
    button.textContent = running ? 'Running…' : 'Run again';
  }
  const summary = document.querySelector('#scenario-summary');
  if (summary && running) summary.textContent = 'Running in Chrome…';
  if (running) document.body.dataset.testStatus = 'running';
}

export function setSuiteRunning(running: boolean, progress?: string): void {
  const button = document.querySelector<HTMLButtonElement>('#run-all-scenarios');
  if (button) {
    button.disabled = running;
    button.textContent = running ? 'Running all scenarios…' : 'Run all automatic scenarios';
  }
  const summary = document.querySelector('#scenario-summary');
  if (summary && progress) summary.textContent = progress;
  if (running) document.body.dataset.testStatus = 'running';
}

export function renderResults(results: TestResult[]): void {
  const passed = results.filter((result) => result.status === 'pass').length;
  const failed = results.length - passed;
  const summary = document.querySelector('#scenario-summary');
  const target = document.querySelector('#scenario-results');
  if (summary) summary.textContent = `${passed} passed · ${failed} failed`;
  if (target) {
    target.innerHTML = results.map((result) => `
      <div class="result ${result.status}">
        <span class="result-icon">${result.status === 'pass' ? '✓' : '×'}</span>
        <span class="result-name">${escapeHtml(result.name)}</span>
        <span class="result-detail">${escapeHtml(result.detail)}</span>
      </div>
    `).join('');
  }
  document.body.dataset.testStatus = failed === 0 ? 'passed' : 'failed';
}

export function getSandbox(): HTMLElement {
  return document.querySelector<HTMLElement>('#scenario-sandbox')!;
}

function renderHeader(): void {
  document.head.querySelector('#test-lab-styles')?.remove();
  const style = document.createElement('style');
  style.id = 'test-lab-styles';
  style.textContent = LAB_STYLES;
  document.head.appendChild(style);
  document.body.innerHTML = `
    <header class="lab-header">
      <a class="lab-brand" href="/"><span>Forge</span>Frame Test Lab</a>
      <nav class="lab-nav" aria-label="Test scenarios">
        <a href="/">Playground</a>
        <a href="/tests" class="active">Overview</a>
      </nav>
    </header>
    <main class="lab-main"></main>
  `;
}

function escapeHtml(value: string): string {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}
