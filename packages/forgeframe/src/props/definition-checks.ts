/**
 * @packageDocumentation
 * Declaration checks for prop definitions.
 *
 * @remarks
 * `create()` and `initHost()` share these checks, so definition modules used
 * by both the consumer and the host fail the same way on either side. Other
 * declaration checks read fields through the same own-field rule.
 */

import { assertDomainMatcher } from "../utils/domain-pattern";
import { isStandardSchema } from "./schema";

/**
 * Reports whether a declaration sets one of its own fields.
 *
 * @remarks
 * Only own fields count, so inherited values are ignored. The descriptor is
 * read instead of the value, so an accessor is never invoked and counts as
 * set; a data field set to `undefined` counts as omitted.
 *
 * @internal
 */
export function hasOwnDeclaredField(target: object, key: PropertyKey): boolean {
	const descriptor = Object.getOwnPropertyDescriptor(target, key);
	return (
		descriptor !== undefined &&
		(!("value" in descriptor) || descriptor.value !== undefined)
	);
}

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
 * read again when props are normalized. A wrapped definition needs a
 * `schema`; `deliverTo` must be `'same-origin'` or an origin matcher;
 * `queryParam` and `bodyParam` must be a boolean or a non-empty parameter
 * name. Only own fields count, a data field set to `undefined` counts as
 * omitted, and accessors are never invoked.
 *
 * @param definitions - Prop definitions passed to `create()` or `initHost()`
 * @throws Error naming the first prop that is malformed, and the replacement
 * for a removed option
 *
 * @internal
 */
export function assertPropDefinitions(definitions: object): void {
	for (const key of Object.keys(definitions)) {
		if (!isDataField(definitions, key)) {
			throw new Error(
				`Prop "${key}" must be declared as a data field, not a getter or setter`,
			);
		}
		const definition = readDeclaredField(definitions, key);
		if (definition === undefined || isStandardSchema(definition)) continue;
		if (typeof definition !== "object" || definition === null) {
			throw new Error(
				`Prop "${key}" must be a schema or a { schema } definition`,
			);
		}
		assertWrappedPropDefinition(key, definition);
	}
}

/** Checks one wrapped definition's fields. */
function assertWrappedPropDefinition(key: string, definition: object): void {
	for (const [option, replacement] of Object.entries(REMOVED_PROP_OPTIONS)) {
		if (hasOwnDeclaredField(definition, option)) {
			throw new Error(
				`Prop "${key}" uses the removed "${option}" option. ${replacement}`,
			);
		}
	}
	if (!isStandardSchema(readDeclaredField(definition, "schema"))) {
		throw new Error(
			`Prop "${key}" needs a schema. Use prop.any() for a value that is deliberately unchecked.`,
		);
	}
	const deliverTo = readDeclaredField(definition, "deliverTo");
	if (deliverTo !== undefined && deliverTo !== "same-origin") {
		if (Array.isArray(deliverTo) && deliverTo.includes("same-origin")) {
			throw new Error(
				`Prop "${key}" deliverTo cannot list 'same-origin' in an array; pass deliverTo: 'same-origin' on its own, or list origins only`,
			);
		}
		assertDomainMatcher(deliverTo, `Prop "${key}" deliverTo`);
	}
	for (const option of ["queryParam", "bodyParam"] as const) {
		const parameter = readDeclaredField(definition, option);
		if (
			parameter !== undefined &&
			typeof parameter !== "boolean" &&
			(typeof parameter !== "string" || parameter.trim() === "")
		) {
			throw new Error(
				`Prop "${key}" ${option} must be a boolean or a non-empty parameter name. To encode a value, pass the encoded string as its own prop, or build the URL in a url(props) function.`,
			);
		}
	}
}
