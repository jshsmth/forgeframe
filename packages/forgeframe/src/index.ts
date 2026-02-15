/**
 * @packageDocumentation
 * ForgeFrame - Modern cross-domain component framework.
 *
 * @remarks
 * A minimal, TypeScript-first alternative to zoid with zero runtime dependencies.
 * Enables rendering components in iframes or popups across domains while
 * seamlessly passing props (including functions) between consumer and host.
 *
 * @example
 * ```typescript
 * import ForgeFrame, { prop } from 'forgeframe';
 *
 * // Define a component with schema-based props
 * const LoginComponent = ForgeFrame.create({
 *   tag: 'login-component',
 *   url: 'https://auth.example.com/login',
 *   props: {
 *     email: prop.string().email(),
 *     rememberMe: prop.boolean().default(false),
 *     onLogin: prop.function<(user: { id: string }) => void>(),
 *   },
 * });
 *
 * // Render the component
 * LoginComponent({
 *   email: 'user@example.com',
 *   onLogin: (user) => console.log('Logged in:', user),
 * }).render('#container');
 * ```
 */

// Core API
import {
  create,
  destroy,
  destroyByTag,
  destroyAll,
  isHost,
  isEmbedded,
  getHostProps,
  initHost,
} from './core';

// Constants
import {
  PROP_SERIALIZATION,
  CONTEXT,
  EVENT,
  VERSION,
} from './constants';

// Errors
import { PopupOpenError } from './render/popup';

// Schema utilities
import { isStandardSchema } from './props/schema';

import { prop } from './props/prop';

// Pre-initialize host state if in a ForgeFrame window.
// INIT is deferred until initHost() is explicitly flushed or a host component definition does so.
initHost(undefined, undefined, { deferInit: true });

/**
 * Main ForgeFrame API object.
 *
 * @remarks
 * Provides a zoid-compatible interface for creating and managing
 * cross-domain components. All methods and constants are accessible
 * through this object.
 *
 * @example
 * ```typescript
 * import ForgeFrame from 'forgeframe';
 *
 * const Component = ForgeFrame.create({
 *   tag: 'my-component',
 *   url: '/component.html',
 * });
 * ```
 *
 * @public
 */
export const ForgeFrame = {
  /**
   * Create a new component definition.
   *
   * @remarks
   * This is the main entry point for defining components. Returns a
   * component factory function that can be called to create instances.
   *
   * @example
   * ```typescript
   * import ForgeFrame, { prop } from 'forgeframe';
   *
   * const MyComponent = ForgeFrame.create({
   *   tag: 'my-component',
   *   url: 'https://example.com/component',
   *   props: {
   *     email: prop.string().email(),
   *     onLogin: prop.function<(user: { id: string }) => void>(),
   *   },
   * });
   *
   * const instance = MyComponent({ email: 'user@example.com', onLogin: (user) => {} });
   * await instance.render('#container');
   * ```
   */
  create,

  /**
   * Destroy a single component instance.
   *
   * @param instance - The component instance to destroy
   */
  destroy,

  /**
   * Destroy all instances of a specific component by tag.
   *
   * @param tag - The component tag name
   */
  destroyByTag,

  /**
   * Destroy all ForgeFrame component instances.
   */
  destroyAll,

  /**
   * Check if the current window is a host component context.
   *
   * @remarks
   * A "host" is the embedded iframe or popup window that receives props
   * from the consumer (the embedding app).
   *
   * @returns True if running inside a ForgeFrame iframe/popup
   */
  isHost,

  /**
   * Check if the current window is embedded by ForgeFrame.
   *
   * @remarks
   * This is an alias for {@link isHost} that uses more intuitive terminology.
   *
   * @returns True if running inside a ForgeFrame iframe/popup
   */
  isEmbedded,

  /**
   * Get hostProps from the current host window.
   *
   * @remarks
   * Returns the props passed from the consumer plus built-in control methods.
   *
   * @returns The hostProps object if in host context, undefined otherwise
   */
  getHostProps,

  /**
   * Flush host initialization in embedded contexts.
   *
   * @remarks
   * Only required in host pages that access `window.hostProps` directly
   * without defining a component via `ForgeFrame.create(...)`.
   * When `create()` is used on the host side, init is flushed automatically.
   *
   * @returns The host component instance if running embedded, otherwise null
   */
  initHost,

  /**
   * Serialization strategy constants.
   * @see {@link PROP_SERIALIZATION}
   */
  PROP_SERIALIZATION,

  /**
   * Rendering context constants (IFRAME, POPUP).
   * @see {@link CONTEXT}
   */
  CONTEXT,

  /**
   * Lifecycle event name constants.
   * @see {@link EVENT}
   */
  EVENT,

  /**
   * Error thrown when popup window fails to open.
   */
  PopupOpenError,

  /**
   * Current library version.
   */
  VERSION,

  /**
   * Check if a value is a Standard Schema (Zod, Valibot, ArkType, etc.)
   *
   * @param value - The value to check
   * @returns True if the value implements StandardSchemaV1
   *
   * @example
   * ```typescript
   * import { z } from 'zod';
   *
   * const schema = z.string();
   * if (ForgeFrame.isStandardSchema(schema)) {
   *   // schema is StandardSchemaV1
   * }
   * ```
   */
  isStandardSchema,

  /**
   * Prop schema builders for defining component props.
   *
   * @remarks
   * Provides a fluent, Zod-like API for defining prop schemas with built-in
   * validation. All schemas implement StandardSchemaV1.
   *
   * @example
   * ```typescript
   * import ForgeFrame from 'forgeframe';
   *
   * const Component = ForgeFrame.create({
   *   tag: 'my-component',
   *   url: '/component',
   *   props: {
   *     name: ForgeFrame.prop.string(),
   *     count: ForgeFrame.prop.number().default(0),
   *     onSubmit: ForgeFrame.prop.function().optional(),
   *   },
   * });
   * ```
   */
  prop,
} as const;

/**
 * Default export of the ForgeFrame API object.
 * @public
 */
export default ForgeFrame;

// Named exports for tree-shaking
export {
  create,
  destroy,
  destroyByTag,
  destroyAll,
  isHost,
  isEmbedded,
  getHostProps,
  initHost,
} from './core';

export {
  PROP_SERIALIZATION,
  CONTEXT,
  EVENT,
  VERSION,
} from './constants';

export { PopupOpenError } from './render/popup';

// Schema utilities
export { isStandardSchema } from './props/schema';

// Prop schema builders
export {
  prop,
  PropSchema,
  StringSchema,
  NumberSchema,
  BooleanSchema,
  FunctionSchema,
  ArraySchema,
  ObjectSchema,
  LiteralSchema,
  EnumSchema,
  AnySchema,
  type Prop,
  type InferObjectShape,
} from './props/prop';

// Type exports
export type {
  // Component types
  ComponentOptions,
  ForgeFrameComponent,
  ForgeFrameComponentInstance,
  HostProps,
  HostPropsBuiltins,

  // Props types
  PropDefinition,
  PropsDefinition,
  PropContext,

  // Standard Schema types
  StandardSchemaV1,
  InferSchemaOutput,
  SchemaPropDefinition,

  // Template types
  TemplateContext,
  ContainerTemplate,
  PrerenderTemplate,

  // Utility types
  Dimensions,
  DomainMatcher,
  AutoResizeOptions,
  IframeAttributes,
  IframeStyles,
  EligibilityResult,
  SiblingInfo,
  GetPeerInstancesOptions,

  // Event types
  EventHandler,
  EventEmitterInterface,
} from './types';

export type {
  ContextType,
  EventType,
  SerializationType,
} from './constants';

// React integration exports
export {
  createReactComponent,
  withReactComponent,
  type ReactDriverOptions,
  type ReactComponentProps,
  type ReactComponentType,
} from './drivers/react';
