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
 * Entries set to `undefined` count as omitted. `create()` and `initHost()`
 * share this declaration policy.
 *
 * @throws Error naming the first reserved prop
 * @internal
 */
export function assertNoReservedPropDefinitions(
	definitions: Record<string, unknown>,
): void {
	for (const key of Object.keys(definitions)) {
		if (HOST_PROPS_BUILTIN_KEYS.has(key) && definitions[key] !== undefined) {
			throw new Error(
				`Prop "${key}" is reserved by hostProps built-ins and cannot be defined as a custom prop`,
			);
		}
	}
}
