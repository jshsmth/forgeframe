/**
 * @packageDocumentation
 * Consumer sibling lookup helper module.
 *
 * @remarks
 * Encapsulates the indexed-instance queries used to answer host requests for
 * sibling consumer instances without keeping that logic inside the façade.
 */

import type { SiblingInfo } from "../../types/runtime";
import type { DomainMatcher } from "../../types/utility";
import { isOpaqueOrigin } from "../../utils/origin";
import { matchDomain } from "../../window/helpers";
import {
	getComponentInstancesByTag,
	getIndexedComponentInstances,
	type IndexedComponentInstance,
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
	anyConsumer: boolean;
}

/**
 * Peer facts observed from one indexed instance, so selection reads no live state.
 * @internal
 */
export interface PeerCandidate {
	uid: string;
	tag: string;
	/** Browser-verified origin of the instance's connected host, if any. */
	verifiedHostDomain: string | null;
	/** Origin the instance opened its host at, before verification. */
	openedHostDomain: string | null;
	/** Other host origins allowed to discover this instance as a peer. */
	peerDomains: DomainMatcher | undefined;
	exports: unknown;
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
	return selectSiblingInstances(
		indexed.map(({ tag, instance }) => observePeerCandidate(tag, instance)),
		request.uid,
		request.hostDomain,
	);
}

/** Reads the facts peer selection needs from one live instance. */
function observePeerCandidate(
	tag: string,
	instance: IndexedComponentInstance,
): PeerCandidate {
	return {
		uid: instance.uid,
		tag,
		verifiedHostDomain: instance.getVerifiedHostDomain(),
		openedHostDomain: instance.getOpenedHostDomain(),
		peerDomains: instance.getPeerDomains(),
		exports: instance.exports,
	};
}

/**
 * Selects peer snapshots from supplied candidates, excluding the requesting
 * identity, unopened peers, and peers whose host origin differs from the
 * requester's unless the peer's `peerDomains` admit it.
 *
 * @remarks
 * A peer whose host is still loading is matched by the origin it was opened at
 * and listed without exports; only verified hosts share exports.
 * Every opaque origin serializes as `"null"` but is distinct from all others,
 * so opaque hosts neither discover peers nor are listed as peers, even when
 * `peerDomains` would match.
 * @internal
 */
export function selectSiblingInstances(
	candidates: readonly PeerCandidate[],
	requestingUid: string,
	requestingHostDomain: string,
): SiblingInfo[] {
	if (isOpaqueOrigin(requestingHostDomain)) return [];
	const siblings: SiblingInfo[] = [];
	for (const candidate of candidates) {
		if (candidate.uid === requestingUid) continue;
		const peerHostDomain =
			candidate.verifiedHostDomain ?? candidate.openedHostDomain;
		if (peerHostDomain === null || isOpaqueOrigin(peerHostDomain)) continue;
		if (
			peerHostDomain !== requestingHostDomain &&
			!(
				candidate.peerDomains &&
				matchDomain(candidate.peerDomains, requestingHostDomain)
			)
		)
			continue;
		siblings.push({
			uid: candidate.uid,
			tag: candidate.tag,
			exports:
				candidate.verifiedHostDomain === null ? undefined : candidate.exports,
		});
	}
	return siblings;
}
