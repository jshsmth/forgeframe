import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HostComponent,
  clearHostInstance,
  getHost,
  initHost,
  isEmbedded,
} from '@/core/host';
import { CONTEXT, EVENT, MESSAGE_NAME, VERSION } from '@/constants';
import { buildWindowName } from '@/window/name-payload';
import type { HostComponentRef, WindowNamePayload } from '@/types';
import * as namePayload from '@/window/name-payload';

function createPayload(
  overrides: Partial<WindowNamePayload<Record<string, unknown>>> = {}
): WindowNamePayload<Record<string, unknown>> {
  return {
    uid: 'host-internal-uid',
    tag: 'host-internal-component',
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

describe('Host internal branches', () => {
  it('should flush init in constructor when deferInit is false', () => {
    const sendInitSpy = vi
      .spyOn(
        HostComponent.prototype as unknown as {
          sendInit: () => Promise<void>;
        },
        'sendInit'
      )
      .mockResolvedValue(undefined);

    createHost({ deferInit: false });

    expect(sendInitSpy).toHaveBeenCalledTimes(1);
  });

  it('should skip deferred init scheduling when already scheduled', async () => {
    const host = createHost();
    const flushInitSpy = vi.spyOn(
      host as unknown as { flushInit: () => void },
      'flushInit'
    );

    (
      host as unknown as {
        deferredInitFlushScheduled: boolean;
      }
    ).deferredInitFlushScheduled = true;
    (
      host as unknown as {
        scheduleDeferredInitFlush: () => void;
      }
    ).scheduleDeferredInitFlush();

    await Promise.resolve();
    expect(flushInitSpy).not.toHaveBeenCalled();
  });

  it('should update internal hostProps when window.hostProps is set', () => {
    const host = createHost();
    const replacement = {
      ...host.hostProps,
      amount: 77,
    };

    (
      window as unknown as {
        hostProps: typeof replacement;
      }
    ).hostProps = replacement;

    expect(host.getProps()).toBe(replacement);
    expect(host.getProps().amount).toBe(77);
  });

  it('should fall back to direct hostProps assignment when defineProperty fails', () => {
    const originalDefineProperty = Object.defineProperty;
    vi.spyOn(Object, 'defineProperty').mockImplementation((obj, key, attrs) => {
      if (obj === window && key === 'hostProps') {
        throw new Error('Cannot define hostProps');
      }
      return originalDefineProperty(obj, key, attrs as PropertyDescriptor);
    });

    const host = createHost();
    const exposedProps = (window as unknown as { hostProps?: unknown }).hostProps;

    expect(exposedProps).toBeDefined();
    expect(exposedProps).toBe(host.hostProps);
  });

  it('should capture init failures and expose init error state', async () => {
    const host = createHost();
    const error = new Error('init send failed');
    const sendSpy = vi
      .spyOn(
        (
          host as unknown as {
            messenger: { send: (...args: unknown[]) => Promise<unknown> };
          }
        ).messenger,
        'send'
      )
      .mockRejectedValue(error);
    const eventSpy = vi.spyOn(host.event, 'emit');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    host.flushInit();
    await Promise.resolve();

    expect(sendSpy).toHaveBeenCalledWith(
      window,
      'https://consumer.example.com',
      MESSAGE_NAME.INIT,
      { uid: 'host-internal-uid', tag: 'host-internal-component' }
    );
    expect(eventSpy).toHaveBeenCalledWith(
      EVENT.ERROR,
      expect.objectContaining({
        type: 'init_failed',
        error,
      })
    );
    expect(host.getInitError()).toBe(error);
    expect(consoleSpy).toHaveBeenCalledWith('Failed to send init message:', error);
  });

  it('should unsubscribe onProps handlers when cancel is called', () => {
    const host = createHost();
    const propsHandler = (
      (host as unknown as { messenger: { handlers: Map<string, (data: unknown) => unknown> } })
        .messenger.handlers
    ).get(MESSAGE_NAME.PROPS);
    const onPropsSpy = vi.fn();

    const subscription = host.hostProps.onProps(onPropsSpy);
    subscription.cancel();
    propsHandler!({ amount: 50 });

    expect(onPropsSpy).not.toHaveBeenCalled();
  });

  it('should return an empty siblings array when messenger responds with undefined', async () => {
    const host = createHost();
    const sendSpy = vi
      .spyOn(
        (
          host as unknown as {
            messenger: { send: (...args: unknown[]) => Promise<unknown> };
          }
        ).messenger,
        'send'
      )
      .mockResolvedValue(undefined);

    const siblings = await host.hostProps.getPeerInstances({ onlyOpen: true });

    expect(siblings).toEqual([]);
    expect(sendSpy).toHaveBeenCalledWith(
      window,
      'https://consumer.example.com',
      MESSAGE_NAME.GET_SIBLINGS,
      {
        uid: 'host-internal-uid',
        tag: 'host-internal-component',
        options: { onlyOpen: true },
      }
    );
  });

  it('should warn and skip nested components that fail creation', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invalidChildren: Record<string, HostComponentRef> = {
      BrokenChild: {
        tag: 'InvalidTag',
        url: 'https://child.example.com',
      },
    };

    const host = createHost({
      payload: createPayload({ children: invalidChildren }),
    });

    expect(host.hostProps.children).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to create nested component "BrokenChild":',
      expect.any(Error)
    );
  });

  it('should ignore repeated destroy calls after first cleanup', () => {
    const host = createHost();
    const messengerDestroySpy = vi.spyOn(
      (
        host as unknown as {
          messenger: { destroy: () => void };
        }
      ).messenger,
      'destroy'
    );
    const bridgeDestroySpy = vi.spyOn(
      (
        host as unknown as {
          bridge: { destroy: () => void };
        }
      ).bridge,
      'destroy'
    );

    host.destroy();
    host.destroy();

    expect(messengerDestroySpy).toHaveBeenCalledTimes(1);
    expect(bridgeDestroySpy).toHaveBeenCalledTimes(1);
  });

  it('should return null when initHost is called outside ForgeFrame context', () => {
    vi.spyOn(namePayload, 'isForgeFrameWindow').mockReturnValue(false);

    const host = initHost();

    expect(host).toBeNull();
  });

  it('should log and return null when ForgeFrame payload parsing fails', () => {
    vi.spyOn(namePayload, 'isForgeFrameWindow').mockReturnValue(true);
    vi.spyOn(namePayload, 'getInitialPayload').mockReturnValue(null);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const host = initHost();

    expect(host).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to parse ForgeFrame payload from window.name'
    );
  });

  it('should expose active instance through getHost()', () => {
    const payload = createPayload({
      uid: 'get-host-uid',
      tag: 'get-host-component',
    });
    window.name = buildWindowName(payload);
    vi
      .spyOn(
        HostComponent.prototype as unknown as { resolveConsumerWindow: () => Window },
        'resolveConsumerWindow'
      )
      .mockReturnValue(window);
    vi.spyOn(namePayload, 'isForgeFrameWindow').mockReturnValue(true);
    vi.spyOn(namePayload, 'getInitialPayload').mockReturnValue(payload);

    const host = initHost(undefined, undefined, { deferInit: true });

    expect(host).not.toBeNull();
    expect(getHost()).toBe(host);
  });

  it('should delegate isEmbedded() to ForgeFrame window detection', () => {
    vi.spyOn(namePayload, 'isForgeFrameWindow').mockReturnValue(true);
    expect(isEmbedded()).toBe(true);
  });
});
