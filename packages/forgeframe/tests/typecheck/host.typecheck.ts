/**
 * Type-level assertions for the public host runtime surface.
 *
 * Pins prop and exports inference through `initHost(Component, ...)`,
 * `HostPropsOf` and `HostOf`, the `Host` handle it returns, the tag-agnostic form's
 * inferred props, how annotated and `satisfies` definitions type withheld
 * props, and the v1 start-up and read paths that no longer exist.
 */
// @ts-expect-error ForgeFrame 2 has no default export; use named imports.
import ForgeFrame, {
	type AnyComponent,
	type Component,
	create,
	type ExportsOf,
	type Host,
	type HostOf,
	type HostPropsOf,
	type InitHostOptions,
	type InputOf,
	initHost,
	type PropDefinition,
	type PropsDefinition,
	type PropsOf,
	prop,
	type RemoteValue,
} from "@/index";

/** Whether each type is assignable to the other. */
type IsEquivalent<A, B> = [A] extends [B]
	? [B] extends [A]
		? true
		: false
	: false;

void ForgeFrame;

const PaymentForm = create({
	tag: "typed-payment-form",
	url: "https://pay.example.com/form",
	props: {
		amount: prop.number(),
		onSuccess: prop.function<(id: string) => void>(),
	},
});

type PaymentProps = { amount: number; onSuccess: (id: string) => void };

const host = initHost(PaymentForm, { consumerOrigins: "*" });
const typedHost: Host<PaymentProps> | null = host;
void typedHost;

if (host) {
	const ready: Promise<RemoteValue<PaymentProps>> = host.ready;
	const props = await ready;
	const amount: number = props.amount;
	void amount;
	// @ts-expect-error host props keep the component's inferred types.
	const wrongAmount: string = props.amount;
	void wrongAmount;
	const settled: Promise<void> = props.onSuccess("id");
	void settled;
	// @ts-expect-error controls live on the host, not on the props.
	void props.close;
	// @ts-expect-error the hostProps property was removed; await host.ready.
	void host.hostProps;
	// @ts-expect-error getConsumer() was removed.
	void host.getConsumer;
	// @ts-expect-error ready is read-only.
	host.ready = ready;
	const closed: Promise<void> = host.close();
	const resized: Promise<void> = host.resize({ width: 1, height: 2 });
	const uid: string = host.uid;
	const tag: string = host.tag;
	void closed;
	void resized;
	void uid;
	void tag;

	const stopProps: () => void = host.onProps((props) => {
		const nextAmount: number = props.amount;
		void nextAmount;
	});
	stopProps();
	const stopErrors: () => void = host.on("error", (error) => {
		const cause: unknown = error.cause;
		void cause;
	});
	stopErrors();
	host.once("error", (error: Error) => {
		void error;
	});
	// @ts-expect-error Host events have only error; observe props with host.onProps().
	host.on("props", () => {});
	// @ts-expect-error Host events have only error.
	host.on("resize", () => {});
	const reported: Promise<void> = host.reportError(new Error("x"));
	void reported;
	// @ts-expect-error onError was renamed reportError.
	void host.onError;

	host.init();
	// @ts-expect-error init() returns nothing; failures go to on('error').
	void host.init().then;
	host.destroy();

	// Observer typing remains compatible with synchronous, async, and implicit-value handlers.
	host.onProps(() => {});
	host.onProps(async () => {});
	host.onProps(({ amount }) => amount);
}

// The tag-agnostic form infers props from its definitions.
const tagAgnosticHost = initHost({
	props: { label: prop.string() },
	consumerOrigins: ["https://app.example.com", /\.example\.com$/],
	autoInit: false,
});
const label: string | undefined = (await tagAgnosticHost?.ready)?.label;
void label;
const untypedHost: Host | null = initHost({ consumerOrigins: "*" });
void untypedHost;
// Without definitions, props are untyped and exports accept any value.
void untypedHost?.export({ anything: true });

// HostPropsOf and initHost(Component) share one contract with the consumer.
const ExportingForm = create({
	tag: "typed-exporting-form",
	url: "https://pay.example.com/exporting",
	props: { amount: prop.number() },
	exports: prop.object({
		submit: prop.function<() => string>(),
		valid: prop.boolean(),
	}),
});
function submitFrom(
	host: HostOf<typeof ExportingForm>,
	props: HostPropsOf<typeof ExportingForm>,
) {
	const total: number = props.amount;
	void total;
	return host.export({ submit: () => "ok", valid: true });
}
void submitFrom;
const exportingHost = initHost(ExportingForm, { consumerOrigins: "*" });
if (exportingHost) {
	const typedProps: HostPropsOf<typeof ExportingForm> =
		await exportingHost.ready;
	void typedProps;
	const typedHost: HostOf<typeof ExportingForm> = exportingHost;
	void typedHost;
	void exportingHost.export({ submit: () => "ok", valid: true });
	// @ts-expect-error export() takes the exports schema's type
	void exportingHost.export({ submit: () => "ok", valid: "yes" });
	// @ts-expect-error export() requires every exported field
	void exportingHost.export({ valid: true });
	// A typed host still fits helpers that take untyped exports.
	const loose: Host<{ amount: number }> = exportingHost;
	void loose;
}

const options: InitHostOptions<{ label: string }> = {
	consumerOrigins: "https://app.example.com",
	props: { label: prop.string() },
};
void initHost(options);

declare const consumerProps: RemoteValue<PaymentProps>;
void consumerProps;

// @ts-expect-error a bare initHost() has no consumer allowlist.
initHost();
// @ts-expect-error consumerOrigins is required.
initHost(PaymentForm, {});
// @ts-expect-error consumerOrigins is required in the tag-agnostic form too.
initHost({ props: { label: prop.string() } });
// @ts-expect-error the v1 positional call shape was removed.
initHost({ amount: prop.number() }, ["https://shop.example.com"]);
// @ts-expect-error the component supplies its own prop definitions.
initHost(PaymentForm, { consumerOrigins: "*", props: {} });
// @ts-expect-error deferInit was replaced by autoInit: false.
initHost(PaymentForm, { consumerOrigins: "*", deferInit: true });

// @ts-expect-error factories no longer expose host props.
void PaymentForm.hostProps;
// @ts-expect-error use the global isHost() instead.
void PaymentForm.isHost;
// @ts-expect-error use the global isHost() instead.
void PaymentForm.isEmbedded;
// @ts-expect-error canRenderTo was removed.
void PaymentForm.canRenderTo;

create({
	tag: "typed-removed-allowlist",
	url: "https://pay.example.com/form",
	// @ts-expect-error the allowlist moved to initHost(Component, { consumerOrigins }).
	allowedConsumerDomains: ["https://shop.example.com"],
});

if (host) {
	const props = await host.ready;
	// @ts-expect-error hostProps.consumer was removed; ready resolves to the props.
	void props.consumer;
	// @ts-expect-error nested children were removed; import child components directly.
	void props.children;
	// @ts-expect-error a prop named then is reserved.
	void props.then;
}

// The host type matches what the host receives: sendToHost: false props are
// left out, and deliverTo props are optional; the consumer view keeps both.
const WithheldForm = create({
	tag: "typed-withheld-form",
	url: "https://pay.example.com/form",
	props: {
		amount: prop.number(),
		onClose: {
			schema: prop.function<() => void>(),
			sendToHost: false,
		},
		secret: { schema: prop.string(), deliverTo: "same-origin" },
		token: { schema: prop.string(), deliverTo: "https://pay.example.com" },
		sent: { schema: prop.string(), sendToHost: true },
	},
});
type WithheldHostProps = {
	amount: number;
	secret?: string;
	token?: string;
	sent: string;
};
const withheldHostProps: IsEquivalent<
	HostPropsOf<typeof WithheldForm>,
	WithheldHostProps
> = true;
void withheldHostProps;
const withheldConsumerProps: IsEquivalent<
	PropsOf<typeof WithheldForm>,
	WithheldHostProps & { onClose: () => void; secret: string; token: string }
> = true;
void withheldConsumerProps;

// HostProps defaults to Props, so a component that withholds props needs
// `typeof C`, an AnyComponent constraint or the fourth type argument: the raw
// host props, before callbacks become promise-returning.
type WithheldProps = PropsOf<typeof WithheldForm>;
type WithheldInput = InputOf<typeof WithheldForm>;
type WithheldExports = ExportsOf<typeof WithheldForm>;
// @ts-expect-error the three-parameter form types the host props as Props
const threeParameterForm: Component<
	WithheldProps,
	WithheldInput,
	WithheldExports
> = WithheldForm;
void threeParameterForm;
const fourParameterForm: Component<
	WithheldProps,
	WithheldInput,
	WithheldExports,
	Omit<WithheldProps, "onClose" | "secret" | "token"> & {
		secret?: string;
		token?: string;
	}
> = WithheldForm;
void fourParameterForm;
function acceptAnyComponent<C extends AnyComponent>(component: C): C {
	return component;
}
void acceptAnyComponent(WithheldForm);

const withheldHost = initHost(WithheldForm, { consumerOrigins: "*" });
const withheldHandle: HostOf<typeof WithheldForm> | null = withheldHost;
void withheldHandle;
if (withheldHost) {
	const props = await withheldHost.ready;
	// @ts-expect-error a sendToHost: false prop never reaches the host
	props.onClose();
	// @ts-expect-error a deliverTo prop may be withheld from this host
	const secretLength: number = props.secret.length;
	void secretLength;
	withheldHost.onProps((next) => {
		// @ts-expect-error onProps sees the same host props as ready
		void next.onClose;
	});
}

// The tag-agnostic form applies the same rules to its own definitions.
const agnosticWithheld = initHost({
	consumerOrigins: "*",
	props: {
		label: prop.string(),
		hidden: { schema: prop.string(), sendToHost: false },
		scoped: { schema: prop.string(), deliverTo: "same-origin" },
	},
});
if (agnosticWithheld) {
	const props = await agnosticWithheld.ready;
	const agnosticProps: IsEquivalent<
		typeof props,
		{ label: string; scoped?: string }
	> = true;
	void agnosticProps;
}

// The host type reads each entry's literal options. `satisfies` keeps them, so
// a withheld prop is left out; an annotation widens them to `sendToHost?:
// boolean`, so every annotated prop is typed as delivered, although a
// sendToHost: false prop is undefined on the host at runtime.
interface CheckoutProps {
	amount: number;
	onClose: () => void;
}
const checkoutEntries = {
	amount: prop.number(),
	onClose: { schema: prop.function<() => void>(), sendToHost: false },
} satisfies PropsDefinition<CheckoutProps>;
const annotatedCheckoutEntries: PropsDefinition<CheckoutProps> =
	checkoutEntries;
const SatisfiedCheckout = create({
	tag: "typed-satisfied-checkout",
	url: "https://pay.example.com/checkout",
	props: checkoutEntries,
});
const AnnotatedCheckout = create({
	tag: "typed-annotated-checkout",
	url: "https://pay.example.com/checkout",
	props: annotatedCheckoutEntries,
});
const satisfiedCheckoutHost: IsEquivalent<
	HostPropsOf<typeof SatisfiedCheckout>,
	{ amount: number }
> = true;
void satisfiedCheckoutHost;
// Host callbacks return promises.
type AnnotatedCheckoutHostProps = {
	amount: number;
	onClose: () => Promise<void>;
};
const annotatedCheckoutHost: IsEquivalent<
	HostPropsOf<typeof AnnotatedCheckout>,
	AnnotatedCheckoutHostProps
> = true;
void annotatedCheckoutHost;

const satisfiedEntry = {
	schema: prop.string(),
	sendToHost: false,
} satisfies PropDefinition<string>;
const annotatedEntry: PropDefinition<string> = satisfiedEntry;
const EntryForms = create({
	tag: "typed-entry-forms",
	url: "https://pay.example.com/entries",
	props: { satisfied: satisfiedEntry, annotated: annotatedEntry },
});
const entryFormsHost: IsEquivalent<
	HostPropsOf<typeof EntryForms>,
	{ annotated: string }
> = true;
void entryFormsHost;

// The tag-agnostic form reads the same options.
const annotatedAgnostic = initHost({
	consumerOrigins: "*",
	props: annotatedCheckoutEntries,
});
if (annotatedAgnostic) {
	const props = await annotatedAgnostic.ready;
	const annotatedAgnosticProps: IsEquivalent<
		typeof props,
		AnnotatedCheckoutHostProps
	> = true;
	void annotatedAgnosticProps;
}
