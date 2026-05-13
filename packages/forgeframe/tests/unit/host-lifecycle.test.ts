/**
 * Lifecycle tests for `@/core/host` runtime behavior.
 *
 * Covers consumer control channels, props synchronization/subscriber behavior, and consumer window resolution rules.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageHandler } from '@/communication/messenger';
import { ConsumerComponent } from '@/core/consumer';
import {
  HostComponent,
  clearHostInstance,
  getHostProps,
  initHost,
  isEmbedded,
  isHost,
} from '@/core/host';
import * as hostSecurity from '@/core/host/security';
import { CONTEXT, EVENT, MESSAGE_NAME, VERSION } from '@/constants';
import { prop } from '@/props/prop';
import type { ConsumerExports, WindowNamePayload } from '@/types';
import * as helpers from '@/window/helpers';
import { buildWindowName } from '@/window/name-payload';

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

const originalWindowName = window.name;
const createdConsumers: Array<ConsumerComponent<Record<string, unknown>>> = [];
type HandlerSource = Parameters<MessageHandler>[1];
type DirectHandler = (data: unknown, source: HandlerSource) => unknown;

/**
 * Builds a host window payload with default props and domain metadata.
 */
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
    exports: VALID_EXPORTS,
    ...overrides,
  };
}

/**
 * Creates a host instance while stubbing consumer window resolution behavior.
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
  vi
    .spyOn(hostSecurity, 'resolveConsumerWindow')
    .mockReturnValue(consumerWindow);

  return new HostComponent(payload, {}, undefined, deferInit);
}

/**
 * Creates a consumer instance for transport bootstrap tests.
 */
function createConsumer(
  {
    url = 'https://host.example.com/widget',
    props = {},
  }: {
    url?: string;
    props?: Record<string, unknown>;
  } = {},
  inputProps: Record<string, unknown> = {}
): ConsumerComponent<Record<string, unknown>> {
  const consumer = new ConsumerComponent<Record<string, unknown>>(
    {
      tag: 'host-lifecycle-consumer-component',
      url,
      props,
    } as never,
    inputProps
  );
  createdConsumers.push(consumer);
  return consumer;
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

afterEach(async () => {
  for (const consumer of createdConsumers.splice(0)) {
    await consumer.close();
  }
  clearHostInstance();
  vi.restoreAllMocks();
  delete (window as unknown as { hostProps?: unknown }).hostProps;
  window.name = originalWindowName;
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

  it('should omit sameDomain props from bootstrap payloads even for same-origin hosts', () => {
    const definitions = {
      label: { schema: prop.string() },
      secret: { schema: prop.string(), sameDomain: true },
    };
    const consumer = createConsumer(
      {
        url: '/widget',
        props: definitions,
      },
      {
        label: 'visible',
        secret: 'same-origin-only',
      }
    );

    window.name = (
      consumer as unknown as {
        buildWindowName: () => string;
      }
    ).buildWindowName();

    vi
      .spyOn(hostSecurity, 'resolveConsumerWindow')
      .mockReturnValue(window);

    const host = initHost(definitions, undefined, { deferInit: true });

    expect(host).not.toBeNull();
    expect(host!.hostProps.label).toBe('visible');
    expect(host!.hostProps.secret).toBeUndefined();
  });

  it('should clear the bootstrap window name after host initialization', async () => {
    const payload = createPayload({
      props: { amount: 42 },
    });
    window.name = buildWindowName(payload);

    vi
      .spyOn(hostSecurity, 'resolveConsumerWindow')
      .mockReturnValue(window);

    const host = initHost(undefined, undefined, { deferInit: true });
    const sendSpy = vi
      .spyOn(
        (host as unknown as { messenger: { send: (...args: unknown[]) => Promise<unknown> } }).messenger,
        'send'
      )
      .mockResolvedValue(undefined);

    expect(host).not.toBeNull();
    expect(window.name).toBe('');
    expect(isHost()).toBe(true);
    expect(isEmbedded()).toBe(true);
    expect(getHostProps()).toBe(host?.hostProps);
    expect(host?.hostProps.amount).toBe(42);

    await Promise.resolve();
    expect(sendSpy).toHaveBeenCalled();
  });

  it('should clear the bootstrap window name but preserve same-page retry when host prop validation fails', () => {
    const payload = createPayload({
      props: { amount: 'not-a-number' },
    });
    const bootstrapWindowName = buildWindowName(payload);
    window.name = bootstrapWindowName;

    vi
      .spyOn(hostSecurity, 'resolveConsumerWindow')
      .mockReturnValue(window);

    expect(() =>
      initHost(
        {
          amount: { schema: prop.number() },
        },
        undefined,
        { deferInit: true }
      )
    ).toThrow('Validation failed: amount: Expected number, got string');

    expect(window.name).toBe('');
    expect(getHostProps()).toBeUndefined();

    const host = initHost(
      {
        amount: { schema: prop.string() },
      },
      undefined,
      { deferInit: true }
    );

    expect(host).not.toBeNull();
    expect(host?.hostProps.amount).toBe('not-a-number');
    expect(window.name).toBe('');
  });

  it('should not create a host instance for invalid bootstrap payloads', () => {
    const invalidName = '__forgeframe__not-valid-base64';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.name = invalidName;

    expect(initHost(undefined, undefined, { deferInit: true })).toBeNull();
    expect(isHost()).toBe(true);
    expect(getHostProps()).toBeUndefined();
    expect(window.name).toBe(invalidName);
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to parse ForgeFrame payload from window.name'
    );
  });

  it('should allow required sameDomain props to arrive after bootstrap on same-origin hosts', () => {
    vi
      .spyOn(hostSecurity, 'resolveConsumerWindow')
      .mockReturnValue(window);

    const host = new HostComponent(
      createPayload({
        consumerDomain: window.location.origin,
        props: { label: 'visible' },
      }),
      {
        label: { schema: prop.string() },
        secret: { schema: prop.string(), sameDomain: true, required: true },
      },
      undefined,
      true
    );
    const propsHandler = (
      (host as unknown as { messenger: { handlers: Map<string, DirectHandler> } })
        .messenger.handlers
    ).get(MESSAGE_NAME.PROPS);

    expect(propsHandler).toBeDefined();
    expect(host.hostProps.secret).toBeUndefined();
    expect(
      propsHandler!(
        { label: 'visible', secret: 'same-origin-only' },
        createMessageSource(window, window.location.origin)
      )
    ).toEqual({ success: true });
    expect(host.hostProps.secret).toBe('same-origin-only');
  });

  it('should still reject missing required sameDomain props for cross-origin hosts', () => {
    const crossOriginConsumerWindow = {
      postMessage: vi.fn(),
      location: { origin: 'https://consumer.example.com' },
    } as unknown as Window;

    vi
      .spyOn(hostSecurity, 'resolveConsumerWindow')
      .mockReturnValue(crossOriginConsumerWindow);

    expect(
      () =>
        new HostComponent(
          createPayload({
            consumerDomain: 'https://consumer.example.com',
            props: {},
          }),
          {
            secret: { schema: prop.string(), sameDomain: true, required: true },
          },
          undefined,
          true
        )
    ).toThrow('Prop "secret" is required but was not provided');
  });

  it('should apply PROPS updates to hostProps and notify subscribers', () => {
    const host = createHost();
    const propsHandler = (
      (host as unknown as { messenger: { handlers: Map<string, DirectHandler> } })
        .messenger.handlers
    ).get(MESSAGE_NAME.PROPS);
    const initialConsumerProps = host.hostProps.consumer.props;

    expect(propsHandler).toBeDefined();

    const subscriber = vi.fn();
    host.hostProps.onProps(subscriber);

    const result = propsHandler!({ amount: 42 }, createMessageSource(window));

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
      (host as unknown as { messenger: { handlers: Map<string, DirectHandler> } })
        .messenger.handlers
    ).get(MESSAGE_NAME.PROPS);

    expect(propsHandler).toBeDefined();

    const first = propsHandler!({ amount: 42, currency: 'USD' }, createMessageSource(window));
    const second = propsHandler!({ amount: 42 }, createMessageSource(window));

    expect(first).toEqual({ success: true });
    expect(second).toEqual({ success: true });
    expect(host.hostProps.amount).toBe(42);
    expect('currency' in (host.hostProps as Record<string, unknown>)).toBe(false);
    expect(host.hostProps.consumer.props).toEqual({ amount: 42 });
  });

  it('should isolate failing props subscribers and continue notifying others', () => {
    const host = createHost();
    const propsHandler = (
      (host as unknown as { messenger: { handlers: Map<string, DirectHandler> } })
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

    const result = propsHandler!({ amount: 77 }, createMessageSource(window));

    expect(result).toEqual({ success: true });
    expect(throwingSubscriber).toHaveBeenCalled();
    expect(healthySubscriber).toHaveBeenCalledWith({ amount: 77 });
    expect(consoleSpy).toHaveBeenCalledWith('Error in props handler:', expect.any(Error));
  });

  it('should emit host error and rethrow when props deserialization fails', () => {
    const host = createHost();
    const propsHandler = (
      (host as unknown as { messenger: { handlers: Map<string, DirectHandler> } })
        .messenger.handlers
    ).get(MESSAGE_NAME.PROPS);

    expect(propsHandler).toBeDefined();

    const emitSpy = vi.spyOn(host.event, 'emit');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => propsHandler!(circular, createMessageSource(window))).toThrow(
      'Circular reference detected in serialized props'
    );
    expect(emitSpy).toHaveBeenCalledWith(EVENT.ERROR, expect.any(Error));
    expect(consoleSpy).toHaveBeenCalledWith('Error deserializing props:', expect.any(Error));
  });

  it('should reject invalid PROPS updates before mutating hostProps', () => {
    vi
      .spyOn(hostSecurity, 'resolveConsumerWindow')
      .mockReturnValue(window);

    const typedHost = new HostComponent(
      createPayload({ props: { amount: 10 } }),
      {
        amount: { schema: prop.number() },
      },
      undefined,
      true
    );
    const propsHandler = (
      (typedHost as unknown as {
        messenger: { handlers: Map<string, DirectHandler> };
      }).messenger.handlers
    ).get(MESSAGE_NAME.PROPS);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(propsHandler).toBeDefined();
    expect(() => propsHandler!({ amount: 'bad-update' }, createMessageSource(window))).toThrow(
      'Validation failed: amount: Expected number, got string'
    );
    expect(typedHost.hostProps.amount).toBe(10);
    expect(typedHost.hostProps.consumer.props).toEqual({ amount: 10 });
    expect(consoleSpy).toHaveBeenCalledWith('Error deserializing props:', expect.any(Error));
    typedHost.destroy();
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
