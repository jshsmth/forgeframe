/**
 * @packageDocumentation
 * Type definitions for ForgeFrame cross-domain component framework.
 *
 * @remarks
 * This module exports all the TypeScript interfaces and types used throughout
 * the ForgeFrame library. These types enable type-safe component creation,
 * prop handling, and cross-domain communication.
 */

import type {
  ContextType,
  SerializationType,
  EventType,
} from './constants';
import type { StandardSchemaV1, InferOutput } from './props/schema';

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Pattern for matching domains in security configurations.
 *
 * @remarks
 * Can be a single domain string, a RegExp pattern, or an array of string/RegExp patterns.
 * String patterns support `*` wildcards (for example, `'https://*.example.com'`).
 *
 * @example
 * ```typescript
 * // Single domain
 * const domain: DomainMatcher = 'https://example.com';
 *
 * // RegExp pattern
 * const pattern: DomainMatcher = /^https:\/\/.*\.example\.com$/;
 *
 * // Multiple patterns (can mix strings and RegExp)
 * const domains: DomainMatcher = ['https://*.example.com', /^https:\/\/api\d+\.example\.com$/];
 * ```
 *
 * @public
 */
type DomainPattern = string | RegExp;
export type DomainMatcher = DomainPattern | DomainPattern[];

/**
 * Component dimension specification.
 *
 * @remarks
 * Dimensions can be specified as CSS values (strings) or pixel numbers.
 *
 * @public
 */
export interface Dimensions {
  /** Width of the component (e.g., '100%', 400, '500px') */
  width?: string | number;
  /** Height of the component (e.g., '100%', 300, '400px') */
  height?: string | number;
}

/**
 * Configuration for automatic component resizing.
 *
 * @remarks
 * When enabled, the consumer will automatically resize the iframe
 * based on the host content dimensions.
 *
 * @public
 */
export interface AutoResizeOptions {
  /** Enable automatic width resizing */
  width?: boolean;
  /** Enable automatic height resizing */
  height?: boolean;
  /** CSS selector of element to measure for auto-resize */
  element?: string;
}

/**
 * HTML attributes that can be applied to an iframe element.
 *
 * @remarks
 * These attributes are passed directly to the iframe element when rendering.
 *
 * @public
 */
export interface IframeAttributes {
  /** Title attribute for accessibility */
  title?: string;
  /** Permissions policy (e.g., 'camera; microphone') */
  allow?: string;
  /** Allow fullscreen mode */
  allowFullscreen?: boolean;
  /** Loading strategy */
  loading?: 'lazy' | 'eager';
  /** Referrer policy */
  referrerPolicy?: ReferrerPolicy;
  /** Sandbox restrictions */
  sandbox?: string;
  /** Additional custom attributes */
  [key: string]: string | boolean | undefined;
}

/**
 * CSS styles that can be applied to the iframe element.
 *
 * @remarks
 * These styles are applied directly to the iframe's style property.
 * Common use cases include setting borders, shadows, border-radius, etc.
 *
 * @example
 * ```typescript
 * const styles: IframeStyles = {
 *   border: 'none',
 *   borderRadius: '8px',
 *   boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
 * };
 * ```
 *
 * @public
 */
export interface IframeStyles {
  /** CSS properties to apply to the iframe */
  [key: string]: string | number | undefined;
}

/**
 * Result of an eligibility check for component rendering.
 *
 * @public
 */
export interface EligibilityResult {
  /** Whether the component is eligible to render */
  eligible: boolean;
  /** Reason for ineligibility (if not eligible) */
  reason?: string;
}

// ============================================================================
// Props System Types
// ============================================================================

/**
 * Context object passed to prop value functions and decorators.
 *
 * @typeParam P - The props type for the component
 *
 * @remarks
 * This context provides access to component state and methods during
 * prop normalization and decoration.
 *
 * @public
 */
export interface PropContext<P> {
  /** Current props values */
  props: P;
  /** Component state object */
  state: Record<string, unknown>;
  /** Close the component */
  close: () => Promise<void>;
  /** Focus the component */
  focus: () => Promise<void>;
  /** Report an error */
  onError: (err: Error) => void;
  /** Container element (null during prerender) */
  container: HTMLElement | null;
  /** Unique instance identifier */
  uid: string;
  /** Component tag name */
  tag: string;
}

/**
 * Definition for a single component prop.
 *
 * @typeParam T - The type of the prop value
 * @typeParam P - The props type for the component
 *
 * @remarks
 * Prop definitions control how individual props are validated, serialized,
 * and passed between consumer and host components.
 *
 * @example
 * ```typescript
 * import { prop } from 'forgeframe';
 *
 * const propDef: PropDefinition<string> = {
 *   schema: prop.string(),
 *   required: true,
 *   default: 'hello',
 *   validate: ({ value }) => {
 *     if (value.length > 100) throw new Error('Too long');
 *   },
 * };
 * ```
 *
 * @public
 */
export interface PropDefinition<T = unknown, P = Record<string, unknown>> {
  /**
   * Standard Schema validator for type checking and validation.
   *
   * @remarks
   * Accepts any StandardSchemaV1-compliant schema including ForgeFrame's
   * built-in `prop.*` schemas, Zod, Valibot, ArkType, and others.
   *
   * @example
   * ```typescript
   * import { prop } from 'forgeframe';
   * import { z } from 'zod';
   *
   * const props = {
   *   // Using ForgeFrame's prop schemas
   *   name: prop.string().min(1),
   *   count: prop.number().default(0),
   *
   *   // Or using Zod schemas
   *   email: { schema: z.string().email(), required: true },
   * };
   * ```
   *
   * @see https://standardschema.dev/
   */
  schema?: StandardSchemaV1<unknown, T>;

  /** Whether the prop is required */
  required?: boolean;
  /** Default value or function returning default value */
  default?: T | ((ctx: PropContext<P>) => T);
  /** Function to compute the prop value */
  value?: (ctx: PropContext<P>) => T;

  /** Whether to send this prop to the host window (default: true) */
  sendToHost?: boolean;
  /** Only deliver after the loaded host is verified to be same-origin */
  sameDomain?: boolean;
  /** List of trusted domains that can receive this prop */
  trustedDomains?: DomainMatcher[];

  /** Serialization strategy for cross-domain transfer */
  serialization?: SerializationType;
  /** Pass prop via URL query parameter */
  queryParam?: boolean | string | ((opts: { value: T }) => string);
  /** Pass prop via POST body parameter */
  bodyParam?: boolean | string | ((opts: { value: T }) => string);

  /** Validate the prop value (throw to reject) */
  validate?: (opts: { value: T; props: P }) => void;
  /** Transform the prop value in consumer context */
  decorate?: (opts: { value: T; props: P }) => T;
  /** Transform the prop value in host context */
  hostDecorate?: (opts: { value: T; props: P }) => T;

  /** Alternative name for the prop */
  alias?: string;
}

/**
 * Map of prop names to their definitions.
 *
 * @typeParam P - The props type for the component
 *
 * @public
 */
export type PropsDefinition<P> = {
  [K in keyof P]?: PropDefinition<P[K], P>;
};

/**
 * Infers the output type from a Standard Schema.
 *
 * @typeParam S - The Standard Schema type
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * const schema = z.object({ name: z.string() });
 * type User = InferSchemaOutput<typeof schema>; // { name: string }
 * ```
 *
 * @public
 */
export type InferSchemaOutput<S extends StandardSchemaV1> = InferOutput<S>;

/**
 * Helper type for creating schema-based prop definitions with full type inference.
 *
 * @typeParam S - The Standard Schema type
 * @typeParam P - The props type for the component
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const userSchema = z.object({ name: z.string(), age: z.number() });
 *
 * type UserPropDef = SchemaPropDefinition<typeof userSchema>;
 * // Equivalent to: PropDefinition<{ name: string; age: number }> with schema
 * ```
 *
 * @public
 */
export type SchemaPropDefinition<
  S extends StandardSchemaV1,
  P = Record<string, unknown>,
> = Omit<PropDefinition<InferOutput<S>, P>, 'type'> & {
  schema: S;
};

// Re-export StandardSchemaV1 for convenience
export type { StandardSchemaV1 } from './props/schema';

// ============================================================================
// Template Types
// ============================================================================

/**
 * Context object passed to container and prerender template functions.
 *
 * @typeParam P - The props type for the component
 *
 * @public
 */
export interface TemplateContext<P = Record<string, unknown>> {
  /** Unique instance identifier */
  uid: string;
  /** Component tag name */
  tag: string;
  /** Rendering context (iframe or popup) */
  context: ContextType;
  /** Component dimensions */
  dimensions: Dimensions;
  /** Current props */
  props: P;
  /** Document object for creating elements */
  doc: Document;
  /** Container element */
  container: HTMLElement;
  /** The iframe element (null for popup context) */
  frame: HTMLIFrameElement | null;
  /** The prerender/loading element (from prerenderTemplate) */
  prerenderFrame: HTMLElement | null;
  /** Close the component */
  close: () => Promise<void>;
  /** Focus the component */
  focus: () => Promise<void>;
}

/**
 * Function that creates a custom container element for the component.
 *
 * @typeParam P - The props type for the component
 *
 * @param ctx - Template context with component info
 * @returns The container element or null to use default
 *
 * @public
 */
export type ContainerTemplate<P = Record<string, unknown>> = (
  ctx: TemplateContext<P>
) => HTMLElement | null;

/**
 * Function that creates a custom prerender (loading) element.
 *
 * @typeParam P - The props type for the component
 *
 * @param ctx - Template context with component info
 * @returns The prerender element or null for no prerender
 *
 * @public
 */
export type PrerenderTemplate<P = Record<string, unknown>> = (
  ctx: TemplateContext<P>
) => HTMLElement | null;

// ============================================================================
// Nested Component Types
// ============================================================================

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
}) => Record<string, ForgeFrameComponent>;

/**
 * Serializable reference to a host component for cross-domain transfer.
 *
 * @internal
 */
export interface HostComponentRef {
  /** Component tag name */
  tag: string;
  /** Component URL */
  url: string;
  /** Prop definitions */
  props?: PropsDefinition<Record<string, unknown>>;
  /** Default dimensions */
  dimensions?: Dimensions;
  /** Default rendering context */
  defaultContext?: ContextType;
}

// ============================================================================
// Component Options
// ============================================================================

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
   * Configuration for automatic resizing based on content.
   */
  autoResize?: AutoResizeOptions;

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

// ============================================================================
// Event Emitter Types
// ============================================================================

/**
 * Handler function for component events.
 *
 * @typeParam T - The type of data passed to the handler
 *
 * @public
 */
export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

/**
 * Event emitter interface for component lifecycle events.
 *
 * @public
 */
export interface EventEmitterInterface {
  /**
   * Subscribe to an event.
   *
   * @param event - Event name to listen for
   * @param handler - Handler function to call
   * @returns Unsubscribe function
   */
  on<T = unknown>(event: EventType | string, handler: EventHandler<T>): () => void;

  /**
   * Subscribe to an event for a single emission.
   *
   * @param event - Event name to listen for
   * @param handler - Handler function to call
   * @returns Unsubscribe function
   */
  once<T = unknown>(event: EventType | string, handler: EventHandler<T>): () => void;

  /**
   * Emit an event with optional data.
   *
   * @param event - Event name to emit
   * @param data - Data to pass to handlers
   */
  emit<T = unknown>(event: EventType | string, data?: T): void;

  /**
   * Unsubscribe a handler from an event.
   *
   * @param event - Event name
   * @param handler - Handler to remove (optional, removes all if not provided)
   */
  off(event: EventType | string, handler?: EventHandler): void;

  /**
   * Remove all event listeners.
   */
  removeAllListeners(): void;
}

// ============================================================================
// Component Instance Types
// ============================================================================

/**
 * Instance of a rendered component.
 *
 * @typeParam P - The props type for the component
 * @typeParam X - The type of exports from the host
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
export interface ForgeFrameComponentInstance<P = Record<string, unknown>, X = unknown> {
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
    container?: string | HTMLElement,
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
    container?: string | HTMLElement,
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
  updateProps(props: Partial<P>): Promise<void>;

  /**
   * Create a copy of this instance with the same props.
   *
   * @returns New component instance
   */
  clone(): ForgeFrameComponentInstance<P, X>;

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

// ============================================================================
// Component Factory Types
// ============================================================================

/**
 * Component factory function and static properties.
 *
 * @typeParam P - The props type for the component
 * @typeParam X - The type of exports from the host
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
export interface ForgeFrameComponent<P = Record<string, unknown>, X = unknown> {
  /**
   * Create a new component instance with props.
   *
   * @param props - Props to pass to the component
   * @returns New component instance
   */
  (props?: P): ForgeFrameComponentInstance<P, X>;

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
  instances: ForgeFrameComponentInstance<P, X>[];
}

// ============================================================================
// Consumer Namespace Types (for host access to consumer)
// ============================================================================

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

// ============================================================================
// Sibling Component Types
// ============================================================================

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

// ============================================================================
// Host Component Types
// ============================================================================

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

// ============================================================================
// Communication Types
// ============================================================================

/**
 * Payload encoded in window.name for initial consumer-to-host data transfer.
 *
 * @typeParam _P - The props type (unused, for compatibility)
 *
 * @internal
 */
export interface WindowNamePayload<_P = Record<string, unknown>> {
  /** Consumer component instance UID */
  uid: string;
  /** Component tag name */
  tag: string;
  /** ForgeFrame version */
  version: string;
  /** Rendering context */
  context: ContextType;
  /** Consumer window domain */
  consumerDomain: string;
  /** Serialized props */
  props: SerializedProps;
  /** Consumer method message names */
  exports: ConsumerExports;
  /** Nested component references */
  children?: Record<string, HostComponentRef>;
}

/**
 * Serialized props ready for cross-domain transfer.
 *
 * @internal
 */
export interface SerializedProps {
  [key: string]: unknown;
}

/**
 * Map of consumer methods to their message names.
 *
 * @internal
 */
export interface ConsumerExports {
  /** Init message name */
  init: string;
  /** Close message name */
  close: string;
  /** Resize message name */
  resize: string;
  /** Show message name */
  show: string;
  /** Hide message name */
  hide: string;
  /** Error message name */
  onError: string;
  /** Update props message name */
  updateProps: string;
  /** Export message name */
  export: string;
}

/**
 * Serialized function reference for cross-domain calls.
 *
 * @internal
 */
export interface FunctionRef {
  /** Type marker */
  __type__: 'function';
  /** Unique function ID */
  __id__: string;
  /** Function name for debugging */
  __name__: string;
}

/**
 * Cross-domain message structure.
 *
 * @internal
 */
export interface Message {
  /** Unique message ID */
  id: string;
  /** Message type */
  type: 'request' | 'response' | 'ack';
  /** Message name/action */
  name: string;
  /** Message payload */
  data?: unknown;
  /** Error information (for error responses) */
  error?: {
    message: string;
    stack?: string;
  };
  /** Message source info */
  source: {
    uid: string;
    domain: string;
  };
}

// ============================================================================
// Window Reference Types
// ============================================================================

/**
 * Reference to a window for cross-domain communication.
 *
 * @internal
 */
export type WindowRef =
  | { type: 'opener' }
  | { type: 'parent'; distance: number }
  | { type: 'global'; uid: string }
  | { type: 'direct'; win: Window };
