/**
 * Integration tests covering popup bootstrap behavior.
 *
 * Exercises popup rendering, `window.open()` bootstrap, and host initialization
 * through the real popup messaging pipeline.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create, PopupOpenError, prop } from '@/index';
import type { PropsDefinition } from '@/types';
import {
  createPopupIntegrationHarness,
  type PopupIntegrationHarness,
} from './helpers';

interface PopupProps {
  amount: number;
  message: string;
}

const POPUP_PROP_DEFINITIONS: PropsDefinition<PopupProps> = {
  amount: { schema: prop.number(), required: true },
  message: { schema: prop.string(), required: true },
};

describe('Popup host handshake integration', () => {
  let harness: PopupIntegrationHarness | null = null;

  afterEach(async () => {
    await harness?.cleanup();
    harness = null;
    vi.restoreAllMocks();
  });

  it('should resolve render() after initHost() completes the popup handshake', async () => {
    harness = createPopupIntegrationHarness();

    const container = document.createElement('div');
    document.body.appendChild(container);

    const PopupComponent = create<PopupProps>({
      tag: 'integration-popup-handshake-component',
      url: 'https://host.example.com/widget',
      props: POPUP_PROP_DEFINITIONS,
    });

    const instance = PopupComponent({
      amount: 9,
      message: 'Popup ready',
    });

    const renderPromise = instance.render(container, 'popup');
    const popupOpen = await harness.waitForPopupOpen();
    const { hostProps } = await harness.bootstrapPopupHost(POPUP_PROP_DEFINITIONS);

    await expect(renderPromise).resolves.toBeUndefined();

    expect(popupOpen.url).toBe('https://host.example.com/widget');
    expect(typeof popupOpen.name).toBe('string');
    expect(hostProps.amount).toBe(9);
    expect(hostProps.message).toBe('Popup ready');
    expect(hostProps.consumer.props).toEqual({
      amount: 9,
      message: 'Popup ready',
    });
    expect(hostProps.getConsumer()).toBe(harness.consumerWindow);
    expect(hostProps.getConsumerDomain()).toBe(harness.consumerOrigin);

    await harness.withHostGlobalsAsync(() => hostProps.export({ ready: true }));

    expect(instance.exports).toEqual({ ready: true });
  });

  it('should reject render() with PopupOpenError when the browser blocks the popup', async () => {
    harness = createPopupIntegrationHarness();
    harness.blockNextPopup();

    const container = document.createElement('div');
    document.body.appendChild(container);

    const PopupComponent = create({
      tag: 'integration-popup-blocked-component',
      url: 'https://host.example.com/widget',
    });

    const instance = PopupComponent({});

    await expect(instance.render(container, 'popup')).rejects.toBeInstanceOf(
      PopupOpenError
    );
    expect(container.childElementCount).toBe(0);
    expect(harness.getLastPopupOpen()).toBeNull();
  });
});
