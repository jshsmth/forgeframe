/** Public cross-window values preserve data shapes and expose asynchronous callbacks. */
import {
	create,
	type ExportsOf,
	type Host,
	initHost,
	prop,
	type RemoteValue,
} from "@/index";

type Props = {
	count: () => number;
	optional?: (label: string) => Promise<string>;
	nested: { readonly callbacks: readonly [(value: number) => boolean] };
	createdAt: Date;
};

declare const host: Host<Props>;
declare const hostProps: RemoteValue<Props>;
const count: Promise<number> = hostProps.count();
const optional: Promise<string> | undefined = hostProps.optional?.("label");
const nested: Promise<boolean> = hostProps.nested.callbacks[0](1);
const date: Date = hostProps.createdAt;
const year: number = hostProps.createdAt.getFullYear();
const readyCount: Promise<number> = (await host.ready).count();
host.onProps((props) => {
	const nextCount: Promise<number> = props.count();
	// @ts-expect-error Remote return values must be awaited.
	const synchronousCount: number = props.count();
	void [nextCount, synchronousCount];
});
// @ts-expect-error Remote return values must be awaited.
const synchronousCount: number = hostProps.count();
// @ts-expect-error Remote callbacks retain their parameter types.
hostProps.nested.callbacks[0]("wrong");
// @ts-expect-error Readonly tuples stay readonly across the boundary.
hostProps.nested.callbacks[0] = () => Promise.resolve(true);
const unsubscribe: () => void = host.onProps(() => {});

const Component = create({
	tag: "remote-value-types",
	url: "https://example.com/widget",
	props: {
		count: prop.function<() => number>(),
		nested: prop.object({
			callbacks: prop.tuple(prop.function<(value: number) => boolean>()),
		}),
		createdAt: prop.date(),
	},
	exports: prop.object({
		getCount: prop.function<() => number>(),
		createdAt: prop.date(),
		nested: prop.object({ reset: prop.function<() => void>() }),
	}),
});
// ExportsOf is the exports schema's output; instance.exports is its remote form.
const localExports: ExportsOf<typeof Component> = {
	getCount: () => 1,
	createdAt: new Date(),
	nested: { reset: () => undefined },
};
void localExports;
const instance = Component({
	count: () => 42,
	nested: { callbacks: [(value) => value > 0] },
	createdAt: new Date(),
});
void instance.updateProps({ count: () => 7 });
const exportedCount: Promise<number> | undefined = instance.exports?.getCount();
const exportedDate: Date | undefined = instance.exports?.createdAt;
// @ts-expect-error Exported methods are asynchronous on the consumer.
const synchronousExport: number | undefined = instance.exports?.getCount();
const nestedReset: Promise<void> | undefined = instance.exports?.nested.reset();
void nestedReset;

declare const remoteVoid: RemoteValue<() => void>;
const voidResult: Promise<void> = remoteVoid();
declare const remoteArray: RemoteValue<Array<{ run: () => string }>>;
const arrayResult: Promise<string> = remoteArray[0].run();

declare const remoteJsonCallback: RemoteValue<
	(data: { label: string }) => { total: number }
>;
const jsonResult: Promise<{ total: number }> = remoteJsonCallback({
	label: "example",
});

// Callback arguments and results cross as JSON, so Dates arrive as ISO strings.
declare const remoteDateResult: RemoteValue<() => { createdAt: Date }>;
const isoResult: Promise<{ createdAt: string }> = remoteDateResult();
// @ts-expect-error Date results are delivered as ISO strings.
const dateResult: Promise<{ createdAt: Date }> = remoteDateResult();
declare const remoteDateArgument: RemoteValue<
	(data: { at: Date; label: string }) => void
>;
// @ts-expect-error The receiving callback would get a string, not a Date.
void remoteDateArgument({ at: new Date(), label: "example" });
declare const remoteIsoArgument: RemoteValue<
	(data: { at: string; label: string }) => void
>;
void remoteIsoArgument({ at: new Date().toISOString(), label: "example" });

const InferredComponent = create({
	tag: "inferred-remote-value-types",
	url: "https://example.com/widget",
	props: { count: prop.function<() => number>() },
});
void InferredComponent({ count: () => 42 });
const inferredCount: Promise<number> | undefined = (
	await initHost(InferredComponent, { consumerOrigins: "*" })?.ready
)?.count();

type Lookup = {
	(value: string): Promise<string>;
	(value: number): Promise<number>;
};
type Identity = <T extends string | number>(value: T) => Promise<T>;
declare const asyncHost: RemoteValue<{ lookup: Lookup; identity: Identity }>;
const stringLookup: Promise<string> = asyncHost.lookup("value");
const numberLookup: Promise<number> = asyncHost.lookup(42);
const identity: Promise<"value"> = asyncHost.identity("value");
declare const asyncExports: RemoteValue<{ lookup: Lookup; identity: Identity }>;
const exportedLookup: Promise<string> = asyncExports.lookup("value");
const exportedIdentity: Promise<42> = asyncExports.identity(42);

void [
	count,
	optional,
	nested,
	date,
	year,
	readyCount,
	synchronousCount,
	unsubscribe,
	exportedCount,
	exportedDate,
	synchronousExport,
	voidResult,
	arrayResult,
	jsonResult,
	isoResult,
	dateResult,
	inferredCount,
	stringLookup,
	numberLookup,
	identity,
	exportedLookup,
	exportedIdentity,
];
