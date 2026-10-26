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
import { ForgeFrameError } from "../errors";
import { isStandardSchema } from "../props/schema";
import {
	assertIframeAttributeNames,
	assertSandboxOption,
} from "../render/iframe-configuration";
import type { InferInput, InferProps } from "../types/props";
import type {
	Component,
	ComponentInstance,
	ComponentOptions,
	InferablePropsDefinition,
	InferExports,
	InferredComponentOptions,
} from "../types/runtime";
import { hasBrowserWindow } from "../utils/browser";
import { assertOriginMatcher } from "../utils/origin-pattern";
import { hasOwnDeclaredField } from "../utils/own-field";
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
import { assertPropDefinitionsObject } from "./host/reserved-props";
import { resolveRenderContext } from "./render-context";

/**
 * Validates component configuration options.
 *
 * @param options - The component options to validate
 * @throws Error if an option is missing or invalid, or the tag is already
 * registered
 * @internal
 */
function validateComponentOptions<P>(options: ComponentOptions<P>): void {
	// Removed names come first, so a renamed option is reported by its new name.
	assertNoRemovedComponentOptions(options);
	assertComponentFields(options);
	assertComponentMatchers(options);
	if (options.context !== undefined)
		resolveRenderContext(options.context, CONTEXT.IFRAME, "Component context");
	assertSandboxOption(options.sandbox);
	assertIframeAttributeNames(options.attributes);
	assertPropDefinitionsObject(options.props ?? {});
	assertExportsSchema(options.exports);
	validateStaticComponentUrl(options);
	if (hasRegisteredComponent(options.tag)) {
		throw new ForgeFrameError(
			"VALIDATION",
			`Component "${options.tag}" is already registered`,
		);
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
		throw new ForgeFrameError(
			"VALIDATION",
			"Component options must be an object",
		);
	}
	if (!options.tag) {
		throw new ForgeFrameError("VALIDATION", "Component tag is required");
	}

	if (
		typeof options.tag !== "string" ||
		!/^[a-z][a-z0-9-]*$/.test(options.tag)
	) {
		throw new ForgeFrameError(
			"VALIDATION",
			`Invalid component tag "${options.tag}". Must start with lowercase letter and contain only lowercase letters, numbers, and hyphens.`,
		);
	}

	if (!options.url) {
		throw new ForgeFrameError("VALIDATION", "Component url is required");
	}
	if (typeof options.url !== "string" && typeof options.url !== "function") {
		throw new ForgeFrameError(
			"VALIDATION",
			"Component url must be a string or a function",
		);
	}
	if (typeof options.url === "function" && options.hostOrigins === undefined) {
		throw new ForgeFrameError(
			"VALIDATION",
			"Component hostOrigins is required when url is a function: list the host origins the function may return, or pass '*' to trust any http(s) origin.",
		);
	}
	if (
		options.initTimeout !== undefined &&
		(typeof options.initTimeout !== "number" ||
			!Number.isFinite(options.initTimeout) ||
			options.initTimeout < 0 ||
			options.initTimeout > 2147483647)
	) {
		throw new ForgeFrameError(
			"VALIDATION",
			"Component initTimeout must be a finite number between 0 and 2147483647 milliseconds",
		);
	}

	if (
		options.cspNonce !== undefined &&
		(typeof options.cspNonce !== "string" || options.cspNonce === "")
	) {
		throw new ForgeFrameError(
			"VALIDATION",
			"Component cspNonce must be a non-empty string",
		);
	}
}

/** Checks the `hostOrigins` and `peers` origin matchers. */
function assertComponentMatchers<P>(options: ComponentOptions<P>): void {
	if (options.hostOrigins !== undefined)
		assertOriginMatcher(options.hostOrigins, "Component hostOrigins");
	const peers: unknown = options.peers;
	if (typeof peers === "boolean") {
		throw new ForgeFrameError(
			"VALIDATION",
			peers
				? 'Component peers: true was renamed. Use peers: "same-origin", as deliverTo spells it.'
				: 'Component peers must be "same-origin" or an origin matcher; omit it to keep peer discovery off',
		);
	}
	if (peers !== undefined && peers !== "same-origin")
		assertOriginMatcher(peers, "Component peers");
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
		'Component option "peerDomains" was removed. Peer discovery is opt-in: set peers: "same-origin" for same-origin peers, or peers: <origin matcher> to also admit those host origins.',
	domain:
		'Component option "domain" was renamed. Use hostOrigins, which lists host origins such as "https://pay.example.com".',
	timeout:
		'Component option "timeout" was renamed. Use initTimeout; it bounds only the initial handshake, and remote callbacks have no timeout.',
	defaultContext: 'Component option "defaultContext" was renamed. Use context.',
};

/** Throws a migration error for any removed component option. */
function assertNoRemovedComponentOptions(options: unknown): void {
	if (typeof options !== "object" || options === null) return;
	for (const [option, message] of Object.entries(REMOVED_COMPONENT_OPTIONS)) {
		if (hasOwnDeclaredField(options, option))
			throw new ForgeFrameError("VALIDATION", message);
	}
}

/** Checks that the optional `exports` option is a Standard Schema. */
function assertExportsSchema(exports: unknown): void {
	if (exports !== undefined && !isStandardSchema(exports)) {
		throw new ForgeFrameError(
			"VALIDATION",
			"Component exports must be a Standard Schema, such as prop.object({ ... }) or a Zod object",
		);
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
			context.enforceOrigins ? options.hostOrigins : undefined,
		);
	}
}

/** Relative declarations defer origin policy until a real browser origin is available. */
function staticUrlValidationContext(
	url: string,
	browserBaseUrl: string | null,
): { baseUrl: string; enforceOrigins: boolean } {
	let absolute = true;
	try {
		new URL(url);
	} catch {
		absolute = false;
	}
	return {
		baseUrl: browserBaseUrl ?? "https://forgeframe.invalid",
		enforceOrigins: browserBaseUrl !== null || absolute,
	};
}

/** Props as the runtime handles them, after inference has done its work. */
type RuntimeProps = Record<string, unknown>;

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
 * Props, factory input and exports are inferred from the `props` and
 * `exports` schemas; `create()` takes no type arguments. The props argument
 * is required exactly when a prop schema rejects `undefined`. To check the
 * definitions against a hand-written interface, write
 * `props: { ... } satisfies PropsDefinition<MyProps>`, or derive the type
 * with `PropsOf<typeof MyComponent>`.
 *
 * @typeParam D - The prop definitions, inferred from `props`
 * @typeParam S - The `exports` schema, inferred from `exports`
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
 *   exports: prop.object({ reset: prop.function<() => void>() }),
 * });
 *
 * const instance = LoginComponent({ email: 'user@example.com', onLogin: () => {} });
 * await instance.render('#container');
 * await instance.exports?.reset();
 * ```
 *
 * @public
 */
export function create<
	const D extends InferablePropsDefinition = Record<never, never>,
	const S = undefined,
>(
	options: InferredComponentOptions<D, S>,
): Component<InferProps<D>, InferInput<D>, InferExports<S>>;
export function create(
	options: ComponentOptions<Record<string, unknown>>,
): Component<Record<string, unknown>> {
	validateComponentOptions(options);
	const runtimeOptions = options;

	const instances: ComponentInstance<RuntimeProps>[] = [];
	const componentTag = options.tag;

	function untrackInstance(instance: ConsumerComponent<RuntimeProps>): void {
		removeTrackedInstance(instances, instance);
		removeIndexedComponentInstance(instance.uid);
	}

	function trackInstance(
		instance: ConsumerComponent<RuntimeProps>,
	): ConsumerComponent<RuntimeProps> {
		if (instance.isDestroyed()) {
			return instance;
		}

		// The instance calls untrackInstance itself when its teardown finishes.
		instances.push(instance);
		indexComponentInstance(componentTag, instance);

		return instance;
	}

	function createTrackedInstance(
		props?: RuntimeProps,
	): ConsumerComponent<RuntimeProps> {
		return trackInstance(
			new ConsumerComponent<RuntimeProps>(
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
	// A named regular function keeps the factory's name and `new` behavior for JavaScript callers.
	const factory = function Component(
		props?: RuntimeProps,
	): ComponentInstance<RuntimeProps> {
		return createTrackedInstance(props);
	} as Component<RuntimeProps>;

	// A fresh frozen snapshot per read keeps callers from desynchronizing the
	// factory list from the global instance index.
	Object.defineProperty(factory, "instances", {
		get: () => Object.freeze([...instances]),
		enumerable: true,
	});

	registerComponent(factory, runtimeOptions);

	return factory;
}

/**
 * Retrieves a registered component by its tag name.
 *
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
export function getComponent(tag: string): Component | undefined {
	return getRegisteredComponent(tag);
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
