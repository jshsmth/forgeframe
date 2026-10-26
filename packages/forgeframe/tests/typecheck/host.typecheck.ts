/**
 * Type-level assertions for the public host runtime surface.
 *
 * Pins prop and exports inference through `initHost(Component, ...)` and
 * `HostPropsOf`, the narrow `Host` object it returns, the tag-agnostic form's
 * inferred props, and the v1 start-up and read paths that no longer exist.
 */
// @ts-expect-error ForgeFrame 2 has no default export; use named imports.
import ForgeFrame, {
	create,
	type Host,
	type HostProps,
	type HostPropsOf,
	type InitHostOptions,
	initHost,
	prop,
	type RemoteValue,
} from "@/index";

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
	const ready: Promise<HostProps<PaymentProps>> = host.ready;
	void ready;
	const amount: number = host.hostProps.amount;
	void amount;
	// @ts-expect-error host props keep the component's inferred types.
	const wrongAmount: string = host.hostProps.amount;
	void wrongAmount;
	const settled: Promise<void> = host.hostProps.onSuccess("id");
	void settled;

	const replacement = host.hostProps;
	// @ts-expect-error hostProps is a read-only, live object.
	host.hostProps = replacement;

	const stopProps: () => void = host.hostProps.onProps((props) => {
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
	// @ts-expect-error Host events have only error; observe props with hostProps.onProps().
	host.on("props", () => {});
	// @ts-expect-error Host events have only error.
	host.on("resize", () => {});
	const reported: Promise<void> = host.hostProps.reportError(new Error("x"));
	void reported;
	// @ts-expect-error onError was renamed reportError.
	void host.hostProps.onError;

	host.init();
	// @ts-expect-error init() returns nothing; failures go to on('error').
	void host.init().then;
	host.destroy();

	// Observer typing remains compatible with synchronous, async, and implicit-value handlers.
	host.hostProps.onProps(() => {});
	host.hostProps.onProps(async () => {});
	host.hostProps.onProps(({ amount }) => amount);
}

// The tag-agnostic form infers props from its definitions.
const tagAgnosticHost = initHost({
	props: { label: prop.string() },
	consumerOrigins: ["https://app.example.com", /\.example\.com$/],
	autoInit: false,
});
const label: string | undefined = tagAgnosticHost?.hostProps.label;
void label;
const untypedHost: Host | null = initHost({ consumerOrigins: "*" });
void untypedHost;
// Without definitions, props are untyped and exports accept any value.
void untypedHost?.hostProps.export({ anything: true });

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
function submitFrom(props: HostPropsOf<typeof ExportingForm>) {
	const total: number = props.amount;
	void total;
	return props.export({ submit: () => "ok", valid: true });
}
void submitFrom;
const exportingHost = initHost(ExportingForm, { consumerOrigins: "*" });
if (exportingHost) {
	const typedProps: HostPropsOf<typeof ExportingForm> = exportingHost.hostProps;
	void typedProps;
	void exportingHost.hostProps.export({ submit: () => "ok", valid: true });
	// @ts-expect-error export() takes the exports schema's type
	void exportingHost.hostProps.export({ submit: () => "ok", valid: "yes" });
	// @ts-expect-error export() requires every exported field
	void exportingHost.hostProps.export({ valid: true });
	// A typed host still fits helpers that take untyped exports.
	const loose: HostProps<{ amount: number }> = exportingHost.hostProps;
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
	const consumerProps: RemoteValue<PaymentProps> =
		host.hostProps.consumer.props;
	void consumerProps;
	// @ts-expect-error consumer.export was removed; use hostProps.export().
	void host.hostProps.consumer.export({ token: "abc" });
	// @ts-expect-error nested children were removed; import child components directly.
	void host.hostProps.children;
}
