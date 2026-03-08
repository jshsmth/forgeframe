/**
 * Integration-style test for index auto-initialization behavior.
 *
 * Covers module import safety when ForgeFrame-shaped window payloads are present in top-level window contexts.
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

describe('Index auto-init', () => {
  it('should not throw when window.name is ForgeFrame-shaped on a top-level window', async () => {
    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'index-auto-init-uid',
      tag: 'index-auto-init-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://consumer.example.com',
      props: {},
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    vi.resetModules();

    await expect(import('@/index')).resolves.toBeDefined();

    const { getHost } = await import('@/core/host');
    expect(getHost()).toBeNull();
    expect((window as unknown as { hostProps?: unknown }).hostProps).toBeUndefined();
  });
});
