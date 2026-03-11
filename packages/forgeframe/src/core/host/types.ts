/**
 * @packageDocumentation
 * Shared internal host runtime types.
 *
 * @remarks
 * This internal module defines the collaboration contracts used by the host
 * bootstrap, transport, security, and props runtime modules so they can share
 * explicit state without reaching through each other's implementations.
 */

import type { FunctionBridge } from '../../communication/bridge';
import type { MessageHandler, Messenger } from '../../communication/messenger';
import type { EventEmitter } from '../../events/emitter';
import type {
  Dimensions,
  DomainMatcher,
  GetPeerInstancesOptions,
  HostProps,
  PropsDefinition,
  SerializedProps,
  SiblingInfo,
} from '../../types';

export type VerifiedMessageSource = Parameters<MessageHandler>[1];

export interface HostSecurityContext {
  consumerDomain: string;
  consumerDomainVerified: boolean;
}

export interface HostPropsRuntimeControls {
  close(): Promise<void>;
  focus(): Promise<void>;
  resize(dimensions: Dimensions): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  onError(error: Error): Promise<void>;
  exportData<T>(exports: T): Promise<void>;
  consumerExport<T>(data: T): Promise<void>;
  getPeerInstances(options?: GetPeerInstancesOptions): Promise<SiblingInfo[]>;
}

export interface HostPropsRuntimeOptions {
  uid: string;
  tag: string;
  event: EventEmitter;
  controls: HostPropsRuntimeControls;
  getConsumerWindow(): Window;
  getConsumerDomain(): string;
  isConsumerDomainVerified(): boolean;
  getMessenger(): Messenger;
  getBridge(): FunctionBridge;
  onFirstHostPropsAccess(): void;
}

export interface HostTransportOptions {
  uid: string;
  tag: string;
  event: EventEmitter;
  consumerWindow: Window;
  consumerDomain: string;
  getConsumerDomain(): string;
  deferInit: boolean;
}

export interface HostTransportPropsHandler {
  isConsumerSource(source: VerifiedMessageSource): boolean;
  applySerializedProps(serializedProps: SerializedProps): { success: true };
}

export interface HostHostConfiguration<P extends Record<string, unknown>> {
  propDefinitions?: PropsDefinition<P>;
  allowedConsumerDomains?: DomainMatcher;
}

export interface WindowWithHostProps<P extends Record<string, unknown>> extends Window {
  hostProps?: HostProps<P>;
}
