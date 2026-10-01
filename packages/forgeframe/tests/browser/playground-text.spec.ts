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
	const consumer = await build({
		configFile: false,
		root: fileURLToPath(
			new URL("../../../playground/consumer", import.meta.url),
		),
		logLevel: "silent",
		define: {
			"import.meta.env.VITE_HOST_URL": JSON.stringify(hostOrigin),
			__FORGEFRAME_VERSION__: JSON.stringify("1.0.0"),
		},
		resolve: {
			alias: {
				forgeframe: fileURLToPath(
					new URL("../../src/index.ts", import.meta.url),
				),
			},
		},
		build: {
			write: false,
			rolldownOptions: {
				input: {
					main: fileURLToPath(
						new URL("../../../playground/consumer/index.html", import.meta.url),
					),
					redirect: fileURLToPath(
						new URL(
							"../../../playground/consumer/redirect.html",
							import.meta.url,
						),
					),
				},
			},
		},
	});
	const consumerFiles = new Map(
		output(consumer).map((entry) => [
			entry.fileName,
			entry.type === "chunk" ? entry.code : entry.source,
		]),
	);
	consumerOrigin = await listen(
		createServer((req, res) => {
			const path = new URL(req.url ?? "/", "http://fixture.invalid").pathname;
			const consumerFile = consumerFiles.get(
				path === "/editor" || path === "/tests" || path.startsWith("/tests/")
					? "index.html"
					: path.slice(1),
			);
			if (consumerFile !== undefined) {
				res.setHeader(
					"Content-Type",
					path.endsWith(".js")
						? "text/javascript"
						: path.endsWith(".css")
							? "text/css"
							: "text/html",
				);
				res.end(consumerFile);
				return;
			}
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
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(error.message));
		popup?.on("pageerror", (error) => pageErrors.push(error.message));
		await host.locator("#btn-close").click();
		await expect(page.locator("#mount iframe")).toHaveCount(0);
		if (popup) await expect.poll(() => popup.isClosed()).toBe(true);
		expect(pageErrors).toEqual([]);
	});
}

test("playground rejects reserved prop names and renders after a valid addition", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => {
		errors.push(error.message);
	});
	await page.route("https://**/*", (route) => route.abort());
	await page.goto(`${consumerOrigin}/editor`);
	await page.locator("#btn-add-prop").click();
	for (const name of ["onError", "close"]) {
		await page.locator("#new-prop-name").fill(name);
		await page.locator("#btn-confirm-add").click();
		await expect(page.locator(".log-entry.error .message").last()).toHaveText(
			"A non-reserved prop name is required",
		);
		await expect(page.locator(`input[data-prop="${name}"]`)).toHaveCount(0);
	}
	await page.locator("#new-prop-name").fill("customName");
	await page.locator("#btn-confirm-add").click();
	await page.locator('input[data-prop="customName"]').fill("recovered");
	await page.locator("#btn-render").click();
	await expect(page.locator("#status-text")).toHaveText("Rendered");
	const host = page
		.frames()
		.find((frame) => frame.url().startsWith(hostOrigin));
	if (!host) throw new Error("Missing playground host");
	expect(
		await host.evaluate(() => Reflect.get(window, "hostProps").customName),
	).toBe("recovered");
	await page.locator("#btn-close").click();
	await expect(page.locator("iframe")).toHaveCount(0);
	expect(errors).toEqual([]);
});

test("playground Set applies an edit when blur refreshes the code preview", async ({
	page,
}) => {
	await page.route("https://**/*", (route) => route.abort());
	await page.goto(`${consumerOrigin}/editor`);
	await page.locator('input[data-prop="name"]').fill("initial");
	await page.locator("#btn-render").click();
	await expect(page.locator("#status-text")).toHaveText("Rendered");
	const host = page
		.frames()
		.find((frame) => frame.url().startsWith(hostOrigin));
	if (!host) throw new Error("Missing playground host");
	await expect(host.locator("#prop-name")).toHaveText("initial");
	await page
		.locator('input[data-prop="name"]')
		.fill('updated "quoted" <b>value</b>');
	await expect(page.locator("#configuration-summary")).toContainText(
		"Draft changes pending",
	);
	await expect(host.locator("#prop-name")).toHaveText("initial");
	const bounds = await page
		.locator('button[data-update-prop="name"]')
		.boundingBox();
	if (!bounds) throw new Error("Missing Set button");
	// Use physical pointer events without locator retries after blur.
	await page.mouse.click(
		bounds.x + bounds.width / 2,
		bounds.y + bounds.height / 2,
	);
	await expect(host.locator("#prop-name")).toHaveText(
		'updated "quoted" <b>value</b>',
	);
	await expect(page.locator("#code-output")).toContainText(
		JSON.stringify('updated "quoted" <b>value</b>'),
	);
	await expect(page.locator("#configuration-summary")).toContainText(
		"Draft matches the running instance",
	);
	await page.getByRole("button", { name: "Popup", exact: true }).click();
	await expect(page.locator("#configuration-summary")).toContainText(
		"Running: Iframe / embedded. Draft changes pending",
	);
	await expect(page.locator("[data-remove-prop]")).toHaveCount(0);
	await page.locator("#btn-close").click();
	await expect(page.locator("iframe")).toHaveCount(0);
	await expect(page.locator("[data-remove-prop]")).toHaveCount(2);
});

test("playground labels controls, disables unavailable styles and reflows at mobile width", async ({
	page,
	browserName,
}) => {
	await page.route("https://**/*", (route) => route.abort());
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${consumerOrigin}/editor`);
	await expect(page.getByLabel("name", { exact: true })).toHaveValue("");
	await expect(page.getByLabel("count", { exact: true })).toHaveValue("0");
	await expect(page.locator(".code-panel")).not.toHaveAttribute("open");
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(390);
	const popup = page.getByRole("button", { name: "Popup", exact: true });
	await popup.click();
	await expect(popup).toHaveAttribute("aria-pressed", "true");
	await expect(
		page.getByRole("button", { name: "Embedded", exact: true }),
	).toBeDisabled();
	await expect(
		page.getByRole("button", { name: "Modal", exact: true }),
	).toBeDisabled();
	await popup.focus();
	await page.keyboard.press("Tab");
	// WebKit's default macOS Tab navigation skips links. Both paths must skip
	// the disabled iframe styles and reach the next available control.
	const nextControl =
		browserName === "webkit"
			? page.locator(".code-panel > summary")
			: page.getByRole("link", { name: "Test routes" });
	await expect(nextControl).toBeFocused();
	await page.getByRole("button", { name: "Iframe", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Embedded", exact: true }),
	).toBeEnabled();
	await page.getByLabel("name", { exact: true }).fill("Mobile test");
	await page.locator("#btn-render").click();
	await expect(page.locator("#status-text")).toHaveText("Rendered");
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(390);
	await page.locator("#btn-close").click();
	await expect(page.locator("iframe")).toHaveCount(0);
});

test("playground shows field errors without changing applied values and permits recovery", async ({
	page,
}) => {
	await page.route("https://**/*", (route) => route.abort());
	await page.goto(`${consumerOrigin}/editor`);
	await page.locator("#btn-render").click();
	await expect(page.locator("#status-text")).toHaveText("Rendered");
	const host = page
		.frames()
		.find((frame) => frame.url().startsWith(hostOrigin));
	if (!host) throw new Error("Missing playground host");
	const count = page.getByLabel("count", { exact: true });
	await count.fill("");
	await expect(count).toBeFocused();
	await expect(page.locator("#configuration-summary")).toContainText(
		"Draft contains incomplete or invalid values",
	);
	await expect(host.locator("#prop-count")).toHaveText("0");
	await expect(page.locator("#prop-input-1-error")).toBeEmpty();
	await count.fill("0");
	await expect(page.locator("#configuration-summary")).toContainText(
		"Draft matches the running instance",
	);
	await count.fill("");
	await page.getByRole("button", { name: "Apply count", exact: true }).click();
	await expect(count).toHaveAttribute("aria-invalid", "true");
	await expect(page.locator("#prop-input-1-error")).toContainText(
		"Expected a finite number",
	);
	await expect(host.locator("#prop-count")).toHaveText("0");
	await count.fill("7");
	await page.getByRole("button", { name: "Apply count", exact: true }).click();
	await expect(count).toHaveAttribute("aria-invalid", "false");
	await expect(page.locator("#prop-input-1-error")).toBeEmpty();
	await expect(host.locator("#prop-count")).toHaveText("7");
	await expect(page.locator("#running-props")).toContainText("count: 7");
	await page.locator("#btn-close").click();
});

test("long applied values leave the desktop host visible and its controls reachable", async ({
	page,
}) => {
	await page.route("https://**/*", (route) => route.abort());
	await page.setViewportSize({ width: 1024, height: 768 });
	await page.goto(`${consumerOrigin}/editor`);
	await page.getByLabel("name", { exact: true }).fill("x".repeat(1000));
	await page.locator("#btn-render").click();
	await expect(page.locator("#status-text")).toHaveText("Rendered");
	await page.locator(".applied-config > summary").click();
	await page.locator(".runtime-actions > summary").click();
	await expect
		.poll(async () => (await page.locator("iframe").boundingBox())?.height ?? 0)
		.toBeGreaterThan(150);
	const host = page
		.frames()
		.find((frame) => frame.url().startsWith(hostOrigin));
	if (!host) throw new Error("Missing playground host");
	await host.locator("#btn-greet").click();
	await expect(page.locator("#event-log")).toContainText("Host says: Hello!");
	await page.locator("#btn-close").click();
	await expect(page.locator("iframe")).toHaveCount(0);
});

test("test lab filters routes and stops safely between scenarios", async ({
	page,
}) => {
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${consumerOrigin}/tests`);
	await page
		.getByRole("searchbox", { name: "Find a scenario" })
		.fill("timeout");
	await expect(page.locator(".scenario-card:visible")).toHaveCount(1);
	await page
		.getByRole("searchbox", { name: "Find a scenario" })
		.fill("nothing matches this");
	await expect(page.locator("#catalog-empty")).toBeVisible();
	await page.getByRole("searchbox", { name: "Find a scenario" }).fill("");
	await expect(page.locator(".scenario-card:visible")).toHaveCount(18);
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(390);
	const run = page.getByRole("button", { name: "Run all automatic scenarios" });
	await run.click();
	await page.getByRole("button", { name: "Stop after this scenario" }).click();
	await expect(run).toBeEnabled({ timeout: 45_000 });
	await expect(page.locator("body")).toHaveAttribute(
		"data-test-status",
		"stopped",
	);
	await expect(page.locator("#sandbox-state")).toContainText(
		"Stopped between scenarios",
	);
	await expect(page.locator("#scenario-sandbox")).toBeEmpty();
	await expect(page.locator("iframe")).toHaveCount(0);
	const names = await page.locator(".result-name").allTextContents();
	expect(new Set(names.map((name) => name.split(": ")[0])).size).toBeLessThan(
		17,
	);
	await page.getByRole("button", { name: "Failures only" }).click();
	await expect(page.locator("#results-empty")).toHaveText(
		"No failed assertions in the current results.",
	);
	await page.getByRole("button", { name: "All results" }).click();
	await expect(page.locator(".result.pass").first()).toBeVisible();
});

test("playground test lab completes every automatic scenario and reruns cleanly", async ({
	page,
}) => {
	test.setTimeout(120_000);
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));
	await page.goto(`${consumerOrigin}/tests`);
	const run = page.getByRole("button", { name: "Run all automatic scenarios" });
	await expect(page.locator(".scenario-card")).toHaveCount(18);
	const expectedScenarios = [
		"Lifecycle and re-entry",
		"URL and iframe security",
		"Function bridge",
		"Props and delivery policy",
		"Consumer controls",
		"Nested components",
		"Error transport",
		"Configuration surface",
		"Instances and peers",
		"Host-initiated controls",
		"POST and trust policy",
		"Reliability and isolation",
		"Common actions",
		"Redirect journey",
		"Timeout and recovery",
		"Twenty-instance stress journey",
		"Customer checkout journey",
	];
	let firstNames: string[] | undefined;
	for (let iteration = 0; iteration < 2; iteration += 1) {
		await run.click();
		// Results report intermediate success too; wait for the runner to finish.
		await expect(run).toBeEnabled({ timeout: 90_000 });
		const failures = await page.locator(".result.fail").allTextContents();
		expect(failures).toEqual([]);
		await expect(page.locator(".result.pass")).toHaveCount(76);
		const names = await page.locator(".result-name").allTextContents();
		expect(
			[...new Set(names.map((name) => name.split(": ")[0]))].sort(),
		).toEqual(expectedScenarios.slice().sort());
		if (firstNames) expect(names).toEqual(firstNames);
		else firstNames = names;
		await expect(page.locator(".result.skip .result-name")).toHaveText(
			"POST and trust policy: POST body bootstrap requires a POST-capable host",
		);
		await expect(page.locator(".result.skip .result-detail")).toContainText(
			"Skipped in production",
		);
		await expect(page.locator("body")).toHaveAttribute(
			"data-test-status",
			"passed",
		);
		await expect(page.locator("iframe")).toHaveCount(0);
		await expect(page.locator("#scenario-sandbox")).toBeEmpty();
	}
	expect(pageErrors).toEqual([]);
});

test("playground popup scenario runs from a user click and cleans up", async ({
	page,
}) => {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));
	await page.goto(`${consumerOrigin}/tests/popup`);
	await expect(page.locator("#scenario-summary")).toHaveText(
		"Click Run scenario to allow the popup",
	);
	await expect(page.locator("#run-scenario")).toBeEnabled();
	expect(page.context().pages()).toHaveLength(1);
	await expect(page.locator("#scenario-results")).toBeEmpty();
	for (let iteration = 0; iteration < 2; iteration += 1) {
		const opened = page.waitForEvent("popup");
		await page.locator("#run-scenario").click();
		const popup = await opened;
		popup.on("pageerror", (error) => pageErrors.push(error.message));
		await expect(page.locator("#run-scenario")).toBeEnabled();
		expect(await page.locator(".result.fail").allTextContents()).toEqual([]);
		await expect(page.locator(".result.pass")).toHaveCount(5);
		await expect(page.locator(".result.skip")).toHaveCount(0);
		await expect(page.locator("body")).toHaveAttribute(
			"data-test-status",
			"passed",
		);
		await expect.poll(() => popup.isClosed()).toBe(true);
		await expect(page.locator("iframe")).toHaveCount(0);
		await expect(page.locator("#scenario-sandbox")).toBeEmpty();
	}
	expect(pageErrors).toEqual([]);
});
