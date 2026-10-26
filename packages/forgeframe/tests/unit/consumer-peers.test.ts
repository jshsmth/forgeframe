/**
 * Unit tests for the pure peer policy in `@/core/consumer/peers`.
 *
 * Covers opt-in on both sides, same-origin versus matcher admission, opaque
 * origins and peers whose hosts are still loading, over supplied facts only.
 */
import { afterEach, describe, expect, it } from "vitest";
import { clearComponents, create } from "@/core/component";
import {
	assertPeersEnabled,
	getPeerInstances,
	type PeerCandidate,
	selectPeerInstances,
} from "@/core/consumer/peers";
import { setVerifiedHostOrigin } from "../peer-host-origin";

const REQUESTER_ORIGIN = "https://widgets.example.com";

function candidate(overrides: Partial<PeerCandidate>): PeerCandidate {
	return {
		uid: "peer",
		tag: "peer-tag",
		verifiedHostOrigin: REQUESTER_ORIGIN,
		openedHostOrigin: REQUESTER_ORIGIN,
		peers: true,
		exports: { id: overrides.uid ?? "peer" },
		...overrides,
	};
}

function selectUids(candidates: PeerCandidate[], origin = REQUESTER_ORIGIN) {
	return selectPeerInstances(candidates, "requester", origin).map(
		(peer) => peer.uid,
	);
}

describe("assertPeersEnabled", () => {
	it("refuses a requester whose component has not enabled peers", () => {
		expect(() =>
			assertPeersEnabled({ tag: "private-widget", peers: undefined }),
		).toThrow(
			'Peer discovery is not enabled for component "private-widget". Set peers: true, or an origin matcher, in its create() options.',
		);
	});

	it.each([true, "https://partner.example.com"] as const)(
		"admits a requester with peers: %s",
		(peers) => {
			expect(() =>
				assertPeersEnabled({ tag: "shared-widget", peers }),
			).not.toThrow();
		},
	);
});

describe("selectPeerInstances", () => {
	it("excludes the requester and candidates without peers", () => {
		expect(
			selectUids([
				candidate({ uid: "requester" }),
				candidate({ uid: "listed" }),
				candidate({ uid: "private", peers: undefined }),
			]),
		).toEqual(["listed"]);
	});

	it("lists peers: true only at the requester's own origin", () => {
		expect(
			selectUids([
				candidate({ uid: "same-origin" }),
				candidate({
					uid: "other-origin",
					verifiedHostOrigin: "https://partner.example.com",
				}),
			]),
		).toEqual(["same-origin"]);
	});

	it("lets a matcher on the listed peer admit another requester origin, one way", () => {
		const partner = candidate({
			uid: "partner",
			verifiedHostOrigin: "https://partner.example.com",
			peers: "https://*.example.com",
		});

		expect(selectUids([partner])).toEqual(["partner"]);
		expect(selectUids([partner], "https://evil.test")).toEqual([]);
		expect(
			selectPeerInstances(
				[candidate({ uid: "local", peers: true })],
				"partner",
				"https://partner.example.com",
			),
		).toEqual([]);
	});

	it("never involves opaque origins, even when a matcher would match", () => {
		const opaquePeer = candidate({
			uid: "opaque",
			verifiedHostOrigin: "null",
			peers: "*",
		});

		expect(selectUids([opaquePeer])).toEqual([]);
		expect(
			selectUids([candidate({ uid: "listed", peers: "*" })], "null"),
		).toEqual([]);
	});

	it("lists a loading peer by its opened origin without exports and skips unopened ones", () => {
		expect(
			selectPeerInstances(
				[
					candidate({ uid: "loading", verifiedHostOrigin: null }),
					candidate({
						uid: "unopened",
						verifiedHostOrigin: null,
						openedHostOrigin: null,
					}),
				],
				"requester",
				REQUESTER_ORIGIN,
			),
		).toEqual([{ uid: "loading", tag: "peer-tag", exports: undefined }]);
	});
});

describe("getPeerInstances", () => {
	afterEach(() => {
		clearComponents();
	});

	it("looks up the requester's tag, or every tag with allTags, still only among components with peers", () => {
		const Shared = create({
			tag: "peers-unit-shared",
			url: "https://widgets.example.com/shared",
			peers: true,
		});
		const Other = create({
			tag: "peers-unit-other",
			url: "https://widgets.example.com/other",
			peers: true,
		});
		const Private = create({
			tag: "peers-unit-private",
			url: "https://widgets.example.com/private",
		});
		const requester = Shared();
		const sameTag = Shared();
		const otherTag = Other();
		const privateTag = Private();
		setVerifiedHostOrigin(
			REQUESTER_ORIGIN,
			requester,
			sameTag,
			otherTag,
			privateTag,
		);
		const lookup = (allTags: boolean) =>
			getPeerInstances({
				uid: requester.uid,
				tag: "peers-unit-shared",
				peers: true,
				hostOrigin: REQUESTER_ORIGIN,
				allTags,
			}).map((peer) => peer.uid);

		expect(lookup(false)).toEqual([sameTag.uid]);
		expect(lookup(true).sort()).toEqual([sameTag.uid, otherTag.uid].sort());
	});
});
