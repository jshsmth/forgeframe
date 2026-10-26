/**
 * Integration tests for the bootstrap protocol version across two windows.
 *
 * Covers the channel metadata a v2 consumer writes into `window.name`, the
 * INIT and GET_PEERS wire fields, the host's refusal of payloads from
 * other ForgeFrame major versions, and what `isHost()` reports for each.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { deserializeMessage } from "@/communication/protocol";
import { MESSAGE_NAME, PROTOCOL_VERSION } from "@/constants";
import { getHost } from "@/core/host/bootstrap";
import { create, isHost, prop } from "@/index";
import {
	createIframeIntegrationHarness,
	type IframeIntegrationHarness,
} from "./helpers";

const PREFIX = "__forgeframe__";

/** Decodes the JSON value inside a ForgeFrame window name. */
function decodeWindowName(name: string): Record<string, unknown> {
	return JSON.parse(decodeURIComponent(atob(name.slice(PREFIX.length))));
}

/** Encodes a payload the way a 0.x or 1.x consumer wrote it. */
function encodeWindowName(payload: Record<string, unknown>): string {
	return `${PREFIX}${btoa(encodeURIComponent(JSON.stringify(payload)))}`;
}

/** Reads the ForgeFrame requests the host posted to the consumer window. */
function readPostedRequests(postMessage: { mock: { calls: unknown[][] } }) {
	return postMessage.mock.calls
		.map(([data]) => deserializeMessage(data))
		.filter((message) => message?.type === "request");
}

describe("Bootstrap protocol version", () => {
	let harness: IframeIntegrationHarness | null = null;
	// Aborted after each test, so a failed assertion cannot leak listeners.
	let listeners = new AbortController();

	afterEach(async () => {
		listeners.abort();
		listeners = new AbortController();
		await harness?.cleanup();
		harness = null;
		vi.restoreAllMocks();
	});

	it("writes only channel metadata and sends INIT and GET_PEERS without claimed identity", async () => {
		harness = createIframeIntegrationHarness();
		const definitions = { amount: prop.number() };
		const Component = create({
			tag: "protocol-version-metadata",
			peers: true,
			url: "https://host.example.com/widget",
			props: definitions,
		});
		const container = document.createElement("div");
		document.body.append(container);
		const instance = Component({ amount: 7 });
		const posted = vi.spyOn(harness.consumerWindow, "postMessage");

		const rendering = instance.render(container);
		const { host, hostProps, iframe } = await harness.bootstrapIframeHost(
			container,
			definitions,
		);
		await expect(rendering).resolves.toBeUndefined();

		expect(harness.hostWindow.name).toBe(iframe.name);
		expect(decodeWindowName(harness.hostWindow.name)).toEqual({
			uid: instance.uid,
			tag: "protocol-version-metadata",
			protocolVersion: PROTOCOL_VERSION,
			context: "iframe",
			consumerDomain: harness.consumerOrigin,
		});
		expect(hostProps.amount).toBe(7);

		const init = readPostedRequests(posted).filter(
			(message) => message?.name === MESSAGE_NAME.INIT,
		);
		expect(init).toHaveLength(1);
		expect(init[0]?.data).toEqual({ sessionId: expect.any(String) });

		await expect(host.getPeerInstances({ allTags: true })).resolves.toEqual([]);
		const siblings = readPostedRequests(posted).filter(
			(message) => message?.name === MESSAGE_NAME.GET_PEERS,
		);
		expect(siblings.map((message) => message?.data)).toEqual([
			{ options: { allTags: true } },
		]);
	});

	it.each([
		{
			label: "a 0.x payload without a protocol",
			fields: { version: "0.9.0" },
			message:
				'ForgeFrame host for "protocol-version-legacy" cannot start: the consumer uses ForgeFrame 0.x (no protocol version, package 0.9.0). Upgrade the consumer and host to ForgeFrame 2 together.',
		},
		{
			label: "a 0.x payload with protocol 1",
			fields: { protocolVersion: 1 },
			message:
				'ForgeFrame host for "protocol-version-legacy" cannot start: the consumer uses ForgeFrame 0.x (protocol 1). Upgrade the consumer and host to ForgeFrame 2 together.',
		},
		{
			label: "a 1.x payload",
			fields: { version: "1.1.0", protocolVersion: 2 },
			message:
				'ForgeFrame host for "protocol-version-legacy" cannot start: the consumer uses ForgeFrame 1.x (protocol 2, package 1.1.0). Upgrade the consumer and host to ForgeFrame 2 together.',
		},
		{
			label: "a payload from a newer protocol",
			fields: { version: "3.0.0", protocolVersion: PROTOCOL_VERSION + 1 },
			message: `ForgeFrame host for "protocol-version-legacy" cannot start: the consumer uses a newer ForgeFrame protocol (protocol ${PROTOCOL_VERSION + 1}, package 3.0.0). Upgrade the host to the consumer's ForgeFrame version.`,
		},
	])(
		"refuses $label without contacting the consumer",
		async ({ fields, message }) => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const Component = create({
				tag: "protocol-version-legacy",
				url: "https://host.example.com/widget",
				props: { amount: prop.number() },
			});
			const container = document.createElement("div");
			document.body.append(container);
			const rendering = Component({ amount: 7 }).render(container);
			// Cleanup cancels this render; the host never answers it.
			void rendering.catch(() => {});
			activeHarness.attachHostToIframe(
				await activeHarness.waitForIframe(container),
			);
			const posted = vi.spyOn(activeHarness.consumerWindow, "postMessage");
			const consumerMessages = vi.fn();
			activeHarness.consumerWindow.addEventListener(
				"message",
				consumerMessages,
				{ signal: listeners.signal },
			);
			activeHarness.hostWindow.name = encodeWindowName({
				uid: "legacy-consumer-uid",
				tag: "protocol-version-legacy",
				context: "iframe",
				consumerDomain: activeHarness.consumerOrigin,
				props: { amount: 999999, payee: "attacker" },
				exports: { init: MESSAGE_NAME.INIT, close: MESSAGE_NAME.CLOSE },
				...fields,
			});
			// The page must reach initHost() and its upgrade error.
			expect(activeHarness.withHostGlobals(() => isHost())).toBe(true);

			expect(() =>
				activeHarness.bootstrapHost({ amount: prop.number() }),
			).toThrow(message);
			await activeHarness.flushMessages();

			expect(posted).not.toHaveBeenCalled();
			expect(consumerMessages).not.toHaveBeenCalled();
			expect(getHost()).toBeNull();
		},
	);

	it("returns null for a stale older payload in a window with no consumer", () => {
		harness = createIframeIntegrationHarness();
		const activeHarness = harness;
		// A top-level window: no parent other than itself, and no opener.
		Object.defineProperty(activeHarness.hostWindow, "parent", {
			configurable: true,
			value: activeHarness.hostWindow,
		});
		activeHarness.hostWindow.name = encodeWindowName({
			uid: "stale-consumer-uid",
			tag: "protocol-version-stale",
			version: "1.1.0",
			protocolVersion: 2,
			context: "popup",
			consumerDomain: activeHarness.consumerOrigin,
			props: {},
		});
		const errors = vi.spyOn(console, "error");

		expect(activeHarness.bootstrapHost({ amount: prop.number() })).toBeNull();
		expect(getHost()).toBeNull();
		expect(errors).not.toHaveBeenCalled();
	});

	describe("isHost()", () => {
		it("is true for a current payload and stays true after destroy()", async () => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			const definitions = { amount: prop.number() };
			const Component = create({
				tag: "protocol-version-is-host",
				url: "https://host.example.com/widget",
				props: definitions,
			});
			const container = document.createElement("div");
			document.body.append(container);
			const rendering = Component({ amount: 7 }).render(container);
			activeHarness.attachHostToIframe(
				await activeHarness.waitForIframe(container),
			);
			expect(activeHarness.withHostGlobals(() => isHost())).toBe(true);

			const host = activeHarness.bootstrapHost(definitions);
			if (!host) throw new Error("Expected a host");
			await host.ready;
			await expect(rendering).resolves.toBeUndefined();
			expect(activeHarness.withHostGlobals(() => isHost())).toBe(true);

			activeHarness.withHostGlobals(() => host.destroy());
			expect(activeHarness.withHostGlobals(() => isHost())).toBe(true);
		});

		it.each([
			["an undecodable payload", `${PREFIX}%%%`],
			["a payload with no channel metadata", encodeWindowName({ tag: "x" })],
			[
				"a current payload missing its consumer",
				encodeWindowName({
					uid: "uid",
					tag: "protocol-version-malformed",
					protocolVersion: PROTOCOL_VERSION,
					context: "iframe",
				}),
			],
		])("is false for %s after the prefix", (_label, name) => {
			harness = createIframeIntegrationHarness();
			const activeHarness = harness;
			activeHarness.hostWindow.name = name;

			expect(activeHarness.withHostGlobals(() => isHost())).toBe(false);
		});
	});
});
