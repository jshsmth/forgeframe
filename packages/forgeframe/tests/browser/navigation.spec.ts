import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { build } from "vite";

/** The only fields a v2 consumer writes into window.name. */
const CHANNEL_METADATA_KEYS = [
	"consumerDomain",
	"context",
	"protocolVersion",
	"tag",
	"uid",
];

let consumerOrigin: string;
let hostOrigin: string;
let attackerOrigin: string;
const servers: Server[] = [];
let bundle: string;
const deliveryRequests: Array<{ url: string; method: string; body: string }> =
	[];

function respondToDelivery(
	req: import("node:http").IncomingMessage,
	res: import("node:http").ServerResponse,
): void {
	let body = "";
	req.on("data", (chunk) => {
		body += String(chunk);
	});
	req.on("end", () => {
		deliveryRequests.push({
			url: req.url ?? "",
			method: req.method ?? "",
			body,
		});
		respond(
			res,
			`<!doctype html><script type="module">
		import {initHost,prop} from '/library.js';
		window.unhandled = []; window.notifications = [];
		window.addEventListener('unhandledrejection', event => { window.unhandled.push(String(event.reason)); });
		const host = initHost({props:{count:prop.number(),allowed:prop.string(),restricted:prop.string().optional()}, consumerOrigins:['${consumerOrigin}']});
		await host.ready; window.received = host.hostProps; window.ready = true;
		host.hostProps.onProps(async () => { throw new Error('async observer failure'); });
		host.hostProps.onProps(props => window.notifications.push(props.count));
		</script>`,
		);
	});
}

async function listen(server: Server): Promise<number> {
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing server port");
	return address.port;
}

function respond(
	res: import("node:http").ServerResponse,
	body: string,
	contentType = "text/html",
): void {
	res.setHeader("Content-Type", contentType);
	res.end(body);
}

test.beforeAll(async () => {
	const result = await build({
		configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
		logLevel: "silent",
		build: { write: false },
	});
	const built = Array.isArray(result) ? result[0] : result;
	if (!("output" in built)) throw new Error("Unexpected watch build");
	const output = built.output;
	const chunk = output.find((entry) => entry.type === "chunk");
	if (!chunk) throw new Error("Missing library bundle");
	bundle = chunk.code;

	consumerOrigin = `http://127.0.0.1:${await listen(
		createServer((req, res) => {
			if (req.url === "/library.js")
				return respond(res, bundle, "text/javascript");
			res.setHeader("Referrer-Policy", "no-referrer");
			respond(res, '<!doctype html><div id="mount"></div>');
		}),
	)}`;
	hostOrigin = `http://127.0.0.1:${await listen(
		createServer((req, res) => {
			if (req.url === "/library.js")
				return respond(res, bundle, "text/javascript");
			if (
				new URL(req.url ?? "/", "http://fixture.invalid").pathname.endsWith(
					"/delivery",
				)
			)
				return respondToDelivery(req, res);
			if (req.url === "/redirect" || req.url === "/allowed-redirect") {
				res.writeHead(302, {
					Location: `${attackerOrigin}${req.url === "/allowed-redirect" ? "/allowed-host" : "/capture"}`,
				});
				return res.end();
			}
			if (req.url === "/legacy") {
				return respond(
					res,
					`<!doctype html><script>
			const payload = JSON.parse(decodeURIComponent(atob(window.name.slice('__forgeframe__'.length))));
			parent.postMessage('forgeframe:' + JSON.stringify({ id:'legacy-init',type:'request',name:'forgeframe_init',data:{},source:{uid:payload.uid,domain:location.origin}}), '${consumerOrigin}');
			</script>`,
				);
			}
			if (req.url === "/v2-host-for-v1-consumer") {
				return respond(
					res,
					`<!doctype html><script type="module">
			import {initHost,prop} from '/library.js';
			try { initHost({props:{count:prop.number()}, consumerOrigins:['${consumerOrigin}']}); window.outcome = 'started'; }
			catch (error) { window.outcome = error.message; }
			// Messages from one window arrive in order, so this marks the end of host traffic.
			parent.postMessage('v2-host-finished', '${consumerOrigin}');
			</script>`,
				);
			}
			if (req.url === "/encoded-props")
				return respond(
					res,
					`<!doctype html><script type="module">
			import {initHost,prop} from '/library.js';
			const host = initHost({props:{config:prop.object({onComplete:prop.function(),list:prop.array(prop.function()),date:prop.date()}),label:prop.string().optional()}, consumerOrigins:['${consumerOrigin}']});
			await host.ready; window.received = host.hostProps; window.ready = true;
			</script>`,
				);
			if (req.url === "/record-props") {
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost,prop} from '/library.js';
				const host = initHost({props:{record:prop.any()}, consumerOrigins:['${consumerOrigin}']});
				await host.ready;
				window.received = host.hostProps;
				await host.hostProps.export({record:host.hostProps.record});
				window.ready = true;
				</script>`,
				);
			}
			if (req.url === "/rejected-export") {
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost} from '/library.js';
				const host = initHost({consumerOrigins:['${consumerOrigin}']});
				await host.ready;
				await host.hostProps.export({ready:true});
				try { await host.hostProps.export({ready:'yes'}); window.rejection = 'none'; }
				catch (error) { window.rejection = error.message; }
				window.ready = true;
				</script>`,
				);
			}
			if (req.url === "/hidden-on-ready") {
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost} from '/library.js';
				const host = initHost({consumerOrigins:['${consumerOrigin}'], autoInit:false});
				const props = await host.ready;
				await props.hide();
				host.init();
				window.ready = true;
				</script>`,
				);
			}
			if (req.url === "/realm-values") {
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost,prop} from '/library.js';
				const host = initHost({props:{createdAt:prop.date(), config:prop.any(), record:prop.record(prop.string())}, consumerOrigins:['${consumerOrigin}']});
				await host.ready; window.received = host.hostProps; window.ready = true;
				</script>`,
				);
			}
			if (req.url === "/early-update") {
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost,prop} from '/library.js';
				(window.opener || window.parent).postMessage('forgeframe-test-host-started', '${consumerOrigin}');
				const host = initHost({props:{count:prop.number(),secret:prop.string(),onComplete:prop.function()}, consumerOrigins:['${consumerOrigin}']});
				await host.ready; window.received = host.hostProps; window.ready = true;
				</script>`,
				);
			}
			if (req.url === "/destroy-host") {
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost,prop} from '/library.js';
				window.calls = 0;
				const host = initHost({props:{count:prop.number(),secret:prop.string(),onComplete:prop.function()}, consumerOrigins:['${consumerOrigin}']});
				await host.ready;
				await host.hostProps.export({
					destroy: () => { host.destroy(); },
					value: () => ++window.calls,
				});
				window.ready = true;
				</script>`,
				);
			}
			if (req.url === "/popup-resize") {
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost,prop} from '/library.js';
				window.resizeCalls = [];
				const resizeTo = window.resizeTo.bind(window);
				window.resizeTo = (width, height) => { window.resizeCalls.push([width, height]); resizeTo(width, height); };
				const host = initHost({props:{count:prop.number(),secret:prop.string(),onComplete:prop.function()}, consumerOrigins:['${consumerOrigin}']});
				await host.ready; window.received = host.hostProps; window.ready = true;
				</script>`,
				);
			}
			if (req.url === "/retry") {
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost,prop} from '/library.js';
				const failed = initHost({props:{count:prop.string()}, consumerOrigins:['${consumerOrigin}']});
				try { await failed.ready; } catch(error) { window.firstError = error.message; }
				const host = initHost({props:{count:prop.number(),secret:prop.string(),onComplete:prop.function()}, consumerOrigins:['${consumerOrigin}']});
				window.reusedFailedHost = host === failed;
				await host.ready; window.received = host.hostProps; window.ready = true;
				</script>`,
				);
			}
			if (req.url === "/tag-mismatch") {
				return respond(
					res,
					`<!doctype html><script type="module">
				import {create,initHost} from '/library.js';
				const Other = create({tag:'browser-navigation-other',url:location.href});
				try { initHost(Other, {consumerOrigins:['${consumerOrigin}']}); window.outcome = 'started'; }
				catch (error) { window.outcome = error.message; }
				</script>`,
				);
			}
			if (req.url === "/factory-retry") {
				return respond(
					res,
					`<!doctype html><script type="module">
				import {create,initHost,prop} from '/library.js';
				let reject = true;
				const count = {'~standard': {version:1,vendor:'retry-fixture',validate(value) {
					return reject ? {issues:[{message:'temporary rejection'}]} : prop.number()['~standard'].validate(value);
				}}};
				const Component = create({tag:'browser-navigation-review',url:location.href,props:{count,secret:prop.string(),onComplete:prop.function()}});
				const options = {consumerOrigins:['${consumerOrigin}']};
				const failed = initHost(Component, options);
				try { await failed.ready; } catch(error) { window.firstError = error.message; }
				reject = false;
				const host = initHost(Component, options);
				window.received = await host.ready;
				window.sameHostProps = window.received === host.hostProps;
				window.freshHostProps = host.hostProps !== failed.hostProps;
				window.ready = true;
				</script>`,
				);
			}
			respond(
				res,
				`<!doctype html><button id="complete" style="position:absolute;top:400px">Complete payment</button>
		<script type="module">
		import {initHost,prop} from '/library.js';
		const host = initHost({props:{count:prop.number(),secret:prop.string(),onComplete:prop.function()}, consumerOrigins:['${consumerOrigin}']});
		try { await host.ready; window.received = host.hostProps; window.ready = true; }
		catch(error) { window.readyError = error.message; }
		</script>`,
			);
		}),
	)}`;
	attackerOrigin = `http://localhost:${await listen(
		createServer((req, res) => {
			if (req.url === "/library.js")
				return respond(res, bundle, "text/javascript");
			if (
				new URL(req.url ?? "/", "http://fixture.invalid").pathname.endsWith(
					"/delivery",
				)
			)
				return respondToDelivery(req, res);
			if (req.url === "/opaque-host") {
				// A CSP sandbox without allow-same-origin gives the document an
				// opaque origin, as an iframe sandbox without it would.
				res.setHeader("Content-Security-Policy", "sandbox allow-scripts");
				return respond(
					res,
					`<!doctype html><script type="module">
				const { initHost, prop } = await import("${attackerOrigin}/library.js");
				const host = initHost({props:{label:prop.string()}, consumerOrigins:"*"});
				host?.ready.then(() => { window.ready = true; }, () => {});
				</script>`,
				);
			}
			if (req.url === "/any-consumer" || req.url === "/excluded-consumer")
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost,prop} from "/library.js";
				const consumerOrigins = ${JSON.stringify(req.url === "/any-consumer" ? "*" : ["https://excluded.example"])};
				const host = initHost({props:{label:prop.string()}, consumerOrigins});
				host.ready.then(props => { window.consumerDomain = props.getConsumerDomain(); window.label = props.label; window.ready = true; },
					error => { window.failure = error.message; });
				</script>`,
				);
			if (req.url === "/allowed-host")
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost} from "/library.js";
				const host = initHost({consumerOrigins:["${consumerOrigin}"]});
				await host.ready; window.received = host.hostProps; window.ready = true;
				</script>`,
				);
			respond(
				res,
				`<!doctype html><script>window.captured = JSON.parse(decodeURIComponent(atob(window.name.slice('__forgeframe__'.length))));</script>`,
			);
		}),
	)}`;
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

async function mount(
	page: import("@playwright/test").Page,
	path: string,
	context: "iframe" | "popup" = "iframe",
	allowRedirect = false,
) {
	await page.goto(consumerOrigin);
	await page.evaluate(
		async ({ hostOrigin, attackerOrigin, path, context, allowRedirect }) => {
			const libraryUrl = "/library.js";
			const { create, prop } = await import(libraryUrl);
			const reviewWindow = window as unknown as {
				instance: import("../../src/types").ComponentInstance<
					Record<string, unknown>
				>;
				outcome: Promise<string>;
				calls: number;
			};
			reviewWindow.calls = 0;
			reviewWindow.instance = create({
				tag: "browser-navigation-review",
				url: hostOrigin + path,
				domain: allowRedirect ? [hostOrigin, attackerOrigin] : hostOrigin,
				timeout: 1500,
				dimensions: { width: 300, height: 200 },
				props: {
					count: prop.number(),
					secret: { schema: prop.string(), deliverTo: hostOrigin },
					onComplete: prop.function(),
				},
			})({
				count: 1,
				secret: "browser-secret-sentinel",
				onComplete: () => ++reviewWindow.calls,
			});
			reviewWindow.outcome = reviewWindow.instance
				.render("#mount", context)
				.then(
					() => "ready",
					(error: Error) => error.message,
				);
		},
		{ hostOrigin, attackerOrigin, path, context, allowRedirect },
	);
}

async function prepareDelivery(
	page: import("@playwright/test").Page,
	context: "iframe" | "popup",
	method: "GET" | "POST",
	scenario: "base" | "lifecycle" | "queued",
) {
	await page.goto(consumerOrigin);
	await page.evaluate(
		({
			consumerOrigin,
			hostOrigin,
			attackerOrigin,
			context,
			method,
			scenario,
		}) => {
			const libraryUrl = `${consumerOrigin}/library.js`;
			return import(libraryUrl).then(({ create, prop }) => {
				const base = document.createElement("base");
				base.href = `${scenario === "base" ? attackerOrigin : hostOrigin}/nested/`;
				document.head.appendChild(base);
				const reviewWindow = window as unknown as {
					instance: import("../../src/types").ComponentInstance<
						Record<string, unknown>
					>;
					outcome: Promise<string>;
					updates: Promise<void>[];
				};
				reviewWindow.updates = [];
				const parameter = method === "GET" ? "queryParam" : "bodyParam";
				let queuedFollowUp = false;
				reviewWindow.instance = create({
					tag: "browser-delivery-regression",
					url: "delivery?existing=a%20b#checkout?step=2",
					domain: [hostOrigin, attackerOrigin],
					timeout: 3000,
					validate: ({ props }: { props: { count: number } }) => {
						if (scenario === "queued" && props.count === 2 && !queuedFollowUp) {
							queuedFollowUp = true;
							reviewWindow.updates.push(
								reviewWindow.instance.updateProps({ count: 3 }),
							);
						}
					},
					props: {
						count: { schema: prop.number(), [parameter]: true },
						allowed: { schema: prop.string(), [parameter]: true },
						restricted: {
							schema: prop.string(),
							[parameter]: true,
							deliverTo: hostOrigin,
						},
						hidden: {
							schema: prop.string(),
							[parameter]: true,
							sendToHost: false,
						},
						sameOrigin: {
							schema: prop.string(),
							[parameter]: true,
							deliverTo: "same-origin",
						},
					},
				})({
					count: 1,
					allowed: "visible",
					restricted: "restricted-sentinel",
					hidden: "hidden-sentinel",
					sameOrigin: "same-origin-sentinel",
				});
				reviewWindow.instance.event.once("render", () => {
					if (scenario === "lifecycle")
						base.href = `${attackerOrigin}/changed/`;
				});
				const button = document.createElement("button");
				button.id = "open-delivery";
				button.textContent = "Open widget";
				button.onclick = () => {
					if (scenario === "queued")
						reviewWindow.updates.push(
							reviewWindow.instance.updateProps({ count: 2 }),
						);
					reviewWindow.outcome = reviewWindow.instance
						.render("#mount", context)
						.then(
							() => "ready",
							(error: Error) => error.message,
						);
				};
				document.body.appendChild(button);
			});
		},
		{ consumerOrigin, hostOrigin, attackerOrigin, context, method, scenario },
	);
}

for (const provided of [false, true]) {
	test(`unsupported rejected async schema stays handled with provided input ${provided}`, async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(error.message));
		await page.goto(consumerOrigin);
		const result = await page.evaluate(
			async ({ hostOrigin, provided }) => {
				const libraryUrl = "/library.js";
				const { create, prop } = await import(libraryUrl);
				const unhandled: string[] = [];
				window.addEventListener("unhandledrejection", (event) => {
					unhandled.push(String(event.reason));
				});
				const count = {
					"~standard": {
						version: 1,
						vendor: "async-rejection-fixture",
						validate: (value: unknown) =>
							typeof value === "number"
								? { value }
								: Promise.reject(new Error("Rejected async schema")),
					},
				};
				const Component = create({
					tag: "rejected-async-schema",
					url: `${hostOrigin}/delivery`,
					props: { count, allowed: prop.string() },
				});
				const instance = Component({
					allowed: "retry-value",
					...(provided ? { count: "invalid" } : {}),
				});
				let error = "";
				try {
					await instance.render("#mount");
				} catch (reason) {
					error = (reason as Error).message;
				}
				await instance.updateProps({ count: 7 });
				await instance.render("#mount");
				await instance.close();
				// Let the browser deliver any unobserved promise-rejection events.
				await new Promise<void>((resolve) => setTimeout(resolve, 20));
				return { error, unhandled, active: Component.instances.length };
			},
			{ hostOrigin, provided },
		);
		expect(result.error).toContain("uses an async schema");
		expect(result.unhandled).toEqual([]);
		expect(result.active).toBe(0);
		expect(pageErrors).toEqual([]);
		await expect(page.locator("iframe")).toHaveCount(0);
	});
}

for (const loading of [undefined, "eager"] as const) {
	test(`eager iframe with loading ${loading ?? "default"} preserves custom loading layout`, async ({
		page,
	}) => {
		let releaseNavigation = () => {};
		const navigationAllowed = new Promise<void>((resolve) => {
			releaseNavigation = resolve;
		});
		await page.route(`${hostOrigin}/delivery**`, async (route) => {
			await navigationAllowed;
			await route.continue();
		});
		await page.goto(consumerOrigin);
		await page.evaluate(
			async ({ hostOrigin, loading }) => {
				const libraryUrl = "/library.js";
				const { create, prop } = await import(libraryUrl);
				const sibling = document.createElement("div");
				sibling.id = "following-content";
				sibling.textContent = "Following content";
				document.querySelector("#mount")?.after(sibling);
				const instance = create({
					tag: "eager-loading-layout",
					url: `${hostOrigin}/delivery`,
					timeout: 5000,
					dimensions: { width: 320, height: 180 },
					attributes: { loading },
					style: { display: "block" },
					containerTemplate: ({ container }: { container: HTMLElement }) =>
						container,
					prerenderTemplate: ({ doc }: { doc: Document }) => {
						const loader = doc.createElement("div");
						loader.id = "custom-loader";
						loader.style.height = "180px";
						loader.textContent = "Loading";
						return loader;
					},
					props: { count: prop.number(), allowed: prop.string() },
				})({ count: 7, allowed: "eager-value" });
				(window as unknown as { outcome: Promise<void> }).outcome =
					instance.render("#mount");
			},
			{ hostOrigin, loading },
		);
		const mount = page.locator("#mount");
		const iframe = page.locator("iframe");
		await expect(page.locator("#custom-loader")).toBeVisible();
		await expect(iframe).toHaveCSS("display", "none");
		expect((await mount.boundingBox())?.height).toBe(180);
		const followingTop = (
			await page.locator("#following-content").boundingBox()
		)?.y;
		releaseNavigation();
		await page.evaluate(
			() => (window as unknown as { outcome: Promise<void> }).outcome,
		);
		await expect(page.locator("#custom-loader")).toHaveCount(0);
		await expect(iframe).toBeVisible();
		await expect(iframe).toHaveCSS("display", "block");
		expect((await mount.boundingBox())?.height).toBe(180);
		expect((await page.locator("#following-content").boundingBox())?.y).toBe(
			followingTop,
		);
	});
}

for (const method of ["GET", "POST"] as const) {
	for (const display of ["block", "none"] as const) {
		test(`lazy iframe ${method} initializes while concealed and retains configured display ${display}`, async ({
			page,
		}) => {
			deliveryRequests.length = 0;
			let releaseNavigation = () => {};
			const navigationAllowed = new Promise<void>((resolve) => {
				releaseNavigation = resolve;
			});
			let navigationRequested = false;
			await page.route(`${hostOrigin}/delivery**`, async (route) => {
				navigationRequested = true;
				await navigationAllowed;
				await route.continue();
			});
			await page.goto(consumerOrigin);
			await page.evaluate(
				async ({ hostOrigin, method, display }) => {
					const libraryUrl = "/library.js";
					const { create, prop } = await import(libraryUrl);
					const parameter = method === "GET" ? "queryParam" : "bodyParam";
					const instance = create({
						tag: "lazy-iframe-styles",
						url: `${hostOrigin}/delivery`,
						timeout: 3000,
						dimensions: { width: 320, height: 180 },
						attributes: {
							loading: "lazy",
							style:
								method === "GET"
									? `display:${display} !important; visibility:hidden !important; opacity:0.25 !important; transition:transform 2s !important`
									: undefined,
						},
						style:
							method === "POST"
								? {
										display,
										visibility: "hidden",
										opacity: 0.25,
										transition: "transform 2s",
									}
								: undefined,
						props: {
							count: { schema: prop.number(), [parameter]: true },
							allowed: { schema: prop.string(), [parameter]: true },
						},
					})({ count: 7, allowed: "lazy-value" });
					(window as unknown as { outcome: Promise<string> }).outcome = instance
						.render("#mount")
						.then(
							() => "ready",
							(error: Error) => error.message,
						);
				},
				{ hostOrigin, method, display },
			);
			const iframe = page.locator("iframe");
			await expect(iframe).toHaveCSS("visibility", "hidden");
			await expect(iframe).toHaveCSS(
				"display",
				display === "none" ? "inline" : display,
			);
			await expect.poll(() => navigationRequested).toBe(true);
			releaseNavigation();
			expect(
				await page.evaluate(
					() => (window as unknown as { outcome: Promise<string> }).outcome,
				),
			).toBe("ready");
			await expect(iframe).toHaveCSS("visibility", "hidden");
			await expect(iframe).toHaveCSS("display", display);
			await expect(iframe).toHaveCSS("opacity", "0.25");
			await expect(iframe).toHaveCSS("transition-property", "transform");
			await expect(iframe).toHaveCSS("transition-duration", "2s");
			expect(
				await iframe.evaluate((frame) =>
					["display", "visibility", "opacity", "transition"].map((property) =>
						(frame as HTMLIFrameElement).style.getPropertyPriority(property),
					),
				),
			).toEqual(Array(4).fill(method === "GET" ? "important" : ""));
			expect(deliveryRequests).toHaveLength(1);
			expect(deliveryRequests[0].method).toBe(method);
			const params = new URLSearchParams(
				method === "GET"
					? new URL(deliveryRequests[0].url, hostOrigin).search
					: deliveryRequests[0].body,
			);
			expect(params.get("count")).toBe("7");
			expect(params.get("allowed")).toBe("lazy-value");
		});
	}
}

test("lazy iframe applies a show requested before frame creation", async ({
	page,
}) => {
	deliveryRequests.length = 0;
	await page.goto(consumerOrigin);
	const outcome = await page.evaluate(
		async ({ hostOrigin }) => {
			const libraryUrl = "/library.js";
			const { create, prop } = await import(libraryUrl);
			const instance = create({
				tag: "lazy-iframe-early-show",
				url: `${hostOrigin}/delivery`,
				timeout: 3000,
				attributes: { loading: "lazy" },
				style: {
					display: "none",
					visibility: "hidden",
					opacity: 0.25,
					transition: "transform 2s",
				},
				props: { count: prop.number(), allowed: prop.string() },
			})({ count: 7, allowed: "early-show-value" });
			instance.event.on("render", () => instance.show());
			return instance.render("#mount").then(
				() => "ready",
				(error: Error) => error.message,
			);
		},
		{ hostOrigin },
	);
	expect(outcome).toBe("ready");
	const iframe = page.locator("iframe");
	await expect(iframe).toHaveCSS("visibility", "visible");
	await expect(iframe).toHaveCSS("display", "inline");
	await expect(iframe).toHaveCSS("opacity", "0.25");
	await expect(iframe).toHaveCSS("transition-property", "transform");
	expect(deliveryRequests).toHaveLength(1);
});

for (const control of ["hide", "show"] as const) {
	test(`lazy iframe ${control} during loading takes precedence over configured visibility`, async ({
		page,
	}) => {
		await page.goto(consumerOrigin);
		const result = await page.evaluate(
			async ({ hostOrigin, control }) => {
				const libraryUrl = "/library.js";
				const { create, prop } = await import(libraryUrl);
				const instance = create({
					tag: "lazy-loading-control",
					url: `${hostOrigin}/delivery`,
					timeout: 3000,
					dimensions: { width: 320, height: 180 },
					attributes: { loading: "lazy" },
					style: {
						display: control === "show" ? "none" : "block",
						visibility: "hidden",
					},
					props: { count: prop.number(), allowed: prop.string() },
				})({ count: 1, allowed: "controls" });
				instance.event.on("render", () => {
					void instance[control]();
				});
				await instance.render("#mount");
				const iframe = document.querySelector("iframe");
				if (!iframe) throw new Error("Missing iframe");
				const styles = {
					display: iframe.style.display,
					visibility: iframe.style.visibility,
					opacity: iframe.style.opacity,
					transition: iframe.style.transition,
				};
				await instance.close();
				return {
					styles,
					remainingFrames: document.querySelectorAll("iframe").length,
				};
			},
			{ hostOrigin, control },
		);
		expect(result).toEqual({
			styles: {
				display: control === "hide" ? "none" : "",
				visibility: control === "hide" ? "hidden" : "visible",
				opacity: "",
				transition: "",
			},
			remainingFrames: 0,
		});
	});
}

test("lazy iframe cancellation before navigation removes loading content", async ({
	page,
}) => {
	deliveryRequests.length = 0;
	await page.goto(consumerOrigin);
	const result = await page.evaluate(async (hostOrigin) => {
		const libraryUrl = "/library.js";
		const { create } = await import(libraryUrl);
		const instance = create({
			tag: "lazy-loading-cancellation",
			url: `${hostOrigin}/delivery`,
			attributes: { loading: "lazy" },
			dimensions: { width: 320, height: 180 },
		})();
		instance.event.on("render", () => {
			void instance.close();
		});
		const outcome = await instance.render("#mount").then(
			() => "ready",
			(error: Error) => error.message,
		);
		return {
			outcome,
			remainingElements: document.querySelector("#mount")?.childElementCount,
		};
	}, hostOrigin);
	expect(result).toEqual({
		outcome:
			'Component "lazy-loading-cancellation" was closed before rendering completed',
		remainingElements: 0,
	});
	expect(deliveryRequests).toEqual([]);
});

test("initial rendering preserves a host hide and configured CSS values", async ({
	page,
}) => {
	await page.goto(consumerOrigin);
	const result = await page.evaluate(async (hostOrigin) => {
		const libraryUrl = "/library.js";
		const { create } = await import(libraryUrl);
		const instance = create({
			tag: "initial-hidden-style",
			url: `${hostOrigin}/hidden-on-ready`,
			style: {
				zIndex: 10,
				lineHeight: 1.5,
				"--brandColor": "red",
				color: "var(--brandColor)",
			},
		})();
		await instance.render("#mount");
		const iframe = document.querySelector("iframe");
		if (!iframe) throw new Error("Missing iframe");
		const computed = getComputedStyle(iframe);
		const hidden = {
			display: iframe.style.display,
			visibility: iframe.style.visibility,
		};
		await instance.show();
		return {
			hidden,
			shown: {
				display: iframe.style.display,
				visibility: iframe.style.visibility,
			},
			zIndex: iframe.style.zIndex,
			lineHeight: iframe.style.lineHeight,
			variable: iframe.style.getPropertyValue("--brandColor"),
			color: computed.color,
		};
	}, hostOrigin);
	expect(result).toEqual({
		hidden: { display: "none", visibility: "hidden" },
		shown: { display: "", visibility: "visible" },
		zIndex: "10",
		lineHeight: "1.5",
		variable: "red",
		color: "rgb(255, 0, 0)",
	});
});

test("numeric CSS declarations retain the browser's unitless meaning", async ({
	page,
}) => {
	await page.goto(consumerOrigin);
	const mismatches = await page.evaluate(async (hostOrigin) => {
		const libraryUrl = "/library.js";
		const { create } = await import(libraryUrl);
		const declaration = document.createElement("iframe").style;
		const names = new Set([
			...Array.from(getComputedStyle(document.documentElement)),
			...Object.keys(declaration),
			...Object.getOwnPropertyNames(Object.getPrototypeOf(declaration)),
		]);
		const properties = [
			...new Set(
				[...names].map((name) =>
					name
						.replace(/([A-Z])/g, "-$1")
						.toLowerCase()
						.replace(/^(webkit|moz|ms)-/, "-$1-"),
				),
			),
		].filter(
			(name) =>
				name !== "opacity" &&
				CSS.supports(name, "1") &&
				!CSS.supports(name, "1px"),
		);
		const styles = Object.fromEntries(
			properties.map((property) => [property, 1]),
		);
		for (const property of properties) declaration.setProperty(property, "1");
		const instance = create({
			tag: "numeric-css-contract",
			url: `${hostOrigin}/hidden-on-ready`,
			style: styles,
		})();
		await instance.render("#mount");
		const iframe = document.querySelector<HTMLIFrameElement>("#mount iframe");
		if (!iframe) throw new Error("Missing iframe");
		return properties.flatMap((property) => {
			const expected = declaration.getPropertyValue(property);
			const actual = iframe.style.getPropertyValue(property);
			return actual === expected ? [] : [{ property, expected, actual }];
		});
	}, hostOrigin);
	expect(mismatches).toEqual([]);
});

test("preserves foreign-window dates and ordinary records", async ({
	page,
}) => {
	await page.goto(consumerOrigin);
	await page.evaluate(
		async ({ hostOrigin }) => {
			const libraryUrl = "/library.js";
			const { create, prop } = await import(libraryUrl);
			const realm = document.createElement("iframe");
			document.body.append(realm);
			const foreign = realm.contentWindow as unknown as {
				Date: DateConstructor;
				Object: ObjectConstructor;
			};
			const createdAt = new foreign.Date("2026-01-02T03:04:05.678Z");
			const record = foreign.Object.assign(new foreign.Object(), {
				name: "initial",
			});
			const config = foreign.Object.assign(new foreign.Object(), {
				nested: { createdAt },
			});
			const instance = create({
				tag: "foreign-window-values",
				url: `${hostOrigin}/realm-values`,
				props: {
					createdAt: prop.date(),
					config: prop.any(),
					record: prop.record(prop.string()),
				},
			})({ createdAt, config, record });
			(
				window as unknown as {
					instance: import("../../src/types").ComponentInstance<
						Record<string, unknown>,
						Record<string, unknown>,
						{ createdAt: Date; record: Record<string, string> }
					>;
				}
			).instance = instance;
			await instance.render("#mount");
		},
		{ hostOrigin },
	);
	const hostFrame = page
		.frames()
		.find((frame) => frame.url() === `${hostOrigin}/realm-values`);
	if (!hostFrame) throw new Error("Missing host frame");
	expect(
		await hostFrame.evaluate(() => {
			const props = (
				window as unknown as {
					received: import("../../src/types").HostProps<{
						createdAt: Date;
						config: { nested: { createdAt: Date } };
						record: Record<string, string>;
					}>;
				}
			).received;
			return {
				date: props.createdAt instanceof Date,
				nested: props.config.nested.createdAt instanceof Date,
				iso: props.createdAt.toISOString(),
				record: props.record,
			};
		}),
	).toEqual({
		date: true,
		nested: true,
		iso: "2026-01-02T03:04:05.678Z",
		record: { name: "initial" },
	});
	await hostFrame.evaluate(async () => {
		const realm = document.createElement("iframe");
		document.body.append(realm);
		const foreign = realm.contentWindow as unknown as {
			Date: DateConstructor;
			Object: ObjectConstructor;
		};
		const props = (
			window as unknown as {
				received: import("../../src/types").HostProps<Record<string, unknown>>;
			}
		).received;
		await props.export({
			createdAt: new foreign.Date("2026-02-03T04:05:06.789Z"),
			record: foreign.Object.assign(new foreign.Object(), {
				name: "exported",
			}),
		});
	});
	expect(
		await page.evaluate(() => {
			const exported = (
				window as unknown as {
					instance: import("../../src/types").ComponentInstance<
						Record<string, unknown>,
						Record<string, unknown>,
						{ createdAt: Date; record: Record<string, string> }
					>;
				}
			).instance.exports;
			if (!exported) throw new Error("Missing exports");
			return {
				date: exported.createdAt instanceof Date,
				iso: exported.createdAt.toISOString(),
				record: exported.record,
			};
		}),
	).toEqual({
		date: true,
		iso: "2026-02-03T04:05:06.789Z",
		record: { name: "exported" },
	});
});

for (const context of ["iframe", "popup"] as const) {
	test(`${context} POST supports field names that shadow form methods`, async ({
		page,
	}) => {
		deliveryRequests.length = 0;
		await page.goto(consumerOrigin);
		await page.evaluate(
			async ({ hostOrigin, context }) => {
				const libraryUrl = "/library.js";
				const { create, prop } = await import(libraryUrl);
				const instance = create({
					tag: "browser-named-form-controls",
					url: `${hostOrigin}/delivery`,
					domain: hostOrigin,
					timeout: 3000,
					props: {
						count: { schema: prop.number(), bodyParam: "submit" },
						allowed: { schema: prop.string(), bodyParam: "appendChild" },
						cleanup: { schema: prop.string(), bodyParam: "remove" },
						extra: { schema: prop.string(), bodyParam: true },
						hidden: {
							schema: prop.string(),
							bodyParam: true,
							sendToHost: false,
						},
					},
				})({
					count: 2,
					allowed: "visible",
					cleanup: "cleanup-token",
					extra: "last-field",
					hidden: "hidden-sentinel",
				});
				const button = document.createElement("button");
				button.id = "open-post";
				button.textContent = "Open";
				button.onclick = () => {
					(window as unknown as { outcome: Promise<string> }).outcome = instance
						.render("#mount", context)
						.then(
							() => "ready",
							(error: Error) => error.message,
						);
				};
				document.body.appendChild(button);
			},
			{ hostOrigin, context },
		);
		const opened = context === "popup" ? page.waitForEvent("popup") : null;
		await page.click("#open-post", { noWaitAfter: true });
		const popup = await opened;
		expect(
			await page.evaluate(
				() => (window as unknown as { outcome: Promise<string> }).outcome,
			),
		).toBe("ready");
		expect(deliveryRequests).toHaveLength(1);
		expect(deliveryRequests[0]?.method).toBe("POST");
		expect(
			Object.fromEntries(new URLSearchParams(deliveryRequests[0]?.body)),
		).toEqual({
			submit: "2",
			appendChild: "visible",
			remove: "cleanup-token",
			extra: "last-field",
		});
		expect(await page.locator("form").count()).toBe(0);
		const target =
			popup ??
			page
				.frames()
				.find((frame) => frame.url().startsWith(`${hostOrigin}/delivery`));
		if (!target) throw new Error("Missing POST host");
		expect(
			await target.evaluate(() => {
				const props = (
					window as unknown as {
						received: { count: number; allowed: string; hidden?: string };
					}
				).received;
				return {
					count: props.count,
					allowed: props.allowed,
					hidden: props.hidden,
				};
			}),
		).toEqual({ count: 2, allowed: "visible", hidden: undefined });
	});

	test(`${context} preserves nested callbacks and Dates through updates`, async ({
		page,
	}) => {
		await page.goto(consumerOrigin);
		await page.evaluate(
			async ({ hostOrigin, context }) => {
				const libraryUrl = "/library.js";
				const { create, prop } = await import(libraryUrl);
				const instance = create({
					tag: "browser-nested-functions",
					url: `${hostOrigin}/encoded-props`,
					domain: hostOrigin,
					timeout: 3000,
					props: {
						config: prop.any(),
						label: prop.string().optional(),
					},
				})({
					config: {
						onComplete: () => 42,
						list: [() => 7],
						date: new Date("2026-01-02T03:04:05.678Z"),
					},
				});
				const review = window as unknown as {
					instance: import("../../src/types").ComponentInstance<
						Record<string, unknown>
					>;
					outcome: Promise<string>;
				};
				review.instance = instance;
				const button = document.createElement("button");
				button.id = "open-encoded";
				button.textContent = "Open";
				button.onclick = () => {
					review.outcome = instance.render("#mount", context).then(
						() => "ready",
						(error: Error) => error.message,
					);
				};
				document.body.appendChild(button);
			},
			{ hostOrigin, context },
		);
		const opened = context === "popup" ? page.waitForEvent("popup") : null;
		await page.click("#open-encoded", { noWaitAfter: true });
		const popup = await opened;
		expect(
			await page.evaluate(
				() => (window as unknown as { outcome: Promise<string> }).outcome,
			),
		).toBe("ready");
		const target =
			popup ??
			page
				.frames()
				.find((frame) => frame.url().startsWith(`${hostOrigin}/encoded-props`));
		if (!target) throw new Error("Missing encoded host");
		const read = () =>
			target.evaluate(async () => {
				const config = (
					window as unknown as {
						received: {
							config: {
								onComplete: () => Promise<number>;
								list: Array<() => Promise<number>>;
								date: Date;
							};
						};
					}
				).received.config;
				return {
					callback: await config.onComplete(),
					list: await config.list[0]?.(),
					date: config.date.toISOString(),
				};
			});
		expect(await read()).toEqual({
			callback: 42,
			list: 7,
			date: "2026-01-02T03:04:05.678Z",
		});
		await page.evaluate(() =>
			(
				window as unknown as {
					instance: import("../../src/types").ComponentInstance<
						Record<string, unknown>
					>;
				}
			).instance.updateProps({ label: "unrelated" }),
		);
		expect(await read()).toEqual({
			callback: 42,
			list: 7,
			date: "2026-01-02T03:04:05.678Z",
		});
		await page.evaluate(() =>
			(
				window as unknown as {
					instance: import("../../src/types").ComponentInstance<
						Record<string, unknown>
					>;
				}
			).instance.updateProps({
				config: {
					onComplete: () => 84,
					list: [() => 14],
					date: new Date("2026-02-03T04:05:06.789Z"),
				},
			}),
		);
		expect(await read()).toEqual({
			callback: 84,
			list: 14,
			date: "2026-02-03T04:05:06.789Z",
		});
	});

	for (const method of ["GET", "POST"] as const) {
		for (const scenario of ["base", "lifecycle", "queued"] as const) {
			test(`${context} ${method} keeps navigation and prop policy consistent during ${scenario}`, async ({
				page,
			}) => {
				deliveryRequests.length = 0;
				await prepareDelivery(page, context, method, scenario);
				const opened = context === "popup" ? page.waitForEvent("popup") : null;
				await page.click("#open-delivery");
				const popup = await opened;
				const outcome = await page.evaluate(
					() => (window as unknown as { outcome: Promise<string> }).outcome,
				);
				expect(outcome).toBe("ready");
				const destination = scenario === "base" ? attackerOrigin : hostOrigin;
				const target =
					popup ??
					page
						.frames()
						.find((frame) =>
							frame.url().startsWith(`${destination}/nested/delivery`),
						);
				if (!target) throw new Error("Missing delivery host");
				expect(target.url()).toBe(
					`${destination}/nested/delivery?existing=a%20b${method === "GET" ? `&count=${scenario === "queued" ? 3 : 1}&allowed=visible${scenario === "base" ? "" : "&restricted=restricted-sentinel"}` : ""}#checkout?step=2`,
				);
				expect(deliveryRequests).toHaveLength(1);
				const request = deliveryRequests[0];
				expect(request?.method).toBe(method);
				const params =
					method === "POST"
						? new URLSearchParams(request?.body)
						: new URL(request?.url ?? "", destination).searchParams;
				expect(params.get("count")).toBe(scenario === "queued" ? "3" : "1");
				expect(params.get("allowed")).toBe("visible");
				expect(params.get("restricted")).toBe(
					scenario === "base" ? null : "restricted-sentinel",
				);
				expect(params.has("hidden")).toBe(false);
				expect(params.has("sameOrigin")).toBe(false);
				expect(
					await target.evaluate(() => {
						const props = (
							window as unknown as {
								received: {
									count: number;
									allowed: string;
									restricted?: string;
								};
							}
						).received;
						return {
							count: props.count,
							allowed: props.allowed,
							restricted: props.restricted,
						};
					}),
				).toEqual({
					count: scenario === "queued" ? 3 : 1,
					allowed: "visible",
					restricted: scenario === "base" ? undefined : "restricted-sentinel",
				});
				if (context === "popup") {
					expect(
						await page
							.locator("#mount")
							.evaluate((element) => element.childElementCount),
					).toBe(0);
				}
				const errors: string[] = [];
				if (popup) popup.on("pageerror", (error) => errors.push(error.message));
				else page.on("pageerror", (error) => errors.push(error.message));
				// Prop updates still enforce the opened origin; restore the mutated base first.
				await page.evaluate((destination) => {
					const base = document.querySelector("base");
					if (base) base.href = `${destination}/nested/`;
				}, destination);
				await page.evaluate(() =>
					(
						window as unknown as {
							instance: {
								updateProps: (props: { count: number }) => Promise<void>;
							};
						}
					).instance.updateProps({ count: 4 }),
				);
				await expect
					.poll(() =>
						target.evaluate(
							() =>
								(window as unknown as { notifications: number[] })
									.notifications,
						),
					)
					.toEqual([4]);
				expect(
					await target.evaluate(
						() => (window as unknown as { unhandled: string[] }).unhandled,
					),
				).toEqual([]);
				expect(errors).toEqual([]);
				await page.evaluate(() =>
					(
						window as unknown as { instance: { close: () => Promise<void> } }
					).instance.close(),
				);
			});
		}
	}

	test(`${context} rejects a changed base origin before any restricted HTTP request`, async ({
		page,
	}) => {
		deliveryRequests.length = 0;
		await page.goto(consumerOrigin);
		const outcome = await page.evaluate(
			async ({ consumerOrigin, attackerOrigin, context }) => {
				const libraryUrl = `${consumerOrigin}/library.js`;
				const { create, prop } = await import(libraryUrl);
				const component = create({
					tag: "browser-base-rejection",
					url: "/delivery",
					domain: consumerOrigin,
					props: {
						order: {
							schema: prop.string(),
							queryParam: true,
							deliverTo: consumerOrigin,
						},
					},
				});
				const instance = component({ order: "restricted-sentinel" });
				const base = document.createElement("base");
				base.href = `${attackerOrigin}/`;
				document.head.appendChild(base);
				try {
					await instance.render("#mount", context);
					return "unexpected success";
				} catch (error) {
					return (error as Error).message;
				}
			},
			{ consumerOrigin, attackerOrigin, context },
		);
		expect(outcome).toContain(
			`Component URL origin "${attackerOrigin}" is not allowed`,
		);
		expect(deliveryRequests).toEqual([]);
		expect(page.context().pages()).toHaveLength(1);
		expect(
			await page
				.locator("#mount")
				.evaluate((element) => element.childElementCount),
		).toBe(0);
	});
}

test("concurrent widgets isolate props and callbacks and survive a peer closing", async ({
	page,
}) => {
	type WidgetProps = {
		count: number;
		secret: string;
		onComplete: () => number;
	};
	type Widgets = {
		first: import("../../src/types").ComponentInstance<WidgetProps>;
		second: import("../../src/types").ComponentInstance<WidgetProps>;
	};
	await page.goto(consumerOrigin);
	await page.evaluate(async (hostOrigin) => {
		const libraryUrl = "/library.js";
		const { create, prop } = await import(libraryUrl);
		const Component = create({
			tag: "browser-concurrent-widgets",
			url: `${hostOrigin}/host`,
			props: {
				count: prop.number(),
				secret: prop.string(),
				onComplete: prop.function(),
			},
		});
		for (const id of ["first", "second"]) {
			const mount = document.createElement("div");
			mount.id = id;
			document.body.append(mount);
		}
		const widgets = window as unknown as Widgets;
		widgets.first = Component({
			count: 1,
			secret: "first-secret",
			onComplete: () => 100,
		});
		widgets.second = Component({
			count: 2,
			secret: "second-secret",
			onComplete: () => 200,
		});
		await Promise.all([
			widgets.first.render("#first"),
			widgets.second.render("#second"),
		]);
	}, hostOrigin);
	const firstElement = await page.locator("#first iframe").elementHandle();
	const secondElement = await page.locator("#second iframe").elementHandle();
	const first = await firstElement?.contentFrame();
	const second = await secondElement?.contentFrame();
	if (!first || !second)
		throw new Error("Expected two initialized widget frames");
	const readWidget = (frame: import("@playwright/test").Frame) =>
		frame.evaluate(async () => {
			// The fixture stores the value of host.ready.
			const { received: hostProps } = window as unknown as {
				received: import("../../src/types").HostProps<WidgetProps>;
			};
			return {
				count: hostProps.count,
				secret: hostProps.secret,
				result: await hostProps.onComplete(),
			};
		});
	expect(await Promise.all([readWidget(first), readWidget(second)])).toEqual([
		{ count: 1, secret: "first-secret", result: 100 },
		{ count: 2, secret: "second-secret", result: 200 },
	]);
	await page.evaluate(async () => {
		const widgets = window as unknown as Widgets;
		await widgets.first.updateProps({
			count: 11,
			secret: "updated-first",
			onComplete: () => 101,
		});
	});
	expect(await Promise.all([readWidget(first), readWidget(second)])).toEqual([
		{ count: 11, secret: "updated-first", result: 101 },
		{ count: 2, secret: "second-secret", result: 200 },
	]);
	await page.evaluate(async () => {
		const widgets = window as unknown as Widgets;
		await widgets.first.close();
		await widgets.second.updateProps({ count: 22 });
	});
	await expect(page.locator("#first iframe")).toHaveCount(0);
	await expect(page.locator("#second iframe")).toHaveCount(1);
	expect(await readWidget(second)).toEqual({
		count: 22,
		secret: "second-secret",
		result: 200,
	});
});

test("redirected pages cannot read restricted props or complete initialization", async ({
	page,
}) => {
	const navigation = page.waitForEvent("framenavigated", {
		predicate: (frame) => frame.url().startsWith(attackerOrigin),
	});
	await mount(page, "/redirect");
	const attacker = await navigation;
	await attacker.waitForFunction(() => "captured" in window);
	const captured = await attacker.evaluate(
		() => (window as unknown as { captured: object }).captured,
	);
	expect(Object.keys(captured).sort()).toEqual(CHANNEL_METADATA_KEYS);
	expect(JSON.stringify(captured)).not.toContain("browser-secret-sentinel");
	expect(
		await page.evaluate(
			() => (window as unknown as { outcome: Promise<string> }).outcome,
		),
	).toContain("did not initialize");
});

test("filters initial props against the verified redirect destination", async ({
	page,
}) => {
	await mount(page, "/allowed-redirect", "iframe", true);
	expect(
		await page.evaluate(
			() => (window as unknown as { outcome: Promise<string> }).outcome,
		),
	).toBe("ready");
	const host = page
		.frames()
		.find((frame) => frame.url().startsWith(attackerOrigin));
	if (!host) throw new Error("Missing redirected host");
	await host.waitForFunction(
		() => (window as unknown as { ready: boolean }).ready === true,
	);
	expect(
		await host.evaluate(
			() =>
				(window as unknown as { received: { count: number; secret?: string } })
					.received.count,
		),
	).toBe(1);
	expect(
		await host.evaluate(
			() =>
				(window as unknown as { received: { secret?: string } }).received
					.secret,
		),
	).toBeUndefined();
	expect(
		await host.evaluate(() =>
			(
				window as unknown as { received: { onComplete(): Promise<number> } }
			).received.onComplete(),
		),
	).toBe(1);
});

test("verifies the consumer without referrer information", async ({ page }) => {
	await mount(page, "/host");
	expect(
		await page.evaluate(
			() => (window as unknown as { outcome: Promise<string> }).outcome,
		),
	).toBe("ready");
	const host = page
		.frames()
		.find((frame) => frame.url().startsWith(hostOrigin));
	if (!host) throw new Error("Missing host");
	expect(await host.evaluate(() => document.referrer)).toBe("");
	expect(
		await host.evaluate(
			() =>
				(window as unknown as { received: { secret: string } }).received.secret,
		),
	).toBe("browser-secret-sentinel");
});

test("legacy hosts cannot bypass the verified bootstrap handshake", async ({
	page,
}) => {
	await mount(page, "/legacy");
	expect(
		await page.evaluate(
			() => (window as unknown as { outcome: Promise<string> }).outcome,
		),
	).toContain("did not initialize");
});

test("a v2 host refuses a 1.x consumer's payload without contacting it", async ({
	page,
}) => {
	await page.goto(consumerOrigin);
	const loaded = page.waitForEvent("framenavigated", {
		predicate: (frame) => frame.url().startsWith(hostOrigin),
	});
	await page.evaluate(
		({ hostOrigin, consumerOrigin }) => {
			const received: unknown[] = [];
			(window as unknown as { received: unknown[] }).received = received;
			window.addEventListener("message", (event) => received.push(event.data));
			// A ForgeFrame 1.x consumer wrote protocol 2 with props and exports.
			const payload = {
				uid: "v1-consumer-uid",
				tag: "v1-consumer-widget",
				version: "1.1.0",
				protocolVersion: 2,
				context: "iframe",
				consumerDomain: consumerOrigin,
				props: {},
				exports: {
					init: "forgeframe_init",
					close: "forgeframe_close",
					resize: "forgeframe_resize",
					show: "forgeframe_show",
					hide: "forgeframe_hide",
					onError: "forgeframe_error",
					updateProps: "forgeframe_props",
					export: "forgeframe_export",
				},
			};
			const iframe = document.createElement("iframe");
			iframe.name = `__forgeframe__${btoa(encodeURIComponent(JSON.stringify(payload)))}`;
			iframe.src = `${hostOrigin}/v2-host-for-v1-consumer`;
			document.querySelector("#mount")?.append(iframe);
		},
		{ hostOrigin, consumerOrigin },
	);
	const host = await loaded;
	await page.waitForFunction(() =>
		(window as unknown as { received: unknown[] }).received.includes(
			"v2-host-finished",
		),
	);
	expect(
		await host.evaluate(
			() => (window as unknown as { outcome: string }).outcome,
		),
	).toBe(
		'ForgeFrame host for "v1-consumer-widget" cannot start: the consumer uses ForgeFrame 1.x (protocol 2, package 1.1.0). Upgrade the consumer and host to ForgeFrame 2 together.',
	);
	expect(
		await page.evaluate(
			() => (window as unknown as { received: unknown[] }).received,
		),
	).toEqual(["v2-host-finished"]);
});

test("a host started for another component's tag throws and leaves the consumer to time out", async ({
	page,
}) => {
	await mount(page, "/tag-mismatch");
	// Read the host's outcome before the consumer's timeout removes its frame.
	await expect
		.poll(() =>
			page
				.frames()
				.find((frame) => frame.url().startsWith(hostOrigin))
				?.evaluate(() => (window as unknown as { outcome?: string }).outcome)
				.catch(() => undefined),
		)
		.toBe(
			'initHost() received component "browser-navigation-other", but this window was opened for "browser-navigation-review"',
		);
	expect(
		await page.evaluate(
			() => (window as unknown as { outcome: Promise<string> }).outcome,
		),
	).toContain("did not initialize within 1500ms");
});

test("growing a widget also grows its clipping container", async ({ page }) => {
	await mount(page, "/host");
	expect(
		await page.evaluate(
			() => (window as unknown as { outcome: Promise<string> }).outcome,
		),
	).toBe("ready");
	await page.evaluate(() =>
		(
			window as unknown as {
				instance: {
					resize(dimensions: { width: number; height: number }): Promise<void>;
				};
			}
		).instance.resize({ width: 600, height: 500 }),
	);
	const sizes = await page.locator("iframe").evaluate((iframe) => ({
		frameHeight: iframe.getBoundingClientRect().height,
		wrapperHeight: iframe.parentElement?.getBoundingClientRect().height,
		wrapperWidth: iframe.parentElement?.getBoundingClientRect().width,
	}));
	expect(sizes).toEqual({
		frameHeight: 500,
		wrapperHeight: 500,
		wrapperWidth: 600,
	});
});

test("a cross-origin popup host resizes itself and consumer resizing reports the block", async ({
	page,
}) => {
	const popupEvent = page.waitForEvent("popup");
	await mount(page, "/popup-resize", "popup");
	const popup = await popupEvent;
	expect(
		await page.evaluate(
			() => (window as unknown as { outcome: Promise<string> }).outcome,
		),
	).toBe("ready");
	await popup.waitForFunction(
		() => (window as unknown as { ready: boolean }).ready === true,
	);
	type ResizeWindow = {
		resizes: unknown[];
		instance: {
			event: { on(event: string, handler: (data: unknown) => void): void };
			resize(dimensions: { width: number; height: number }): Promise<void>;
		};
	};
	const consumerResult = await page.evaluate(async () => {
		const state = window as unknown as ResizeWindow;
		state.resizes = [];
		state.instance.event.on("resize", (dimensions) => {
			state.resizes.push(dimensions);
		});
		return state.instance.resize({ width: 600, height: 500 }).then(
			() => "resolved",
			(error: Error) => error.message,
		);
	});
	expect(consumerResult).toContain(
		'Cannot resize the popup for component "browser-navigation-review"',
	);
	expect(
		await page.evaluate(() => (window as unknown as ResizeWindow).resizes),
	).toEqual([]);

	await popup.evaluate(() =>
		(
			window as unknown as {
				received: {
					resize(dimensions: { width: number; height: number }): Promise<void>;
				};
			}
		).received.resize({ width: 640, height: 480 }),
	);
	expect(
		await popup.evaluate(
			() => (window as unknown as { resizeCalls: unknown[] }).resizeCalls,
		),
	).toEqual([[640, 480]]);
	expect(
		await page.evaluate(() => (window as unknown as ResizeWindow).resizes),
	).toEqual([{ width: 640, height: 480 }]);
});

test("calls queued behind host teardown reject instead of waiting forever", async ({
	page,
}) => {
	await mount(page, "/destroy-host");
	expect(
		await page.evaluate(
			() => (window as unknown as { outcome: Promise<string> }).outcome,
		),
	).toBe("ready");
	const frame = page
		.frames()
		.find((entry) => entry.url().startsWith(hostOrigin));
	if (!frame) throw new Error("Missing host frame");
	await frame.waitForFunction(
		() => (window as unknown as { ready: boolean }).ready === true,
	);
	await page.waitForFunction(
		() =>
			typeof (
				window as unknown as {
					instance: { exports?: { value?: unknown } };
				}
			).instance.exports?.value === "function",
	);

	const results = await page.evaluate(async () => {
		type HostExports = {
			destroy(): Promise<void>;
			value(): Promise<number>;
		};
		const { exports } = (
			window as unknown as { instance: { exports: HostExports } }
		).instance;
		const settled = (promise: Promise<unknown>) =>
			promise.then(
				(value) => `resolved ${String(value)}`,
				(error: Error) => error.message,
			);
		const control = await settled(exports.value());
		// Posted in one task: the host destroys itself before dispatching the second call.
		const destroying = settled(exports.destroy());
		const queued = settled(exports.value());
		const outcomes = await Promise.all([destroying, queued]);
		return { control, outcomes, later: await settled(exports.value()) };
	});
	const destroyed = "Host was destroyed before the call completed";
	expect(results).toEqual({
		control: "resolved 1",
		outcomes: [destroyed, destroyed],
		later: destroyed,
	});
	expect(
		await frame.evaluate(() => (window as unknown as { calls: number }).calls),
	).toBe(1);
});

for (const context of ["iframe", "popup"] as const) {
	test(`${context} acknowledges an update already pending when bootstrap starts`, async ({
		page,
	}) => {
		await page.addInitScript(
			({ hostOrigin }) => {
				window.addEventListener("message", (event) => {
					if (
						event.origin !== hostOrigin ||
						event.data !== "forgeframe-test-host-started"
					)
						return;
					const reviewWindow = window as unknown as {
						instance: { updateProps(props: object): Promise<void> };
						earlyUpdate?: Promise<void>;
					};
					reviewWindow.earlyUpdate = reviewWindow.instance.updateProps({
						count: 2,
						onComplete: () => 2,
					});
				});
			},
			{ hostOrigin },
		);
		const popup = context === "popup" ? page.waitForEvent("popup") : null;
		await mount(page, "/host", context);
		const hostPage = popup ? await popup : page;
		expect(
			await page.evaluate(
				() => (window as unknown as { outcome: Promise<string> }).outcome,
			),
		).toBe("ready");
		const host =
			context === "popup"
				? hostPage
				: page.frames().find((frame) => frame.url().startsWith(hostOrigin));
		if (!host) throw new Error("Missing host window");
		const loaded = hostPage.waitForEvent("framenavigated", {
			predicate: (frame) => frame.url() === `${hostOrigin}/early-update`,
		});
		await host.evaluate(() => {
			location.href = "/early-update";
		});
		await loaded;
		await host.waitForFunction(
			() => (window as unknown as { ready: boolean }).ready === true,
		);
		await page.waitForFunction(
			() =>
				(window as unknown as { earlyUpdate?: Promise<void> }).earlyUpdate !==
				undefined,
		);
		await page.evaluate(
			() => (window as unknown as { earlyUpdate: Promise<void> }).earlyUpdate,
		);
		expect(
			await host.evaluate(
				() =>
					(window as unknown as { received: { count: number } }).received.count,
			),
		).toBe(2);
		expect(
			await host.evaluate(() =>
				(
					window as unknown as { received: { onComplete(): Promise<number> } }
				).received.onComplete(),
			),
		).toBe(2);
	});

	test(`${context} can retry after asynchronous bootstrap validation fails`, async ({
		page,
	}) => {
		const popup = context === "popup" ? page.waitForEvent("popup") : null;
		await mount(page, "/retry", context);
		const hostPage = popup ? await popup : page;
		expect(
			await page.evaluate(
				() => (window as unknown as { outcome: Promise<string> }).outcome,
			),
		).toBe("ready");
		const host =
			context === "popup"
				? hostPage
				: page.frames().find((frame) => frame.url().startsWith(hostOrigin));
		if (!host) throw new Error("Missing host window");
		await host.waitForFunction(
			() => (window as unknown as { ready: boolean }).ready === true,
		);
		expect(
			await host.evaluate(
				() => (window as unknown as { firstError: string }).firstError,
			),
		).toContain("Expected string, got number");
		expect(
			await host.evaluate(
				() =>
					(window as unknown as { reusedFailedHost: boolean }).reusedFailedHost,
			),
		).toBe(false);
		expect(
			await host.evaluate(
				() =>
					(window as unknown as { received: { count: number } }).received.count,
			),
		).toBe(1);
		expect(
			await host.evaluate(() =>
				(
					window as unknown as { received: { onComplete(): Promise<number> } }
				).received.onComplete(),
			),
		).toBe(1);
	});

	test(`${context} component-form host retries after a failed start`, async ({
		page,
	}) => {
		const popup = context === "popup" ? page.waitForEvent("popup") : null;
		await mount(page, "/factory-retry", context);
		const hostPage = popup ? await popup : page;
		expect(
			await page.evaluate(
				() => (window as unknown as { outcome: Promise<string> }).outcome,
			),
		).toBe("ready");
		const host =
			context === "popup"
				? hostPage
				: page.frames().find((frame) => frame.url().startsWith(hostOrigin));
		if (!host) throw new Error("Missing host window");
		await host.waitForFunction(
			() => (window as unknown as { ready: boolean }).ready === true,
		);
		expect(
			await host.evaluate(() => {
				const state = window as unknown as {
					firstError: string;
					sameHostProps: boolean;
					freshHostProps: boolean;
					received: { count: number };
				};
				return {
					error: state.firstError.includes("temporary rejection"),
					same: state.sameHostProps,
					fresh: state.freshHostProps,
					count: state.received.count,
				};
			}),
		).toEqual({ error: true, same: true, fresh: true, count: 1 });
		await page.evaluate(() =>
			(
				window as unknown as {
					instance: { updateProps(props: object): Promise<void> };
				}
			).instance.updateProps({ count: 2 }),
		);
		expect(
			await host.evaluate(async () => {
				const props = (
					window as unknown as {
						received: {
							count: number;
							onComplete(): Promise<number>;
							resize(dimensions: { width: number }): Promise<void>;
						};
					}
				).received;
				await props.resize({ width: 360 });
				return { count: props.count, callback: await props.onComplete() };
			}),
		).toEqual({ count: 2, callback: 1 });
	});

	test(`${context} preserves a callback update queued during reconnect bootstrap`, async ({
		page,
	}) => {
		await page.goto(consumerOrigin);
		const popup = context === "popup" ? page.waitForEvent("popup") : null;
		await page.evaluate(
			async ({ hostOrigin, context }) => {
				const libraryUrl = "/library.js";
				const { create, prop } = await import(libraryUrl);
				const reviewWindow = window as unknown as {
					instance: import("../../src/types").ComponentInstance<
						Record<string, unknown>
					>;
					armed: boolean;
					updated?: Promise<void>;
				};
				reviewWindow.armed = false;
				reviewWindow.instance = create({
					tag: "reconnect-queued-update",
					url: `${hostOrigin}/host`,
					domain: hostOrigin,
					props: {
						count: prop.number(),
						// Its toJSON() runs when a snapshot is delivered, so it can queue
						// an update while the reconnect bootstrap is being serialized.
						trigger: prop.any(),
						secret: prop.string(),
						onComplete: prop.function(),
					},
				})({
					count: 1,
					trigger: {
						toJSON: () => {
							if (reviewWindow.armed) {
								reviewWindow.armed = false;
								queueMicrotask(() => {
									reviewWindow.updated = reviewWindow.instance.updateProps({
										count: 2,
										onComplete: () => 2,
									});
								});
							}
							return null;
						},
					},
					secret: "sentinel",
					onComplete: () => 1,
				});
				await reviewWindow.instance.render("#mount", context);
				reviewWindow.armed = true;
			},
			{ hostOrigin, context },
		);
		const hostPage = popup ? await popup : page;
		const host =
			context === "popup"
				? hostPage
				: page.frames().find((frame) => frame.url().startsWith(hostOrigin));
		if (!host) throw new Error("Missing host window");
		const loaded = hostPage.waitForEvent("framenavigated", {
			predicate: (frame) => frame.url().startsWith(hostOrigin),
		});
		await host.evaluate(() => location.reload());
		await loaded;
		await host.waitForFunction(
			() => (window as unknown as { ready: boolean }).ready === true,
		);
		await page.waitForFunction(
			() =>
				(window as unknown as { updated?: Promise<void> }).updated !==
				undefined,
		);
		await page.evaluate(
			() => (window as unknown as { updated: Promise<void> }).updated,
		);
		expect(
			await host.evaluate(
				() =>
					(window as unknown as { received: { count: number } }).received.count,
			),
		).toBe(2);
		expect(
			await host.evaluate(() =>
				(
					window as unknown as { received: { onComplete(): Promise<number> } }
				).received.onComplete(),
			),
		).toBe(2);
	});

	test(`${context} reconnects after reload and full-page navigation with current props and callbacks`, async ({
		page,
	}) => {
		const popup = context === "popup" ? page.waitForEvent("popup") : null;
		await mount(page, "/host", context);
		const hostPage = popup ? await popup : page;
		expect(
			await page.evaluate(
				() => (window as unknown as { outcome: Promise<string> }).outcome,
			),
		).toBe("ready");
		const host =
			context === "popup"
				? hostPage
				: page.frames().find((frame) => frame.url().startsWith(hostOrigin));
		expect(host).toBeDefined();
		if (!host) throw new Error("Missing host window");
		expect(
			await page.evaluate(
				() => (window as unknown as { outcome: Promise<string> }).outcome,
			),
		).toBe("ready");
		await page.evaluate(() =>
			(
				window as unknown as {
					instance: { updateProps(props: object): Promise<void> };
				}
			).instance.updateProps({ count: 2 }),
		);
		for (const navigation of ["reload", "next"] as const) {
			const loaded = hostPage.waitForEvent("framenavigated", {
				predicate: (frame) =>
					frame.url() ===
					(navigation === "reload"
						? `${hostOrigin}/host`
						: `${hostOrigin}/host?next=1`),
			});
			await host.evaluate((navigation) => {
				if (navigation === "reload") location.reload();
				else location.href = "/host?next=1";
			}, navigation);
			await loaded;
			await host.waitForFunction(
				() => (window as unknown as { ready: boolean }).ready === true,
			);
			expect(
				await host.evaluate(
					() =>
						(window as unknown as { received: { count: number } }).received
							.count,
				),
			).toBe(2);
			expect(
				await host.evaluate(() =>
					(
						window as unknown as { received: { onComplete(): Promise<number> } }
					).received.onComplete(),
				),
			).toBe(navigation === "reload" ? 1 : 2);
			expect(
				await host.evaluate(() =>
					Object.keys(
						JSON.parse(
							decodeURIComponent(
								atob(window.name.slice("__forgeframe__".length)),
							),
						),
					).sort(),
				),
			).toEqual(CHANNEL_METADATA_KEYS);
		}
	});
}

for (const context of ["iframe", "popup"] as const) {
	test(`${context} keeps the previous exports when the consumer rejects an export`, async ({
		page,
	}) => {
		await page.goto(consumerOrigin);
		const opening =
			context === "popup" ? page.waitForEvent("popup") : Promise.resolve(page);
		await page.evaluate(
			async ({ hostOrigin, context }) => {
				const libraryUrl = "/library.js";
				const { create, prop }: typeof import("../../src/index") = await import(
					libraryUrl
				);
				const instance = create({
					tag: "rejected-export-browser",
					url: `${hostOrigin}/rejected-export`,
					exports: prop.object({ ready: prop.boolean() }),
				})();
				const errors: string[] = [];
				instance.event.on("error", (error) => {
					errors.push(error.message);
				});
				Object.assign(window, { instance, errors });
				await instance.render("#mount", context);
			},
			{ hostOrigin, context },
		);
		const hostPage = await opening;
		const host =
			context === "popup"
				? hostPage
				: page
						.frames()
						.find((frame) => frame.url() === `${hostOrigin}/rejected-export`);
		if (!host) throw new Error("Missing host");
		await host.waitForFunction(() => "ready" in window);
		const rejection = await host.evaluate(
			() => (window as unknown as { rejection: string }).rejection,
		);
		expect(rejection).toContain("Validation failed: exports.ready");
		expect(
			await page.evaluate(() => {
				const state = window as unknown as {
					instance: { exports: unknown };
					errors: string[];
				};
				return { exports: state.instance.exports, errors: state.errors };
			}),
		).toEqual({ exports: { ready: true }, errors: [rejection] });
	});

	test(`${context} emits exports and keeps cspNonce on the consumer`, async ({
		page,
	}) => {
		await page.goto(consumerOrigin);
		const opening =
			context === "popup" ? page.waitForEvent("popup") : Promise.resolve(page);
		const exported = page.evaluate(
			async ({ hostOrigin, context }) => {
				const libraryUrl = "/library.js";
				const { create, prop }: typeof import("../../src/index") = await import(
					libraryUrl
				);
				const instance = create({
					tag: "exports-event-browser",
					url: `${hostOrigin}/record-props`,
					props: { record: prop.any() },
					cspNonce: "consumer-nonce",
				})({ record: { label: "sent" }, cspNonce: "prop-nonce" } as {
					record: Record<string, unknown>;
				});
				const payload = new Promise((resolve) => {
					instance.event.once("exports", (exports) => {
						resolve({
							payload: exports,
							matches: exports === instance.exports,
						});
					});
				});
				await instance.render("#mount", context);
				return {
					exportsEvent: await payload,
					// The loading spinner's keyframes stay in the consumer's head.
					spinnerNonce: document.getElementById("forgeframe-spinner-style")
						?.nonce,
				};
			},
			{ hostOrigin, context },
		);
		const hostPage = await opening;
		const result = await exported;
		const host =
			context === "popup"
				? hostPage
				: page
						.frames()
						.find((frame) => frame.url() === `${hostOrigin}/record-props`);
		if (!host) throw new Error("Missing host");
		expect(result).toEqual({
			exportsEvent: { payload: { record: { label: "sent" } }, matches: true },
			spinnerNonce: "consumer-nonce",
		});
		expect(
			await host.evaluate(() => {
				const received = (
					window as unknown as {
						received: { consumer: { props: object } } & object;
					}
				).received;
				return {
					hostProps: "cspNonce" in received,
					consumerProps: received.consumer.props,
					windowName: window.name.includes("nonce"),
				};
			}),
		).toEqual({
			hostProps: false,
			consumerProps: { record: { label: "sent" } },
			windowName: false,
		});
	});
}

for (const context of ["iframe", "popup"] as const) {
	test(`${context} preserves arrays with altered prototypes or map methods`, async ({
		page,
	}) => {
		await page.goto(consumerOrigin);
		const opening =
			context === "popup" ? page.waitForEvent("popup") : Promise.resolve(page);
		await page.evaluate(
			async ({ hostOrigin, context }) => {
				const libraryUrl = "/library.js";
				const { create, prop }: typeof import("../../src/index") = await import(
					libraryUrl
				);
				const Component = create({
					tag: "array-method-browser",
					url: `${hostOrigin}/record-props`,
					props: { record: prop.any() },
				});
				const values = Object.setPrototypeOf(["initial"], null);
				const instance = Component({ record: { values } });
				(window as unknown as { instance: typeof instance }).instance =
					instance;
				await instance.render("#mount", context);
			},
			{ hostOrigin, context },
		);
		const hostPage = await opening;
		const host =
			context === "popup"
				? hostPage
				: page
						.frames()
						.find((frame) => frame.url() === `${hostOrigin}/record-props`);
		if (!host) throw new Error("Missing host");
		await host.waitForFunction(
			() => (window as unknown as { ready: boolean }).ready === true,
		);
		const read = () =>
			host.evaluate(
				() =>
					(window as unknown as { received: { record: object } }).received
						.record,
			);
		expect(await read()).toEqual({ values: ["initial"] });
		await page.evaluate(async () => {
			const values = ["updated"];
			Object.defineProperty(values, "map", { value: () => ["corrupted"] });
			await (
				window as unknown as {
					instance: { updateProps(props: object): Promise<void> };
				}
			).instance.updateProps({ record: { values } });
		});
		expect(await read()).toEqual({ values: ["updated"] });
		await host.evaluate(async () => {
			const values = ["exported"];
			Object.defineProperty(values, "map", { value: () => ["corrupted"] });
			await (
				window as unknown as {
					received: import("../../src/types").HostProps<
						Record<string, unknown>
					>;
				}
			).received.export({
				values,
				nested: Object.setPrototypeOf(["nested"], null),
			});
		});
		expect(
			await page.evaluate(
				() =>
					(window as unknown as { instance: { exports: object } }).instance
						.exports,
			),
		).toEqual({ values: ["exported"], nested: ["nested"] });
		expect(
			await page.evaluate(async () => {
				const instance = (
					window as unknown as {
						instance: import("../../src/types").ComponentInstance;
					}
				).instance;
				let destroyed = false;
				instance.event.on("closed", () => {
					destroyed = true;
				});
				const first = instance.close();
				await instance.close();
				const completed = destroyed;
				await first;
				return completed;
			}),
		).toBe(true);
	});
	test(`${context} preserves marker-shaped records, including raw JSON marker fields, through props and exports`, async ({
		page,
	}) => {
		await page.goto(consumerOrigin);
		const opening =
			context === "popup" ? page.waitForEvent("popup") : Promise.resolve(page);
		await page.evaluate(
			async ({ hostOrigin, context }) => {
				const libraryUrl = "/library.js";
				const { create, prop }: typeof import("../../src/index") = await import(
					libraryUrl
				);
				const Component = create({
					tag: "marker-record-browser",
					url: `${hostOrigin}/record-props`,
					props: { record: prop.any() },
				});
				const { rawJSON } = JSON as unknown as {
					rawJSON: (text: string) => object;
				};
				const record = {
					callback: {
						__type__: "function",
						__id__: "ordinary-id",
						__name__: "ordinary-name",
						optional: undefined,
					},
					date: {
						__forgeframe_wire_type__: "date",
						__forgeframe_wire_value__: null,
						optional: undefined,
					},
					encoded: {
						__type__: "base64",
						__value__: "JTdCJTIyZGVjb2RlZCUyMiUzQXRydWUlN0Q=",
						optional: undefined,
					},
					escaped: {
						__forgeframe_wire_type__: "record",
						__forgeframe_wire_value__: { original: true },
					},
					rawCallback: {
						__type__: rawJSON('"function"'),
						__id__: "raw-id",
						__name__: "raw-name",
					},
					rawDate: {
						__forgeframe_wire_type__: rawJSON('"date"'),
						__forgeframe_wire_value__: "2026-01-01T00:00:00.000Z",
					},
					rawEscaped: {
						__forgeframe_wire_type__: rawJSON('"record"'),
						__forgeframe_wire_value__: { original: true },
					},
				};
				const instance = Component({ record });
				(window as unknown as { instance: typeof instance }).instance =
					instance;
				await instance.render("#mount", context);
			},
			{ hostOrigin, context },
		);
		const hostPage = await opening;
		const host =
			context === "popup"
				? hostPage
				: page
						.frames()
						.find((frame) => frame.url() === `${hostOrigin}/record-props`);
		if (!host) throw new Error("Missing host");
		await host.waitForFunction(
			() => (window as unknown as { ready: boolean }).ready === true,
		);
		const expected = {
			callback: {
				__type__: "function",
				__id__: "ordinary-id",
				__name__: "ordinary-name",
			},
			date: {
				__forgeframe_wire_type__: "date",
				__forgeframe_wire_value__: null,
			},
			encoded: {
				__type__: "base64",
				__value__: "JTdCJTIyZGVjb2RlZCUyMiUzQXRydWUlN0Q=",
			},
			escaped: {
				__forgeframe_wire_type__: "record",
				__forgeframe_wire_value__: { original: true },
			},
			rawCallback: {
				__type__: "function",
				__id__: "raw-id",
				__name__: "raw-name",
			},
			rawDate: {
				__forgeframe_wire_type__: "date",
				__forgeframe_wire_value__: "2026-01-01T00:00:00.000Z",
			},
			rawEscaped: {
				__forgeframe_wire_type__: "record",
				__forgeframe_wire_value__: { original: true },
			},
		};
		expect(
			await host.evaluate(
				() =>
					(window as unknown as { received: { record: object } }).received
						.record,
			),
		).toEqual(expected);
		expect(
			await page.evaluate(
				() =>
					(window as unknown as { instance: { exports: object } }).instance
						.exports,
			),
		).toEqual({ record: expected });
		await page.evaluate(() =>
			(
				window as unknown as { instance: { close(): Promise<void> } }
			).instance.close(),
		);
	});
}

test("a host with '*' admits a real cross-origin consumer and binds its exact origin", async ({
	page,
}) => {
	await page.goto(consumerOrigin);
	const outcome = await page.evaluate(async (hostOrigin) => {
		const libraryUrl = "/library.js";
		const { create, prop } = await import(libraryUrl);
		return create({
			tag: "browser-any-consumer",
			url: `${hostOrigin}/any-consumer`,
			props: { label: prop.string() },
		})({ label: "public" })
			.render("#mount")
			.then(
				() => "rendered",
				(error: Error) => error.message,
			);
	}, attackerOrigin);
	expect(outcome).toBe("rendered");
	const frame = await (
		await page.locator("#mount iframe").elementHandle()
	)?.contentFrame();
	if (!frame) throw new Error("Missing host frame");
	await frame.waitForFunction(() => (window as { ready?: boolean }).ready);
	expect(
		await frame.evaluate(() => ({
			consumerDomain: (window as { consumerDomain?: string }).consumerDomain,
			label: (window as { label?: string }).label,
		})),
	).toEqual({ consumerDomain: consumerOrigin, label: "public" });
});

test("a host whose allowlist excludes the consumer refuses it and the render times out", async ({
	page,
}) => {
	await page.goto(consumerOrigin);
	const outcome = await page.evaluate(async (hostOrigin) => {
		const libraryUrl = "/library.js";
		const { create, prop } = await import(libraryUrl);
		return create({
			tag: "browser-excluded-consumer",
			url: `${hostOrigin}/excluded-consumer`,
			props: { label: prop.string() },
			timeout: 1500,
		})({ label: "blocked" })
			.render("#mount")
			.then(
				() => "rendered",
				(error: Error) => error.message,
			);
	}, attackerOrigin);
	expect(outcome).toContain('Host component "browser-excluded-consumer"');
	expect(outcome).toContain("did not initialize within 1500ms");
});

for (const [label, sandbox, expected] of [
	[
		"the default sandbox",
		undefined,
		"allow-scripts allow-same-origin allow-forms allow-popups",
	],
	[
		"a custom sandbox that keeps allow-same-origin",
		"allow-scripts allow-same-origin",
		"allow-scripts allow-same-origin",
	],
	["no sandbox for false", false, null],
] as const) {
	test(`${label} completes the handshake in a real engine`, async ({
		page,
	}) => {
		await page.goto(consumerOrigin);
		const result = await page.evaluate(
			async ({ hostOrigin, sandbox }) => {
				const libraryUrl = "/library.js";
				const { create, prop } = await import(libraryUrl);
				const outcome = await create({
					tag: "browser-sandbox",
					url: `${hostOrigin}/any-consumer`,
					props: { label: prop.string() },
					...(sandbox === undefined ? {} : { sandbox }),
				})({ label: "sandboxed" })
					.render("#mount")
					.then(
						() => "rendered",
						(error: Error) => error.message,
					);
				return {
					outcome,
					sandbox:
						document.querySelector("#mount iframe")?.getAttribute("sandbox") ??
						null,
				};
			},
			{ hostOrigin: attackerOrigin, sandbox },
		);
		expect(result).toEqual({ outcome: "rendered", sandbox: expected });
	});
}

test("'*' on the consumer never admits a host with an opaque origin", async ({
	page,
}) => {
	await page.goto(consumerOrigin);
	const outcome = await page.evaluate(async (hostOrigin) => {
		const libraryUrl = "/library.js";
		const { create, prop } = await import(libraryUrl);
		return create({
			tag: "browser-opaque-host",
			url: () => `${hostOrigin}/opaque-host`,
			domain: "*",
			props: { label: prop.string() },
			timeout: 1500,
		})({ label: "opaque" })
			.render("#mount")
			.then(
				() => "rendered",
				(error: Error) => error.message,
			);
	}, attackerOrigin);
	expect(outcome).toContain("did not initialize within 1500ms");
});
