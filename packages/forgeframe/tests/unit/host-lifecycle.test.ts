import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostComponent, clearHostInstance } from '@/core/host';
import { CONTEXT, EVENT, MESSAGE_NAME, VERSION } from '@/constants';
import type { WindowNamePayload } from '@/types';
import * as helpers from '@/window/helpers';

function createPayload(
  overrides: Partial<WindowNamePayload<Record<string, unknown>>> = {}
): WindowNamePayload<Record<string, unknown>> {
  return {
    uid: 'host-lifecycle-uid',
    tag: 'host-lifecycle-component',
    version: VERSION,
    context: CONTEXT.IFRAME,
    consumerDomain: 'https://consumer.example.com',
    props: { amount: 10 },
    exports: {},
    ...overrides,
  };
}

function createHost({
  payload = createPayload(),
  deferInit = true,
  consumerWindow = window,
}: {
  payload?: WindowNamePayload<Record<string, unknown>>;
  deferInit?: boolean;
  consumerWindow?: Window;
} = {}): HostComponent<Record<string, unknown>> {
  vi
    .spyOn(
      HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
      'resolveConsumerWindow'
    )
    .mockReturnValue(consumerWindow);

  return new HostComponent(payload, {}, undefined, deferInit);
}

afterEach(() => {
  clearHostInstance();
  vi.restoreAllMocks();
  delete (window as unknown as { hostProps?: unknown }).hostProps;
});

describe('Host lifecycle behavior', () => {
  it('should call consumer control channels through hostProps builtins', async () => {
    const consumerWindow = { postMessage: vi.fn() } as unknown as Window;
    const host = createHost({ consumerWindow });

    // Access the internal messenger directly for stable call assertions
    const sendSpy = vi
      .spyOn((host as unknown as { messenger: { send: (...args: unknown[]) => Promise<unknown> } }).messenger, 'send')
      .mockResolvedValue(undefined);

    const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {});

    await host.hostProps.close();
    await host.hostProps.focus();
    await host.hostProps.resize({ width: 500, height: 300 });
    await host.hostProps.show();
    await host.hostProps.hide();
    await host.hostProps.onError(new Error('host-side error'));
    await host.hostProps.export({ ready: true });
    await host.hostProps.consumer.export({ ping: true });

    expect(sendSpy).toHaveBeenCalledWith(
      consumerWindow,
      'https://consumer.example.com',
      MESSAGE_NAME.CLOSE,
      {}
    );
    expect(sendSpy).toHaveBeenCalledWith(
      consumerWindow,
      'https://consumer.example.com',
      MESSAGE_NAME.FOCUS,
      {}
    );
    expect(sendSpy).toHaveBeenCalledWith(
      consumerWindow,
      'https://consumer.example.com',
      MESSAGE_NAME.RESIZE,
      { width: 500, height: 300 }
    );
    expect(sendSpy).toHaveBeenCalledWith(
      consumerWindow,
      'https://consumer.example.com',
      MESSAGE_NAME.SHOW,
      {}
    );
    expect(sendSpy).toHaveBeenCalledWith(
      consumerWindow,
      'https://consumer.example.com',
      MESSAGE_NAME.HIDE,
      {}
    );
    expect(sendSpy).toHaveBeenCalledWith(
      consumerWindow,
      'https://consumer.example.com',
      MESSAGE_NAME.ERROR,
      expect.objectContaining({ message: 'host-side error' })
    );
    expect(sendSpy).toHaveBeenCalledWith(
      consumerWindow,
      'https://consumer.example.com',
      MESSAGE_NAME.EXPORT,
      { ready: true }
    );
    expect(sendSpy).toHaveBeenCalledWith(
      consumerWindow,
      'https://consumer.example.com',
      MESSAGE_NAME.CONSUMER_EXPORT,
      { ping: true }
    );
    expect(focusSpy).toHaveBeenCalled();
  });

  it('should apply PROPS updates to hostProps and notify subscribers', () => {
    const host = createHost();
    const propsHandler = (
      (host as unknown as { messenger: { handlers: Map<string, (data: unknown) => unknown> } })
        .messenger.handlers
    ).get(MESSAGE_NAME.PROPS);
    const initialConsumerProps = host.hostProps.consumer.props;

    expect(propsHandler).toBeDefined();

    const subscriber = vi.fn();
    host.hostProps.onProps(subscriber);

    const result = propsHandler!({ amount: 42 });

    expect(result).toEqual({ success: true });
    expect(host.hostProps.amount).toBe(42);
    expect(host.hostProps.consumer.props).toEqual({ amount: 42 });
    expect(host.hostProps.consumer.props).not.toBe(initialConsumerProps);
    expect(
      (host as unknown as { consumerProps: Record<string, unknown> }).consumerProps
    ).toBe(host.hostProps.consumer.props);
    expect(subscriber).toHaveBeenCalledWith({ amount: 42 });
  });

  it('should clear stale hostProps keys when omitted from a later PROPS payload', () => {
    const host = createHost();
    const propsHandler = (
      (host as unknown as { messenger: { handlers: Map<string, (data: unknown) => unknown> } })
        .messenger.handlers
    ).get(MESSAGE_NAME.PROPS);

    expect(propsHandler).toBeDefined();

    const first = propsHandler!({ amount: 42, currency: 'USD' });
    const second = propsHandler!({ amount: 42 });

    expect(first).toEqual({ success: true });
    expect(second).toEqual({ success: true });
    expect(host.hostProps.amount).toBe(42);
    expect('currency' in (host.hostProps as Record<string, unknown>)).toBe(false);
    expect(host.hostProps.consumer.props).toEqual({ amount: 42 });
  });

  it('should isolate failing props subscribers and continue notifying others', () => {
    const host = createHost();
    const propsHandler = (
      (host as unknown as { messenger: { handlers: Map<string, (data: unknown) => unknown> } })
        .messenger.handlers
    ).get(MESSAGE_NAME.PROPS);

    expect(propsHandler).toBeDefined();

    const throwingSubscriber = vi.fn(() => {
      throw new Error('subscriber failed');
    });
    const healthySubscriber = vi.fn();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    host.hostProps.onProps(throwingSubscriber);
    host.hostProps.onProps(healthySubscriber);

    const result = propsHandler!({ amount: 77 });

    expect(result).toEqual({ success: true });
    expect(throwingSubscriber).toHaveBeenCalled();
    expect(healthySubscriber).toHaveBeenCalledWith({ amount: 77 });
    expect(consoleSpy).toHaveBeenCalledWith('Error in props handler:', expect.any(Error));
  });

  it('should emit host error and rethrow when props deserialization fails', () => {
    const host = createHost();
    const propsHandler = (
      (host as unknown as { messenger: { handlers: Map<string, (data: unknown) => unknown> } })
        .messenger.handlers
    ).get(MESSAGE_NAME.PROPS);

    expect(propsHandler).toBeDefined();

    const emitSpy = vi.spyOn(host.event, 'emit');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => propsHandler!(circular)).toThrow('Circular reference detected in serialized props');
    expect(emitSpy).toHaveBeenCalledWith(EVENT.ERROR, expect.any(Error));
    expect(consoleSpy).toHaveBeenCalledWith('Error deserializing props:', expect.any(Error));
  });

  it('should resolve consumer window from iframe consumer when available', () => {
    const consumerWindow = { postMessage: vi.fn() } as unknown as Window;
    vi.spyOn(helpers, 'isIframe').mockReturnValue(true);
    vi.spyOn(helpers, 'getConsumer').mockReturnValue(consumerWindow);
    vi.spyOn(helpers, 'isPopup').mockReturnValue(false);

    const host = new HostComponent(createPayload(), {}, undefined, true);
    expect(host.hostProps.getConsumer()).toBe(consumerWindow);
  });

  it('should resolve consumer window from popup opener when available', () => {
    const openerWindow = { postMessage: vi.fn() } as unknown as Window;
    vi.spyOn(helpers, 'isIframe').mockReturnValue(false);
    vi.spyOn(helpers, 'isPopup').mockReturnValue(true);
    vi.spyOn(helpers, 'getOpener').mockReturnValue(openerWindow);

    const host = new HostComponent(createPayload(), {}, undefined, true);
    expect(host.hostProps.getConsumer()).toBe(openerWindow);
  });

  it('should throw when no consumer window can be resolved', () => {
    vi.spyOn(helpers, 'isIframe').mockReturnValue(false);
    vi.spyOn(helpers, 'isPopup').mockReturnValue(false);

    expect(() => new HostComponent(createPayload(), {}, undefined, true)).toThrow(
      'Could not resolve consumer window'
    );
  });
});
