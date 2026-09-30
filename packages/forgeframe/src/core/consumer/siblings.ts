/**
 * @packageDocumentation
 * Consumer sibling lookup helper module.
 *
 * @remarks
 * Encapsulates the indexed-instance queries used to answer host requests for
 * sibling consumer instances without keeping that logic inside the façade.
 */

import type { GetPeerInstancesOptions, SiblingInfo } from "../../types/runtime";
import {
	getComponentInstancesByTag,
	getIndexedComponentInstances,
} from "../component-instance-index";

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
export function getSiblingInstances(
	request: ConsumerSiblingRequest,
): SiblingInfo[] {
	const indexed = request.options?.anyConsumer
		? getIndexedComponentInstances()
		: getComponentInstancesByTag(request.tag).map((instance) => ({
				tag: request.tag,
				instance,
			}));
	return selectSiblingInstances(indexed, request.uid);
}

/** Selects peer snapshots from supplied indexed instances, excluding the requesting identity. @internal */
export function selectSiblingInstances(
	indexed: ReturnType<typeof getIndexedComponentInstances>,
	requestingUid: string,
): SiblingInfo[] {
	const siblings: SiblingInfo[] = [];
	for (const { tag, instance } of indexed) {
		if (instance.uid === requestingUid) continue;
		siblings.push({ uid: instance.uid, tag, exports: instance.exports });
	}
	return siblings;
}
