import { mkdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type FrameLocator, type Page, test } from "@playwright/test";
import { build } from "vite";

const servers: Server[] = [];
type Files = Map<string, string | Uint8Array>;
const consumerFiles: Files = new Map();
const hostFiles: Files = new Map();
const httpConsumerFiles: Files = new Map();
const httpHostFiles: Files = new Map();
const httpConsumerOrigin = "http://clinic.demo.test";
const httpHostOrigin = "http://provider.demo.test";
let consumerOrigin: string;
let hostOrigin: string;

function contentType(path: string): string {
	const types: Record<string, string> = {
		js: "text/javascript",
		css: "text/css",
		png: "image/png",
		webp: "image/webp",
		woff2: "font/woff2",
		ttf: "font/ttf",
	};
	return types[path.split(".").pop() ?? ""] ?? "text/html";
}

async function serve(files: Files, consumer: boolean): Promise<string> {
	const server = createServer((request, response) => {
		const path = new URL(request.url ?? "/", "http://fixture.invalid").pathname;
		const key =
			path === "/" || (consumer && ["/company", "/company/"].includes(path))
				? "index.html"
				: path.slice(1);
		const file = files.get(key);
		if (file === undefined) {
			response.writeHead(404).end();
			return;
		}
		response.setHeader("Content-Type", contentType(path));
		response.end(file);
	});
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing fixture port");
	return `http://127.0.0.1:${address.port}`;
}

function collect(
	files: Files,
	result: Awaited<ReturnType<typeof build>>,
): void {
	const built = Array.isArray(result) ? result[0] : result;
	if (!("output" in built)) throw new Error("Unexpected watch build");
	for (const entry of built.output)
		files.set(
			entry.fileName,
			entry.type === "chunk" ? entry.code : entry.source,
		);
}

test.beforeAll(async () => {
	[consumerOrigin, hostOrigin] = await Promise.all([
		serve(consumerFiles, true),
		serve(hostFiles, false),
	]);
	for (const fixture of [
		{ consumerOrigin, hostOrigin, consumerFiles, hostFiles },
		{
			consumerOrigin: httpConsumerOrigin,
			hostOrigin: httpHostOrigin,
			consumerFiles: httpConsumerFiles,
			hostFiles: httpHostFiles,
		},
	]) {
		const [consumer, host] = await Promise.all([
			build({
				configFile: fileURLToPath(
					new URL(
						"../../../playground/vite.config.consumer.ts",
						import.meta.url,
					),
				),
				logLevel: "silent",
				define: {
					"import.meta.env.VITE_HOST_URL": JSON.stringify(fixture.hostOrigin),
				},
				build: { write: false },
			}),
			build({
				configFile: fileURLToPath(
					new URL("../../../playground/vite.config.host.ts", import.meta.url),
				),
				logLevel: "silent",
				define: {
					"import.meta.env.VITE_CONSUMER_URL": JSON.stringify(
						fixture.consumerOrigin,
					),
				},
				build: { write: false },
			}),
		]);
		collect(fixture.consumerFiles, consumer);
		collect(fixture.hostFiles, host);
	}
	// Use a deliberately faulty merchant with the real production payment host and bridge.
	const library = await build({
		configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
		logLevel: "silent",
		build: { write: false },
	});
	const bundled = Array.isArray(library) ? library[0] : library;
	if (!("output" in bundled)) throw new Error("Unexpected watch build");
	const chunk = bundled.output.find((entry) => entry.type === "chunk");
	if (!chunk) throw new Error("Missing library fixture bundle");
	consumerFiles.set("library.js", chunk.code);
	consumerFiles.set(
		"acknowledgement-fixture.html",
		`<!doctype html><button id="open-payment" disabled>Open payment</button><div id="mount"></div>
		<script type="module">
		import {create,prop} from '/library.js';
		window.acknowledgement = {status:'recorded',invoiceId:'PV-OTHER'};
		window.results = 0;
		window.paymentWindowClosed = false;
		const payment = create({
			tag:'acknowledgement-fixture',url:'${hostOrigin}/payment.html',domain:'${hostOrigin}',
			dimensions:{width:480,height:740},
			props:{invoiceId:prop.string(),amountCents:prop.number(),customer:prop.string(),
				outcome:prop.enum(['success','decline']),onReady:prop.function(),onResult:prop.function()},
			attributes:{title:'Harbor Pay demo payment form'}
		});
		const button = document.querySelector('#open-payment');
		button.addEventListener('click',() => {
			const instance = payment({invoiceId:'PV-1042',amountCents:17600,customer:'Demo customer',
				outcome:new URL(location.href).searchParams.get('outcome') || 'success',onReady:()=>{},onResult:()=>{window.results++;return window.acknowledgement;}});
			instance.event.on('destroy',()=>{window.paymentWindowClosed=true;});
			void instance.render(document.querySelector('#mount'),new URL(location.href).searchParams.get('context'));
		});
		button.disabled = false;
		</script>`,
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

type Provider = FrameLocator | Page;

async function openPayment(
	page: Page,
	context: "iframe" | "popup",
): Promise<Provider> {
	if (!(await page.getByLabel("Payment window", { exact: true }).isVisible()))
		await page.getByText("Demo options", { exact: true }).click();
	await page
		.getByLabel("Payment window", { exact: true })
		.selectOption(context);
	const opened = context === "popup" ? page.waitForEvent("popup") : null;
	await page
		.getByRole("button", {
			name: (await page.locator("#technical-panel").isVisible())
				? "Try this payment"
				: "Take payment",
			exact: true,
		})
		.click();
	const provider = opened
		? await opened
		: page.frameLocator('iframe[title="Harbor Pay demo payment form"]');
	await expect(
		provider.getByRole("heading", { name: "Pay Pip Veterinary" }),
	).toBeVisible();
	if (context === "iframe")
		await expect(page.locator("#payment-mount .payment-loading")).toHaveCount(
			0,
		);
	return provider;
}

for (const context of ["iframe", "popup"] as const) {
	test(`${context} validates decline acknowledgements before reporting the outcome`, async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(
			`${consumerOrigin}/acknowledgement-fixture.html?context=${context}&outcome=decline`,
		);
		async function openProvider(): Promise<Provider> {
			const opened = context === "popup" ? page.waitForEvent("popup") : null;
			await page.getByRole("button", { name: "Open payment" }).click();
			const provider = opened
				? await opened
				: page.frameLocator('iframe[title="Harbor Pay demo payment form"]');
			if (context === "popup")
				(provider as Page).on("pageerror", (error) =>
					errors.push(error.message),
				);
			await provider.getByRole("button", { name: "Use demo details" }).click();
			await provider
				.getByRole("button", { name: "Pay $176.00", exact: true })
				.click();
			return provider;
		}
		for (const acknowledgement of [
			null,
			{ status: "recorded", invoiceId: "PV-1042" },
			{ status: "declined", invoiceId: "PV-OTHER" },
		]) {
			await page.evaluate(
				(value) => Reflect.set(window, "acknowledgement", value),
				acknowledgement,
			);
			const provider = await openProvider();
			await expect(provider.locator("#payment-feedback")).toHaveText(
				"The clinic could not confirm this payment. Close the window and try again from the invoice.",
			);
			await provider
				.getByRole("button", { name: "Cancel payment", exact: true })
				.click();
			if (context === "popup")
				await expect.poll(() => (provider as Page).isClosed()).toBe(true);
			else
				await expect(
					page.locator('iframe[title="Harbor Pay demo payment form"]'),
				).toHaveCount(0);
		}
		await page.evaluate(() =>
			Reflect.set(window, "acknowledgement", {
				status: "declined",
				invoiceId: "PV-1042",
			}),
		);
		const provider = await openProvider();
		await expect(provider.locator("#payment-feedback")).toHaveText(
			"The demo payment was declined. No payment was taken. Try again to simulate an approval.",
		);
		await page.evaluate(() =>
			Reflect.set(window, "acknowledgement", {
				status: "recorded",
				invoiceId: "PV-1042",
			}),
		);
		await provider
			.getByRole("button", { name: "Retry payment $176.00", exact: true })
			.click();
		if (context === "popup")
			await expect.poll(() => (provider as Page).isClosed()).toBe(true);
		else
			await expect(
				page.locator('iframe[title="Harbor Pay demo payment form"]'),
			).toHaveCount(0);
		expect(await page.evaluate(() => Reflect.get(window, "results"))).toBe(5);
		expect(errors).toEqual([]);
	});

	test(`${context} rejects a mismatched acknowledgement without approving or closing`, async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(
			`${consumerOrigin}/acknowledgement-fixture.html?context=${context}`,
		);
		const opened = context === "popup" ? page.waitForEvent("popup") : null;
		await page.getByRole("button", { name: "Open payment" }).click();
		const provider = opened
			? await opened
			: page.frameLocator('iframe[title="Harbor Pay demo payment form"]');
		if (context === "popup")
			(provider as Page).on("pageerror", (error) => errors.push(error.message));
		await provider.getByRole("button", { name: "Use demo details" }).click();
		await provider
			.getByRole("button", { name: "Pay $176.00", exact: true })
			.click();
		await expect(provider.locator("#payment-feedback")).toHaveText(
			"The clinic could not confirm this payment. Close the window and try again from the invoice.",
		);
		await expect(
			provider.getByRole("button", {
				name: "Retry payment $176.00",
				exact: true,
			}),
		).toBeEnabled();
		expect(
			await page.evaluate(() => Reflect.get(window, "paymentWindowClosed")),
		).toBe(false);
		expect(await page.evaluate(() => Reflect.get(window, "results"))).toBe(1);
		await page.evaluate(() => {
			Reflect.set(window, "acknowledgement", {
				status: "recorded",
				invoiceId: "PV-1042",
			});
		});
		await provider
			.getByRole("button", { name: "Retry payment $176.00", exact: true })
			.click();
		await expect
			.poll(() =>
				page.evaluate(() => Reflect.get(window, "paymentWindowClosed")),
			)
			.toBe(true);
		expect(await page.evaluate(() => Reflect.get(window, "results"))).toBe(2);
		if (context === "popup")
			await expect.poll(() => (provider as Page).isClosed()).toBe(true);
		else
			await expect(
				page.locator('iframe[title="Harbor Pay demo payment form"]'),
			).toHaveCount(0);
		expect(errors).toEqual([]);
	});

	test(`${context} rejects a malformed result before committing and permits payment retry`, async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(`${consumerOrigin}/company`);
		const provider = await openPayment(page, context);
		const rejection = await provider.locator("body").evaluate(async () => {
			const props = Reflect.get(window, "hostProps");
			try {
				await props.onResult({
					status: "approved",
					receipt: {
						invoiceId: props.invoiceId,
						amountCents: props.amountCents,
						transactionId: "HP-MALFORMED",
						paidAt: "not-a-date",
						lastFour: "4242",
					},
				});
				return "Callback unexpectedly accepted";
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
		});
		expect(rejection).toContain("Invalid payment result.");
		await expect(page.locator("#invoice-status")).toHaveText(
			"Awaiting payment",
		);
		await expect(page.locator("#invoice-summary")).toHaveText(
			"3 awaiting payment",
		);
		await expect(
			page.getByRole("heading", { name: "Payment received" }),
		).toHaveCount(0);
		await expect(page.locator("#onResult-calls")).toHaveText("0 calls");
		await provider.getByRole("button", { name: "Use demo details" }).click();
		await provider
			.getByRole("button", { name: "Pay $176.00", exact: true })
			.click();
		await expect(
			page.getByRole("heading", { name: "Payment received" }),
		).toBeVisible();
		await expect(page.locator("#invoice-status")).toHaveText("Paid");
		await expect(page.locator("#onResult-calls")).toHaveText("1 call");
		await expect(page.locator("#integration-events")).toContainText(
			"Payment window closed",
		);
		if (context === "popup")
			await expect.poll(() => (provider as Page).isClosed()).toBe(true);
		expect(errors).toEqual([]);
	});

	test(`${context} company demo returns a receipt, isolates invoices and resets`, async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(consumerOrigin);
		await page.getByRole("link", { name: "Company demo", exact: true }).click();
		await expect(
			page.getByRole("heading", { name: "Invoice PV-1042" }),
		).toBeVisible();
		const provider = await openPayment(page, context);
		await expect(provider.locator("#payment-total")).toHaveText("$176.00");
		await provider.getByRole("button", { name: "Use demo details" }).click();
		await provider
			.getByRole("button", { name: "Pay $176.00", exact: true })
			.click();
		await expect(
			page.getByRole("heading", { name: "Payment received" }),
		).toBeVisible();
		await expect(page.locator("#invoice-status")).toHaveText("Paid");
		await expect(page.locator("#invoice-summary")).toHaveText(
			"2 awaiting payment",
		);
		await expect(page.locator("#payment-dialog")).not.toBeVisible();
		await expect(page.locator("iframe")).toHaveCount(0);
		await expect(
			page.getByRole("button", {
				name: /^PV-1043 · Cleo · Sam Parker · \$154\.00 · Awaiting payment$/,
				exact: true,
			}),
		).toBeEnabled();
		if (context === "popup")
			await expect.poll(() => (provider as Page).isClosed()).toBe(true);
		await page
			.getByText("How this works with ForgeFrame", { exact: true })
			.click();
		await expect(page.locator("#integration-events")).toContainText(
			"Provider ready",
		);
		await expect(page.locator("#integration-events")).toContainText(
			"Payment approved",
		);
		await expect(page.locator("#integration-events")).toContainText(
			"Payment window closed",
		);
		await expect(page.locator("#integration-events")).not.toContainText(
			"4242 4242 4242 4242",
		);
		await page
			.getByRole("button", {
				name: /^PV-1043 · Cleo · Sam Parker · \$154\.00 · Awaiting payment$/,
				exact: true,
			})
			.click();
		await expect(
			page.getByRole("heading", { name: "Invoice PV-1043" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Take payment", exact: true }),
		).toBeEnabled();
		await page.getByRole("button", { name: "Reset demo", exact: true }).click();
		await expect(page.locator("#invoice-summary")).toHaveText(
			"3 awaiting payment",
		);
		await expect(
			page.getByRole("heading", { name: "Invoice PV-1042" }),
		).toBeVisible();
		await expect(page.locator("#integration-events")).not.toContainText(
			"Payment approved",
		);
		expect(errors).toEqual([]);
	});

	test(`${context} approval works on non-localhost HTTP origins`, async ({
		page,
		context: browserContext,
	}) => {
		await browserContext.route(
			/http:\/\/(clinic|provider)\.demo\.test\//,
			async (route) => {
				const url = new URL(route.request().url());
				const consumer = url.origin === httpConsumerOrigin;
				const files = consumer ? httpConsumerFiles : httpHostFiles;
				const key =
					consumer && ["/", "/company", "/company/"].includes(url.pathname)
						? "index.html"
						: url.pathname.slice(1);
				const file = files.get(key);
				await route.fulfill({
					status: file === undefined ? 404 : 200,
					contentType: contentType(url.pathname),
					body:
						file === undefined
							? ""
							: typeof file === "string"
								? file
								: Buffer.from(file),
				});
			},
		);
		await page.goto(`${httpConsumerOrigin}/company`);
		const provider = await openPayment(page, context);
		expect(await provider.locator("body").evaluate(() => isSecureContext)).toBe(
			false,
		);
		await provider.getByRole("button", { name: "Use demo details" }).click();
		await provider
			.getByRole("button", { name: "Pay $176.00", exact: true })
			.click();
		await expect(
			page.getByRole("heading", { name: "Payment received" }),
		).toBeVisible();
		await expect(page.locator("#invoice-status")).toHaveText("Paid");
		await expect(page.locator("#onResult-calls")).toHaveText("1 call");
		await expect(page.locator("#callback-payload")).toContainText(
			'"status": "recorded"',
		);
		await expect(page.locator("#integration-events")).toContainText(
			"Payment window closed",
		);
		if (context === "popup")
			await expect.poll(() => (provider as Page).isClosed()).toBe(true);
	});

	test(`${context} company demo declines then approves a retry without reopening`, async ({
		page,
	}) => {
		await page.goto(`${consumerOrigin}/company/`);
		await page.getByText("Demo options", { exact: true }).click();
		await page.getByLabel("Payment outcome").selectOption("decline");
		const provider = await openPayment(page, context);
		await provider.getByRole("button", { name: "Use demo details" }).click();
		await provider
			.getByRole("button", { name: "Pay $176.00", exact: true })
			.click();
		await expect(provider.locator("#payment-feedback")).toContainText(
			"declined",
		);
		await expect(page.locator("#invoice-status")).toHaveText(
			"Awaiting payment",
		);
		await expect(page.locator("#invoice-summary")).toHaveText(
			"3 awaiting payment",
		);
		await provider
			.getByRole("button", { name: "Retry payment $176.00", exact: true })
			.click();
		await expect(
			page.getByRole("heading", { name: "Payment received" }),
		).toBeVisible();
		await expect(page.locator("#integration-events")).toContainText(
			"Payment declined",
		);
		await expect(page.locator("#integration-events")).toContainText(
			"Payment approved",
		);
		await page.reload();
		await expect(page.locator("#invoice-summary")).toHaveText(
			"3 awaiting payment",
		);
	});

	test(`${context} cancellation during processing leaves the invoice unpaid and can reopen`, async ({
		page,
	}) => {
		await page.goto(`${consumerOrigin}/company`);
		const provider = await openPayment(page, context);
		await provider.getByRole("button", { name: "Use demo details" }).click();
		await provider
			.getByRole("button", { name: "Pay $176.00", exact: true })
			.click();
		await provider
			.getByRole("button", { name: "Cancel payment", exact: true })
			.click();
		await expect(page.locator("#demo-notice")).toContainText(
			"Payment cancelled",
		);
		await expect(page.locator("#step-status-3")).toHaveText("Not observed");
		await expect(page.locator("#step-status-4")).toHaveText("Observed");
		await expect(
			page.getByRole("button", { name: "Take payment", exact: true }),
		).toBeEnabled();
		const reopened = await openPayment(page, context);
		await expect(page.locator("#invoice-status")).toHaveText(
			"Awaiting payment",
		);
		await expect(
			reopened.getByRole("button", { name: "Pay $176.00", exact: true }),
		).toBeEnabled();
		await reopened
			.getByRole("button", { name: "Cancel payment", exact: true })
			.click();
		await expect(page.locator("iframe")).toHaveCount(0);
	});
}

test("mobile modal supports keyboard cancellation and keeps the portal within the viewport", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${consumerOrigin}/company`);
	const provider = await openPayment(page, "iframe");
	await provider.getByLabel("Card number", { exact: true }).press("Escape");
	await expect(page.locator("#payment-dialog")).not.toBeVisible();
	await expect(
		page.getByRole("button", { name: "Take payment", exact: true }),
	).toBeFocused();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
});

test("technical view observes real callback arguments and returns without replacing the app", async ({
	page,
}, testInfo) => {
	const reviewDir = process.env.FORGEFRAME_DEMO_REVIEW_DIR;
	if (reviewDir && testInfo.project.name === "chromium") {
		await mkdir(reviewDir, { recursive: true });
		await page.setViewportSize({ width: 1440, height: 1000 });
	}
	await page.goto(`${consumerOrigin}/company`);
	await expect(page.locator("#technical-panel")).not.toBeVisible();
	await page
		.getByRole("button", {
			name: /^PV-1043 · Cleo · Sam Parker · \$154\.00 · Awaiting payment$/,
			exact: true,
		})
		.click();
	await page.getByRole("button", { name: "Technical", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Integration workspace", exact: true }),
	).toBeVisible();
	await expect(page.locator("#live-props")).toContainText(
		'"amountCents": 15400',
	);
	await expect(page.locator("#technical-code")).toContainText(
		"instance.render",
	);
	await page.getByText("Complete application source", { exact: true }).click();
	await page.getByRole("button", { name: "Host", exact: true }).click();
	await expect(page.locator("#technical-code")).toContainText(
		"await host.ready",
	);
	await expect(page.locator("#technical-code")).toContainText(
		"await props.onResult",
	);
	await expect(page.locator("#technical-code")).toContainText("@remarks");
	await page
		.getByRole("button", { name: "Shared contract", exact: true })
		.click();
	await expect(page.locator("#technical-code")).toContainText(
		"PaymentAcknowledgement",
	);
	await page
		.getByRole("button", { name: "Merchant rules", exact: true })
		.click();
	await expect(page.locator("#technical-code")).toContainText(
		"export function commitPaymentResult",
	);
	await expect(page.locator("#technical-code")).toContainText(
		"active !== session",
	);
	await page
		.getByRole("button", { name: "Demo processor", exact: true })
		.click();
	await expect(page.locator("#technical-code")).toContainText(
		"export function shouldDeclineAttempt",
	);
	const provider = await openPayment(page, "iframe");
	await expect(page.locator("#onReady-calls")).toHaveText("1 call");
	await provider.getByRole("button", { name: "Use demo details" }).click();
	await provider
		.getByRole("button", { name: "Pay $154.00", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: "Payment received" }),
	).toBeVisible();
	await expect(page.locator("#onResult-calls")).toHaveText("1 call");
	await expect(page.locator("#callback-payload")).toContainText(
		'"status": "recorded"',
	);
	await expect(page.locator("#callback-payload")).toContainText(
		'"invoiceId": "PV-1043"',
	);
	await expect(page.locator("#callback-payload")).not.toContainText(
		"4242 4242 4242 4242",
	);
	await page.getByText("Complete application source", { exact: true }).click();
	await page
		.getByRole("button", { name: "Inspect this callback", exact: true })
		.click();
	await expect(page.locator("#step-data")).toContainText(
		'"status": "recorded"',
	);
	await expect(page.locator("#step-status-4")).toHaveText("Observed");
	await expect(page.locator("#step-code")).toContainText(
		"session.invoice.receipt = receipt;",
	);
	await expect(page.locator("#step-source-label")).toContainText(
		"acceptance.ts",
	);
	await page.locator('[data-step="4"]').click();
	await expect(page.locator("#step-code")).toContainText(
		"assertPaymentAcknowledged(",
	);
	await expect(page.locator("#step-code")).toContainText(
		"result.receipt.invoiceId",
	);
	await expect(page.locator("#step-code")).toContainText('"recorded"');
	await expect(page.locator("#step-code")).toContainText(
		"await props.close();",
	);
	if (reviewDir && testInfo.project.name === "chromium")
		await page.screenshot({
			path: resolve(reviewDir, "desktop-technical-paid.png"),
			fullPage: true,
			animations: "disabled",
		});
	await page.getByRole("button", { name: "Experience", exact: true }).click();
	await expect(page.locator("#technical-panel")).not.toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Invoice PV-1043" }),
	).toBeVisible();
	await expect(page.locator("#invoice-status")).toHaveText("Paid");
	if (reviewDir && testInfo.project.name === "chromium")
		await page.screenshot({
			path: resolve(reviewDir, "desktop-paid.png"),
			fullPage: true,
			animations: "disabled",
		});
	await page.getByRole("button", { name: "Technical", exact: true }).click();
	await expect(page.locator("#onResult-calls")).toHaveText("1 call");
	await page.getByRole("button", { name: "Experience", exact: true }).click();
	await page
		.getByRole("button", { name: "Next unpaid invoice", exact: true })
		.click();
	await expect(page.locator("#invoice-total")).toHaveText("$176.00");
	await page.getByRole("button", { name: "Technical", exact: true }).click();
	await expect(page.locator("#onResult-calls")).toHaveText("0 calls");
	await expect(page.locator("#step-data")).not.toContainText(
		'"status": "recorded"',
	);
	await page.getByRole("button", { name: "Reset demo", exact: true }).click();
	await expect(page.locator("#onResult-calls")).toHaveText("0 calls");
});

test("failed technical source gives accurate refresh recovery without blocking payment", async ({
	page,
}, testInfo) => {
	const sourceChunk = [...consumerFiles].find(
		([key, file]) =>
			key.endsWith(".js") &&
			typeof file === "string" &&
			file.includes("@packageDocumentation") &&
			file.includes("const instance = paymentComponents[context]({"),
	)?.[0];
	if (!sourceChunk) throw new Error("Missing authored consumer source chunk");
	const pattern = `**/${sourceChunk}`;
	await page.goto(`${consumerOrigin}/company`);
	await page.route(pattern, (route) => route.abort());
	await page.getByRole("button", { name: "Technical", exact: true }).click();
	await expect(page.locator("#technical-code")).toContainText(
		"Refresh this page",
	);
	await expect(page.locator("#step-code")).toContainText(
		"resets demo invoices",
	);
	const reviewDir = process.env.FORGEFRAME_DEMO_REVIEW_DIR;
	if (reviewDir && testInfo.project.name === "chromium") {
		await mkdir(reviewDir, { recursive: true });
		for (const viewport of [
			{ name: "desktop", width: 1440, height: 1000 },
			{ name: "mobile", width: 390, height: 844 },
		]) {
			await page.setViewportSize(viewport);
			await page.screenshot({
				path: resolve(reviewDir, `${viewport.name}-source-failure.png`),
				fullPage: true,
				animations: "disabled",
			});
		}
		await page.setViewportSize({ width: 1440, height: 1000 });
	}
	await page.unroute(pattern);
	await page.getByRole("button", { name: "Experience", exact: true }).click();
	const provider = await openPayment(page, "iframe");
	await provider.getByRole("button", { name: "Use demo details" }).click();
	await provider
		.getByRole("button", { name: "Pay $176.00", exact: true })
		.click();
	await expect(page.locator("#invoice-status")).toHaveText("Paid");
	await page.getByRole("button", { name: "Technical", exact: true }).click();
	await page.locator('[data-step="3"]').click();
	await expect(page.locator("#step-code")).toContainText("Refresh this page");
	await page.reload();
	await expect(page.locator("#invoice-summary")).toHaveText(
		"3 awaiting payment",
	);
	await page.getByRole("button", { name: "Technical", exact: true }).click();
	await expect(page.locator("#technical-code")).toContainText(
		"instance.render",
	);
	await expect(page.locator("#step-code")).toContainText(
		"const instance = paymentComponents[context]({",
	);
});

test("stacked views move keyboard focus between the selected invoice and technical workspace", async ({
	page,
}) => {
	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 441, height: 569 },
	]) {
		await page.setViewportSize(viewport);
		await page.goto(`${consumerOrigin}/company`);
		await page.getByText("Change invoice · 3 samples", { exact: true }).click();
		await page
			.getByRole("button", {
				name: /^PV-1043 · Cleo · Sam Parker · \$154\.00 · Awaiting payment$/,
				exact: true,
			})
			.press("Enter");
		const invoiceHeading = page.getByRole("heading", {
			name: "Invoice PV-1043",
			exact: true,
		});
		await expect(invoiceHeading).toBeFocused();
		await expect(invoiceHeading).toBeInViewport();
		await page.getByRole("button", { name: "Technical", exact: true }).click();
		const technicalHeading = page.getByRole("heading", {
			name: "Integration workspace",
			exact: true,
		});
		await expect(technicalHeading).toBeFocused();
		await expect(technicalHeading).toBeInViewport();
		await page
			.getByRole("button", { name: "Back to invoice", exact: true })
			.click();
		await expect(page.locator("#technical-panel")).not.toBeVisible();
		await expect(invoiceHeading).toBeFocused();
		await expect(invoiceHeading).toBeInViewport();
		await expect(page.locator("#invoice-total")).toHaveText("$154.00");
		await page
			.getByText("How this works with ForgeFrame", { exact: true })
			.click();
		await page
			.getByRole("button", { name: "Open technical view", exact: true })
			.click();
		await expect(technicalHeading).toBeFocused();
		await expect(technicalHeading).toBeInViewport();
	}
});

test("company demo responsive render and form validation", async ({
	page,
}, testInfo) => {
	const reviewDir = process.env.FORGEFRAME_DEMO_REVIEW_DIR;
	if (reviewDir && testInfo.project.name === "chromium")
		await mkdir(reviewDir, { recursive: true });
	for (const viewport of [
		{ name: "desktop", width: 1440, height: 1000 },
		{ name: "mobile", width: 390, height: 844 },
		{ name: "user-441", width: 441, height: 569 },
	]) {
		await page.setViewportSize(viewport);
		await page.goto(`${consumerOrigin}/company`);
		await expect(
			page.getByRole("heading", { name: "Invoice PV-1042" }),
		).toBeVisible();
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		await expect(
			page.getByRole("button", { name: "Take payment", exact: true }),
		).toBeInViewport({ ratio: 1 });
		if (reviewDir && testInfo.project.name === "chromium")
			await page.screenshot({
				path: resolve(reviewDir, `${viewport.name}.png`),
				fullPage: true,
				animations: "disabled",
			});
		const provider = await openPayment(page, "iframe");
		await expect(
			provider.getByRole("button", { name: "Use demo details", exact: true }),
		).toBeFocused();
		await expect(provider.locator("#payment-total")).toBeInViewport({
			ratio: 1,
		});
		if (reviewDir && testInfo.project.name === "chromium")
			await page.screenshot({
				path: resolve(reviewDir, `${viewport.name}-payment-landing.png`),
				animations: "disabled",
			});
		await provider
			.getByRole("button", { name: "Pay $176.00", exact: true })
			.click();
		await expect(
			provider.getByLabel("Card number", { exact: true }),
		).toBeFocused();
		await expect(page.locator("#invoice-status")).toHaveText(
			"Awaiting payment",
		);
		await provider.getByRole("button", { name: "Use demo details" }).click();
		if (reviewDir && testInfo.project.name === "chromium")
			await page.screenshot({
				path: resolve(reviewDir, `${viewport.name}-payment.png`),
				animations: "disabled",
			});
		await provider
			.getByRole("button", { name: "Cancel payment", exact: true })
			.click();
		await expect(page.locator("#payment-dialog")).not.toBeVisible();
		await page.getByRole("button", { name: "Technical", exact: true }).click();
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		if (reviewDir && testInfo.project.name === "chromium") {
			if (viewport.name !== "desktop")
				await page.screenshot({
					path: resolve(reviewDir, `${viewport.name}-technical-landing.png`),
					animations: "disabled",
				});
			await page.evaluate(() => window.scrollTo(0, 0));
			await page.screenshot({
				path: resolve(reviewDir, `${viewport.name}-technical.png`),
				fullPage: true,
				animations: "disabled",
			});
		}
	}
});
