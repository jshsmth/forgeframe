/**
 * Compile-time assertions for schema-backed component definitions.
 *
 * Covers inferred props, input and exports, the type helpers that read them
 * back, `satisfies PropsDefinition<P>`, third-party Standard Schemas, wrapped
 * definitions whose presence and defaults come from their schemas, the removed
 * prop options and types, callbacks, read-only instance tracking, and the
 * removed zoid-era APIs.
 */
import * as v from "valibot";
import { z } from "zod";
import {
	type Component,
	type ComponentInstance,
	type ComponentOptions,
	closeAll,
	create,
	createReactComponent,
	type ExportsOf,
	type InputOf,
	initHost,
	type PropDefinition,
	type PropsDefinition,
	type PropsOf,
	prop,
	withReactComponent,
} from "../../src";

/** Whether each type is assignable to the other. */
type IsEquivalent<A, B> = [A] extends [B]
	? [B] extends [A]
		? true
		: false
	: false;
type Assert<T extends true> = T;

const InferredComponent = create({
	tag: "inferred-component",
	url: "https://example.com/inferred",
	props: {
		label: prop.string(),
		count: prop.number().default(0),
		description: prop.string().optional(),
		onSubmit: prop.function<(value: string) => void>(),
	},
});

void InferredComponent({
	label: "ready",
	onSubmit: (_value) => undefined,
});

const inferredHostCount: number | undefined = initHost(InferredComponent, {
	consumerOrigins: "*",
})?.hostProps.count;
void inferredHostCount;

// @ts-expect-error inferred direct schemas reject the wrong value type
void InferredComponent({ label: 1, count: 1, onSubmit: () => undefined });

void InferredComponent({
	label: "ready",
	count: 1,
	// @ts-expect-error inferred callback signatures remain specific
	onSubmit: (_value: number) => undefined,
});

// Callable Standard Schemas, such as ArkType types, infer like schema objects.
declare const callableStringSchema: ((input: unknown) => unknown) & {
	readonly "~standard": {
		readonly version: 1;
		readonly vendor: "callable-validator";
		readonly validate: (
			value: unknown,
		) => { value: string } | { issues: [{ message: string }] };
		readonly types?: { readonly input: string; readonly output: string };
	};
};

const CallableSchemaComponent = create({
	tag: "callable-schema-component",
	url: "https://example.com/callable",
	props: { name: callableStringSchema },
});

void CallableSchemaComponent({ name: "ready" });

// @ts-expect-error callable schemas reject the wrong value type
void CallableSchemaComponent({ name: 1 });

const callableHostName: string | undefined = initHost(CallableSchemaComponent, {
	consumerOrigins: "*",
})?.hostProps.name;
void callableHostName;

// create() takes no type arguments: types come from the schemas.
interface LoginProps {
	email: string;
	rememberMe: boolean;
	ref?: string;
	onLogin: (user: { id: string }) => void;
}

create<
	// @ts-expect-error a props interface is not a definitions map; drop the type argument
	LoginProps
>({
	tag: "explicit-type-argument-component",
	url: "https://example.com/explicit",
	props: { email: prop.string() },
});

// satisfies checks hand-written interfaces against the definitions.
const loginDefinitions = {
	email: prop.string().email(),
	rememberMe: prop.boolean().default(false),
	ref: { schema: prop.string().optional(), queryParam: true },
	onLogin: prop.function<(user: { id: string }) => void>(),
} satisfies PropsDefinition<LoginProps>;
const LoginForm = create({
	tag: "satisfies-login-component",
	url: "https://example.com/login",
	props: loginDefinitions,
});
export const loginPropsRoundTrip: Assert<
	IsEquivalent<PropsOf<typeof LoginForm>, LoginProps>
> = true;

const missingDefinition = {
	email: prop.string(),
	rememberMe: prop.boolean(),
	ref: prop.string().optional(),
	// @ts-expect-error satisfies reports a missing definition (onLogin)
} satisfies PropsDefinition<LoginProps>;
void missingDefinition;

const mismatchedDefinition = {
	// @ts-expect-error satisfies reports a schema whose output does not match
	email: prop.number(),
	rememberMe: prop.boolean(),
	ref: prop.string().optional(),
	onLogin: prop.function<(user: { id: string }) => void>(),
} satisfies PropsDefinition<LoginProps>;
void mismatchedDefinition;

const optionalForRequired = {
	// @ts-expect-error a required key rejects a schema that may produce undefined
	email: prop.string().optional(),
	rememberMe: prop.boolean(),
	ref: prop.string().optional(),
	onLogin: prop.function<(user: { id: string }) => void>(),
} satisfies PropsDefinition<LoginProps>;
void optionalForRequired;

// Enum values keep their literal types under satisfies.
const outcomeDefinitions = {
	outcome: prop.enum(["success", "decline"]),
} satisfies PropsDefinition<{ outcome: "success" | "decline" }>;
void outcomeDefinitions;

// Third-party schemas are checked the same way.
const thirdPartyDefinitions = {
	email: z.string().email(),
	rememberMe: v.optional(v.boolean(), false),
	ref: { schema: z.string().optional(), bodyParam: "ref" },
	onLogin: prop.function<(user: { id: string }) => void>(),
} satisfies PropsDefinition<LoginProps>;
void thirdPartyDefinitions;

const thirdPartyMismatch = {
	// @ts-expect-error a Zod schema whose output does not match is reported
	email: z.number(),
	// @ts-expect-error a Valibot schema whose output does not match is reported
	rememberMe: v.string(),
	ref: z.string().optional(),
	onLogin: prop.function<(user: { id: string }) => void>(),
} satisfies PropsDefinition<LoginProps>;
void thirdPartyMismatch;

// PropsOf and InputOf read a component's props and factory input.
type LoginInput = InputOf<typeof LoginForm>;
export const loginInputKeepsRequiredKeys: Assert<
	IsEquivalent<
		LoginInput,
		{
			email: string;
			onLogin: (user: { id: string }) => void;
		} & {
			rememberMe?: boolean | undefined;
			ref?: string | undefined;
		}
	>
> = true;
// @ts-expect-error InputOf keeps required keys required
const missingLoginInput: LoginInput = { email: "a@example.com" };
void missingLoginInput;
const loginInstance: ComponentInstance<
	PropsOf<typeof LoginForm>,
	InputOf<typeof LoginForm>,
	ExportsOf<typeof LoginForm>
> = LoginForm({ email: "a@example.com", onLogin: () => undefined });
void loginInstance;
const loginComponent: Component<LoginProps, LoginInput> = LoginForm;
void loginComponent;
// Without an exports schema, exports are unknown.
export const loginExportsUnknown: Assert<
	IsEquivalent<ExportsOf<typeof LoginForm>, unknown>
> = true;

// An exports schema types instance.exports and ExportsOf.
const ExportingComponent = create({
	tag: "exporting-component",
	url: "https://example.com/exporting",
	exports: prop.object({
		validate: prop.function<() => boolean>(),
		ready: prop.boolean(),
	}),
});
export const exportsInferred: Assert<
	IsEquivalent<
		ExportsOf<typeof ExportingComponent>,
		{ validate: () => boolean; ready: boolean }
	>
> = true;
const exportingInstance = ExportingComponent();
const validated: Promise<boolean> | undefined =
	exportingInstance.exports?.validate();
const ready: boolean | undefined = exportingInstance.exports?.ready;
void validated;
void ready;
// @ts-expect-error exports only carry what the schema declares
void exportingInstance.exports?.missing;

const zodExportsComponent = create({
	tag: "zod-exports-component",
	url: "https://example.com/zod-exports",
	exports: z.object({ total: z.number() }),
});
const total: number | undefined = zodExportsComponent().exports?.total;
void total;

create({
	tag: "transforming-exports-component",
	url: "https://example.com/transforming-exports",
	// @ts-expect-error an exports schema's output must be valid input to the same schema
	exports: z.string().transform(Number),
});

const ExternalSchemaComponent = create({
	tag: "external-schema-component",
	url: "https://example.com/external",
	props: {
		zodValue: z.string(),
		valibotValue: v.string(),
		defaultedValue: z.string().default("fallback"),
		wrappedValue: {
			schema: z.number(),
			deliverTo: "same-origin",
		},
	},
});

void ExternalSchemaComponent({
	zodValue: "zod",
	valibotValue: "valibot",
	wrappedValue: 42,
});

void ExternalSchemaComponent({
	// @ts-expect-error third-party Standard Schema inputs are inferred
	zodValue: 1,
	valibotValue: "ok",
	wrappedValue: 42,
});

const externalSchemaHostProps = initHost(ExternalSchemaComponent, {
	consumerOrigins: "*",
})?.hostProps;
const defaultedHostValue: string | undefined =
	externalSchemaHostProps?.defaultedValue;
void defaultedHostValue;

const WrappedPresenceComponent = create({
	tag: "wrapped-presence-component",
	domain: "https://example.com",
	url: (props) => {
		const requiredValue: string = props.requiredWrapper;
		const optionalValue: string | undefined = props.optionalWrapper;
		const defaultedValue: string = props.defaultedWrapper;
		void optionalValue;
		return `https://example.com/wrapped-presence/${requiredValue}/${defaultedValue}`;
	},
	props: {
		requiredWrapper: {
			schema: prop.string(),
			queryParam: true,
		},
		optionalWrapper: {
			schema: prop.string().optional(),
			deliverTo: "same-origin",
		},
		defaultedWrapper: {
			schema: z.string().default("fallback"),
			bodyParam: "defaulted",
		},
	},
});

void WrappedPresenceComponent({ requiredWrapper: "required" });

const wrappedPresenceHost = initHost(WrappedPresenceComponent, {
	consumerOrigins: "*",
});
if (wrappedPresenceHost) {
	const hostProps = wrappedPresenceHost.hostProps;
	const requiredValue: string = hostProps.requiredWrapper;
	const optionalValue: string | undefined = hostProps.optionalWrapper;
	const defaultedValue: string = hostProps.defaultedWrapper;
	void requiredValue;
	void optionalValue;
	void defaultedValue;
}

// @ts-expect-error a wrapped prop is required when its schema rejects undefined
void WrappedPresenceComponent({});

// @ts-expect-error a required wrapped prop rejects an explicit undefined value
void WrappedPresenceComponent({ requiredWrapper: undefined });

const removedSerializationDefinition: PropDefinition = {
	schema: prop.any<Record<string, unknown>>(),
	// @ts-expect-error typed prop definitions reject the removed serialization option
	serialization: "dotify",
};
void removedSerializationDefinition;

// create() captures a literal's extra keys, so it does not report
// serialization at compile time; create() rejects it at runtime.

const removedPropOptions: PropDefinition<string>[] = [
	// @ts-expect-error required was removed; the schema decides presence
	{ schema: prop.string(), required: true },
	// @ts-expect-error default was removed; use the schema's .default()
	{ schema: prop.string(), default: "fallback" },
	// @ts-expect-error value was removed; compute the value before passing it
	{ schema: prop.string(), value: () => "computed" },
	// @ts-expect-error decorate was removed; use a schema transform
	{ schema: prop.string(), decorate: ({ value }) => value },
	// @ts-expect-error hostDecorate was removed; transform on the host
	{ schema: prop.string(), hostDecorate: ({ value }) => value },
	// @ts-expect-error validate was removed; use a schema refinement
	{ schema: prop.string(), validate: () => undefined },
	// @ts-expect-error alias was removed; rename inputs before the factory call
	{ schema: prop.string(), alias: "legacyLabel" },
	// @ts-expect-error sameDomain was replaced by deliverTo: 'same-origin'
	{ schema: prop.string(), sameDomain: true },
	// @ts-expect-error trustedDomains was replaced by deliverTo
	{ schema: prop.string(), trustedDomains: ["https://a.example"] },
	// @ts-expect-error a wrapped definition needs a schema
	{ queryParam: true },
	// @ts-expect-error queryParam no longer accepts an encoder function
	{ schema: prop.string(), queryParam: ({ value }) => value },
	// @ts-expect-error bodyParam no longer accepts an encoder function
	{ schema: prop.string(), bodyParam: ({ value }) => value },
	// @ts-expect-error deliverTo takes 'same-origin' or an origin matcher
	{ schema: prop.string(), deliverTo: 42 },
];
void removedPropOptions;

const deliveryDefinitions: PropDefinition<string>[] = [
	{ schema: prop.string(), deliverTo: "same-origin" },
	{ schema: prop.string(), deliverTo: "https://pay.example.com" },
	{ schema: prop.string(), deliverTo: /^https:\/\/pay\.example\.com$/ },
	{ schema: prop.string(), deliverTo: ["https://a.example", /b/] },
	{ schema: prop.string(), queryParam: true, bodyParam: "label" },
	{ schema: prop.string(), queryParam: false, bodyParam: false },
];
void deliveryDefinitions;

const typeChangingSchema = z.string().transform(Number);

create({
	tag: "invalid-direct-transform-component",
	url: "https://example.com/invalid-direct-transform",
	props: {
		// @ts-expect-error a schema's output must be valid input to the same schema
		amount: typeChangingSchema,
	},
});

create({
	tag: "invalid-wrapped-transform-component",
	url: "https://example.com/invalid-wrapped-transform",
	props: {
		// @ts-expect-error wrapped schemas follow the same rule
		amount: { schema: typeChangingSchema, queryParam: true },
	},
});

create({
	tag: "invalid-consumer-only-transform-component",
	url: "https://example.com/invalid-consumer-only-transform",
	props: {
		target: {
			// @ts-expect-error consumer-only props are rechecked with the same schema
			schema: z.string().transform((href) => new URL(href)),
			sendToHost: false,
		},
	},
});

// The removed outputSchema option is not part of a prop definition.
const removedOutputSchemaDefinition: PropDefinition<number> = {
	schema: z.number(),
	// @ts-expect-error outputSchema was removed; each prop has one schema
	outputSchema: z.number(),
};
void removedOutputSchemaDefinition;

// @ts-expect-error SchemaPropDefinition was removed; use PropDefinition
type RemovedSchemaPropDefinition = import("../../src").SchemaPropDefinition<
	typeof typeChangingSchema
>;
// @ts-expect-error PropDefinitionEntry was removed; use PropsDefinition
type RemovedPropDefinitionEntry = import("../../src").PropDefinitionEntry;
// @ts-expect-error HostPropsDefinition was removed; use PropsDefinition
type RemovedHostPropsDefinition = import("../../src").HostPropsDefinition<{
	count: number;
}>;
// @ts-expect-error InferPropsDefinition was renamed InferProps
type RemovedInferPropsDefinition = import("../../src").InferPropsDefinition<
	Record<string, never>
>;
// @ts-expect-error InferPropsDefinitionInput was renamed InferInput
type RemovedInferPropsInput = import("../../src").InferPropsDefinitionInput<
	Record<string, never>
>;
// @ts-expect-error ForgeFrameComponent was renamed Component
type RemovedForgeFrameComponent = import("../../src").ForgeFrameComponent;
// @ts-expect-error ForgeFrameComponentInstance was renamed ComponentInstance
type RemovedInstance = import("../../src").ForgeFrameComponentInstance;
export type RemovedDefinitionTypes = [
	RemovedSchemaPropDefinition,
	RemovedPropDefinitionEntry,
	RemovedHostPropsDefinition,
	RemovedInferPropsDefinition,
	RemovedInferPropsInput,
	RemovedForgeFrameComponent,
	RemovedInstance,
];

const coercedSchemaDefinition = {
	schema: z.coerce.number(),
	queryParam: true,
} satisfies PropDefinition<number>;
void coercedSchemaDefinition;

// Coercing and union-accepting schemas take a wider input than they produce.
const dateInput = z
	.union([z.iso.datetime(), z.date()])
	.transform((value) => new Date(value));
const CoercingComponent = create({
	tag: "coercing-component",
	domain: "https://example.com",
	url: (props) => {
		const amount: number = props.amount;
		const startsAt: Date = props.startsAt;
		return `https://example.com/coercing/${amount}/${startsAt.getTime()}`;
	},
	props: {
		amount: z.coerce.number(),
		startsAt: { schema: dateInput, bodyParam: true },
		count: prop.number().default(0),
	},
});
const coercingInstance = CoercingComponent({
	amount: "41",
	startsAt: "2026-11-01T09:00:00Z",
});
void CoercingComponent({ amount: 41, startsAt: new Date() });
void coercingInstance.updateProps({ amount: "42" });
void coercingInstance.updateProps({ startsAt: new Date(), count: 1 });
// A defaulted key stays optional in the factory input and in updates.
void coercingInstance.updateProps({});
// undefined resets a defaulted or optional prop; updates resolve to void.
const resetUpdate: Promise<void> = coercingInstance.updateProps({
	count: undefined,
});
void resetUpdate;
// @ts-expect-error updates accept declared props only
void coercingInstance.updateProps({ unknownProp: 1 });
// @ts-expect-error coercing inputs are still typed by their schema
void CoercingComponent({ amount: "41", startsAt: 1 });

// Any props value is valid factory input.
declare const coercingProps: PropsOf<typeof CoercingComponent>;
const coercedAmount: number = coercingProps.amount;
void coercedAmount;
void CoercingComponent(coercingProps);
void coercingInstance.updateProps(coercingProps);

const coercingHost = initHost(CoercingComponent, { consumerOrigins: "*" });
if (coercingHost) {
	const amount: number = coercingHost.hostProps.amount;
	const startsAt: Date = coercingHost.hostProps.startsAt;
	const count: number = coercingHost.hostProps.count;
	void amount;
	void startsAt;
	void count;
}

// Definition maps are typed by their outputs alone, so defaults fit.
const defaultedDefinitions: PropsDefinition<{ count: number; label: string }> =
	{
		count: prop.number().default(0),
		label: z.string().default("ready"),
	};
void defaultedDefinitions;

const outputCompatibleHostDefinitions = {
	label: { schema: z.string() },
	count: prop.number().default(0),
} satisfies PropsDefinition<{ label: string; count: number }>;
void outputCompatibleHostDefinitions;

const outputTypedHost = initHost({
	props: outputCompatibleHostDefinitions,
	consumerOrigins: "*",
});
const outputTypedCount: number | undefined = outputTypedHost?.hostProps.count;
void outputTypedCount;

// @ts-expect-error the tag-agnostic initHost takes the props type alone
void initHost<{ count: number }, { count?: number }>({ consumerOrigins: "*" });

// @ts-expect-error ComponentOptions takes the props type alone
type TwoParameterOptions = ComponentOptions<
	{ count: number },
	{ count?: number }
>;

export type { TwoParameterOptions };

// InputOf is the factory input, wider than the props for coercions.
type CoercingInput = InputOf<typeof CoercingComponent>;
const coercingInput: CoercingInput = { amount: "2", startsAt: new Date() };
void CoercingComponent(coercingInput);
void CoercingComponent.instances[0]?.updateProps({ amount: "3" });
// @ts-expect-error updates use the factory input type
void coercingInstance.updateProps({ startsAt: 1 });
const typedCoercingComponent: Component<
	PropsOf<typeof CoercingComponent>,
	CoercingInput
> = CoercingComponent;
void typedCoercingComponent({ amount: 2, startsAt: new Date() });

const CoercingReactComponent = createReactComponent(CoercingComponent, {
	React: {} as never,
});
void CoercingReactComponent({ amount: "4", startsAt: "2026-11-01T09:00:00Z" });
const createBoundReactComponent = withReactComponent({} as never);
const BoundCoercedReactComponent = createBoundReactComponent(CoercingComponent);
void BoundCoercedReactComponent({ amount: "4", startsAt: new Date() });
// @ts-expect-error React wrappers preserve the factory input type
void CoercingReactComponent({ amount: 4, startsAt: 1 });
// @ts-expect-error curried React wrappers preserve the factory input type
void BoundCoercedReactComponent({ amount: 4, startsAt: 1 });

void CoercingComponent({
	amount: "2",
	startsAt: new Date(),
	// @ts-expect-error aliases were removed; factories accept only defined keys
	legacyAmount: "2",
});

const WrappedZodComponent = create({
	tag: "wrapped-zod-component",
	url: "https://example.com/wrapped-zod",
	props: { label: { schema: z.string(), queryParam: true } },
});

void WrappedZodComponent({ label: "ready" });
// @ts-expect-error wrapped Zod schemas that reject undefined are required
void WrappedZodComponent({});
// @ts-expect-error wrapped Zod schemas retain their input types
void WrappedZodComponent({ label: 1 });

const IdentityTransformComponent = create({
	tag: "identity-transform-component",
	url: "https://example.com/identity-transform",
	props: { label: z.string().transform((value) => value.trim()) },
});
void IdentityTransformComponent({ label: "ready" });
// @ts-expect-error safe direct transforms retain their schema input types
void IdentityTransformComponent({ label: 1 });

const AnyComponent = create({
	tag: "any-component",
	url: "https://example.com/any",
	props: {
		payload: prop.any(),
		optionalPayload: prop.any().optional(),
	},
});

void AnyComponent({ payload: null });

// @ts-expect-error prop.any() remains required until explicitly made optional
void AnyComponent({});

// @ts-expect-error prop.any() does not accept undefined unless made optional
void AnyComponent({ payload: undefined });

const CompositeInputComponent = create({
	tag: "composite-input-component",
	url: "https://example.com/composite-input",
	props: {
		objectValue: prop.object({
			requiredField: prop.boolean(),
			defaultedField: prop.string().default("default"),
			optionalField: prop.number().optional(),
		}),
		tupleValue: prop.tuple(
			prop.string().default("default"),
			prop.number().optional(),
		),
		arrayValue: prop.array(prop.string().default("default")),
		recordValue: prop.record(prop.number().default(0)),
		unionValue: prop.union(prop.string(), prop.number().default(0)),
	},
});

void CompositeInputComponent({
	objectValue: { requiredField: true },
	tupleValue: [undefined, undefined],
	arrayValue: [undefined],
	recordValue: { first: undefined },
});

void CompositeInputComponent({
	// @ts-expect-error nested object fields without defaults remain required
	objectValue: {},
	tupleValue: [undefined, undefined],
	arrayValue: [],
	recordValue: {},
});

createReactComponent(InferredComponent, { React: {} as never });
withReactComponent({} as never)(InferredComponent);

// @ts-expect-error factories with required inferred inputs reject zero arguments
void InferredComponent();

const OptionalOnlyComponent = create({
	tag: "optional-only-component",
	url: "https://example.com/optional-only",
	props: {
		description: prop.string().optional(),
	},
});

void OptionalOnlyComponent();

// A component without props takes no props argument.
const Propless = create({
	tag: "propless-component",
	url: "https://example.com/propless",
});
void Propless();
export const proplessProps: Assert<
	IsEquivalent<keyof PropsOf<typeof Propless>, never>
> = true;

// Callback defaults are factories, in direct and wrapped definitions.
const onCancel = (): void => {};
const CallbackDefaultComponent = create({
	tag: "callback-default-component",
	url: "https://example.com/callback-default",
	props: {
		onCancel: prop.function<() => void>().default(() => onCancel),
		onClose: {
			schema: prop.function<() => void>().default(() => onCancel),
			sendToHost: false,
		},
	},
});
void CallbackDefaultComponent();

// @ts-expect-error A callback value would be called as its own default factory.
prop.function<() => void>().default(onCancel);

const TrackedComponent = create({
	tag: "typed-tracked-component",
	url: "https://example.com/tracked",
	props: { label: prop.string() },
});

const instancesSnapshot: readonly ComponentInstance<{ label: string }>[] =
	TrackedComponent.instances;
void instancesSnapshot;
// @ts-expect-error instances is a read-only snapshot; close instances instead.
TrackedComponent.instances.push(TrackedComponent({ label: "extra" }));
// @ts-expect-error instances cannot be reassigned.
TrackedComponent.instances = [];
const closingAll: Promise<void> = closeAll();
void closingAll;

const removedApiInstance = TrackedComponent({ label: "removed" });
// @ts-expect-error renderTo was removed; call render(container, context).
void removedApiInstance.renderTo(window, "#container");
// @ts-expect-error clone was removed; call the factory again with explicit props.
void removedApiInstance.clone();
// @ts-expect-error isEligible was removed; throw from the component validate option.
void removedApiInstance.isEligible();
// @ts-expect-error instance.state was removed; keep per-instance state in your code.
void removedApiInstance.state;

create({
	tag: "typed-removed-eligible",
	url: "https://example.com/removed-eligible",
	// @ts-expect-error eligible was removed; throw from validate instead.
	eligible: () => ({ eligible: true }),
});
create({
	tag: "typed-removed-children",
	url: "https://example.com/removed-children",
	// @ts-expect-error children was removed; import child components in the host.
	children: () => ({ TrackedComponent }),
});

type PublicApi = typeof import("../../src");
// @ts-expect-error destroy(instance) was removed; call instance.close().
type RemovedDestroy = PublicApi["destroy"];
// @ts-expect-error destroyByTag was removed; close Component.instances instead.
type RemovedDestroyByTag = PublicApi["destroyByTag"];
// @ts-expect-error destroyAll was replaced by closeAll().
type RemovedDestroyAll = PublicApi["destroyAll"];
// @ts-expect-error ChildrenDefinition was removed with nested children.
type RemovedChildrenDefinition = import("../../src").ChildrenDefinition;
// @ts-expect-error ConsumerNamespace was removed; hostProps.consumer is { props }.
type RemovedConsumerNamespace = import("../../src").ConsumerNamespace;
// @ts-expect-error EligibilityResult was removed with eligible.
type RemovedEligibilityResult = import("../../src").EligibilityResult;
// @ts-expect-error ForgeFrameComponentReference was removed.
type RemovedReference = import("../../src").ForgeFrameComponentReference;
// @ts-expect-error PropContext was removed with default, value and decorate.
type RemovedPropContext = import("../../src").PropContext<unknown>;
// @ts-expect-error ConsumerPropsInput was removed with aliases.
type RemovedPropsInput = import("../../src").ConsumerPropsInput<unknown>;
// @ts-expect-error ConsumerPropsUpdate was removed with aliases.
type RemovedPropsUpdate = import("../../src").ConsumerPropsUpdate<unknown>;
export type RemovedPublicApi = [
	RemovedDestroy,
	RemovedDestroyByTag,
	RemovedDestroyAll,
	RemovedChildrenDefinition,
	RemovedConsumerNamespace,
	RemovedEligibilityResult,
	RemovedReference,
	RemovedPropContext,
	RemovedPropsInput,
	RemovedPropsUpdate,
];

// Wrapped transport options are checked inside create() too.
create({
	tag: "typed-wrapped-options",
	url: "https://example.com/wrapped-options",
	props: {
		secret: { schema: prop.string(), deliverTo: "same-origin" },
		partner: {
			schema: prop.string(),
			deliverTo: ["https://a.example", /^https:\/\/b\./],
		},
		ref: { schema: prop.string().optional(), queryParam: "ref" },
		// @ts-expect-error deliverTo takes 'same-origin' or an origin matcher
		bad: { schema: prop.string(), deliverTo: 42 },
	},
});
// 'same-origin' inside a deliverTo array is a string the types cannot single
// out; create() rejects it at runtime (prop-definition-checks.test.ts).
const sameOriginInArray: PropDefinition<string> = {
	schema: prop.string(),
	deliverTo: ["same-origin", "https://a.example"],
};
void sameOriginInArray;

// A props type literal as a type argument fails too, with or without props.
create<
	// @ts-expect-error props types are not definitions maps; drop the type argument
	{ amount: number }
>({ tag: "typed-explicit-literal", url: "https://example.com/literal" });

// prop.any() keeps its default type inside create().
const AnyDefault = create({
	tag: "typed-any-default",
	url: "https://example.com/any-default",
	props: { payload: prop.any() },
});
// @ts-expect-error prop.any() is required, so the props argument is too
void AnyDefault();
