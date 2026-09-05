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

export type {
	ContextType,
	EventType,
	SerializationType,
} from "./constants";
export {
	CONTEXT,
	EVENT,
	PROP_SERIALIZATION,
	VERSION,
} from "./constants";

// Named exports for tree-shaking
export {
	create,
	destroy,
	destroyAll,
	destroyByTag,
	getHostProps,
	initHost,
	isEmbedded,
	isHost,
} from "./core";
// React integration exports
export {
	createReactComponent,
	type ReactComponentProps,
	type ReactComponentType,
	type ReactDriverOptions,
	withReactComponent,
} from "./drivers/react";
export { default, ForgeFrame } from "./forgeframe";

// Prop schema builders
export {
	AnySchema,
	ArraySchema,
	BooleanSchema,
	DateSchema,
	EnumSchema,
	FunctionSchema,
	type InferObjectInputShape,
	type InferObjectShape,
	LiteralSchema,
	NumberSchema,
	ObjectSchema,
	type Prop,
	PropSchema,
	prop,
	RecordSchema,
	StringSchema,
	TupleSchema,
	UnionSchema,
} from "./props/prop";
// Schema utilities
export { isStandardSchema } from "./props/schema";
export { PopupOpenError } from "./render/popup";
// Type exports
export type {
	ChildrenDefinition,
	// Component types
	ComponentOptions,
	ConsumerNamespace,
	ConsumerPropsInput,
	ConsumerPropsUpdate,
	ContainerTemplate,
	// Utility types
	Dimensions,
	DomainMatcher,
	EligibilityResult,
	EventEmitterInterface,
	// Event types
	EventHandler,
	ForgeFrameComponent,
	ForgeFrameComponentInstance,
	ForgeFrameComponentReference,
	GetPeerInstancesOptions,
	HostProps,
	HostPropsBuiltins,
	HostPropsDefinition,
	IframeAttributes,
	IframeStyles,
	InferPropsDefinition,
	InferPropsDefinitionInput,
	InferSchemaOutput,
	PrerenderTemplate,
	PropContext,
	// Props types
	PropDefinition,
	PropDefinitionEntry,
	PropsDefinition,
	RemoteValue,
	SchemaPropDefinition,
	SiblingInfo,
	// Standard Schema types
	StandardSchemaV1,
	// Template types
	TemplateContext,
} from "./types";
