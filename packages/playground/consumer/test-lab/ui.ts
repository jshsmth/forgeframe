import { requireValue } from "../../require-value";
import type { ScenarioDefinition, TestResult } from "./types";

export const SCENARIOS: ScenarioDefinition[] = [
	{
		id: "lifecycle",
		title: "Lifecycle and re-entry",
		description:
			"Concurrent render, lifecycle callback re-entry, prop guards, and cleanup.",
	},
	{
		id: "security",
		title: "URL and iframe security",
		description:
			"Protocol restrictions, domain policy, reserved attributes, and allowed rendering.",
	},
	{
		id: "bridge",
		title: "Function bridge",
		description:
			"Consumer callbacks, callable host exports, return values, and Date transport.",
	},
	{
		id: "props",
		title: "Props and delivery policy",
		description:
			"Query confidentiality rules and live postMessage prop synchronization.",
	},
	{
		id: "controls",
		title: "Consumer controls",
		description:
			"Resize, hide, show, focus, lifecycle events, and deterministic cleanup.",
	},
	{
		id: "nested",
		title: "Nested components",
		description:
			"Host-side child registration, two-level rendering, and nested exports.",
	},
	{
		id: "errors",
		title: "Error transport",
		description:
			"Host-reported errors, thrown remote functions, and stack-trace privacy.",
	},
	{
		id: "configuration",
		title: "Configuration surface",
		description:
			"Dynamic URL and dimensions, schemas, eligibility, validation, attributes, styles, and templates.",
	},
	{
		id: "instances",
		title: "Instances and peers",
		description:
			"Clone snapshots, active-instance tracking, peer discovery, and destroy-by-tag cleanup.",
	},
	{
		id: "host-controls",
		title: "Host-initiated controls",
		description:
			"The embedded host resizes, focuses, hides, shows, and closes its consumer-owned frame.",
	},
	{
		id: "transport",
		title: "POST and trust policy",
		description:
			"POST body bootstrap plus trusted-domain and private-prop delivery boundaries.",
	},
	{
		id: "reliability",
		title: "Reliability and isolation",
		description:
			"Single URL resolution, teardown recovery, concurrent instances, prop isolation, and cleanup.",
	},
	{
		id: "common-actions",
		title: "Common actions",
		description:
			"Render, ready exports, prop updates, remote methods, callbacks, controls, and close in one everyday journey.",
	},
	{
		id: "redirect",
		title: "Redirect journey",
		description:
			"A frame changes to a second allowed origin before INIT, then completes props, exports, and callbacks.",
	},
	{
		id: "timeout-recovery",
		title: "Timeout and recovery",
		description:
			"A delayed host times out and cleans up before a fresh component renders successfully.",
	},
	{
		id: "stress",
		title: "Twenty-instance stress journey",
		description:
			"Twenty render, update, remote-call, and destroy cycles finish without leaked frames or instances.",
	},
	{
		id: "popup",
		title: "Popup end to end",
		description:
			"A user-initiated popup opens, handshakes, exports data, focuses, resizes, and closes.",
		autoRun: false,
	},
	{
		id: "checkout-e2e",
		title: "Customer checkout journey",
		description:
			"A realistic render, ready, prop update, remote submit, callback, receipt, and teardown journey.",
	},
];

const SCENARIO_GROUPS = [
	{
		title: "Everyday journeys",
		ids: ["common-actions", "checkout-e2e", "redirect", "popup"],
	},
	{
		title: "Configuration and security",
		ids: ["configuration", "security", "props", "transport"],
	},
	{ title: "Communication", ids: ["bridge", "nested", "instances", "errors"] },
	{
		title: "Lifecycle and reliability",
		ids: [
			"lifecycle",
			"controls",
			"host-controls",
			"reliability",
			"timeout-recovery",
			"stress",
		],
	},
];

let latestResults: TestResult[] = [];
let executionRunning = false;
let failuresOnly = false;

const LAB_STYLES = `
  .lab-header, .lab-main { --lab-accent: #c52d49; --lab-ink: #25262b; --lab-muted: #555d69; --lab-line: #dce0e5; --lab-surface: #f5f6f8; --lab-error: #a82030; }
  body { min-height: 100dvh; height: auto; margin: 0; background: #f5f6f8; color: #25262b; font-family: system-ui, -apple-system, sans-serif; }
  .lab-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 14px 24px; background: #fff; border-bottom: 1px solid var(--lab-line); }
  .lab-brand { color: var(--lab-ink); font-size: 20px; font-weight: 650; text-decoration: none; }
  .lab-brand span { color: var(--lab-accent); }
  .lab-nav { display: flex; flex-wrap: wrap; gap: 8px; }
  .lab-nav a { display: inline-flex; align-items: center; min-height: 44px; padding: 8px 12px; border-radius: 6px; color: var(--lab-muted); font-size: 13px; font-weight: 600; text-decoration: none; }
  .lab-nav a:hover, .lab-nav a[aria-current] { color: var(--lab-accent); background: #fff0f3; }
  .lab-main { width: min(1360px, calc(100% - 40px)); margin: 24px auto; }
  .lab-title { margin: 0; font-size: 28px; line-height: 1.25; }
  .lab-description { max-width: 72ch; margin: 8px 0 24px; color: var(--lab-muted); font-size: 14px; line-height: 1.6; }
  .lab-layout { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); gap: 28px; align-items: start; }
  .scenario-catalog, .suite-workspace { min-width: 0; }
  .section-title { margin: 0 0 12px; font-size: 18px; }
  .catalog-search { display: grid; gap: 6px; margin: 0 0 16px; font-size: 13px; font-weight: 600; }
  .catalog-search input { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--lab-line); border-radius: 6px; color: var(--lab-ink); background: #fff; font: inherit; caret-color: var(--lab-accent); }
  .scenario-group { margin: 20px 0; }
  .scenario-group h3 { margin: 0 0 6px; font-size: 13px; color: var(--lab-muted); }
  .scenario-grid { display: grid; }
  .scenario-card { display: block; min-height: 44px; padding: 12px 0; border-bottom: 1px solid var(--lab-line); color: inherit; text-decoration: none; }
  .scenario-card strong { display: block; color: var(--lab-accent); font-size: 14px; }
  .scenario-card p { margin: 5px 0 0; color: var(--lab-muted); font-size: 12px; line-height: 1.5; }
  .scenario-card:hover strong { text-decoration: underline; text-underline-offset: 3px; }
  .scenario-card[aria-current] { background: #fff0f3; padding: 12px 8px; border-radius: 6px; }
  .scenario-note { display: inline-block; margin-top: 5px; font-size: 12px; color: var(--lab-muted); }
  .lab-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
  .run-button, .lab-button { min-height: 44px; border: 1px solid var(--lab-line); border-radius: 6px; padding: 10px 14px; background: #fff; color: var(--lab-ink); cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; }
  .run-button { border-color: var(--lab-accent); background: var(--lab-accent); color: #fff; }
  .run-button:hover { background: #a8203a; }
  .lab-button:hover { background: var(--lab-surface); }
  .lab-button[aria-pressed='true'] { color: var(--lab-accent); background: #fff0f3; border-color: var(--lab-accent); }
  .lab-main button:disabled { cursor: not-allowed; opacity: .6; }
  .summary { display: block; margin: 0 0 8px; color: var(--lab-ink); font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .suite-summary { position: sticky; top: 0; z-index: 1; padding: 16px; background: #fff; border: 1px solid var(--lab-line); border-radius: 6px; }
  .run-help, .suite-progress, .sandbox-state { margin: 8px 0; max-width: 72ch; color: var(--lab-muted); font-size: 12px; line-height: 1.5; }
  .result-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 20px 0 12px; }
  .result-toolbar h2 { flex: 1; margin: 0; font-size: 18px; }
  .results { display: grid; gap: 8px; max-height: min(65dvh, 640px); overflow: auto; padding: 3px; scrollbar-color: #888 var(--lab-surface); }
  .result { display: grid; grid-template-columns: 48px minmax(130px, .8fr) minmax(0, 1fr); gap: 10px; align-items: start; padding: 12px; border: 1px solid var(--lab-line); border-radius: 6px; background: #fff; }
  .result-icon { font-size: 11px; font-weight: 700; padding: 3px 0; }
  .result.pass .result-icon { color: #246b3c; }
  .result.skip .result-icon { color: #795015; }
  .result.fail { border-color: var(--lab-error); }
  .result.fail .result-icon { color: var(--lab-error); }
  .result-name { font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
  .result-detail { color: var(--lab-muted); font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .result-link { display: inline-flex; align-items: center; min-height: 44px; margin-top: 4px; color: var(--lab-accent); font-family: system-ui, sans-serif; }
  .failure-nav { margin: 8px 0; padding-left: 20px; font-size: 13px; line-height: 1.6; }
  .failure-nav a { color: var(--lab-accent); display: inline-flex; align-items: center; min-height: 44px; }
  .results-empty { margin: 12px 0; color: var(--lab-muted); font-size: 13px; line-height: 1.5; }
  .sandbox-panel { margin: 12px 0; border: 1px solid var(--lab-line); border-radius: 6px; background: #fff; }
  .sandbox-panel summary { min-height: 44px; padding: 12px; cursor: pointer; font-size: 13px; }
  .sandbox { min-height: 180px; padding: 12px; }
  .lab-main [hidden] { display: none !important; }
  .lab-main :is(button, input, a, summary, [tabindex]):focus-visible, .lab-header a:focus-visible { outline: 2px solid var(--lab-accent); outline-offset: 3px; }
  .lab-main ::selection { background: #fbe4e9; color: var(--lab-ink); }
  .lab-main a { text-underline-offset: 3px; }
  .scenario-jump { display: inline-flex; align-items: center; min-height: 44px; padding: 8px; color: var(--lab-accent); font-size: 13px; }
  @media (max-width: 900px) { .lab-layout { grid-template-columns: minmax(0, 1fr); gap: 24px; } .suite-workspace { order: -1; } .suite-summary { position: static; } .results { max-height: 440px; } }
  @media (max-width: 560px) { .lab-header { padding: 12px 16px; } .lab-main { width: calc(100% - 32px); margin: 20px auto; } .lab-title { font-size: 24px; } .result { grid-template-columns: 48px minmax(0, 1fr); } .result-detail { grid-column: 2; } .run-button { flex: 1 1 190px; } .suite-summary { padding: 12px; } }
`;

function renderCatalog(currentId?: string): string {
	return `<section class="scenario-catalog" aria-labelledby="catalog-title">
      <h2 class="section-title" id="catalog-title">Individual scenarios</h2>
      <label class="catalog-search" for="scenario-search">Find a scenario<input type="search" id="scenario-search" placeholder="Search names or descriptions"></label>
      <p class="results-empty" id="catalog-empty" hidden>No matching scenarios. Clear the search to see all routes.</p>
      ${SCENARIO_GROUPS.map(
				(group) =>
					`<section class="scenario-group"><h3>${group.title}</h3><div class="scenario-grid">${group.ids
						.map((id) => {
							const scenario = requireValue(
								SCENARIOS.find((entry) => entry.id === id),
							);
							return `<a class="scenario-card" href="/tests/${scenario.id}" ${currentId === id ? 'aria-current="page"' : ""}><strong>${scenario.title}</strong><p>${scenario.description}</p>${scenario.autoRun === false ? '<span class="scenario-note">Manual · requires a popup click</span>' : ""}</a>`;
						})
						.join("")}</div></section>`,
			).join("")}
    </section>`;
}

function renderEvidencePanel(): string {
	return `<p class="sandbox-state" id="sandbox-state">Idle · no temporary component is mounted.</p>
    <details class="sandbox-panel" id="sandbox-panel" hidden><summary>Live component</summary><div class="sandbox" id="scenario-sandbox"></div></details>
    <div class="result-toolbar"><h2 id="results-title">Assertion results</h2><button class="lab-button" id="all-results" aria-pressed="true">All results</button><button class="lab-button" id="failed-results" aria-pressed="false">Failures only</button></div>
    <div class="results" id="scenario-results" tabindex="0" aria-labelledby="results-title"></div>
    <p class="results-empty" id="results-empty">Run a scenario to see its assertions here.</p>`;
}

export function renderOverview(): void {
	renderHeader(true);
	requireValue(document.querySelector("main")).innerHTML = `
    <h1 class="lab-title">ForgeFrame browser scenarios</h1>
    <p class="lab-description">Run the suite or choose a focused route. Each scenario uses the real consumer and host and reports its assertions here.</p>
    <div class="lab-layout">${renderCatalog()}<section class="suite-workspace" aria-label="Automatic suite">
      <div class="suite-summary"><div class="lab-toolbar"><button class="run-button" id="run-all-scenarios">Run all automatic scenarios</button><button class="lab-button" id="stop-suite" hidden>Stop after this scenario</button><a class="scenario-jump" href="#catalog-title">Find a scenario</a></div>
      <span class="summary" id="scenario-summary" role="status" aria-live="polite" aria-atomic="true">Ready to run ${SCENARIOS.filter((scenario) => scenario.autoRun !== false).length} scenarios</span>
      <p class="run-help">The popup route runs separately: open it and click Run scenario to allow its window.</p><p class="suite-progress" id="suite-progress"></p><ul class="failure-nav" id="failure-nav" hidden></ul></div>
      ${renderEvidencePanel()}</section></div>`;
	bindReviewControls();
}

export function renderScenario(scenario: ScenarioDefinition): void {
	renderHeader(false);
	requireValue(document.querySelector("main")).innerHTML = `
    <h1 class="lab-title">${scenario.title}</h1><p class="lab-description">${scenario.description}</p>
    <div class="lab-layout">${renderCatalog(scenario.id)}<section class="suite-workspace" aria-label="Scenario execution">
      <div class="suite-summary"><div class="lab-toolbar"><button class="run-button" id="run-scenario">Run scenario</button></div>
      <span class="summary" id="scenario-summary" role="status" aria-live="polite" aria-atomic="true">${scenario.autoRun === false ? "Click Run scenario to allow the popup" : "Ready"}</span><p class="suite-progress" id="suite-progress"></p><ul class="failure-nav" id="failure-nav" hidden></ul></div>
      ${renderEvidencePanel()}</section></div>`;
	bindReviewControls();
}

function bindReviewControls(): void {
	latestResults = [];
	executionRunning = false;
	failuresOnly = false;
	document
		.querySelector<HTMLInputElement>("#scenario-search")
		?.addEventListener("input", (event) => {
			const query = (event.currentTarget as HTMLInputElement).value
				.trim()
				.toLowerCase();
			let visible = 0;
			for (const link of document.querySelectorAll<HTMLAnchorElement>(
				".scenario-card",
			)) {
				link.hidden = !link.textContent?.toLowerCase().includes(query);
				if (!link.hidden) visible += 1;
			}
			for (const group of document.querySelectorAll<HTMLElement>(
				".scenario-group",
			))
				group.hidden = !group.querySelector(".scenario-card:not([hidden])");
			requireValue(
				document.querySelector<HTMLElement>("#catalog-empty"),
			).hidden = visible > 0;
		});
	for (const [id, filter] of [
		["all-results", false],
		["failed-results", true],
	] as const) {
		document.getElementById(id)?.addEventListener("click", () => {
			failuresOnly = filter;
			updateResultsView();
		});
	}
}

export function setSandboxState(
	state: "idle" | "running" | "completed" | "stopped",
): void {
	const panel = requireValue(
		document.querySelector<HTMLDetailsElement>("#sandbox-panel"),
	);
	panel.hidden = state !== "running";
	if (state === "running") panel.open = true;
	const messages = {
		idle: "Idle · no temporary component is mounted.",
		running: "Running · temporary components appear here during assertions.",
		completed: "Completed · temporary components removed.",
		stopped: "Stopped between scenarios · temporary components removed.",
	};
	requireValue(document.querySelector("#sandbox-state")).textContent =
		messages[state];
}

export function setRunning(running: boolean): void {
	executionRunning = running;
	const button = requireValue(
		document.querySelector<HTMLButtonElement>("#run-scenario"),
	);
	button.disabled = running;
	button.textContent = running ? "Running…" : "Run again";
	if (running)
		requireValue(document.querySelector("#scenario-summary")).textContent =
			"Running scenario…";
	setSandboxState(running ? "running" : "completed");
	document.body.dataset.testStatus = running
		? "running"
		: latestResults.some((result) => result.status === "fail")
			? "failed"
			: "passed";
}

export function setSuiteRunning(running: boolean, progress?: string): void {
	executionRunning = running;
	const button = requireValue(
		document.querySelector<HTMLButtonElement>("#run-all-scenarios"),
	);
	button.disabled = running;
	button.textContent = running
		? "Running all scenarios…"
		: "Run all automatic scenarios";
	const stop = requireValue(
		document.querySelector<HTMLButtonElement>("#stop-suite"),
	);
	stop.hidden = !running;
	if (running) stop.disabled = false;
	if (progress) {
		requireValue(document.querySelector("#suite-progress")).textContent =
			progress;
		if (running)
			requireValue(document.querySelector("#scenario-summary")).textContent =
				progress;
	}
	setSandboxState(running ? "running" : "completed");
	document.body.dataset.testStatus = running
		? "running"
		: latestResults.some((result) => result.status === "fail")
			? "failed"
			: "passed";
}

export function renderResults(results: TestResult[]): void {
	latestResults = results;
	const passed = results.filter((result) => result.status === "pass").length;
	const skipped = results.filter((result) => result.status === "skip").length;
	const failed = results.filter((result) => result.status === "fail").length;
	requireValue(document.querySelector("#scenario-summary")).textContent =
		`${passed} passed · ${skipped} skipped · ${failed} failed`;
	const failedScenarios = [
		...new Set(
			results
				.filter((result) => result.status === "fail")
				.map((result) => result.scenarioId)
				.filter((id) => id !== undefined),
		),
	];
	const nav = requireValue(document.querySelector<HTMLElement>("#failure-nav"));
	nav.hidden = failedScenarios.length === 0;
	nav.innerHTML = failedScenarios
		.map(
			(id) =>
				`<li><a href="/tests/${id}">Investigate ${SCENARIOS.find((entry) => entry.id === id)?.title ?? id}</a></li>`,
		)
		.join("");
	document.body.dataset.testStatus = executionRunning
		? "running"
		: failed === 0
			? "passed"
			: "failed";
	updateResultsView();
}

function updateResultsView(): void {
	const visible = latestResults.filter(
		(result) => !failuresOnly || result.status === "fail",
	);
	requireValue(document.querySelector("#scenario-results")).innerHTML = visible
		.map(
			(result) => `<div class="result ${result.status}">
      <span class="result-icon">${result.status === "pass" ? "PASS" : result.status === "skip" ? "SKIP" : "FAIL"}</span><span class="result-name">${escapeHtml(result.name)}</span>
      <span class="result-detail">${escapeHtml(result.detail)}${result.status === "fail" && result.scenarioId ? `<br><a class="result-link" href="/tests/${result.scenarioId}">Open scenario and rerun</a>` : ""}</span></div>`,
		)
		.join("");
	const empty = requireValue(
		document.querySelector<HTMLElement>("#results-empty"),
	);
	empty.hidden = visible.length > 0;
	empty.textContent = failuresOnly
		? "No failed assertions in the current results."
		: "Run a scenario to see its assertions here.";
	document
		.getElementById("all-results")
		?.setAttribute("aria-pressed", String(!failuresOnly));
	document
		.getElementById("failed-results")
		?.setAttribute("aria-pressed", String(failuresOnly));
}

export function getSandbox(): HTMLElement {
	return requireValue(document.querySelector<HTMLElement>("#scenario-sandbox"));
}

function renderHeader(overview: boolean): void {
	document.head.querySelector("#test-lab-styles")?.remove();
	const style = document.createElement("style");
	style.id = "test-lab-styles";
	style.textContent = LAB_STYLES;
	document.head.appendChild(style);
	document.body.innerHTML = `<header class="lab-header"><a class="lab-brand" href="/"><span>Forge</span>Frame Test Lab</a><nav class="lab-nav" aria-label="Playground navigation"><a href="/">Playground</a><a href="/tests" ${overview ? 'aria-current="page"' : ""}>${overview ? "Overview" : "All scenarios"}</a></nav></header><main class="lab-main"></main>`;
}

function escapeHtml(value: string): string {
	const element = document.createElement("span");
	element.textContent = value;
	return element.innerHTML;
}
