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

interface DateSyncProps {
  publishedAt: Date;
}

const SYNC_PROP_DEFINITIONS: PropsDefinition<SyncProps> = {
  title: { schema: prop.string(), required: true },
  optionalNote: { schema: prop.string().optional() },
};

const DATE_SYNC_PROP_DEFINITIONS: PropsDefinition<DateSyncProps> = {
  publishedAt: { schema: prop.date(), required: true },
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

  it('should preserve Date props through bootstrap and prop sync', async () => {
    harness = createIframeIntegrationHarness();

    const container = document.createElement('div');
    document.body.appendChild(container);

    const initialDate = new Date('2026-01-02T03:04:05.678Z');
    const updatedDate = new Date('2026-02-03T04:05:06.789Z');

    const DateSyncComponent = create<DateSyncProps>({
      tag: 'integration-date-props-sync-component',
      url: 'https://host.example.com/widget',
      props: DATE_SYNC_PROP_DEFINITIONS,
    });

    const instance = DateSyncComponent({
      publishedAt: initialDate,
    });

    const renderPromise = instance.render(container);
    const { hostProps } = await harness.bootstrapIframeHost(
      container,
      DATE_SYNC_PROP_DEFINITIONS
    );

    await expect(renderPromise).resolves.toBeUndefined();

    expect(hostProps.publishedAt).toBeInstanceOf(Date);
    expect(hostProps.publishedAt.toISOString()).toBe(initialDate.toISOString());

    const onProps = vi.fn();
    hostProps.onProps(onProps);

    await expect(
      instance.updateProps({
        publishedAt: updatedDate,
      })
    ).resolves.toBeUndefined();

    expect(hostProps.publishedAt).toBeInstanceOf(Date);
    expect(hostProps.publishedAt.toISOString()).toBe(updatedDate.toISOString());
    expect(onProps).toHaveBeenCalledTimes(1);
    expect(onProps.mock.calls[0][0].publishedAt).toBeInstanceOf(Date);
    expect(onProps.mock.calls[0][0].publishedAt.toISOString()).toBe(updatedDate.toISOString());
  });
});
