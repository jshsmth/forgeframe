/**
 * @packageDocumentation
 * Declaration checks for prop definitions.
 *
 * @remarks
 * `create()` and `initHost()` share these checks, so definition modules used
 * by both the consumer and the host fail the same way on either side. Other
 * declaration checks read fields through the same own-field rule.
 */

import { ForgeFrameError } from "../errors";
import { assertOriginMatcher } from "../utils/origin-pattern";
import { hasOwnDeclaredField } from "../utils/own-field";
import { isStandardSchema } from "./schema";

/**
 * The ways to keep a call site convenient when a schema cannot accept its own
 * output; normalization's violation message lists them too.
 * @internal
 */
export const SELF_ACCEPTANCE_MIGRATIONS =
	"Pass the type the host should receive, accept both forms in one schema (such as z.coerce.number()), or convert the value in the host.";

/**
 * Wrapped-definition options removed in ForgeFrame 2, each with its replacement.
 */
const REMOVED_PROP_OPTIONS: Readonly<Record<string, string>> = {
	serialization: "ForgeFrame 2 always sends props as JSON; remove the option.",
	required:
		"A prop is required exactly when its schema rejects undefined; use the schema's .optional() to make it optional.",
	default:
		"Use the schema's .default(), or compute the value before passing it.",
	value: "Use the schema's .default(), or compute the value before passing it.",
	decorate: "Use a schema transform instead, such as prop.string().trim().",
	hostDecorate: "Transform the value on the host after it is received.",
	validate:
		"Use a schema refinement, or the component's validate({ props }) option for cross-prop rules.",
	alias: "Rename the input to the prop's key before calling the factory.",
	sameDomain: "Use deliverTo: 'same-origin' instead.",
	trustedDomains:
		"Use deliverTo with an origin string, a RegExp, or an array of them instead.",
	outputSchema: `Each prop now has one schema, which must accept its own output unchanged. ${SELF_ACCEPTANCE_MIGRATIONS}`,
};

/** Reports whether an own field holds a value rather than an accessor. */
function isDataField(target: object, key: string): boolean {
	const descriptor = Object.getOwnPropertyDescriptor(target, key);
	return descriptor !== undefined && "value" in descriptor;
}

/** Reads an own data field without invoking an accessor. */
function readDeclaredField(target: object, key: string): unknown {
	const descriptor = Object.getOwnPropertyDescriptor(target, key);
	return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

/**
 * Throws when a prop definition is malformed or still uses a removed option.
 *
 * @remarks
 * A direct Standard Schema is not a wrapped definition, so its fields are
 * never read. Each entry must be a data field, because the definitions are
 * read again when props are normalized; so must each field of a wrapped
 * definition that delivery reads. A wrapped definition needs a
 * `schema` and has no fields beyond the delivery options, so a misspelled
 * option fails instead of being ignored; `deliverTo` must be `'same-origin'`
 * or an origin matcher; `sendToHost` must be a boolean; `queryParam` and
 * `bodyParam` must be a boolean or a non-empty parameter name, are never
 * combined with `deliverTo: 'same-origin'`, and no two props share a query or
 * body parameter name. Only own fields count, a data field set to `undefined`
 * counts as omitted, and accessors are never invoked.
 *
 * @param definitions - Prop definitions passed to `create()` or `initHost()`
 * @throws Error naming the first prop that is malformed, and the replacement
 * for a removed option
 *
 * @internal
 */
export function assertPropDefinitions(definitions: object): void {
	const parameters = { queryParam: new Map(), bodyParam: new Map() } as const;
	for (const key of Object.keys(definitions)) {
		if (!isDataField(definitions, key)) {
			throw new ForgeFrameError(
				"VALIDATION",
				`Prop "${key}" must be declared as a data field, not a getter or setter`,
			);
		}
		const definition = readDeclaredField(definitions, key);
		if (definition === undefined || isStandardSchema(definition)) continue;
		if (typeof definition !== "object" || definition === null) {
			throw new ForgeFrameError(
				"VALIDATION",
				`Prop "${key}" must be a schema or a { schema } definition`,
			);
		}
		assertWrappedPropDefinition(key, definition);
		for (const option of PARAMETER_OPTIONS) {
			const name = readParameterName(key, definition, option);
			if (name === undefined) continue;
			const owner = parameters[option].get(name);
			if (owner !== undefined) {
				throw new ForgeFrameError(
					"VALIDATION",
					`Props "${owner}" and "${key}" both use the ${option} name "${name}"; one value would overwrite the other`,
				);
			}
			parameters[option].set(name, key);
		}
	}
}

const PARAMETER_OPTIONS = ["queryParam", "bodyParam"] as const;

/** The query or body parameter name a checked definition sends, if any. */
function readParameterName(
	key: string,
	definition: object,
	option: (typeof PARAMETER_OPTIONS)[number],
): string | undefined {
	const parameter = readDeclaredField(definition, option);
	if (parameter === true) return key;
	return typeof parameter === "string" ? parameter : undefined;
}

/** Wrapped-definition fields that delivery reads again after this check. */
const DELIVERY_FIELDS = [
	"schema",
	"deliverTo",
	"sendToHost",
	"queryParam",
	"bodyParam",
] as const;

/** Checks one wrapped definition's fields. */
function assertWrappedPropDefinition(key: string, definition: object): void {
	for (const field of DELIVERY_FIELDS) {
		if (field in definition && !isDataField(definition, field)) {
			throw new ForgeFrameError(
				"VALIDATION",
				`Prop "${key}" ${field} must be declared as an own data field, not a getter, setter or inherited field`,
			);
		}
	}
	for (const [option, replacement] of Object.entries(REMOVED_PROP_OPTIONS)) {
		if (hasOwnDeclaredField(definition, option)) {
			throw new ForgeFrameError(
				"VALIDATION",
				`Prop "${key}" uses the removed "${option}" option. ${replacement}`,
			);
		}
	}
	const unknownField = Reflect.ownKeys(definition).find(
		(field) =>
			!(DELIVERY_FIELDS as readonly PropertyKey[]).includes(field) &&
			hasOwnDeclaredField(definition, field),
	);
	if (unknownField !== undefined) {
		throw new ForgeFrameError(
			"VALIDATION",
			`Prop "${key}" has the unknown option "${String(unknownField)}". A wrapped definition accepts only ${DELIVERY_FIELDS.join(", ")}.`,
		);
	}
	const sendToHost = readDeclaredField(definition, "sendToHost");
	if (sendToHost !== undefined && typeof sendToHost !== "boolean") {
		throw new ForgeFrameError(
			"VALIDATION",
			`Prop "${key}" sendToHost must be a boolean`,
		);
	}
	if (!isStandardSchema(readDeclaredField(definition, "schema"))) {
		throw new ForgeFrameError(
			"VALIDATION",
			`Prop "${key}" needs a schema. Use prop.any() for a value that is deliberately unchecked.`,
		);
	}
	const deliverTo = readDeclaredField(definition, "deliverTo");
	if (deliverTo !== undefined && deliverTo !== "same-origin") {
		if (Array.isArray(deliverTo) && deliverTo.includes("same-origin")) {
			throw new ForgeFrameError(
				"VALIDATION",
				`Prop "${key}" deliverTo cannot list 'same-origin' in an array; pass deliverTo: 'same-origin' on its own, or list origins only`,
			);
		}
		assertOriginMatcher(deliverTo, `Prop "${key}" deliverTo`);
	}
	for (const option of PARAMETER_OPTIONS) {
		const parameter = readDeclaredField(definition, option);
		if (
			parameter !== undefined &&
			typeof parameter !== "boolean" &&
			(typeof parameter !== "string" || parameter.trim() === "")
		) {
			throw new ForgeFrameError(
				"VALIDATION",
				`Prop "${key}" ${option} must be a boolean or a non-empty parameter name. To encode a value, pass the encoded string as its own prop, or build the URL in a url(props) function.`,
			);
		}
		if (
			deliverTo === "same-origin" &&
			parameter !== undefined &&
			parameter !== false
		) {
			throw new ForgeFrameError(
				"VALIDATION",
				`Prop "${key}" cannot combine ${option} with deliverTo: 'same-origin'; a same-origin prop never appears in the URL or POST body`,
			);
		}
	}
}
