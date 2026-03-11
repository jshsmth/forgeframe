/**
 * Unit tests for `@/core/host/transport`.
 *
 * Covers trusted-domain updates, deferred init scheduling guards, init failure
 * normalization, props handler filtering, and idempotent teardown behavior.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT, MESSAGE_NAME } from '@/constants';
import { EventEmitter } from '@/events/emitter';
import { HostTransport } from '@/core/host/transport';
import type { HostTransportOptions } from '@/core/host/types';

type PropsHandlerSource = {
  uid: string;
  domain: string;
  window: Window;
};

const createdTransports: HostTransport[] = [];

function createTransport({
  uid = 'host-transport-uid',
  tag = 'host-transport-component',
  consumerDomain = 'https://consumer.example.com',
  getConsumerDomain,
  deferInit = true,
  consumerWindow = { postMessage: vi.fn() } as unknown as Window,
}: Partial<HostTransportOptions> = {}) {
  const event = new EventEmitter();
  const options: HostTransportOptions = {
    uid,
    tag,
    event,
    consumerWindow,
    consumerDomain,
    getConsumerDomain: getConsumerDomain ?? (() => consumerDomain),
    deferInit,
  };

  const transport = new HostTransport(options);
  createdTransports.push(transport);

  return { transport, event, consumerWindow };
}

function getPropsHandler(transport: HostTransport) {
  return (
    (
      transport.messenger as unknown as {
        handlers: Map<
          string,
          (data: unknown, source: PropsHandlerSource) => unknown
        >;
      }
    ).handlers
  ).get(MESSAGE_NAME.PROPS);
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  while (createdTransports.length > 0) {
    createdTransports.pop()!.destroy();
  }
  vi.restoreAllMocks();
});

describe('HostTransport', () => {
  it('should reject untrusted prop sources and apply serialized props for the consumer source', () => {
    const { transport, consumerWindow } = createTransport();
    const isConsumerSource = vi.fn((source: PropsHandlerSource) => source.window === consumerWindow);
    const applySerializedProps = vi.fn(() => ({ success: true as const }));

    transport.registerPropsHandler({
      isConsumerSource,
      applySerializedProps,
    });

    const handler = getPropsHandler(transport);
    const foreignWindow = { postMessage: vi.fn() } as unknown as Window;
    const payload = { amount: 42 };

    expect(
      handler?.(payload, {
        uid: 'foreign',
        domain: 'https://evil.example.com',
        window: foreignWindow,
      })
    ).toEqual({ success: false });
    expect(applySerializedProps).not.toHaveBeenCalled();

    expect(
      handler?.(payload, {
        uid: 'trusted',
        domain: 'https://consumer.example.com',
        window: consumerWindow,
      })
    ).toEqual({ success: true });
    expect(applySerializedProps).toHaveBeenCalledWith(payload);
  });

  it('should update trusted consumer domains only when the previous domain changes', () => {
    const { transport } = createTransport();
    const removeSpy = vi.spyOn(transport.messenger, 'removeTrustedDomain');
    const addSpy = vi.spyOn(transport.messenger, 'addTrustedDomain');

    transport.updateTrustedConsumerDomain('', 'https://next.example.com');
    transport.updateTrustedConsumerDomain(
      'https://same.example.com',
      'https://same.example.com'
    );

    expect(removeSpy).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();

    transport.updateTrustedConsumerDomain(
      'https://old.example.com',
      'https://new.example.com'
    );

    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith('https://old.example.com');
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy).toHaveBeenCalledWith('https://new.example.com');
  });

  it('should schedule deferred init once and avoid resending after init has flushed', async () => {
    const { transport, consumerWindow } = createTransport({ deferInit: true });
    const sendSpy = vi
      .spyOn(transport.messenger, 'send')
      .mockResolvedValue(undefined);

    transport.handleHostPropsAccess();
    transport.handleHostPropsAccess();

    await flushMicrotasks();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      consumerWindow,
      'https://consumer.example.com',
      MESSAGE_NAME.INIT,
      {
        uid: 'host-transport-uid',
        tag: 'host-transport-component',
      }
    );

    transport.handleHostPropsAccess();
    await flushMicrotasks();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(transport.getInitError()).toBeNull();
  });

  it('should not schedule deferred init when deferInit is disabled or after destroy', async () => {
    const immediate = createTransport({ deferInit: false });
    const immediateSendSpy = vi
      .spyOn(immediate.transport.messenger, 'send')
      .mockResolvedValue(undefined);

    immediate.transport.handleHostPropsAccess();
    await flushMicrotasks();

    expect(immediateSendSpy).not.toHaveBeenCalled();

    const destroyed = createTransport({ deferInit: true });
    const destroyedSendSpy = vi
      .spyOn(destroyed.transport.messenger, 'send')
      .mockResolvedValue(undefined);

    destroyed.transport.handleHostPropsAccess();
    destroyed.transport.destroy();

    await flushMicrotasks();

    expect(destroyedSendSpy).not.toHaveBeenCalled();
  });

  it('should normalize non-Error init failures, emit lifecycle errors, and log the original value', async () => {
    const { transport, event } = createTransport();
    const sendSpy = vi
      .spyOn(transport.messenger, 'send')
      .mockRejectedValue('init send failed');
    const emitSpy = vi.spyOn(event, 'emit');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    transport.flushInit();
    await flushMicrotasks();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(transport.getInitError()).toBeInstanceOf(Error);
    expect(transport.getInitError()?.message).toBe('init send failed');
    expect(emitSpy).toHaveBeenCalledWith(
      EVENT.ERROR,
      expect.objectContaining({
        type: 'init_failed',
        message: 'Failed to initialize host component: init send failed',
        error: expect.any(Error),
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to send init message:',
      'init send failed'
    );
  });

  it('should return sibling results from the messenger and fall back to an empty array', async () => {
    let activeDomain = 'https://consumer.example.com';
    const { transport, consumerWindow } = createTransport({
      getConsumerDomain: () => activeDomain,
    });
    const sendSpy = vi.spyOn(transport.messenger, 'send');

    sendSpy.mockResolvedValueOnce([
      { uid: 'peer-1', tag: 'host-transport-component', open: true },
    ]);

    await expect(
      transport.getPeerInstances({ onlyOpen: true })
    ).resolves.toEqual([
      { uid: 'peer-1', tag: 'host-transport-component', open: true },
    ]);

    expect(sendSpy).toHaveBeenLastCalledWith(
      consumerWindow,
      'https://consumer.example.com',
      MESSAGE_NAME.GET_SIBLINGS,
      {
        uid: 'host-transport-uid',
        tag: 'host-transport-component',
        options: { onlyOpen: true },
      }
    );

    activeDomain = 'https://updated.example.com';
    sendSpy.mockResolvedValueOnce(undefined);

    await expect(transport.getPeerInstances()).resolves.toEqual([]);
    expect(sendSpy).toHaveBeenLastCalledWith(
      consumerWindow,
      'https://updated.example.com',
      MESSAGE_NAME.GET_SIBLINGS,
      {
        uid: 'host-transport-uid',
        tag: 'host-transport-component',
        options: undefined,
      }
    );
  });

  it('should destroy the messenger and bridge only once', () => {
    const { transport } = createTransport();
    const messengerDestroySpy = vi.spyOn(transport.messenger, 'destroy');
    const bridgeDestroySpy = vi.spyOn(transport.bridge, 'destroy');

    transport.destroy();
    transport.destroy();

    expect(messengerDestroySpy).toHaveBeenCalledTimes(1);
    expect(bridgeDestroySpy).toHaveBeenCalledTimes(1);
  });
});
