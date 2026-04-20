/**
 * Integration-style test for public entrypoint side effects.
 *
 * Covers module import safety and explicit host initialization when
 * ForgeFrame-shaped window payloads are present in host-like window contexts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTEXT, MESSAGE_NAME, VERSION } from '@/constants';
import { buildWindowName } from '@/window/name-payload';
import type { ConsumerExports, WindowNamePayload } from '@/types';

const originalWindowName = window.name;
const VALID_EXPORTS: ConsumerExports = {
  init: MESSAGE_NAME.INIT,
  close: MESSAGE_NAME.CLOSE,
  resize: MESSAGE_NAME.RESIZE,
  show: MESSAGE_NAME.SHOW,
  hide: MESSAGE_NAME.HIDE,
  onError: MESSAGE_NAME.ERROR,
  updateProps: MESSAGE_NAME.PROPS,
  export: MESSAGE_NAME.EXPORT,
};

afterEach(async () => {
  const { clearHostInstance } = await import('@/core/host');
  clearHostInstance();
  window.name = originalWindowName;
  delete (window as unknown as { hostProps?: unknown }).hostProps;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Index side effects', () => {
  it('should not initialize host state until initHost() is called explicitly', async () => {
    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'index-side-effect-free-uid',
      tag: 'index-side-effect-free-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.example.com',
      props: {},
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    vi.resetModules();
    const hostSecurity = await import('@/core/host/security');
    const { Messenger } = await import('@/communication/messenger');
    const resolveConsumerWindowSpy = vi
      .spyOn(hostSecurity, 'resolveConsumerWindow')
      .mockReturnValue(window);
    const sendSpy = vi
      .spyOn(Messenger.prototype, 'send')
      .mockResolvedValue(undefined);

    const publicEntrypoint = await import('@/index');

    const { getHost } = await import('@/core/host');

    expect(resolveConsumerWindowSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(getHost()).toBeNull();
    expect(publicEntrypoint.getHostProps()).toBeUndefined();
    expect((window as unknown as { hostProps?: unknown }).hostProps).toBeUndefined();

    const host = publicEntrypoint.initHost();

    expect(host).not.toBeNull();
    expect(getHost()).toBe(host);
    expect(publicEntrypoint.getHostProps()).toBe(host?.hostProps);
    expect((window as unknown as { hostProps?: unknown }).hostProps).toBe(host?.hostProps);
  });
});
