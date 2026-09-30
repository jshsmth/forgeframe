import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { build } from "vite";

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
		const host = initHost({count:prop.number(),allowed:prop.string(),restricted:prop.string().optional()}, ['${consumerOrigin}']);
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
			if (req.url === "/encoded-props")
				return respond(
					res,
					`<!doctype html><script type="module">
			import {initHost,prop} from '/library.js';
			const host = initHost({config:prop.object().shape({onComplete:prop.function(),list:prop.array().of(prop.function()),date:prop.date()}),label:prop.string().optional()}, ['${consumerOrigin}']);
			await host.ready; window.received = host.hostProps; window.ready = true;
			</script>`,
				);
			if (req.url === "/record-props") {
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost,prop} from '/library.js';
				const host = initHost({record:prop.object()}, ['${consumerOrigin}']);
				await host.ready;
				window.received = host.hostProps;
				await host.hostProps.export({record:host.hostProps.record});
				window.ready = true;
				</script>`,
				);
			}
			if (req.url === "/early-update") {
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost,prop} from '/library.js';
				(window.opener || window.parent).postMessage('forgeframe-test-host-started', '${consumerOrigin}');
				const host = initHost({count:prop.number(),secret:prop.string(),onComplete:prop.function()}, ['${consumerOrigin}']);
				await host.ready; window.received = host.hostProps; window.ready = true;
				</script>`,
				);
			}
			if (req.url === "/retry") {
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost,prop} from '/library.js';
				const failed = initHost({count:prop.string()}, ['${consumerOrigin}']);
				try { await failed.ready; } catch(error) { window.firstError = error.message; }
				const host = initHost({count:prop.number(),secret:prop.string(),onComplete:prop.function()}, ['${consumerOrigin}']);
				window.reusedFailedHost = host === failed;
				await host.ready; window.received = host.hostProps; window.ready = true;
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
				const definitions = {count,secret:prop.string(),onComplete:prop.function()};
				const Component = create({tag:'browser-navigation-review',url:location.href,props:definitions,allowedConsumerDomains:['${consumerOrigin}']});
				const failed = initHost(definitions, ['${consumerOrigin}']);
				try { await failed.ready; } catch(error) { window.firstError = error.message; }
				reject = false;
				const host = initHost(definitions, ['${consumerOrigin}']);
				await host.ready;
				window.sameHostProps = Component.hostProps === host.hostProps;
				window.received = Component.hostProps; window.ready = true;
				</script>`,
				);
			}
			respond(
				res,
				`<!doctype html><button id="complete" style="position:absolute;top:400px">Complete payment</button>
		<script type="module">
		import {initHost,prop} from '/library.js';
		const host = initHost({count:prop.number(),secret:prop.string(),onComplete:prop.function()}, ['${consumerOrigin}']);
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
			if (req.url === "/allowed-host")
				return respond(
					res,
					`<!doctype html><script type="module">
				import {initHost} from "/library.js";
				const host = initHost(undefined, ["${consumerOrigin}"]);
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
				instance: import("../../src/types").ForgeFrameComponentInstance<
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
					secret: { schema: prop.string(), trustedDomains: hostOrigin },
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
	scenario: "base" | "lifecycle" | "converter" | "queued",
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
					instance: import("../../src/types").ForgeFrameComponentInstance<
						Record<string, unknown>
					>;
					outcome: Promise<string>;
					updates: Promise<void>[];
				};
				reviewWindow.updates = [];
				const parameter = method === "GET" ? "queryParam" : "bodyParam";
				reviewWindow.instance = create({
					tag: "browser-delivery-regression",
					url: "delivery?existing=a%20b#checkout?step=2",
					domain: [hostOrigin, attackerOrigin],
					timeout: 3000,
					props: {
						count: {
							schema: prop.number(),
							[parameter]: true,
							decorate: ({ value }: { value: unknown }) => {
								if (scenario === "queued" && value === 2)
									reviewWindow.updates.push(
										reviewWindow.instance.updateProps({ count: 3 }),
									);
								return value;
							},
						},
						allowed: {
							schema: prop.string(),
							[parameter]: ({ value }: { value: unknown }) => {
								if (scenario === "converter")
									base.href = `${attackerOrigin}/changed/`;
								return String(value);
							},
						},
						restricted: {
							schema: prop.string(),
							[parameter]: true,
							trustedDomains: hostOrigin,
						},
						hidden: {
							schema: prop.string(),
							[parameter]: true,
							sendToHost: false,
						},
						sameOrigin: {
							schema: prop.string(),
							[parameter]: true,
							sameDomain: true,
						},
					},
				})({
					count: 1,
					allowed: "visible",
					restricted: "restricted-sentinel",
					hidden: "hidden-sentinel",
					sameOrigin: "same-origin-sentinel",
					onRender: () => {
						if (scenario === "lifecycle")
							base.href = `${attackerOrigin}/changed/`;
					},
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

	for (const serialization of ["base64", "dotify"] as const) {
		test(`${context} ${serialization} preserves nested callbacks and Dates through updates`, async ({
			page,
		}) => {
			await page.goto(consumerOrigin);
			await page.evaluate(
				async ({ hostOrigin, context, serialization }) => {
					const libraryUrl = "/library.js";
					const { create, prop } = await import(libraryUrl);
					const instance = create({
						tag: "browser-encoded-functions",
						url: `${hostOrigin}/encoded-props`,
						domain: hostOrigin,
						timeout: 3000,
						props: {
							config: { schema: prop.object(), serialization },
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
						instance: import("../../src/types").ForgeFrameComponentInstance<
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
				{ hostOrigin, context, serialization },
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
					.find((frame) =>
						frame.url().startsWith(`${hostOrigin}/encoded-props`),
					);
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
						instance: import("../../src/types").ForgeFrameComponentInstance<
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
						instance: import("../../src/types").ForgeFrameComponentInstance<
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
	}

	for (const method of ["GET", "POST"] as const) {
		for (const scenario of [
			"base",
			"lifecycle",
			"converter",
			"queued",
		] as const) {
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
							trustedDomains: consumerOrigin,
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
		first: import("../../src/types").ForgeFrameComponentInstance<WidgetProps>;
		second: import("../../src/types").ForgeFrameComponentInstance<WidgetProps>;
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
			const { hostProps } = window as unknown as {
				hostProps: import("../../src/types").HostProps<WidgetProps>;
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
		() =>
			(window as unknown as { captured: { props: object; children?: unknown } })
				.captured,
	);
	expect(captured.props).toEqual({});
	expect(captured.children).toBeUndefined();
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

	test(`${context} factory hostProps follows a successful bootstrap retry`, async ({
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
					received: { count: number };
				};
				return {
					error: state.firstError.includes("temporary rejection"),
					same: state.sameHostProps,
					count: state.received.count,
				};
			}),
		).toEqual({ error: true, same: true, count: 1 });
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
					instance: import("../../src/types").ForgeFrameComponentInstance<
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
						count: {
							schema: prop.number(),
							hostDecorate: ({ value }: { value: number }) => {
								if (reviewWindow.armed) {
									reviewWindow.armed = false;
									queueMicrotask(() => {
										reviewWindow.updated = reviewWindow.instance.updateProps({
											count: 2,
											onComplete: () => 2,
										});
									});
								}
								return value;
							},
						},
						secret: prop.string(),
						onComplete: prop.function(),
					},
				})({ count: 1, secret: "sentinel", onComplete: () => 1 });
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
				await host.evaluate(
					() =>
						JSON.parse(
							decodeURIComponent(
								atob(window.name.slice("__forgeframe__".length)),
							),
						).props,
				),
			).toEqual({});
		}
	});
}

for (const context of ["iframe", "popup"] as const) {
	for (const serialization of ["json", "base64", "dotify"] as const) {
		test(`${context} preserves marker-shaped records through ${serialization} props and exports`, async ({
			page,
		}) => {
			await page.goto(consumerOrigin);
			const opening =
				context === "popup"
					? page.waitForEvent("popup")
					: Promise.resolve(page);
			await page.evaluate(
				async ({ hostOrigin, context, serialization }) => {
					const libraryUrl = "/library.js";
					const { create, prop }: typeof import("../../src/index") =
						await import(libraryUrl);
					const Component = create({
						tag: "marker-record-browser",
						url: `${hostOrigin}/record-props`,
						props: { record: { schema: prop.object(), serialization } },
					});
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
					};
					const instance = Component({ record });
					(window as unknown as { instance: typeof instance }).instance =
						instance;
					await instance.render("#mount", context);
				},
				{ hostOrigin, context, serialization },
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
}
