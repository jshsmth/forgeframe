/**
 * @packageDocumentation
 * Host runtime messaging and handshake helpers.
 *
 * @remarks
 * This internal module owns the host messenger/function bridge pair, deferred
 * INIT scheduling, outbound control messages, and inbound PROPS message
 * registration for the host runtime.
 */

import { FunctionBridge } from '../../communication/bridge';
import { Messenger } from '../../communication/messenger';
import { EVENT, MESSAGE_NAME } from '../../constants';
import { getDomain } from '../../window/helpers';
import type { SerializedProps } from '../../props/types';
import type {
  GetPeerInstancesOptions,
  SiblingInfo,
} from '../../types/runtime';
import type {
  HostTransportOptions,
  HostTransportPropsHandler,
} from './types';

export class HostTransport {
  public messenger: Messenger;

  public bridge: FunctionBridge;

  private destroyed = false;

  private initSent = false;

  private initError: Error | null = null;

  private deferredInitFlushScheduled = false;

  constructor(private options: HostTransportOptions) {
    this.messenger = new Messenger(
      this.options.uid,
      window,
      getDomain(),
      this.options.consumerDomain
    );
    this.bridge = new FunctionBridge(this.messenger);
  }

  registerPropsHandler(handler: HostTransportPropsHandler): void {
    this.messenger.on<SerializedProps>(MESSAGE_NAME.PROPS, (serializedProps, source) => {
      if (!handler.isConsumerSource(source)) {
        return { success: false };
      }

      return handler.applySerializedProps(serializedProps);
    });
  }

  handleHostPropsAccess(): void {
    if (this.options.deferInit && !this.initSent && !this.destroyed) {
      this.scheduleDeferredInitFlush();
    }
  }

  flushInit(): void {
    if (this.destroyed || this.initSent) {
      return;
    }

    this.initSent = true;
    void this.sendInit();
  }

  getInitError(): Error | null {
    return this.initError;
  }

  updateTrustedConsumerDomain(previousDomain: string, nextDomain: string): void {
    if (!previousDomain || previousDomain === nextDomain) {
      return;
    }

    this.messenger.removeTrustedDomain(previousDomain);
    this.messenger.addTrustedDomain(nextDomain);
  }

  async close(): Promise<void> {
    await this.sendMessage(MESSAGE_NAME.CLOSE, {});
  }

  async focus(): Promise<void> {
    window.focus();
    await this.sendMessage(MESSAGE_NAME.FOCUS, {});
  }

  async resize(dimensions: { width?: string | number; height?: string | number }): Promise<void> {
    await this.sendMessage(MESSAGE_NAME.RESIZE, dimensions);
  }

  async show(): Promise<void> {
    await this.sendMessage(MESSAGE_NAME.SHOW, {});
  }

  async hide(): Promise<void> {
    await this.sendMessage(MESSAGE_NAME.HIDE, {});
  }

  async onError(error: Error): Promise<void> {
    await this.sendMessage(MESSAGE_NAME.ERROR, {
      message: error.message,
      stack: error.stack,
    });
  }

  async exportData<T>(exports: T): Promise<void> {
    await this.sendMessage(MESSAGE_NAME.EXPORT, exports);
  }

  async consumerExport<T>(data: T): Promise<void> {
    await this.sendMessage(MESSAGE_NAME.CONSUMER_EXPORT, data);
  }

  async getPeerInstances(
    options?: GetPeerInstancesOptions
  ): Promise<SiblingInfo[]> {
    const response = await this.messenger.send<
      { uid: string; tag: string; options?: GetPeerInstancesOptions },
      SiblingInfo[]
    >(
      this.options.consumerWindow,
      this.options.getConsumerDomain(),
      MESSAGE_NAME.GET_SIBLINGS,
      {
        uid: this.options.uid,
        tag: this.options.tag,
        options,
      }
    );

    return response ?? [];
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.deferredInitFlushScheduled = false;
    this.messenger.destroy();
    this.bridge.destroy();
  }

  private scheduleDeferredInitFlush(): void {
    if (this.deferredInitFlushScheduled || this.destroyed || this.initSent) {
      return;
    }

    this.deferredInitFlushScheduled = true;
    queueMicrotask(() => {
      this.deferredInitFlushScheduled = false;
      this.flushInit();
    });
  }

  private async sendInit(): Promise<void> {
    try {
      await this.sendMessage(MESSAGE_NAME.INIT, {
        uid: this.options.uid,
        tag: this.options.tag,
      });
    } catch (error) {
      const initError = error instanceof Error ? error : new Error(String(error));
      this.initError = initError;

      this.options.event.emit(EVENT.ERROR, {
        type: 'init_failed',
        message: `Failed to initialize host component: ${initError.message}`,
        error: initError,
      });

      console.error('Failed to send init message:', error);
    }
  }

  private async sendMessage<T>(name: string, data: T): Promise<void> {
    await this.messenger.send(
      this.options.consumerWindow,
      this.options.getConsumerDomain(),
      name,
      data
    );
  }
}
