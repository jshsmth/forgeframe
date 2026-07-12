/**
 * Lifecycle-focused tests for `@/core/consumer`.
 *
 * Covers host handshake timing, control message handling, open/render guards, callback isolation, and updateProps validation paths.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageHandler } from '@/communication/messenger';
import {
  createRequestMessage,
  serializeMessage,
} from '@/communication/protocol';
import { ConsumerComponent } from '@/core/consumer';
import { clearComponents, create } from '@/core/component';
import { CONTEXT, EVENT, MESSAGE_NAME } from '@/constants';
import { prop } from '@/props/prop';
import * as popupRender from '@/render/popup';
import * as templateRender from '@/render/templates';

const createdConsumers: Array<ConsumerComponent<Record<string, unknown>>> = [];
let dispatchedMessageCount = 0;

type HandlerSource = Parameters<MessageHandler>[1];
type DirectHandler = (data: unknown, source?: HandlerSource) => unknown;
type ConsumerInternals = {
  transport: {
    hostWindow: Window | null;
    openedHostDomain: string | null;
    hostInitialized: boolean;
    messenger: {
      handlers: Map<string, DirectHandler>;
      send: (...args: unknown[]) => Promise<unknown>;
    };
  };
  renderer: {
    context: string;
    container: HTMLElement | null;
    iframe: HTMLIFrameElement | null;
  };
  propsPipeline: {
    props: Record<string, unknown>;
  };
  waitForHost: () => Promise<void>;
  open: () => Promise<void>;
  prerender: () => Promise<void>;
  destroy: () => Promise<void>;
  buildWindowName: () => string;
  buildUrl: () => string;
  buildBodyParams: () => URLSearchParams;
  rendered: boolean;
};

function getInternals(
  component: ConsumerComponent<Record<string, unknown>>
): ConsumerInternals {
  return component as unknown as ConsumerInternals;
}

/**
 * Creates a consumer instance and tracks it for deterministic lifecycle cleanup.
 */
function createConsumer(
  options: Record<string, unknown> = {},
  props: Record<string, unknown> = {}
): ConsumerComponent<Record<string, unknown>> {
  const consumer = new ConsumerComponent<Record<string, unknown>>(
    {
      tag: 'consumer-lifecycle-component',
      url: 'https://host.example.com/widget',
      ...options,
    } as never,
    props
  );
  createdConsumers.push(consumer);
  return consumer;
}

/**
 * Reads the component's messenger handler map for direct handler invocation tests.
 */
function getHandlers(
  component: ConsumerComponent<Record<string, unknown>>
): Map<string, DirectHandler> {
  return getInternals(component).transport.messenger.handlers;
}

function createMessageSource(windowRef: Window, domain = 'https://host.example.com'): HandlerSource {
  return {
    uid: 'host-source',
    domain,
    window: windowRef,
  };
}

function dispatchHostMessage(
  name: string,
  sourceWindow: Window,
  options?: {
    data?: unknown;
    origin?: string;
    claimedUid?: string;
  }
): void {
  dispatchedMessageCount += 1;
  const origin = options?.origin ?? 'https://host.example.com';
  const request = createRequestMessage(
    `req-${dispatchedMessageCount}`,
    name,
    options?.data ?? {},
    {
      uid: options?.claimedUid ?? `sender-${dispatchedMessageCount}`,
      domain: origin,
    }
  );

  window.dispatchEvent(
    new MessageEvent('message', {
      data: serializeMessage(request),
      source: sourceWindow,
      origin,
    })
  );
}

async function flushMessages(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function readResponseData(sourceWindow: Window): unknown {
  const calls = (
    sourceWindow as unknown as { postMessage: ReturnType<typeof vi.fn> }
  ).postMessage.mock.calls;
  const lastCall = calls.at(-1);

  if (!lastCall) {
    return undefined;
  }

  return JSON.parse(lastCall[0].slice('forgeframe:'.length)).data;
}

afterEach(async () => {
  for (const consumer of createdConsumers.splice(0)) {
    await consumer.close();
  }
  clearComponents();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('Consumer lifecycle behavior', () => {
  it('should surface waitForHost timeout through onError callback', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const consumer = createConsumer({ timeout: 5 }, { onError });
    const waitForHost = (
      consumer as unknown as {
        waitForHost: () => Promise<void>;
      }
    ).waitForHost;

    const waitPromise = waitForHost.call(consumer);
    const timeoutExpectation = expect(waitPromise).rejects.toThrow(
      'did not initialize within 5ms'
    );
    await vi.advanceTimersByTimeAsync(6);

    await timeoutExpectation;
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should resolve waitForHost when INIT handler runs', async () => {
    vi.useFakeTimers();
    const consumer = createConsumer({ timeout: 50 });
    const internal = getInternals(consumer);
    const waitForHost = internal.waitForHost;
    const hostWindow = { postMessage: vi.fn() } as unknown as Window;
    internal.transport.hostWindow = hostWindow;

    const waitPromise = waitForHost.call(consumer);
    const initHandler = getHandlers(consumer).get(MESSAGE_NAME.INIT);

    expect(initHandler).toBeDefined();
    expect(initHandler!({}, createMessageSource(hostWindow))).toEqual({ success: true });
    await expect(waitPromise).resolves.toBeUndefined();
  });

  it('should resolve waitForHost when INIT arrives before waiting starts', async () => {
    vi.useFakeTimers();
    const consumer = createConsumer({ timeout: 50 });
    const internal = getInternals(consumer);
    const waitForHost = internal.waitForHost;
    const hostWindow = { postMessage: vi.fn() } as unknown as Window;
    internal.transport.hostWindow = hostWindow;
    const initHandler = getHandlers(consumer).get(MESSAGE_NAME.INIT);

    expect(initHandler).toBeDefined();
    expect(initHandler!({}, createMessageSource(hostWindow))).toEqual({ success: true });
    await expect(waitForHost.call(consumer)).resolves.toBeUndefined();
  });

  it('should send sameDomain props after INIT when the loaded host is same-origin', async () => {
    const consumer = createConsumer(
      {
        url: '/widget',
        props: {
          secret: { schema: prop.string(), sameDomain: true },
        },
      },
      { secret: 'same-origin-only' }
    );
    const handlers = getHandlers(consumer);
    const initHandler = handlers.get(MESSAGE_NAME.INIT);

    const internal = getInternals(consumer);
    internal.transport.hostWindow = {
      closed: false,
      postMessage: vi.fn(),
      location: { origin: window.location.origin },
    } as unknown as Window;

    const sendSpy = vi
      .spyOn(internal.transport.messenger, 'send')
      .mockResolvedValue(undefined);

    expect(initHandler).toBeDefined();
    expect(
      initHandler!(
        {},
        createMessageSource(internal.transport.hostWindow!, window.location.origin)
      )
    ).toEqual({ success: true });
    await Promise.resolve();

    expect(sendSpy).toHaveBeenCalledWith(
      internal.transport.hostWindow,
      window.location.origin,
      MESSAGE_NAME.PROPS,
      expect.objectContaining({ secret: 'same-origin-only' })
    );
  });

  it('should route prop updates to the verified INIT origin after an allowed redirect', async () => {
    const configuredOrigin = 'https://host.example.com';
    const redirectedOrigin = 'https://redirected-host.example.com';
    const consumer = createConsumer(
      {
        domain: [configuredOrigin, redirectedOrigin],
        props: {
          amount: { schema: prop.number(), required: true },
        },
      },
      { amount: 1 }
    );
    const internal = getInternals(consumer);
    const hostWindow = {
      closed: false,
      postMessage: vi.fn(),
    } as unknown as Window;
    const sendSpy = vi
      .spyOn(internal.transport.messenger, 'send')
      .mockResolvedValue(undefined);

    internal.transport.hostWindow = hostWindow;
    internal.transport.openedHostDomain = configuredOrigin;

    dispatchHostMessage(MESSAGE_NAME.INIT, hostWindow, {
      origin: redirectedOrigin,
      claimedUid: consumer.uid,
    });
    await flushMessages();
    await consumer.updateProps({ amount: 2 });

    expect(internal.transport.hostInitialized).toBe(true);
    expect(sendSpy).toHaveBeenCalledWith(
      hostWindow,
      redirectedOrigin,
      MESSAGE_NAME.PROPS,
      expect.objectContaining({ amount: 2 })
    );
  });

  it('should not send sameDomain props after INIT when the loaded host is cross-origin', async () => {
    const consumer = createConsumer(
      {
        props: {
          secret: { schema: prop.string(), sameDomain: true },
        },
      },
      { secret: 'cross-origin-blocked' }
    );
    const handlers = getHandlers(consumer);
    const initHandler = handlers.get(MESSAGE_NAME.INIT);

    const internal = getInternals(consumer);
    internal.transport.hostWindow = {
      closed: false,
      postMessage: vi.fn(),
      location: { origin: 'https://host.example.com' },
    } as unknown as Window;

    const sendSpy = vi
      .spyOn(internal.transport.messenger, 'send')
      .mockResolvedValue(undefined);

    expect(initHandler).toBeDefined();
    expect(initHandler!({}, createMessageSource(internal.transport.hostWindow!))).toEqual({
      success: true,
    });
    await Promise.resolve();

    expect(sendSpy).not.toHaveBeenCalledWith(
      internal.transport.hostWindow,
      expect.anything(),
      MESSAGE_NAME.PROPS,
      expect.anything()
    );
  });

  it('should queue INIT sameDomain sync behind an in-flight props update to preserve function refs', async () => {
    const onReady = vi.fn();
    const consumer = createConsumer(
      {
        url: '/widget',
        props: {
          count: { schema: prop.number(), required: true },
          secret: { schema: prop.string(), sameDomain: true },
          onReady: prop.function<() => void>(),
        },
      },
      {
        count: 1,
        secret: 'same-origin-only',
        onReady,
      }
    );
    const handlers = getHandlers(consumer);
    const initHandler = handlers.get(MESSAGE_NAME.INIT);
    const callHandler = handlers.get(MESSAGE_NAME.CALL);

    const internal = getInternals(consumer);
    internal.transport.hostWindow = {
      closed: false,
      postMessage: vi.fn(),
      location: { origin: window.location.origin },
    } as unknown as Window;

    let releaseFirstSend: (() => void) | null = null;
    const firstSendInFlight = new Promise<void>((resolve) => {
      releaseFirstSend = resolve;
    });
    const sentPayloads: Array<Record<string, unknown>> = [];
    let propsSendCount = 0;

    const sendSpy = vi.spyOn(internal.transport.messenger, 'send').mockImplementation(
      async (_target, _domain, messageName, payload) => {
        if (messageName !== MESSAGE_NAME.PROPS) {
          return undefined;
        }

        propsSendCount += 1;
        sentPayloads.push(payload as Record<string, unknown>);

        if (propsSendCount === 1) {
          await firstSendInFlight;
        }

        return undefined;
      }
    );

    expect(initHandler).toBeDefined();
    expect(callHandler).toBeDefined();
    expect(
      initHandler!(
        {},
        createMessageSource(internal.transport.hostWindow!, window.location.origin)
      )
    ).toEqual({ success: true });
    await Promise.resolve();

    const updatePromise = consumer.updateProps({ count: 2 });

    expect(sendSpy).toHaveBeenCalledTimes(1);

    releaseFirstSend?.();
    await updatePromise;
    await Promise.resolve();

    expect(sendSpy).toHaveBeenCalledTimes(2);

    const latestPayload = sentPayloads[1] as {
      onReady: { __id__: string };
      count: number;
      secret: string;
    };

    expect(latestPayload.count).toBe(2);
    expect(latestPayload.secret).toBe('same-origin-only');
    expect(latestPayload.onReady.__id__).toEqual(expect.any(String));
    await expect(
      callHandler!(
        { id: latestPayload.onReady.__id__, args: [] },
        createMessageSource(internal.transport.hostWindow!, window.location.origin)
      )
    ).resolves.toBe(undefined);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('should ignore spoofed INIT from a different trusted window and accept the opened host window', async () => {
    vi.useFakeTimers();
    const consumer = createConsumer({ timeout: 50 });
    const internal = getInternals(consumer);
    const hostWindow = { postMessage: vi.fn() } as unknown as Window;
    const spoofedWindow = { postMessage: vi.fn() } as unknown as Window;
    internal.transport.hostWindow = hostWindow;

    dispatchHostMessage(MESSAGE_NAME.INIT, spoofedWindow, {
      claimedUid: consumer.uid,
    });
    await flushMessages();

    expect(internal.transport.hostInitialized).toBe(false);
    expect(readResponseData(spoofedWindow)).toEqual({ success: false });

    const waitPromise = internal.waitForHost.call(consumer);
    dispatchHostMessage(MESSAGE_NAME.INIT, hostWindow, {
      claimedUid: consumer.uid,
    });
    await flushMessages();

    expect(readResponseData(hostWindow)).toEqual({ success: true });
    await expect(waitPromise).resolves.toBeUndefined();
  });

  it('should ignore spoofed CLOSE from a different trusted window and accept the opened host window', async () => {
    const consumer = createConsumer();
    const internal = getInternals(consumer);
    const hostWindow = { postMessage: vi.fn() } as unknown as Window;
    const spoofedWindow = { postMessage: vi.fn() } as unknown as Window;
    const originalClose = consumer.close.bind(consumer);
    const closeSpy = vi.spyOn(consumer, 'close').mockResolvedValue(undefined);
    internal.transport.hostWindow = hostWindow;

    dispatchHostMessage(MESSAGE_NAME.CLOSE, spoofedWindow, {
      claimedUid: consumer.uid,
    });
    await flushMessages();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(readResponseData(spoofedWindow)).toEqual({ success: false });

    dispatchHostMessage(MESSAGE_NAME.CLOSE, hostWindow, {
      claimedUid: consumer.uid,
    });
    await flushMessages();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(readResponseData(hostWindow)).toEqual({ success: true });

    closeSpy.mockRestore();
    await originalClose();
  });

  it('should route host control messages to instance methods', async () => {
    const consumer = createConsumer();
    const handlers = getHandlers(consumer);
    const internal = getInternals(consumer);
    const hostWindow = { postMessage: vi.fn() } as unknown as Window;
    internal.transport.hostWindow = hostWindow;

    const closeSpy = vi.spyOn(consumer, 'close').mockResolvedValue(undefined);
    const resizeSpy = vi.spyOn(consumer, 'resize').mockResolvedValue(undefined);
    const focusSpy = vi.spyOn(consumer, 'focus').mockResolvedValue(undefined);
    const showSpy = vi.spyOn(consumer, 'show').mockResolvedValue(undefined);
    const hideSpy = vi.spyOn(consumer, 'hide').mockResolvedValue(undefined);

    await expect(
      handlers.get(MESSAGE_NAME.CLOSE)!({}, createMessageSource(hostWindow))
    ).resolves.toEqual({ success: true });
    await expect(
      handlers.get(MESSAGE_NAME.RESIZE)!({ width: 420, height: 240 }, createMessageSource(hostWindow))
    ).resolves.toEqual({ success: true });
    await expect(
      handlers.get(MESSAGE_NAME.FOCUS)!({}, createMessageSource(hostWindow))
    ).resolves.toEqual({ success: true });
    await expect(
      handlers.get(MESSAGE_NAME.SHOW)!({}, createMessageSource(hostWindow))
    ).resolves.toEqual({ success: true });
    await expect(
      handlers.get(MESSAGE_NAME.HIDE)!({}, createMessageSource(hostWindow))
    ).resolves.toEqual({ success: true });

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(resizeSpy).toHaveBeenCalledWith({ width: 420, height: 240 });
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(showSpy).toHaveBeenCalledTimes(1);
    expect(hideSpy).toHaveBeenCalledTimes(1);
  });

  it('should ignore spoofed ERROR from a different trusted window and accept the opened host window', async () => {
    const onError = vi.fn();
    const consumer = createConsumer({}, { onError });
    const internal = getInternals(consumer);
    const hostWindow = { postMessage: vi.fn() } as unknown as Window;
    const spoofedWindow = { postMessage: vi.fn() } as unknown as Window;
    internal.transport.hostWindow = hostWindow;

    dispatchHostMessage(MESSAGE_NAME.ERROR, spoofedWindow, {
      data: { message: 'spoofed host failed' },
      claimedUid: consumer.uid,
    });
    await flushMessages();

    expect(onError).not.toHaveBeenCalled();
    expect(readResponseData(spoofedWindow)).toEqual({ success: false });

    dispatchHostMessage(MESSAGE_NAME.ERROR, hostWindow, {
      data: { message: 'host failed' },
      claimedUid: consumer.uid,
    });
    await flushMessages();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'host failed' })
    );
    expect(readResponseData(hostWindow)).toEqual({ success: true });
  });

  it('should ignore spoofed EXPORT from a different trusted window and accept the opened host window', async () => {
    const consumer = createConsumer();
    const internal = getInternals(consumer);
    const hostWindow = { postMessage: vi.fn() } as unknown as Window;
    const spoofedWindow = { postMessage: vi.fn() } as unknown as Window;
    internal.transport.hostWindow = hostWindow;

    dispatchHostMessage(MESSAGE_NAME.EXPORT, spoofedWindow, {
      data: { ready: false },
      claimedUid: consumer.uid,
    });
    await flushMessages();

    expect(consumer.exports).toBeUndefined();
    expect(readResponseData(spoofedWindow)).toEqual({ success: false });

    dispatchHostMessage(MESSAGE_NAME.EXPORT, hostWindow, {
      data: { ready: true },
      claimedUid: consumer.uid,
    });
    await flushMessages();

    expect(consumer.exports).toEqual({ ready: true });
    expect(readResponseData(hostWindow)).toEqual({ success: true });
  });

  it('should ignore spoofed CONSUMER_EXPORT from a different trusted window and accept the opened host window', async () => {
    const consumer = createConsumer();
    const internal = getInternals(consumer);
    const hostWindow = { postMessage: vi.fn() } as unknown as Window;
    const spoofedWindow = { postMessage: vi.fn() } as unknown as Window;
    internal.transport.hostWindow = hostWindow;

    dispatchHostMessage(MESSAGE_NAME.CONSUMER_EXPORT, spoofedWindow, {
      data: { token: 'spoofed' },
      claimedUid: consumer.uid,
    });
    await flushMessages();

    expect(consumer.consumerExports).toBeUndefined();
    expect(readResponseData(spoofedWindow)).toEqual({ success: false });

    dispatchHostMessage(MESSAGE_NAME.CONSUMER_EXPORT, hostWindow, {
      data: { token: 'abc' },
      claimedUid: consumer.uid,
    });
    await flushMessages();

    expect(consumer.consumerExports).toEqual({ token: 'abc' });
    expect(readResponseData(hostWindow)).toEqual({ success: true });
  });

  it('should ignore spoofed GET_SIBLINGS from a different trusted window and accept the opened host window', async () => {
    const PeerComponent = create<{ amount: number }>({
      tag: 'peer-siblings-component',
      url: 'https://host.example.com/peer',
      props: {
        amount: { schema: prop.number(), required: true },
      },
    });

    const instanceA = PeerComponent({ amount: 1 });
    const instanceB = PeerComponent({ amount: 2 });
    instanceA.exports = { id: 'a' };
    instanceB.exports = { id: 'b' };

    const consumer = createConsumer();
    const internal = getInternals(consumer);
    const hostWindow = { postMessage: vi.fn() } as unknown as Window;
    const spoofedWindow = { postMessage: vi.fn() } as unknown as Window;
    internal.transport.hostWindow = hostWindow;

    dispatchHostMessage(MESSAGE_NAME.GET_SIBLINGS, spoofedWindow, {
      data: {
        uid: instanceA.uid,
        tag: 'peer-siblings-component',
      },
      claimedUid: consumer.uid,
    });
    await flushMessages();

    expect(readResponseData(spoofedWindow)).toEqual({ success: false });

    dispatchHostMessage(MESSAGE_NAME.GET_SIBLINGS, hostWindow, {
      data: {
        uid: instanceA.uid,
        tag: 'peer-siblings-component',
      },
      claimedUid: consumer.uid,
    });
    await flushMessages();

    expect(readResponseData(hostWindow)).toEqual([
      {
        uid: instanceB.uid,
        tag: 'peer-siblings-component',
        exports: { id: 'b' },
      },
    ]);
  });

  it('should throw when open is called in iframe context without prerender iframe', async () => {
    const consumer = createConsumer();
    getInternals(consumer).renderer.context = CONTEXT.IFRAME;

    await expect(
      (
        consumer as unknown as {
          open: () => Promise<void>;
        }
      ).open()
    ).rejects.toThrow('Iframe not created during prerender');
  });

  it('should destroy instance when render fails during open or init wait', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const openFailure = createConsumer();
    vi.spyOn(
      openFailure as unknown as { prerender: () => Promise<void> },
      'prerender'
    ).mockResolvedValue(undefined);
    vi.spyOn(
      openFailure as unknown as { open: () => Promise<void> },
      'open'
    ).mockRejectedValue(new Error('open failed'));
    const openDestroySpy = vi.spyOn(
      openFailure as unknown as { destroy: () => Promise<void> },
      'destroy'
    );

    await expect(openFailure.render(container)).rejects.toThrow('open failed');
    expect(openDestroySpy).toHaveBeenCalledTimes(1);

    const waitFailure = createConsumer();
    vi.spyOn(
      waitFailure as unknown as { prerender: () => Promise<void> },
      'prerender'
    ).mockResolvedValue(undefined);
    vi.spyOn(
      waitFailure as unknown as { open: () => Promise<void> },
      'open'
    ).mockResolvedValue(undefined);
    vi.spyOn(
      waitFailure as unknown as { waitForHost: () => Promise<void> },
      'waitForHost'
    ).mockRejectedValue(new Error('init failed'));
    const waitDestroySpy = vi.spyOn(
      waitFailure as unknown as { destroy: () => Promise<void> },
      'destroy'
    );

    await expect(waitFailure.render(container)).rejects.toThrow('init failed');
    expect(waitDestroySpy).toHaveBeenCalledTimes(1);
  });

  it('should swap and reveal iframe even when prerender template returns null', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const consumer = createConsumer({
      prerenderTemplate: () => null,
    });

    vi.spyOn(
      consumer as unknown as { open: () => Promise<void> },
      'open'
    ).mockResolvedValue(undefined);
    vi.spyOn(
      consumer as unknown as { waitForHost: () => Promise<void> },
      'waitForHost'
    ).mockResolvedValue(undefined);

    const swapSpy = vi
      .spyOn(templateRender, 'swapPrerenderContent')
      .mockResolvedValue(undefined);

    await consumer.render(container);

    expect(swapSpy).toHaveBeenCalledTimes(1);
    expect(swapSpy).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      null,
      expect.any(HTMLIFrameElement)
    );
  });

  it('should route popup close watcher through close()', async () => {
    const hostWindow = {
      closed: false,
      focus: vi.fn(),
      close: vi.fn(),
    } as unknown as Window;

    const closeCallbackRef: { current: (() => void) | null } = { current: null };
    vi.spyOn(popupRender, 'openPopup').mockReturnValue(hostWindow);
    vi.spyOn(popupRender, 'watchPopupClose').mockImplementation((_win, callback) => {
      closeCallbackRef.current = callback;
      return () => undefined;
    });

    const consumer = createConsumer({
      defaultContext: CONTEXT.POPUP,
    });
    const closeSpy = vi.spyOn(consumer, 'close');

    const internal = getInternals(consumer);
    internal.renderer.context = CONTEXT.POPUP;
    internal.renderer.container = document.createElement('div');

    vi.spyOn(
      consumer as unknown as { buildWindowName: () => string },
      'buildWindowName'
    ).mockReturnValue('forgeframe-test-window');
    vi.spyOn(
      consumer as unknown as { buildUrl: () => string },
      'buildUrl'
    ).mockReturnValue('https://host.example.com/widget');
    vi.spyOn(
      consumer as unknown as { buildBodyParams: () => URLSearchParams },
      'buildBodyParams'
    ).mockReturnValue(new URLSearchParams());

    await (
      consumer as unknown as {
        open: () => Promise<void>;
      }
    ).open();

    expect(closeCallbackRef.current).toBeTypeOf('function');
    closeCallbackRef.current?.();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('should invoke onClose before onDestroy when closing', async () => {
    const lifecycle: string[] = [];
    const onClose = vi.fn(() => {
      lifecycle.push('close');
    });
    const onDestroy = vi.fn(() => {
      lifecycle.push('destroy');
    });
    const consumer = createConsumer({}, { onClose, onDestroy });

    await consumer.close();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(lifecycle).toEqual(['close', 'destroy']);
  });

  it('should enforce render guards before opening', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const destroyedInstance = createConsumer();
    await (
      destroyedInstance as unknown as {
        destroy: () => Promise<void>;
      }
    ).destroy();
    await expect(destroyedInstance.render(container)).rejects.toThrow(
      'Component has been destroyed'
    );

    const renderedInstance = createConsumer();
    getInternals(renderedInstance).rendered = true;
    await expect(renderedInstance.render(container)).rejects.toThrow(
      'Component has already been rendered'
    );

    const unrenderedInstance = createConsumer();
    await expect(unrenderedInstance.render()).rejects.toThrow(
      'Container is required for rendering'
    );
    await expect(unrenderedInstance.render('#missing-container')).rejects.toThrow(
      'Container "#missing-container" not found'
    );
  });

  it('should share one in-flight render and reject prop mutation during bootstrap', async () => {
    const consumer = createConsumer();
    const internal = getInternals(consumer);
    const container = document.createElement('div');
    let releasePrerender: (() => void) | undefined;

    const prerenderSpy = vi.spyOn(internal, 'prerender').mockImplementation(
      () => new Promise<void>((resolve) => {
        releasePrerender = resolve;
      })
    );
    const openSpy = vi.spyOn(internal, 'open').mockResolvedValue(undefined);
    vi.spyOn(internal, 'waitForHost').mockResolvedValue(undefined);

    const firstRender = consumer.render(container);
    const secondRender = consumer.render(container);

    await expect(consumer.updateProps({ value: 'racing' })).rejects.toThrow(
      'Cannot update props while the component is rendering'
    );
    expect(prerenderSpy).toHaveBeenCalledTimes(1);

    releasePrerender?.();
    await expect(Promise.all([firstRender, secondRender])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('should establish the render lock before lifecycle callbacks can re-enter', async () => {
    const consumer = createConsumer();
    const internal = getInternals(consumer);
    const container = document.createElement('div');
    let releasePrerender: (() => void) | undefined;
    let reentrantRender: Promise<void> | undefined;
    let propUpdateResult: Promise<string> | undefined;

    const prerenderGate = new Promise<void>((resolve) => {
      releasePrerender = resolve;
    });
    const prerenderSpy = vi
      .spyOn(internal, 'prerender')
      .mockReturnValue(prerenderGate);
    const openSpy = vi.spyOn(internal, 'open').mockResolvedValue(undefined);
    vi.spyOn(internal, 'waitForHost').mockResolvedValue(undefined);

    consumer.event.once(EVENT.PRERENDER, () => {
      reentrantRender = consumer.render(container);
      propUpdateResult = consumer.updateProps({ value: 'racing' }).then(
        () => 'resolved',
        (error: Error) => error.message
      );
    });

    const firstRender = consumer.render(container);

    await vi.waitFor(() => {
      expect(reentrantRender).toBeDefined();
      expect(propUpdateResult).toBeDefined();
    });
    await expect(propUpdateResult).resolves.toBe(
      'Cannot update props while the component is rendering'
    );
    expect(prerenderSpy).toHaveBeenCalledTimes(1);

    releasePrerender?.();
    await expect(
      Promise.all([firstRender, reentrantRender as Promise<void>])
    ).resolves.toEqual([undefined, undefined]);
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('should isolate callback failures in callPropCallback', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const syncFailureConsumer = createConsumer({}, {
      onFocus: () => {
        throw new Error('sync callback failure');
      },
    });
    await syncFailureConsumer.focus();

    const asyncFailureConsumer = createConsumer({}, {
      onFocus: () => Promise.reject(new Error('async callback failure')),
    });
    await asyncFailureConsumer.focus();
    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in onFocus callback:',
      expect.any(Error)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in async onFocus callback:',
      expect.any(Error)
    );
  });

  it('should reject updateProps when a required prop becomes undefined', async () => {
    const consumer = createConsumer(
      {
        props: {
          amount: { schema: prop.number(), required: true },
        },
      },
      { amount: 1 }
    );

    await expect(consumer.updateProps({ amount: undefined })).rejects.toThrow(
      'Prop "amount" is required but was not provided'
    );
  });

  it('should reject updateProps when a prop violates its schema', async () => {
    const consumer = createConsumer(
      {
        props: {
          amount: { schema: prop.number(), required: true },
        },
      },
      { amount: 1 }
    );

    await expect(consumer.updateProps({ amount: 'two' })).rejects.toThrow(
      'Validation failed: amount'
    );
  });

  it('should not run custom validation, mutate props, or send props when built-in validation fails', async () => {
    const validate = vi.fn();
    const consumer = createConsumer(
      {
        props: {
          amount: { schema: prop.number(), required: true },
        },
        validate,
      },
      { amount: 1 }
    );

    const hostWindow = {
      closed: false,
      postMessage: vi.fn(),
      location: { origin: 'https://host.example.com' },
    } as unknown as Window;
    const internal = getInternals(consumer);
    internal.transport.hostWindow = hostWindow;
    internal.transport.openedHostDomain = 'https://host.example.com';

    const previousProps = { ...internal.propsPipeline.props };
    const sendSpy = vi
      .spyOn(internal.transport.messenger, 'send')
      .mockResolvedValue(undefined);

    await expect(consumer.updateProps({ amount: undefined })).rejects.toThrow(
      'Prop "amount" is required but was not provided'
    );

    expect(validate).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(internal.propsPipeline.props).toEqual(previousProps);
  });

  it('should send updated props to the opened host domain', async () => {
    const consumer = createConsumer(
      {
        props: {
          amount: { schema: prop.number(), required: true },
        },
      },
      { amount: 1 }
    );

    const hostWindow = {
      closed: false,
      postMessage: vi.fn(),
      location: { origin: 'https://host.example.com' },
    } as unknown as Window;
    const internal = getInternals(consumer);
    internal.transport.hostWindow = hostWindow;
    internal.transport.openedHostDomain = 'https://host.example.com';

    const sendSpy = vi
      .spyOn(internal.transport.messenger, 'send')
      .mockResolvedValue(undefined);

    await consumer.updateProps({ amount: 2 });

    expect(sendSpy).toHaveBeenCalledWith(
      hostWindow,
      'https://host.example.com',
      MESSAGE_NAME.PROPS,
      expect.objectContaining({ amount: 2 })
    );
  });

  it('should skip props messaging when host window is closed', async () => {
    const consumer = createConsumer(
      {
        props: {
          amount: { schema: prop.number(), required: true },
        },
      },
      { amount: 1 }
    );

    const internal = getInternals(consumer);
    internal.transport.hostWindow = { closed: true } as unknown as Window;
    internal.transport.openedHostDomain = 'https://host.example.com';

    const sendSpy = vi
      .spyOn(internal.transport.messenger, 'send')
      .mockResolvedValue(undefined);

    await consumer.updateProps({ amount: 2 });

    expect(sendSpy).not.toHaveBeenCalled();
  });
});
