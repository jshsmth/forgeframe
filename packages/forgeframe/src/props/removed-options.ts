/**
 * @packageDocumentation
 * Declaration policy for prop-definition options that ForgeFrame 2 removed.
 *
 * @remarks
 * `create()` and `initHost()` share this check, so definition modules used by
 * both the consumer and the host fail the same way on either side.
 */

import { isStandardSchema } from "./schema";

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
		const serialization = Object.getOwnPropertyDescriptor(
			definition,
			"serialization",
		);
		if (
			serialization &&
			(!("value" in serialization) || serialization.value !== undefined)
		) {
			throw new Error(
				`Prop "${key}" uses the removed "serialization" option. ForgeFrame 2 always sends props as JSON; remove the option.`,
			);
		}
	}
}
