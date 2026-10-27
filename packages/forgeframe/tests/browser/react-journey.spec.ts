import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { build, type Plugin } from "vite";
import { buildLibrary } from "./library-build";

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

/**
 * Resolves `forgeframe` and `forgeframe/react` to the production build's
 * entries, and their relative imports to its shared chunks.
 */
function productionLibrary(files: ReadonlyMap<string, string>): Plugin {
	const prefix = "\0forgeframe-build:";
	const entries: Record<string, string> = {
		forgeframe: "/library.js",
		"forgeframe/react": "/react.js",
	};
	return {
		name: "forgeframe-production-library",
		resolveId(source, importer) {
			const entry = entries[source];
			if (entry) return prefix + entry;
			if (importer?.startsWith(prefix) && source.startsWith("./"))
				return `${prefix}/${source.slice(2)}`;
			return null;
		},
		load(id) {
			return id.startsWith(prefix) ? files.get(id.slice(prefix.length)) : null;
		},
	};
}

function bundle(result: Awaited<ReturnType<typeof build>>): string {
	const built = Array.isArray(result) ? result[0] : result;
	if (!("output" in built)) throw new Error("Unexpected watch build");
	const chunk = built.output.find((entry) => entry.type === "chunk");
	if (!chunk) throw new Error("Missing browser fixture bundle");
	return chunk.code;
}

test.beforeAll(async () => {
	const library = await buildLibrary();
	const consumer = await build({
		configFile: false,
		logLevel: "silent",
		plugins: [productionLibrary(library)],
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
	});
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
		<button id="default-theme">Default theme</button>
		<button id="use-instance">Use instance</button><output id="instance-result"></output>
		<button id="unmount">Unmount</button><output id="callback"></output>
		<div id="mount"></div><script type="module" src="/journey.js"></script>`);
		}),
	);
	hostOrigin = await listen(
		createServer((req, res) => {
			const libraryFile = library.get(req.url ?? "");
			if (libraryFile !== undefined) {
				res.setHeader("Content-Type", "text/javascript");
				res.end(libraryFile);
				return;
			}
			res.setHeader("Content-Type", "text/html");
			res.end(`<!doctype html><output id="snapshot"></output>
		<output id="history"></output>
		<button id="invoke">Call consumer</button><output id="result"></output>
		<script type="module">
		import {initHost,prop} from '/library.js';
		const host = initHost({props:{label:prop.string(), count:prop.number().min(0), theme:prop.string(), onAction:prop.function()}, consumerOrigins:['${consumerOrigin}']});
		const props = await host.ready;
		await host.export({ greet: (name) => 'hello ' + name + ' from ' + props.label });
		const history = [];
		const show = () => {
			const snapshot = props.label + ':' + props.count + ':' + props.theme;
			history.push(snapshot);
			document.getElementById('snapshot').textContent = snapshot;
			document.getElementById('history').textContent = history.join('|');
		};
		show();
		host.onProps(show);
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
				hasInstance: true,
				setups: strict ? 2 : 1,
				cleanups: strict ? 1 : 0,
			});
		await expect(page.locator("#mount iframe")).toHaveCount(1);
		const frame = page.locator("#mount iframe").contentFrame();
		await expect(frame.locator("#snapshot")).toHaveText("initial:1:dark");
		await page.locator("#use-instance").click();
		await expect(page.locator("#instance-result")).toHaveText(
			"hello react from initial",
		);
		await expect(page.locator("#mount iframe")).toHaveCSS("width", "320px");
		await expect(page.locator("#mount iframe")).toHaveCSS("height", "180px");
		await frame.locator("#invoke").click();
		await expect(frame.locator("#result")).toHaveText("initial:host-click-1");
		await expect(page.locator("#callback")).toHaveText("initial:host-click-1");
		await page.locator("#update").click();
		await expect(frame.locator("#snapshot")).toHaveText("updated:2:dark");
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
		await expect(frame.locator("#snapshot")).toHaveText("updated:2:dark");
		await frame.locator("#invoke").click();
		await expect(frame.locator("#result")).toHaveText("updated:host-click-3");
		await expect(page.locator("#callback")).toHaveText("updated:host-click-3");
		await page.locator("#recover").click();
		await expect(frame.locator("#snapshot")).toHaveText("recovered:3:dark");
		await frame.locator("#invoke").click();
		await expect(frame.locator("#result")).toHaveText("recovered:host-click-4");
		await expect(page.locator("#callback")).toHaveText(
			"recovered:host-click-4",
		);
		await page.locator("#default-theme").click();
		await expect(frame.locator("#snapshot")).toHaveText("recovered:3:light");
		await page.locator("#unmount").click();
		await expect
			.poll(() => page.evaluate(() => window.reactJourney.snapshot()))
			.toMatchObject({
				instances: 0,
				rendered: 1,
				hasRef: false,
				hasInstance: false,
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

for (const strict of [false, true]) {
	test(`React ${strict ? "StrictMode" : "normal"} commits made while the frame loads reach the host in order`, async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(error.message));
		// Hold the host document until the second commit is made, so the
		// commit always lands while the frame is still loading.
		let releaseHost = () => {};
		const hostAllowed = new Promise<void>((resolve) => {
			releaseHost = resolve;
		});
		await page.route(`${hostOrigin}/**`, async (route) => {
			await hostAllowed;
			await route.continue();
		});
		await page.goto(
			`${consumerOrigin}/?host=${encodeURIComponent(hostOrigin)}&strict=${strict}`,
		);
		await page.locator("#start").click();
		await expect(page.locator("#mount iframe")).toHaveCount(1);
		await page.locator("#update").click();
		// The second commit lands while the host document is still held.
		await expect
			.poll(() =>
				page.evaluate(() => window.reactJourney.snapshot().committedLabel),
			)
			.toBe("updated");
		expect(
			await page.evaluate(() => window.reactJourney.snapshot().rendered),
		).toBe(0);
		releaseHost();
		const frame = page.locator("#mount iframe").contentFrame();
		await expect(frame.locator("#history")).toHaveText(
			"initial:1:dark|updated:2:dark",
		);
		await expect
			.poll(() => page.evaluate(() => window.reactJourney.snapshot()))
			.toMatchObject({ rendered: 1, errors: [] });
		expect(pageErrors).toEqual([]);
	});
}
