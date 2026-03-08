/**
 * Security-oriented tests for host initialization and deferred init behavior.
 *
 * Covers consumer domain allowlist enforcement, hostProps invalidation, and deferred init gating under security checks.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { initHost, clearHostInstance, HostComponent } from '@/core/host';
import { buildWindowName } from '@/window/name-payload';
import { CONTEXT, MESSAGE_NAME, VERSION } from '@/constants';
import { prop } from '@/props/prop';
import type { ConsumerExports, WindowNamePayload } from '@/types';

const originalWindowName = window.name;
const originalDocumentReferrer = document.referrer;
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

function setDocumentReferrer(referrer: string): void {
  Object.defineProperty(document, 'referrer', {
    configurable: true,
    value: referrer,
  });
}

afterEach(() => {
  clearHostInstance();
  window.name = originalWindowName;
  setDocumentReferrer(originalDocumentReferrer);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Host security', () => {
  it('should reject disallowed consumer domains during host initialization', () => {
    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(window);

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid',
      tag: 'secure-component',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://evil.example.com',
      props: {},
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    setDocumentReferrer('https://evil.example.com/checkout');

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
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    setDocumentReferrer('https://api.trusted.example.com/checkout');

    expect(() => initHost({}, 'https://*.trusted.example.com', { deferInit: true })).not.toThrow();
  });

  it('should reject spoofed claimed consumer domains when the verified referrer origin is untrusted', () => {
    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(window);

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid-spoofed-domain',
      tag: 'secure-component-spoofed-domain',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://trusted.example.com',
      props: {},
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    setDocumentReferrer('https://evil.example.com/login');

    expect(() => initHost({}, 'https://trusted.example.com')).toThrow(
      'https://evil.example.com'
    );
  });

  it('should bind host consumer domain to the verified referrer origin instead of the claimed payload origin', () => {
    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(window);

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid-verified-domain',
      tag: 'secure-component-verified-domain',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://claimed.example.com',
      props: {},
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    setDocumentReferrer('https://verified.example.com/flow');

    const host = initHost({}, undefined, { deferInit: true });

    expect(host?.hostProps.getConsumerDomain()).toBe('https://verified.example.com');
  });

  it('should reject host initialization when consumer origin cannot be verified for an allowlist', () => {
    const inaccessibleConsumerWindow = {
      get location() {
        throw new Error('Cross-origin');
      },
    } as unknown as Window;

    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(inaccessibleConsumerWindow);

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid-unverified-domain',
      tag: 'secure-component-unverified-domain',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://trusted.example.com',
      props: {},
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    setDocumentReferrer('');

    expect(() => initHost({}, 'https://trusted.example.com')).toThrow(
      'Could not verify consumer origin'
    );
  });

  it('should validate bootstrap props when prop definitions are applied after deferred pre-init', () => {
    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(window);

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid-preinit-validation',
      tag: 'secure-component-preinit-validation',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://trusted.example.com',
      props: { amount: 'not-a-number' },
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    setDocumentReferrer('https://trusted.example.com/checkout');

    const host = initHost(undefined, undefined, { deferInit: true });
    expect(host).not.toBeNull();
    expect((window as unknown as { hostProps?: unknown }).hostProps).toBeDefined();

    expect(() =>
      initHost(
        {
          amount: { schema: prop.number() },
        },
        undefined,
        { deferInit: true }
      )
    ).toThrow('Validation failed: amount: Expected number, got string');
    expect((window as unknown as { hostProps?: unknown }).hostProps).toBeUndefined();
  });

  it('should reject allowlist rechecks when the existing host never verified the consumer origin', () => {
    const inaccessibleConsumerWindow = {
      get location() {
        throw new Error('Cross-origin');
      },
    } as unknown as Window;

    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(inaccessibleConsumerWindow);

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid-unverified-recheck',
      tag: 'secure-component-unverified-recheck',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://trusted.example.com',
      props: {},
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    setDocumentReferrer('');

    const host = initHost(undefined, undefined, { deferInit: true });
    expect(host).not.toBeNull();

    expect(() => initHost({}, 'https://trusted.example.com')).toThrow(
      'Could not verify consumer origin'
    );
    expect((window as unknown as { hostProps?: unknown }).hostProps).toBeUndefined();
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
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    setDocumentReferrer('https://evil.example.com/path');

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
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    setDocumentReferrer('https://evil.example.com/path');

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
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    setDocumentReferrer('https://evil.example.com/path');

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
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    setDocumentReferrer('https://evil.example.com/path');

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
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    setDocumentReferrer('https://evil.example.com/path');

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

  it('should validate initial host props against host prop definitions', () => {
    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(window);

    const payload: WindowNamePayload<Record<string, unknown>> = {
      uid: 'host-uid-invalid-initial-props',
      tag: 'secure-component-invalid-initial-props',
      version: VERSION,
      context: CONTEXT.IFRAME,
      consumerDomain: 'https://trusted.example.com',
      props: { amount: 'not-a-number' },
      exports: VALID_EXPORTS,
    };

    window.name = buildWindowName(payload);
    setDocumentReferrer('https://trusted.example.com/checkout');

    expect(() =>
      initHost(
        {
          amount: { schema: prop.number() },
        },
        undefined,
        { deferInit: true }
      )
    ).toThrow('Validation failed: amount: Expected number, got string');
  });
});
