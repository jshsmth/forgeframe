/**
 * Type-level assertions for v2's secure defaults.
 *
 * Pins the required host allowlist, the `hostOrigins` a function URL needs, the
 * opt-in `peers` option, the top-level `sandbox` option and the peer types.
 */

// @ts-expect-error SiblingInfo was renamed PeerInfo.
import type { SiblingInfo } from "@/index";
import {
	create,
	type GetPeerInstancesOptions,
	type Host,
	initHost,
	type PeerInfo,
	prop,
} from "@/index";

type RemovedSiblingInfo = SiblingInfo;

const Widget = create({
	tag: "typed-secure-widget",
	url: "https://widgets.example.com/widget",
	props: { label: prop.string() },
});

// @ts-expect-error initHost requires an options object with consumerOrigins.
initHost(Widget);
// @ts-expect-error consumerOrigins is required.
initHost(Widget, {});
// @ts-expect-error the tag-agnostic form requires consumerOrigins too.
initHost({ props: { label: prop.string() } });
initHost(Widget, { consumerOrigins: "*" });
initHost(Widget, { consumerOrigins: ["https://shop.example.com", /\.test$/] });

// A static URL may omit hostOrigins.
create({ tag: "typed-static-url", url: "https://widgets.example.com/static" });

// @ts-expect-error a function URL requires hostOrigins.
create({
	tag: "typed-function-url-without-host-origins",
	url: () => "https://widgets.example.com/dynamic",
});

create({
	tag: "typed-function-url-with-host-origins",
	url: (props) => `https://widgets.example.com/${props.path}`,
	hostOrigins: "https://widgets.example.com",
	props: { path: prop.string() },
});

create({
	tag: "typed-function-url-any-origin",
	url: () => "https://tenant.example.com/widget",
	hostOrigins: "*",
});

create({
	tag: "typed-peers-same-origin",
	url: "https://a.example.com",
	peers: "same-origin",
});
create({
	tag: "typed-peers-matcher",
	url: "https://a.example.com",
	peers: ["https://b.example.com", /^https:\/\/c\./],
});
create({
	tag: "typed-peers-false",
	url: "https://a.example.com",
	// @ts-expect-error peers is "same-origin" or an origin matcher; omit it to stay off.
	peers: false,
});

create({
	tag: "typed-peers-renamed-true",
	url: "https://a.example.com",
	// @ts-expect-error peers: true was renamed peers: "same-origin".
	peers: true,
});
create({
	tag: "typed-peer-domains",
	url: "https://a.example.com",
	// @ts-expect-error peerDomains was replaced by peers.
	peerDomains: "https://b.example.com",
});

create({
	tag: "typed-sandbox-string",
	url: "https://a.example.com",
	sandbox: "allow-scripts allow-same-origin",
});
create({
	tag: "typed-sandbox-false",
	url: "https://a.example.com",
	sandbox: false,
});
create({
	tag: "typed-sandbox-attribute",
	url: "https://a.example.com",
	// @ts-expect-error set the sandbox with the sandbox option.
	attributes: { sandbox: "allow-scripts" },
});
// Attribute names are case-insensitive in HTML, but the types check only the
// lowercase key; create() rejects "Sandbox" and an explicit undefined at runtime.
create({
	tag: "typed-sandbox-attribute-case",
	url: "https://a.example.com",
	attributes: { Sandbox: "allow-scripts" },
});

const allTags: GetPeerInstancesOptions = { allTags: true };
// @ts-expect-error anyConsumer was renamed allTags.
const anyConsumer: GetPeerInstancesOptions = { anyConsumer: true };

declare const host: Host<{ label: string }>;
const peers: Promise<PeerInfo[]> = host.getPeerInstances(allTags);

void [anyConsumer, peers];

export type { RemovedSiblingInfo };

// Readonly origin lists, such as `as const` arrays, are accepted everywhere a
// matcher is.
const trustedOrigins = [
	"https://shop.example.com",
	/^https:\/\/[a-z]+\.example\.com$/,
] as const;
create({
	tag: "typed-readonly-origins",
	url: "https://widgets.example.com/widget",
	hostOrigins: trustedOrigins,
	peers: trustedOrigins,
	props: {
		token: { schema: prop.string(), deliverTo: trustedOrigins },
	},
});
initHost(Widget, { consumerOrigins: trustedOrigins });
