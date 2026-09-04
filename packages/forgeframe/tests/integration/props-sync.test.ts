/**
 * Integration test covering post-connect prop synchronization.
 *
 * Verifies that `instance.updateProps()` updates the host snapshot, removes
 * omitted optional keys from `window.hostProps`, and notifies subscribers once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
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

interface TransformedSyncProps {
  amount: number;
}

interface TransformedSyncInput {
  amount: string;
}

interface OptionalTransformOutputSyncProps {
  amount: number | undefined;
}

interface OptionalTransformOutputSyncInput {
  amount: string;
}

const SYNC_PROP_DEFINITIONS: PropsDefinition<SyncProps> = {
  title: { schema: prop.string(), required: true },
  optionalNote: { schema: prop.string().optional() },
};

const DATE_SYNC_PROP_DEFINITIONS: PropsDefinition<DateSyncProps> = {
  publishedAt: { schema: prop.date(), required: true },
};

const TRANSFORMED_SYNC_PROP_DEFINITIONS: PropsDefinition<
  TransformedSyncProps,
  TransformedSyncInput
> = {
  amount: {
    schema: z.string().transform(Number),
    outputSchema: z.number(),
    required: true,
  },
};

const OPTIONAL_TRANSFORM_OUTPUT_SYNC_PROP_DEFINITIONS: PropsDefinition<
  OptionalTransformOutputSyncProps,
  OptionalTransformOutputSyncInput
> = {
  amount: {
    schema: z.string().transform((value) =>
      value === 'empty' ? undefined : Number(value)
    ),
    outputSchema: z.number().optional(),
    required: true,
  },
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

  it('should deliver transformed props through bootstrap and prop sync', async () => {
    harness = createIframeIntegrationHarness();

    const container = document.createElement('div');
    document.body.appendChild(container);

    const TransformedSyncComponent = create<
      TransformedSyncProps,
      unknown,
      TransformedSyncInput
    >({
      tag: 'integration-transformed-props-sync-component',
      url: 'https://host.example.com/widget',
      props: TRANSFORMED_SYNC_PROP_DEFINITIONS,
    });

    const instance = TransformedSyncComponent({ amount: '41' });

    const renderPromise = instance.render(container);
    const { hostProps } = await harness.bootstrapIframeHost<TransformedSyncProps>(
      container,
      TRANSFORMED_SYNC_PROP_DEFINITIONS
    );

    await expect(renderPromise).resolves.toBeUndefined();

    expect(hostProps.amount).toBe(41);
    expect(hostProps.consumer.props.amount).toBe(41);

    const onProps = vi.fn();
    hostProps.onProps(onProps);

    await expect(instance.updateProps({ amount: '42' })).resolves.toBeUndefined();

    expect(hostProps.amount).toBe(42);
    expect(hostProps.consumer.props.amount).toBe(42);
    expect(onProps).toHaveBeenCalledTimes(1);
    expect(onProps).toHaveBeenCalledWith({ amount: 42 });
  });

  it('should accept undefined normalized outputs for required inputs across bootstrap and prop sync', async () => {
    harness = createIframeIntegrationHarness();

    const container = document.createElement('div');
    document.body.appendChild(container);

    const OptionalTransformOutputSyncComponent = create<
      OptionalTransformOutputSyncProps,
      unknown,
      OptionalTransformOutputSyncInput
    >({
      tag: 'integration-optional-transform-output-sync-component',
      url: 'https://host.example.com/widget',
      props: OPTIONAL_TRANSFORM_OUTPUT_SYNC_PROP_DEFINITIONS,
    });

    const instance = OptionalTransformOutputSyncComponent({ amount: 'empty' });

    const renderPromise = instance.render(container);
    const { hostProps } =
      await harness.bootstrapIframeHost<OptionalTransformOutputSyncProps>(
        container,
        OPTIONAL_TRANSFORM_OUTPUT_SYNC_PROP_DEFINITIONS
      );

    await expect(renderPromise).resolves.toBeUndefined();

    expect(hostProps.amount).toBeUndefined();
    expect(hostProps.consumer.props.amount).toBeUndefined();

    const onProps = vi.fn();
    hostProps.onProps(onProps);

    await expect(instance.updateProps({ amount: '42' })).resolves.toBeUndefined();
    expect(hostProps.amount).toBe(42);

    await expect(instance.updateProps({ amount: 'empty' })).resolves.toBeUndefined();

    expect(hostProps.amount).toBeUndefined();
    expect(hostProps.consumer.props.amount).toBeUndefined();
    expect(onProps).toHaveBeenCalledTimes(2);
    expect(onProps).toHaveBeenNthCalledWith(1, { amount: 42 });
    expect(onProps).toHaveBeenNthCalledWith(2, {});
  });
});
