/**
 * @packageDocumentation
 * Consumer peer lookup helper module.
 *
 * @remarks
 * Encapsulates the indexed-instance queries used to answer host requests for
 * peer consumer instances without keeping that logic inside the façade.
 */

import type { PeerInfo } from "../../types/runtime";
import type { DomainMatcher } from "../../types/utility";
import { isOpaqueOrigin } from "../../utils/origin";
import { matchDomain } from "../../window/helpers";
import {
	getComponentInstancesByTag,
	getIndexedComponentInstances,
	type IndexedComponentInstance,
} from "../component-instance-index";

/**
 * A component's `peers` option: omitted, `true`, or an origin matcher.
 * @internal
 */
export type PeersOption = true | DomainMatcher | undefined;

/**
 * Request shape used for consumer peer lookups.
 *
 * @remarks
 * The consumer transport supplies the requesting identity, its component's
 * `peers` setting and the browser-verified host origin; host-claimed identity
 * fields are not used.
 * @internal
 */
export interface ConsumerPeerRequest {
	uid: string;
	tag: string;
	/** The requesting component's `peers` option. */
	peers: PeersOption;
	/** Browser-verified origin of the requesting host window. */
	hostDomain: string;
	/** Include peers from all component tags, as normalized by the transport. */
	allTags: boolean;
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
	/** The instance's component `peers` option. */
	peers: PeersOption;
	exports: unknown;
}

/**
 * Returns peer component instances for a host peer lookup.
 * @throws Error when the requesting component has not enabled `peers`
 * @internal
 */
export function getPeerInstances(request: ConsumerPeerRequest): PeerInfo[] {
	assertPeersEnabled(request);
	const indexed = request.allTags
		? getIndexedComponentInstances()
		: getComponentInstancesByTag(request.tag).map((instance) => ({
				tag: request.tag,
				instance,
			}));
	return selectPeerInstances(
		indexed.map(({ tag, instance }) => observePeerCandidate(tag, instance)),
		request.uid,
		request.hostDomain,
	);
}

/**
 * Refuses discovery for a component that did not opt in, so a host can tell a
 * configuration gap from "no peers right now".
 * @internal
 */
export function assertPeersEnabled(
	request: Pick<ConsumerPeerRequest, "tag" | "peers">,
): void {
	if (request.peers === undefined) {
		throw new Error(
			`Peer discovery is not enabled for component "${request.tag}". Set peers: true, or an origin matcher, in its create() options.`,
		);
	}
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
		peers: instance.getPeers(),
		exports: instance.exports,
	};
}

/**
 * Selects peer snapshots from supplied candidates, excluding the requesting
 * identity, components without `peers`, unopened peers, and peers whose host
 * origin differs from the requester's unless the peer's `peers` matcher
 * admits it.
 *
 * @remarks
 * A peer whose host is still loading is matched by the origin it was opened at
 * and listed without exports; only verified hosts share exports.
 * Every opaque origin serializes as `"null"` but is distinct from all others,
 * so opaque hosts neither discover peers nor are listed as peers, even when
 * a `peers` matcher would match.
 * @internal
 */
export function selectPeerInstances(
	candidates: readonly PeerCandidate[],
	requestingUid: string,
	requestingHostDomain: string,
): PeerInfo[] {
	if (isOpaqueOrigin(requestingHostDomain)) return [];
	const peers: PeerInfo[] = [];
	for (const candidate of candidates) {
		if (candidate.uid === requestingUid || candidate.peers === undefined)
			continue;
		const peerHostDomain =
			candidate.verifiedHostDomain ?? candidate.openedHostDomain;
		if (peerHostDomain === null || isOpaqueOrigin(peerHostDomain)) continue;
		if (
			peerHostDomain !== requestingHostDomain &&
			!(
				candidate.peers !== true &&
				matchDomain(candidate.peers, requestingHostDomain)
			)
		)
			continue;
		peers.push({
			uid: candidate.uid,
			tag: candidate.tag,
			exports:
				candidate.verifiedHostDomain === null ? undefined : candidate.exports,
		});
	}
	return peers;
}
