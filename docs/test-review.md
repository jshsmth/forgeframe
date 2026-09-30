# ForgeFrame test review — 30 September 2026

The suite has strong coverage of messaging security, prop normalization, lifecycle cancellation, serialization, schemas, and browser navigation. The most useful additions protect behavior across layers that existing unit tests exercised with mocked collaborators. This review adds 19 Vitest cases and one browser scenario, executed in three engines, and removes 36 superseded wiring or duplicate cases. Library source and public behavior are unchanged by this review. All three follow-up items requested after the initial review are complete.

## Scope and method

Reviewed the suite inventory, test index, test titles/boundaries, runner configuration, compiler inclusion, coverage report, CI workflow, public documentation, and architecture/state ownership. Inspected assertions and fixtures around the candidate gaps, including React, host reconciliation, callback lifetime, security, schemas, and browser routing. This is a suite-wide coverage and test-quality review, not a claim that every assertion received an exhaustive independent audit.

The user confirmed these seams: `create()` and component instances; `initHost()` and `window.hostProps`; the public React wrapper; exported schemas and types. New runtime tests use those interfaces. The jsdom harness adapts browser windows and message delivery; new React tests use real React DOM, component instances, host initialization, schemas, queues, and function bridges. They do not mock package-owned collaborators.

Consulted the [Vitest guide](https://vitest.dev/guide/), [coverage guidance](https://vitest.dev/guide/coverage), [mocking guidance](https://vitest.dev/guide/mocking), and [type testing guidance](https://vitest.dev/guide/testing-types). Retained V8 coverage and the existing separate TypeScript compiler checks. Added the integration and unit suites to those compiler checks because Vitest transpilation alone had allowed stale fixture types to go unnoticed.

## Assessment across the suites

| Area | Existing evidence | Review outcome |
| --- | --- | --- |
| Component factories, registry, clones, peers | Creation guards, Node imports, cloning, indexing and teardown tests | Broad existing coverage; preserved current behavior. |
| Consumer lifecycle and queues | Render reentrancy, cancellation, validation rollback, FIFO updates, bootstrap races | Added real React render-gate and unmount cancellation checks. |
| Host lifecycle and reconciliation | Bootstrap retry, reserved controls, snapshot replacement, subscriber errors | Added host-side rejection/queued recovery and subscriber cancellation through real messaging. |
| Origin and source security | Allowlist, spoofed-source, redirect and restricted navigation tests | Added private prop filtering through bootstrap and updates; retained browser-origin checks. |
| Messenger and function bridge | Correlated responses, timeouts, channel routing, bounded registry/batch tests | Added acknowledged callback retirement in JSON/default, BASE64 and DOTIFY; added concurrent browser widgets. |
| Props, aliases and serialization | Canonical/alias precedence, reset behavior, Date framing, malformed input and nested callback tests | Strong existing coverage; added React omission behavior as observed by the host. |
| Standard Schema and builders | Primitive/composite validation, immutability, paths, Zod/Valibot compatibility | Existing positive and negative runtime/type tests cover the main public contracts. |
| React adapter | Hook harnesses and real React DOM lifecycle/error tests | Added a real React-to-host integration suite covering readiness, props, DOM/lifecycle contracts, recovery, and observer isolation. |
| Rendering, templates and browser adapters | Iframe sandbox/attributes, popup failures, sizing, loading and cleanup tests | Existing coverage spans jsdom and real engines; new unmount test verifies detached mount cleanup. |
| Browser navigation | GET/POST, base changes, redirects, reload/reconnect and bootstrap races across three engines | Added independent props, callbacks and teardown for two concurrent widgets. |
| Package and compile-time contracts | ESM/side-effect checks, release scripts, inferred inputs/outputs, aliases, remote values, JSX | Added strict compilation for every integration and unit fixture, alongside existing public type and browser checks. |

## Added behavior coverage

| File | New cases |
| --- | --- |
| `tests/integration/react-host-sync.test.ts` | Before-ready commits reach the host in FIFO order; omitted props reset defaults and remove optional values without remounting; a rejected React update preserves host state and the next valid commit succeeds; unmount cancels an unready instance and removes its iframe/ref without an error. Follow-up cases cover wrapper styles and DOM refs, filtering of wrapper-only props, latest lifecycle callbacks (including host-reported errors), equivalent-commit suppression, blocked-popup recovery, StrictMode replay, and rejected lifecycle/error observers. |
| `tests/integration/props-sync.test.ts` | A stricter host schema rejects an update without replacing either host snapshot and the next queued update succeeds; pending subscribers do not delay acknowledgement and cancelled subscribers stop receiving updates while their outstanding rejection remains handled; consumer-only and origin-restricted values remain private during bootstrap and updates. |
| `tests/integration/function-prop-bridge.test.ts` | Replaced callbacks cease to be callable after acknowledgement in all three serialization modes while the new callback works. |
| `tests/unit/prop-schema.test.ts` | String trimming happens before length/nonempty validation without mutating the original builder; literal optional/default clones preserve the accepted literal and leave the original/optional schemas independent. |
| `tests/integration/consumer-host-handshake.test.ts` | Oversized incoming bootstrap metadata cannot install a host; a subsequent valid name completes the handshake on the same iframe. |
| `tests/browser/navigation.spec.ts` | Two same-tag widgets at the same origin retain separate props/callbacks; updating or closing one leaves the other operational. |

The original public-boundary additions were checked against temporary, targeted regressions and then rerun after restoring the source. Nine probes covered the React readiness gate, omission reset, failure recovery, unmount close, host validation, callback pruning, subscriber cancellation, private delivery filtering, and channel UID admission. All probes caused the relevant new tests to fail. These are regression-sensitivity checks for existing behavior, not evidence of nine pre-existing library bugs. All temporary source edits were restored. Five follow-up probes also failed as expected when trimming, literal-clone identity, async `onError` handling, host-to-React error forwarding, or incoming metadata size admission was disabled, then passed with the restored source.

## Typechecking improvements

`tests/integration/tsconfig.json` now includes every integration test and its harness in the standard `typecheck:tests` command, including CI's existing `npm run typecheck` step. Corrected fixture record shapes, host schema input/output generics, callable window mocks, overloaded `postMessage` arguments, and explicit host-output types. Added `@types/jsdom` as a development-only dependency. No compiler strictness was disabled.

The inherited-name removal fixture now supplies explicit `undefined` values for `constructor`, `toString`, and `hasOwnProperty`, satisfying the public input types while still verifying that subsequent updates remove those own host keys. The spoofed message test uses a literal string-only wire payload instead of calling a serializer with its required bridge argument missing.

## Initial validation

| Check | Result |
| --- | --- |
| Baseline Vitest | 947 tests in 56 files passed. |
| Updated Vitest/V8 coverage | 957 tests in 57 files passed; existing coverage thresholds passed. |
| Coverage | Statements 97.04%; branches 91.70%; functions 97.63%; lines 97.40%. |
| Typecheck | Library, public type assertions, all integration fixtures, browser fixtures and playground passed. |
| Browser baseline | 111 tests passed across Chromium, Firefox and WebKit. |
| Added browser scenario | Passed in all three engines after the channel-admission probe was restored. |
| Final full browser suite | 114 tests passed across Chromium, Firefox and WebKit. |
| Lint | Final repository-wide check passed; existing warning-level diagnostics remain. |

Coverage percentages are unchanged because existing unit tests already executed these branches. The new tests strengthen the observable contracts across real layers. Local results do not establish a hosted CI result or device acceptance.

Additional edits appeared in the shared checkout during final validation: unit tests for dimensions, inherited object fields and playground text rendering, plus corresponding library/playground changes. These were preserved and are not attributed to this review. The later combined checkout passed 979 Vitest tests across 59 files, with 97.05% statement and 91.73% branch coverage, and passed the normal typecheck and final repository-wide lint check. The 957-test result above records this review's additions before the concurrent edits arrived.

## Final follow-up validation

| Check | Combined checkout result |
| --- | --- |
| Full Vitest/V8 run | 953 tests across 58 files passed, including all new cases and retained fault-injection/resource tests. |
| Coverage | Statements 97.29%; branches 92.09%; functions 98.05%; lines 97.65%. All existing thresholds passed. |
| Strict typecheck | Library, public type assertions, every unit and integration fixture, browser fixtures, and playground passed. |
| Full browser suite | 120 tests passed across Chromium, Firefox and WebKit, including the concurrent playground additions. |
| Repository lint | Passed; 73 warning-level diagnostics and four informational diagnostics remain. |
| Source restoration | The five files touched by follow-up regression probes have no diff. Existing concurrent library/playground changes were preserved. |

The test count falls because 36 superseded cases were removed; nine follow-up cases add distinct public evidence. The earlier results record earlier checkout snapshots. These are local validation results; no hosted CI, commit, push, or device acceptance is claimed.

## Completed follow-up work

1. **Strict unit fixture compilation is enforced.** The original audit's 154 diagnostics across 22 files are resolved. `tests/unit/tsconfig.json` compiles unit tests and harnesses under the library's strict/unused checks, includes Node/Vite environment declarations, and uses a no-emit root that permits the existing playground fixtures. `typecheck:tests` includes it, so the existing CI typecheck now catches unit drift. Corrected mock intersections that collapsed to `never`, explicit schema input/output types, record fixture shapes, issue-result narrowing, asynchronous schema results, required context fields, navigation origins, and obsolete API arguments. A documented `@ts-expect-error` preserves the deliberate missing-required-input runtime test; compiler strictness and coverage rules were not weakened.

2. **Implementation coupling is reduced.** Removed 36 cases after verifying their meaningful contracts through public integration:

   | Superseded tests | Count | Retained evidence |
   | --- | --- | --- |
   | Legacy React factory/hook/ref wiring file | 20 | Real wrapper factory, styles, refs, host props, lifecycle, context recovery, readiness and cleanup in `react-host-sync.test.ts`; JSX/type contracts remain. |
   | React DOM cases backed by mocked component instances | 3 | Real popup failure/recovery, StrictMode replay and observer rejection; the existing real construction-error case remains. |
   | Duplicate React lifecycle and prop-sync harness cases | 10 | Real latest callbacks, refs, FIFO readiness, omission resets and validation recovery. |
   | Host control/snapshot tests using private messenger spies or captured handlers | 3 | Real host controls in `host-controls-routing.test.ts`; snapshot reconciliation/subscription/removal in `props-sync.test.ts`. |

   Retained distinct policy/resource and deterministic fault-injection tests, including cancellation ordering, stale mount/update completions, acknowledgement failures, requested retries, origin trust, and teardown. This is a focused reduction of coupling, not a claim that every existing internal harness has been eliminated. The test index and IOSP evidence links now point to the replacement coverage.

3. **Remaining uncovered paths were assessed against supported behavior.** The audit produced four useful public additions and explicit decisions for the remaining classes of paths:

   | Candidate | Decision and evidence |
   | --- | --- |
   | String trimming and cloned literal options | Added acceptance/rejection and builder-independence checks through exported Standard Schema builders. |
   | Rejected React `onError` observer | Added a real rejected update, handled observer rejection, preserved host state, and successful next commit. |
   | Oversized incoming window-name metadata | Added public host admission/retry coverage, complementing the existing outgoing size-limit tests. |
   | Missing/blank injected build version | Leave the configuration-failure branch uncovered; version synchronization, package/build configuration and browser production builds already exercise the supported injection path. |
   | Window getters/setters throwing or pathological ancestry | Retain existing browser adapter/security tests; no new synthetic getter or 100-level traversal fixture solely for coverage. Revisit on a concrete supported browser failure. |
   | Internal registry enumeration, compatibility sync wrappers and unused codec adapters | No new private-seam tests. Public component tracking, prop queues, callbacks and Date roundtrips already exercise the supported workflows. |
   | Type-invalid declarations and defensive fallback guards | Preserve existing negative/security cases; do not invent further invalid typed calls merely to execute the remaining branch arms. |

   V8 coverage remains a discovery tool, with unchanged inclusion/exclusion rules and thresholds. The test index now records durable guidance for choosing additions by public behavior, independent expectations, and regression sensitivity.
