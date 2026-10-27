import { createServer, type Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import type { ComponentInstance } from "../../src/types";
import { buildLibrary } from "./library-build";

/**
 * Real-browser checks for v2 guarantees the other specs do not reach:
 * sandbox tokens enforced inside the host, a forged message from another
 * origin ignored, a popup closed by the user, and a blocked popup.
 */

let consumerOrigin: string;
let hostOrigin: string;
let attackerOrigin: string;
const servers: Server[] = [];

/** What the consumer page keeps between `page.evaluate` calls. */
interface GuaranteeState {
	instance: ComponentInstance<Record<string, unknown>>;
	events: string[];
	probes: string[];
	forgerDone: boolean;
}

/** The consumer page's state, declared for this module only. */
declare const window: Window &
	typeof globalThis & { v2Guarantees?: GuaranteeState };

function serve(
	routes: (url: string) => string | undefined,
	library: ReadonlyMap<string, string>,
): Promise<string> {
	const server = createServer((req, res) => {
		const url = req.url ?? "/";
		const script = library.get(url);
		res.setHeader("Content-Type", script ? "text/javascript" : "text/html");
		res.end(script ?? routes(url) ?? '<!doctype html><div id="mount"></div>');
	});
	servers.push(server);
	return new Promise((resolve, reject) =>
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string")
				reject(new Error("Missing server port"));
			else resolve(`http://127.0.0.1:${address.port}`);
		}),
	);
}

test.beforeAll(async () => {
	const library = await buildLibrary();
	consumerOrigin = await serve(() => undefined, library);
	attackerOrigin = await serve(
		(url) =>
			url.startsWith("/forger")
				? `<!doctype html><script>
				// Loaded into the host's own frame, so only the origin differs from
				// the real host. Posts a well-formed v2 EXPORT for the consumer's
				// channel, then a marker that arrives after it.
				const uid = new URLSearchParams(location.search).get("uid");
				parent.postMessage("forgeframe:" + JSON.stringify({
					id: "forged-export", type: "request", name: "forgeframe_export",
					data: { forged: true }, source: { uid, domain: location.origin },
				}), "*");
				parent.postMessage({ forgerDone: true }, "*");
				</script>`
				: undefined,
		library,
	);
	hostOrigin = await serve(
		(url) =>
			url === "/sandbox-probe"
				? `<!doctype html><script type="module">
				import {initHost,prop} from "/library.js";
				const host = initHost({props:{label:prop.string()}, consumerOrigins:"*"});
				await host.ready;
				let opened = null;
				try { opened = window.open("about:blank", "_blank"); } catch {}
				opened?.close();
				// Report before the form submission can navigate this frame away.
				parent.postMessage({ sandboxProbe: opened ? "opened" : "blocked" }, "*");
				const form = document.createElement("form");
				form.method = "POST"; form.action = "/form-target";
				document.body.append(form);
				form.submit();
				parent.postMessage({ sandboxProbe: "submitted" }, "*");
				</script>`
				: url === "/form-target"
					? "<!doctype html><p>submitted</p>"
					: `<!doctype html><script type="module">
				import {initHost,prop} from "/library.js";
				const host = initHost({props:{label:prop.string()}, consumerOrigins:"*"});
				window.received = await host.ready;
				await host.export({ ready: true });
				window.ready = true;
				</script>`,
		library,
	);
});

test.afterAll(async () => {
	await Promise.all(
		servers.map(
			(server) => new Promise<void>((resolve) => server.close(() => resolve())),
		),
	);
});

/** Renders a host page from the consumer page and records its lifecycle. */
async function renderHost(
	page: Page,
	options: { path: string; context?: "iframe" | "popup"; sandbox?: string },
): Promise<string> {
	await page.goto(consumerOrigin);
	return page.evaluate(
		async ({ hostOrigin, path, context, sandbox }) => {
			const libraryUrl = "/library.js";
			const { create, prop } = await import(libraryUrl);
			const state: GuaranteeState = {
				instance: create({
					tag: "browser-v2-guarantees",
					url: `${hostOrigin}${path}`,
					props: { label: prop.string() },
					initTimeout: 5000,
					...(sandbox === undefined ? {} : { sandbox }),
				})({ label: "guarded" }),
				events: [],
				probes: [],
				forgerDone: false,
			};
			window.v2Guarantees = state;
			window.addEventListener("message", (event) => {
				const probe = (event.data as { sandboxProbe?: string } | null)
					?.sandboxProbe;
				if (probe) state.probes.push(probe);
			});
			for (const name of ["exports", "close", "closed"] as const)
				state.instance.event.on(name, () => {
					state.events.push(name);
				});
			return state.instance.render("#mount", context).then(
				() => "rendered",
				(error: Error & { code?: string }) => `${error.code}: ${error.message}`,
			);
		},
		{ hostOrigin, ...options },
	);
}

for (const [label, sandbox, popups, forms] of [
	["the default sandbox", undefined, "opened", true],
	[
		"a sandbox without allow-popups and allow-forms",
		"allow-scripts allow-same-origin",
		"blocked",
		false,
	],
] as const) {
	test(`${label} is enforced inside the host`, async ({ page }) => {
		const submissions: string[] = [];
		await page.route(`${hostOrigin}/form-target`, async (route) => {
			submissions.push(route.request().method());
			await route.continue();
		});
		page.on("popup", (popup) => void popup.close());

		expect(await renderHost(page, { path: "/sandbox-probe", sandbox })).toBe(
			"rendered",
		);
		// The probe reports window.open, then whether form.submit() returned.
		await expect
			.poll(() => page.evaluate(() => window.v2Guarantees?.probes))
			.toEqual([popups, "submitted"]);
		if (forms) await expect.poll(() => submissions).toEqual(["POST"]);
		else {
			// A blocked submission sends nothing, so wait a bounded time for a
			// POST that should never come; the allowed case shows one arrives.
			await expect(page.locator("#mount iframe")).toBeAttached();
			await new Promise((resolve) => setTimeout(resolve, 500));
			expect(submissions).toEqual([]);
		}
	});
}

test("a well-formed message from another origin is ignored", async ({
	page,
}) => {
	expect(await renderHost(page, { path: "/plain-host" })).toBe("rendered");
	await expect
		.poll(() => page.evaluate(() => window.v2Guarantees?.instance.exports))
		.toEqual({ ready: true });
	const uid = await page.evaluate(() => {
		const state = window.v2Guarantees;
		if (!state) throw new Error("Missing consumer state");
		return state.instance.uid;
	});

	await page.evaluate(
		({ attackerOrigin, uid }) => {
			const state = window.v2Guarantees;
			if (!state) throw new Error("Missing consumer state");
			state.forgerDone = false;
			window.addEventListener("message", (event) => {
				if ((event.data as { forgerDone?: boolean } | null)?.forgerDone)
					state.forgerDone = true;
			});
			// Navigate the host's own frame, keeping its window identity.
			const frame = document.querySelector<HTMLIFrameElement>("#mount iframe");
			if (!frame) throw new Error("Missing host iframe");
			frame.src = `${attackerOrigin}/forger?uid=${encodeURIComponent(uid)}`;
		},
		{ attackerOrigin, uid },
	);
	await expect
		.poll(() => page.evaluate(() => window.v2Guarantees?.forgerDone))
		.toBe(true);

	// The forged export neither replaces the exports nor emits a second event.
	expect(
		await page.evaluate(() => ({
			exports: window.v2Guarantees?.instance.exports,
			events: window.v2Guarantees?.events,
		})),
	).toEqual({ exports: { ready: true }, events: ["exports"] });
});

test("a popup the user closes ends the instance", async ({ page }) => {
	const popupOpened = page.waitForEvent("popup");
	const rendering = renderHost(page, { path: "/plain-host", context: "popup" });
	const popup = await popupOpened;
	expect(await rendering).toBe("rendered");
	await expect
		.poll(() => page.evaluate(() => window.v2Guarantees?.events))
		.toEqual(["exports"]);

	await popup.close();

	await expect
		.poll(() => page.evaluate(() => window.v2Guarantees?.events))
		.toEqual(["exports", "close", "closed"]);
});

test("a blocked popup rejects with POPUP_BLOCKED and leaves the instance usable", async ({
	page,
}) => {
	await page.addInitScript(() => {
		window.open = () => null;
	});

	expect(
		await renderHost(page, { path: "/plain-host", context: "popup" }),
	).toMatch(/^POPUP_BLOCKED: /);
	expect(
		await page.evaluate(() => {
			const state = window.v2Guarantees;
			if (!state) throw new Error("Missing consumer state");
			return state.instance.render("#mount").then(() => "rendered");
		}),
	).toBe("rendered");
	await expect(page.locator("#mount iframe")).toHaveCount(1);
});
