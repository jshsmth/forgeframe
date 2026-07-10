/**
 * Integration tests covering host control channels and routing guards.
 *
 * Verifies that host builtins operate through the real messaging pipeline and
 * that spoofed or untrusted message sources are rejected.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create, EVENT, prop } from '@/index';
import { MESSAGE_NAME } from '@/constants';
import { serializeProps } from '@/props';
import type { Dimensions, PropsDefinition } from '@/types';
import {
  createIframeIntegrationHarness,
  dispatchForgeFrameRequest,
  readLastPostedMessageData,
  type IframeIntegrationHarness,
} from './helpers';

interface ControlProps {
  label: string;
}

const CONTROL_PROP_DEFINITIONS: PropsDefinition<ControlProps> = {
  label: { schema: prop.string(), required: true },
};

describe('Host controls and routing integration', () => {
  let harness: IframeIntegrationHarness | null = null;

  afterEach(async () => {
    await harness?.cleanup();
    harness = null;
    vi.restoreAllMocks();
  });

  it('should deliver host builtins through the real iframe messaging pipeline', async () => {
    harness = createIframeIntegrationHarness();

    const container = document.createElement('div');
    document.body.appendChild(container);

    const onClose = vi.fn();
    const onFocus = vi.fn();
    const onResize = vi.fn();
    const onError = vi.fn();
    const errorEvent = vi.fn();

    const ControlsComponent = create<ControlProps>({
      tag: 'integration-host-controls-component',
      url: 'https://host.example.com/widget',
      props: CONTROL_PROP_DEFINITIONS,
    });

    const instance = ControlsComponent({
      label: 'Primary',
      onClose,
      onFocus,
      onResize,
      onError,
    });
    instance.event.on(EVENT.ERROR, errorEvent);

    const sibling = ControlsComponent({ label: 'Sibling' });
    sibling.exports = { peer: 'sibling' };

    const renderPromise = instance.render(container);
    const { hostProps, iframe } = await harness.bootstrapIframeHost(
      container,
      CONTROL_PROP_DEFINITIONS
    );

    await expect(renderPromise).resolves.toBeUndefined();

    const resizeDimensions: Dimensions = { width: 320, height: 240 };
    await harness.withHostGlobalsAsync(() => hostProps.resize(resizeDimensions));
    expect(iframe.style.width).toBe('320px');
    expect(iframe.style.height).toBe('240px');
    expect(onResize).toHaveBeenCalledWith(resizeDimensions);

    await harness.withHostGlobalsAsync(() => hostProps.hide());
    expect(iframe.style.display).toBe('none');
    expect(iframe.style.visibility).toBe('hidden');

    await harness.withHostGlobalsAsync(() => hostProps.show());
    expect(iframe.style.display).toBe('');
    expect(iframe.style.visibility).toBe('visible');

    await harness.withHostGlobalsAsync(() => hostProps.focus());
    expect(onFocus).toHaveBeenCalledTimes(1);

    await harness.withHostGlobalsAsync(() =>
      hostProps.onError(new Error('host-side integration error'))
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'host-side integration error' })
    );
    expect(errorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'host-side integration error',
      })
    );

    await harness.withHostGlobalsAsync(() => hostProps.export({ ready: true }));
    expect(instance.exports).toEqual({ ready: true });

    await harness.withHostGlobalsAsync(() => hostProps.consumer.export({ ping: true }));
    expect(instance.consumerExports).toEqual({ ping: true });

    await expect(
      harness.withHostGlobalsAsync(() => hostProps.getPeerInstances())
    ).resolves.toEqual([
      {
        uid: sibling.uid,
        tag: 'integration-host-controls-component',
        exports: { peer: 'sibling' },
      },
    ]);

    await harness.withHostGlobalsAsync(() => hostProps.close());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('should reject untrusted and spoofed windows on both consumer and host runtimes', async () => {
    harness = createIframeIntegrationHarness();

    const container = document.createElement('div');
    document.body.appendChild(container);

    const ControlsComponent = create<ControlProps>({
      tag: 'integration-routing-guards-component',
      url: 'https://host.example.com/widget',
      props: CONTROL_PROP_DEFINITIONS,
    });

    const instance = ControlsComponent({ label: 'Original' });

    const renderPromise = instance.render(container);
    const { hostProps } = await harness.bootstrapIframeHost(
      container,
      CONTROL_PROP_DEFINITIONS
    );

    await expect(renderPromise).resolves.toBeUndefined();

    const evilHostWindow = { postMessage: vi.fn() } as unknown as Window;
    dispatchForgeFrameRequest({
      targetWindow: harness.consumerWindow,
      sourceWindow: evilHostWindow,
      origin: 'https://evil.example.com',
      name: MESSAGE_NAME.EXPORT,
      data: { ready: 'evil' },
      claimedUid: hostProps.uid,
      claimedDomain: harness.hostOrigin,
    });
    await harness.flushMessages();

    expect(instance.exports).toBeUndefined();
    expect(
      (evilHostWindow as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage
    ).not.toHaveBeenCalled();

    const spoofedTrustedHostWindow = { postMessage: vi.fn() } as unknown as Window;
    dispatchForgeFrameRequest({
      targetWindow: harness.consumerWindow,
      sourceWindow: spoofedTrustedHostWindow,
      origin: harness.hostOrigin,
      name: MESSAGE_NAME.EXPORT,
      data: { ready: 'spoofed-host' },
      claimedUid: hostProps.uid,
      claimedDomain: harness.hostOrigin,
    });
    await harness.flushMessages();

    expect(instance.exports).toBeUndefined();
    expect(readLastPostedMessageData(spoofedTrustedHostWindow)).toEqual({
      success: false,
    });

    const serializedProps = serializeProps(
      { label: 'Spoofed' },
      CONTROL_PROP_DEFINITIONS
    );

    const evilConsumerWindow = { postMessage: vi.fn() } as unknown as Window;
    dispatchForgeFrameRequest({
      targetWindow: harness.hostWindow,
      sourceWindow: evilConsumerWindow,
      origin: 'https://evil.example.com',
      name: MESSAGE_NAME.PROPS,
      data: serializedProps,
      claimedUid: hostProps.uid,
      claimedDomain: harness.consumerOrigin,
    });
    await harness.flushMessages();

    expect(hostProps.label).toBe('Original');
    expect(
      (evilConsumerWindow as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage
    ).not.toHaveBeenCalled();

    const spoofedTrustedConsumerWindow = { postMessage: vi.fn() } as unknown as Window;
    dispatchForgeFrameRequest({
      targetWindow: harness.hostWindow,
      sourceWindow: spoofedTrustedConsumerWindow,
      origin: harness.consumerOrigin,
      name: MESSAGE_NAME.PROPS,
      data: serializedProps,
      claimedUid: hostProps.uid,
      claimedDomain: harness.consumerOrigin,
    });
    await harness.flushMessages();

    expect(hostProps.label).toBe('Original');
    expect(readLastPostedMessageData(spoofedTrustedConsumerWindow)).toEqual({
      success: false,
    });
  });
});
