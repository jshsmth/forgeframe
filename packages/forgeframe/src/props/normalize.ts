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

import type { PropDefinition, PropDelivery } from "../types/props";
import { isDate, isPlainObject } from "../utils/realm-values";
import { assertDefinedArrayEntries } from "../utils/wire-value";
import { matchDomain } from "../window/helpers";
import {
	isAsyncSchemaResult,
	isStandardSchema,
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
		.filter(([, definition]) => definition !== undefined)
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
 * Establishes that a converted value can be checked unchanged at later trust
 * boundaries. An explicit `outputSchema` must not transform it. Without one,
 * the input schema must also accept its own normalized output unchanged.
 */
function assertNormalizedOutputContract(
	value: unknown,
	{ key, definition }: CompiledPropDefinition,
): void {
	const outputSchema = definition.outputSchema;
	if (outputSchema && isStandardSchema(outputSchema)) {
		const validatedOutput = validateWithSchema(outputSchema, value, key);
		if (!schemaOutputMatchesInput(value, validatedOutput)) {
			throw new Error(
				`Validation failed: ${key}: outputSchema must not transform normalized values`,
			);
		}
		return;
	}

	const revalidated = validateWithSchema(definition.schema, value, key);
	if (!schemaOutputMatchesInput(value, revalidated)) {
		throw new Error(
			`Prop "${key}" requires outputSchema because its schema cannot validate the normalized value unchanged`,
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
		assertNormalizedOutputContract(value, compiled);
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
		const fallback = definition.schema["~standard"].validate(undefined);
		result[key] =
			isAsyncSchemaResult(fallback) || fallback.issues
				? undefined
				: fallback.value;
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
 * Each defined prop is checked with its `outputSchema`, or its schema when it
 * has none, including absent values. Validation must not change a value.
 *
 * @internal
 */
export function validateNormalizedProps(
	props: Readonly<Record<string, unknown>>,
	definitions: object,
): void {
	for (const { key, definition } of getCompiledPropDefinitions(definitions)) {
		const value = readSuppliedProp(props, key);
		const schema =
			definition.outputSchema && isStandardSchema(definition.outputSchema)
				? definition.outputSchema
				: definition.schema;
		const validated = validateWithSchema(schema, value, key);
		if (!schemaOutputMatchesInput(value, validated)) {
			throw new Error(
				`Validation failed: ${key}: value no longer matches its normalized schema output`,
			);
		}
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
	return matchDomain(deliverTo, target.hostOrigin);
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
