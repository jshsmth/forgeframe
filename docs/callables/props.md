---
name: callables/props
title: Prop schema callables
desc: Prop definition, schema, normalization, and serialization callables with their IOSP classifications and boundary tests.
tags: []
sources: []
created: 2026-10-27T21:30:00Z
updated: 2026-10-27T21:30:00Z
---

# Prop schema callables

Classifications use the legend and evidence groups in the [callable reference index](_index.md). Update an entry when its callable changes, and run the suites its evidence names.

### [props/definition-checks.ts](../../packages/forgeframe/src/props/definition-checks.ts)

Prop-definition admission is pure declaration policy over a supplied definitions record. `create()` and `initHost()` share it and call it before registering a factory or creating a host runtime. It rejects getter- or setter-defined entries without invoking them, because normalization reads the definitions again; it skips direct Standard Schemas and `undefined` entries and reads own property descriptors, so accessor-defined wrapped fields are not invoked; a data field set to `undefined` counts as omitted. `assertWrappedPropDefinition` rejects removed options (including `outputSchema`) with an error naming the replacement, then any other own field outside the delivery fields, so a misspelled option fails; a missing `schema`; a `deliverTo` that is neither `'same-origin'` nor a valid origin matcher (or mixes `'same-origin'` into an array); a non-boolean `sendToHost`; and a `queryParam` or `bodyParam` that is not a boolean or a non-empty name, or that is combined with `deliverTo: 'same-origin'`. `assertPropDefinitions` then records each prop's parameter names, which `readParameterName` (**O**) resolves (`true` is the prop key), and rejects two props sharing a query or body name. Fields are read through the shared own-field rule in `utils/own-field.ts`, which the reserved-name policy, `create()`'s removed component options and the React wrapper's reserved names use too. `component.test.ts`, `prop-definition-checks.test.ts`, and the handshake integration suite cover both entry points.

- **O:** `isDataField`, `readDeclaredField`, `assertWrappedPropDefinition`, `readParameterName`.
- **M:** `assertPropDefinitions`.
- **O callbacks:** `assertWrappedPropDefinition.callback@153`.
- **Retained rationale —** `assertPropDefinitions`: It walks the entries once, applying `assertWrappedPropDefinition` and recording each parameter name in the same pass; the clash rule needs every earlier entry, so a separate pass would read the definitions twice.

Evidence: [props](_index.md#evidence-props); typecheck.

### [props/definitions.ts](../../packages/forgeframe/src/props/definitions.ts)

**Contract only:** the shared empty definitions map; no runtime callables. Instances have no built-in props: only declared props are normalized and sent.

Evidence: [props](_index.md#evidence-props); typecheck.

### [props/exports.ts](../../packages/forgeframe/src/props/exports.ts)

The component's `exports` schema validates only, with the same unchanged-output rule as prop schemas. `validateExports` returns without a schema, and otherwise passes the shared `validateUnchanged` outcome to the shared `assertValidatesUnchanged` in `normalize.ts`, which throws `VALIDATION` with the schema's message for a rejection and the remove-the-transform message it is given for a changed value. The consumer and the host both call `validateExports`.

- **I:** `validateExports`.

Evidence: [consumer](_index.md#evidence-consumer), [host](_index.md#evidence-host), [props](_index.md#evidence-props); typecheck.

### [props/index.ts](../../packages/forgeframe/src/props/index.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [props](_index.md#evidence-props); typecheck.

### [props/normalize.ts](../../packages/forgeframe/src/props/normalize.ts)

Each defined prop's schema is the only source of its presence, default, and value: `normalizeProps` runs it on the supplied own value, including `undefined` for an omitted prop, and `assertSelfAccepting` turns a `validateUnchanged` outcome that is not `unchanged` into a definition-mistake error with the migrations. `validateUnchanged` is the one check every trust boundary shares: it runs the prop schema on a normalized value and reports `unchanged`, `changed`, or `rejected` with the schema's issues. `revalidatePropInputs` and `validateNormalizedProps` recheck supplied inputs and normalized outputs at trust boundaries, the latter through `validateUnchanged` and `assertValidatesUnchanged`, which keeps the schema's own issue for a rejection and reports a changed value as no longer matching; `buildUnnormalizedProps` builds the never-delivered snapshot kept after a construction-time failure; a schema or default that throws there leaves the prop `undefined`. Output equality is a cohesive cycle-aware algorithm.

`createDeliveryTarget` turns a host origin and the consumer's origin into a delivery target, so both sides agree on same-origin status and an opaque origin never counts. `isPropDelivered` is the pure delivery policy over a definition and that target; `getDeliveredPropDefinitions`, `getPropsForHost`, `validatePropsForHostTransport`, and the query/body integrations all use it. `propsToRequestParams` treats the unloaded host as not same-origin, so `deliverTo: 'same-origin'` props are never in the initial request; `serializePropParameter` encodes admitted values.

`getCompiledPropDefinitions` compiles only the supplied definitions and drops entries set to `undefined`, so undeclared inputs, including names of removed v1 lifecycle callbacks, are never normalized or sent. Its filter and map callbacks are **O**; unit tests cover omitted definitions, and public integration tests cover construction, bootstrap, updates, and close.

- **O:** `hasOwn`, `schemaOutputMatchesInput`, `getCompiledPropDefinitions`, `readSuppliedProp`, `isDeclaredProp`, `selectExpectedFields`, `assertSelfAccepting`, `assertValidatesUnchanged`, `createDeliveryTarget`, `isPropDelivered`.
- **I:** `normalizeProps`, `revalidatePropInputs`, `validateNormalizedProps`, `getDeliveredPropDefinitions`, `getPropsForHost`, `validatePropsForHostTransport`, `propsToQueryParams`, `propsToBodyParams`.
- **M:** `validateUnchanged`, `propsToRequestParams`, `serializePropParameter`, `buildUnnormalizedProps`.
- **O callbacks:** `getCompiledPropDefinitions.callback@140`, `getCompiledPropDefinitions.callback@139`, `getDeliveredPropDefinitions.callback@440`, `getDeliveredPropDefinitions.callback@439`, `selectExpectedFields.callback@181`.
- **Retained rationale —** `validateUnchanged`: It runs the schema and maps the result to one of three outcomes with a single comparison; the outcome is the shared contract every trust boundary reads, so the comparison stays with the run it describes.
- **Retained rationale —** `propsToRequestParams`: Parameter naming (`true` uses the key, a string names the parameter) is one expression inside the loop that applies delivery policy and encoding; it belongs to that loop.
- **Retained rationale —** `serializePropParameter`: It picks the encoding by value type and passes an object to the shared `stringifyForWire`, so an unencodable value is a coded `VALIDATION`; each branch is one expression.
- **Retained rationale —** `buildUnnormalizedProps`: It keeps each supplied input and asks the schema (`validateWithSchema` with `undefined`) for each missing one's default, treating a rejection as no value; the loop and the fallback are one pass over the compiled definitions.

Evidence: [props](_index.md#evidence-props); typecheck.

### [props/prop.ts](../../packages/forgeframe/src/props/prop.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [props](_index.md#evidence-props); typecheck.

### [props/prop/base.ts](../../packages/forgeframe/src/props/prop/base.ts)

Presence selection is separate from running default and nested validation. `copyDefaultValue` copies array, plain-object and `Date` defaults on each use, recursively, so instances never share a default; `assertNestedSchema` is the construction check every composite builder shares. Callable defaults require factories, including on widened optional and nullable builders; scalar defaults are plain values, and a default removes `undefined` from the output type unless the default can be `undefined`. Refinements are `SchemaCheck` lists: `addSchemaCheck` appends without replacing earlier checks of the same kind and keeps rank order, and `findFailedSchemaCheck` reports the first failure. Decomposition uses free functions so the exported classes keep their members, and the immutable fluent builders below are the deliberate exceptions. Invoking a runtime schema is one validation boundary operation.

- **O:** `copyDefaultEntry`, `assertNestedSchema`, `testRegExpStateless`, `validateSchemaSync`, `prependIssuePath`, `getValueKind`, `formatDateForMessage`, `defineDataProperty`, `validateDateBound`, `addSchemaCheck`, `findFailedSchemaCheck`, `selectSchemaPresence`, `PropSchema._copyBaseTo`.
- **I:** `validateSchemaPresence`, `PropSchema.validate`, `PropSchema._validateInput`.
- **M:** `copyDefaultValue`, `PropSchema.optional`, `PropSchema.nullable`, `PropSchema.default`, `PropSchema._getDefaultValue`.
- **O callbacks:** `addSchemaCheck.callback@115`, `findFailedSchemaCheck.callback@123`.
- **I callbacks:** `prependIssuePath.callback@47`, `PropSchema._validateInput.callback@326`, `PropSchema._validateInput.callback@327`.
- **Retained rationale —** `copyDefaultValue`: One primitive guard returns scalars before the `WeakMap` that tracks shared references is allocated; the copy itself is `copyDefaultEntry`, which defines object keys rather than assigning them, so an own `__proto__` key stays an own key.
- **Retained rationale —** `PropSchema._getDefaultValue`: One ternary picks a factory call or a copy of the literal default; the copy rule is `copyDefaultValue`, so the method only states which kind of default it holds.
- **Retained rationale —** `PropSchema.optional`, `PropSchema.nullable`, `PropSchema.default`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.

Evidence: [props](_index.md#evidence-props); typecheck.

### [props/prop/composite.ts](../../packages/forgeframe/src/props/prop/composite.ts)

Outer shape and length constraints and strict-key selection are separate from nested schema traversal. Array length refinements accumulate as checks. Child validation reads own field values and passes omitted fields to presence and default handling as `undefined`. Issue-path accumulation and result assembly are cohesive algorithms. Exported classes keep their members and inference.

`ArraySchema.constructor`, `ObjectSchema.constructor`, `RecordSchema.constructor` and `TupleSchema.constructor` require their nested schemas (and the object its shape) and throw a `TypeError` that points to `prop.any()` otherwise, through the shared `assertNestedSchema` in `base.ts`. `TupleSchema.constructor` copies indexed positions without calling the caller's array iterator, and `ObjectSchema.constructor` copies own shape entries. Caller mutations cannot change these definitions or their presence clones.

- **O:** `ArraySchema.constructor`, `TupleSchema.constructor`, `ObjectSchema.constructor`, `RecordSchema.constructor`, `validateArrayItems`, `validateTupleItems`, `findUnknownObjectKey`, `validateObjectFields`, `validateRecordEntries`, `checkArrayConstraints`, `checkTupleConstraints`, `checkRecordInput`.
- **I:** `ArraySchema._validate`, `TupleSchema._validate`, `ObjectSchema._validate`, `RecordSchema._validate`.
- **M:** `ArraySchema._clone`, `ArraySchema._withCheck`, `ArraySchema.min`, `ArraySchema.max`, `ArraySchema.nonempty`, `TupleSchema._clone`, `ObjectSchema._clone`, `ObjectSchema.strict`, `RecordSchema._clone`.
- **O callbacks:** `ArraySchema.min.test`, `ArraySchema.max.test`, `findUnknownObjectKey.callback@389`.
- **Retained rationale —** `ArraySchema._clone`, `ArraySchema._withCheck`, `ArraySchema.min`, `ArraySchema.max`, `ArraySchema.nonempty`, `TupleSchema._clone`, `ObjectSchema._clone`, `ObjectSchema.strict`, `RecordSchema._clone`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.

Evidence: [props](_index.md#evidence-props); typecheck.

### [props/prop/factory.ts](../../packages/forgeframe/src/props/prop/factory.ts)

Scalar, composite, and literal schema factories are construction operations with typed inference and no workflow state.

- **O:** `string`, `number`, `date`, `boolean`, `function`, `array`, `tuple`, `object`, `record`, `literal`, `enum`, `union`, `any`.

Evidence: [props](_index.md#evidence-props); typecheck.

### [props/prop/literals.ts](../../packages/forgeframe/src/props/prop/literals.ts)

Literal and enum constraint checks and ordered union probing are cohesive validation operations. Union presence uses the shared selector with a union-specific `null`/`undefined` policy.

`EnumSchema.constructor` and `UnionSchema.constructor` each copy indexed positions (the union rejects a missing branch schema) from the supplied array without calling its iterator, and the enum then builds its membership set. Clones and diagnostics are therefore unaffected by later caller mutation. Each constructor is one construction operation.

`formatRejectedValue` formats primitives, or a type label for other values, without JSON serialization, so rejected cyclic objects, `BigInt`s, and custom encoders cannot abort later union branches.

- **O:** `formatRejectedValue`, `LiteralSchema.constructor`, `LiteralSchema._validate`, `EnumSchema.constructor`, `EnumSchema._validate`, `UnionSchema.constructor`, `UnionSchema._validate`.
- **I:** `UnionSchema._validateInput`.
- **M:** `LiteralSchema._clone`, `EnumSchema._clone`, `UnionSchema._clone`.
- **O callbacks:** `EnumSchema._validate.callback@101`.
- **I callbacks:** `UnionSchema._validateInput.callback@171`, `UnionSchema._validateInput.callback@172`.
- **Retained rationale —** `LiteralSchema._clone`, `EnumSchema._clone`, `UnionSchema._clone`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.

Evidence: [props](_index.md#evidence-props); typecheck.

### [props/prop/primitives.ts](../../packages/forgeframe/src/props/prop/primitives.ts)

Scalar validation is cohesive: string trimming and constraints, number bounds and integer checks, and `Date` bounds are algorithms, not workflows. Each refinement adds a check instead of overwriting a shared slot, so `.email().pattern()` and `.min(10).positive()` apply both rules. String checks run lengths, then URL syntax, then patterns; number checks run integer, then lower, then upper bounds. Messages name the failed rule, such as `Expected number, got NaN` and `Number must be > 0`. Builder exceptions keep clone/set/return local. Callback default validation sequences one factory evaluation and the result's validation, keeping optional/nullable presence without invoking the returned callback.

Number validation rejects nonfinite values before JSON transport can turn them into `null`. `isHttpUrl` parses absolute HTTP(S) URL syntax. String clones carry this constraint independently of regex patterns, and validation returns the input unchanged.

- **O:** `isHttpUrl`, `StringSchema._validate`, `NumberSchema._validate`, `DateSchema._validate`, `BooleanSchema._validate`, `FunctionSchema._validate`, `AnySchema.constructor`, `AnySchema._validate`.
- **M:** `StringSchema._clone`, `StringSchema._withCheck`, `StringSchema.min`, `StringSchema.max`, `StringSchema.length`, `StringSchema.pattern`, `StringSchema.email`, `StringSchema.url`, `StringSchema.uuid`, `StringSchema.trim`, `StringSchema.nonempty`, `NumberSchema._clone`, `NumberSchema._withCheck`, `NumberSchema.min`, `NumberSchema.max`, `NumberSchema.int`, `NumberSchema.positive`, `NumberSchema.nonnegative`, `NumberSchema.negative`, `DateSchema._clone`, `DateSchema._withCheck`, `DateSchema.min`, `DateSchema.max`, `BooleanSchema._clone`, `FunctionSchema._clone`, `AnySchema._clone`, `FunctionSchema._validateInput`.
- **O callbacks:** `StringSchema.min.test`, `StringSchema.max.test`, `StringSchema.pattern.test`, `NumberSchema.min.test`, `NumberSchema.max.test`, `NumberSchema.positive.test`, `NumberSchema.negative.test`, `DateSchema.min.test`, `DateSchema.max.test`.
- **Retained rationale —** `StringSchema._clone`, `StringSchema._withCheck`, `StringSchema.min`, `StringSchema.max`, `StringSchema.length`, `StringSchema.pattern`, `StringSchema.email`, `StringSchema.url`, `StringSchema.uuid`, `StringSchema.trim`, `StringSchema.nonempty`, `NumberSchema._clone`, `NumberSchema._withCheck`, `NumberSchema.min`, `NumberSchema.max`, `NumberSchema.int`, `NumberSchema.positive`, `NumberSchema.nonnegative`, `NumberSchema.negative`, `DateSchema._clone`, `DateSchema._withCheck`, `DateSchema.min`, `DateSchema.max`, `BooleanSchema._clone`, `FunctionSchema._clone`, `AnySchema._clone`: Immutable fluent construction stays local: clone existing schema state, set the selected constraint, return the same typed builder contract. One-line shortcuts retain the fluent vocabulary; an extra wrapper would add indirection.
- **Retained rationale —** `FunctionSchema._validateInput`: A function default is a factory, so for `undefined` input it evaluates the default and validates its result, accepting a `null` or `undefined` fallback the schema allows; other input goes to the base rule. The presence choice is two guards around the shared `_getDefaultValue` and `_validate`.

Evidence: [props](_index.md#evidence-props); typecheck.

### [props/schema.ts](../../packages/forgeframe/src/props/schema.ts)

Standard Schema detection (including callable schemas such as ArkType types), issue-path formatting, and invoking a supplied schema (`runSchema`, which reports issues instead of throwing) are validation boundary operations. `validateWithSchema` runs `runSchema` and throws its issues as one "Validation failed" error. `isAsyncSchemaResult` observes unsupported promises across realms without awaiting validation, so direct and nested validation and the normalization default and output probes cannot leak rejected results. Its catch callback discards the refused result; callers see the synchronous error.

- **O:** `isStandardSchema`, `isAsyncSchemaResult`, `runSchema`, `formatIssuePath`.
- **M:** `validateWithSchema`.
- **O callbacks:** `runSchema.callback@289`, `formatIssuePath.callback@327`.
- **Retained rationale —** `validateWithSchema`: It runs `runSchema` and turns its issues into the thrown "Validation failed" error with one branch, the same shape as `validateUnchanged`; the throw belongs to the run it reports.

Evidence: [props](_index.md#evidence-props); typecheck.

### [props/serialize.ts](../../packages/forgeframe/src/props/serialize.ts)

Prop snapshots use the recursive bridge codec directly, so prop definitions do not affect encoding or decoding. `serializeProps` skips `undefined` values and props whose root `toJSON()` returns `undefined`. `deserializeProps` drops unsafe root keys with the bridge's `isSafeObjectKey` and decodes each value through the bridge, which reconstructs callbacks and `Date` values together inside the transport-owned batch. Decoding needs only the bridge and the consumer window and origin.

- **O:** `deserializeProps`.
- **M:** `serializeProps`.
- **Retained rationale —** `serializeProps`: It skips `undefined` values and encodes each other value through the bridge in one pass; the skip is one guard per key.

Evidence: [utilities](_index.md#evidence-utilities); typecheck.

### [props/types.ts](../../packages/forgeframe/src/props/types.ts)

**Contract only:** types, re-exports, or immutable declarations; no runtime callables.

Evidence: [props](_index.md#evidence-props); typecheck.
