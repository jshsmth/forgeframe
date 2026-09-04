/**
 * Compile-time assertions for typed consumer alias inputs.
 */
import { create, createReactComponent, prop } from '../../src';
import type { ConsumerPropsInput, ConsumerPropsUpdate } from '../../src';

type CanonicalProps = {
  first: string;
  second: string;
};

type LegacyInput = {
  legacy: string;
};

type MultiCanonicalProps = {
  email: string;
  name: string;
};

type MultiLegacyInput = {
  userEmail: string;
  fullName: string;
};

type CanonicalAliasInput = Pick<CanonicalProps, 'second'>;

type TransformedCanonicalProps = {
  amount: number;
};

type TransformedLegacyInput = {
  legacyAmount: string;
};

type TransformedSchemaInputs = {
  amount: string;
};

type TransformedLegacyInputUnion =
  | { legacyAmount: string }
  | { oldAmount: string };

type MultiTypeCanonicalProps = {
  amount: number;
  enabled: boolean;
};

type MultiTypeSchemaInputs = {
  amount: string;
  enabled: boolean;
};

const Component = create<CanonicalProps, unknown, LegacyInput>({
  tag: 'typed-alias-inputs',
  url: 'https://example.com/widget',
  props: {
    first: { schema: prop.string(), required: true, alias: 'second' },
    second: { schema: prop.string(), required: true, alias: 'legacy' },
  },
});

const aliasInput: ConsumerPropsInput<CanonicalProps, LegacyInput> = {
  legacy: 'initial',
};
const mixedUpdate: ConsumerPropsUpdate<CanonicalProps, LegacyInput> = {
  second: 'middle',
  legacy: 'updated',
};

const transformedCanonicalInput: ConsumerPropsInput<
  TransformedCanonicalProps,
  TransformedLegacyInput,
  TransformedSchemaInputs
> = { amount: '1' };
const transformedAliasInput: ConsumerPropsInput<
  TransformedCanonicalProps,
  TransformedLegacyInput,
  TransformedSchemaInputs
> = { legacyAmount: '1' };
const transformedCanonicalUpdate: ConsumerPropsUpdate<
  TransformedCanonicalProps,
  TransformedLegacyInput,
  TransformedSchemaInputs
> = { amount: '2' };
void transformedCanonicalInput;
void transformedAliasInput;
void transformedCanonicalUpdate;

const invalidTransformedCanonicalInput: ConsumerPropsInput<
  TransformedCanonicalProps,
  TransformedLegacyInput,
  TransformedSchemaInputs
> = {
  // @ts-expect-error normalized outputs are not accepted as canonical schema inputs
  amount: 1,
};
void invalidTransformedCanonicalInput;

const invalidTransformedCanonicalUpdate: ConsumerPropsUpdate<
  TransformedCanonicalProps,
  TransformedLegacyInput,
  TransformedSchemaInputs
> = {
  // @ts-expect-error normalized outputs are not accepted in canonical updates
  amount: 2,
};
void invalidTransformedCanonicalUpdate;

const firstUnionAliasUpdate: ConsumerPropsUpdate<
  TransformedCanonicalProps,
  TransformedLegacyInputUnion,
  TransformedSchemaInputs
> = { legacyAmount: '3' };
const secondUnionAliasUpdate: ConsumerPropsUpdate<
  TransformedCanonicalProps,
  TransformedLegacyInputUnion,
  TransformedSchemaInputs
> = { oldAmount: '3' };
const mixedUnionAliasInput: ConsumerPropsInput<
  TransformedCanonicalProps,
  TransformedLegacyInputUnion,
  TransformedSchemaInputs
> = { amount: '3', oldAmount: '3' };
void firstUnionAliasUpdate;
void secondUnionAliasUpdate;
void mixedUnionAliasInput;

const broadSchemaCanonicalInput: ConsumerPropsInput<
  MultiTypeCanonicalProps,
  TransformedLegacyInput,
  Record<string, string>
> = { amount: '3', enabled: 'true' };
const broadSchemaCanonicalUpdate: ConsumerPropsUpdate<
  MultiTypeCanonicalProps,
  TransformedLegacyInput,
  Record<string, string>
> = { amount: '4' };
void broadSchemaCanonicalInput;
void broadSchemaCanonicalUpdate;

const invalidBroadSchemaCanonicalInput: ConsumerPropsInput<
  MultiTypeCanonicalProps,
  TransformedLegacyInput,
  Record<string, string>
> = {
  // @ts-expect-error a broad schema-input index still overrides normalized values
  amount: 3,
  enabled: 'true',
};
void invalidBroadSchemaCanonicalInput;

const broadAlternateCanonicalInput: ConsumerPropsInput<
  MultiTypeCanonicalProps,
  Record<string, string>,
  MultiTypeSchemaInputs
> = { amount: '3', enabled: true };
const broadAlternateCanonicalUpdate: ConsumerPropsUpdate<
  MultiTypeCanonicalProps,
  Record<string, string>,
  MultiTypeSchemaInputs
> = { enabled: true };
void broadAlternateCanonicalInput;
void broadAlternateCanonicalUpdate;

const invalidBroadAlternateUpdate: ConsumerPropsUpdate<
  MultiTypeCanonicalProps,
  Record<string, string>,
  MultiTypeSchemaInputs
> = {
  // @ts-expect-error broad alternate inputs cannot override canonical schema types
  enabled: 'true',
};
void invalidBroadAlternateUpdate;

const invalidBroadAlternateInput: ConsumerPropsInput<
  MultiTypeCanonicalProps,
  Record<string, string>,
  MultiTypeSchemaInputs
> = {
  // @ts-expect-error broad alternate inputs do not admit unknown canonical keys
  unsupported: 'value',
};
void invalidBroadAlternateInput;

const instance = Component(aliasInput);
void instance.updateProps(mixedUpdate);
void instance.updateProps({ first: 'canonical' });

const ReactComponent = createReactComponent(Component, { React: {} as never });
void ReactComponent({ legacy: 'react-alias' });

const MultiAliasComponent = create<
  MultiCanonicalProps,
  unknown,
  MultiLegacyInput
>({
  tag: 'typed-mixed-alias-inputs',
  url: 'https://example.com/mixed-widget',
  props: {
    email: { schema: prop.string(), required: true, alias: 'userEmail' },
    name: { schema: prop.string(), required: true, alias: 'fullName' },
  },
});

void MultiAliasComponent({ userEmail: 'legacy@example.com', name: 'Legacy' });

const CanonicalAliasComponent = create<
  CanonicalProps,
  unknown,
  CanonicalAliasInput
>({
  tag: 'typed-canonical-alias-inputs',
  url: 'https://example.com/canonical-alias-widget',
  props: {
    first: { schema: prop.string(), required: true, alias: 'second' },
    second: { schema: prop.string(), required: true },
  },
});

const canonicalAliasInput: ConsumerPropsInput<
  CanonicalProps,
  CanonicalAliasInput
> = { second: 'canonical-alias' };
void CanonicalAliasComponent(canonicalAliasInput);

// @ts-expect-error the alternate subset does not make unrelated canonical props optional
void CanonicalAliasComponent({ first: 'missing-second' });

// @ts-expect-error without an alternate input shape, canonical props remain required
const incompleteDefaultInput: ConsumerPropsInput<CanonicalProps> = {
  second: 'canonical-only',
};
void incompleteDefaultInput;

// @ts-expect-error alias inputs retain their declared value type
Component({ legacy: 123 });

// @ts-expect-error unknown keys are not accepted as prop updates
void instance.updateProps({ unsupported: true });

// @ts-expect-error React wrappers reject unknown component prop keys
void ReactComponent({ unsupported: true });
