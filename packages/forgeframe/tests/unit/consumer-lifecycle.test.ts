import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsumerComponent } from '@/core/consumer';
import { clearComponents, create } from '@/core/component';
import { CONTEXT, MESSAGE_NAME } from '@/constants';
import { prop } from '@/props/prop';

const createdConsumers: Array<ConsumerComponent<Record<string, unknown>>> = [];

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

function getHandlers(
  component: ConsumerComponent<Record<string, unknown>>
): Map<string, (data: unknown) => unknown> {
  return (
    component as unknown as {
      messenger: { handlers: Map<string, (data: unknown) => unknown> };
    }
  ).messenger.handlers;
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
    const waitForHost = (
      consumer as unknown as {
        waitForHost: () => Promise<void>;
      }
    ).waitForHost;

    const waitPromise = waitForHost.call(consumer);
    const initHandler = getHandlers(consumer).get(MESSAGE_NAME.INIT);

    expect(initHandler).toBeDefined();
    expect(initHandler!({})).toEqual({ success: true });
    await expect(waitPromise).resolves.toBeUndefined();
  });

  it('should resolve waitForHost when INIT arrives before waiting starts', async () => {
    vi.useFakeTimers();
    const consumer = createConsumer({ timeout: 50 });
    const waitForHost = (
      consumer as unknown as {
        waitForHost: () => Promise<void>;
      }
    ).waitForHost;
    const initHandler = getHandlers(consumer).get(MESSAGE_NAME.INIT);

    expect(initHandler).toBeDefined();
    expect(initHandler!({})).toEqual({ success: true });
    await expect(waitForHost.call(consumer)).resolves.toBeUndefined();
  });

  it('should route host control messages to instance methods', async () => {
    const consumer = createConsumer();
    const handlers = getHandlers(consumer);

    const closeSpy = vi.spyOn(consumer, 'close').mockResolvedValue(undefined);
    const resizeSpy = vi.spyOn(consumer, 'resize').mockResolvedValue(undefined);
    const focusSpy = vi.spyOn(consumer, 'focus').mockResolvedValue(undefined);
    const showSpy = vi.spyOn(consumer, 'show').mockResolvedValue(undefined);
    const hideSpy = vi.spyOn(consumer, 'hide').mockResolvedValue(undefined);

    await expect(handlers.get(MESSAGE_NAME.CLOSE)!({})).resolves.toEqual({ success: true });
    await expect(
      handlers.get(MESSAGE_NAME.RESIZE)!({ width: 420, height: 240 })
    ).resolves.toEqual({ success: true });
    await expect(handlers.get(MESSAGE_NAME.FOCUS)!({})).resolves.toEqual({ success: true });
    await expect(handlers.get(MESSAGE_NAME.SHOW)!({})).resolves.toEqual({ success: true });
    await expect(handlers.get(MESSAGE_NAME.HIDE)!({})).resolves.toEqual({ success: true });

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(resizeSpy).toHaveBeenCalledWith({ width: 420, height: 240 });
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(showSpy).toHaveBeenCalledTimes(1);
    expect(hideSpy).toHaveBeenCalledTimes(1);
  });

  it('should surface host ERROR messages through consumer onError callback', async () => {
    const onError = vi.fn();
    const consumer = createConsumer({}, { onError });
    const errorHandler = getHandlers(consumer).get(MESSAGE_NAME.ERROR);

    expect(errorHandler).toBeDefined();
    await expect(
      errorHandler!({ message: 'host failed', stack: 'host-stack' })
    ).resolves.toEqual({ success: true });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'host failed',
        stack: 'host-stack',
      })
    );
  });

  it('should store EXPORT and CONSUMER_EXPORT payloads', async () => {
    const consumer = createConsumer();
    const handlers = getHandlers(consumer);

    await expect(
      handlers.get(MESSAGE_NAME.EXPORT)!({ ready: true })
    ).resolves.toEqual({ success: true });
    await expect(
      handlers.get(MESSAGE_NAME.CONSUMER_EXPORT)!({ token: 'abc' })
    ).resolves.toEqual({ success: true });

    expect(consumer.exports).toEqual({ ready: true });
    expect(consumer.consumerExports).toEqual({ token: 'abc' });
  });

  it('should return peer siblings excluding requesting instance', async () => {
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
    const siblingsHandler = getHandlers(consumer).get(MESSAGE_NAME.GET_SIBLINGS);

    expect(siblingsHandler).toBeDefined();
    const siblings = await siblingsHandler!({
      uid: instanceA.uid,
      tag: 'peer-siblings-component',
    });

    expect(siblings).toEqual([
      {
        uid: instanceB.uid,
        tag: 'peer-siblings-component',
        exports: { id: 'b' },
      },
    ]);
  });

  it('should throw when open is called in iframe context without prerender iframe', async () => {
    const consumer = createConsumer();
    (
      consumer as unknown as {
        context: string;
      }
    ).context = CONTEXT.IFRAME;

    await expect(
      (
        consumer as unknown as {
          open: () => Promise<void>;
        }
      ).open()
    ).rejects.toThrow('Iframe not created during prerender');
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
    (
      renderedInstance as unknown as {
        rendered: boolean;
      }
    ).rendered = true;
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
    const internal = consumer as unknown as {
      hostWindow: Window | null;
      openedHostDomain: string | null;
      props: Record<string, unknown>;
      messenger: { send: (...args: unknown[]) => Promise<unknown> };
    };
    internal.hostWindow = hostWindow;
    internal.openedHostDomain = 'https://host.example.com';

    const previousProps = { ...internal.props };
    const sendSpy = vi.spyOn(internal.messenger, 'send').mockResolvedValue(undefined);

    await expect(consumer.updateProps({ amount: undefined })).rejects.toThrow(
      'Prop "amount" is required but was not provided'
    );

    expect(validate).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(internal.props).toEqual(previousProps);
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
    const internal = consumer as unknown as {
      hostWindow: Window | null;
      openedHostDomain: string | null;
      messenger: { send: (...args: unknown[]) => Promise<unknown> };
    };
    internal.hostWindow = hostWindow;
    internal.openedHostDomain = 'https://host.example.com';

    const sendSpy = vi.spyOn(internal.messenger, 'send').mockResolvedValue(undefined);

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

    const internal = consumer as unknown as {
      hostWindow: Window | null;
      openedHostDomain: string | null;
      messenger: { send: (...args: unknown[]) => Promise<unknown> };
    };
    internal.hostWindow = { closed: true } as unknown as Window;
    internal.openedHostDomain = 'https://host.example.com';

    const sendSpy = vi.spyOn(internal.messenger, 'send').mockResolvedValue(undefined);

    await consumer.updateProps({ amount: 2 });

    expect(sendSpy).not.toHaveBeenCalled();
  });
});
