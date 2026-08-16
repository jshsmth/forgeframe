/**
 * Integration test covering canonical host synchronization for prop aliases.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create, prop } from '@/index';
import type { PropsDefinition } from '@/types';
import {
  createIframeIntegrationHarness,
  type IframeIntegrationHarness,
} from './helpers';

interface AliasSyncProps {
  email: string;
}

const ALIAS_PROP_DEFINITIONS: PropsDefinition<AliasSyncProps> = {
  email: {
    schema: prop.string(),
    required: true,
    alias: 'userEmail',
  },
};

function withUserEmail(value: string): Partial<AliasSyncProps> {
  return { userEmail: value } as unknown as Partial<AliasSyncProps>;
}

describe('Prop alias sync integration', () => {
  let harness: IframeIntegrationHarness | null = null;

  afterEach(async () => {
    await harness?.cleanup();
    harness = null;
    vi.restoreAllMocks();
  });

  it('should send initial and updated alias values under the canonical key', async () => {
    harness = createIframeIntegrationHarness();

    const container = document.createElement('div');
    document.body.appendChild(container);

    const AliasComponent = create<AliasSyncProps>({
      tag: 'integration-props-alias-component',
      url: 'https://host.example.com/widget',
      props: ALIAS_PROP_DEFINITIONS,
    });
    const instance = AliasComponent(
      withUserEmail('initial@example.com')
    );

    const renderPromise = instance.render(container);
    const { hostProps } = await harness.bootstrapIframeHost(
      container,
      ALIAS_PROP_DEFINITIONS
    );

    await expect(renderPromise).resolves.toBeUndefined();
    expect(hostProps.email).toBe('initial@example.com');
    expect(hostProps).not.toHaveProperty('userEmail');

    const onProps = vi.fn();
    hostProps.onProps(onProps);

    await expect(
      instance.updateProps(withUserEmail('updated@example.com'))
    ).resolves.toBeUndefined();

    expect(hostProps.email).toBe('updated@example.com');
    expect(hostProps.consumer.props.email).toBe('updated@example.com');
    expect(hostProps.consumer.props).not.toHaveProperty('userEmail');
    expect(onProps).toHaveBeenCalledTimes(1);
    expect(onProps.mock.calls[0][0]).toMatchObject({
      email: 'updated@example.com',
    });
    expect(onProps.mock.calls[0][0]).not.toHaveProperty('userEmail');
  });
});
