import { ForgeFrameError } from "../../errors";
import { assertPropDefinitions } from "../../props/definition-checks";
import type { ReservedPropName } from "../../types/runtime";
import { hasOwnDeclaredField } from "../../utils/own-field";

/**
 * Prop names no component may define, and no host receives.
 *
 * @remarks
 * `then` would make the props object a thenable, so `await host.ready` would
 * never settle. `children` is reserved so React JSX children never reach
 * hosts. Host controls live on the `Host` handle, not on the props, so no
 * other name is reserved.
 *
 * @internal
 */
export const RESERVED_PROP_NAMES: ReadonlySet<string> =
	new Set<ReservedPropName>(["then", "children"] satisfies ReservedPropName[]);

/**
 * Throws when a definitions record defines a reserved prop name.
 *
 * @remarks
 * `create()` and `initHost()` share this declaration policy. Fields are read
 * by the own-field rule of `hasOwnDeclaredField`: entries set to `undefined`
 * count as omitted, and accessors are not invoked.
 *
 * @throws ForgeFrameError `VALIDATION` naming the first reserved prop
 * @internal
 */
export function assertNoReservedPropDefinitions(definitions: object): void {
	for (const key of Object.keys(definitions)) {
		if (RESERVED_PROP_NAMES.has(key) && hasOwnDeclaredField(definitions, key)) {
			throw new ForgeFrameError(
				"VALIDATION",
				`Prop "${key}" is reserved by ForgeFrame and cannot be defined as a custom prop`,
			);
		}
	}
}

/**
 * Checks a prop definitions object as `create()` and `initHost()` both
 * declare it: no reserved names, then every entry's own rules.
 *
 * @throws ForgeFrameError `VALIDATION` naming the first invalid prop
 * @internal
 */
export function assertPropDefinitionsObject(definitions: object): void {
	assertNoReservedPropDefinitions(definitions);
	assertPropDefinitions(definitions);
}
