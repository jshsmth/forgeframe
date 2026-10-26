/**
 * @packageDocumentation
 * Component factory and registry module.
 *
 * @remarks
 * This module provides the main entry point for creating ForgeFrame components.
 * It manages a global registry of all defined components and handles component
 * creation, validation, and global teardown.
 */

import { CONTEXT } from "../constants";
import {
	assertPropDefinitions,
	hasOwnDeclaredField,
} from "../props/definition-checks";
import type { StandardSchemaV1 } from "../props/schema";
import type {
	InferPropsDefinition,
	InferPropsDefinitionInput,
} from "../types/props";
import type {
	ComponentOptions,
	ComponentPropsInput,
	ForgeFrameComponent,
	ForgeFrameComponentInstance,
	InferablePropsDefinition,
	InferredComponentOptions,
} from "../types/runtime";
import { hasBrowserWindow } from "../utils/browser";
import { assertDomainMatcher } from "../utils/domain-pattern";
import { resolveComponentHostUrl } from "../utils/url";
import {
	clearIndexedInstances,
	clearIndexedInstancesByTag,
	getIndexedComponentInstances,
	indexComponentInstance,
	removeIndexedComponentInstance,
} from "./component-instance-index";
import {
	clearRegisteredComponents,
	deleteRegisteredComponent,
	getRegisteredComponent,
	hasRegisteredComponent,
	registerComponent,
} from "./component-registry";
import { ConsumerComponent } from "./consumer";
import { assertNoReservedPropDefinitions } from "./host/builtin-keys";

/**
 * Validates component configuration options.
 *
 * @param options - The component options to validate
 * @throws Error if tag is missing, invalid, or already registered
 * @throws Error if url is missing
 * @internal
 */
function validateComponentOptions<P, SchemaInputs>(
	options: ComponentOptions<P, SchemaInputs>,
): void {
	assertComponentShape(options);
	validateStaticComponentUrl(options);
	if (hasRegisteredComponent(options.tag)) {
		throw new Error(`Component "${options.tag}" is already registered`);
	}
}

/** Checks component declaration policy without browser or registry access. */
function assertComponentShape<P, SchemaInputs>(
	options: ComponentOptions<P, SchemaInputs>,
): void {
	if (
		typeof options !== "object" ||
		options === null ||
		Array.isArray(options)
	) {
		throw new Error("Component options must be an object");
	}
	if (!options.tag) {
		throw new Error("Component tag is required");
	}

	if (
		typeof options.tag !== "string" ||
		!/^[a-z][a-z0-9-]*$/.test(options.tag)
	) {
		throw new Error(
			`Invalid component tag "${options.tag}". Must start with lowercase letter and contain only lowercase letters, numbers, and hyphens.`,
		);
	}

	if (!options.url) {
		throw new Error("Component url is required");
	}
	if (typeof options.url !== "string" && typeof options.url !== "function") {
		throw new Error("Component url must be a string or a function");
	}
	if (
		options.defaultContext !== undefined &&
		options.defaultContext !== CONTEXT.IFRAME &&
		options.defaultContext !== CONTEXT.POPUP
	) {
		throw new Error('Component defaultContext must be "iframe" or "popup"');
	}
	if (
		options.timeout !== undefined &&
		(typeof options.timeout !== "number" ||
			!Number.isFinite(options.timeout) ||
			options.timeout < 0 ||
			options.timeout > 2147483647)
	) {
		throw new Error(
			"Component timeout must be a finite number between 0 and 2147483647 milliseconds",
		);
	}

	if (
		options.cspNonce !== undefined &&
		(typeof options.cspNonce !== "string" || options.cspNonce === "")
	) {
		throw new Error("Component cspNonce must be a non-empty string");
	}

	assertNoRemovedComponentOptions(options);

	for (const option of ["domain", "peerDomains"] as const) {
		if (options[option] !== undefined)
			assertDomainMatcher(options[option], `Component ${option}`);
	}

	if (options.props) {
		assertNoReservedPropDefinitions(options.props);
		assertPropDefinitions(options.props);
	}
}

/**
 * Removed options a JavaScript caller may still pass. Ignoring them would
 * silently drop a safeguard or a capability, so each names its replacement.
 */
const REMOVED_COMPONENT_OPTIONS: Readonly<Record<string, string>> = {
	// The host enforces its consumer allowlist; a definition-side one would be
	// silently ignored.
	allowedConsumerDomains:
		'Component option "allowedConsumerDomains" was removed. Pass the allowlist to the host instead: initHost(Component, { consumerOrigins }).',
	eligible:
		'Component option "eligible" was removed. Throw from the component validate({ props }) option instead.',
	children:
		'Component option "children" was removed. Import child components in the host page and render them there; each child host calls initHost(Child, { consumerOrigins }).',
};

/** Throws a migration error for any removed component option. */
function assertNoRemovedComponentOptions(options: object): void {
	for (const [option, message] of Object.entries(REMOVED_COMPONENT_OPTIONS)) {
		if (hasOwnDeclaredField(options, option)) throw new Error(message);
	}
}

/** Resolves static URLs using the browser's navigation base when available. */
function validateStaticComponentUrl<P, SchemaInputs>(
	options: ComponentOptions<P, SchemaInputs>,
): void {
	// Validate URL format if it's a string (can't validate function URLs at definition time)
	if (typeof options.url === "string") {
		const context = staticUrlValidationContext(
			options.url,
			hasBrowserWindow() ? document.baseURI : null,
		);

		resolveComponentHostUrl(
			options.url,
			context.baseUrl,
			context.enforceDomain ? options.domain : undefined,
		);
	}
}

/** Relative declarations defer origin policy until a real browser origin is available. */
function staticUrlValidationContext(
	url: string,
	browserBaseUrl: string | null,
): { baseUrl: string; enforceDomain: boolean } {
	let absolute = true;
	try {
		new URL(url);
	} catch {
		absolute = false;
	}
	return {
		baseUrl: browserBaseUrl ?? "https://forgeframe.invalid",
		enforceDomain: browserBaseUrl !== null || absolute,
	};
}

/** Removes one identity from the factory-owned list. */
function removeTrackedInstance<T>(instances: T[], instance: T): void {
	const index = instances.indexOf(instance);
	if (index !== -1) instances.splice(index, 1);
}

/**
 * Creates a new ForgeFrame component definition.
 *
 * @remarks
 * This is the main entry point for defining components. It creates a factory
 * function that can be called with props to create component instances.
 * Defining a component never starts a host; a host page passes the factory to
 * `initHost()`.
 *
 * @typeParam P - The props type for the component
 * @typeParam X - The exports type that the host can expose
 * @typeParam SchemaInputs - Canonical input types accepted by prop schemas
 * @param options - Component configuration options
 * @returns A component factory function
 *
 * @example
 * ```typescript
 * import { create, prop } from 'forgeframe';
 *
 * const LoginComponent = create({
 *   tag: 'login-component',
 *   url: 'https://auth.example.com/login',
 *   props: {
 *     email: prop.string(),
 *     onLogin: prop.function<(user: { id: string }) => void>(),
 *   },
 * });
 *
 * const instance = LoginComponent({ email: 'user@example.com', onLogin: () => {} });
 * await instance.render('#container');
 * ```
 *
 * @public
 */
export function create<
	const D extends InferablePropsDefinition,
	X = unknown,
	ContextualSchemas extends Record<string, StandardSchemaV1> = {
		[K in keyof D]: D[K] extends StandardSchemaV1
			? D[K]
			: D[K] extends { schema: infer Schema extends StandardSchemaV1 }
				? Schema
				: never;
	},
>(
	options: InferredComponentOptions<D, ContextualSchemas>,
): ForgeFrameComponent<
	InferPropsDefinition<D>,
	X,
	Record<PropertyKey, never> extends ComponentPropsInput<
		InferPropsDefinition<D>,
		InferPropsDefinitionInput<D>
	>
		? false
		: true,
	InferPropsDefinitionInput<D>
>;
export function create<
	P extends Record<string, unknown> = Record<string, unknown>,
	X = unknown,
	SchemaInputs extends Record<string, unknown> = P,
>(
	options: ComponentOptions<P, SchemaInputs>,
): ForgeFrameComponent<P, X, false, SchemaInputs>;
export function create<
	P extends Record<string, unknown> = Record<string, unknown>,
	X = unknown,
	SchemaInputs extends Record<string, unknown> = P,
>(
	options: ComponentOptions<P, SchemaInputs>,
): ForgeFrameComponent<P, X, false, SchemaInputs> {
	validateComponentOptions(options);
	const runtimeOptions = options;

	const instances: ForgeFrameComponentInstance<P, X, SchemaInputs>[] = [];
	const componentTag = options.tag;

	function untrackInstance(
		instance: ConsumerComponent<P, X, SchemaInputs>,
	): void {
		removeTrackedInstance(instances, instance);
		removeIndexedComponentInstance(instance.uid);
	}

	function trackInstance(
		instance: ConsumerComponent<P, X, SchemaInputs>,
	): ConsumerComponent<P, X, SchemaInputs> {
		if (instance.isDestroyed()) {
			return instance;
		}

		// The instance calls untrackInstance itself when its teardown finishes.
		instances.push(instance);
		indexComponentInstance(componentTag, instance);

		return instance;
	}

	function createTrackedInstance(
		props?: ComponentPropsInput<P, SchemaInputs>,
	): ConsumerComponent<P, X, SchemaInputs> {
		return trackInstance(
			new ConsumerComponent<P, X, SchemaInputs>(
				runtimeOptions,
				props,
				untrackInstance,
			),
		);
	}

	/**
	 * Component factory function that creates new instances.
	 * @param props - Props to pass to the component instance
	 * @returns A new component instance
	 */
	// biome-ignore lint/complexity/useArrowFunction: Preserve the factory's regular-function behavior for JavaScript callers.
	const Component = function (
		props?: ComponentPropsInput<P, SchemaInputs>,
	): ForgeFrameComponentInstance<P, X, SchemaInputs> {
		return createTrackedInstance(props);
	} as unknown as ForgeFrameComponent<P, X, false, SchemaInputs>;

	// A fresh frozen snapshot per read keeps callers from desynchronizing the
	// factory list from the global instance index.
	Object.defineProperty(Component, "instances", {
		get: () => Object.freeze([...instances]),
		enumerable: true,
	});

	registerComponent(Component, runtimeOptions);

	return Component;
}

/**
 * Retrieves a registered component by its tag name.
 *
 * @typeParam P - The props type for the component
 * @typeParam X - The exports type that the host can expose
 * @param tag - The unique tag identifier of the component
 * @returns The component factory function, or undefined if not found
 *
 * @example
 * ```typescript
 * const LoginComponent = getComponent('login-component');
 * if (LoginComponent) {
 *   LoginComponent({ email: 'user@example.com' }).render('#container');
 * }
 * ```
 *
 * @internal
 */
export function getComponent<
	P extends Record<string, unknown> = Record<string, unknown>,
	X = unknown,
	SchemaInputs = P,
>(tag: string): ForgeFrameComponent<P, X, false, SchemaInputs> | undefined {
	return getRegisteredComponent<P, X, SchemaInputs>(tag);
}

/**
 * Closes every live ForgeFrame component instance.
 *
 * @remarks
 * Takes a snapshot of every live instance across all components when called,
 * closes them concurrently, and resolves once every close has finished.
 * Instances created after the call are left open. Each instance emits its
 * events and runs its callbacks exactly as a direct `close()` would.
 *
 * @returns A promise that resolves when every instance has closed
 * @throws AggregateError listing each failed close, after every close has settled
 *
 * @example
 * ```typescript
 * // Tear down every embed before leaving the page
 * await closeAll();
 * ```
 *
 * @public
 */
export async function closeAll(): Promise<void> {
	const results = await Promise.allSettled(
		getIndexedComponentInstances().map(({ instance }) => instance.close()),
	);
	const errors = results.flatMap((result) =>
		result.status === "rejected" ? [result.reason] : [],
	);
	if (errors.length > 0) {
		throw new AggregateError(
			errors,
			`${errors.length} ForgeFrame instance(s) failed to close`,
		);
	}
}

/**
 * Removes a component from the registry.
 *
 * @remarks
 * Primarily used for testing and cleanup. Does not destroy active instances.
 *
 * @param tag - The component tag to unregister
 * @internal
 */
export function unregisterComponent(tag: string): void {
	deleteRegisteredComponent(tag);
	clearIndexedInstancesByTag(tag);
}

/**
 * Clears all components from the registry.
 *
 * @remarks
 * Primarily used for testing and cleanup. Does not destroy active instances.
 *
 * @internal
 */
export function clearComponents(): void {
	clearRegisteredComponents();
	clearIndexedInstances();
}
