---
target: main Playground; company excluded
total_score: 21
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:/Users/joshua@smilingmind.com.au/Documents/forgeframe/packages/playground/consumer/index.html"
target_fingerprint: "sha256:1c3d1255dca9a8ce4207e9f3655a31098884bc3b18f6ec809ae51cee3a3d927f"
target_path: /Users/joshua@smilingmind.com.au/Documents/forgeframe/packages/playground/consumer/index.html
timestamp: 2026-10-01T09-31-36Z
slug: packages-playground-consumer-index-html
closed: true
---
Method: dual-agent (A: /root/design_review · B: /root/evidence_review)

# ForgeFrame Playground review

Reviewed the main Playground and test routes, including representative scenario pages, on desktop and at 390×844. Company demo excluded. No UI source changes.

The main Playground has a useful, product-specific diagnostic identity worth preserving. Its largest weakness is that its compact desktop controls and layout do not hold up on narrow screens or for assistive technology. The test lab works responsively, but needs stronger result navigation and more accessible contrast.

## Design health

Scores are design judgments on a 0–4 scale, not a compliance certificate. All ten heuristics apply to these Operate surfaces.

| Heuristic | Main Playground | Test lab |
|---|---:|---:|
| System status | 2 | 3 |
| Real-world match | 3 | 3 |
| Control and freedom | 3 | 2 |
| Consistency | 2 | 3 |
| Error prevention | 2 | 3 |
| Recognition over recall | 2 | 2 |
| Efficiency | 2 | 2 |
| Minimalist design | 2 | 2 |
| Error recovery | 2 | 2 |
| Help and documentation | 1 | 2 |
| **Total** | **21/40** | **24/40** |

Both are acceptable foundations with meaningful usability work remaining. Main scores reflect mobile clipping, inconsistent keyboard state, draft/live ambiguity and limited contextual guidance. Lab scores reflect usable execution feedback but a long undifferentiated catalog, no cancellation and limited failure triage.

Technical audit: **10/20**.

| Dimension | Score | Evidence |
|---|---:|---|
| Accessibility | 2/4 | Unnamed fields, missing selected/disabled semantics, low contrast |
| Performance | 3/4 provisional | No major issue observed; no bundle or frame-rate profiling |
| Responsive design | 1/4 | Main overflows severely; test lab reflows |
| Theming | 1/4 | Diagnostic styles are mostly literal values |
| Implementation integrity | 3/4 | Coherent working examples; detector largely flags contextual choices |

Theming score describes token architecture. It is not a recommendation to add dark mode or adopt the company palette.

## What works

- Generated code, live preview and timestamped events make ForgeFrame behavior observable together. Preserve that desktop arrangement.
- Diagnostic rose selections, system typography and explicit status text fit the developer task. Keep this identity separate from the company demo.
- Test descriptions and assertion details communicate real integration contracts. The automatic overview run completed **78 passed, 0 skipped, 0 failed** across **17 automatic scenarios**. The eighteenth route requires user-initiated popup execution and was not independently tested.

## Five priorities

### 1. [P1] Make the main Playground usable at narrow widths

At a 390px viewport, the document measured **766px wide** and still used two roughly 195px columns. Header navigation, style options, preview actions and props extend offscreen.

**Impact:** Important actions require navigating clipped areas; the primary configure/render/inspect workflow loses its structure.

**Fix:** Preserve the desktop workbench. At narrow widths, stack preview and configuration first, events second, and a collapsible code view third. Wrap header/control rows, permit natural page scrolling, and enlarge touch hit areas.

**Evidence:** `packages/playground/consumer/index.html:21,27,45,113,169,249`.
**Command:** `$impeccable adapt`.

### 2. [P1] Make visual control state agree with keyboard and accessibility state

In Popup mode, the visibly disabled Embedded button still receives Tab focus and responds to Enter. Mode selections expose no pressed state. Prop inputs have visible sibling labels but no associated accessible names; repeated Set buttons lack prop context. Dynamic status and test summaries have no announcement semantics.

**Impact:** Keyboard and screen-reader users receive different information from sighted pointer users.

**Fix:** Use native disabled properties for unavailable style controls; pressed or radio semantics for selected modes; associated labels and prop-specific action names; and a concise polite status summary. Keep verbose logs separate from announcements of important transitions.

**Evidence:** `consumer/index.html:70,473,530,558`; `consumer/main.ts:42,50,63`; `consumer/props-bar.ts:125,141`; `consumer/test-lab/ui.ts:164,191,229`.
**Command:** `$impeccable harden`.

### 3. [P1] Darken the test lab’s rose text and action color

The lab’s `#e94560` produces **3.83:1 on white**, **3.47:1 on pale pink**, and **3.54:1 on its gray background**. Its 12–14px links, kicker and white button labels need 4.5:1 for WCAG AA normal text.

**Impact:** Important navigation and run actions are harder to read.

**Fix:** Add a darker rose role for text and action backgrounds while retaining the current identity. Verify hover, active and disabled treatments. The green pass symbol meets the 3:1 nontext threshold and should not be darkened solely because of this review.

**Evidence:** `consumer/test-lab/ui.ts:124,126,135,137`.
**Command:** `$impeccable colorize`.

### 4. [P2] Explain draft configuration versus the running instance

Editing props updates generated code, while Set applies a value to the live instance. Changing modes affects future render configuration without replacing the current instance.

**Impact:** A developer can mistake the generated example for an accurate description of the currently visible experiment. Parse errors also appear in the event log rather than beside the field.

**Fix:** Label draft and running configuration explicitly, show pending changes, clarify when modes take effect, and use contextual Apply actions and inline validation. Preserve detailed log evidence.

**Evidence:** `consumer/props-bar.ts:177,185,191`; `consumer/main.ts:50,63`; `consumer/renderer.ts:229,255`.
**Command:** `$impeccable clarify`.

### 5. [P2] Make the test lab easier to navigate before and after a run

Eighteen equally weighted cards require long scans. An idle 180px sandbox pushes the first mobile scenario below the fold. Suite results accumulate before the catalog, making route navigation increasingly distant. After successful cleanup, the sandbox still promises that a component “will render here.”

**Impact:** Finding a specific scenario or investigating a failure becomes slower as more evidence accumulates. The ending does not explain deliberate teardown.

**Fix:** Group scenarios by task, use compact linked rows and filtering, collapse the idle sandbox, and keep a navigable summary with failure links near the results. Give the sandbox explicit Idle/Running/Completed states and explain that temporary components were removed. Offer suite cancellation between scenarios.

**Evidence:** `consumer/test-lab/ui.ts:130,151,162,223`; `consumer/test-lab/main.ts:29,46,71`.
**Commands:** `$impeccable distill`, then `$impeccable harden`.

## Cognitive load and user journeys

Both surfaces show moderate cognitive load: three checklist failures each, chiefly ungrouped choices and limited progressive disclosure.

The main Playground rewards Render with visible feedback, but confidence drops when mode availability is inaccurate or draft changes diverge from the running experiment. The lab rewards execution with named assertions and totals, then weakens its ending with an idle-looking sandbox.

- **Experienced developer:** Useful live evidence; draft/live ambiguity and long result lists slow diagnosis.
- **Keyboard or screen-reader user:** Unnamed inputs, ambiguous repeated actions and keyboard-active “disabled” controls impede the core task.
- **First-time evaluator:** Render supplies a clear starting action; Set and next-render mode behavior need short explanations. Explain why Run-all covers 17 of 18 routes.

## Smaller observations

Main mode controls are about 29px high, runtime buttons 26px, Set about 35×23px and remove controls 21×20px. Increase coarse-pointer hit areas without unnecessarily expanding the desktop workbench.

Test Overview remains visually active on scenario pages. Use accurate current-page semantics. A copy-code affordance would improve the generated-code panel.

## Detector interpretation

One scoped CLI scan returned **39 findings: 6 primary warnings and 33 advisories**.

| Rule | Count | Main locations |
|---|---:|---|
| side-tab | 3 | `test-lab/ui.ts:142–144` |
| overused-font | 1 | `test-lab/ui.ts:118` |
| design-system-font | 2 | `test-lab/ui.ts:118,150` |
| design-system-color | 30 | `index.html`, `test-lab/ui.ts`, `test-lab/extended-scenarios.ts:76` |
| design-system-radius | 2 | `index.html:270`, `test-lab/ui.ts:141` |
| design-system-font-size | 1 | `test-lab/ui.ts:127` |

These are not 39 confirmed UX defects. Pass/fail side borders have diagnostic meaning; monospace code fonts are appropriate; company-theme comparisons conflict with the documented separate diagnostic identity. The Inter family name does not prove an Inter font file loaded.

The live overlay added rendered contrast evidence. Manual inspection found mobile and accessibility failures even where the live detector reported no anti-patterns.

## Validation boundaries

Main Render → host greeting → Close verified. Independent design inspection also exercised a host-reported error. Common-actions passed 7 assertions, timeout-recovery passed 4 and error transport passed 3. The overview suite passed 78 assertions. Test lab at 390px had no page overflow and result text wrapped correctly.

This review is local browser/source evidence. It does not establish hosted CI, deployment, popup-route acceptance, production behavior or comprehensive WCAG conformance. No performance benchmark was performed.

## Decisions for the next pass

1. Which should lead: **accessibility and mobile**, **draft/live clarity**, or **test navigation**?
2. How much should the next pass cover: **the three P1 priorities**, or **all five priorities**?

Preserve the diagnostic identity and exclude the company page. Finish any chosen fixes with `$impeccable polish`.
