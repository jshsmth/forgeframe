/**
 * @packageDocumentation
 * Consumer transport subsystem module.
 *
 * @remarks
 * Owns consumer-side messaging, function bridging, trust management, and host
 * handshake concerns for embedded iframe and popup instances.
 */

import type {
  ConsumerExports,
  Dimensions,
  DomainMatcher,
  HostComponentRef,
  PropsDefinition,
  SerializedProps,
  SiblingInfo,
} from '../../types';
import { MESSAGE_NAME } from '../../constants';
import { Messenger, type MessageHandler } from '../../communication/messenger';
import { FunctionBridge } from '../../communication/bridge';
import { createDeferred, promiseTimeout } from '../../utils/promise';
import {
  getDomain,
  isSameDomain,
  isWindowClosed,
  matchDomain,
} from '../../window/helpers';
import { buildWindowName, createWindowPayload } from '../../window/name-payload';
import { getPropsForHost, serializeProps } from '../../props';
import type { ContextType } from '../../constants';
import type { ConsumerSiblingRequest } from './siblings';
import type { NormalizedOptions } from './types';

type VerifiedMessageSource = Parameters<MessageHandler>[1];

/**
 * Callbacks used by transport to map inbound host messages to component behavior.
 * @internal
 */
export interface ConsumerTransportHandlers<X> {
  onInit?: () => void | Promise<void>;
  onClose: () => Promise<void>;
  onResize: (dimensions: Dimensions) => Promise<void>;
  onFocus: () => Promise<void>;
  onShow: () => Promise<void>;
  onHide: () => Promise<void>;
  onError: (error: Error) => void;
  onExport: (exports: X) => void;
  onConsumerExport: (data: unknown) => void;
  onGetSiblings: (
    request: ConsumerSiblingRequest
  ) => SiblingInfo[] | Promise<SiblingInfo[]>;
}

/**
 * Owns consumer transport concerns (messenger, function bridge, trust management, handshake).
 * @internal
 */
export class ConsumerTransport<
  P extends Record<string, unknown>,
  X = unknown,
> {
  /** Messenger for host communication. */
  public messenger: Messenger;

  /** Function bridge for serializing callable props across windows. */
  public bridge: FunctionBridge;

  /** Connected host window reference. */
  public hostWindow: Window | null = null;

  /** Origin of currently opened host content. */
  public openedHostDomain: string | null = null;

  /** Dynamic origin currently trusted due to resolved URL. */
  public dynamicUrlTrustedOrigin: string | null = null;

  /** Deferred host initialization handshake promise. */
  public initPromise: ReturnType<typeof createDeferred<void>> | null = null;

  /** Whether host initialization handshake has completed. */
  public hostInitialized = false;

  constructor(
    private uid: string,
    private options: NormalizedOptions<P>,
    private resolveUrl: () => string,
    private resolveUrlOrigin: (url: string) => string | null
  ) {
    const trustedDomains = this.buildTrustedDomains();
    this.messenger = new Messenger(this.uid, window, getDomain(), trustedDomains);
    this.bridge = new FunctionBridge(this.messenger);
  }

  /**
   * Builds trusted domains used to initialize messenger security checks.
   */
  private buildTrustedDomains(): DomainMatcher | undefined {
    const domains: Array<string | RegExp> = [];

    const hostOrigin = this.resolveUrlOrigin(this.resolveUrl());
    if (hostOrigin) {
      domains.push(hostOrigin);
      this.dynamicUrlTrustedOrigin = hostOrigin;
    }

    if (this.options.domain) {
      if (typeof this.options.domain === 'string') {
        domains.push(this.options.domain);
      } else if (Array.isArray(this.options.domain)) {
        domains.push(...this.options.domain);
      } else if (this.options.domain instanceof RegExp) {
        domains.push(this.options.domain);
      }
    }

    if (domains.length === 0) {
      return undefined;
    }

    return domains.length === 1 ? domains[0] : domains;
  }

  /**
   * Returns true when the domain option explicitly includes this origin.
   */
  isExplicitDomainTrust(origin: string): boolean {
    if (!this.options.domain) {
      return false;
    }

    return matchDomain(this.options.domain, origin);
  }

  /**
   * Ensures the messenger trusts the origin for a resolved host URL.
   */
  syncTrustedDomainForUrl(url: string): void {
    const origin = this.resolveUrlOrigin(url);
    if (!origin) {
      return;
    }

    const previousOrigin = this.dynamicUrlTrustedOrigin;
    if (
      previousOrigin &&
      previousOrigin !== origin &&
      !this.isExplicitDomainTrust(previousOrigin)
    ) {
      this.messenger.removeTrustedDomain(previousOrigin);
    }

    this.messenger.addTrustedDomain(origin);
    this.dynamicUrlTrustedOrigin = origin;
  }

  /**
   * Returns the current host domain target used for messaging.
   */
  getHostDomain(): string {
    if (this.openedHostDomain) {
      return this.openedHostDomain;
    }

    return this.resolveUrlOrigin(this.resolveUrl()) ?? '*';
  }

  /**
   * Returns true when the host window is connected and not closed.
   */
  isHostConnected(): boolean {
    return Boolean(this.hostWindow && !isWindowClosed(this.hostWindow));
  }

  /**
   * Serializes host props while keeping function bridge references in sync.
   */
  serializePropsForHost(
    propsForHost: Record<string, unknown>,
    propDefinitions: PropsDefinition<Record<string, unknown>>,
    options?: { finishBatch?: boolean }
  ): SerializedProps {
    this.bridge.startBatch();
    const finishBatch = options?.finishBatch ?? true;
    try {
      const serialized = serializeProps(propsForHost, propDefinitions, this.bridge);
      if (finishBatch) {
        this.bridge.finishBatch();
      }
      return serialized;
    } catch (error) {
      this.bridge.finishBatch(true);
      throw error;
    }
  }

  /**
   * Sends the current props snapshot to the host window when available.
   */
  async sendPropsUpdateToHost(
    nextProps: P,
    propDefinitions: PropsDefinition<P>
  ): Promise<void> {
    if (!this.hostWindow || isWindowClosed(this.hostWindow)) {
      return;
    }

    const hostDomain = this.getHostDomain();
    const propsForHost = getPropsForHost(
      nextProps,
      propDefinitions,
      hostDomain,
      isSameDomain(this.hostWindow)
    );
    const serialized = this.serializePropsForHost(
      propsForHost as Record<string, unknown>,
      propDefinitions as PropsDefinition<Record<string, unknown>>,
      { finishBatch: false }
    );

    try {
      await this.messenger.send(
        this.hostWindow,
        hostDomain,
        MESSAGE_NAME.PROPS,
        serialized
      );
      this.bridge.finishBatch();
    } catch (error) {
      this.bridge.finishBatch(true);
      throw error;
    }
  }

  /**
   * Builds the window.name payload for host initialization.
   */
  buildWindowName(options: {
    tag: string;
    context: ContextType;
    props: P;
    propDefinitions: PropsDefinition<P>;
    hostDomain?: string;
    children?: Record<string, HostComponentRef>;
    exports: ConsumerExports;
  }): string {
    const hostDomain = options.hostDomain ?? this.getHostDomain();
    const propsForHost = getPropsForHost(
      options.props,
      options.propDefinitions,
      hostDomain,
      false
    );

    const serializedProps = this.serializePropsForHost(
      propsForHost as Record<string, unknown>,
      options.propDefinitions as PropsDefinition<Record<string, unknown>>
    );

    const payload = createWindowPayload({
      uid: this.uid,
      tag: options.tag,
      context: options.context,
      consumerDomain: getDomain(),
      props: serializedProps,
      exports: options.exports,
      children: options.children,
    });

    return buildWindowName(payload);
  }

  /**
   * Waits for the host to send the initialization handshake.
   */
  async waitForHost(timeout: number, tag: string, onError: (error: Error) => void): Promise<void> {
    if (this.hostInitialized) {
      return;
    }

    const initPromise = createDeferred<void>();
    this.initPromise = initPromise;

    try {
      await promiseTimeout(
        initPromise.promise,
        timeout,
        `Host component "${tag}" (uid: ${this.uid}) did not initialize within ${timeout}ms. ` +
          'Check that the host page loads correctly and calls the initialization code.'
      );
    } catch (err) {
      onError(err as Error);
      throw err;
    } finally {
      if (this.initPromise === initPromise) {
        this.initPromise = null;
      }
    }
  }

  /**
   * Sets up host message handlers.
   */
  setupMessageHandlers(handlers: ConsumerTransportHandlers<X>): void {
    this.messenger.on(MESSAGE_NAME.INIT, (_data, source) => {
      if (!this.isHostControlSource(source)) {
        return { success: false };
      }

      this.hostInitialized = true;
      if (this.initPromise) {
        this.initPromise.resolve();
      }

      if (handlers.onInit) {
        queueMicrotask(() => {
          void Promise.resolve(handlers.onInit?.()).catch((error) => {
            handlers.onError(error as Error);
          });
        });
      }

      return { success: true };
    });

    this.messenger.on(MESSAGE_NAME.CLOSE, async (_data, source) => {
      if (!this.isHostControlSource(source)) {
        return { success: false };
      }

      await handlers.onClose();
      return { success: true };
    });

    this.messenger.on<Dimensions>(MESSAGE_NAME.RESIZE, async (dimensions, source) => {
      if (!this.isHostControlSource(source)) {
        return { success: false };
      }

      await handlers.onResize(dimensions);
      return { success: true };
    });

    this.messenger.on(MESSAGE_NAME.FOCUS, async (_data, source) => {
      if (!this.isHostControlSource(source)) {
        return { success: false };
      }

      await handlers.onFocus();
      return { success: true };
    });

    this.messenger.on(MESSAGE_NAME.SHOW, async (_data, source) => {
      if (!this.isHostControlSource(source)) {
        return { success: false };
      }

      await handlers.onShow();
      return { success: true };
    });

    this.messenger.on(MESSAGE_NAME.HIDE, async (_data, source) => {
      if (!this.isHostControlSource(source)) {
        return { success: false };
      }

      await handlers.onHide();
      return { success: true };
    });

    this.messenger.on<{ message: string; stack?: string }>(
      MESSAGE_NAME.ERROR,
      async (errorData, source) => {
        if (!this.isHostControlSource(source)) {
          return { success: false };
        }

        const error = new Error(errorData.message);
        error.stack = errorData.stack;
        handlers.onError(error);
        return { success: true };
      }
    );

    this.messenger.on<X>(MESSAGE_NAME.EXPORT, async (exports, source) => {
      if (!this.isHostControlSource(source)) {
        return { success: false };
      }

      handlers.onExport(exports);
      return { success: true };
    });

    this.messenger.on<unknown>(MESSAGE_NAME.CONSUMER_EXPORT, async (data, source) => {
      if (!this.isHostControlSource(source)) {
        return { success: false };
      }

      handlers.onConsumerExport(data);
      return { success: true };
    });

    this.messenger.on<ConsumerSiblingRequest>(
      MESSAGE_NAME.GET_SIBLINGS,
      async (request, source) => {
        if (!this.isHostControlSource(source)) {
          return { success: false };
        }

        return handlers.onGetSiblings(request);
      }
    );
  }

  /**
   * Returns true when a lifecycle/control message came from the opened host window.
   */
  private isHostControlSource(source: VerifiedMessageSource): boolean {
    return Boolean(this.hostWindow && source.window === this.hostWindow);
  }

  /**
   * Destroys transport resources.
   */
  destroy(): void {
    this.messenger.destroy();
    this.bridge.destroy();
  }
}
