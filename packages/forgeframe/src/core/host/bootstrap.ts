/**
 * @packageDocumentation
 * Host bootstrap and singleton lifecycle helpers.
 *
 * @remarks
 * This internal module owns host instance creation, singleton reuse, deferred
 * init flushing decisions, and cleanup for `initHost()`/`clearHostInstance()`.
 */

import type { DomainMatcher, HostProps, PropsDefinition } from '../../types';
import {
  getInitialPayload,
  isForgeFrameWindow,
} from '../../window/name-payload';
import { HostComponent } from './component';
import { CONSUMER_WINDOW_RESOLUTION_ERROR } from './security';

let hostInstance: HostComponent<Record<string, unknown>> | null = null;

export function initHost<P extends Record<string, unknown>>(
  propDefinitions?: PropsDefinition<P>,
  allowedConsumerDomains?: DomainMatcher,
  options: { deferInit?: boolean } = {}
): HostComponent<P> | null {
  if (hostInstance) {
    try {
      hostInstance.applyHostConfiguration(
        propDefinitions as PropsDefinition<Record<string, unknown>> | undefined,
        allowedConsumerDomains
      );

      if (allowedConsumerDomains) {
        hostInstance.assertAllowedConsumerDomain(allowedConsumerDomains);
      }
    } catch (error) {
      clearHostInstance();
      throw error;
    }

    if (!options.deferInit) {
      hostInstance.flushInit();
    }

    return hostInstance as HostComponent<P>;
  }

  if (!isForgeFrameWindow()) {
    return null;
  }

  const payload = getInitialPayload<P>();
  if (!payload) {
    console.error('Failed to parse ForgeFrame payload from window.name');
    return null;
  }

  try {
    hostInstance = new HostComponent(
      payload,
      propDefinitions,
      allowedConsumerDomains,
      options.deferInit ?? false
    ) as HostComponent<Record<string, unknown>>;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === CONSUMER_WINDOW_RESOLUTION_ERROR
    ) {
      return null;
    }

    throw error;
  }

  return hostInstance as HostComponent<P>;
}

export function getHost<P extends Record<string, unknown>>(): HostComponent<P> | null {
  return hostInstance as HostComponent<P> | null;
}

export function clearHostInstance(): void {
  if (hostInstance) {
    hostInstance.destroy();
    hostInstance = null;
  }

  delete (
    window as unknown as { hostProps?: HostProps<Record<string, unknown>> }
  ).hostProps;
}
