/**
 * @packageDocumentation
 * The own-field rule that declaration checks read fields through. It has no
 * dependencies, so the React entry can share it without pulling in the
 * definition checks.
 */

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
