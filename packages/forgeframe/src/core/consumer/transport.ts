/**
 * @packageDocumentation
 * Consumer transport subsystem module.
 *
 * @remarks
 * Owns consumer-side messaging, function bridging, trust management, and host
 * handshake concerns for embedded iframe and popup instances.
 */

import type { ConsumerExports } from '../../communication/types';
import type { SerializedProps } from '../../props/types';
import type { SiblingInfo } from '../../types/runtime';
import type { PropsDefinition } from '../../types/props';
import type { Dimensions, DomainMatcher } from '../../types/utility';
import type { HostComponentRef } from '../../window/types';
import { MESSAGE_NAME } from '../../constants';
import { Messenger, type MessageHandler } from '../../communication/messenger';
import { FunctionBridge, deserializeFunctions } from '../../communication/bridge';
import { createDeferred, promiseTimeout } from '../../utils/promise';
import { getDomain, isSameDomain, isWindowClosed } from '../../window/helpers';
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
  SchemaInputs = P,
> {
  /** Messenger for host communication. */
  public messenger: Messenger;

  /** Function bridge for serializing callable props across windows. */
  public bridge: FunctionBridge;

  /** Connected host window reference. */
  public hostWindow: Window | null = null;

  /** Origin of currently opened host content. */
  public openedHostDomain: string | null = null;

  /** Browser-verified origin of the initialized host window. */
  public activeHostDomain: string | null = null;

  /** Dynamic origin currently trusted due to resolved URL. */
  public dynamicUrlTrustedOrigin: string | null = null;

  /** Deferred host initialization handshake promise. */
  public initPromise: ReturnType<typeof createDeferred<void>> | null = null;

  /** Whether host initialization handshake has completed. */
  public hostInitialized = false;

  constructor(
    private uid: string,
    private options: NormalizedOptions<P, SchemaInputs>,
    private resolveUrl: () => string,
    private resolveUrlOrigin: (url: string) => string | null
  ) {
    const trustedDomains = this.buildTrustedDomains();
    this.messenger = new Messenger(this.uid, window, getDomain(), trustedDomains);
    this.bridge = new FunctionBridge(
      this.messenger,
      (source) => Boolean(this.hostWindow && source.window === this.hostWindow)
    );
  }

  /**
   * Builds trusted domains used to initialize messenger security checks.
   */
  private buildTrustedDomains(): DomainMatcher | undefined {
    const domains: Array<string | RegExp> = [];

    if (typeof this.options.url === 'string') {
      const hostOrigin = this.resolveUrlOrigin(this.options.url);
      if (hostOrigin) {
        if (!this.options.domain) {
          domains.push(hostOrigin);
        }
        this.dynamicUrlTrustedOrigin = hostOrigin;
      }
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
   * Ensures the messenger trusts the origin for a resolved host URL.
   */
  syncTrustedDomainForUrl(url: string): void {
    const origin = this.resolveUrlOrigin(url);
    if (!origin) {
      return;
    }

    const previousOrigin = this.dynamicUrlTrustedOrigin;
    if (this.options.domain) {
      this.dynamicUrlTrustedOrigin = origin;
      return;
    }

    if (previousOrigin && previousOrigin !== origin) {
      this.messenger.removeTrustedDomain(previousOrigin);
    }

    this.messenger.addTrustedDomain(origin);
    this.dynamicUrlTrustedOrigin = origin;
  }

  /**
   * Returns the current host domain target used for messaging.
   */
  getHostDomain(): string {
    if (this.activeHostDomain) {
      return this.activeHostDomain;
    }

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
    propDefinitions: PropsDefinition<P, SchemaInputs>
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
    propDefinitions: PropsDefinition<P, SchemaInputs>;
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
    this.onHostControl(MESSAGE_NAME.INIT, (_data, source) => {
      this.activeHostDomain = source.domain;
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

    this.onHostControl(MESSAGE_NAME.CLOSE, async () => {
      await handlers.onClose();
      return { success: true };
    });

    this.onHostControl<Dimensions>(MESSAGE_NAME.RESIZE, async (dimensions) => {
      await handlers.onResize(dimensions);
      return { success: true };
    });

    this.onHostControl(MESSAGE_NAME.FOCUS, async () => {
      await handlers.onFocus();
      return { success: true };
    });

    this.onHostControl(MESSAGE_NAME.SHOW, async () => {
      await handlers.onShow();
      return { success: true };
    });

    this.onHostControl(MESSAGE_NAME.HIDE, async () => {
      await handlers.onHide();
      return { success: true };
    });

    this.onHostControl<{ message: string }>(
      MESSAGE_NAME.ERROR,
      async (errorData) => {
        const error = new Error(errorData.message);
        handlers.onError(error);
        return { success: true };
      }
    );

    this.onHostControl<unknown>(MESSAGE_NAME.EXPORT, async (exports, source) => {
      if (!this.hostWindow) {
        return { success: false };
      }
      handlers.onExport(
        deserializeFunctions(
          exports,
          this.bridge,
          this.hostWindow,
          source.domain
        ) as X
      );
      return { success: true };
    });

    this.onHostControl<unknown>(MESSAGE_NAME.CONSUMER_EXPORT, async (data) => {
      handlers.onConsumerExport(data);
      return { success: true };
    });

    this.onHostControl<ConsumerSiblingRequest>(
      MESSAGE_NAME.GET_SIBLINGS,
      (request) => handlers.onGetSiblings(request)
    );
  }

  /**
   * Registers a host-control message handler behind the opened-window source guard.
   */
  private onHostControl<T = unknown, R = unknown>(
    name: string,
    handler: MessageHandler<T, R>
  ): void {
    this.messenger.on<T, R | { success: false }>(name, (data, source) => {
      if (!this.isHostControlSource(source)) {
        return { success: false };
      }

      return handler(data, source);
    });
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
