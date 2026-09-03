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
  count: 1,
  onSubmit: (_value) => undefined,
});

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
    wrappedValue: {
      schema: z.number(),
      required: true,
      sameDomain: true,
    },
  },
});

void ExternalSchemaComponent({
  zodValue: 'zod',
  valibotValue: 'valibot',
  wrappedValue: 42,
});

// @ts-expect-error third-party Standard Schema outputs are inferred
void ExternalSchemaComponent({ zodValue: 1, valibotValue: 'ok', wrappedValue: 42 });

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
