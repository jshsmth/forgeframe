---
name: architecture
title: ForgeFrame architecture
desc: Consumer and host state ownership, transport contracts, and lifecycle flows.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-10-23T22:54:56Z
---

# ForgeFrame architecture

ForgeFrame has two runtimes: the **consumer** is the outer embedding app, and the **host** is the embedded iframe or popup. The public entrypoint is `packages/forgeframe/src/index.ts`; the default `ForgeFrame` object delegates to the same named exports. Importing the entrypoint does not start a browser runtime. Without browser globals, host detection returns false, `initHost()` returns null, and `getHostProps()` returns undefined.

## Responsibilities and state ownership

Paths are relative to `packages/forgeframe/src`.

| Subsystem | Entry points | Owned state and work |
| --- | --- | --- |
| Component definitions | `core/component.ts` | Validates declarations, constructs factories, tracks each factory's instances, and configures matching hosts. Factory host-props caches follow the active host singleton after same-page retries. The registry and instance index own their maps. |
| Consumer lifecycle | `core/consumer.ts` | Options, lifecycle flags, render task, construction-time actions, events, exports, and cleanup coordination. |
| Consumer props | `core/consumer/props-pipeline.ts` | Raw and normalized snapshots, schema-validation evidence, deferred normalization failures, and the serialized update queue. `prop-update.ts` prepares isolated patches and validation-key sets. |
| Consumer rendering | `core/consumer/renderer.ts` | Container, owned wrapper, iframe, and prerender element. `render/` implements browser effects and templates; `popup-layout.ts` calculates geometry and polling backoff from supplied data. |
| Consumer transport | `core/consumer/transport.ts` | Host window, opened/active/dynamic origins, bootstrap session, initialization deferred, messenger, prop function bridge, and a separate peer relay bridge. |
| Host lifecycle | `core/host/bootstrap.ts`, `core/host/component.ts` | Singleton and pending payload, host identity, consumer window and verification state, readiness, configuration, and destruction. |
| Host props | `core/host/props-runtime.ts` | Consumer snapshot, stable built-in host API, pending bootstrap props, and subscribers. |
| Host security | `core/host/security.ts` | Reads browser origin evidence. `consumer-origin-policy.ts` decides trust from that evidence and reads no browser globals. |
| Host transport | `core/host/transport.ts` | Initialization scheduling, session ID, outbound export queue, messenger, export bridge, and peer-call decoding bridge. |
| Messaging | `communication/messenger.ts` | Trusted matchers, pending correlated requests, message handlers, and listener lifetime. `protocol.ts` owns envelopes and encoding. |
| Function bridge | `communication/bridge.ts` | Local callable IDs, remote wrappers, capacity, and serialization batches. Recursive codecs define the wire semantics. |
| Props and schemas | `props/normalize.ts`, `props/prop/` | Alias materialization, normalization/validation/delivery policy, immutable builders, and schema issue paths. Only compiled definitions are cached. |
| React adapter | `drivers/react.ts` | Hook and ref ordering and React render state. `react/lifecycle.ts` coordinates a mounted instance; `react/prop-sync.ts` owns queue operations and draining. The wrapper owns the refs. |
| Supporting operations | `window/`, `utils/`, `events/` | Window adapters and bootstrap metadata, dimensions, domain matching, wire values, promise and cleanup resources, IDs, and event subscriptions. |

## Render and verified bootstrap

1. `create()` validates the declaration and registers a factory. Calling the factory constructs and tracks a consumer instance. Defining a matching component inside a host also configures host initialization.
2. `render()` installs its render task before user callbacks can re-enter and captures the settled tail of already admitted prop work. `performRender()` drains that work, rechecks cancellation, validates props and eligibility, and pins an absolute URL resolved against `document.baseURI` inside the URL-trust guard. It then resolves the container and sequences the prerender, open, handshake, and display stages. Prop updates requested during rendering are rejected.
3. `emitRenderStage()` checks cancellation after the event and after its prop callback. Resource creation and user templates also check cancellation before advancing.
4. The renderer creates an iframe or opens a popup at the pinned URL. Origin checks and query/POST delivery policy use the same destination even if a template, lifecycle callback, or converter changes the document base. Query props are appended before any fragment without rewriting existing query bytes. POST navigation uses a hidden form whose methods are called through the mount document's form prototype, so named fields cannot shadow submission, append, or cleanup. Popup creation is synchronous within the opening workflow.
5. Protocol 2 `window.name` carries channel metadata. Consuming it strips props and children and keeps the reconnect identity. Each new host document creates a new session and requests current props through messaging.
6. Consumer control handlers verify the opened window and configured origin policy before accepting bootstrap or INIT. Bootstrap waits behind pending prop work, filters props against the browser-reported host origin, serializes current callbacks, and resets remote exports for reconnection.
7. The host validates incoming props, finishes readiness, and sends INIT with its session. Configuration supplied from a bootstrap observer validates the already committed incoming snapshot; readiness rechecks destruction after observers before completing. The consumer accepts the matching session and completes loading before the rendered and display callbacks. Iframes keep their prerender swap animation. Popups remove transient loading content and the default wrapper and restore the original mount; custom container shells stay until normal teardown.

### Bootstrap details

- **Nested children.** Child references carry only serializable component metadata. Executable prop definitions stay in the local component registry and never enter the parent's bootstrap response, even when a child uses a recursive third-party schema. Reference construction and host factory resolution define child names as own enumerable data properties, so names such as `__proto__` work without changing the dictionary prototype.
- **Legacy payloads.** Pre-v1 consumers carry props in `window.name`, and hosts read them through a separate path. Successful synchronous prop validation marks a legacy bootstrap complete before promise observers run, even when INIT delivery is deferred, and a configuration rejected in the same turn keeps that runtime active. Do not relax the legacy path's origin verification or let it bypass the consumer's bootstrap requirement. Legacy verification reads only a directly accessible consumer origin; `document.referrer` names the navigation initiator rather than the parent or opener, so it never verifies a consumer.
- **Retries.** `initHost()` can retry on the same page after failed asynchronous validation.
- **Host teardown.** The bootstrap owner supplies the host's teardown callback. Public host destruction releases the singleton and window accessor; owner-initiated cleanup clears the singleton before destroying its resources. Teardown is idempotent, and a later initialization can use retained channel metadata without returning a destroyed host.

### Loading and visibility

The renderer stores explicit iframe visibility separately from loading concealment:

- Eager frames use `display: none` while loading, so custom templates do not reserve space for both the iframe and the placeholder.
- Lazy frames use hidden visibility and keep their layout, temporarily clearing an inline `display: none` so GET/POST navigation can begin.
- Prerender completion checks current visibility before revealing the iframe, so a hide acknowledged during initialization stays in force.
- After the placeholder fades, the renderer restores configured display, visibility, opacity, and transition values and their CSS priorities.
- Caller-styled frames skip the default reveal animation, so configured concealment or opacity is never overridden. Explicit show/hide controls take precedence over configured visibility.
- A show requested before frame creation is applied when the frame is created, including lazy frames initially styled with `display: none`.

CSS encoding keeps case-sensitive custom property names and unitless numeric values; other numeric styles are pixels. Popup sizing converts numbers, numeric strings, and `px` strings to pixels. Other CSS units fall back to 500 pixels when opening, or to the current window size when resizing; iframe sizing passes CSS units through.

## Lifecycle and teardown

- Consumer teardown owns factory and index deregistration, independently of removable public event listeners. Deregistration runs before destruction observers and propagates to clones. A retained internal destroy listener keeps synthetic destroy events working.
- `close()` installs a shared completion promise before lifecycle callbacks run, and destruction installs its own. Repeated and reentrant close requests wait for that operation, including deregistration and destruction notifications, without repeating cleanup or close events. A close that arrives during failed-render cleanup waits for the destruction already in progress.
- Event dispatch snapshots subscribed handlers and their registration identities before invoking them. Subscriptions added during dispatch wait for the next emission; listeners removed before their turn are skipped, including after bulk removal or after cancellation and re-registration. A `once` observer can rearm itself without being invoked twice in one emission.

## Props update pipeline

`updateProps()` → serialized queue → alias materialization → isolated patch/reset merge → schema conversion → custom normalization → output-contract checks → custom validation → URL/origin checks → snapshot commitment → optional host synchronization → prop notifications.

- **Reset and presence.** `PROP_RESET` removes a supplied key; explicit `undefined` is an own value. Validation evidence for unchanged keys is kept; changed keys lose it.
- **Own properties.** Canonical keys and aliases are read from own properties. Host validation treats omitted inherited names as missing, and reconciliation removes stale custom keys by own membership in the new snapshot. Shaped object schemas also read only own fields; omitted nested fields reach presence validation as `undefined`, including names inherited from `Object.prototype`.
- **Built-in schema rules.** String URL schemas accept parseable absolute HTTP(S) URLs, return the input unchanged, and compose with patterns. Number schemas accept only finite numbers, so JSON transport cannot turn them into `null`.
- **Undefined definitions.** Prop-definition entries set to `undefined` are dropped before built-ins are merged, so built-in defaults and delivery policies apply. They also do not affect the custom-normalization deferral decision. Declaration admission applies the same rule to reserved names; real definitions of host controls are rejected.
- **Defaults and outputs.** Callback schema defaults are factories that return the callback; the factory result is checked without invoking the callback. Optional and nullable presence carries through, and non-function defaults are evaluated directly. Normalization applies defaults and decorators in definition order. Schema inputs become outputs before output-typed custom validators run, and output schemas must accept normalized values unchanged.
- **Async schemas.** Unsupported asynchronous schema results are observed without being awaited. Validation, default, output, and nested-schema probes refuse them synchronously and do not produce unhandled rejections. Promise detection works across realms, including inside composite schemas.
- **Arrays.** Deliverable normalized arrays reject `undefined` entries and sparse holes before render resources are created or an update is committed. Delivery policy runs first, so local-only values are exempt. Host decorators and custom JSON encoders run in their usual order, and their resulting arrays are checked at delivery. Bridge and JSON-replacer guards stop `undefined` entries in exports and encoded prop branches from becoming `null`. Item defaults are applied before these checks; standalone optional schemas are not affected.
- **Converters.** Custom query/body converters are called with the prop definition as their receiver. Scalar parameter encoding is a separate data operation.
- **Commitment.** Candidate preparation never replaces the current snapshot, so validation or origin failures leave the previous snapshot intact. Commitment happens before host synchronization; a transport failure does not roll back the committed consumer state.
- **Queue.** Queue entries are installed before decorators or validators can re-enter, including before a host connects. The first update starts synchronously; later entries run in FIFO order, and a failure does not block later entries. Host bootstrap and updates share the queue, so bridge batches never overlap.
- **Host side.** The host deserializes, validates, and filters before reconciling. Stale custom keys are removed; built-ins are protected. Subscriber registrations are snapshotted after commitment and before the props event: new or re-registered observers wait for the next update, and cancelled registrations are skipped. Cancellation handles capture their registration token, so a stale handle cannot remove a later registration of the same callback. Async subscriber failures are caught without awaiting subscriber work or delaying acknowledgement. A newer acknowledged update that arrives during bootstrap wins over the older bootstrap snapshot.

### Consumer-only props and late configuration

The host discards fields whose definitions set `sendToHost: false` before decoding legacy, bootstrap, or update snapshots, including values sent by stale consumers. These fields never enter host state or notifications. Host validation ignores their definitions; consumer validation still requires their inputs. Undeclared fields are delivered as usual. BASE64 root encoders that return `undefined` omit their prop; DOTIFY traverses root own fields and JSON-encodes leaves.

Late host configuration filters the current consumer snapshot against the proposed definitions, validates retained values when initialized, then removes stale custom host keys and commits both snapshots. If validation fails, the previous definitions and state stay in place. Built-in controls and retained callbacks keep their identity, unchanged snapshots keep their reference, and configuration neither notifies subscribers nor emits a props event. A pending bootstrap selects the latest acknowledged wire snapshot and filters it with the current definitions before commitment, so removed fields cannot return.

After readiness, a rejected public `initHost()` schema replacement keeps the active runtime, controls, subscribers, and domain configuration. Initial configuration failures and consumer-domain rejection tear the host down. Validation-failure cleanup uses the configured runtime identity, so it reports the original error and leaves any replacement created by reentrant validation alone. Successful validation also rechecks that identity: if the configured host was destroyed or replaced, the call returns null without applying domain configuration or flushing the replacement.

## Serialization

- **Cross-realm values.** Neutral realm-value helpers recognize genuine `Date` internal branding and ordinary object prototypes across windows. Schemas, output comparisons, array admission, and recursive codecs share these helpers. Class instances are not ordinary records.
- **JSON leaves.** Leaf encoding observes native property reads through serialization-local proxies returned after each replacer call. `Date` framing uses the captured source value and the encoder's result, so getters and `Date` encoders run once. Encoders keep their original receiver and native conversion order. A native JSON probe with an empty property list unboxes boxed primitives once without enumerating ordinary records or running exception-driven brand checks. Custom coercion hooks, foreign wrappers, `BigInt` rejection, and caller-defined branding getters behave as in native JSON; arrays and native raw JSON use their own traversal and brand paths.
- **Snapshots of caller data.** Bridge array encoding captures indexed entries once during presence admission, regardless of the array's prototype or overridden methods, and encodes that snapshot, so getters cannot introduce unchecked `undefined` entries on a second read. Object schema shapes, tuple item arrays, union branch arrays, and enum value arrays are shallow-copied at construction; later caller mutation cannot change an established schema, its diagnostics, or its presence clones.
- **Event handlers.** Handler removal uses the same generic data contract as registration, without changing listener identity or dispatch.

## Messages and remote callbacks

Admission rejects self-sent and untrusted traffic before decoding, then checks channel identity and a usable event source. Responses must also match the pending request's target window and expected origin. Request handlers receive browser-verified source metadata, not the metadata claimed in the envelope.

The request integration runs the handler, builds a response, and posts it. If the result cannot be serialized, an error response is sent instead. Timeouts and teardown reject pending requests.

Messenger requests encode the full envelope before allocating a pending request and signal the delivery attempt immediately before posting. Prop and export batches abort newly registered callbacks when encoding fails before that point, and conservatively keep them after a post was attempted. Unknown thrown values are normalized without letting diagnostic coercion throw, so callback errors always reach the response path.

The function bridge:

- **Identity.** Local functions get stable IDs while retained. Remote wrappers are cached by ID, window, and origin; the remote cache evicts beyond 500 entries. Local callable references are never evicted to admit another callback.
- **Capacity.** Each prop or export snapshot admits at most 500 distinct functions. New registrations are staged and callable during delivery. An update batch removes stale references once acknowledged; a bootstrap batch completes as soon as serialization finishes. A serialization failure before delivery rolls back only new registrations. A delivery failure conservatively keeps previous and possibly delivered references in a pool capped at 1,000 and rejects further registrations until an acknowledged retry with retained callbacks or a new session frees capacity.
- **Reconnection.** The verified new-session reset runs inside queued bootstrap serialization after earlier updates settle. It releases callable registrations but keeps weak IDs, so callbacks the new host already acknowledged keep their identity when re-registered. Teardown clears both registrations and weak IDs.
- **Peer relay.** Peer exports go through a separate `PEER_CALL` relay bridge with the same source checks. Discovery takes the requester's uid and tag from the consumer instance rather than the request, and returns only peers whose verified host origin equals the requesting host's browser-reported origin, including with `anyConsumer`; a peer's `peerDomains` option may admit other requesting origins. Opaque (`"null"`) origins are distinct from one another, so an opaque requester receives no peers, and peers without a verified host origin, including hosts still bootstrapping, are omitted. Discovery uses append transactions with a cumulative 500-reference bound; a failed serialization rolls back the additions without retiring held peer snapshots. Held snapshots survive prop batches and repeated discovery; replacement exports retire their original source functions. Reconnection clears old requester relay identities, and teardown clears both bridges.
- **Codecs.** Codec guards require the complete own-property shape of transport wrappers. Encoding escapes ordinary records shaped like markers, including the escaped-record marker itself. JSON-encoded leaves are converted once with native JSON semantics, then their final shapes are escaped. DOTIFY also escapes assembled object branches after leaf conversion, omits JSON-undefined leaves, and keeps branches emptied by omission. Codec-generated function and `Date` markers keep their identity, and decoding restores escaped fields as data rather than as a function, `Date`, or encoded prop. Recursive serialization handles `Date` framing, cycles, unsafe-key filtering, and JSON/BASE64/DOTIFY. BASE64 and DOTIFY encode nested functions through the same bridge registry and honor `toJSON()`; decoding reconstructs function references and `Date` wrappers together. These encoding callbacks run inside the transport-owned serialization batch.

## React commit flow

The hook wrapper updates callback refs, mounts an instance for the current context, observes committed props, and forwards the container ref, in that effect order.

Each mounted instance has its own sync state. Commits produce shallow snapshots and reset previously known keys that are now omitted. A failed equivalent pending commit requests one retry; successful acknowledgements advance the FIFO. Draining waits for render readiness and checks the current instance identity around every await, so failed or obsolete work cannot update a new mount's refs or queue. Cleanup deactivates the queue before closing and unsubscribing.

## Playground

### Company demo

The consumer's `/company` route is a fictional Pip Veterinary invoice portal; the host's `/payment.html` entry is the fictional Harbor Pay provider. The shared [payment contract](../packages/playground/payment/contract.ts) defines invoice data, the simulated outcome, and the remote readiness and result callbacks. Its amount schema requires nonnegative safe-integer AUD cents at consumer admission and at host initialization and updates, even when a custom consumer validates more loosely. The consumer restricts the provider origin; the provider awaits schema-backed initialization with a consumer-origin allowlist before reading props.

State is split by application. The consumer owns invoice selection, session identity, payment receipts, and reset. The provider owns card inputs, form validation, a short simulated processing delay, and decline/retry state. Only receipt metadata crosses back to the merchant.

- **Outcomes.** The first declined attempt leaves the invoice unpaid; a retry approves in the same provider window.
- **Merchant acceptance.** Callback arguments are treated as unknown. The merchant validates the discriminator and every receipt field (safe-integer cents, a valid ISO timestamp, four masked digits), matches the invoice and amount, then commits its own snapshot. Malformed results leave the invoice unpaid and allow a valid retry. These rules live in the browser-independent `consumer/company-demo/acceptance.ts`.
- **Provider acknowledgement.** The provider treats callback return values as unknown and requires the matching status and the invoice captured in its submitted result: `declined` before showing decline/retry feedback, or `recorded` before marking approval and closing. A malformed or mismatched acknowledgement leaves the payment window open with recovery guidance. Outcome, card-number, and acknowledgement rules live in `payment/simulation.ts`; the provider passes clock and randomness observations into receipt construction.
- **Cancellation.** Closing marks the session cancelled, and destroy releases the merchant UI after cleanup. Callbacks from cancelled or replaced sessions cannot commit a payment.
- **Focus.** Native dialogs confine modal focus; the provider handles Escape for focused iframe inputs.

Application entry points compose these rules with DOM presentation and ForgeFrame calls.

Experience and Technical are presentation modes of the same consumer application. The Technical panel observes callback call sites and local return values; it opens no separate communication channel. Its five-step guide records the actual render, readiness callback, result, local acknowledgement return, and destroy for each invoice, and separates payment outcome from window lifecycle. Source tabs lazily import the authored consumer, host, shared contract, and both rule modules when Technical is first opened; their TSDoc explains the integration boundaries. A source-loading failure never blocks payment. Browsers cache failed module imports, so the recovery guidance asks for a page refresh and warns that refreshing resets the sample invoices.

Consumer builds generate static entry pages for `/company` and the test routes. Host builds include the payment entry separately from the diagnostic host. `VITE_HOST_URL` sets the provider address; `VITE_CONSUMER_URL` sets the payment host's consumer allowlist. All payment processing and seed data are fictional and reset without persistence.

### Diagnostic playground

Host displays and consumer logs build dynamic content with DOM text properties, keeping peer-controlled strings out of HTML parsing. Static layouts and controls are authored markup.

## Design rules

Operations implement cohesive policy, transformations, state transitions, or browser actions. Integrations sequence package-owned behavior. A call to a browser, runtime, or schema API does not by itself require extraction. Keep cohesive recursive algorithms and short local adapters together; do not add an interface or wrapper without a useful responsibility.

Pure policy depends on supplied observations and neutral types and helpers. Browser reads and resource effects belong in browser operations or their coordinating runtime. Internal helpers stay inside their subsystem and are not added to root exports. Exported schema classes keep their existing members; decompose them with module-level helpers.

See the [callable reference](iosp-review.md) for per-callable classifications and the [test index](../packages/forgeframe/tests/README.md) for boundary tests. Public contracts are documented in the root README and enforced by the typecheck suites.
