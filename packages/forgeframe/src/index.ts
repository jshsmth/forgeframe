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

export { ForgeFrame } from './forgeframe';
export { default } from './forgeframe';

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
  DateSchema,
  BooleanSchema,
  FunctionSchema,
  ArraySchema,
  TupleSchema,
  ObjectSchema,
  RecordSchema,
  LiteralSchema,
  EnumSchema,
  UnionSchema,
  AnySchema,
  type Prop,
  type InferObjectShape,
} from './props/prop';

// Type exports
export type {
  // Component types
  ComponentOptions,
  ConsumerPropsInput,
  ConsumerPropsUpdate,
  ForgeFrameComponent,
  ForgeFrameComponentReference,
  ForgeFrameComponentInstance,
  HostProps,
  HostPropsBuiltins,
  ChildrenDefinition,
  ConsumerNamespace,

  // Props types
  PropDefinition,
  PropDefinitionEntry,
  PropsDefinition,
  InferPropsDefinition,
  InferPropsDefinitionInput,
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
