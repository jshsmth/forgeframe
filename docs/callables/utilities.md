---
name: callables/utilities
title: Utility and window callables
desc: Utility and window-name callables with their IOSP classifications and boundary tests.
tags: []
sources: []
created: 2026-10-27T21:30:00Z
updated: 2026-10-27T22:13:25Z
---

# Utility and window callables

Classifications use the legend and evidence groups in the [callable reference index](_index.md). Update an entry when its callable changes, and run the suites its evidence names.

### [utils/browser.ts](../../packages/forgeframe/src/utils/browser.ts)

One environment observation checks for a browser window.

- **O:** `hasBrowserWindow`.

Evidence: [utilities](_index.md#evidence-utilities); typecheck.

### [utils/cleanup.ts](../../packages/forgeframe/src/utils/cleanup.ts)

Taking the LIFO task batch marks cleanup as claimed before any callback runs. Cleanup then runs the detached tasks; registration and unregistration are state operations.

- **O:** `CleanupManager.register`, `CleanupManager.takeCleanupTasks`.
- **I:** `CleanupManager.cleanup`.
- **O callbacks:** `CleanupManager.register.callback@70`, `CleanupManager.register.callback@71`.

Evidence: [utilities](_index.md#evidence-utilities); typecheck.

### [utils/dimension.ts](../../packages/forgeframe/src/utils/dimension.ts)

Numeric dimension normalization uses supplied values and an explicit fallback; CSS normalization maps an omitted value to `100%`. Popup conversion accepts finite numbers and complete numeric or `px` strings, truncating string fractions; other units use the supplied fallback. CSS conversion passes iframe units through.

- **O:** `normalizeDimensionToCSS`, `normalizeDimensionToNumber`.

Evidence: [utilities](_index.md#evidence-utilities), [dimension.test](../../packages/forgeframe/tests/unit/dimension.test.ts), [popup.test](../../packages/forgeframe/tests/unit/popup.test.ts); typecheck.

### [utils/json.ts](../../packages/forgeframe/src/utils/json.ts)

`stringifyForWire` is the one JSON encoder for values that cross windows: the message envelope, primitive unboxing and URL or body parameters. A value JSON cannot encode, such as a `BigInt` or a cycle, makes the encoder throw a `TypeError`, which becomes a `VALIDATION` `ForgeFrameError` with that `TypeError` as `cause`; any other error, such as one a caller's own `toJSON()` throws, passes through unchanged.

- **O:** `stringifyForWire`.

Evidence: [utilities](_index.md#evidence-utilities), [messaging](_index.md#evidence-messaging); typecheck.

### [utils/origin-pattern.ts](../../packages/forgeframe/src/utils/origin-pattern.ts)

Wildcard compilation and stateless regex testing are cohesive algorithms. Keep the compile cache and the `lastIndex` protection. `'*'` compiles to any origin; the only other wildcard is `scheme://*.rest` (`LEADING_LABEL_WILDCARD`), where `*` stands for one or more leading host labels with the scheme and port fixed; any other wildcard compiles to a pattern that matches nothing. `assertOriginMatcher` rejects configured matchers that would silently disable or widen an origin policy: values other than non-empty strings, `RegExp`s, or arrays of them, strings without a scheme (`isBareHostPattern`), such as `example.com`, `*.example.com` or `"true"`, a pattern with a path, query or fragment (`hasPathOrQuery`), such as `https://app.example.com/`, which can never equal an origin, an exact origin or `scheme://*.rest` wildcard in a form browsers never report (`isNonCanonicalOrigin`, which compares it with `readCanonicalPattern`: the `URL` parser's origin from `readOrigin`, read for a wildcard through a probe label in place of `*`; an entry with a backslash, which the parser reads as a path separator, has none), such as `https://Shop.example.com`, `https://example.com:443` or `https://*.example.com:443`, or a `file:` origin, which is opaque, and a misplaced wildcard (`isMisplacedWildcard`), such as `https://*example.com`. An empty array matches nothing, so it is rejected unless the caller passes `"allowed"`, which only the `consumerOrigins` allowlist does, to fail closed.

- **O:** `escapeRegExp`, `compileWildcardOriginPattern`, `testOriginRegExpStateless`, `assertOriginMatcher`, `assertOriginMatcher.isPattern`, `isBareHostPattern`, `hasPathOrQuery`, `isNonCanonicalOrigin`, `readCanonicalPattern`, `readOrigin`, `isMisplacedWildcard`.

Evidence: [utilities](_index.md#evidence-utilities); typecheck.

### [utils/own-field.ts](../../packages/forgeframe/src/utils/own-field.ts)

The own-field rule for declarations: only own fields count, the descriptor is read so an accessor is never invoked (and counts as set), and a data field set to `undefined` counts as omitted. It has no imports, so the `forgeframe/react` entry shares it without pulling the definition checks into its chunk.

- **O:** `hasOwnDeclaredField`.

Evidence: [props](_index.md#evidence-props), [react](_index.md#evidence-react); typecheck.

### [utils/error.ts](../../packages/forgeframe/src/utils/error.ts)

Unknown-error conversion keeps `Error` identity and ordinary coercion, with a stable fallback when coercion throws; a converted value is kept as the new error's `cause`. It owns no runtime state and reads no browser state.

- **O:** `normalizeError`.

Evidence: [error.test](../../packages/forgeframe/tests/unit/error.test.ts), [messaging](_index.md#evidence-messaging); typecheck.

### [utils/origin.ts](../../packages/forgeframe/src/utils/origin.ts)

Origins are serialized strings: the JavaScript `null` means no origin is known yet, and the string `"null"` is the serialization every opaque origin shares. `isOpaqueOrigin` is the one check for the second meaning; messenger trust and peer selection use it so `"null"` never identifies a peer.

- **O:** `isOpaqueOrigin`.

Evidence: [messaging](_index.md#evidence-messaging), [consumer](_index.md#evidence-consumer); typecheck.

### [utils/promise.ts](../../packages/forgeframe/src/utils/promise.ts)

Deferred creation and timeout wrapping are cohesive platform operations. Executor, timer, and completion callbacks claim resolver references or settle the owned promise; there is no domain workflow.

- **O:** `createDeferred`, `promiseTimeout`.
- **O callbacks:** `createDeferred.callback@48`, `promiseTimeout.callback@92`, `promiseTimeout.callback@92.callback@93`, `promiseTimeout.callback@92.callback@98`, `promiseTimeout.callback@92.callback@102`.

Evidence: [utilities](_index.md#evidence-utilities); typecheck.

### [utils/realm-values.ts](../../packages/forgeframe/src/utils/realm-values.ts)

`Date` detection uses the intrinsic `Date` brand across realms. Ordinary-record detection compares native constructor and prototype evidence, accepting null-prototype records and rejecting class instances. Schemas, output comparison, and codecs share these supplied-value operations.

- **O:** `isDate`, `isPlainObject`.

Evidence: [realm-values.test](../../packages/forgeframe/tests/unit/realm-values.test.ts), [props](_index.md#evidence-props), [cross-realm-props.test](../../packages/forgeframe/tests/integration/cross-realm-props.test.ts), browser `navigation.spec.ts`; typecheck.

### [utils/uid.ts](../../packages/forgeframe/src/utils/uid.ts)

Random ID creation is one platform operation. IDs are base-36 strings with 64 bits from `crypto.getRandomValues()` (`randomBase36`, two zero-padded 7-digit words); `generateUID` prefixes a base-36 timestamp. Origin and source checks guard every message, so IDs are not secrets, but they stay unpredictable. Keep the base-36 shape.

- **O:** `randomBase36`.
- **I:** `generateShortUID`.
- **M:** `generateUID`.
- **Retained rationale —** `generateUID`: It formats one timestamp next to the shared random part; a named timestamp operation would wrap a single `toString(36)`.

Evidence: [utilities](_index.md#evidence-utilities); typecheck.

### [utils/url.ts](../../packages/forgeframe/src/utils/url.ts)

HTTP(S), credential, and origin URL validation is one cohesive supplied-data operation and reads no browser globals; browser integrations supply `document.baseURI` and pin the validated absolute URL before lifecycle callbacks. Query suffixes are inserted before the first fragment delimiter without changing existing query bytes.

- **O:** `resolveComponentHostUrl`, `appendComponentQuery`.

Evidence: [utilities](_index.md#evidence-utilities), [url.test](../../packages/forgeframe/tests/unit/url.test.ts), [consumer-navigation.test](../../packages/forgeframe/tests/unit/consumer-navigation.test.ts); typecheck.

### [utils/wire-value.ts](../../packages/forgeframe/src/utils/wire-value.ts)

`Date` framing, record escaping, and array admission are codec operations; keep malformed-`Date` handling together. Escaping applies to ordinary records shaped like function, `Date`, or escaped-record markers once their fields are encoded; other records, including the former BASE64 and DOTIFY wrapper shapes, are ordinary data. Encoded records keep native raw JSON unchanged, so `toWrittenJsonValue` reads a marker field as the receiver will parse it, and a raw JSON `"function"`, `"date"` or `"record"` marker is escaped like the plain string.

`toJsonValue` applies one native JSON conversion (a callable `toJSON(key)`, then unboxing) for the bridge. `unboxJsonPrimitive` unboxes primitive wrappers with a local dummy encoder and an empty native JSON property list, avoiding exception-driven probes of ordinary records. It reuses the conversion so coercion hooks run once, and reads no ordinary fields, branding getters, or proxy prototype metadata. Arrays returned by `toJSON()` bypass the probe, so their entries are still bridged. `isRawJsonValue` detects native raw JSON with `JSON.isRawJSON`, resolved once at module load when the runtime has it, including values from another realm, so the bridge can pass it through.

`assertDefinedArrayEntries` checks normalized container values with cycle-safe traversal and without calling custom JSON encoders. It mirrors the bridge: arrays are read entry by entry, `convertsThroughJsonEncoder` defers a non-array object with a callable `toJSON` to delivery checks after its encoder runs, and `__proto__` fields are skipped because encoding omits them. `assertDefinedArrayEntry` also guards bridge arrays, including holes, before JSON can turn entries into `null`. `hasJsonEncoder` inspects descriptors without invoking computed properties, and a non-callable `toJSON` field is ordinary data.

- **O:** `needsRecordEscape`, `toWrittenJsonValue`, `escapeWireRecord`, `isRecordWireValue`, `assertDefinedArrayEntry`, `assertDefinedArrayEntries`, `convertsThroughJsonEncoder`, `hasJsonEncoder`, `isObjectRecord`, `hasOwnKey`, `encodeDateWireValue`, `isDateWireValue`, `decodeDateWireValue`, `isRawJsonValue`, `toJsonValue`.
- **M:** `unboxJsonPrimitive`.
- **Retained rationale —** `unboxJsonPrimitive`: It runs the shared `stringifyForWire` once, so an unencodable boxed `BigInt` is a coded `VALIDATION`, and parses its result only when the encoder unboxed something; the array guard and that one comparison stay with the call they qualify.
- **O callbacks:** `needsRecordEscape.callback@22`, `unboxJsonPrimitive.toJSON`.

Evidence: [utilities](_index.md#evidence-utilities); typecheck.

### [window/helpers.ts](../../packages/forgeframe/src/window/helpers.ts)

Browser observations and defensive window reads are operations. Recursive origin matching is a cohesive algorithm; security exceptions are part of the browser boundary.

- **O:** `getOrigin`, `matchOrigin`, `isWindowClosed`, `getOpener`, `getConsumer`, `isIframe`, `isPopup`, `waitForWindowFocus`.
- **O callbacks:** `matchOrigin.callback@87`, `waitForWindowFocus.callback@259`, `waitForWindowFocus.callback@259.done`.

Evidence: [utilities](_index.md#evidence-utilities); typecheck.

### [window/name-payload.ts](../../packages/forgeframe/src/window/name-payload.ts)

Envelope framing is separate from protocol classification. `classifyWindowNamePayload` is pure policy over a decoded value: current protocol 3 metadata (copied without unknown fields), a payload from another protocol with its protocol and package version, or invalid. An older payload is recognised only when it carries the channel fields every older consumer wrote (uid, tag, context, consumer origin); a newer one needs only its tag. Reading never writes `window.name`; a name that throws or lacks the prefix yields null, and an undecodable or oversized one is invalid.

- **O:** `isObjectRecord`, `isNonEmptyString`, `isContext`, `classifyWindowNamePayload`, `encodePayload`, `decodePayload`, `createWindowPayload`.
- **M:** `buildWindowName`, `readWindowNamePayload`, `isForgeFrameWindow`.
- **Retained rationale —** `buildWindowName`: It prefixes the result of `encodePayload`; the prefix is the only rule, one template literal.
- **Retained rationale —** `readWindowNamePayload`: It reads `window.name` defensively and checks the prefix before handing the rest to `decodePayload` and `classifyWindowNamePayload`; both guards protect the reads it makes.
- **Retained rationale —** `isForgeFrameWindow`: It turns `readWindowNamePayload`'s classification into a boolean with one comparison.

Evidence: [utilities](_index.md#evidence-utilities); typecheck.

### [window/types.ts](../../packages/forgeframe/src/window/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [utilities](_index.md#evidence-utilities); typecheck.
