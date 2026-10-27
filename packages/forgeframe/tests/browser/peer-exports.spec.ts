import { createServer, type Server } from "node:http";
import { expect, type JSHandle, type Page, test } from "@playwright/test";
import { buildLibrary } from "./library-build";

let consumerOrigin: string;
let hostOrigin: string;
let foreignHostOrigin: string;
const servers: Server[] = [];

async function listen(server: Server): Promise<string> {
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing port");
	return `http://127.0.0.1:${address.port}`;
}

test.beforeAll(async () => {
	const library = await buildLibrary();
	const serve = (
		res: import("node:http").ServerResponse,
		body: string,
		type = "text/html",
	) => {
		res.setHeader("Content-Type", type);
		res.end(body);
	};
	consumerOrigin = await listen(
		createServer((req, res) => {
			const libraryFile = library.get(req.url ?? "");
			if (libraryFile !== undefined)
				return serve(res, libraryFile, "text/javascript");
			serve(
				res,
				'<!doctype html><div id="requester"></div><div id="sibling"></div><div id="other"></div>',
			);
		}),
	);
	const serveHost = (
		req: import("node:http").IncomingMessage,
		res: import("node:http").ServerResponse,
	) => {
		const libraryFile = library.get(req.url ?? "");
		if (libraryFile !== undefined)
			return serve(res, libraryFile, "text/javascript");
		if (req.url === "/capacity") {
			return serve(
				res,
				`<!doctype html><script type="module">
				import {initHost,prop} from '/library.js';
				const host = initHost({props:{callbacks:prop.record(prop.function()),onDefault:prop.function()}, consumerOrigins:['${consumerOrigin}']});
				window.props = await host.ready;
				window.ready = true;
				</script>`,
			);
		}
		serve(
			res,
			`<!doctype html><script type="module">
		import {initHost,prop} from '/library.js';
		const host = initHost({props:{label:prop.string(),onRun:prop.function()}, consumerOrigins:['${consumerOrigin}']});
		const props = await host.ready;
		window.host = host;
		await host.export({
			ready:true,
			date:new Date('2026-01-02T03:04:05.678Z'),
			nested:{run:value=>props.onRun(value)},
			fail:()=>{throw new Error('peer method failed');}
		});
		window.ready = true;
		</script>`,
		);
	};
	hostOrigin = await listen(createServer(serveHost));
	// A distinct port is a distinct origin serving the same host page.
	foreignHostOrigin = await listen(createServer(serveHost));
});

test.afterAll(async () => {
	await Promise.all(
		servers.map(
			(server) =>
				new Promise<void>((resolve, reject) =>
					server.close((error) => (error ? reject(error) : resolve())),
				),
		),
	);
});

/** The exports each `/host` page publishes to its peers. */
interface PeerExports {
	ready: boolean;
	date: Date;
	nested: { run(value: string): Promise<string> };
	fail(): Promise<void>;
}

/** The part of a `/host` page's host this file calls. */
interface PeerHost {
	export(data: unknown): Promise<void>;
	getPeerInstances(options?: {
		allTags: boolean;
	}): Promise<Array<{ tag: string; exports?: PeerExports }>>;
}

/**
 * The globals the `/host` and `/capacity` pages' inline module scripts put on
 * `window`. Declared for this module only, so they stay out of the other
 * browser specs.
 */
interface PeerPageGlobals {
	ready?: boolean;
	host: PeerHost;
	props: {
		callbacks: Record<string, () => Promise<number>>;
		onDefault: () => Promise<number>;
	};
}

declare const window: Window & typeof globalThis & PeerPageGlobals;

/** Returns the host of a rendered `/host` frame once its page has initialized. */
async function readyHost(
	page: Page,
	selector: string,
): Promise<JSHandle<PeerHost>> {
	const frame = await (
		await page.locator(`${selector} iframe`).elementHandle()
	)?.contentFrame();
	if (!frame) throw new Error(`Missing ${selector} frame`);
	await frame.waitForFunction(() => window.ready === true);
	return frame.evaluateHandle(() => window.host);
}

/** Discovers every peer of `host` and calls each peer's export. */
function discoverAllTagPeers(host: JSHandle<PeerHost>) {
	return host.evaluate((host) =>
		host.getPeerInstances({ allTags: true }).then((peers) =>
			Promise.all(
				peers.map(async (peer) => ({
					tag: peer.tag,
					result: await peer.exports?.nested.run("probe"),
				})),
			),
		),
	);
}

test("peer exports retain callable methods and dates across independent prop updates", async ({
	page,
}) => {
	await page.goto(consumerOrigin);
	const consumers = await page.evaluateHandle(
		async ({ hostOrigin }) => {
			const libraryUrl = "/library.js";
			const library: typeof import("../../src/index") = await import(
				libraryUrl
			);
			const { create, prop } = library;
			const Component = create({
				tag: "browser-peer-exports",
				peers: "same-origin",
				url: `${hostOrigin}/host`,
				props: {
					label: prop.string(),
					onRun: prop.function<(value: string) => string>(),
				},
			});
			const requester = Component({
				label: "requester",
				onRun: (value: string) => `requester:${value}`,
			});
			const sibling = Component({
				label: "sibling",
				onRun: (value: string) => `sibling:${value}`,
			});
			const Other = create({
				tag: "browser-other-peer",
				peers: "same-origin",
				url: `${hostOrigin}/host`,
				props: {
					label: prop.string(),
					onRun: prop.function<(value: string) => string>(),
				},
			});
			const other = Other({
				label: "other",
				onRun: (value: string) => `other:${value}`,
			});
			await Promise.all([
				requester.render("#requester"),
				sibling.render("#sibling"),
				other.render("#other"),
			]);
			return { requester, sibling };
		},
		{ hostOrigin },
	);
	const requester = await readyHost(page, "#requester");
	const sibling = await readyHost(page, "#sibling");
	await readyHost(page, "#other");
	const discovery = await requester.evaluateHandle(async (host) => {
		const peers = await host.getPeerInstances();
		return { count: peers.length, peer: peers[0]?.exports };
	});
	const first = await discovery.evaluate(async ({ count, peer }) => ({
		peers: count,
		ready: peer?.ready,
		result: await peer?.nested.run("first"),
		date: peer?.date.toISOString(),
	}));
	expect(first).toEqual({
		peers: 1,
		ready: true,
		date: "2026-01-02T03:04:05.678Z",
		result: "sibling:first",
	});
	await consumers.evaluate(async ({ requester, sibling }) => {
		await requester.updateProps({ label: "updated requester" });
		await sibling.updateProps({
			onRun: (value: string) => `updated sibling:${value}`,
		});
	});
	expect(
		await discovery.evaluate(({ peer }) => peer?.nested.run("after updates")),
	).toBe("updated sibling:after updates");
	expect(
		await discovery.evaluate(async ({ peer }) => {
			try {
				await peer?.fail();
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
			return "unexpected success";
		}),
	).toBe("peer method failed");
	await sibling.evaluate(async (host) => {
		await host.export({
			nested: { run: (value: string) => `replacement:${value}` },
		});
	});
	expect(
		await discovery.evaluate(async ({ peer }) => {
			try {
				await peer?.nested.run("stale");
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
			return "unexpected success";
		}),
	).toMatch(/Function with id ".+" not found/);
	expect(
		await requester.evaluate(async (host) => {
			const peers = await host.getPeerInstances({ allTags: true });
			return Promise.all(
				peers.map(async (peer) => ({
					tag: peer.tag,
					result: await peer.exports?.nested.run("fresh"),
				})),
			);
		}),
	).toEqual([
		{ tag: "browser-peer-exports", result: "replacement:fresh" },
		{ tag: "browser-other-peer", result: "other:fresh" },
	]);
});

test("peer discovery does not expose exports across host origins", async ({
	page,
}) => {
	await page.goto(consumerOrigin);
	await page.evaluate(
		async ({ hostOrigin, foreignHostOrigin }) => {
			const libraryUrl = "/library.js";
			const library: typeof import("../../src/index") = await import(
				libraryUrl
			);
			const { create, prop } = library;
			const props = {
				label: prop.string(),
				onRun: prop.function<(value: string) => string>(),
			};
			const Local = create({
				tag: "browser-origin-local",
				peers: "same-origin",
				url: `${hostOrigin}/host`,
				props,
			});
			const Foreign = create({
				tag: "browser-origin-foreign",
				peers: "same-origin",
				url: `${foreignHostOrigin}/host`,
				props,
			});
			await Promise.all([
				Local({
					label: "requester",
					onRun: (value: string) => `requester:${value}`,
				}).render("#requester"),
				Local({
					label: "sibling",
					onRun: (value: string) => `sibling:${value}`,
				}).render("#sibling"),
				Foreign({
					label: "foreign",
					onRun: (value: string) => `foreign:${value}`,
				}).render("#other"),
			]);
		},
		{ hostOrigin, foreignHostOrigin },
	);
	const requester = await readyHost(page, "#requester");
	await readyHost(page, "#sibling");
	const foreign = await readyHost(page, "#other");

	expect(await discoverAllTagPeers(requester)).toEqual([
		{ tag: "browser-origin-local", result: "sibling:probe" },
	]);
	expect(await discoverAllTagPeers(foreign)).toEqual([]);
});

test("a peers matcher admits a named host origin to discover a component's peers", async ({
	page,
}) => {
	await page.goto(consumerOrigin);
	await page.evaluate(
		async ({ hostOrigin, foreignHostOrigin }) => {
			const libraryUrl = "/library.js";
			const library: typeof import("../../src/index") = await import(
				libraryUrl
			);
			const { create, prop } = library;
			const props = {
				label: prop.string(),
				onRun: prop.function<(value: string) => string>(),
			};
			const Local = create({
				tag: "browser-peer-domains-local",
				peers: "same-origin",
				url: `${hostOrigin}/host`,
				props,
			});
			const Partner = create({
				tag: "browser-peer-domains-partner",
				url: `${foreignHostOrigin}/host`,
				props,
				peers: hostOrigin,
			});
			const Private = create({
				tag: "browser-peer-domains-private",
				peers: "same-origin",
				url: `${foreignHostOrigin}/host`,
				props,
			});
			await Promise.all([
				Local({
					label: "local",
					onRun: (value: string) => `local:${value}`,
				}).render("#requester"),
				Private({
					label: "private",
					onRun: (value: string) => `private:${value}`,
				}).render("#sibling"),
				Partner({
					label: "partner",
					onRun: (value: string) => `partner:${value}`,
				}).render("#other"),
			]);
		},
		{ hostOrigin, foreignHostOrigin },
	);
	const local = await readyHost(page, "#requester");
	await readyHost(page, "#sibling");
	const partner = await readyHost(page, "#other");

	// Only the partner admits the local origin; the private component does not.
	expect(await discoverAllTagPeers(local)).toEqual([
		{ tag: "browser-peer-domains-partner", result: "partner:probe" },
	]);
	// The opt-in is one-way: the partner sees its same-origin peer, not the local host.
	expect(await discoverAllTagPeers(partner)).toEqual([
		{ tag: "browser-peer-domains-private", result: "private:probe" },
	]);
});

test("components without peers neither discover nor appear to others", async ({
	page,
}) => {
	await page.goto(consumerOrigin);
	await page.evaluate(
		async ({ hostOrigin }) => {
			const libraryUrl = "/library.js";
			const library: typeof import("../../src/index") = await import(
				libraryUrl
			);
			const { create, prop } = library;
			const props = {
				label: prop.string(),
				onRun: prop.function<(value: string) => string>(),
			};
			const Shared = create({
				tag: "browser-peers-opted-in",
				peers: "same-origin",
				url: `${hostOrigin}/host`,
				props,
			});
			const Private = create({
				tag: "browser-peers-opted-out",
				url: `${hostOrigin}/host`,
				props,
			});
			await Promise.all([
				Shared({
					label: "requester",
					onRun: (value: string) => `requester:${value}`,
				}).render("#requester"),
				Shared({
					label: "shared",
					onRun: (value: string) => `shared:${value}`,
				}).render("#sibling"),
				Private({
					label: "private",
					onRun: (value: string) => `private:${value}`,
				}).render("#other"),
			]);
		},
		{ hostOrigin },
	);
	const requester = await readyHost(page, "#requester");
	await readyHost(page, "#sibling");
	const privateHost = await readyHost(page, "#other");

	expect(await discoverAllTagPeers(requester)).toEqual([
		{ tag: "browser-peers-opted-in", result: "shared:probe" },
	]);
	expect(
		await privateHost.evaluate(async (host) => {
			try {
				await host.getPeerInstances();
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
			return "unexpected success";
		}),
	).toBe(
		'Peer discovery is not enabled for component "browser-peers-opted-out". Set peers: "same-origin", or an origin matcher, in its create() options.',
	);
});

test("callback defaults and atomic capacity recovery", async ({ page }) => {
	await page.goto(consumerOrigin);
	const capacityInstance = await page.evaluateHandle(
		async ({ hostOrigin }) => {
			const libraryUrl = "/library.js";
			const library: typeof import("../../src/index") = await import(
				libraryUrl
			);
			const callback = () => -1;
			const Component = library.create({
				tag: "browser-callback-capacity",
				url: `${hostOrigin}/capacity`,
				props: {
					callbacks: library.prop.record(library.prop.function<() => number>()),
					onDefault: library.prop
						.function<() => number>()
						.default(() => callback),
				},
			});
			const callbacks = Object.fromEntries(
				Array.from({ length: 499 }, (_, index) => [`c${index}`, () => index]),
			);
			const instance = Component({ callbacks });
			await instance.render("#requester");
			return instance;
		},
		{ hostOrigin },
	);
	const frame = await (
		await page.locator("#requester iframe").elementHandle()
	)?.contentFrame();
	if (!frame) throw new Error("Missing capacity frame");
	const hostProps = await frame.evaluateHandle(() => window.props);
	const held = await hostProps.evaluateHandle((props) => {
		const held = props.callbacks.c0;
		if (!held) throw new Error("Missing callback");
		return held;
	});
	const initial = await hostProps.evaluate(
		async (props, held) => [
			await held(),
			await props.callbacks.c498?.(),
			await props.onDefault(),
		],
		held,
	);
	expect(initial).toEqual([0, 498, -1]);
	const error = await capacityInstance.evaluate(async (instance) => {
		try {
			await instance.updateProps({
				callbacks: Object.fromEntries(
					Array.from({ length: 500 }, (_, index) => [
						`c${index}`,
						() => index + 1000,
					]),
				),
			});
			return "unexpected success";
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	});
	expect(error).toContain("500 distinct callback limit");
	expect(await held.evaluate((held) => held())).toBe(0);
	await capacityInstance.evaluate(async (instance) => {
		await instance.updateProps({
			callbacks: Object.fromEntries(
				Array.from({ length: 499 }, (_, index) => [
					`c${index}`,
					() => index + 500,
				]),
			),
		});
	});
	const result = await hostProps.evaluate(async (props, held) => {
		let retired = "unexpected success";
		try {
			await held();
		} catch (error) {
			retired = error instanceof Error ? error.message : String(error);
		}
		return {
			first: await props.callbacks.c0?.(),
			last: await props.callbacks.c498?.(),
			defaulted: await props.onDefault(),
			retired,
		};
	}, held);
	expect(result).toMatchObject({ first: 500, last: 998, defaulted: -1 });
	expect(result.retired).toContain("not found");
});
