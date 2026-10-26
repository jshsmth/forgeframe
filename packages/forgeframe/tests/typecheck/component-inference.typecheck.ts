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
		transformedValue: {
			schema: z.string().transform(Number),
			outputSchema: z.number(),
		},
		defaultedValue: z.string().default("fallback"),
		wrappedValue: {
			schema: z.number(),
			deliverTo: "same-origin",
		},
		wrappedTransformedValue: {
			schema: z.string().transform((value) => value.length),
			outputSchema: z.number(),
		},
	},
});

void ExternalSchemaComponent({
	zodValue: "zod",
	valibotValue: "valibot",
	transformedValue: "42",
	wrappedValue: 42,
	wrappedTransformedValue: "wrapped",
});

void ExternalSchemaComponent({
	// @ts-expect-error third-party Standard Schema inputs are inferred
	zodValue: 1,
	valibotValue: "ok",
	transformedValue: "42",
	wrappedValue: 42,
	wrappedTransformedValue: "wrapped",
});

void ExternalSchemaComponent({
	zodValue: "zod",
	valibotValue: "valibot",
	// @ts-expect-error transformed schema outputs are not accepted as consumer inputs
	transformedValue: 42,
	wrappedValue: 42,
	wrappedTransformedValue: "wrapped",
});

const externalSchemaHostProps = initHost(ExternalSchemaComponent, {
	consumerOrigins: "*",
})?.hostProps;
const transformedHostValue: number | undefined =
	externalSchemaHostProps?.transformedValue;
const defaultedHostValue: string | undefined =
	externalSchemaHostProps?.defaultedValue;
const wrappedTransformedHostValue: number | undefined =
	externalSchemaHostProps?.wrappedTransformedValue;
void transformedHostValue;
void defaultedHostValue;
void wrappedTransformedHostValue;

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

const transformedFallbackSchema = z.string().transform(Number);

create({
	tag: "invalid-direct-transform-component",
	url: "https://example.com/invalid-direct-transform",
	props: {
		// @ts-expect-error type-changing schemas must be wrapped with outputSchema
		amount: transformedFallbackSchema,
	},
});

// @ts-expect-error transformed schemas require a normalized-output validator
const missingOutputSchemaDefinition: SchemaPropDefinition<
	typeof transformedFallbackSchema
> = {
	schema: transformedFallbackSchema,
};
void missingOutputSchemaDefinition;

// @ts-expect-error consumer-only transforms still require output validation
const missingConsumerOnlyOutputSchemaDefinition: SchemaPropDefinition<
	typeof transformedFallbackSchema
> = {
	schema: transformedFallbackSchema,
	sendToHost: false,
};
void missingConsumerOnlyOutputSchemaDefinition;

const transformedFallbackDefinition = {
	schema: transformedFallbackSchema,
	outputSchema: z.number(),
	queryParam: true,
} satisfies SchemaPropDefinition<typeof transformedFallbackSchema>;
void transformedFallbackDefinition;

const invalidOutputSchemaDefinition = {
	schema: transformedFallbackSchema,
	// @ts-expect-error outputSchema validates the normalized number output
	outputSchema: z.string(),
} satisfies SchemaPropDefinition<typeof transformedFallbackSchema>;
void invalidOutputSchemaDefinition;

type ExplicitTransformProps = {
	amount: number;
};

type ExplicitTransformInput = {
	amount: string;
};

const ExplicitTransformComponent = create<
	ExplicitTransformProps,
	unknown,
	ExplicitTransformInput
>({
	tag: "explicit-transform-fallback-component",
	url: "https://example.com/explicit-transform-fallback",
	props: {
		amount: {
			schema: transformedFallbackSchema,
			outputSchema: z.number(),
		},
	},
});

void ExplicitTransformComponent({ amount: "2" });

const hostTransformDefinitions = {
	amount: {
		schema: transformedFallbackSchema,
		outputSchema: z.number(),
	},
} satisfies HostPropsDefinition<ExplicitTransformProps, ExplicitTransformInput>;

const invalidHostTransformDefinitions: HostPropsDefinition<ExplicitTransformProps> =
	{
		amount: {
			// @ts-expect-error host definitions need an output schema for type-changing inputs
			schema: transformedFallbackSchema,
		},
	};
void invalidHostTransformDefinitions;

const missingHostOutputSchema: HostPropsDefinition<
	ExplicitTransformProps,
	ExplicitTransformInput
> = {
	// @ts-expect-error type-changing host definitions require outputSchema
	amount: {
		schema: transformedFallbackSchema,
	},
};
void missingHostOutputSchema;

const outputCompatibleHostDefinitions = {
	label: { schema: z.string() },
} satisfies HostPropsDefinition<{ label: string }>;
void outputCompatibleHostDefinitions;

const typedTransformHost = initHost<
	ExplicitTransformProps,
	ExplicitTransformInput
>({ props: hostTransformDefinitions, consumerOrigins: "*" });
const hostTransformAmount: number | undefined =
	typedTransformHost?.hostProps.amount;
void hostTransformAmount;

const explicitTransformInstance = ExplicitTransformComponent({ amount: "2" });
const explicitlyTypedTransformComponent: ForgeFrameComponent<
	ExplicitTransformProps,
	unknown,
	false,
	ExplicitTransformInput
> = ExplicitTransformComponent;
const explicitlyTypedTransformInstance: ForgeFrameComponentInstance<
	ExplicitTransformProps,
	unknown,
	ExplicitTransformInput
> = explicitTransformInstance;
void explicitlyTypedTransformComponent({ amount: "2" });
void explicitlyTypedTransformInstance.updateProps({ amount: "3" });
void explicitTransformInstance.updateProps({ amount: "3" });
void ExplicitTransformComponent.instances[0]?.updateProps({ amount: "3" });

const explicitTransformOptions: ComponentOptions<
	ExplicitTransformProps,
	ExplicitTransformInput
> = {
	tag: "explicit-transform-options-component",
	url: "https://example.com/explicit-transform-options",
	props: {
		amount: { schema: transformedFallbackSchema, outputSchema: z.number() },
	},
};
void explicitTransformOptions;

const ExplicitTransformReactComponent = createReactComponent(
	ExplicitTransformComponent,
	{ React: {} as never },
);
void ExplicitTransformReactComponent({ amount: "4" });

const ExplicitGenericTransformReactComponent = createReactComponent<
	ExplicitTransformProps,
	unknown,
	unknown,
	false,
	ExplicitTransformInput
>(ExplicitTransformComponent, { React: {} as never });
void ExplicitGenericTransformReactComponent({ amount: "4" });

const createBoundReactComponent = withReactComponent({} as never);
const BoundTransformReactComponent = createBoundReactComponent(
	ExplicitTransformComponent,
);
const ExplicitGenericBoundTransformReactComponent = createBoundReactComponent<
	ExplicitTransformProps,
	unknown,
	false,
	ExplicitTransformInput
>(ExplicitTransformComponent);
void BoundTransformReactComponent({ amount: "4" });
void ExplicitGenericBoundTransformReactComponent({ amount: "4" });

// @ts-expect-error normalized outputs are not necessarily valid schema inputs
void ExplicitTransformComponent({ amount: 2 });

// @ts-expect-error updates use schema input types
void explicitTransformInstance.updateProps({ amount: 3 });

// @ts-expect-error tracked instances retain schema input types
void ExplicitTransformComponent.instances[0]?.updateProps({ amount: 3 });

// @ts-expect-error React wrappers preserve schema input types
void ExplicitTransformReactComponent({ amount: 4 });

// @ts-expect-error curried React wrappers preserve schema input types
void BoundTransformReactComponent({ amount: 4 });

// @ts-expect-error aliases were removed; factories accept only defined keys
void ExplicitTransformComponent({ amount: "2", legacyAmount: "2" });

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

const RequiredTransformComponent = create({
	tag: "required-transform-component",
	url: (props) => {
		const transformedValue: string | undefined = props.transformedValue;
		return `https://example.com/required-transform/${transformedValue ?? "missing"}`;
	},
	props: {
		transformedValue: {
			schema: z
				.string()
				.transform((value) => (value.length > 0 ? value : undefined)),
			outputSchema: z.string().optional(),
		},
	},
});

void RequiredTransformComponent({ transformedValue: "input" });

// @ts-expect-error requiredness follows the schema input even when output may be undefined
void RequiredTransformComponent({});

const requiredTransformHost = initHost(RequiredTransformComponent, {
	consumerOrigins: "*",
});
if (requiredTransformHost) {
	const transformedValue: string | undefined =
		requiredTransformHost.hostProps.transformedValue;
	void transformedValue;
}

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
