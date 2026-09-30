import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { build } from "vite";

const servers: Server[] = [];
let consumerOrigin: string;
let hostOrigin: string;

function output(result: Awaited<ReturnType<typeof build>>) {
	const built = Array.isArray(result) ? result[0] : result;
	if (!("output" in built)) throw new Error("Unexpected watch build");
	return built.output;
}
function code(result: Awaited<ReturnType<typeof build>>): string {
	const chunk = output(result).find((entry) => entry.type === "chunk");
	if (!chunk) throw new Error("Missing JavaScript bundle");
	return chunk.code;
}
async function listen(server: Server): Promise<string> {
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing port");
	return `http://127.0.0.1:${address.port}`;
}

test.beforeAll(async () => {
	const [library, host, logger] = await Promise.all([
		build({
			configFile: fileURLToPath(
				new URL("../../vite.config.ts", import.meta.url),
			),
			logLevel: "silent",
			build: { write: false },
		}),
		build({
			configFile: fileURLToPath(
				new URL("../../../playground/vite.config.host.ts", import.meta.url),
			),
			logLevel: "silent",
			build: { write: false },
		}),
		build({
			configFile: false,
			logLevel: "silent",
			build: {
				write: false,
				lib: {
					entry: fileURLToPath(
						new URL("../../../playground/consumer/logger.ts", import.meta.url),
					),
					formats: ["es"],
					fileName: "logger",
				},
			},
		}),
	]);
	const files = new Map(
		output(host).map((entry) => [
			entry.fileName,
			entry.type === "chunk" ? entry.code : entry.source,
		]),
	);
	hostOrigin = await listen(
		createServer((req, res) => {
			const path = new URL(req.url ?? "/", "http://fixture.invalid").pathname;
			const file = files.get(path === "/" ? "index.html" : path.slice(1));
			if (file === undefined) {
				res.statusCode = 404;
				res.end();
				return;
			}
			res.setHeader(
				"Content-Type",
				path.endsWith(".js") ? "text/javascript" : "text/html",
			);
			res.end(file);
		}),
	);
	consumerOrigin = await listen(
		createServer((req, res) => {
			if (req.url === "/library.js" || req.url === "/logger.js") {
				res.setHeader("Content-Type", "text/javascript");
				res.end(req.url === "/library.js" ? code(library) : code(logger));
				return;
			}
			res.setHeader("Content-Type", "text/html");
			res.end(
				'<!doctype html><button id="open">Open</button><div id="mount"></div><div id="event-log"></div>',
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

for (const context of ["iframe", "popup"] as const) {
	test(`${context} playground displays cross-window markup literally and preserves controls`, async ({
		page,
	}) => {
		const markup = '<img src="missing" data-injected="yes"> & <svg></svg>';
		const key = 'extra" data-injected="key"><svg>';
		await page.goto(consumerOrigin);
		await page.evaluate(
			async ({ hostOrigin, context, markup, key }) => {
				const libraryUrl = "/library.js";
				const loggerUrl = "/logger.js";
				const { create, prop } = await import(libraryUrl);
				const { log } = await import(loggerUrl);
				const instance = create({
					tag: "browser-playground-text",
					url: hostOrigin,
					props: {
						name: prop.string(),
						count: prop.number(),
						[key]: prop.string(),
						onGreet: prop.function(),
					},
				})({
					name: markup,
					count: 7,
					[key]: markup,
					onGreet: (message: string) => log(message, "success"),
				});
				const state = window as unknown as {
					instance: import("../../src/types").ForgeFrameComponentInstance<
						Record<string, unknown>
					>;
					outcome: Promise<void>;
				};
				state.instance = instance;
				document.getElementById("open")?.addEventListener("click", () => {
					state.outcome = instance.render("#mount", context);
				});
			},
			{ hostOrigin, context, markup, key },
		);
		const opened = context === "popup" ? page.waitForEvent("popup") : null;
		await page.click("#open");
		const popup = await opened;
		await page.evaluate(
			() => (window as unknown as { outcome: Promise<void> }).outcome,
		);
		const host =
			popup ??
			page.frames().find((frame) => frame.url().startsWith(hostOrigin));
		if (!host) throw new Error("Missing initialized playground host");
		if (popup)
			expect(
				await popup.evaluate(() => ({
					width: innerWidth,
					height: innerHeight,
				})),
			).toEqual({ width: 500, height: 500 });
		expect(
			await host.evaluate(
				(key) => document.getElementById(`prop-${key}`)?.textContent,
				key,
			),
		).toBe(markup);
		expect(await host.locator("[data-injected], img").count()).toBe(0);
		await host.locator("#btn-greet").click();
		await expect(page.locator(".log-entry .message")).toHaveText(
			`Hello! Name: ${markup}, Count: 7`,
		);
		expect(await page.locator("[data-injected], img, svg").count()).toBe(0);
		await page.evaluate(async () => {
			await (
				window as unknown as {
					instance: import("../../src/types").ForgeFrameComponentInstance<
						Record<string, unknown>
					>;
				}
			).instance.updateProps({ name: '<b data-injected="update">updated</b>' });
		});
		await expect(host.locator("#prop-name")).toHaveText(
			'<b data-injected="update">updated</b>',
		);
		expect(await host.locator("[data-injected]").count()).toBe(0);
		await host.locator("#btn-export").click();
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(
							window as unknown as {
								instance: { exports?: { data?: { count: number } } };
							}
						).instance.exports?.data?.count,
				),
			)
			.toBe(7);
	});
}
