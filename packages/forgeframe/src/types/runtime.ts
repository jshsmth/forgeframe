/**
 * Shared public component runtime types.
 */

import type { ContextType } from '../constants';
import type { StandardSchemaV1 } from '../props/schema';
import type { EventEmitterInterface } from './events';
import type { InferPropsDefinition, PropsDefinition } from './props';
import type { ContainerTemplate, PrerenderTemplate } from './templates';
import type {
  Dimensions,
  DomainMatcher,
  EligibilityResult,
  IframeAttributes,
  IframeStyles,
} from './utility';

/** Whether two prop shapes expose the same set of keys. @internal */
type HasSamePropKeys<A, B> = [Exclude<keyof A, keyof B>] extends [never]
  ? [Exclude<keyof B, keyof A>] extends [never]
    ? true
    : false
  : false;

/**
 * Props accepted when creating a component instance.
 *
 * @typeParam P - Canonical normalized props exposed to the host.
 * @typeParam I - An alternate consumer input shape, such as legacy aliases.
 *
 * @remarks
 * Supplying a distinct input shape permits initial props to use or mix
 * canonical and alias spellings, including aliases that are themselves
 * canonical keys. Required-prop validation remains owned by the component's
 * runtime prop definitions because TypeScript cannot infer alias-to-canonical
 * relationships from the runtime `alias` strings.
 * @public
 */
export type ConsumerPropsInput<P, I = P> =
  | P
  | (HasSamePropKeys<P, I> extends true
      ? never
      : I |
          (Exclude<keyof I, keyof P> extends never ? never : Partial<P & I>));

/**
 * Partial props accepted by component updates.
 *
 * @typeParam P - Canonical normalized props exposed to the host.
 * @typeParam I - An alternate consumer input shape, such as legacy aliases.
 * @public
 */
export type ConsumerPropsUpdate<P, I = P> =
  | Partial<P>
  | Partial<I>
  | Partial<P & I>;

/**
 * Function that returns nested components for composition.
 *
 * @typeParam P - The props type for the consumer component
 *
 * @remarks
 * Nested components can be rendered within the host component's iframe/popup.
 *
 * @param props - Object containing the consumer's props
 * @returns Map of nested component names to ForgeFrameComponent instances
 *
 * @public
 */
export type ChildrenDefinition<P = Record<string, unknown>> = (props: {
  props: P;
}) => Record<string, ForgeFrameComponentReference>;

/**
 * Type-erased reference to a component definition used for composition.
 *
 * @remarks
 * This surface intentionally exposes only the members required to identify a
 * ForgeFrame component. It allows a children map to contain components with
 * different prop and export types without weakening their callable APIs.
 *
 * @public
 */
export interface ForgeFrameComponentReference {
  /** Check if the current window hosts this component. */
  isHost(): boolean;
  /** Check if the current window is embedded by this component. */
  isEmbedded(): boolean;
  /** Check whether the component can render to the target window. */
  canRenderTo(win: Window): Promise<boolean>;
}

/** A schema-backed definition map from which `create()` can infer props. @internal */
export type InferablePropsDefinition = Record<
  string,
  | StandardSchemaV1<unknown, unknown>
  | { schema: StandardSchemaV1<unknown, unknown> }
>;

/** Component options whose prop values are inferred from their schemas. @internal */
export type InferredComponentOptions<
  D extends InferablePropsDefinition,
> = Omit<ComponentOptions<InferPropsDefinition<D>>, 'props'> & {
  props: D & PropsDefinition<InferPropsDefinition<D>>;
};

/**
 * Configuration options for creating a component.
 *
 * @typeParam P - The props type for the component
 *
 * @remarks
 * These options are passed to `ForgeFrame.create()` to define a new component.
 *
 * @example
 * ```typescript
 * import { prop } from 'forgeframe';
 *
 * const options: ComponentOptions<MyProps> = {
 *   tag: 'my-component',
 *   url: 'https://example.com/component',
 *   props: {
 *     name: prop.string().required(),
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
   * Prop definitions for type checking and serialization.
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
   * Restrict which consumer domains can embed this component.
   */
  allowedConsumerDomains?: DomainMatcher;

  /**
   * Custom container template function.
   */
  containerTemplate?: ContainerTemplate<P>;

  /**
   * Custom prerender (loading state) template function.
   */
  prerenderTemplate?: PrerenderTemplate<P>;

  /**
   * Function to check if component is eligible to render.
   */
  eligible?: (opts: { props: P }) => EligibilityResult;

  /**
   * Function to validate props before rendering.
   */
  validate?: (opts: { props: P }) => void;

  /**
   * Additional HTML attributes for the iframe/popup.
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
   * Nested components that can be rendered within this component.
   */
  children?: ChildrenDefinition<P>;
}

/**
 * Instance of a rendered component.
 *
 * @typeParam P - The props type for the component
 * @typeParam X - The type of exports from the host
 * @typeParam I - An alternate consumer input shape, such as legacy aliases
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
  I = P,
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
  render(
    container: string | HTMLElement,
    context?: ContextType
  ): Promise<void>;

  /**
   * Render into a container using the current window.
   *
   * @remarks
   * Passing a window other than the current `window` throws because
   * cross-window rendering is not currently implemented.
   *
   * @param win - Target window
   * @param container - CSS selector or element to render into
   * @param context - Override the default context
   * @returns Promise that resolves when rendering is complete
   */
  renderTo(
    win: Window,
    container: string | HTMLElement,
    context?: ContextType
  ): Promise<void>;

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
  updateProps(props: ConsumerPropsUpdate<P, I>): Promise<void>;

  /**
   * Create a copy of this instance with the same props.
   *
   * @returns New component instance
   */
  clone(): ForgeFrameComponentInstance<P, X, I>;

  /**
   * Check if the component is eligible to render.
   *
   * @returns Whether the component can render
   */
  isEligible(): boolean;

  /**
   * Event emitter for subscribing to lifecycle events.
   */
  event: EventEmitterInterface;

  /**
   * Mutable state object for the component.
   */
  state: Record<string, unknown>;

  /**
   * Data exported from the host component via `hostProps.export()`.
   */
  exports?: X;
}

/**
 * Component factory function and static properties.
 *
 * @typeParam P - The props type for the component
 * @typeParam X - The type of exports from the host
 * @typeParam I - An alternate consumer input shape, such as legacy aliases
 *
 * @remarks
 * This is the return type of `ForgeFrame.create()`. It can be called as a
 * function to create instances, and has static properties for host detection.
 *
 * @example
 * ```typescript
 * const MyComponent = ForgeFrame.create<MyProps>({ ... });
 *
 * // Create an instance
 * const instance = MyComponent({ name: 'World' });
 *
 * // Check if we're in a host context
 * if (MyComponent.isHost()) {
 *   const props = MyComponent.hostProps;
 * }
 * ```
 *
 * @public
 */
export interface ForgeFrameComponent<
  P = Record<string, unknown>,
  X = unknown,
  I = P,
> {
  /**
   * Create a new component instance with props.
   *
   * @param props - Props to pass to the component
   * @returns New component instance
   */
  (props?: ConsumerPropsInput<P, I>): ForgeFrameComponentInstance<P, X, I>;

  /**
   * Check if current window is a host instance of this component.
   *
   * @remarks
   * A "host" is the embedded iframe or popup window that receives props
   * from the consumer (the embedding app).
   *
   * @returns True if in host context
   */
  isHost(): boolean;

  /**
   * Check if current window is embedded by this component.
   *
   * @remarks
   * This is an alias for {@link isHost} that uses more intuitive terminology.
   *
   * @returns True if in embedded context
   */
  isEmbedded(): boolean;

  /**
   * Get hostProps if in host context.
   *
   * @remarks
   * Only available when `isHost()` returns true. Contains all props passed
   * from the consumer plus built-in control methods.
   */
  hostProps?: HostProps<P>;

  /**
   * Check if we can render to a target window.
   *
   * @remarks
   * Returns `true` only when `win` is the current `window`. Cross-window
   * rendering targets are not currently supported.
   *
   * @param win - Target window to check
   * @returns Promise resolving to whether rendering is allowed
   */
  canRenderTo(win: Window): Promise<boolean>;

  /**
   * All active instances of this component.
   */
  instances: ForgeFrameComponentInstance<P, X, I>[];
}

/**
 * Consumer namespace available in host via `hostProps.consumer`.
 *
 * @typeParam P - The props type for the component
 *
 * @remarks
 * Provides bidirectional communication from host to consumer.
 *
 * @public
 */
export interface ConsumerNamespace<P = Record<string, unknown>> {
  /**
   * Access consumer's props.
   */
  props: P;

  /**
   * Export data/methods from consumer context.
   *
   * @param data - Data to export
   * @returns Promise that resolves when export is complete
   */
  export: <T>(data: T) => Promise<void>;
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
  /** Exports from sibling (if any) */
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
   * consumer context.
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
   *
   * @param handler - Function called when props change
   * @returns Object with cancel function to unsubscribe
   */
  onProps: (handler: (props: P) => void) => { cancel: () => void };

  /**
   * Report an error to the consumer.
   *
   * @param err - Error to report
   * @returns Promise that resolves when error is sent
   */
  onError: (err: Error) => Promise<void>;

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
   * Consumer namespace for bidirectional communication.
   */
  consumer: ConsumerNamespace<P>;

  /**
   * Get peer component instances (other ForgeFrame components from the same consumer).
   *
   * @remarks
   * Peer instances are other ForgeFrame component instances that share the same
   * consumer window. This enables communication between multiple embedded components.
   *
   * @param options - Options for peer discovery
   * @returns Promise resolving to array of peer info
   */
  getPeerInstances: (options?: GetPeerInstancesOptions) => Promise<SiblingInfo[]>;

  /**
   * Nested components available for rendering.
   */
  children?: Record<string, ForgeFrameComponent>;
}

/**
 * Props object available in host window via `window.hostProps`.
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
 *
 * @example
 * ```typescript
 * // In host window with typed props
 * import { initHost, type HostProps } from 'forgeframe';
 *
 * interface MyProps {
 *   name: string;
 *   onSubmit: (data: { success: boolean }) => void;
 * }
 *
 * initHost();
 * const props = window.hostProps as HostProps<MyProps>;
 *
 * // User props are properly typed
 * console.log(props.name); // string
 *
 * // Call consumer callbacks
 * await props.onSubmit({ success: true });
 *
 * // Built-in methods are always available
 * await props.resize({ width: 500, height: 400 });
 * await props.close();
 * ```
 *
 * @public
 */
export type HostProps<P = Record<string, unknown>> = P & HostPropsBuiltins<P>;
