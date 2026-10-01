---
name: architecture
title: ForgeFrame architecture
desc: Consumer and host state ownership, transport contracts, and lifecycle flows.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-10-01T01:55:30Z
---

# ForgeFrame architecture

ForgeFrame has two runtimes: the **consumer** is the outer embedding app; the **host** is the embedded iframe or popup. The public entrypoint is `packages/forgeframe/src/index.ts`. Importing it does not initialize a browser runtime. Without browser globals, host detection returns false, `initHost()` returns null, and `getHostProps()` returns undefined. The default `ForgeFrame` object delegates to the same named exports.

## Responsibilities and state ownership

| Subsystem | Entry points | Owned state and work |
| --- | --- | --- |
| Component definitions | `core/component.ts` | Validate declarations, construct factories, track each factory's instances, and configure matching hosts. Factory host-props caches follow the active host singleton after same-page retries. The registry and instance index own their maps. |
| Consumer lifecycle | `core/consumer.ts` | Options, lifecycle flags, render task, construction-time actions, events, exports, and cleanup coordination. |
| Consumer props | `core/consumer/props-pipeline.ts` | Raw and normalized snapshots, schema-validation evidence, deferred normalization failures, and the serialized update queue. `prop-update.ts` prepares isolated patches and validation-key sets. |
| Consumer rendering | `core/consumer/renderer.ts` | Container, owned wrapper, iframe, and prerender element. `render/` implements browser effects and templates; `popup-layout.ts` calculates geometry/backoff from supplied data. |
| Consumer transport | `core/consumer/transport.ts` | Host window, opened/active/dynamic origins, bootstrap session, initialization deferred, messenger, prop function bridge, and a separate peer relay bridge. |
| Host lifecycle | `core/host/bootstrap.ts`, `core/host/component.ts` | Singleton/pending payload, host identity, consumer window and verification state, readiness, configuration, and destruction. |
| Host props | `core/host/props-runtime.ts` | Consumer snapshot, stable built-in host API, pending bootstrap props, and subscribers. |
| Host security | `core/host/security.ts` | Read browser origin evidence. `consumer-origin-policy.ts` decides trust from supplied evidence; it does not read browser globals. |
| Host transport | `core/host/transport.ts` | Initialization scheduling, session ID, outbound export queue, messenger, export bridge, and peer-call decoding bridge. |
| Messaging | `communication/messenger.ts` | Trusted matchers, pending correlated requests, message handlers, and listener lifetime. `protocol.ts` owns envelopes and encoding. |
| Function bridge | `communication/bridge.ts` | Local callable IDs, remote wrappers, capacity, and serialization batches. Recursive codecs preserve wire semantics. |
| Props and schemas | `props/normalize.ts`, `props/prop/` | Alias/materialization rules, normalization/validation/delivery policy, immutable builders, and schema issue paths. Only compiled definitions are cached. |
| React adapter | `drivers/react.ts` | Hook/ref ordering and React render state. `react/lifecycle.ts` coordinates a mounted instance; `react/prop-sync.ts` owns explicit queue operations and draining. The wrapper owns the refs. |
| Supporting operations | `window/`, `utils/`, `events/` | Window adapters and bootstrap metadata, dimensions, domain matching, wire values, promise/cleanup resources, IDs, and event subscriptions. |

## Render and verified bootstrap

Factory/index deregistration is owned by consumer teardown, independently of removable public event listeners. It occurs before destruction observers and propagates to clones. The retained public destroy listener also preserves synthetic event behavior.

Consumer close installs a shared completion promise before lifecycle callbacks run. Destruction also owns a shared completion promise, so close calls arriving during failed-render cleanup wait for deregistration and destruction notifications without repeating close events. Repeated and reentrant close requests wait for that same operation, including instance deregistration and destruction notifications, without repeating cleanup or close events.

Event dispatch snapshots subscribed handlers and their registration identities before invoking observers. New subscriptions wait for the next emission; listeners removed before their turn are skipped, including bulk removal or cancellation followed by re-registration. A once observer can rearm itself without being invoked repeatedly in the same emission.

The renderer stores explicit iframe visibility independently of initial loading concealment. Eager frames use display none during loading so custom templates do not reserve space for both the iframe and the placeholder. Lazy frames use hidden visibility while retaining layout, temporarily clearing inline display none so GET/POST navigation can begin. Prerender completion checks current visibility before revealing the iframe, so an acknowledged hide during initialization remains in force. The renderer restores configured display, visibility, opacity and transition values and CSS priorities after the loading placeholder fades. Caller-styled frames skip the default iframe reveal animation so configured concealment or opacity is never temporarily overridden; explicit controls take precedence over configured visibility. A show requested before frame creation is applied when the frame is created, including for lazy frames initially styled with display none. CSS encoding preserves case-sensitive custom property names and unitless numeric values; dimensional numeric styles remain pixels.

Nested child references contain only serializable component metadata. Executable prop definitions remain in the local component registry and never enter the parent's bootstrap response, including when a child uses a recursive third-party schema. Both reference construction and host factory resolution define child names as own enumerable data properties, preserving names such as `__proto__` without changing the dictionary prototype.

The bootstrap owner supplies the host's teardown callback. Public host destruction releases the singleton and window accessor, while owner-initiated cleanup clears the singleton before destroying its resources. This preserves idempotence and allows a later initialization to use retained channel metadata without returning a destroyed host.

1. `create()` validates the declaration and registers a factory. Calling the factory constructs and tracks a consumer instance; defining a matching component inside a host also configures host initialization.
2. `render()` installs its render task before user callbacks can re-enter and captures the settled tail of previously admitted prop work. `performRender()` drains that work if present, rechecks cancellation, validates props and eligibility, and pins an absolute URL resolved against `document.baseURI` inside the URL-trust guard. It then resolves the container and sequences prerender/open/handshake/display stages. Newly requested updates remain rejected while rendering.
3. `emitRenderStage()` checks cancellation after the event and after its prop callback. Resource creation and user templates also keep cancellation checks before advancing.
4. The renderer creates an iframe or opens a popup using the pinned URL. Origin checks and query/POST delivery policy use the same destination even if a template, lifecycle callback, or converter changes the document base. Query props are appended before fragments without rewriting existing query bytes. POST navigation uses a hidden form whose methods are invoked through the mount document's form prototype, so named fields cannot shadow submission, append, or cleanup; popup creation remains synchronous in the opening workflow.
5. Protocol 2 `window.name` contains channel metadata. Consuming it strips props and children while retaining reconnect identity. A new host document creates a new session and requests current props through messaging.
6. Consumer control handlers verify the opened window and configured origin policy before accepting bootstrap or INIT. Bootstrap waits behind pending prop work, filters against the browser-reported host origin, serializes current callbacks, and resets remote exports for reconnection.
7. The host validates incoming props, finishes readiness, and sends INIT with its session. Configuration supplied from a bootstrap observer validates the already committed incoming snapshot; readiness rechecks destruction after observers before completing. The consumer accepts the matching session and completes loading before rendered/display callbacks. Iframes keep their prerender swap animations; popups remove transient loading content and the default wrapper, restoring the original mount. Custom container shells remain until normal teardown.

Legacy payload behaviour remains distinct. Do not relax its origin verification or allow it to bypass the current consumer's bootstrap requirement. `initHost()` preserves same-page retry after failed asynchronous validation.

## Props update pipeline

`updateProps()` → serialized queue → alias materialization → isolated patch/reset merge → schema conversion → custom normalization → output-contract checks → custom validation → URL/origin checks → snapshot commitment → optional host synchronization → prop notifications.

- `PROP_RESET` removes a supplied key; explicit `undefined` remains an own value. Unchanged validation evidence is retained; changed keys lose their previous evidence.
- Supplied canonical keys and aliases are selected from own properties. Host validation treats omitted inherited names as missing, and reconciliation removes stale custom keys using own membership in the new snapshot. String URL schemas parse absolute HTTP(S) URLs without rewriting their output and retain the constraint alongside patterns. Built-in number schemas admit only finite numbers, preserving their type through JSON transport.
- Shaped object schemas also select only own fields; omitted nested fields reach presence validation as `undefined`, including names inherited from `Object.prototype`.
- Explicitly undefined prop-definition entries are omitted before merging built-ins, retaining their defaults and delivery policies. They also remain absent from the custom-normalization deferral decision.
- Declaration admission applies that same omission policy to reserved names; real definitions of host controls remain rejected.
- Callback schema defaults use factories returning callbacks; function-default results are checked without invoking the returned callback. Optional/nullable presence is preserved, and non-function default evaluation remains unchanged. Normalization preserves definition order for defaults/decorators. Schema inputs become outputs before output-typed custom validators execute. Output schemas must validate normalized values unchanged. Unsupported asynchronous schema results are observed without awaiting them, preserving synchronous refusal while preventing unhandled rejections from validation, default, output, and nested-schema probes.
- Deliverable normalized arrays reject undefined entries and sparse holes before render resources or update commitment. Delivery policy is applied first, preserving local-only values. Host decorators and custom JSON encoders retain their invocation order; their resulting arrays are checked during delivery. Bridge and JSON-replacer guards also prevent undefined array entries in exports and encoded prop branches from silently becoming null. Item defaults normalize before these checks; standalone optional schemas are unchanged.
- Custom query/body converters retain their prop-definition method receiver. Scalar parameter encoding is a separate data operation.
- Candidate preparation does not replace the current snapshot. Validation/origin failures leave the previous snapshot intact. Commitment occurs before host synchronization, matching the existing behaviour; a transport failure does not roll back the committed consumer state.
- Queue entries are installed before decorators or validators can re-enter, including before a host is connected. The first update starts synchronously; subsequent entries run in FIFO order, with failures allowing later entries to continue. Host bootstrap and updates share the queue, preventing bridge batches from overlapping.
- On the host, deserialize/validate/filter precede reconciliation. Stale custom keys are removed; built-ins remain protected. Subscriber registrations are snapshotted after commitment and before the props event. New or re-registered observers wait for the next update, while cancelled registrations are skipped. Cancellation handles capture their registration token, so stale handles cannot remove a later registration of the same callback. Async failures are caught without awaiting subscriber work or delaying acknowledgement. A newer acknowledged update arriving during bootstrap takes precedence over the older bootstrap snapshot.

The host discards fields with explicit consumer-only (`sendToHost: false`) definitions before decoding legacy/bootstrap or update snapshots, including values sent by stale consumers. They never enter host state or notifications; host validation excludes their definitions while consumer validation still requires their inputs. Undeclared fields retain their existing delivery behavior. Synchronous schema admission recognizes promises across realms, including inside composite schemas, default probes, and normalized-output checks. BASE64 root encoders returning undefined omit their prop; DOTIFY retains its own-field root traversal and JSON-encoded leaf behavior.

Late host configuration filters the current consumer snapshot against the proposed definitions, validates retained values when initialized, and then removes stale custom host keys and commits both snapshots. Rejected validation leaves the prior definitions and state intact. Built-in controls and retained callbacks preserve identity; unchanged snapshots retain their reference, and configuration does not notify subscribers or emit a props event. A pending bootstrap still selects the latest acknowledged wire snapshot and filters it with the current definitions before commitment, preventing removed fields from returning.

After readiness completes, a rejected public `initHost()` schema replacement preserves the active runtime, controls, subscribers and previous domain configuration. Initial configuration failures and consumer-domain rejection retain their teardown behavior. Validation failure cleanup uses the configured runtime identity, preserving the original error and any replacement created by reentrant validation. Successful validation also rechecks that identity: if the configured host was destroyed or replaced, the outer call returns null without applying domain configuration or flushing the replacement.

Neutral realm-value helpers recognize genuine Date internal branding and ordinary object prototypes across browser windows. Schemas, output comparisons, array admission and recursive codecs share that recognition. Class instances remain distinct from ordinary records, and invalid Date transport framing remains unchanged. Event handler removal carries the same generic data contract as registration, without changing listener identity or dispatch semantics.

JSON leaf encoding observes native property reads through serialization-local proxies returned after each replacer call. Date framing uses the captured source value and the encoder's existing result, avoiding a second getter read or Date encoder invocation. Encoders retain their original receiver and native conversion order; boxed primitives retain native unboxing.

Bridge array encoding captures indexed entries once during presence admission, independently of the array's prototype or overridden methods. Encoding uses that admitted snapshot, so getters cannot introduce unchecked undefined entries on a second read. Object schema shapes, tuple item arrays, and union branch arrays are shallow snapshots of their definitions; later caller mutations cannot alter an established schema or its presence clones.

## Messages and remote callbacks

Admission rejects self/untrusted traffic before decoding, then checks channel identity and a usable event source. Responses additionally match the pending request's target window and expected origin. Requests receive browser-verified source metadata, rather than claimed envelope metadata.

The request integration executes the handler, builds a response, and posts it. Serialization failures retain the serializable error response. Timeouts and teardown retain their rejection semantics.

Messenger requests encode the full envelope before allocating a pending request and signal the delivery attempt immediately before posting. Prop/export batches abort newly registered callbacks when encoding fails before that boundary, and conservatively retain them after an attempted post. Unknown thrown values are normalized without allowing diagnostic coercion to throw, so callback errors always reach the response path.

The bridge gives local functions stable IDs while retained and caches remote wrappers by ID/window/origin. Remote cache eviction remains bounded at 500 entries; local callable references are never evicted to admit another callback. Peer exports are serialized through a separate `PEER_CALL` relay bridge with the same source checks and bounded capacity. Held peer snapshots survive prop batches and repeated discovery; replacement exports still retire their original source functions. Reconnection clears old requester relay identities, and teardown clears both bridges. Each prop/export snapshot admits at most 500 distinct functions. New registrations are staged and callable during delivery; an acknowledged batch removes stale references, while bootstrap retains its existing serialization completion boundary. Pre-delivery serialization failures roll back only new registrations. Delivery failures conservatively retain previous and possibly delivered references in a pool capped at 1,000, rejecting additional registrations until an acknowledged retry using retained callbacks or a new session frees capacity. The verified new-session reset occurs inside queued bootstrap serialization after earlier updates settle. It releases callable registrations while keeping weak IDs, so callbacks already acknowledged by the new host retain their identities when re-registered; teardown clears both registrations and weak IDs. Peer discovery uses append transactions with a cumulative 500-reference bound; failed serialization rolls back additions without retiring held peer snapshots. Codec guards require the complete own-property shape of transport wrappers. Encoding escapes ordinary marker-shaped records (including the escaped-record marker itself). JSON-encoded leaves are converted once with native JSON semantics, then their final shapes are escaped. DOTIFY also escapes assembled object branches after leaf conversion, omits JSON-undefined leaves, and preserves branches emptied by omission; codec-generated function and Date markers retain their identities, and decoding restores their fields without interpreting the record as a function, Date, or encoded prop. Recursive serialization retains Date framing, cycle handling, unsafe-key filtering, and JSON/BASE64/DOTIFY behaviour. BASE64 and DOTIFY encode nested functions through the same bridge registry while retaining JSON `toJSON()` behavior; decoding reconstructs function references and Date wrappers together. These encoding callbacks participate in the transport-owned serialization batch.

## React commit flow

The hook wrapper updates callback refs, mounts an instance for the current context, observes committed props, and forwards the container ref in the existing effect order.

Each mounted instance has isolated sync state. Commits produce shallow snapshots and reset omitted previously known keys. An equivalent pending commit requests one retry on failure; successful acknowledgements advance FIFO state. Draining waits for render readiness and checks current instance identity around every await. Failed or obsolete work cannot update a new mount's refs or queue. Cleanup deactivates the queue before closing and unsubscribing.

## IOSP maintenance

Enum construction snapshots the supplied values array so its diagnostics, membership set, and presence/default clones retain the same constraints after caller mutations.

Popup sizing converts numbers, numeric strings, and `px` strings to pixels. Nonpixel CSS units use 500-pixel opening fallbacks or the current window size during resize; iframe CSS sizing preserves those units. Playground host displays and consumer logs construct dynamic content with DOM text properties, keeping peer-controlled strings out of HTML parsing while retaining static layouts and controls.

Operations implement cohesive policy, transformations, state transitions, or browser actions. Integrations sequence package-owned behaviour. Calls to browser/runtime/schema APIs do not by themselves require extraction. Retain cohesive recursive algorithms and short local adapters; avoid an interface or wrapper without a useful responsibility.

Pure policy should depend on supplied observations and neutral types/helpers. Browser reads and resource effects belong in browser operations or their coordinating runtime. Internal helpers stay inside the owning subsystem and are not added to root exports. Exported schema classes retain their existing members; use module-level helpers for decomposition.

See [the callable reference](iosp-review.md) and [the test index](../packages/forgeframe/tests/README.md) for entrypoints and boundary tests. Public contracts remain in the root README and typecheck suites.
