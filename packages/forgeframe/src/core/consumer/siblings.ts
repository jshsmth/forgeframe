/**
 * @packageDocumentation
 * Consumer sibling lookup helper module.
 *
 * @remarks
 * Encapsulates the indexed-instance queries used to answer host requests for
 * sibling consumer instances without keeping that logic inside the façade.
 */

import type { SiblingInfo } from "../../types/runtime";
import { matchDomain } from "../../window/helpers";
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
	/** Include peers from all component tags, as normalized by the transport. */
	anyConsumer?: boolean;
}

/**
 * Returns sibling component instances for a host peer lookup.
 * @internal
 */
export function getSiblingInstances(
	request: ConsumerSiblingRequest,
): SiblingInfo[] {
	const indexed = request.anyConsumer
		? getIndexedComponentInstances()
		: getComponentInstancesByTag(request.tag).map((instance) => ({
				tag: request.tag,
				instance,
			}));
	return selectSiblingInstances(indexed, request.uid, request.hostDomain);
}

/** Serialized origin of opaque documents, such as sandboxed frames without `allow-same-origin`. */
const OPAQUE_ORIGIN = "null";

/**
 * Selects peer snapshots from supplied indexed instances, excluding the
 * requesting identity, unconnected peers, and peers whose verified host origin
 * differs from the requester's unless the peer's `peerDomains` admit it.
 *
 * @remarks
 * Every opaque origin serializes as `"null"` but is distinct from all others,
 * so an opaque requester has no peers, even when `peerDomains` would match.
 * @internal
 */
export function selectSiblingInstances(
	indexed: ReturnType<typeof getIndexedComponentInstances>,
	requestingUid: string,
	requestingHostDomain: string,
): SiblingInfo[] {
	if (requestingHostDomain === OPAQUE_ORIGIN) return [];
	const siblings: SiblingInfo[] = [];
	for (const { tag, instance } of indexed) {
		if (instance.uid === requestingUid) continue;
		const peerHostDomain = instance.getVerifiedHostDomain();
		if (peerHostDomain === null) continue;
		const peerDomains = instance.getPeerDomains();
		if (
			peerHostDomain !== requestingHostDomain &&
			!(peerDomains && matchDomain(peerDomains, requestingHostDomain))
		)
			continue;
		siblings.push({ uid: instance.uid, tag, exports: instance.exports });
	}
	return siblings;
}
