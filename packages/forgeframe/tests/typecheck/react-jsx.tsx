import type { ReactElement } from 'react';
import {
  create,
  createReactComponent,
  prop,
  withReactComponent,
} from '../../src';

declare const React: typeof import('react');

interface Props extends Record<string, unknown> {
  label: string;
}

const Component = create<Props>({
  tag: 'react-typecheck',
  url: 'https://example.com',
  props: {
    label: { schema: prop.string() },
  },
});

const ReactComponent = createReactComponent<Props, unknown, ReactElement>(
  Component,
  { React }
);

const element: ReactElement = <ReactComponent label="ready" />;
void element;

const InferredRequiredComponent = create({
  tag: 'inferred-required-react-typecheck',
  url: 'https://example.com/inferred-required',
  props: {
    label: prop.string(),
  },
});
const InferredRequiredReact = createReactComponent(InferredRequiredComponent, {
  React,
});
const InferredRequiredReactWithDriver = withReactComponent(React)(
  InferredRequiredComponent
);

const inferredRequiredElement: ReactElement = (
  <InferredRequiredReact label="ready" />
);
const inferredRequiredDriverElement: ReactElement = (
  <InferredRequiredReactWithDriver label="ready" />
);
void inferredRequiredElement;
void inferredRequiredDriverElement;

// @ts-expect-error inferred required inputs remain required in React wrappers
const missingRequiredElement = <InferredRequiredReact />;
// @ts-expect-error curried React wrappers preserve required initial inputs
const missingRequiredDriverElement = <InferredRequiredReactWithDriver />;
void missingRequiredElement;
void missingRequiredDriverElement;

const InferredOptionalComponent = create({
  tag: 'inferred-optional-react-typecheck',
  url: 'https://example.com/inferred-optional',
  props: {
    label: prop.string().optional(),
  },
});
const InferredOptionalReact = createReactComponent(InferredOptionalComponent, {
  React,
});
const optionalElement: ReactElement = <InferredOptionalReact />;
void optionalElement;
