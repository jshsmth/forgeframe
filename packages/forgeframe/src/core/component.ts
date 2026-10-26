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
import { hasOwnDeclaredField } from "../props/definition-checks";
import type { StandardSchemaV1 } from "../props/schema";
import {
	assertIframeAttributeNames,
	assertSandboxOption,
} from "../render/iframe-configuration";
import type {
	InferPropsDefinition,
	InferPropsDefinitionInput,
	PropsDefinition,
} from "../types/props";
import type {
	ComponentOptions,
	ForgeFrameComponent,
	ForgeFrameComponentInstance,
	InferablePropsDefinition,
	InferredComponentOptions,
	SelfAcceptingPropsDefinition,
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
import { assertPropDefinitionsObject } from "./host/builtin-keys";

/**
 * Validates component configuration options.
 *
 * @param options - The component options to validate
 * @throws Error if an option is missing or invalid, or the tag is already
 * registered
 * @internal
 */
function validateComponentOptions<P>(options: ComponentOptions<P>): void {
	assertComponentFields(options);
	assertNoRemovedComponentOptions(options);
	assertComponentMatchers(options);
	assertSandboxOption(options.sandbox);
	assertIframeAttributeNames(options.attributes);
	assertPropDefinitionsObject(options.props ?? {});
	validateStaticComponentUrl(options);
	if (hasRegisteredComponent(options.tag)) {
		throw new Error(`Component "${options.tag}" is already registered`);
	}
}

/**
 * Checks the shape of each scalar component option, without browser or
 * registry access. Matchers, the sandbox, attributes and prop definitions
 * have their own checks.
 */
function assertComponentFields<P>(options: ComponentOptions<P>): void {
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
	if (typeof options.url === "function" && options.domain === undefined) {
		throw new Error(
			"Component domain is required when url is a function: list the host origins the function may return, or pass '*' to trust any http(s) origin.",
		);
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
}

/** Checks the `domain` and `peers` origin matchers. */
function assertComponentMatchers<P>(options: ComponentOptions<P>): void {
	if (options.domain !== undefined)
		assertDomainMatcher(options.domain, "Component domain");
	if ((options.peers as unknown) === false) {
		throw new Error(
			"Component peers must be true or an origin matcher; omit it to keep peer discovery off",
		);
	}
	if (options.peers !== undefined && options.peers !== true)
		assertDomainMatcher(options.peers, "Component peers");
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
	peerDomains:
		'Component option "peerDomains" was removed. Peer discovery is opt-in: set peers: true for same-origin peers, or peers: <origin matcher> to also admit those host origins.',
};

/** Throws a migration error for any removed component option. */
function assertNoRemovedComponentOptions(options: object): void {
	for (const [option, message] of Object.entries(REMOVED_COMPONENT_OPTIONS)) {
		if (hasOwnDeclaredField(options, option)) throw new Error(message);
	}
}

/** Resolves static URLs using the browser's navigation base when available. */
function validateStaticComponentUrl<P>(options: ComponentOptions<P>): void {
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
	Record<PropertyKey, never> extends InferPropsDefinitionInput<D>
		? false
		: true,
	InferPropsDefinitionInput<D>
>;
export function create<
	P extends Record<string, unknown> = Record<string, unknown>,
	X = unknown,
	Input = P,
	D extends PropsDefinition<P> = PropsDefinition<P>,
>(
	options: ComponentOptions<P> & {
		props?: D & SelfAcceptingPropsDefinition<D>;
	},
): ForgeFrameComponent<P, X, false, Input>;
export function create<
	P extends Record<string, unknown> = Record<string, unknown>,
	X = unknown,
	Input = P,
>(options: ComponentOptions<P>): ForgeFrameComponent<P, X, false, Input> {
	validateComponentOptions(options);
	const runtimeOptions = options;

	const instances: ForgeFrameComponentInstance<P, X, Input>[] = [];
	const componentTag = options.tag;

	function untrackInstance(instance: ConsumerComponent<P, X, Input>): void {
		removeTrackedInstance(instances, instance);
		removeIndexedComponentInstance(instance.uid);
	}

	function trackInstance(
		instance: ConsumerComponent<P, X, Input>,
	): ConsumerComponent<P, X, Input> {
		if (instance.isDestroyed()) {
			return instance;
		}

		// The instance calls untrackInstance itself when its teardown finishes.
		instances.push(instance);
		indexComponentInstance(componentTag, instance);

		return instance;
	}

	function createTrackedInstance(
		props?: Input,
	): ConsumerComponent<P, X, Input> {
		return trackInstance(
			new ConsumerComponent<P, X, Input>(
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
		props?: Input,
	): ForgeFrameComponentInstance<P, X, Input> {
		return createTrackedInstance(props);
	} as unknown as ForgeFrameComponent<P, X, false, Input>;

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
	Input = P,
>(tag: string): ForgeFrameComponent<P, X, false, Input> | undefined {
	return getRegisteredComponent<P, X>(tag) as
		| ForgeFrameComponent<P, X, false, Input>
		| undefined;
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
