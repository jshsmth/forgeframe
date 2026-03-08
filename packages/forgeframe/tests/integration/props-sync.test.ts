/**
 * Integration test covering post-connect prop synchronization.
 *
 * Verifies that `instance.updateProps()` updates the host snapshot, removes
 * omitted optional keys from `window.hostProps`, and notifies subscribers once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create, prop } from '@/index';
import type { PropsDefinition } from '@/types';
import { createIframeIntegrationHarness, type IframeIntegrationHarness } from './helpers';

interface SyncProps {
  title: string;
  optionalNote?: string;
}

const SYNC_PROP_DEFINITIONS: PropsDefinition<SyncProps> = {
  title: { schema: prop.string(), required: true },
  optionalNote: { schema: prop.string().optional() },
};

describe('Props sync integration', () => {
  let harness: IframeIntegrationHarness | null = null;

  afterEach(async () => {
    await harness?.cleanup();
    harness = null;
    vi.restoreAllMocks();
  });

  it('should sync updated props, remove undefined keys, and notify host subscribers once', async () => {
    harness = createIframeIntegrationHarness();

    const container = document.createElement('div');
    document.body.appendChild(container);

    const SyncComponent = create<SyncProps>({
      tag: 'integration-props-sync-component',
      url: 'https://host.example.com/widget',
      props: SYNC_PROP_DEFINITIONS,
    });

    const instance = SyncComponent({
      title: 'Initial title',
      optionalNote: 'Keep me',
    });

    const renderPromise = instance.render(container);
    const { hostProps } = await harness.bootstrapIframeHost(container, SYNC_PROP_DEFINITIONS);

    await expect(renderPromise).resolves.toBeUndefined();

    const initialConsumerProps = hostProps.consumer.props;
    const onProps = vi.fn();
    hostProps.onProps(onProps);

    await expect(
      instance.updateProps({
        title: 'Updated title',
        optionalNote: undefined,
      })
    ).resolves.toBeUndefined();

    expect(hostProps.title).toBe('Updated title');
    expect('optionalNote' in (hostProps as Record<string, unknown>)).toBe(false);
    expect(hostProps.consumer.props).toEqual({ title: 'Updated title' });
    expect(hostProps.consumer.props).not.toBe(initialConsumerProps);
    expect(onProps).toHaveBeenCalledTimes(1);
    expect(onProps).toHaveBeenCalledWith({ title: 'Updated title' });
  });
});
