/**
 * Branch coverage tests for `@/core/consumer` internals.
 *
 * Covers domain trust variants, render helper delegation, prop update edge paths, and guarded branches around URL/origin handling.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsumerComponent } from '@/core/consumer';
import { CONTEXT } from '@/constants';
import { prop } from '@/props/prop';
import * as iframeRender from '@/render/iframe';
import * as popupRender from '@/render/popup';
import * as windowProxy from '@/window/proxy';

const createdConsumers: Array<ConsumerComponent<Record<string, unknown>>> = [];

/**
 * Creates a consumer instance and tracks it for teardown at the end of each test.
 */
function createConsumer(
  options: Record<string, unknown> = {},
  props: Record<string, unknown> = {}
): ConsumerComponent<Record<string, unknown>> {
  const consumer = new ConsumerComponent<Record<string, unknown>>(
    {
      tag: 'consumer-internal-branches-component',
      url: 'https://host.example.com/widget',
      ...options,
    } as never,
    props
  );
  createdConsumers.push(consumer);
  return consumer;
}

afterEach(async () => {
  for (const consumer of createdConsumers.splice(0)) {
    await consumer.close();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('Consumer branch coverage and edge paths', () => {
  it('should trust domain option when configured as string', () => {
    const consumer = createConsumer({
      domain: 'https://trusted.example.com',
    });
    const allowedOrigins = Array.from(
      (
        consumer as unknown as {
          messenger: { allowedOrigins: Set<string> };
        }
      ).messenger.allowedOrigins
    );

    expect(allowedOrigins).toContain('https://trusted.example.com');
  });

  it('should trust domain option when configured as array', () => {
    const consumer = createConsumer({
      domain: ['https://trusted-a.example.com', 'https://trusted-b.example.com'],
    });
    const allowedOrigins = Array.from(
      (
        consumer as unknown as {
          messenger: { allowedOrigins: Set<string> };
        }
      ).messenger.allowedOrigins
    );

    expect(allowedOrigins).toContain('https://trusted-a.example.com');
    expect(allowedOrigins).toContain('https://trusted-b.example.com');
  });

  it('should trust mixed array domain option entries including RegExp', () => {
    const consumer = createConsumer({
      domain: ['https://trusted-a.example.com', /^https:\/\/.*\.trusted\.example\.com$/],
    });
    const internalMessenger = (
      consumer as unknown as {
        messenger: { allowedOrigins: Set<string>; allowedOriginPatterns: RegExp[] };
      }
    ).messenger;

    expect(Array.from(internalMessenger.allowedOrigins)).toContain('https://trusted-a.example.com');
    expect(internalMessenger.allowedOriginPatterns).toHaveLength(1);
    expect(internalMessenger.allowedOriginPatterns[0]?.test('https://api.trusted.example.com')).toBe(true);
  });

  it('should trust domain option when configured as RegExp', () => {
    const consumer = createConsumer({
      domain: /^https:\/\/.*\.trusted\.example\.com$/,
    });
    const patterns = (
      consumer as unknown as {
        messenger: { allowedOriginPatterns: RegExp[] };
      }
    ).messenger.allowedOriginPatterns;

    expect(patterns).toHaveLength(1);
    expect(patterns[0].test('https://api.trusted.example.com')).toBe(true);
  });

  it('should delegate renderTo to render', async () => {
    const consumer = createConsumer();
    const renderSpy = vi.spyOn(consumer, 'render').mockResolvedValue(undefined);
    const container = document.createElement('div');

    await (
      consumer as unknown as {
        renderTo: (
          win: Window,
          container?: string | HTMLElement,
          context?: 'iframe' | 'popup'
        ) => Promise<void>;
      }
    ).renderTo(window, container, CONTEXT.POPUP);

    expect(renderSpy).toHaveBeenCalledWith(container, CONTEXT.POPUP);
  });

  it('should focus iframe and popup contexts through dedicated render helpers', async () => {
    const consumer = createConsumer();
    const iframe = document.createElement('iframe');
    const popup = { closed: false, focus: vi.fn() } as unknown as Window;
    const focusIframeSpy = vi.spyOn(iframeRender, 'focusIframe').mockImplementation(() => {});
    const focusPopupSpy = vi.spyOn(popupRender, 'focusPopup').mockImplementation(() => {});

    (
      consumer as unknown as {
        context: string;
        iframe: HTMLIFrameElement | null;
        hostWindow: Window | null;
      }
    ).context = CONTEXT.IFRAME;
    (
      consumer as unknown as {
        iframe: HTMLIFrameElement | null;
      }
    ).iframe = iframe;

    await consumer.focus();
    expect(focusIframeSpy).toHaveBeenCalledWith(iframe);

    (
      consumer as unknown as {
        context: string;
        hostWindow: Window | null;
      }
    ).context = CONTEXT.POPUP;
    (
      consumer as unknown as {
        hostWindow: Window | null;
      }
    ).hostWindow = popup;

    await consumer.focus();
    expect(focusPopupSpy).toHaveBeenCalledWith(popup);
  });

  it('should resize/show/hide through iframe and popup render helpers', async () => {
    const consumer = createConsumer();
    const iframe = document.createElement('iframe');
    const popup = { closed: false } as unknown as Window;

    const resizeIframeSpy = vi.spyOn(iframeRender, 'resizeIframe').mockImplementation(() => {});
    const showIframeSpy = vi.spyOn(iframeRender, 'showIframe').mockImplementation(() => {});
    const hideIframeSpy = vi.spyOn(iframeRender, 'hideIframe').mockImplementation(() => {});
    const resizePopupSpy = vi.spyOn(popupRender, 'resizePopup').mockImplementation(() => {});

    (
      consumer as unknown as {
        context: string;
        iframe: HTMLIFrameElement | null;
      }
    ).context = CONTEXT.IFRAME;
    (
      consumer as unknown as {
        iframe: HTMLIFrameElement | null;
      }
    ).iframe = iframe;

    await consumer.resize({ width: 400, height: 220 });
    await consumer.show();
    await consumer.hide();

    expect(resizeIframeSpy).toHaveBeenCalledWith(iframe, { width: 400, height: 220 });
    expect(showIframeSpy).toHaveBeenCalledWith(iframe);
    expect(hideIframeSpy).toHaveBeenCalledWith(iframe);

    (
      consumer as unknown as {
        context: string;
        hostWindow: Window | null;
      }
    ).context = CONTEXT.POPUP;
    (
      consumer as unknown as {
        hostWindow: Window | null;
      }
    ).hostWindow = popup;

    await consumer.resize({ width: 480, height: 300 });
    expect(resizePopupSpy).toHaveBeenCalledWith(popup, { width: 480, height: 300 });
  });

  it('should return null for invalid origins when resolving URL origin', () => {
    const consumer = createConsumer();
    const origin = (
      consumer as unknown as {
        resolveUrlOrigin: (url: string) => string | null;
      }
    ).resolveUrlOrigin('http://%');

    expect(origin).toBeNull();
  });

  it('should evaluate explicit domain trust for string and array domain options', () => {
    const stringDomainConsumer = createConsumer({
      domain: 'https://trusted.example.com',
    });
    const arrayDomainConsumer = createConsumer({
      domain: ['https://trusted-a.example.com', 'https://trusted-b.example.com'],
    });

    const isTrustedString = (
      stringDomainConsumer as unknown as {
        isExplicitDomainTrust: (origin: string) => boolean;
      }
    ).isExplicitDomainTrust('https://trusted.example.com');
    const isTrustedArray = (
      arrayDomainConsumer as unknown as {
        isExplicitDomainTrust: (origin: string) => boolean;
      }
    ).isExplicitDomainTrust('https://trusted-b.example.com');

    expect(isTrustedString).toBe(true);
    expect(isTrustedArray).toBe(true);
  });

  it('should evaluate explicit domain trust for wildcard and RegExp domain options', () => {
    const wildcardDomainConsumer = createConsumer({
      domain: 'https://*.trusted.example.com',
    });
    const regexDomainConsumer = createConsumer({
      domain: /^https:\/\/.*\.trusted\.example\.com$/,
    });

    const isTrustedWildcard = (
      wildcardDomainConsumer as unknown as {
        isExplicitDomainTrust: (origin: string) => boolean;
      }
    ).isExplicitDomainTrust('https://api.trusted.example.com');
    const isTrustedRegex = (
      regexDomainConsumer as unknown as {
        isExplicitDomainTrust: (origin: string) => boolean;
      }
    ).isExplicitDomainTrust('https://api.trusted.example.com');

    expect(isTrustedWildcard).toBe(true);
    expect(isTrustedRegex).toBe(true);
  });

  it('should skip trusted-domain sync when URL origin is invalid', () => {
    const consumer = createConsumer();
    const internalMessenger = (
      consumer as unknown as {
        messenger: { addTrustedDomain: (domain: string) => void };
      }
    ).messenger;
    const addTrustedSpy = vi.spyOn(internalMessenger, 'addTrustedDomain');

    (
      consumer as unknown as {
        syncTrustedDomainForUrl: (url: string) => void;
      }
    ).syncTrustedDomainForUrl('http://%');

    expect(addTrustedSpy).not.toHaveBeenCalled();
  });

  it('should expose working close/focus/onError callbacks from prop context', () => {
    const consumer = createConsumer();
    const closeSpy = vi.spyOn(consumer, 'close').mockResolvedValue(undefined);
    const focusSpy = vi.spyOn(consumer, 'focus').mockResolvedValue(undefined);
    const handleErrorSpy = vi.spyOn(
      consumer as unknown as { handleError: (error: Error) => void },
      'handleError'
    );

    const ctx = (
      consumer as unknown as {
        createPropContext: () => {
          close: () => Promise<void>;
          focus: () => Promise<void>;
          onError: (err: Error) => void;
        };
      }
    ).createPropContext();

    void ctx.close();
    void ctx.focus();
    ctx.onError(new Error('context-error'));

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(handleErrorSpy).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should provide initial user props to value callbacks during construction', () => {
    const consumer = createConsumer(
      {
        props: {
          derived: {
            schema: prop.string(),
            value: (ctx: { props: Record<string, unknown> }) => `seed:${ctx.props.seed}`,
          },
        },
      },
      { seed: 'abc' }
    );

    const internalProps = (
      consumer as unknown as { props: Record<string, unknown> }
    ).props;
    expect(internalProps.derived).toBe('seed:abc');
  });

  it('should preserve materialized value props on unrelated updateProps patches', async () => {
    let derivedCalls = 0;
    const consumer = createConsumer(
      {
        props: {
          seed: {
            schema: prop.string(),
            required: true,
          },
          amount: {
            schema: prop.number().optional(),
          },
          derived: {
            schema: prop.string(),
            value: (ctx: { props: Record<string, unknown> }) => {
              derivedCalls += 1;
              return `seed:${ctx.props.seed}`;
            },
          },
        },
      },
      { seed: 'abc' }
    );

    await consumer.updateProps({ amount: 1 });

    const internalProps = (
      consumer as unknown as { props: Record<string, unknown> }
    ).props;
    expect(internalProps.seed).toBe('abc');
    expect(internalProps.amount).toBe(1);
    expect(internalProps.derived).toBe('seed:abc');
    expect(derivedCalls).toBe(1);
  });

  it('should prune stale function refs after each host serialization batch', async () => {
    const consumer = createConsumer(
      {
        props: {
          onSubmit: prop.function().optional(),
        },
      },
      {
        onSubmit: vi.fn(),
      }
    );

    (
      consumer as unknown as { hostWindow: Window | null }
    ).hostWindow = window;

    vi.spyOn(
      (
        consumer as unknown as {
          messenger: { send: (...args: unknown[]) => Promise<unknown> };
        }
      ).messenger,
      'send'
    ).mockResolvedValue(undefined);

    await consumer.updateProps({ onSubmit: vi.fn() });
    const firstBatchCount = (
      consumer as unknown as { bridge: { localFunctionCount: number } }
    ).bridge.localFunctionCount;

    await consumer.updateProps({ onSubmit: vi.fn() });
    const secondBatchCount = (
      consumer as unknown as { bridge: { localFunctionCount: number } }
    ).bridge.localFunctionCount;

    expect(firstBatchCount).toBe(1);
    expect(secondBatchCount).toBe(1);
  });

  it('should keep previous function refs until host props update is sent', async () => {
    const consumer = createConsumer(
      {
        props: {
          onSubmit: prop.function().optional(),
        },
      },
      {
        onSubmit: vi.fn(),
      }
    );

    (
      consumer as unknown as { hostWindow: Window | null }
    ).hostWindow = window;

    const bridge = (
      consumer as unknown as {
        bridge: {
          localFunctionCount: number;
          localFunctions: Map<string, unknown>;
        };
      }
    ).bridge;

    const sendSpy = vi.spyOn(
      (
        consumer as unknown as {
          messenger: { send: (...args: unknown[]) => Promise<unknown> };
        }
      ).messenger,
      'send'
    ).mockResolvedValue(undefined);

    await consumer.updateProps({ onSubmit: vi.fn() });
    const previousRefId = Array.from(bridge.localFunctions.keys())[0];
    expect(previousRefId).toBeDefined();
    if (!previousRefId) {
      throw new Error('Expected previous function ref ID');
    }

    sendSpy.mockImplementationOnce(async () => {
      if (!bridge.localFunctions.has(previousRefId)) {
        throw new Error(
          'Previous function ref was pruned before host acknowledged prop update'
        );
      }
      return undefined;
    });

    await expect(consumer.updateProps({ onSubmit: vi.fn() })).resolves.toBeUndefined();
    expect(bridge.localFunctions.has(previousRefId)).toBe(false);
    expect(bridge.localFunctionCount).toBe(1);
  });

  it('should serialize concurrent prop updates to avoid batch ref races', async () => {
    const consumer = createConsumer(
      {
        props: {
          onSubmit: prop.function().optional(),
        },
      },
      {
        onSubmit: vi.fn(),
      }
    );

    (
      consumer as unknown as { hostWindow: Window | null }
    ).hostWindow = window;

    const bridge = (
      consumer as unknown as {
        bridge: {
          localFunctionCount: number;
        };
      }
    ).bridge;

    let resolveFirstSend: (() => void) | null = null;
    let resolveSecondSend: (() => void) | null = null;
    const firstSend = new Promise<void>((resolve) => {
      resolveFirstSend = resolve;
    });
    const secondSend = new Promise<void>((resolve) => {
      resolveSecondSend = resolve;
    });

    const sendSpy = vi.spyOn(
      (
        consumer as unknown as {
          messenger: { send: (...args: unknown[]) => Promise<unknown> };
        }
      ).messenger,
      'send'
    ).mockImplementation(async () => {
      return sendSpy.mock.calls.length === 1 ? firstSend : secondSend;
    });

    const firstUpdate = consumer.updateProps({ onSubmit: vi.fn() });
    const secondUpdate = consumer.updateProps({ onSubmit: vi.fn() });

    await Promise.resolve();
    expect(sendSpy).toHaveBeenCalledTimes(1);

    if (!resolveFirstSend) {
      throw new Error('Expected first send resolver to be initialized');
    }
    resolveFirstSend();
    await firstUpdate;

    await Promise.resolve();
    expect(sendSpy).toHaveBeenCalledTimes(2);

    if (!resolveSecondSend) {
      throw new Error('Expected second send resolver to be initialized');
    }
    resolveSecondSend();

    await expect(secondUpdate).resolves.toBeUndefined();
    expect(bridge.localFunctionCount).toBe(1);
  });

  it('should resolve existing selector containers to HTMLElement', () => {
    const consumer = createConsumer();
    const container = document.createElement('div');
    container.id = 'resolve-container-target';
    document.body.appendChild(container);

    const resolved = (
      consumer as unknown as {
        resolveContainer: (container?: string | HTMLElement) => HTMLElement;
      }
    ).resolveContainer('#resolve-container-target');

    expect(resolved).toBe(container);
  });

  it('should throw when eligibility check returns false', () => {
    const consumer = createConsumer({
      eligible: () => ({ eligible: false, reason: 'Account blocked' }),
    });

    expect(() =>
      (
        consumer as unknown as {
          checkEligibility: () => void;
        }
      ).checkEligibility()
    ).toThrow('Component not eligible: Account blocked');
  });

  it('should invoke close/focus callbacks exposed to prerender and container templates', async () => {
    const closeSpy = vi.fn().mockResolvedValue(undefined);
    const focusSpy = vi.fn().mockResolvedValue(undefined);
    const consumer = createConsumer({
      prerenderTemplate: (ctx: { close: () => Promise<void>; focus: () => Promise<void> }) => {
        void ctx.close();
        void ctx.focus();
        return document.createElement('div');
      },
      containerTemplate: (ctx: { close: () => Promise<void>; focus: () => Promise<void> }) => {
        void ctx.close();
        void ctx.focus();
        return document.createElement('div');
      },
    });

    vi.spyOn(consumer, 'close').mockImplementation(closeSpy);
    vi.spyOn(consumer, 'focus').mockImplementation(focusSpy);

    (
      consumer as unknown as {
        container: HTMLElement | null;
      }
    ).container = document.createElement('div');

    await (
      consumer as unknown as {
        prerender: () => Promise<void>;
      }
    ).prerender();

    expect(closeSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
  });

  it('should apply boolean attributes and numeric styles when creating iframe element', () => {
    const consumer = createConsumer(
      {
        attributes: {
          allowfullscreen: true,
          title: 'Hosted iframe',
        },
      style: {
        marginTop: 8,
        border: '1px solid red',
      },
      },
      {}
    );

    const iframe = (
      consumer as unknown as {
        createIframeElement: (windowName: string) => HTMLIFrameElement;
      }
    ).createIframeElement('window-name');

    expect(iframe.hasAttribute('allowfullscreen')).toBe(true);
    expect(iframe.getAttribute('title')).toBe('Hosted iframe');
    expect(iframe.style.getPropertyValue('margin-top')).toBe('8px');
    expect(iframe.style.getPropertyValue('border')).toBe('1px solid red');
  });

  it('should open popup context and register popup close watcher cleanup', async () => {
    const consumer = createConsumer({
      dimensions: { width: 460, height: 320 },
    });
    const popupWindow = { closed: false } as unknown as Window;
    const stopWatching = vi.fn();
    const openPopupSpy = vi.spyOn(popupRender, 'openPopup').mockReturnValue(popupWindow);
    const watchSpy = vi.spyOn(popupRender, 'watchPopupClose').mockReturnValue(stopWatching);
    const registerWindowSpy = vi.spyOn(windowProxy, 'registerWindow').mockImplementation(() => {});
    const cleanupRegisterSpy = vi.spyOn(
      (
        consumer as unknown as {
          cleanup: { register: (cleanupFn: () => void) => void };
        }
      ).cleanup,
      'register'
    );

    (
      consumer as unknown as {
        context: string;
      }
    ).context = CONTEXT.POPUP;

    await (
      consumer as unknown as {
        open: () => Promise<void>;
      }
    ).open();

    expect(openPopupSpy).toHaveBeenCalledTimes(1);
    expect(watchSpy).toHaveBeenCalledWith(popupWindow, expect.any(Function));
    expect(cleanupRegisterSpy).toHaveBeenCalledWith(stopWatching);
    expect(registerWindowSpy).toHaveBeenCalledWith(consumer.uid, popupWindow);
  });

  it('should submit iframe body params via hidden form when bodyParam props exist', async () => {
    const consumer = createConsumer(
      {
        props: {
          token: { schema: prop.string(), bodyParam: true },
          mode: { schema: prop.string(), queryParam: true },
        },
      },
      { token: 'abc123', mode: 'embedded' }
    );

    const iframe = document.createElement('iframe');
    iframe.name = 'target-iframe';
    (
      consumer as unknown as {
        context: string;
        iframe: HTMLIFrameElement | null;
      }
    ).context = CONTEXT.IFRAME;
    (
      consumer as unknown as {
        iframe: HTMLIFrameElement | null;
      }
    ).iframe = iframe;

    const submitBodyFormSpy = vi.spyOn(
      consumer as unknown as {
        submitBodyForm: (target: string, actionUrl: string, params: URLSearchParams) => void;
      },
      'submitBodyForm'
    ).mockImplementation(() => {});

    await (
      consumer as unknown as {
        open: () => Promise<void>;
      }
    ).open();

    expect(submitBodyFormSpy).toHaveBeenCalledTimes(1);
    expect(submitBodyFormSpy).toHaveBeenCalledWith(
      'target-iframe',
      'https://host.example.com/widget?mode=embedded',
      expect.any(URLSearchParams)
    );
    expect((consumer as unknown as { hostWindow: Window | null }).hostWindow).toBe(iframe.contentWindow);
  });

  it('should open popup on about:blank and submit body params when bodyParam props exist', async () => {
    const consumer = createConsumer(
      {
        props: {
          token: { schema: prop.string(), bodyParam: true },
          mode: { schema: prop.string(), queryParam: true },
        },
      },
      { token: 'abc123', mode: 'embedded' }
    );

    const popupWindow = { closed: false } as unknown as Window;
    const stopWatching = vi.fn();
    const openPopupSpy = vi.spyOn(popupRender, 'openPopup').mockReturnValue(popupWindow);
    vi.spyOn(popupRender, 'watchPopupClose').mockReturnValue(stopWatching);
    vi.spyOn(windowProxy, 'registerWindow').mockImplementation(() => {});

    (
      consumer as unknown as {
        context: string;
      }
    ).context = CONTEXT.POPUP;

    const submitBodyFormSpy = vi.spyOn(
      consumer as unknown as {
        submitBodyForm: (target: string, actionUrl: string, params: URLSearchParams) => void;
      },
      'submitBodyForm'
    ).mockImplementation(() => {});

    await (
      consumer as unknown as {
        open: () => Promise<void>;
      }
    ).open();

    expect(openPopupSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'about:blank',
      })
    );
    const popupName = openPopupSpy.mock.calls[0]?.[0]?.name;
    expect(typeof popupName).toBe('string');
    expect(submitBodyFormSpy).toHaveBeenCalledWith(
      popupName,
      'https://host.example.com/widget?mode=embedded',
      expect.any(URLSearchParams)
    );
  });

  it('should append query params with ampersand when base URL already has query', () => {
    const consumer = createConsumer(
      {
        props: {
          token: { schema: prop.string(), queryParam: true },
        },
      },
      { token: 'abc123' }
    );

    const url = (
      consumer as unknown as {
        buildUrl: (baseUrl?: string) => string;
      }
    ).buildUrl('https://host.example.com/path?mode=embedded');

    expect(url).toContain('mode=embedded&token=abc123');
  });

  it('should throw when child component metadata cannot be resolved', () => {
    const consumer = createConsumer({
      children: () => ({
        InvalidChild: (() => undefined) as unknown as (...args: unknown[]) => unknown,
      }),
    });

    expect(() =>
      (
        consumer as unknown as {
          buildNestedHostRefs: () => Record<string, unknown> | undefined;
        }
      ).buildNestedHostRefs()
    ).toThrow('Nested component "InvalidChild" is missing component metadata');
  });

  it('should prefer openedHostDomain when computing host domain', () => {
    const consumer = createConsumer();
    (
      consumer as unknown as {
        openedHostDomain: string | null;
      }
    ).openedHostDomain = 'https://opened.example.com';

    const domain = (
      consumer as unknown as {
        getHostDomain: () => string;
      }
    ).getHostDomain();

    expect(domain).toBe('https://opened.example.com');
  });

  it('should close popup windows and remove prerender elements during destroy', async () => {
    const consumer = createConsumer();
    const popupWindow = { closed: false, close: vi.fn() } as unknown as Window;
    const prerenderElement = document.createElement('div');
    const removeSpy = vi.spyOn(prerenderElement, 'remove');
    const closePopupSpy = vi.spyOn(popupRender, 'closePopup').mockImplementation(() => {});

    (
      consumer as unknown as {
        context: string;
        hostWindow: Window | null;
        prerenderElement: HTMLElement | null;
      }
    ).context = CONTEXT.POPUP;
    (
      consumer as unknown as {
        hostWindow: Window | null;
      }
    ).hostWindow = popupWindow;
    (
      consumer as unknown as {
        prerenderElement: HTMLElement | null;
      }
    ).prerenderElement = prerenderElement;

    await (
      consumer as unknown as {
        destroy: () => Promise<void>;
      }
    ).destroy();

    expect(closePopupSpy).toHaveBeenCalledWith(popupWindow);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
