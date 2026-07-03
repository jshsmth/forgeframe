/**
 * @packageDocumentation
 * Consumer sibling lookup helper module.
 *
 * @remarks
 * Encapsulates the indexed-instance queries used to answer host requests for
 * sibling consumer instances without keeping that logic inside the façade.
 */

import type { GetPeerInstancesOptions, SiblingInfo } from '../../types/runtime';
import {
  getComponentInstancesByTag,
  getIndexedComponentInstances,
} from '../component';

/**
 * Request shape used for consumer sibling lookups.
 * @internal
 */
export interface ConsumerSiblingRequest {
  uid: string;
  tag: string;
  options?: GetPeerInstancesOptions;
}

/**
 * Returns sibling component instances for a host peer lookup.
 * @internal
 */
export function getSiblingInstances(request: ConsumerSiblingRequest): SiblingInfo[] {
  const siblings: SiblingInfo[] = [];

  if (request.options?.anyConsumer) {
    for (const indexed of getIndexedComponentInstances()) {
      if (indexed.instance.uid === request.uid) {
        continue;
      }

      siblings.push({
        uid: indexed.instance.uid,
        tag: indexed.tag,
        exports: indexed.instance.exports,
      });
    }

    return siblings;
  }

  for (const instance of getComponentInstancesByTag(request.tag)) {
    if (instance.uid === request.uid) {
      continue;
    }

    siblings.push({
      uid: instance.uid,
      tag: request.tag,
      exports: instance.exports,
    });
  }

  return siblings;
}
