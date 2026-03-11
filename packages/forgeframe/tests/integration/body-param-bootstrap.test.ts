/**
 * Integration tests covering initial bodyParam bootstrap flows.
 *
 * Verifies that iframe and popup hosts both use hidden-form POST bootstrap
 * while still completing host initialization through `window.name`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create, prop } from '@/index';
import type { PropsDefinition } from '@/types';
import {
  createIframeIntegrationHarness,
  createPopupIntegrationHarness,
  type IframeIntegrationHarness,
  type PopupIntegrationHarness,
} from './helpers';

interface BodyParamProps {
  token: string;
  mode: string;
}

const BODY_PARAM_PROP_DEFINITIONS: PropsDefinition<BodyParamProps> = {
  token: { schema: prop.string(), required: true, bodyParam: true },
  mode: { schema: prop.string(), required: true, queryParam: true },
};

describe('Body param bootstrap integration', () => {
  let iframeHarness: IframeIntegrationHarness | null = null;
  let popupHarness: PopupIntegrationHarness | null = null;

  afterEach(async () => {
    await iframeHarness?.cleanup();
    await popupHarness?.cleanup();
    iframeHarness = null;
    popupHarness = null;
    vi.restoreAllMocks();
  });

  it('should submit iframe body params through a hidden form and still initialize host props', async () => {
    iframeHarness = createIframeIntegrationHarness();

    const container = document.createElement('div');
    document.body.appendChild(container);

    const BodyParamComponent = create<BodyParamProps>({
      tag: 'integration-iframe-body-param-component',
      url: 'https://host.example.com/widget',
      props: BODY_PARAM_PROP_DEFINITIONS,
    });

    const instance = BodyParamComponent({
      token: 'abc123',
      mode: 'embedded',
    });

    const renderPromise = instance.render(container);
    const { hostProps, iframe } = await iframeHarness.bootstrapIframeHost(
      container,
      BODY_PARAM_PROP_DEFINITIONS
    );

    await expect(renderPromise).resolves.toBeUndefined();

    expect(iframeHarness.getLastFormSubmission()).toEqual({
      action: 'https://host.example.com/widget?mode=embedded',
      target: iframe.name,
      method: 'POST',
      fields: { token: 'abc123' },
    });
    expect(document.querySelector('form')).toBeNull();
    expect(hostProps.consumer.props).toEqual({
      token: 'abc123',
      mode: 'embedded',
    });
    expect(iframeHarness.withHostGlobals(() => window.location.href)).toBe(
      'https://host.example.com/widget?mode=embedded'
    );
  });

  it('should open a popup on about:blank, submit body params, and initialize host props', async () => {
    popupHarness = createPopupIntegrationHarness();

    const container = document.createElement('div');
    document.body.appendChild(container);

    const BodyParamComponent = create<BodyParamProps>({
      tag: 'integration-popup-body-param-component',
      url: 'https://host.example.com/widget',
      props: BODY_PARAM_PROP_DEFINITIONS,
    });

    const instance = BodyParamComponent({
      token: 'popup-token',
      mode: 'popup',
    });

    const renderPromise = instance.render(container, 'popup');
    const popupOpen = await popupHarness.waitForPopupOpen();
    const { hostProps } = await popupHarness.bootstrapPopupHost(
      BODY_PARAM_PROP_DEFINITIONS
    );

    await expect(renderPromise).resolves.toBeUndefined();

    expect(popupOpen.url).toBe('about:blank');
    expect(popupHarness.getLastFormSubmission()).toEqual({
      action: 'https://host.example.com/widget?mode=popup',
      target: popupOpen.name,
      method: 'POST',
      fields: { token: 'popup-token' },
    });
    expect(document.querySelector('form')).toBeNull();
    expect(hostProps.consumer.props).toEqual({
      token: 'popup-token',
      mode: 'popup',
    });
    expect(popupHarness.withHostGlobals(() => window.location.href)).toBe(
      'https://host.example.com/widget?mode=popup'
    );
  });
});
