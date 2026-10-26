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
 * import { create, prop } from 'forgeframe';
 *
 * // Define a component with schema-based props
 * const LoginComponent = create({
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

export type { ContextType } from "./constants";
export { VERSION } from "./constants";

// Named exports for tree-shaking
export { closeAll, create, initHost, isHost } from "./core";
// React integration exports
export {
	createReactComponent,
	type ReactComponentProps,
	type ReactComponentType,
	type ReactDriverOptions,
	withReactComponent,
} from "./drivers/react";
// Prop schema builders; the schema classes are types, built with prop.*
export {
	type AnySchema,
	type ArraySchema,
	type BooleanSchema,
	type DateSchema,
	type EnumSchema,
	type FunctionSchema,
	type InferObjectInputShape,
	type InferObjectShape,
	type LiteralSchema,
	type NumberSchema,
	type ObjectSchema,
	type PropSchema,
	prop,
	type RecordSchema,
	type StringSchema,
	type TupleSchema,
	type UnionSchema,
} from "./props/prop";
export { PopupOpenError } from "./render/popup";
// Type exports
export type {
	// Component types
	Component,
	ComponentBaseOptions,
	ComponentEvents,
	ComponentInstance,
	ComponentOptions,
	ComponentUrlOptions,
	ContainerTemplate,
	// Utility types
	Dimensions,
	// Event types
	EventHandler,
	EventSubscriber,
	EventType,
	ExportsOf,
	GetPeerInstancesOptions,
	Host,
	HostEvents,
	HostProps,
	HostPropsBuiltins,
	HostPropsOf,
	IframeAttributes,
	IframeStyles,
	InferInput,
	InferProps,
	InitHostOptions,
	InputOf,
	OriginMatcher,
	PeerInfo,
	PrerenderTemplate,
	// Props types
	PropDefinition,
	PropDelivery,
	PropsDefinition,
	PropsOf,
	RemoteValue,
	// Standard Schema types
	StandardSchemaV1,
	// Template types
	TemplateContext,
} from "./types";
