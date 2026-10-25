/**
 * @packageDocumentation
 * Declaration policy for prop-definition options that ForgeFrame 2 removed.
 *
 * @remarks
 * `create()` and `initHost()` share this check, so definition modules used by
 * both the consumer and the host fail the same way on either side. Other
 * declaration checks read fields through the same own-field rule.
 */

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
 * Throws when a wrapped prop definition still sets a removed option.
 *
 * @remarks
 * A direct Standard Schema is not a wrapped definition, so its fields are
 * never read. Only own fields count, and a data field set to `undefined`
 * counts as omitted, matching the rule for `undefined` definition entries.
 * Descriptors are read instead of values, so accessor-defined entries are not
 * invoked during declaration.
 *
 * @param definitions - Prop definitions passed to `create()` or `initHost()`
 * @throws Error naming the first prop that sets a removed option
 *
 * @internal
 */
export function assertNoRemovedPropOptions(definitions: object): void {
	for (const key of Object.keys(definitions)) {
		const definition = Object.getOwnPropertyDescriptor(definitions, key)?.value;
		if (
			typeof definition !== "object" ||
			definition === null ||
			isStandardSchema(definition)
		)
			continue;
		if (hasOwnDeclaredField(definition, "serialization")) {
			throw new Error(
				`Prop "${key}" uses the removed "serialization" option. ForgeFrame 2 always sends props as JSON; remove the option.`,
			);
		}
	}
}
