/** Public cross-window values preserve data shapes and expose asynchronous callbacks. */
import { create, prop, type HostProps, type RemoteValue } from '@/index';

type Props = {
  count: () => number;
  optional?: (label: string) => Promise<string>;
  nested: { readonly callbacks: readonly [(value: number) => boolean] };
  createdAt: Date;
};

declare const host: HostProps<Props>;
const count: Promise<number> = host.count();
const optional: Promise<string> | undefined = host.optional?.('label');
const nested: Promise<boolean> = host.nested.callbacks[0](1);
const date: Date = host.createdAt;
const year: number = host.createdAt.getFullYear();
const consumerCount: Promise<number> = host.consumer.props.count();
host.onProps((props) => {
  const nextCount: Promise<number> = props.count();
  // @ts-expect-error Remote return values must be awaited.
  const synchronousCount: number = props.count();
  void [nextCount, synchronousCount];
});
// @ts-expect-error Remote return values must be awaited.
const synchronousCount: number = host.count();
// @ts-expect-error Remote callbacks retain their parameter types.
host.nested.callbacks[0]('wrong');
// @ts-expect-error Readonly tuples stay readonly across the boundary.
host.nested.callbacks[0] = () => Promise.resolve(true);
const localWindow: Window = host.getConsumer();
const unsubscribe: { cancel(): void } = host.onProps(() => {});

const Component = create<Props, { getCount: () => number; createdAt: Date }>({
  tag: 'remote-value-types',
  url: 'https://example.com/widget',
  props: { count: prop.function<() => number>() },
});
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

declare const remoteVoid: RemoteValue<() => void>;
const voidResult: Promise<void> = remoteVoid();
declare const remoteArray: RemoteValue<Array<{ run: () => string }>>;
const arrayResult: Promise<string> = remoteArray[0].run();

declare const remoteJsonCallback: RemoteValue<(data: { label: string }) => { total: number }>;
const jsonResult: Promise<{ total: number }> = remoteJsonCallback({ label: 'example' });

const InferredComponent = create({
  tag: 'inferred-remote-value-types',
  url: 'https://example.com/widget',
  props: { count: prop.function<() => number>() },
});
void InferredComponent({ count: () => 42 });
const inferredCount: Promise<number> | undefined = InferredComponent.hostProps?.count();

type Lookup = {
  (value: string): Promise<string>;
  (value: number): Promise<number>;
};
type Identity = <T extends string | number>(value: T) => Promise<T>;
declare const asyncHost: HostProps<{ lookup: Lookup; identity: Identity }>;
const stringLookup: Promise<string> = asyncHost.lookup('value');
const numberLookup: Promise<number> = asyncHost.lookup(42);
const identity: Promise<'value'> = asyncHost.identity('value');
declare const asyncExports: RemoteValue<{ lookup: Lookup; identity: Identity }>;
const exportedLookup: Promise<string> = asyncExports.lookup('value');
const exportedIdentity: Promise<42> = asyncExports.identity(42);

void [count, optional, nested, date, year, consumerCount, synchronousCount, localWindow,
  unsubscribe, exportedCount, exportedDate, synchronousExport, voidResult, arrayResult, jsonResult,
  inferredCount, stringLookup, numberLookup, identity, exportedLookup, exportedIdentity];
