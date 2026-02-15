import { describe, it, expect, afterEach, vi } from 'vitest';
import { initHost, clearHostInstance, HostComponent } from '@/core/host';
import { buildWindowName } from '@/window/name-payload';
import { CONTEXT, VERSION } from '@/constants';
import type { WindowNamePayload } from '@/types';

const originalWindowName = window.name;

afterEach(() => {
  clearHostInstance();
  window.name = originalWindowName;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Host security', () => {
  it('should reject disallowed consumer domains during host initialization', () => {
    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid',
      tag: 'secure-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://evil.example.com',
      props: {},
      exports: {},
    };

    window.name = buildWindowName(payload);

    expect(() => initHost({}, 'https://trusted.example.com')).toThrow(
      'is not allowed'
    );
  });

  it('should clear window.hostProps when existing host fails allowlist recheck', () => {
    vi.useFakeTimers();

    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(window);

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid-existing',
      tag: 'secure-component-existing',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://evil.example.com',
      props: {},
      exports: {},
    };

    window.name = buildWindowName(payload);

    initHost(undefined, undefined, { deferInit: true });
    expect((window as unknown as { hostProps?: unknown }).hostProps).toBeDefined();

    expect(() => initHost({}, 'https://trusted.example.com')).toThrow('is not allowed');
    expect((window as unknown as { hostProps?: unknown }).hostProps).toBeUndefined();
  });

  it('should cancel deferred init when allowlist recheck fails', () => {
    vi.useFakeTimers();
    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(window);

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid-deferred',
      tag: 'secure-component-deferred',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://evil.example.com',
      props: {},
      exports: {},
    };

    window.name = buildWindowName(payload);

    const host = initHost(undefined, undefined, { deferInit: true });
    expect(host).not.toBeNull();

    const hostInternal = host as unknown as { sendInit: () => Promise<void> };
    const sendInitSpy = vi.spyOn(hostInternal, 'sendInit').mockResolvedValue(undefined);

    expect(() => initHost({}, 'https://trusted.example.com')).toThrow('is not allowed');

    vi.runAllTimers();
    expect(sendInitSpy).not.toHaveBeenCalled();
    expect((window as unknown as { hostProps?: unknown }).hostProps).toBeUndefined();
  });
});
