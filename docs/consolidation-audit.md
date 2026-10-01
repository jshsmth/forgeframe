# ForgeFrame consolidation audit — 1 October 2026

Scope: the released v1.0.2 source at `daefabf9f446521fe6e467e0602f8f3b8825afa1`, plus all local fixes. This was a functional/product audit and consolidation patch; the security audit was explicitly excluded.

## Findings fixed in one patch

| Finding | Observable failure | Regression evidence |
| --- | --- | --- |
| Executable child schemas in bootstrap metadata | Recursive child schemas prevent parent initialization during JSON encoding. | Recursive Zod child with real parent/host handshake. |
| Destroyed host singleton reused | Public destroy followed by init returns an unusable old runtime. | Fresh initialization, prop update, host controls and stale-owner teardown. |
| Mutable enum input retained | External array mutation makes original and cloned constraints disagree. | Base, optional, nullable and default constraints remain stable. |
| Removable observers own deregistration | Removing destroy listeners retains closed factory/index entries and phantom peers. | Public listener removal, original/clone close and sibling lookup. |
| Loading completion reverses hide | An acknowledged host hide is undone by initial iframe reveal. | Real host-ready integration and browser hide-before-INIT followed by show. |
| Numeric unitless styles encoded as pixels | z-index and additional numeric declarations are rejected and line-height changes meaning. | Pure encoder, DOM application and comparison against native numeric CSS declarations in all engines. |
| CSS variable names rewritten | Case-sensitive custom properties cannot resolve. | Custom name/value preservation and browser computed color. |
| Final encoding failure retains undelivered callbacks | BigInt envelope failure fills the recovery pool and blocks valid replacement. | Both props and exports preserve old calls and admit a subsequent fresh callback. |
| Diagnostic coercion throws | Null-prototype or throwing-coercion callback errors become remote timeouts and unhandled rejections. | Props and exported calls reject immediately, then recover; safe normalization tests. |
| Consumer-only fields required on host | Shared required local definitions reject host bootstrap despite valid consumer input. | Bootstrap/update succeed, local fields stay absent and invalid consumer updates reject. |
| Cross-realm async schema detection | A promise from another realm is treated as synchronous successful output. | Explicit asynchronous rejection through direct and nested schema validation. |
| BASE64 root omission produces a wrapper | A root JSON encoder returning undefined exposes internal framing instead of omission. | Bootstrap omission, subsequent value delivery and stale-field removal. |
| Foreign-window dates rejected or corrupted | Genuine Date inputs from another window fail schemas or arrive as empty objects/strings. | Shared Date branding, public props/exports and every codec in real browsers. |
| Foreign-window dictionaries rejected | Ordinary records from another window fail record schema admission. | Realm-neutral ordinary-record detection with class rejection and browser delivery. |
| Typed handlers cannot be removed | Strict TypeScript accepts a typed subscription but rejects the same handler in `off()`. | Public event type fixtures use identical registration/removal handlers and reject incompatible explicit types. |

Other scoped improvements: shipped TSDoc examples use existing schema methods and await host readiness. DOTIFY documentation now states its existing root own-field/encoded-leaf behavior; applications needing root `toJSON()` conversion should use BASE64. Public API exports, origin checks, callback limits, wire framing and consumer commitment after transport failure remain intact.

## Review coverage

The source pass covered public exports/types and documentation, schema builders/defaults/composites, normalization/aliases/output validation, all codecs, factory/registry/index ownership, consumer and host lifecycle/props/transport, nested components and siblings, messenger/protocol/function bridges, iframe/popup/templates, React lifecycle/prop synchronization, events and supporting browser/window/URL/dimension/promise/cleanup utilities. Package scripts and installed-package contracts were checked as well.

Independent read-only lenses used `review-pr-regressions` for correctness and `stress-test-code-changes` for interaction/failure paths. Candidates were checked against public contracts and reproduced before acceptance. After the initial repairs, fresh reviewers inspected the combined runtime patch and reported no high-confidence introduced findings. An additional cancellation/reinitialization probe verified an old pending host cannot clear its replacement. The final residual pass identified foreign-window Date/record handling and typed event removal; numeric CSS coverage was extended against native declarations in all engines. Final independent reviews caught an omitted array guard in the new record predicate; it was restored, with rejection and DOTIFY array-preservation regressions. Both final review lenses have no remaining high-confidence findings in their assigned scope.

## Validation and release boundaries

- Final `npm run release:check`: passed; 65 files / 1,141 tests, strict source and fixture type checks, lint, library/playground builds, declarations and installed-package/README checks.
- Final coverage: 97.55% statements, 93.73% branches, 97.99% functions, 97.87% lines. Thresholds unchanged.
- Extended `npm run test:browser`: passed; 174 tests across Chromium, Firefox and WebKit. After restoring the final array guard, the 12 affected realm/CSS browser cases were rerun and passed against the final runtime. The full browser pass remains valid for unaffected paths; the final release check covers array rejection and codec preservation regressions.
- New failures were reproduced before their bounded fixes; the remaining existing regression and recovery suites pass.

At audit completion, these were local results: hosted CI had not run, and the patch was uncommitted, unpushed and unpublished. Package metadata remains 1.0.2; releasing these fixes requires a new package version. Automated WebKit coverage does not establish physical Safari/device acceptance. The deep security audit remains deferred; the standard dependency check in `release:check` is not a substitute for it. No finite audit establishes that every possible bug has been found.
