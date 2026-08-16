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
