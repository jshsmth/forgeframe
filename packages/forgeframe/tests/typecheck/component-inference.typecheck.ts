/**
 * Compile-time assertions for schema-backed component definitions.
 *
 * Covers inferred and explicit props, third-party Standard Schemas, wrapped
 * definitions whose presence and defaults come from their schemas, the removed
 * prop options, callbacks, read-only instance tracking, and the removed
 * zoid-era APIs.
 */
import * as v from "valibot";
import { z } from "zod";
import {
	type ComponentOptions,
	closeAll,
	create,
	createReactComponent,
	type ForgeFrameComponent,
	type ForgeFrameComponentInstance,
	type HostPropsDefinition,
	initHost,
	type PropDefinition,
	type PropsDefinition,
	prop,
	type SchemaPropDefinition,
	withReactComponent,
} from "../../src";

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

interface ExplicitProps extends Record<string, unknown> {
	label: string;
	enabled: boolean;
	onChange: (enabled: boolean) => void;
}

interface ExplicitExports {
	ready: boolean;
}

declare const ExplicitlyRequiredFactory: ForgeFrameComponent<
	{ label: string },
	unknown,
	true
>;
void ExplicitlyRequiredFactory({ label: "ready" });
// @ts-expect-error the third generic still makes the props argument required
void ExplicitlyRequiredFactory();

const ExplicitComponent = create<ExplicitProps, ExplicitExports>({
	tag: "explicit-component",
	url: "https://example.com/explicit",
	props: {
		label: prop.string(),
		enabled: prop.boolean(),
		onChange: prop.function<(enabled: boolean) => void>(),
	},
});

void ExplicitComponent({
	label: "ready",
	enabled: true,
	onChange: (_enabled) => undefined,
});

interface ExplicitDefinedOutputProps extends Record<string, unknown> {
	label: string;
}

create<ExplicitDefinedOutputProps>({
	tag: "explicit-defined-output-component",
	url: "https://example.com/explicit-defined-output",
	props: {
		label: {
			// @ts-expect-error explicit normalized props must include every schema output
			schema: z.string().transform(() => undefined),
		},
	},
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

void create<{ profile: Record<string, unknown> }>({
	tag: "removed-serialization-component",
	url: "https://example.com/removed-serialization",
	props: {
		profile: {
			schema: prop.any<Record<string, unknown>>(),
			// @ts-expect-error explicit-generic definitions reject the removed serialization option
			serialization: "json",
		},
	},
});
// The inferred create() overload captures a literal's extra keys, so it does
// not report serialization at compile time; create() rejects it at runtime.

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

// @ts-expect-error SchemaPropDefinition is unusable for a type-changing schema
const typeChangingSchemaDefinition: SchemaPropDefinition<
	typeof typeChangingSchema
> = { schema: typeChangingSchema };
void typeChangingSchemaDefinition;

const coercedSchemaDefinition = {
	schema: z.coerce.number(),
	queryParam: true,
} satisfies SchemaPropDefinition<ReturnType<typeof z.coerce.number>>;
void coercedSchemaDefinition;

// Coercing and union-accepting schemas take a wider input than they produce.
const dateInput = z
	.union([z.iso.datetime(), z.date()])
	.transform((value) => new Date(value));
const CoercingComponent = create({
	tag: "coercing-component",
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
type ComponentPropsOf<C> =
	C extends ForgeFrameComponent<infer P, unknown, boolean, infer _Input>
		? P
		: never;
declare const coercingProps: ComponentPropsOf<typeof CoercingComponent>;
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
} satisfies HostPropsDefinition<{ label: string; count: number }>;
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

// Explicit factories keep an optional factory-input parameter.
type ExplicitCoercedProps = { amount: number };
type ExplicitCoercedInput = { amount: number | string };
const ExplicitCoercedComponent = create<
	ExplicitCoercedProps,
	unknown,
	ExplicitCoercedInput
>({
	tag: "explicit-coerced-component",
	url: "https://example.com/explicit-coerced",
	props: { amount: z.coerce.number() },
});
const explicitCoercedInstance = ExplicitCoercedComponent({ amount: "2" });
const explicitlyTypedCoercedComponent: ForgeFrameComponent<
	ExplicitCoercedProps,
	unknown,
	false,
	ExplicitCoercedInput
> = ExplicitCoercedComponent;
const explicitlyTypedCoercedInstance: ForgeFrameComponentInstance<
	ExplicitCoercedProps,
	unknown,
	ExplicitCoercedInput
> = explicitCoercedInstance;
void explicitlyTypedCoercedComponent({ amount: 2 });
void explicitlyTypedCoercedInstance.updateProps({ amount: "3" });
void ExplicitCoercedComponent.instances[0]?.updateProps({ amount: "3" });
// @ts-expect-error updates use the factory input type
void explicitCoercedInstance.updateProps({ amount: true });

const CoercingReactComponent = createReactComponent(CoercingComponent, {
	React: {} as never,
});
void CoercingReactComponent({ amount: "4", startsAt: "2026-11-01T09:00:00Z" });
const ExplicitGenericCoercedReactComponent = createReactComponent<
	ExplicitCoercedProps,
	unknown,
	unknown,
	false,
	ExplicitCoercedInput
>(ExplicitCoercedComponent, { React: {} as never });
void ExplicitGenericCoercedReactComponent({ amount: "4" });

const createBoundReactComponent = withReactComponent({} as never);
const BoundCoercedReactComponent = createBoundReactComponent(
	ExplicitCoercedComponent,
);
void BoundCoercedReactComponent({ amount: "4" });
// @ts-expect-error React wrappers preserve the factory input type
void CoercingReactComponent({ amount: true });
// @ts-expect-error curried React wrappers preserve the factory input type
void BoundCoercedReactComponent({ amount: true });

// @ts-expect-error aliases were removed; factories accept only defined keys
void ExplicitCoercedComponent({ amount: "2", legacyAmount: "2" });

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

// Explicit component factories preserve the existing optional argument API.
void ExplicitComponent();

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

const instancesSnapshot: readonly ForgeFrameComponentInstance<
	{ label: string },
	unknown
>[] = TrackedComponent.instances;
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
