/**
 * Compile-time assertions for schema-backed component definitions.
 *
 * Covers inferred and explicit props, third-party Standard Schemas, wrapped
 * definitions, optional/default values, callbacks, and typed children.
 */
import * as v from 'valibot';
import { z } from 'zod';
import { create, prop } from '../../src';

const InferredComponent = create({
  tag: 'inferred-component',
  url: 'https://example.com/inferred',
  props: {
    label: prop.string(),
    count: prop.number().default(0),
    description: prop.string().optional(),
    onSubmit: prop.function<(value: string) => void>(),
  },
});

void InferredComponent({
  label: 'ready',
  onSubmit: (_value) => undefined,
});

const inferredHostCount: number | undefined = InferredComponent.hostProps?.count;
void inferredHostCount;

// @ts-expect-error inferred direct schemas reject the wrong value type
void InferredComponent({ label: 1, count: 1, onSubmit: () => undefined });

// @ts-expect-error inferred callback signatures remain specific
void InferredComponent({ label: 'ready', count: 1, onSubmit: (_value: number) => undefined });

interface ExplicitProps extends Record<string, unknown> {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

interface ExplicitExports {
  ready: boolean;
}

const ExplicitComponent = create<ExplicitProps, ExplicitExports>({
  tag: 'explicit-component',
  url: 'https://example.com/explicit',
  props: {
    label: prop.string(),
    enabled: prop.boolean(),
    onChange: prop.function<(enabled: boolean) => void>(),
  },
});

void ExplicitComponent({
  label: 'ready',
  enabled: true,
  onChange: (_enabled) => undefined,
});

const ExternalSchemaComponent = create({
  tag: 'external-schema-component',
  url: 'https://example.com/external',
  props: {
    zodValue: z.string(),
    valibotValue: v.string(),
    transformedValue: z.string().transform(Number),
    defaultedValue: z.string().default('fallback'),
    wrappedValue: {
      schema: z.number(),
      required: true,
      sameDomain: true,
    },
    wrappedTransformedValue: {
      schema: z.string().transform((value) => value.length),
    },
  },
});

void ExternalSchemaComponent({
  zodValue: 'zod',
  valibotValue: 'valibot',
  transformedValue: '42',
  wrappedValue: 42,
  wrappedTransformedValue: 'wrapped',
});

void ExternalSchemaComponent({
  // @ts-expect-error third-party Standard Schema inputs are inferred
  zodValue: 1,
  valibotValue: 'ok',
  transformedValue: '42',
  wrappedValue: 42,
  wrappedTransformedValue: 'wrapped',
});

void ExternalSchemaComponent({
  zodValue: 'zod',
  valibotValue: 'valibot',
  // @ts-expect-error transformed schema outputs are not accepted as consumer inputs
  transformedValue: 42,
  wrappedValue: 42,
  wrappedTransformedValue: 'wrapped',
});

const transformedHostValue: number | undefined =
  ExternalSchemaComponent.hostProps?.transformedValue;
const defaultedHostValue: string | undefined =
  ExternalSchemaComponent.hostProps?.defaultedValue;
const wrappedTransformedHostValue: number | undefined =
  ExternalSchemaComponent.hostProps?.wrappedTransformedValue;
void transformedHostValue;
void defaultedHostValue;
void wrappedTransformedHostValue;

const dynamicRequired = true as boolean;

const WrappedOptionalityComponent = create({
  tag: 'wrapped-optionality-component',
  url: (props) => {
    const optionalTransportValue: string | undefined = props.transportOnly;
    const dynamicRequiredValue: string | undefined =
      props.dynamicRequiredWrapper;
    const requiredOptionalSchemaValue: string = props.requiredOptionalSchema;
    void optionalTransportValue;
    void dynamicRequiredValue;
    return `https://example.com/wrapped-optionality/${requiredOptionalSchemaValue}`;
  },
  props: {
    transportOnly: {
      schema: prop.string(),
      sameDomain: true,
    },
    dynamicRequiredWrapper: {
      schema: prop.string(),
      required: dynamicRequired,
    },
    requiredOptionalSchema: {
      schema: prop.string().optional(),
      required: true,
    },
    defaultedWrapper: {
      schema: prop.string(),
      required: true,
      default: 'fallback',
    },
    computedWrapper: {
      schema: prop.string(),
      required: true,
      value: () => 'computed',
    },
  },
});

void WrappedOptionalityComponent({
  requiredOptionalSchema: 'required',
});

if (WrappedOptionalityComponent.hostProps) {
  const optionalTransportValue: string | undefined =
    WrappedOptionalityComponent.hostProps.transportOnly;
  const dynamicRequiredValue: string | undefined =
    WrappedOptionalityComponent.hostProps.dynamicRequiredWrapper;
  const requiredOptionalSchemaValue: string =
    WrappedOptionalityComponent.hostProps.requiredOptionalSchema;
  const defaultedWrapperValue: string =
    WrappedOptionalityComponent.hostProps.defaultedWrapper;
  const computedWrapperValue: string =
    WrappedOptionalityComponent.hostProps.computedWrapper;
  void optionalTransportValue;
  void dynamicRequiredValue;
  void requiredOptionalSchemaValue;
  void defaultedWrapperValue;
  void computedWrapperValue;
}

// @ts-expect-error wrapped required metadata overrides optional schema input
void WrappedOptionalityComponent({});

// @ts-expect-error wrapped required metadata rejects an explicit undefined value
void WrappedOptionalityComponent({ requiredOptionalSchema: undefined });

const AnyComponent = create({
  tag: 'any-component',
  url: 'https://example.com/any',
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
  tag: 'composite-input-component',
  url: 'https://example.com/composite-input',
  props: {
    objectValue: prop.object().shape({
      requiredField: prop.boolean(),
      defaultedField: prop.string().default('default'),
      optionalField: prop.number().optional(),
    }),
    tupleValue: prop.tuple(
      prop.string().default('default'),
      prop.number().optional()
    ),
    arrayValue: prop.array().of(prop.string().default('default')),
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

const ChildComponent = create({
  tag: 'typed-child-component',
  url: 'https://example.com/child',
  props: {
    childLabel: prop.string(),
  },
});

const ParentComponent = create({
  tag: 'typed-parent-component',
  url: 'https://example.com/parent',
  props: {
    parentLabel: prop.string(),
  },
  children: () => ({ ChildComponent }),
});

void ParentComponent({ parentLabel: 'parent' });
void ChildComponent({ childLabel: 'child' });
