import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTEXT, VERSION } from '@/constants';
import { buildWindowName } from '@/window/name-payload';
import type { WindowNamePayload } from '@/types';

const originalWindowName = window.name;

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
      exports: {},
    };

    window.name = buildWindowName(payload);
    vi.resetModules();

    await expect(import('@/index')).resolves.toBeDefined();

    const { getHost } = await import('@/core/host');
    expect(getHost()).toBeNull();
    expect((window as unknown as { hostProps?: unknown }).hostProps).toBeUndefined();
  });
});
