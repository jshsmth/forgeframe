/**
 * Shared cross-window helpers for ForgeFrame integration tests.
 *
 * Exercises consumer and host runtimes through real `postMessage` dispatch,
 * `window.name` bootstrap payloads, and `initHost()` running in a separate
 * jsdom window.
 */
import { JSDOM } from 'jsdom';
import { destroyAll, clearComponents } from '#internal/core/component';
import { clearHostInstance } from '#internal/core/host';
import { initHost } from '#internal/index';
import type { HostProps, PropsDefinition } from '#internal/types';

const DEFAULT_HOST_URL = 'https://host.example.com/widget';
const GLOBAL_BINDINGS = ['window', 'document', 'self'] as const;

type GlobalBinding = (typeof GLOBAL_BINDINGS)[number];
type GlobalBindingSnapshot = Map<GlobalBinding, PropertyDescriptor | undefined>;

function captureGlobalBindings(): GlobalBindingSnapshot {
  const snapshot: GlobalBindingSnapshot = new Map();

  for (const binding of GLOBAL_BINDINGS) {
    snapshot.set(binding, Object.getOwnPropertyDescriptor(globalThis, binding));
  }

  return snapshot;
}

function setGlobalBinding(binding: GlobalBinding, value: unknown): void {
  Object.defineProperty(globalThis, binding, {
    configurable: true,
    writable: true,
    value,
  });
}

function restoreGlobalBindings(snapshot: GlobalBindingSnapshot): void {
  for (const binding of GLOBAL_BINDINGS) {
    const descriptor = snapshot.get(binding);
    if (descriptor) {
      Object.defineProperty(globalThis, binding, descriptor);
      continue;
    }

    Reflect.deleteProperty(globalThis, binding);
  }
}

function resolveRequestedOrigin(
  targetOrigin: Parameters<Window['postMessage']>[1]
): string {
  if (typeof targetOrigin === 'string') {
    return targetOrigin;
  }

  if (
    targetOrigin &&
    typeof targetOrigin === 'object' &&
    'targetOrigin' in targetOrigin &&
    typeof targetOrigin.targetOrigin === 'string'
  ) {
    return targetOrigin.targetOrigin;
  }

  return '*';
}

function shouldDispatchMessage(
  requestedOrigin: string,
  targetOrigin: string,
  senderOrigin: string
): boolean {
  if (requestedOrigin === '*') {
    return true;
  }

  if (requestedOrigin === '/') {
    return targetOrigin === senderOrigin;
  }

  try {
    return new URL(requestedOrigin, senderOrigin).origin === targetOrigin;
  } catch {
    return requestedOrigin === targetOrigin;
  }
}

function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export interface IframeIntegrationHarness {
  consumerWindow: Window & typeof globalThis;
  consumerOrigin: string;
  hostWindow: Window & typeof globalThis;
  hostOrigin: string;
  withHostGlobals: <T>(callback: () => T) => T;
  withHostGlobalsAsync: <T>(callback: () => Promise<T>) => Promise<T>;
  waitForIframe: (container?: ParentNode) => Promise<HTMLIFrameElement>;
  attachHostToIframe: (iframe: HTMLIFrameElement) => void;
  bootstrapHost: <P extends Record<string, unknown>>(
    propDefinitions?: PropsDefinition<P>
  ) => ReturnType<typeof initHost<P>>;
  bootstrapIframeHost: <P extends Record<string, unknown>>(
    container: ParentNode,
    propDefinitions?: PropsDefinition<P>
  ) => Promise<{
    host: NonNullable<ReturnType<typeof initHost<P>>>;
    hostProps: HostProps<P>;
    iframe: HTMLIFrameElement;
  }>;
  getHostProps: <P extends Record<string, unknown>>() => HostProps<P>;
  cleanup: () => Promise<void>;
}

/**
 * Creates a consumer/host iframe harness backed by two jsdom windows.
 */
export function createIframeIntegrationHarness(options?: {
  hostUrl?: string;
}): IframeIntegrationHarness {
  const consumerWindow = window as Window & typeof globalThis;
  const consumerOrigin = consumerWindow.location.origin;

  const hostDom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: options?.hostUrl ?? DEFAULT_HOST_URL,
    pretendToBeVisual: true,
  });
  const hostWindow = hostDom.window as unknown as Window & typeof globalThis;
  const hostOrigin = hostWindow.location.origin;

  const originalConsumerPostMessage = consumerWindow.postMessage.bind(consumerWindow);
  const originalHostPostMessage = hostWindow.postMessage.bind(hostWindow);

  let cleanedUp = false;

  Object.defineProperty(hostWindow, 'parent', {
    configurable: true,
    value: consumerWindow,
  });
  Object.defineProperty(hostWindow, 'opener', {
    configurable: true,
    value: null,
  });
  Object.defineProperty(hostWindow.document, 'referrer', {
    configurable: true,
    value: `${consumerOrigin}/forgeframe-integration`,
  });

  const dispatchMessage = (
    targetWindow: Window & typeof globalThis,
    sourceWindow: Window & typeof globalThis,
    sourceOrigin: string,
    targetOrigin: string,
    data: unknown,
    requestedOrigin: string
  ): void => {
    if (!shouldDispatchMessage(requestedOrigin, targetOrigin, sourceOrigin)) {
      return;
    }

    queueMicrotask(() => {
      const event = new targetWindow.MessageEvent('message', {
        data,
        origin: sourceOrigin,
        source: sourceWindow,
      });

      targetWindow.dispatchEvent(event);
    });
  };

  consumerWindow.postMessage = ((data: unknown, targetOrigin?: string | WindowPostMessageOptions) => {
    dispatchMessage(
      consumerWindow,
      hostWindow,
      hostOrigin,
      consumerOrigin,
      data,
      resolveRequestedOrigin(targetOrigin ?? '*')
    );
  }) as Window['postMessage'];

  hostWindow.postMessage = ((data: unknown, targetOrigin?: string | WindowPostMessageOptions) => {
    dispatchMessage(
      hostWindow,
      consumerWindow,
      consumerOrigin,
      hostOrigin,
      data,
      resolveRequestedOrigin(targetOrigin ?? '*')
    );
  }) as Window['postMessage'];

  const withHostGlobals = <T>(callback: () => T): T => {
    const snapshot = captureGlobalBindings();

    setGlobalBinding('window', hostWindow);
    setGlobalBinding('document', hostWindow.document);
    setGlobalBinding('self', hostWindow);

    try {
      return callback();
    } finally {
      restoreGlobalBindings(snapshot);
    }
  };

  const withHostGlobalsAsync = async <T>(callback: () => Promise<T>): Promise<T> => {
    const snapshot = captureGlobalBindings();

    setGlobalBinding('window', hostWindow);
    setGlobalBinding('document', hostWindow.document);
    setGlobalBinding('self', hostWindow);

    try {
      return await callback();
    } finally {
      restoreGlobalBindings(snapshot);
    }
  };

  const waitForIframe = async (container: ParentNode = document): Promise<HTMLIFrameElement> => {
    const timeoutAt = Date.now() + 1000;

    while (Date.now() < timeoutAt) {
      const iframe = container.querySelector('iframe');
      if (iframe instanceof consumerWindow.HTMLIFrameElement) {
        return iframe;
      }

      await waitForNextTick();
    }

    throw new Error('Timed out waiting for the ForgeFrame iframe to be created');
  };

  const attachHostToIframe = (iframe: HTMLIFrameElement): void => {
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: hostWindow,
    });
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: hostWindow.document,
    });
    Object.defineProperty(hostWindow, 'frameElement', {
      configurable: true,
      value: iframe,
    });

    hostWindow.name = iframe.name;
  };

  const bootstrapHost = <P extends Record<string, unknown>>(
    propDefinitions?: PropsDefinition<P>
  ): ReturnType<typeof initHost<P>> => {
    return withHostGlobals(() => initHost(propDefinitions));
  };

  const getHostProps = <P extends Record<string, unknown>>(): HostProps<P> => {
    const hostProps = withHostGlobals(
      () => (window as unknown as { hostProps?: HostProps<P> }).hostProps
    );

    if (!hostProps) {
      throw new Error('Expected window.hostProps to be initialized');
    }

    return hostProps;
  };

  const bootstrapIframeHost = async <P extends Record<string, unknown>>(
    container: ParentNode,
    propDefinitions?: PropsDefinition<P>
  ): Promise<{
    host: NonNullable<ReturnType<typeof initHost<P>>>;
    hostProps: HostProps<P>;
    iframe: HTMLIFrameElement;
  }> => {
    const iframe = await waitForIframe(container);
    attachHostToIframe(iframe);

    const host = bootstrapHost(propDefinitions);
    if (!host) {
      throw new Error('Expected initHost() to create a host instance');
    }

    return {
      host,
      hostProps: getHostProps<P>(),
      iframe,
    };
  };

  const cleanup = async (): Promise<void> => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;

    try {
      await destroyAll();
    } finally {
      clearComponents();
      withHostGlobals(() => {
        clearHostInstance();
      });
      delete (consumerWindow as unknown as { hostProps?: unknown }).hostProps;

      consumerWindow.postMessage = originalConsumerPostMessage;
      hostWindow.postMessage = originalHostPostMessage;
      consumerWindow.document.body.innerHTML = '';
      hostWindow.close();
    }
  };

  return {
    consumerWindow,
    consumerOrigin,
    hostWindow,
    hostOrigin,
    withHostGlobals,
    withHostGlobalsAsync,
    waitForIframe,
    attachHostToIframe,
    bootstrapHost,
    bootstrapIframeHost,
    getHostProps,
    cleanup,
  };
}
