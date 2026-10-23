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
 *
 * @remarks
 * The consumer transport supplies the requesting identity and the
 * browser-verified host origin; host-claimed identity fields are not used.
 * @internal
 */
export interface ConsumerSiblingRequest {
	uid: string;
	tag: string;
	/** Browser-verified origin of the requesting host window. */
	hostDomain: string;
	options?: GetPeerInstancesOptions;
}

/**
 * Returns sibling component instances for a host peer lookup.
 * @internal
 */
export function getSiblingInstances(
	request: ConsumerSiblingRequest,
): SiblingInfo[] {
	const indexed =
		request.options?.anyConsumer === true
			? getIndexedComponentInstances()
			: getComponentInstancesByTag(request.tag).map((instance) => ({
					tag: request.tag,
					instance,
				}));
	return selectSiblingInstances(indexed, request.uid, request.hostDomain);
}

/**
 * Selects peer snapshots from supplied indexed instances, excluding the
 * requesting identity and peers whose verified host origin differs from the
 * requester's, so exports never cross host origins.
 * @internal
 */
export function selectSiblingInstances(
	indexed: ReturnType<typeof getIndexedComponentInstances>,
	requestingUid: string,
	requestingHostDomain: string,
): SiblingInfo[] {
	const siblings: SiblingInfo[] = [];
	for (const { tag, instance } of indexed) {
		if (instance.uid === requestingUid) continue;
		if (instance.getVerifiedHostDomain() !== requestingHostDomain) continue;
		siblings.push({ uid: instance.uid, tag, exports: instance.exports });
	}
	return siblings;
}
