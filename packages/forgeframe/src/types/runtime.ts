/**
 * Shared public component runtime types.
 */

import type { ContextType } from "../constants";
import type { InferOutput, StandardSchemaV1 } from "../props/schema";
import type { ComponentEvents, EventSubscriber, HostEvents } from "./events";
import type {
	InferPropsDefinition,
	PropDefinition,
	PropsDefinition,
	SelfAcceptanceError,
} from "./props";
import type { ContainerTemplate, PrerenderTemplate } from "./templates";
import type {
	Dimensions,
	DomainMatcher,
	IframeAttributes,
	IframeStyles,
} from "./utility";

/**
 * A value after a JSON round trip: `toJSON()` results replace their source,
 * so `Date` values become ISO strings, and functions are dropped.
 * @internal
 */
type JsonRoundTrip<T> = 0 extends 1 & T
	? T
	: T extends { toJSON(...args: never[]): infer Result }
		? JsonRoundTrip<Result>
		: T extends (...args: never[]) => unknown
			? undefined
			: T extends object
				? { [K in keyof T]: JsonRoundTrip<T[K]> }
				: T;

/**
 * A callback argument that keeps its declared type through JSON. Values that
 * JSON would change, such as `Date` and functions, are `never`.
 * @internal
 */
type JsonCallArgument<T> = 0 extends 1 & T
	? T
	: T extends { toJSON(...args: never[]): unknown }
		? never
		: T extends (...args: never[]) => unknown
			? never
			: T extends object
				? { [K in keyof T]: JsonCallArgument<T[K]> }
				: T;

/**
 * A value received across the component boundary.
 *
 * @remarks
 * Callback props and exported methods always return promises on the receiving
 * side, even when their local implementation returns synchronously. Nested
 * objects and arrays retain their shape, and Date props remain Date instances.
 * Callback arguments and results use the JSON message contract; they are not
 * recursively converted into remote function references. For synchronous
 * signatures, results are typed after JSON conversion (a `Date` becomes an
 * ISO string), and parameters that JSON would change, such as a `Date`, are
 * typed `never` so callers cannot pass them. Promise-returning signatures are
 * kept as declared, so declare them with JSON-compatible types.
 *
 * @typeParam T - The value's type in the window that supplies it.
 * @public
 */
export type RemoteValue<T> = T extends (...args: never[]) => Promise<unknown>
	? T
	: T extends (...args: infer Args) => infer Result
		? (
				...args: { [K in keyof Args]: JsonCallArgument<Args[K]> }
			) => Promise<JsonRoundTrip<Awaited<Result>>>
		: T extends Date
			? T
			: T extends object
				? { [K in keyof T]: RemoteValue<T[K]> }
				: T;

/**
 * Stands for any factory input where only the props type matters: a factory
 * or instance with any input is assignable to one typed with this.
 * @internal
 */
export type AnyFactoryInput = never;

/** A schema-backed definition map from which `create()` can infer props. @internal */
export type InferablePropsDefinition = Record<
	string,
	| StandardSchemaV1<unknown, unknown>
	| { schema: StandardSchemaV1<unknown, unknown> }
>;

type ContextualSchemaMap = Record<string, StandardSchemaV1>;

/** Extracts each entry's schema for contextual callback inference. @internal */
type InferContextualSchemas<D extends InferablePropsDefinition> = {
	[K in keyof D]: D[K] extends StandardSchemaV1
		? D[K]
		: D[K] extends { schema: infer Schema extends StandardSchemaV1 }
			? Schema
			: never;
};

/** A wrapped inferred definition whose schema types its callbacks. @internal */
type ContextualWrappedPropDefinition<Schema extends StandardSchemaV1> = Omit<
	PropDefinition<InferOutput<Schema>>,
	"schema"
> & {
	schema: Schema;
};

/**
 * A concise schema entry. Only expose Standard Schema metadata for contextual
 * typing so library methods do not conflict with wrapped prop options.
 * @internal
 */
type ContextualDirectSchema<Schema extends StandardSchemaV1> = Pick<
	Schema,
	"~standard"
>;

/** Whether a schema's output is valid input to the same schema. @internal */
type IsSelfAccepting<Schema> =
	Schema extends StandardSchemaV1<infer Input, infer Output>
		? [Output] extends [Input]
			? true
			: false
		: true;

/**
 * Reports a schema that does not accept its own output at the offending
 * entry, or at its wrapped `schema` field.
 * @internal
 */
export type SelfAcceptingPropsDefinition<D> = {
	[K in keyof D]: D[K] extends StandardSchemaV1
		? IsSelfAccepting<D[K]> extends true
			? unknown
			: SelfAcceptanceError
		: D[K] extends { schema: infer Schema }
			? IsSelfAccepting<Schema> extends true
				? unknown
				: { schema: SelfAcceptanceError }
			: unknown;
};

/** Contextual callback types inferred from each entry's schema. @internal */
type ContextualPropsDefinition<S extends ContextualSchemaMap> = {
	[K in keyof S]?:
		| ContextualDirectSchema<S[K]>
		| ContextualWrappedPropDefinition<S[K]>;
};

/** Component options whose prop values are inferred from their schemas. @internal */
export type InferredComponentOptions<
	D extends InferablePropsDefinition,
	ContextualSchemas extends ContextualSchemaMap = InferContextualSchemas<D>,
> = Omit<ComponentOptions<InferPropsDefinition<D>>, "props"> & {
	props: D &
		ContextualPropsDefinition<ContextualSchemas> &
		SelfAcceptingPropsDefinition<D>;
};

/** Arguments accepted by a component factory based on required input keys. @internal */
type ComponentFactoryArguments<
	RequireProps extends boolean,
	Input,
> = RequireProps extends true ? [props: Input] : [props?: Input];

/**
 * Configuration options for creating a component.
 *
 * @typeParam P - The normalized props type for the component
 *
 * @remarks
 * These options are passed to `create()` to define a new component.
 *
 * @example
 * ```typescript
 * import { prop } from 'forgeframe';
 *
 * const options: ComponentOptions<MyProps> = {
 *   tag: 'my-component',
 *   url: 'https://example.com/component',
 *   props: {
 *     name: prop.string(),
 *   },
 *   dimensions: { width: 400, height: 300 },
 * };
 * ```
 *
 * @public
 */
export interface ComponentOptions<P = Record<string, unknown>> {
	/**
	 * Unique tag name for the component.
	 *
	 * @remarks
	 * Must start with a lowercase letter and contain only lowercase letters,
	 * numbers, and hyphens.
	 */
	tag: string;

	/**
	 * URL of the host component page, or function that returns URL based on props.
	 */
	url: string | ((props: P) => string);

	/**
	 * Prop definitions for validation and delivery to the host.
	 */
	props?: PropsDefinition<P>;

	/**
	 * Default dimensions for the component.
	 */
	dimensions?: Dimensions | ((props: P) => Dimensions);

	/**
	 * Default rendering context (iframe or popup).
	 * @defaultValue 'iframe'
	 */
	defaultContext?: ContextType;

	/**
	 * Allowed host domains for security validation.
	 */
	domain?: DomainMatcher;

	/**
	 * Other host origins whose instances may discover this component's instances
	 * and call their exports through `getPeerInstances()`.
	 *
	 * @remarks
	 * Without this option, only hosts verified at the same origin are peers.
	 * Hosts with an opaque (`"null"`) origin never discover peers.
	 */
	peerDomains?: DomainMatcher;

	/**
	 * Custom container template function.
	 */
	containerTemplate?: ContainerTemplate<P>;

	/**
	 * Custom prerender (loading state) template function.
	 */
	prerenderTemplate?: PrerenderTemplate<P>;

	/**
	 * Function to validate props before rendering.
	 */
	validate?: (opts: { props: P }) => void;

	/**
	 * Additional HTML attributes for the iframe. Popups ignore them.
	 */
	attributes?: IframeAttributes | ((props: P) => IframeAttributes);

	/**
	 * CSS styles to apply to the iframe element.
	 *
	 * @example
	 * ```typescript
	 * style: {
	 *   border: 'none',
	 *   borderRadius: '8px',
	 *   boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
	 * }
	 * ```
	 */
	style?: IframeStyles | ((props: P) => IframeStyles);

	/**
	 * Timeout in milliseconds for host initialization.
	 * @defaultValue 10000
	 */
	timeout?: number;

	/**
	 * Content Security Policy nonce for the inline `<style>` of the default
	 * loading spinner.
	 *
	 * @remarks
	 * Custom templates read it from `TemplateContext.cspNonce`. It is never
	 * sent to the host.
	 */
	cspNonce?: string;
}

/**
 * Instance of a rendered component.
 *
 * @typeParam P - The props type for the component
 * @typeParam X - The type of exports from the host
 * @typeParam Input - The factory input, inferred from the prop schemas: defaults
 * make keys optional and coercions accept wider types than the props
 *
 * @remarks
 * Component instances are created by calling the component factory function
 * and provide methods to control the rendered component.
 *
 * @example
 * ```typescript
 * const instance = MyComponent({ name: 'World' });
 * await instance.render('#container');
 * await instance.updateProps({ name: 'Updated' });
 * await instance.close();
 * ```
 *
 * @public
 */
export interface ForgeFrameComponentInstance<
	P = Record<string, unknown>,
	X = unknown,
	Input = P,
> {
	/**
	 * Unique instance identifier.
	 */
	readonly uid: string;

	/**
	 * Render the component into a container.
	 *
	 * @param container - CSS selector or element to render into
	 * @param context - Override the default context (iframe/popup)
	 * @returns Promise that resolves when rendering is complete
	 */
	render(container: string | HTMLElement, context?: ContextType): Promise<void>;

	/**
	 * Close and destroy the component.
	 *
	 * @returns Promise that resolves when closed
	 */
	close(): Promise<void>;

	/**
	 * Focus the component window.
	 *
	 * @returns Promise that resolves when focused
	 */
	focus(): Promise<void>;

	/**
	 * Resize the component to new dimensions.
	 *
	 * @param dimensions - New dimensions
	 * @returns Promise that resolves when resized
	 */
	resize(dimensions: Dimensions): Promise<void>;

	/**
	 * Show the component (if hidden).
	 *
	 * @returns Promise that resolves when shown
	 */
	show(): Promise<void>;

	/**
	 * Hide the component.
	 *
	 * @returns Promise that resolves when hidden
	 */
	hide(): Promise<void>;

	/**
	 * Update the component's props.
	 *
	 * @remarks
	 * Props are normalized and validated before being sent to the host.
	 *
	 * @param props - Partial props to merge with existing
	 * @returns Promise that resolves when props are updated
	 */
	updateProps(props: Partial<Input>): Promise<void>;

	/**
	 * Subscribes to lifecycle events with `on` and `once`.
	 *
	 * @remarks
	 * Both return an unsubscribe function. Only ForgeFrame emits these events.
	 */
	readonly event: EventSubscriber<ComponentEvents<P, X>>;

	/**
	 * Data exported from the host component via `hostProps.export()`.
	 */
	exports?: RemoteValue<X>;
}

/**
 * Component factory function and static properties.
 *
 * @typeParam P - The props type for the component
 * @typeParam X - The type of exports from the host
 * @typeParam RequireProps - Whether the factory requires a props argument
 * @typeParam Input - The factory input, inferred from the prop schemas: defaults
 * make keys optional and coercions accept wider types than the props
 *
 * @remarks
 * This is the return type of `create()`. Call it to create consumer
 * instances. A host page passes it to `initHost()`, which validates incoming
 * props with the same definitions.
 *
 * @example
 * ```typescript
 * import { create, initHost } from 'forgeframe';
 *
 * const MyComponent = create<MyProps>({ ... });
 *
 * // In the consumer: create an instance
 * const instance = MyComponent({ name: 'World' });
 *
 * // In the host page: start the host runtime and read its props
 * const host = initHost(MyComponent, { consumerOrigins: 'https://app.example.com' });
 * const props = await host?.ready;
 * ```
 *
 * @public
 */
export interface ForgeFrameComponent<
	P = Record<string, unknown>,
	X = unknown,
	RequireProps extends boolean = false,
	Input = P,
> {
	/**
	 * Create a new component instance with props.
	 *
	 * @param props - Props to pass to the component
	 * @returns New component instance
	 */
	(
		...args: ComponentFactoryArguments<RequireProps, Input>
	): ForgeFrameComponentInstance<P, X, Input>;

	/**
	 * Live instances of this component, in creation order.
	 *
	 * @remarks
	 * Each read returns a new frozen snapshot. A held snapshot does not update,
	 * so read it again after closing instances.
	 */
	readonly instances: readonly ForgeFrameComponentInstance<P, X, Input>[];
}

/**
 * Information about a sibling component instance.
 *
 * @public
 */
export interface SiblingInfo {
	/** Unique instance ID */
	uid: string;
	/** Component tag name */
	tag: string;
	/** Exported data and promise-returning methods from the sibling, if any. */
	exports?: unknown;
}

/**
 * Options for getting peer component instances.
 *
 * @public
 */
export interface GetPeerInstancesOptions {
	/**
	 * If true, include peers from all registered component tags in the current
	 * consumer context. Peers must still be hosted at the requester's verified
	 * origin unless their component's `peerDomains` admit it.
	 * @defaultValue false
	 */
	anyConsumer?: boolean;
}

/**
 * Built-in properties and methods available on hostProps.
 *
 * @typeParam P - The props type for the component
 *
 * @remarks
 * These are the framework-provided properties that are always available
 * on the hostProps object, regardless of user-defined props.
 *
 * @public
 */
export interface HostPropsBuiltins<P = Record<string, unknown>> {
	/** Unique instance ID */
	uid: string;

	/** Component tag name */
	tag: string;

	/**
	 * Close the component.
	 *
	 * @returns Promise that resolves when closed
	 */
	close: () => Promise<void>;

	/**
	 * Focus the component window.
	 *
	 * @remarks
	 * Resolves once this window has focus, or after a short wait, so the host
	 * can then focus one of its own elements.
	 *
	 * @returns Promise that resolves when focused
	 */
	focus: () => Promise<void>;

	/**
	 * Resize the component.
	 *
	 * @param dimensions - New dimensions
	 * @returns Promise that resolves when resized
	 */
	resize: (dimensions: Dimensions) => Promise<void>;

	/**
	 * Show the component (if hidden).
	 *
	 * @returns Promise that resolves when shown
	 */
	show: () => Promise<void>;

	/**
	 * Hide the component.
	 *
	 * @returns Promise that resolves when hidden
	 */
	hide: () => Promise<void>;

	/**
	 * Subscribe to prop updates from consumer.
	 * Subscribers run after commitment in registration order. Async work is not
	 * awaited; synchronous throws and returned promise rejections are logged.
	 *
	 * @param handler - Function called when props change
	 * @returns A function that removes this registration
	 */
	onProps: (handler: (props: RemoteValue<P>) => void) => () => void;

	/**
	 * Report an error to the consumer, which emits it on its `error` event.
	 *
	 * @param err - Error to report
	 * @returns Promise that resolves when the consumer acknowledges the error
	 */
	reportError: (err: Error) => Promise<void>;

	/**
	 * Get a reference to the consumer window.
	 *
	 * @returns Consumer window object
	 */
	getConsumer: () => Window;

	/**
	 * Get the consumer window's domain.
	 *
	 * @returns Consumer domain string
	 */
	getConsumerDomain: () => string;

	/**
	 * Export data/methods to the consumer.
	 *
	 * @param exports - Data to export
	 * @returns Promise that resolves when export is complete
	 */
	export: <X>(exports: X) => Promise<void>;

	/**
	 * The consumer's current prop snapshot.
	 *
	 * @remarks
	 * The object keeps its identity; `props` is replaced on every prop update.
	 */
	consumer: {
		/** The consumer's props, including those the host did not declare. */
		readonly props: RemoteValue<P>;
	};

	/**
	 * Get peer component instances (other ForgeFrame components from the same consumer).
	 *
	 * @remarks
	 * Peer instances are other ForgeFrame component instances that share the same
	 * consumer window. This enables communication between multiple embedded components.
	 * Only peers whose hosts the consumer verified at this host's origin are
	 * returned, unless a peer's component lists this origin in `peerDomains`.
	 * Peers whose hosts are still loading are listed without exports until rediscovery.
	 * Exported methods are relayed through the consumer and return promises.
	 * Rediscover peers after a sibling replaces its exports or reconnects; retired
	 * methods reject. Unrelated prop updates do not retire cached peer methods.
	 *
	 * @param options - Options for peer discovery
	 * @returns Promise resolving to array of peer info
	 */
	getPeerInstances: (
		options?: GetPeerInstancesOptions,
	) => Promise<SiblingInfo[]>;
}

/**
 * Props object a host reads from `await host.ready`, where `host` is the
 * value `initHost()` returned.
 *
 * @typeParam P - The props type for the component
 *
 * @remarks
 * The hostProps object (short for "host properties") contains all props passed
 * from the consumer (the embedding app), plus built-in methods for controlling
 * the component and communicating back to the consumer. User-defined props from
 * P are properly typed, and built-in methods are always available.
 *
 * The name "hostProps" reflects that these are the props available to the host
 * (the embedded iframe/popup), passed from the consumer (the embedding app).
 * `initHost(Component, ...)` infers `P` from the component; use this type to
 * annotate helpers that receive the props.
 *
 * @example
 * ```typescript
 * // In host window with typed props
 * import { initHost, type HostProps } from 'forgeframe';
 * import { MyComponent, type MyProps } from './my-component';
 *
 * function submit(props: HostProps<MyProps>) {
 *   // Call consumer callbacks
 *   return props.onSubmit({ success: true });
 * }
 *
 * const host = initHost(MyComponent, { consumerOrigins: 'https://app.example.com' });
 * if (host) {
 *   const props = await host.ready;
 *
 *   // User props are properly typed
 *   console.log(props.name); // string
 *   await submit(props);
 *
 *   // Built-in methods are always available
 *   await props.resize({ width: 500, height: 400 });
 *   await props.close();
 * }
 * ```
 *
 * @public
 */
export type HostProps<P = Record<string, unknown>> = RemoteValue<P> &
	HostPropsBuiltins<P>;

/**
 * Options for `initHost()`.
 *
 * @typeParam P - The host props type
 *
 * @public
 */
export interface InitHostOptions<P = Record<string, unknown>> {
	/**
	 * Consumer origins allowed to embed this host.
	 *
	 * @remarks
	 * Required. The host checks the consumer origin it selects for messaging
	 * before it requests any props. An empty array admits no consumer, and
	 * `'*'` admits any consumer.
	 */
	consumerOrigins: DomainMatcher;

	/**
	 * Sends INIT as soon as `ready` resolves.
	 *
	 * @remarks
	 * Set it to `false` to run host controls, such as `hide()` or `resize()`,
	 * before the consumer's `render()` resolves, then call `host.init()`.
	 *
	 * @defaultValue true
	 */
	autoInit?: boolean;

	/**
	 * Prop definitions that validate the consumer's props.
	 *
	 * @remarks
	 * Only for the tag-agnostic `initHost({ props, consumerOrigins })` form.
	 * `initHost(Component, options)` uses the component's definitions and
	 * throws when this is passed. Without definitions, delivered props are not
	 * validated.
	 */
	props?: PropsDefinition<P>;
}

/**
 * A started host runtime, returned by `initHost()`.
 *
 * @typeParam P - The host props type, inferred from the component passed to
 * `initHost()`
 *
 * @example
 * ```typescript
 * import { initHost } from 'forgeframe';
 * import { PaymentForm } from './payment-form';
 *
 * const host = initHost(PaymentForm, { consumerOrigins: ['https://shop.example.com'] });
 * if (host) {
 *   const { amount, onSuccess } = await host.ready;
 * }
 * ```
 *
 * @public
 */
export interface Host<P = Record<string, unknown>> {
	/**
	 * Resolves to {@link Host.hostProps} once the consumer's verified bootstrap
	 * has passed the host schemas.
	 *
	 * @remarks
	 * Rejects when the bootstrap response is invalid, the consumer origin is not
	 * allowed, schema validation fails, messaging fails, or the host is
	 * destroyed first. A rejected start releases the host, so `initHost()` can
	 * be called again.
	 */
	readonly ready: Promise<HostProps<P>>;

	/**
	 * The live host props object.
	 *
	 * @remarks
	 * It holds only the built-in controls until `ready` resolves, so read
	 * consumer props after awaiting `ready`. Its identity never changes, and
	 * later prop updates are applied to it.
	 */
	readonly hostProps: HostProps<P>;

	/**
	 * Sends INIT to the consumer, which resolves its `render()`.
	 *
	 * @remarks
	 * Needed only with `autoInit: false`. Called before `ready` resolves, it
	 * sends INIT at that moment. It is idempotent, does nothing after
	 * `destroy()`, and sends nothing if `ready` rejects. Delivery failures are
	 * reported on the `error` event.
	 */
	init(): void;

	/**
	 * Tears down this host and tells the consumer the session ended.
	 *
	 * @remarks
	 * Idempotent. Controls on the old `hostProps` reject afterwards, and
	 * `initHost()` can start a fresh host. Destroying a stale host never affects
	 * a newer one.
	 */
	destroy(): void;

	/**
	 * Subscribes to host events with `on` and `once`, which return an
	 * unsubscribe function.
	 *
	 * @remarks
	 * The `error` event always carries an `Error`. Rejected props, including a
	 * rejected bootstrap snapshot, report the validation error. Any other
	 * failed start, and an INIT delivery failure, report an `Error` whose
	 * `cause` is the original failure. Observe prop updates with
	 * `hostProps.onProps()`.
	 */
	on: EventSubscriber<HostEvents>["on"];

	/** Like {@link Host.on}, for the next emission only. */
	once: EventSubscriber<HostEvents>["once"];
}
