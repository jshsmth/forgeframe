/**
 * @packageDocumentation
 * Host runtime coordinator.
 *
 * @remarks
 * This internal module keeps `HostComponent` focused on orchestration. It wires
 * together security checks, message transport, and host props state while
 * preserving the public host runtime surface exported from `src/core/host.ts`.
 */

import { EventEmitter } from '../../events/emitter';
import type {
  DomainMatcher,
  HostProps,
  PropsDefinition,
  WindowNamePayload,
} from '../../types';
import { EMPTY_PROP_DEFINITIONS } from '../../props/definitions';
import { HostPropsRuntime } from './props-runtime';
import {
  reassertAllowedConsumerDomain,
  resolveConsumerSecurityContext,
  resolveConsumerWindow,
} from './security';
import { HostTransport } from './transport';

export class HostComponent<P extends Record<string, unknown>> {
  public event: EventEmitter;

  private uid: string;

  private tag: string;

  private consumerWindow!: Window;

  private consumerDomain!: string;

  private consumerDomainVerified = false;

  private allowedConsumerDomains?: DomainMatcher;

  private transport!: HostTransport;

  private propsRuntime!: HostPropsRuntime<P>;

  private destroyed = false;

  constructor(
    payload: WindowNamePayload<P>,
    propDefinitions: PropsDefinition<P> = EMPTY_PROP_DEFINITIONS as PropsDefinition<P>,
    allowedConsumerDomains?: DomainMatcher,
    deferInit = false
  ) {
    this.uid = payload.uid;
    this.tag = payload.tag;
    this.event = new EventEmitter();
    this.allowedConsumerDomains = allowedConsumerDomains;

    let transport: HostTransport | null = null;
    let propsRuntime: HostPropsRuntime<P> | null = null;

    try {
      this.consumerWindow = resolveConsumerWindow();

      const securityContext = resolveConsumerSecurityContext({
        consumerWindow: this.consumerWindow,
        claimedConsumerDomain: payload.consumerDomain,
        allowedConsumerDomains: this.allowedConsumerDomains,
        tag: this.tag,
      });

      this.consumerDomain = securityContext.consumerDomain;
      this.consumerDomainVerified = securityContext.consumerDomainVerified;

      transport = new HostTransport({
        uid: this.uid,
        tag: this.tag,
        event: this.event,
        consumerWindow: this.consumerWindow,
        consumerDomain: this.consumerDomain,
        getConsumerDomain: () => this.consumerDomain,
        deferInit,
      });
      this.transport = transport;

      propsRuntime = new HostPropsRuntime(propDefinitions, {
        uid: this.uid,
        tag: this.tag,
        event: this.event,
        controls: {
          close: () => this.transport.close(),
          focus: () => this.transport.focus(),
          resize: (dimensions) => this.transport.resize(dimensions),
          show: () => this.transport.show(),
          hide: () => this.transport.hide(),
          onError: (error) => this.transport.onError(error),
          exportData: <T>(exports: T) => this.transport.exportData(exports),
          consumerExport: <T>(data: T) => this.transport.consumerExport(data),
          getPeerInstances: (options) => this.transport.getPeerInstances(options),
        },
        getConsumerWindow: () => this.consumerWindow,
        getConsumerDomain: () => this.consumerDomain,
        isConsumerDomainVerified: () => this.consumerDomainVerified,
        getMessenger: () => this.transport.messenger,
        getBridge: () => this.transport.bridge,
        onFirstHostPropsAccess: () => this.transport.handleHostPropsAccess(),
      });
      this.propsRuntime = propsRuntime;
      Object.defineProperties(this, {
        messenger: {
          configurable: true,
          get: () => this.transport.messenger,
        },
        bridge: {
          configurable: true,
          get: () => this.transport.bridge,
        },
        consumerProps: {
          configurable: true,
          get: () => this.propsRuntime.consumerProps,
        },
        propsHandlers: {
          configurable: true,
          get: () => this.propsRuntime.propsHandlers,
        },
      });

      this.transport.registerPropsHandler({
        isConsumerSource: (source) => source.window === this.consumerWindow,
        applySerializedProps: (serializedProps) =>
          this.propsRuntime.applySerializedProps(serializedProps),
      });

      this.hostProps = this.propsRuntime.initializeHostProps(payload);
      this.propsRuntime.exposeHostProps();

      if (!deferInit) {
        this.flushInit();
      }
    } catch (error) {
      propsRuntime?.destroy();
      transport?.destroy();
      this.event.removeAllListeners();
      throw error;
    }
  }

  public get hostProps(): HostProps<P> {
    return this.propsRuntime.hostProps;
  }

  public set hostProps(value: HostProps<P>) {
    this.propsRuntime.hostProps = value;
  }

  flushInit(): void {
    this.transport.flushInit();
  }

  getProps(): HostProps<P> {
    return this.hostProps;
  }

  getInitError(): Error | null {
    return this.transport.getInitError();
  }

  applyHostConfiguration(
    propDefinitions?: PropsDefinition<P>,
    allowedConsumerDomains?: DomainMatcher
  ): void {
    if (allowedConsumerDomains !== undefined) {
      this.allowedConsumerDomains = allowedConsumerDomains;
    }

    if (propDefinitions === undefined) {
      return;
    }

    this.propsRuntime.applyHostConfiguration(propDefinitions);
  }

  assertAllowedConsumerDomain(allowedConsumerDomains: DomainMatcher): void {
    const securityContext = reassertAllowedConsumerDomain({
      consumerWindow: this.consumerWindow,
      consumerDomain: this.consumerDomain,
      consumerDomainVerified: this.consumerDomainVerified,
      allowedConsumerDomains,
      tag: this.tag,
      onConsumerDomainChange: (previousDomain, nextDomain) => {
        this.transport.updateTrustedConsumerDomain(previousDomain, nextDomain);
      },
    });

    this.consumerDomain = securityContext.consumerDomain;
    this.consumerDomainVerified = securityContext.consumerDomainVerified;
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.transport.destroy();
    this.event.removeAllListeners();
    this.propsRuntime.destroy();
  }
}
