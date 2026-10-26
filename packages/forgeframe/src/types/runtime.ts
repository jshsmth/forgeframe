/**
 * Shared public component runtime types.
 */

import type { ContextType } from "../constants";
import type { StandardSchemaV1 } from "../props/schema";
import type { ComponentEvents, EventSubscriber, HostEvents } from "./events";
import type {
	InferProps,
	PropDefinition,
	PropsDefinition,
	SelfAcceptanceError,
} from "./props";
import type { ContainerTemplate, PrerenderTemplate } from "./templates";
import type {
	Dimensions,
	IframeAttributes,
	IframeStyles,
	OriginMatcher,
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
 * A definition map from which `create()` and `initHost()` infer props.
 *
 * @remarks
 * Entries are objects (schemas, callable schemas and wrapped definitions), so
 * a plain props type passed as a type argument fails here. Their shape is
 * checked by {@link CheckedPropsDefinition} rather than by this constraint: a
 * schema constraint would give generic builders such as `prop.any()` a
 * contextual type and widen their inferred type.
 * @internal
 */
export type InferablePropsDefinition = Record<string, object>;

/** Reported where a prop entry is neither a schema nor a `{ schema }` definition. @internal */
export type PropEntryError =
	"ForgeFrame: a prop entry must be a Standard Schema or a { schema } definition";

/** Whether a schema's output is valid input to the same schema. @internal */
type IsSelfAccepting<Schema> =
	Schema extends StandardSchemaV1<infer Input, infer Output>
		? [Output] extends [Input]
			? true
			: false
		: true;

/** The transport options a wrapped entry is checked against. @internal */
type WrappedPropOptions = Omit<PropDefinition, "schema">;

/**
 * Reports, at the offending entry or its wrapped `schema` field, an entry that
 * is not schema-backed or whose schema does not accept its own output.
 * @internal
 */
export type CheckedPropsDefinition<D> = {
	[K in keyof D]: D[K] extends StandardSchemaV1
		? IsSelfAccepting<D[K]> extends true
			? unknown
			: SelfAcceptanceError
		: D[K] extends { schema: infer Schema extends StandardSchemaV1 }
			? IsSelfAccepting<Schema> extends true
				? WrappedPropOptions
				: { schema: SelfAcceptanceError }
			: D[K] extends StandardSchemaV1 | { schema: StandardSchemaV1 }
				? unknown
				: PropEntryError;
};

/**
 * Reported where an `exports` schema's output is not valid input to the same
 * schema.
 * @internal
 */
export type ExportsSelfAcceptanceError =
	"ForgeFrame: an exports schema's output must be valid input to the same schema";

/** Reports an `exports` value that is not a self-accepting Standard Schema. @internal */
type CheckedExportsSchema<S> = S extends undefined
	? unknown
	: S extends StandardSchemaV1
		? IsSelfAccepting<S> extends true
			? unknown
			: ExportsSelfAcceptanceError
		: "ForgeFrame: exports must be a Standard Schema";

/** The exports type an optional `exports` schema describes. @internal */
export type InferExports<S> = S extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<S>
	: unknown;

/** Component options whose prop and exports types are inferred from their schemas. @internal */
export type InferredComponentOptions<
	D extends InferablePropsDefinition,
	S,
> = Omit<ComponentBaseOptions<InferProps<D>>, "props" | "exports"> &
	ComponentUrlOptions<InferProps<D>> & {
		props?: D & CheckedPropsDefinition<D>;
		exports?: S & CheckedExportsSchema<S>;
	};

/**
 * The factory's arguments: the props argument is required exactly when a key
 * of the input is required.
 * @internal
 */
type ComponentFactoryArguments<Input> =
	Record<PropertyKey, never> extends Input ? [props?: Input] : [props: Input];

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
export type ComponentOptions<P = Record<string, unknown>> =
	ComponentBaseOptions<P> & ComponentUrlOptions<P>;

/**
 * Where a component's host lives and which host origins it trusts.
 *
 * @typeParam P - The normalized props type for the component
 *
 * @remarks
 * A static `url` may omit `hostOrigins`; its own origin is then trusted. A
 * function `url` requires `hostOrigins`, so a URL computed from props or
 * configuration never makes an unlisted origin trusted.
 *
 * @public
 */
export type ComponentUrlOptions<P = Record<string, unknown>> =
	| {
			/** URL of the host component page. */
			url: string;
			/**
			 * Host origins this component trusts and may open. Defaults to the
			 * origin of `url`. An empty array is rejected.
			 */
			hostOrigins?: OriginMatcher;
	  }
	| {
			/** Function that returns the host URL from the props. */
			url: (props: P) => string;
			/**
			 * Host origins this component trusts and may open. Every URL the
			 * function returns must match; `'*'` trusts any http(s) origin. An
			 * empty array is rejected.
			 */
			hostOrigins: OriginMatcher;
	  };

/**
 * Component options other than `url` and `hostOrigins`.
 *
 * @typeParam P - The normalized props type for the component
 *
 * @public
 */
export interface ComponentBaseOptions<P = Record<string, unknown>> {
	/**
	 * Unique tag name for the component.
	 *
	 * @remarks
	 * Must start with a lowercase letter and contain only lowercase letters,
	 * numbers, and hyphens.
	 */
	tag: string;

	/**
	 * Prop definitions for validation and delivery to the host.
	 */
	props?: PropsDefinition<P>;

	/**
	 * Standard Schema for the value the host passes to `hostProps.export()`.
	 *
	 * @remarks
	 * `create()` infers `instance.exports` and the host's `export()` parameter
	 * from it. The consumer validates every export against it before replacing
	 * `instance.exports`: invalid exports keep the previous ones, reject the
	 * host's `export()` and emit `error`. A host started with
	 * `initHost(Component, ...)` checks its exports before sending them. Like a
	 * prop schema, it must return a valid value unchanged, so transforms are
	 * rejected. Omitted, exports are `unknown` and not validated.
	 *
	 * @example
	 * ```typescript
	 * exports: prop.object({
	 *   validate: prop.function<() => boolean>(),
	 *   ready: prop.boolean(),
	 * }),
	 * ```
	 */
	exports?: StandardSchemaV1;

	/**
	 * Default dimensions for the component.
	 */
	dimensions?: Dimensions | ((props: P) => Dimensions);

	/**
	 * Default rendering context (iframe or popup); `render(container, context)`
	 * overrides it per call.
	 * @defaultValue 'iframe'
	 */
	context?: ContextType;

	/**
	 * Opts this component in to peer discovery through `getPeerInstances()`.
	 *
	 * @remarks
	 * Omitted, this component's instances are never listed to other hosts, and
	 * its hosts cannot discover peers. `true` lists its instances to hosts
	 * verified at the same origin as their own host. A matcher also admits
	 * requesting hosts verified at a matching origin. Hosts with an opaque
	 * (`"null"`) origin never discover peers and are never listed.
	 */
	peers?: true | OriginMatcher;

	/**
	 * The iframe's sandbox attribute.
	 *
	 * @remarks
	 * Omitted, the iframe gets `allow-scripts allow-same-origin allow-forms
	 * allow-popups`. A string is written as given and must include
	 * `allow-scripts` and `allow-same-origin`, because the host runs script and
	 * an opaque origin is never trusted. `false` writes no sandbox attribute.
	 * Popups are never sandboxed: `window.open()` cannot apply one. The default
	 * protects only against a cross-origin host, since a same-origin host with
	 * `allow-scripts` and `allow-same-origin` can remove its own sandbox.
	 * @defaultValue `'allow-scripts allow-same-origin allow-forms allow-popups'`
	 */
	sandbox?: string | false;

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
	 * Additional HTML attributes for the iframe. Popups ignore them. Set the
	 * sandbox with the `sandbox` option; `attributes` may not include it.
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
	 * Milliseconds the initial handshake may take before `render()` rejects
	 * with `INIT_TIMEOUT`.
	 *
	 * @remarks
	 * It bounds only the handshake. Remote callbacks have no timeout.
	 * @defaultValue 10000
	 */
	initTimeout?: number;

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
 * A component's `peers` option: omitted, `true`, or an origin matcher.
 * @internal
 */
export type PeersOption = ComponentBaseOptions["peers"];

/**
 * Instance of a rendered component.
 *
 * @typeParam Props - The normalized props the host receives
 * @typeParam Input - The factory input, inferred from the prop schemas: defaults
 * make keys optional and coercions accept wider types than the props
 * @typeParam Exports - The value the host exports, from the `exports` schema
 *
 * @remarks
 * Component instances are created by calling the component factory function
 * and provide methods to control the rendered component. Annotate with
 * `ComponentInstance<PropsOf<typeof C>, InputOf<typeof C>, ExportsOf<typeof C>>`,
 * or let TypeScript infer the type from the factory call.
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
export interface ComponentInstance<
	Props = Record<string, unknown>,
	Input = Props,
	Exports = unknown,
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
	readonly event: EventSubscriber<ComponentEvents<Props, Exports>>;

	/**
	 * Data exported from the host component via `hostProps.export()`, once
	 * it has passed the component's `exports` schema.
	 */
	exports?: RemoteValue<Exports>;
}

/**
 * Component factory function and static properties.
 *
 * @typeParam Props - The normalized props the host receives
 * @typeParam Input - The factory input, inferred from the prop schemas: defaults
 * make keys optional and coercions accept wider types than the props. The
 * props argument is required exactly when a key of `Input` is required.
 * @typeParam Exports - The value the host exports, from the `exports` schema
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
 * const MyComponent = create({ ... });
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
export interface Component<
	Props = Record<string, unknown>,
	Input = Props,
	Exports = unknown,
> {
	/**
	 * Create a new component instance with props.
	 *
	 * @param props - Props to pass to the component
	 * @returns New component instance
	 */
	(
		...args: ComponentFactoryArguments<Input>
	): ComponentInstance<Props, Input, Exports>;

	/**
	 * Live instances of this component, in creation order.
	 *
	 * @remarks
	 * Each read returns a new frozen snapshot. A held snapshot does not update,
	 * so read it again after closing instances.
	 */
	readonly instances: readonly ComponentInstance<Props, Input, Exports>[];
}

/**
 * Any component returned by `create()`, whatever its props, input and exports.
 * @internal
 */
// biome-ignore lint/suspicious/noExplicitAny: Matches every component; the factory input is contravariant.
export type AnyComponent = Component<any, any, any>;

/**
 * The normalized props a component's host receives.
 *
 * @example
 * ```typescript
 * type LoginProps = PropsOf<typeof LoginForm>;
 * ```
 *
 * @public
 */
export type PropsOf<C extends AnyComponent> =
	C extends Component<infer Props, infer _Input, infer _Exports>
		? Props
		: never;

/**
 * What a component's factory and `updateProps()` accept.
 *
 * @public
 */
export type InputOf<C extends AnyComponent> =
	C extends Component<infer _Props, infer Input, infer _Exports>
		? Input
		: never;

/**
 * The output of a component's `exports` schema, or `unknown` without one.
 *
 * @public
 */
export type ExportsOf<C extends AnyComponent> =
	C extends Component<infer _Props, infer _Input, infer Exports>
		? Exports
		: never;

/**
 * The `hostProps` type of a component's host: its props, the built-in
 * controls, and `export()` typed by its `exports` schema.
 *
 * @example
 * ```typescript
 * function submit(props: HostPropsOf<typeof PaymentForm>) {
 *   return props.onSuccess({ id: 'txn_1' });
 * }
 * ```
 *
 * @public
 */
export type HostPropsOf<C extends AnyComponent> = HostProps<
	PropsOf<C>,
	ExportsOf<C>
>;

/**
 * A peer component instance that `getPeerInstances()` lists.
 *
 * @public
 */
export interface PeerInfo {
	/** Unique instance ID */
	uid: string;
	/** Component tag name */
	tag: string;
	/** Exported data and promise-returning methods from the peer, if any. */
	exports?: unknown;
}

/**
 * Options for getting peer component instances.
 *
 * @public
 */
export interface GetPeerInstancesOptions {
	/**
	 * If true, include peers from every component tag on the consumer page,
	 * not only this host's tag. Only components that set `peers` are listed,
	 * and a peer hosted at another origin is listed only when its `peers`
	 * matcher admits the requester's verified origin.
	 * @defaultValue false
	 */
	allTags?: boolean;
}

/**
 * Built-in properties and methods available on hostProps.
 *
 * @typeParam P - The props type for the component
 * @typeParam Exports - The value `export()` accepts, from the component's
 * `exports` schema; any value when `unknown`
 *
 * @remarks
 * These are the framework-provided properties that are always available
 * on the hostProps object, regardless of user-defined props.
 *
 * @public
 */
export interface HostPropsBuiltins<
	P = Record<string, unknown>,
	Exports = unknown,
> {
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
	 * The consumer window's origin, verified by the bootstrap exchange and
	 * matched against `consumerOrigins`.
	 */
	readonly consumerOrigin: string;

	/**
	 * Export data/methods to the consumer.
	 *
	 * @remarks
	 * The consumer validates the value against the component's `exports`
	 * schema and rejects an invalid one, keeping its previous exports. A host
	 * started with `initHost(Component, ...)` checks it before sending.
	 *
	 * @param exports - Data to export
	 * @returns Promise that resolves when the consumer has accepted the export
	 */
	export(exports: Exports): Promise<void>;

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
	 * Discovery is opt-in: this host's component and every listed peer's
	 * component set `peers`. Without it on this host's component, the call
	 * rejects. Only peers whose hosts the consumer verified at this host's
	 * origin are returned, unless a peer's `peers` matcher admits this origin.
	 * Peers whose hosts are still loading are listed without exports until rediscovery.
	 * Exported methods are relayed through the consumer and return promises.
	 * Rediscover peers after a sibling replaces its exports or reconnects; retired
	 * methods reject. Unrelated prop updates do not retire cached peer methods.
	 *
	 * @param options - Options for peer discovery
	 * @returns Promise resolving to array of peer info
	 */
	getPeerInstances: (options?: GetPeerInstancesOptions) => Promise<PeerInfo[]>;
}

/**
 * Props object a host reads from `await host.ready`, where `host` is the
 * value `initHost()` returned.
 *
 * @typeParam P - The props type for the component
 * @typeParam Exports - The value `export()` accepts; any value when `unknown`
 *
 * @remarks
 * The hostProps object (short for "host properties") contains all props passed
 * from the consumer (the embedding app), plus built-in methods for controlling
 * the component and communicating back to the consumer. User-defined props from
 * P are properly typed, and built-in methods are always available.
 *
 * The name "hostProps" reflects that these are the props available to the host
 * (the embedded iframe/popup), passed from the consumer (the embedding app).
 * `initHost(Component, ...)` infers both parameters from the component. To
 * annotate helpers that receive the props, use `HostPropsOf<typeof Component>`.
 *
 * @example
 * ```typescript
 * // In host window with typed props
 * import { initHost, type HostPropsOf } from 'forgeframe';
 * import { MyComponent } from './my-component';
 *
 * function submit(props: HostPropsOf<typeof MyComponent>) {
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
export type HostProps<
	P = Record<string, unknown>,
	Exports = unknown,
> = RemoteValue<P> & HostPropsBuiltins<P, Exports>;

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
	consumerOrigins: OriginMatcher;

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
 * @typeParam Exports - The value `hostProps.export()` accepts, inferred from
 * the component's `exports` schema
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
export interface Host<P = Record<string, unknown>, Exports = unknown> {
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
	readonly ready: Promise<HostProps<P, Exports>>;

	/**
	 * The live host props object.
	 *
	 * @remarks
	 * It holds only the built-in controls until `ready` resolves, so read
	 * consumer props after awaiting `ready`. Its identity never changes, and
	 * later prop updates are applied to it.
	 */
	readonly hostProps: HostProps<P, Exports>;

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
