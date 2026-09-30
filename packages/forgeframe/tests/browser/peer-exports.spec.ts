import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { build } from "vite";

let consumerOrigin: string;
let hostOrigin: string;
const servers: Server[] = [];

async function listen(server: Server): Promise<string> {
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing port");
	return `http://127.0.0.1:${address.port}`;
}

test.beforeAll(async () => {
	const result = await build({
		configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
		logLevel: "silent",
		build: { write: false },
	});
	const built = Array.isArray(result) ? result[0] : result;
	if (!("output" in built)) throw new Error("Unexpected watch build");
	const bundle = built.output.find((entry) => entry.type === "chunk")?.code;
	if (!bundle) throw new Error("Missing library bundle");
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
			if (req.url === "/library.js")
				return serve(res, bundle, "text/javascript");
			serve(
				res,
				'<!doctype html><div id="requester"></div><div id="sibling"></div><div id="other"></div>',
			);
		}),
	);
	hostOrigin = await listen(
		createServer((req, res) => {
			if (req.url === "/library.js")
				return serve(res, bundle, "text/javascript");
			serve(
				res,
				`<!doctype html><script type="module">
		import {initHost,prop} from '/library.js';
		const host = initHost({label:prop.string(),onRun:prop.function()}, ['${consumerOrigin}']);
		await host.ready;
		window.props = host.hostProps;
		await host.hostProps.export({
			ready:true,
			date:new Date('2026-01-02T03:04:05.678Z'),
			nested:{run:value=>host.hostProps.onRun(value)},
			fail:()=>{throw new Error('peer method failed');}
		});
		window.ready = true;
		</script>`,
			);
		}),
	);
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

test("peer exports retain callable methods and dates across independent prop updates", async ({
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
			const Component = create({
				tag: "browser-peer-exports",
				url: `${hostOrigin}/host`,
				props: {
					label: prop.string(),
					onRun: prop.function<(value: string) => string>(),
				},
			});
			const state = window as unknown as {
				requester: ReturnType<typeof Component>;
				sibling: ReturnType<typeof Component>;
				other: ReturnType<typeof Component>;
			};
			state.requester = Component({
				label: "requester",
				onRun: (value: string) => `requester:${value}`,
			});
			state.sibling = Component({
				label: "sibling",
				onRun: (value: string) => `sibling:${value}`,
			});
			const Other = create({
				tag: "browser-other-peer",
				url: `${hostOrigin}/host`,
				props: {
					label: prop.string(),
					onRun: prop.function<(value: string) => string>(),
				},
			});
			state.other = Other({
				label: "other",
				onRun: (value: string) => `other:${value}`,
			});
			await Promise.all([
				state.requester.render("#requester"),
				state.sibling.render("#sibling"),
				state.other.render("#other"),
			]);
		},
		{ hostOrigin },
	);
	const requesterElement = await page
		.locator("#requester iframe")
		.elementHandle();
	const siblingElement = await page.locator("#sibling iframe").elementHandle();
	const requester = await requesterElement?.contentFrame();
	const sibling = await siblingElement?.contentFrame();
	const otherElement = await page.locator("#other iframe").elementHandle();
	const other = await otherElement?.contentFrame();
	if (!requester || !sibling || !other) throw new Error("Missing peer frames");
	await requester.waitForFunction(
		() => (window as unknown as { ready: boolean }).ready,
	);
	await sibling.waitForFunction(
		() => (window as unknown as { ready: boolean }).ready,
	);
	await other.waitForFunction(
		() => (window as unknown as { ready: boolean }).ready,
	);
	const first = await requester.evaluate(async () => {
		const state = window as unknown as {
			props: { getPeerInstances(): Promise<Array<{ exports?: unknown }>> };
			peer: {
				ready: boolean;
				date: Date;
				nested: { run(value: string): Promise<string> };
				fail(): Promise<void>;
			};
		};
		const peers = await state.props.getPeerInstances();
		state.peer = peers[0]?.exports as typeof state.peer;
		return {
			peers: peers.length,
			ready: state.peer.ready,
			result: await state.peer.nested.run("first"),
			date: state.peer.date.toISOString(),
		};
	});
	expect(first).toEqual({
		peers: 1,
		ready: true,
		date: "2026-01-02T03:04:05.678Z",
		result: "sibling:first",
	});
	await page.evaluate(async () => {
		const state = window as unknown as {
			requester: { updateProps(props: object): Promise<void> };
			sibling: { updateProps(props: object): Promise<void> };
		};
		await state.requester.updateProps({ label: "updated requester" });
		await state.sibling.updateProps({
			onRun: (value: string) => `updated sibling:${value}`,
		});
	});
	expect(
		await requester.evaluate(() =>
			(
				window as unknown as {
					peer: { nested: { run(value: string): Promise<string> } };
				}
			).peer.nested.run("after updates"),
		),
	).toBe("updated sibling:after updates");
	expect(
		await requester.evaluate(async () => {
			try {
				await (
					window as unknown as { peer: { fail(): Promise<void> } }
				).peer.fail();
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
			return "unexpected success";
		}),
	).toBe("peer method failed");
	await sibling.evaluate(async () => {
		await (
			window as unknown as {
				props: { export(data: unknown): Promise<void> };
			}
		).props.export({
			nested: { run: (value: string) => `replacement:${value}` },
		});
	});
	expect(
		await requester.evaluate(async () => {
			try {
				await (
					window as unknown as {
						peer: { nested: { run(value: string): Promise<string> } };
					}
				).peer.nested.run("stale");
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
			return "unexpected success";
		}),
	).toMatch(/Function with id ".+" not found/);
	expect(
		await requester.evaluate(async () => {
			const state = window as unknown as {
				props: {
					getPeerInstances(options?: {
						anyConsumer: boolean;
					}): Promise<Array<{ tag: string; exports?: unknown }>>;
				};
			};
			const peers = await state.props.getPeerInstances({ anyConsumer: true });
			return Promise.all(
				peers.map(async (peer) => ({
					tag: peer.tag,
					result: await (
						peer.exports as { nested: { run(value: string): Promise<string> } }
					).nested.run("fresh"),
				})),
			);
		}),
	).toEqual([
		{ tag: "browser-peer-exports", result: "replacement:fresh" },
		{ tag: "browser-other-peer", result: "other:fresh" },
	]);
});
