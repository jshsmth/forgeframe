import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { build } from "vite";

const servers: Server[] = [];
let consumerOrigin: string;
let hostOrigin: string;

async function listen(server: Server): Promise<string> {
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing server port");
	return `http://127.0.0.1:${address.port}`;
}

function bundle(result: Awaited<ReturnType<typeof build>>): string {
	const built = Array.isArray(result) ? result[0] : result;
	if (!("output" in built)) throw new Error("Unexpected watch build");
	const chunk = built.output.find((entry) => entry.type === "chunk");
	if (!chunk) throw new Error("Missing browser fixture bundle");
	return chunk.code;
}

test.beforeAll(async () => {
	const [library, consumer] = await Promise.all([
		build({
			configFile: fileURLToPath(
				new URL("../../vite.config.ts", import.meta.url),
			),
			logLevel: "silent",
			build: { write: false },
		}),
		build({
			configFile: false,
			logLevel: "silent",
			define: {
				"process.env.NODE_ENV": JSON.stringify("development"),
				__FORGEFRAME_VERSION__: JSON.stringify("browser-fixture"),
			},
			build: {
				write: false,
				lib: {
					entry: fileURLToPath(
						new URL("./react-journey-fixture.ts", import.meta.url),
					),
					formats: ["es"],
					fileName: "react-journey",
				},
			},
		}),
	]);
	const libraryCode = bundle(library);
	const consumerCode = bundle(consumer);
	consumerOrigin = await listen(
		createServer((req, res) => {
			if (req.url === "/journey.js") {
				res.setHeader("Content-Type", "text/javascript");
				res.end(consumerCode);
				return;
			}
			res.setHeader("Content-Type", "text/html");
			res.end(`<!doctype html><div id="application-sibling">Application content</div>
		<button id="start">Mount</button><button id="update">Update</button>
		<button id="invalid">Invalid</button><button id="recover">Recover</button>
		<button id="unmount">Unmount</button><output id="callback"></output>
		<div id="mount"></div><script type="module" src="/journey.js"></script>`);
		}),
	);
	hostOrigin = await listen(
		createServer((req, res) => {
			if (req.url === "/library.js") {
				res.setHeader("Content-Type", "text/javascript");
				res.end(libraryCode);
				return;
			}
			res.setHeader("Content-Type", "text/html");
			res.end(`<!doctype html><output id="snapshot"></output>
		<button id="invoke">Call consumer</button><output id="result"></output>
		<script type="module">
		import {initHost,prop} from '/library.js';
		const host = initHost({label:prop.string(), count:prop.number().min(0), onAction:prop.function()}, ['${consumerOrigin}']);
		await host.ready;
		const props = host.hostProps;
		const show = () => document.getElementById('snapshot').textContent = props.label + ':' + props.count;
		show();
		props.onProps(show);
		let calls = 0;
		document.getElementById('invoke').onclick = async () => {
			document.getElementById('result').textContent = await props.onAction('host-click-' + ++calls);
		};
		</script>`);
		}),
	);
});

test.afterAll(async () => {
	await Promise.all(
		servers.map(
			(server) =>
				new Promise<void>((resolve, reject) => {
					server.close((error) => (error ? reject(error) : resolve()));
				}),
		),
	);
});

for (const strict of [false, true]) {
	test(`React ${strict ? "StrictMode" : "normal"} journey synchronizes, recovers and unmounts across origins`, async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(error.message));
		await page.goto(
			`${consumerOrigin}/?host=${encodeURIComponent(hostOrigin)}&strict=${strict}`,
		);
		await page.locator("#start").click();
		await expect
			.poll(() => page.evaluate(() => window.reactJourney.snapshot()))
			.toMatchObject({
				instances: 1,
				rendered: 1,
				errors: [],
				hasRef: true,
				setups: strict ? 2 : 1,
				cleanups: strict ? 1 : 0,
			});
		await expect(page.locator("#mount iframe")).toHaveCount(1);
		const frame = await (
			await page.locator("#mount iframe").elementHandle()
		)?.contentFrame();
		if (!frame) throw new Error("Missing React host iframe");
		await expect(frame.locator("#snapshot")).toHaveText("initial:1");
		await frame.locator("#invoke").click();
		await expect(frame.locator("#result")).toHaveText("initial:host-click-1");
		await expect(page.locator("#callback")).toHaveText("initial:host-click-1");
		await page.locator("#update").click();
		await expect(frame.locator("#snapshot")).toHaveText("updated:2");
		await frame.locator("#invoke").click();
		await expect(frame.locator("#result")).toHaveText("updated:host-click-2");
		await expect(page.locator("#callback")).toHaveText("updated:host-click-2");
		await page.locator("#invalid").click();
		await expect
			.poll(() =>
				page.evaluate(() => window.reactJourney.snapshot().errors.length),
			)
			.toBe(1);
		expect(
			await page.evaluate(() => window.reactJourney.snapshot().errors[0]),
		).toMatch(/count/);
		await expect(frame.locator("#snapshot")).toHaveText("updated:2");
		await frame.locator("#invoke").click();
		await expect(frame.locator("#result")).toHaveText("updated:host-click-3");
		await expect(page.locator("#callback")).toHaveText("updated:host-click-3");
		await page.locator("#recover").click();
		await expect(frame.locator("#snapshot")).toHaveText("recovered:3");
		await frame.locator("#invoke").click();
		await expect(frame.locator("#result")).toHaveText("recovered:host-click-4");
		await expect(page.locator("#callback")).toHaveText(
			"recovered:host-click-4",
		);
		await page.locator("#unmount").click();
		await expect
			.poll(() => page.evaluate(() => window.reactJourney.snapshot()))
			.toMatchObject({
				instances: 0,
				rendered: 1,
				hasRef: false,
				cleanups: strict ? 2 : 1,
				errors: [expect.stringMatching(/count/)],
			});
		await expect(page.locator("#mount")).toBeEmpty();
		await expect(page.locator("iframe")).toHaveCount(0);
		await expect(page.locator("#application-sibling")).toHaveText(
			"Application content",
		);
		expect(pageErrors).toEqual([]);
	});
}
