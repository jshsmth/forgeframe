import type { ReactElement } from 'react';
import { create, createReactComponent, prop } from '../../src';

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
