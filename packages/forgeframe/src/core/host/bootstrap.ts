/**
 * @packageDocumentation
 * Host bootstrap and singleton lifecycle helpers.
 *
 * @remarks
 * This internal module owns host instance creation, singleton reuse, deferred
 * init flushing decisions, and cleanup for `initHost()`/`clearHostInstance()`.
 */

import type { HostProps } from '../../types/runtime';
import type { HostPropsDefinition } from '../../types/props';
import type { DomainMatcher } from '../../types/utility';
import type { WindowNamePayload } from '../../window/types';
import {
  consumeInitialPayload,
  isForgeFrameWindow,
} from '../../window/name-payload';
import { HostComponent } from './component';
import { CONSUMER_WINDOW_RESOLUTION_ERROR } from './security';

let hostInstance: HostComponent<Record<string, unknown>> | null = null;
let pendingInitialPayload: WindowNamePayload<Record<string, unknown>> | null = null;

function readInitialPayload<P>(): WindowNamePayload<P> | null {
  if (isForgeFrameWindow()) {
    const payload = consumeInitialPayload<P>();
    if (!payload) {
      console.error('Failed to parse ForgeFrame payload from window.name');
      return null;
    }

    pendingInitialPayload = payload as WindowNamePayload<Record<string, unknown>>;
    return payload;
  }

  return pendingInitialPayload as WindowNamePayload<P> | null;
}

export function initHost<P extends Record<string, unknown>>(
  propDefinitions?: HostPropsDefinition<P>,
  allowedConsumerDomains?: DomainMatcher,
  options: { deferInit?: boolean } = {}
): HostComponent<P> | null {
  if (hostInstance) {
    try {
      hostInstance.applyHostConfiguration(
        propDefinitions as
          | HostPropsDefinition<Record<string, unknown>>
          | undefined,
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

  const payload = readInitialPayload<P>();
  if (!payload) {
    return null;
  }

  try {
    const nextHostInstance = new HostComponent(
      payload,
      propDefinitions,
      allowedConsumerDomains,
      options.deferInit ?? false
    ) as HostComponent<Record<string, unknown>>;
    hostInstance = nextHostInstance;
    pendingInitialPayload = null;
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
  pendingInitialPayload = null;

  if (hostInstance) {
    hostInstance.destroy();
    hostInstance = null;
  }

  delete (
    window as unknown as { hostProps?: HostProps<Record<string, unknown>> }
  ).hostProps;
}
