/**
 * Branch coverage tests for `@/core/host` internals.
 *
 * Covers deferred init branches, hostProps fallback behavior, init failure capture, and environment guard paths.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Messenger, type MessageHandler } from '@/communication/messenger';
import {
  HostComponent,
  clearHostInstance,
  getHost,
  initHost,
  isEmbedded,
} from '@/core/host';
import * as hostSecurity from '@/core/host/security';
import { CONTEXT, EVENT, MESSAGE_NAME, VERSION } from '@/constants';
import { buildWindowName } from '@/window/name-payload';
import type { ConsumerExports, HostComponentRef, WindowNamePayload } from '@/types';
import * as namePayload from '@/window/name-payload';

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

type HandlerSource = Parameters<MessageHandler>[1];
type DirectHandler = (data: unknown, source: HandlerSource) => unknown;

/**
 * Builds a host window payload with stable defaults for branch-path tests.
 */
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
    exports: VALID_EXPORTS,
    ...overrides,
  };
}

/**
 * Creates a host instance with a controllable consumer window resolver.
 */
function createHost({
  payload = createPayload(),
  deferInit = true,
  consumerWindow = window,
}: {
  payload?: WindowNamePayload<Record<string, unknown>>;
  deferInit?: boolean;
  consumerWindow?: Window;
} = {}): HostComponent<Record<string, unknown>> {
  vi.spyOn(hostSecurity, 'resolveConsumerWindow').mockReturnValue(consumerWindow);

  return new HostComponent(payload, {}, undefined, deferInit);
}

function createMessageSource(
  windowRef: Window,
  domain = 'https://consumer.example.com'
): HandlerSource {
  return {
    uid: 'consumer-source',
    domain,
    window: windowRef,
  };
}

afterEach(() => {
  clearHostInstance();
  vi.restoreAllMocks();
  delete (window as unknown as { hostProps?: unknown }).hostProps;
});

describe('Host branch coverage and edge paths', () => {
  it('should flush init in constructor when deferInit is false', () => {
    const sendSpy = vi
      .spyOn(Messenger.prototype, 'send')
      .mockResolvedValue(undefined);

    createHost({ deferInit: false });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      window,
      window.location.origin,
      MESSAGE_NAME.INIT,
      { uid: 'host-internal-uid', tag: 'host-internal-component' }
    );
  });

  it('should only flush deferred init once when hostProps is accessed repeatedly in the same tick', async () => {
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

    void (window as unknown as { hostProps?: unknown }).hostProps;
    void (window as unknown as { hostProps?: unknown }).hostProps;

    await Promise.resolve();
    expect(sendSpy).toHaveBeenCalledTimes(1);
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
    await Promise.resolve();

    expect(sendSpy).toHaveBeenCalledWith(
      window,
      window.location.origin,
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
      (host as unknown as { messenger: { handlers: Map<string, DirectHandler> } })
        .messenger.handlers
    ).get(MESSAGE_NAME.PROPS);
    const onPropsSpy = vi.fn();

    const subscription = host.hostProps.onProps(onPropsSpy);
    subscription.cancel();
    propsHandler!({ amount: 50 }, createMessageSource(window));

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
      window.location.origin,
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

  it('should fail soft when consumer window cannot be resolved', () => {
    const payload = createPayload();
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    vi.spyOn(namePayload, 'isForgeFrameWindow').mockReturnValue(true);
    vi.spyOn(namePayload, 'getInitialPayload').mockReturnValue(payload);
    vi
      .spyOn(hostSecurity, 'resolveConsumerWindow')
      .mockImplementation(() => {
        throw new Error('Could not resolve consumer window');
      });

    const host = initHost();
    const messageAddCount = addEventListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === 'message'
    ).length;
    const messageRemoveCount = removeEventListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === 'message'
    ).length;

    expect(host).toBeNull();
    expect(getHost()).toBeNull();
    expect(messageAddCount).toBe(0);
    expect(messageRemoveCount).toBe(messageAddCount);
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
    vi.spyOn(hostSecurity, 'resolveConsumerWindow').mockReturnValue(window);
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
