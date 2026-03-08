/**
 * Integration test covering the primary iframe happy path.
 *
 * Exercises `create()`, `instance.render()`, `initHost()`, and the real INIT
 * handshake across separate consumer and host windows.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create, EVENT, prop } from '@/index';
import type { HostProps, PropsDefinition } from '@/types';
import { createIframeIntegrationHarness, type IframeIntegrationHarness } from './helpers';

interface HandshakeProps {
  amount: number;
  message: string;
}

const HANDSHAKE_PROP_DEFINITIONS: PropsDefinition<HandshakeProps> = {
  amount: { schema: prop.number(), required: true },
  message: { schema: prop.string(), required: true },
};

describe('Consumer/host handshake integration', () => {
  let harness: IframeIntegrationHarness | null = null;

  afterEach(async () => {
    await harness?.cleanup();
    harness = null;
    vi.restoreAllMocks();
  });

  it('should resolve render() after initHost() completes the iframe INIT handshake', async () => {
    harness = createIframeIntegrationHarness();

    const container = document.createElement('div');
    document.body.appendChild(container);

    const HandshakeComponent = create<HandshakeProps>({
      tag: 'integration-handshake-component',
      url: 'https://host.example.com/widget',
      props: HANDSHAKE_PROP_DEFINITIONS,
    });

    const instance = HandshakeComponent({
      amount: 7,
      message: 'ForgeFrame ready',
    });
    const renderedSpy = vi.fn();
    instance.event.once(EVENT.RENDERED, renderedSpy);

    const renderPromise = instance.render(container);
    const { hostProps } = await harness.bootstrapIframeHost(container, HANDSHAKE_PROP_DEFINITIONS);

    await expect(renderPromise).resolves.toBeUndefined();

    const windowHostProps = harness.withHostGlobals(
      () => (window as unknown as { hostProps?: HostProps<HandshakeProps> }).hostProps
    );

    expect(windowHostProps).toBe(hostProps);
    expect(hostProps.amount).toBe(7);
    expect(hostProps.message).toBe('ForgeFrame ready');
    expect(hostProps.consumer.props).toEqual({
      amount: 7,
      message: 'ForgeFrame ready',
    });

    expect(typeof hostProps.uid).toBe('string');
    expect(hostProps.tag).toBe('integration-handshake-component');
    expect(typeof hostProps.close).toBe('function');
    expect(typeof hostProps.focus).toBe('function');
    expect(typeof hostProps.resize).toBe('function');
    expect(typeof hostProps.show).toBe('function');
    expect(typeof hostProps.hide).toBe('function');
    expect(typeof hostProps.onProps).toBe('function');
    expect(typeof hostProps.onError).toBe('function');
    expect(typeof hostProps.export).toBe('function');
    expect(typeof hostProps.consumer.export).toBe('function');
    expect(typeof hostProps.getPeerInstances).toBe('function');
    expect(hostProps.getConsumer()).toBe(harness.consumerWindow);
    expect(hostProps.getConsumerDomain()).toBe(harness.consumerOrigin);

    expect(renderedSpy).toHaveBeenCalledTimes(1);
  });
});
