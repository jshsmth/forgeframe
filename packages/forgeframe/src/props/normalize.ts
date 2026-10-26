/**
 * @packageDocumentation
 * Props normalization, validation, and delivery policy.
 *
 * @remarks
 * Each defined prop's schema is the single source of its presence, default,
 * and value: normalization runs the schema on the supplied value, including
 * `undefined` for an omitted prop. Delivery policy decides which normalized
 * props reach a host through postMessage, the query string, or a POST body.
 */

import { ForgeFrameError } from "../errors";
import type { PropDefinition, PropDelivery } from "../types/props";
import { isDate, isPlainObject } from "../utils/realm-values";
import { assertDefinedArrayEntries } from "../utils/wire-value";
import { matchOrigin } from "../window/helpers";
import { SELF_ACCEPTANCE_MIGRATIONS } from "./definition-checks";
import {
	isStandardSchema,
	runSchema,
	type StandardSchemaV1,
	validateWithSchema,
} from "./schema";

interface CompiledPropDefinition {
	key: string;
	definition: PropDefinition;
}

const compiledPropDefinitionsCache = new WeakMap<
	object,
	readonly CompiledPropDefinition[]
>();

const hasOwn = (value: object, key: PropertyKey): boolean =>
	Object.hasOwn(value, key);

function schemaOutputMatchesInput(
	input: unknown,
	output: unknown,
	seen = new WeakMap<object, object>(),
): boolean {
	if (Object.is(input, output)) {
		return true;
	}

	if (
		typeof input !== "object" ||
		input === null ||
		typeof output !== "object" ||
		output === null
	) {
		return false;
	}

	if (isDate(input) || isDate(output)) {
		return (
			isDate(input) &&
			isDate(output) &&
			Object.is(input.getTime(), output.getTime())
		);
	}

	if (input instanceof URL || output instanceof URL) {
		return (
			input instanceof URL &&
			output instanceof URL &&
			input.href === output.href
		);
	}

	const inputIsArray = Array.isArray(input);
	if (inputIsArray !== Array.isArray(output)) {
		return false;
	}

	const inputPrototype = Object.getPrototypeOf(input) as object | null;
	const outputPrototype = Object.getPrototypeOf(output) as object | null;
	if (
		inputPrototype !== outputPrototype &&
		!(
			inputPrototype !== null &&
			outputPrototype !== null &&
			isPlainObject(input) &&
			isPlainObject(output)
		)
	) {
		return false;
	}

	if (!inputIsArray && !isPlainObject(input)) {
		return false;
	}

	const seenOutput = seen.get(input);
	if (seenOutput) {
		return seenOutput === output;
	}
	seen.set(input, output);

	const inputKeys = Reflect.ownKeys(input);
	const outputKeys = Reflect.ownKeys(output);
	if (inputKeys.length !== outputKeys.length) {
		return false;
	}

	for (const key of inputKeys) {
		const inputDescriptor = Object.getOwnPropertyDescriptor(input, key);
		const outputDescriptor = Object.getOwnPropertyDescriptor(output, key);
		if (
			!inputDescriptor ||
			!outputDescriptor ||
			!("value" in inputDescriptor) ||
			!("value" in outputDescriptor) ||
			!schemaOutputMatchesInput(
				inputDescriptor.value,
				outputDescriptor.value,
				seen,
			)
		) {
			return false;
		}
	}

	return true;
}

function getCompiledPropDefinitions(
	definitions: object,
): readonly CompiledPropDefinition[] {
	const cacheKey = definitions;
	const cached = compiledPropDefinitionsCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const compiledDefinitions = Object.entries(definitions)
		.filter(([key]) => isDeclaredProp(definitions, key))
		.map(([key, definition]) => ({
			key,
			definition: (isStandardSchema(definition)
				? { schema: definition }
				: definition) as PropDefinition,
		}));

	compiledPropDefinitionsCache.set(cacheKey, compiledDefinitions);
	return compiledDefinitions;
}

/** Reads a supplied own value, treating an absent key as `undefined`. */
function readSuppliedProp(props: object, key: string): unknown {
	return hasOwn(props, key)
		? (props as Record<string, unknown>)[key]
		: undefined;
}

/**
 * Returns whether a definitions object declares a prop: an own entry whose
 * value is not `undefined`.
 */
function isDeclaredProp(definitions: object, key: string): boolean {
	return (
		hasOwn(definitions, key) &&
		(definitions as Record<string, unknown>)[key] !== undefined
	);
}

/**
 * Keeps the wire fields a host expects: fields for declared props delivered
 * to this host. Undeclared fields, including those for definition entries set
 * to `undefined`, are dropped, so no unvalidated value reaches host state.
 * Returns `props` itself when nothing is dropped.
 * @internal
 */
export function selectExpectedFields<T extends Record<string, unknown>>(
	props: T,
	deliveredDefinitions: object,
): T {
	const entries = Object.entries(props);
	const expected = entries.filter(([key]) => hasOwn(deliveredDefinitions, key));
	return expected.length === entries.length
		? props
		: (Object.fromEntries(expected) as T);
}

/**
 * Outcome of validating a normalized value with its own prop schema.
 * @internal
 */
export type UnchangedValidationOutcome =
	| { status: "unchanged" }
	| { status: "changed" }
	| { status: "rejected"; issues: string };

/**
 * Validates a normalized value with its prop schema and compares the result.
 *
 * @remarks
 * Every trust boundary uses this check: normalization, the consumer's
 * rechecks, and host validation. A value is unchanged when the schema accepts
 * it and returns a structurally equal value.
 *
 * @throws Error when the schema is async
 * @internal
 */
export function validateUnchanged(
	schema: StandardSchemaV1,
	value: unknown,
	key: string,
): UnchangedValidationOutcome {
	const result = runSchema(schema, value, key);
	if ("issues" in result) return { status: "rejected", issues: result.issues };
	return schemaOutputMatchesInput(value, result.value)
		? { status: "unchanged" }
		: { status: "changed" };
}

/**
 * Throws when normalization finds a prop schema that does not accept its own
 * output unchanged.
 *
 * @remarks
 * Delivered and consumer-only values are rechecked with the same schema, so a
 * schema that changes the type or re-applies a transform is a definition
 * mistake, reported here with the migrations.
 */
function assertSelfAccepting(
	outcome: UnchangedValidationOutcome,
	key: string,
): void {
	if (outcome.status === "unchanged") return;
	const reason =
		outcome.status === "changed"
			? "the schema changed the value"
			: `the schema rejected it: ${outcome.issues}`;
	throw new ForgeFrameError(
		"VALIDATION",
		`Validation failed: ${key}: the prop schema must accept its own output unchanged, because ForgeFrame validates delivered values with the same schema; ${reason}. ${SELF_ACCEPTANCE_MIGRATIONS}`,
	);
}

/**
 * Throws when a trust boundary finds a normalized value its schema rejects
 * or changes.
 */
function assertValidatesUnchanged(
	outcome: UnchangedValidationOutcome,
	key: string,
): void {
	if (outcome.status === "rejected") {
		throw new ForgeFrameError(
			"VALIDATION",
			`Validation failed: ${outcome.issues}`,
		);
	}
	if (outcome.status === "changed") {
		throw new ForgeFrameError(
			"VALIDATION",
			`Validation failed: ${key}: value no longer matches its normalized schema output`,
		);
	}
}

/**
 * Converts supplied inputs to normalized props with each defined schema.
 *
 * @remarks
 * An omitted prop is validated as `undefined`, so a schema that rejects
 * `undefined` makes the prop required and a schema default supplies its
 * fallback. Undeclared inputs are dropped.
 *
 * @param input - Supplied schema inputs
 * @param definitions - Prop definitions
 * @param keys - Keys to normalize; every defined key when omitted
 * @returns Normalized values for the selected keys
 * @throws Error with the schema's "Validation failed" message
 *
 * @internal
 */
export function normalizeProps(
	input: Readonly<Record<string, unknown>>,
	definitions: object,
	keys?: ReadonlySet<string>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const compiled of getCompiledPropDefinitions(definitions)) {
		if (keys && !keys.has(compiled.key)) continue;
		const value = validateWithSchema(
			compiled.definition.schema,
			readSuppliedProp(input, compiled.key),
			compiled.key,
		);
		assertSelfAccepting(
			validateUnchanged(compiled.definition.schema, value, compiled.key),
			compiled.key,
		);
		result[compiled.key] = value;
	}
	return result;
}

/**
 * Builds a best-effort snapshot after construction-time normalization failed.
 *
 * @remarks
 * Supplied values are kept as given and omitted props take their schema
 * default when the schema provides one. The snapshot is never delivered: the
 * original failure is rethrown until an update normalizes successfully.
 *
 * @internal
 */
export function buildUnnormalizedProps(
	input: Readonly<Record<string, unknown>>,
	definitions: object,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const { key, definition } of getCompiledPropDefinitions(definitions)) {
		if (hasOwn(input, key) && input[key] !== undefined) {
			result[key] = input[key];
			continue;
		}
		try {
			result[key] = validateWithSchema(definition.schema, undefined, key);
		} catch {
			result[key] = undefined;
		}
	}
	return result;
}

/**
 * Rechecks supplied schema inputs without replacing normalized values.
 *
 * @remarks
 * Supplied objects stay referenced by the caller, so a later mutation can make
 * an input invalid after it was normalized.
 *
 * @internal
 */
export function revalidatePropInputs(
	input: Readonly<Record<string, unknown>>,
	definitions: object,
	keys: ReadonlySet<string>,
): void {
	for (const { key, definition } of getCompiledPropDefinitions(definitions)) {
		if (keys.has(key)) validateWithSchema(definition.schema, input[key], key);
	}
}

/**
 * Validates already-normalized props at a consumer or host trust boundary.
 *
 * @remarks
 * Each defined prop, including an absent one, must pass its schema unchanged.
 * A consumer update skips the keys it has just normalized, because
 * normalization already ran the same check on them.
 *
 * @param excluded - Keys already checked by normalization
 * @internal
 */
export function validateNormalizedProps(
	props: Readonly<Record<string, unknown>>,
	definitions: object,
	excluded?: ReadonlySet<string>,
): void {
	for (const { key, definition } of getCompiledPropDefinitions(definitions)) {
		if (excluded?.has(key)) continue;
		assertValidatesUnchanged(
			validateUnchanged(definition.schema, readSuppliedProp(props, key), key),
			key,
		);
	}
}

/**
 * Observed facts about the host a prop would be delivered to.
 * @internal
 */
export interface PropDeliveryTarget {
	/** The host origin, as verified by the browser or pinned by the URL */
	hostOrigin: string;
	/** Whether the host is verified to share the consumer's origin */
	sameOrigin: boolean;
}

/**
 * Describes a host from its origin and the consumer's origin.
 *
 * @remarks
 * Both sides use this rule, so they agree on whether a host is same-origin.
 * An opaque (`"null"`) origin is never same-origin.
 *
 * @internal
 */
export function createDeliveryTarget(
	hostOrigin: string,
	consumerOrigin: string,
): PropDeliveryTarget {
	return {
		hostOrigin,
		sameOrigin: hostOrigin !== "null" && hostOrigin === consumerOrigin,
	};
}

/**
 * Decides whether a prop reaches a host.
 *
 * @remarks
 * The same decision governs bootstrap and update snapshots, the initial query
 * string and POST body, and which props a host expects to receive.
 *
 * @internal
 */
export function isPropDelivered(
	definition: Pick<PropDefinition, "sendToHost" | "deliverTo">,
	target: PropDeliveryTarget,
): boolean {
	if (definition.sendToHost === false) return false;
	const deliverTo: PropDelivery | undefined = definition.deliverTo;
	if (deliverTo === undefined) return true;
	if (deliverTo === "same-origin") return target.sameOrigin;
	return matchOrigin(deliverTo, target.hostOrigin);
}

/**
 * Selects the definitions whose props a host receives.
 *
 * @internal
 */
export function getDeliveredPropDefinitions<D extends object>(
	definitions: D,
	target: PropDeliveryTarget,
): Partial<D> {
	return Object.fromEntries(
		getCompiledPropDefinitions(definitions)
			.filter(({ definition }) => isPropDelivered(definition, target))
			.map(({ key }) => [key, definitions[key as keyof D]]),
	) as Partial<D>;
}

/**
 * Selects the normalized props delivered to a host.
 *
 * @throws Error when a delivered array has an `undefined` entry or a hole
 *
 * @internal
 */
export function getPropsForHost(
	props: Readonly<Record<string, unknown>>,
	definitions: object,
	target: PropDeliveryTarget,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const { key, definition } of getCompiledPropDefinitions(definitions)) {
		if (!isPropDelivered(definition, target)) continue;
		assertDefinedArrayEntries(props[key], [key]);
		result[key] = props[key];
	}
	return result;
}

/**
 * Checks delivered arrays before render resources exist or an update commits.
 *
 * @internal
 */
export function validatePropsForHostTransport(
	props: Readonly<Record<string, unknown>>,
	definitions: object,
	target: PropDeliveryTarget,
): void {
	getPropsForHost(props, definitions, target);
}

/**
 * Builds the initial request's parameters for props marked by `option`.
 *
 * @remarks
 * The host is not loaded yet, so it cannot be verified as same-origin:
 * `deliverTo: 'same-origin'` props are never sent in the initial request.
 * Delivery policy runs before encoding.
 */
function propsToRequestParams(
	props: Readonly<Record<string, unknown>>,
	definitions: object,
	hostOrigin: string,
	option: "queryParam" | "bodyParam",
): URLSearchParams {
	const params = new URLSearchParams();

	for (const { key, definition } of getCompiledPropDefinitions(definitions)) {
		const parameter = definition[option];
		if (!parameter) continue;
		if (!isPropDelivered(definition, { hostOrigin, sameOrigin: false }))
			continue;

		const paramValue = serializePropParameter(props[key]);
		if (paramValue === undefined) continue;
		params.set(typeof parameter === "string" ? parameter : key, paramValue);
	}

	return params;
}

/**
 * Builds URL query parameters from props with the `queryParam` option.
 *
 * @param props - Normalized props
 * @param definitions - Prop definitions
 * @param hostOrigin - Origin of the pinned host URL
 * @returns Query parameters for the initial request
 *
 * @internal
 */
export function propsToQueryParams(
	props: Readonly<Record<string, unknown>>,
	definitions: object,
	hostOrigin: string,
): URLSearchParams {
	return propsToRequestParams(props, definitions, hostOrigin, "queryParam");
}

/**
 * Builds POST body parameters from props with the `bodyParam` option.
 *
 * @param props - Normalized props
 * @param definitions - Prop definitions
 * @param hostOrigin - Origin of the pinned host URL
 * @returns Body parameters for the initial request
 *
 * @internal
 */
export function propsToBodyParams(
	props: Readonly<Record<string, unknown>>,
	definitions: object,
	hostOrigin: string,
): URLSearchParams {
	return propsToRequestParams(props, definitions, hostOrigin, "bodyParam");
}

/**
 * Encodes an admitted query/body value. Dates use their ISO string, other
 * objects JSON, and other values string conversion; `undefined`, `null`,
 * functions, invalid dates, and objects whose JSON encoding is `undefined` are
 * omitted.
 */
function serializePropParameter(value: unknown): string | undefined {
	if (value === undefined || value === null || typeof value === "function")
		return undefined;
	if (isDate(value)) return value.toJSON() ?? undefined;
	return typeof value === "object" ? JSON.stringify(value) : String(value);
}
