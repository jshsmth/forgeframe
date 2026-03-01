/**
 * Security-oriented tests for host initialization and deferred init behavior.
 *
 * Covers consumer domain allowlist enforcement, hostProps invalidation, and deferred init gating under security checks.
 */
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

  it('should allow wildcard consumer domains during host initialization', () => {
    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(window);

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid-wildcard',
      tag: 'secure-component-wildcard',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://api.trusted.example.com',
      props: {},
      exports: {},
    };

    window.name = buildWindowName(payload);

    expect(() => initHost({}, 'https://*.trusted.example.com', { deferInit: true })).not.toThrow();
  });

  it('should clear window.hostProps when existing host fails allowlist recheck', () => {
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

  it('should keep deferred init unsent until explicitly flushed', () => {
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

    expect(sendInitSpy).not.toHaveBeenCalled();
    initHost();
    expect(sendInitSpy).toHaveBeenCalledTimes(1);
  });

  it('should auto-flush deferred init when window.hostProps is accessed', async () => {
    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(window);

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid-deferred-access',
      tag: 'secure-component-deferred-access',
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

    void (window as unknown as { hostProps?: unknown }).hostProps;
    await Promise.resolve();

    expect(sendInitSpy).toHaveBeenCalledTimes(1);
  });

  it('should not send deferred init before allowlist recheck', () => {
    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(window);

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid-deferred-allowlist',
      tag: 'secure-component-deferred-allowlist',
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
    expect(sendInitSpy).not.toHaveBeenCalled();
    expect((window as unknown as { hostProps?: unknown }).hostProps).toBeUndefined();
  });

  it('should not flush deferred init when allowlist recheck fails in the same tick', async () => {
    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(window);

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid-deferred-same-tick',
      tag: 'secure-component-deferred-same-tick',
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

    void (window as unknown as { hostProps?: unknown }).hostProps;
    expect(() => initHost({}, 'https://trusted.example.com')).toThrow('is not allowed');

    await Promise.resolve();

    expect(sendInitSpy).not.toHaveBeenCalled();
    expect((window as unknown as { hostProps?: unknown }).hostProps).toBeUndefined();
  });
});
