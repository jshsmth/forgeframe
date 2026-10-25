/**
 * Type-level assertions for the public host runtime surface.
 *
 * Pins prop inference through `initHost(Component, ...)`, the narrow `Host`
 * object it returns, and the v1 start-up and read paths that no longer exist.
 */
// @ts-expect-error ForgeFrame 2 has no default export; use named imports.
import ForgeFrame, {
	create,
	type Host,
	type HostProps,
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

	const stopProps: () => void = host.on("props", (props) => {
		const nextAmount: number = props.amount;
		void nextAmount;
	});
	stopProps();
	host.on("error", (error) => {
		void error;
	});
	// @ts-expect-error Host.on() observes only props and error events.
	host.on("resize", () => {});

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
