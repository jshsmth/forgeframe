/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('@/core/host');
  vi.doUnmock('@/utils/browser');
  vi.doUnmock('@/window/name-payload');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('Component host detection across runtime transitions', () => {
  it('should defer domain validation for relative URLs until a browser can resolve them', async () => {
    const { clearComponents, create } = await import('@/core/component');

    expect(() =>
      create({
        tag: 'relative-node-component',
        url: '/host.html',
        domain: 'https://allowed.example.com',
      })
    ).not.toThrow();

    expect(() =>
      create({
        tag: 'absolute-node-component',
        url: 'https://blocked.example.com/host.html',
        domain: 'https://allowed.example.com',
      })
    ).toThrow(
      'Component URL origin "https://blocked.example.com" is not allowed by the configured domain policy.'
    );

    clearComponents();
  });

  it('should re-evaluate host availability after browser globals appear', async () => {
    let browserAvailable = false;
    let hostDetected = false;

    const mockHostProps = {
      uid: 'late-host-uid',
      tag: 'late-host-component',
      close: vi.fn(),
      focus: vi.fn(),
      resize: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      onProps: vi.fn(),
      onError: vi.fn(),
      getConsumer: vi.fn(),
      getConsumerDomain: vi.fn(),
      export: vi.fn(),
      consumer: { props: {}, export: vi.fn() },
      getPeerInstances: vi.fn(),
    };

    const initHost = vi.fn(() => {
      if (!browserAvailable || !hostDetected) {
        return null;
      }

      return {
        hostProps: mockHostProps,
      };
    });

    vi.doMock('@/utils/browser', () => ({
      hasBrowserWindow: () => browserAvailable,
    }));
    vi.doMock('@/window/name-payload', () => ({
      isHostOfComponent: (tag: string) => hostDetected && tag === 'late-host-component',
    }));
    vi.doMock('@/core/host', () => ({
      getHost: () => null,
      initHost,
    }));

    const { clearComponents, create } = await import('@/core/component');

    const LateHostComponent = create({
      tag: 'late-host-component',
      url: '/host.html',
    });

    expect(LateHostComponent.isHost()).toBe(false);
    expect(LateHostComponent.isEmbedded()).toBe(false);
    expect(LateHostComponent.hostProps).toBeUndefined();

    browserAvailable = true;
    hostDetected = true;

    expect(LateHostComponent.isHost()).toBe(true);
    expect(LateHostComponent.isEmbedded()).toBe(true);
    expect(LateHostComponent.hostProps).toBe(mockHostProps);
    expect(initHost).toHaveBeenCalled();

    clearComponents();
  });

  it('should preserve host state after host props have been initialized', async () => {
    let browserAvailable = false;
    let hostDetected = false;

    const mockHostProps = {
      uid: 'sticky-host-uid',
      tag: 'sticky-host-component',
      close: vi.fn(),
      focus: vi.fn(),
      resize: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      onProps: vi.fn(),
      onError: vi.fn(),
      getConsumer: vi.fn(),
      getConsumerDomain: vi.fn(),
      export: vi.fn(),
      consumer: { props: {}, export: vi.fn() },
      getPeerInstances: vi.fn(),
    };

    const initHost = vi.fn(() => ({
      hostProps: mockHostProps,
    }));

    vi.doMock('@/utils/browser', () => ({
      hasBrowserWindow: () => browserAvailable,
    }));
    vi.doMock('@/window/name-payload', () => ({
      isHostOfComponent: (tag: string) => hostDetected && tag === 'sticky-host-component',
    }));
    vi.doMock('@/core/host', () => ({
      getHost: () => null,
      initHost,
    }));

    const { clearComponents, create } = await import('@/core/component');

    const StickyHostComponent = create({
      tag: 'sticky-host-component',
      url: '/host.html',
    });

    browserAvailable = true;
    hostDetected = true;

    expect(StickyHostComponent.isHost()).toBe(true);
    expect(StickyHostComponent.hostProps).toBe(mockHostProps);

    hostDetected = false;

    expect(StickyHostComponent.isHost()).toBe(true);
    expect(StickyHostComponent.isEmbedded()).toBe(true);
    expect(StickyHostComponent.hostProps).toBe(mockHostProps);
    expect(initHost).toHaveBeenCalledTimes(1);

    clearComponents();
  });

  it('should initialize host state when checking host status after a runtime transition', async () => {
    let browserAvailable = false;
    let hostDetected = false;

    const mockHostProps = {
      uid: 'late-host-uid',
      tag: 'late-host-component',
      close: vi.fn(),
      focus: vi.fn(),
      resize: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      onProps: vi.fn(),
      onError: vi.fn(),
      getConsumer: vi.fn(),
      getConsumerDomain: vi.fn(),
      export: vi.fn(),
      consumer: { props: {}, export: vi.fn() },
      getPeerInstances: vi.fn(),
    };

    const initHost = vi.fn(() => ({
      hostProps: mockHostProps,
    }));

    vi.doMock('@/utils/browser', () => ({
      hasBrowserWindow: () => browserAvailable,
    }));
    vi.doMock('@/window/name-payload', () => ({
      isHostOfComponent: (tag: string) => hostDetected && tag === 'late-host-component',
    }));
    vi.doMock('@/core/host', () => ({
      getHost: () => null,
      initHost,
    }));

    const { clearComponents, create } = await import('@/core/component');

    const LateHostComponent = create({
      tag: 'late-host-component',
      url: '/host.html',
    });

    browserAvailable = true;
    hostDetected = true;

    expect(LateHostComponent.isHost()).toBe(true);
    expect(LateHostComponent.isEmbedded()).toBe(true);
    expect(LateHostComponent.hostProps).toBe(mockHostProps);
    expect(initHost).toHaveBeenCalledTimes(1);

    clearComponents();
  });
});
