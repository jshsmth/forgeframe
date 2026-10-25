import { hasOwnDeclaredField } from "../../props/removed-options";

/**
 * Host-side built-in keys that are reserved on `hostProps`.
 *
 * @internal
 */
export const HOST_PROPS_BUILTIN_KEYS = new Set([
	"uid",
	"tag",
	"close",
	"focus",
	"resize",
	"show",
	"hide",
	"onProps",
	"onError",
	"getConsumer",
	"getConsumerDomain",
	"export",
	"consumer",
	"getPeerInstances",
	"children",
]);

/**
 * Throws when a definitions record defines a reserved built-in name.
 *
 * @remarks
 * `create()` and `initHost()` share this declaration policy. Fields are read
 * by the own-field rule of `hasOwnDeclaredField`: entries set to `undefined`
 * count as omitted, and accessors are not invoked.
 *
 * @throws Error naming the first reserved prop
 * @internal
 */
export function assertNoReservedPropDefinitions(definitions: object): void {
	for (const key of Object.keys(definitions)) {
		if (
			HOST_PROPS_BUILTIN_KEYS.has(key) &&
			hasOwnDeclaredField(definitions, key)
		) {
			throw new Error(
				`Prop "${key}" is reserved by hostProps built-ins and cannot be defined as a custom prop`,
			);
		}
	}
}
