/**
 * Pip Veterinary's consumer application and its real ForgeFrame integration.
 *
 * @remarks
 * The merchant owns invoices and receipts. Harbor Pay owns the payment form on
 * another origin. Experience and Technical are views of this same application;
 * the technical panel observes calls rather than implementing a second channel.
 * Only payment processing is simulated.
 *
 * @packageDocumentation
 */
import { create, type ForgeFrameComponentInstance } from "forgeframe";
import {
	type DemoOutcome,
	type DemoReceipt,
	formatMoney,
	type PaymentAcknowledgement,
	type PaymentProps,
	paymentProps,
} from "../../payment/contract";
import {
	commitPaymentResult,
	type PaymentControls,
	type PaymentSessionState,
	paymentControls,
} from "./acceptance";
import { type Invoice, invoiceTotal, seedInvoices } from "./invoices";
import {
	type IntegrationSnapshot,
	initTechnicalView,
	inspectCallback,
	loadTechnicalSources,
	recordCallback,
	recordWindowStep,
	resetTechnicalView,
	updateTechnicalView,
} from "./technical";
import { element, renderInvoices, renderShell, showNotice } from "./ui";
import "./style.css";
import "./technical.css";

renderShell();
initTechnicalView();

const providerUrl = new URL(
	"/payment.html",
	import.meta.env.VITE_HOST_URL || `${location.protocol}//localhost:5174`,
).href;
/** Defines the provider origin and schema once for each render context. */
const createPayment = (context: "iframe" | "popup") =>
	create<PaymentProps>({
		tag: `harbor-pay-${context}`,
		url: providerUrl,
		domain: new URL(providerUrl).origin,
		dimensions:
			context === "popup"
				? { width: 480, height: 740 }
				: { width: "100%", height: "100%" },
		props: paymentProps,
		attributes: { title: "Harbor Pay demo payment form" },
		style: { border: "none" },
		prerenderTemplate: ({ doc }) => {
			const loading = doc.createElement("p");
			loading.className = "payment-loading";
			loading.textContent = "Connecting to Harbor Pay…";
			loading.setAttribute("role", "status");
			return loading;
		},
		timeout: 10000,
	});
const paymentComponents = {
	iframe: createPayment("iframe"),
	popup: createPayment("popup"),
};

/** Captures the invoice identity so late results cannot affect a newer session. */
interface PaymentSession extends PaymentSessionState {
	instance: ForgeFrameComponentInstance<PaymentProps>;
	failed: boolean;
}

let invoices = seedInvoices();
let selected = invoices[0];
let active: PaymentSession | null = null;
let resetting = false;
let phase: IntegrationSnapshot["phase"] = "idle";
const dialog = element<HTMLDialogElement>("#payment-dialog");
const mode = element<HTMLSelectElement>("#payment-mode");
const outcome = element<HTMLSelectElement>("#payment-outcome");
const workspace = element("#clinic-workspace");
const events = element<HTMLOListElement>("#integration-events");
let eventCount = 0;

function refreshTechnical(): void {
	const invoice = active?.invoice ?? selected;
	updateTechnicalView({
		consumerOrigin: location.origin,
		providerOrigin: new URL(providerUrl).origin,
		context: mode.value === "popup" ? "popup" : "iframe",
		phase,
		pet: invoice.pet,
		paid: !!invoice.receipt,
		props: {
			invoiceId: invoice.id,
			amountCents: invoiceTotal(invoice),
			customer: invoice.customer,
			outcome: outcome.value,
		},
	});
}

function appendEvent(message: string): void {
	if (!eventCount) events.replaceChildren();
	const item = document.createElement("li");
	const timestamp = document.createElement("time");
	timestamp.dateTime = new Date().toISOString();
	timestamp.textContent = new Date().toLocaleTimeString("en-AU");
	item.append(timestamp, document.createTextNode(message));
	events.append(item);
	eventCount++;
	if (events.children.length > 30) events.firstElementChild?.remove();
}

function logEvent(message: string): void {
	appendEvent(message);
	refreshTechnical();
}

/** Selects merchant state and restores focus without rebuilding the integration. */
function selectInvoice(invoice: Invoice): void {
	selected = invoice;
	showNotice("");
	if (matchMedia("(max-width: 650px)").matches)
		element<HTMLDetailsElement>("#invoice-picker").open = false;
	render();
	focusRegion("#invoice-title", 650);
}

/** Applies a prepared control state; availability rules live in acceptance.ts. */
function updatePaymentControls(controls: PaymentControls): void {
	mode.disabled = outcome.disabled = controls.busy;
	element<HTMLButtonElement>("#reset-demo").disabled = resetting;
	const technicalPay = element<HTMLButtonElement>("#technical-pay");
	technicalPay.disabled = controls.busy || controls.paid;
	technicalPay.textContent = controls.paid
		? "Payment recorded"
		: controls.busy
			? "Window open…"
			: "Try this payment";
}

function render(): void {
	const controls = paymentControls(invoices, selected, !!active, resetting);
	updatePaymentControls(controls);
	const next = controls.nextInvoice;
	renderInvoices(
		invoices,
		selected,
		controls.busy,
		selectInvoice,
		() => void openPayment(),
		() => {
			setView(true);
			inspectCallback();
			focusRegion("#step-heading", 1250);
		},
		next && !controls.busy ? () => selectInvoice(next) : null,
	);
	refreshTechnical();
}

/** Presents a decline while preserving the merchant's unpaid invoice. */
function reportDecline(invoiceId: string): void {
	logEvent(`Payment declined · ${invoiceId} · invoice remains unpaid`);
}

function reportApproval(receipt: DemoReceipt): void {
	const amount = formatMoney(receipt.amountCents);
	logEvent(`Payment approved · ${receipt.transactionId} · ${amount}`);
	showNotice(
		`Payment received for ${receipt.invoiceId}. ${amount} paid via Harbor Pay.`,
	);
	render();
}

/**
 * Composes merchant acceptance, application observations and outcome presentation.
 *
 * @returns The operation's acknowledgement for ForgeFrame to deliver to the host.
 * @throws When {@link commitPaymentResult} rejects malformed, stale or mismatched callback data.
 * @remarks
 * The operation commits an approved receipt before any UI work and before this
 * integration returns. The provider awaits that return before requesting close.
 */
function acceptResult(
	session: PaymentSession,
	result: unknown,
): PaymentAcknowledgement {
	const accepted = commitPaymentResult(
		active,
		session,
		result,
		invoiceTotal(session.invoice),
	);
	phase = accepted.phase;
	recordCallback("onResult", result, accepted.acknowledgement);
	if (accepted.phase === "declined") reportDecline(session.invoice.id);
	else reportApproval(accepted.receipt);
	return accepted.acknowledgement;
}

/** Marks the session cancelled before awaiting idempotent ForgeFrame cleanup. */
async function cancelPayment(): Promise<void> {
	if (!active) return;
	active.cancelled = true;
	await active.instance.close();
}

/**
 * Opens Harbor Pay through ForgeFrame and binds the merchant's remote callbacks.
 *
 * @remarks
 * Do not insert an await before `instance.render`: popup opening must retain the
 * initiating click's user activation. The native dialog is the merchant's shell;
 * ForgeFrame owns its iframe/popup, props transport and cleanup. `close` marks
 * cancellation, while `destroy` releases the UI only after resource cleanup.
 */
async function openPayment(): Promise<void> {
	if (active || resetting || selected.receipt) return;
	const context = mode.value === "popup" ? "popup" : "iframe";
	const demoOutcome: DemoOutcome =
		outcome.value === "decline" ? "decline" : "success";
	const invoice = selected;
	const instance = paymentComponents[context]({
		invoiceId: invoice.id,
		amountCents: invoiceTotal(invoice),
		customer: invoice.customer,
		outcome: demoOutcome,
		onReady: () => {
			if (active === session) {
				phase = "ready";
				recordCallback("onReady", [], undefined);
				logEvent(`Provider ready · ${new URL(providerUrl).origin}`);
			}
		},
		onResult: (result) => acceptResult(session, result),
	});
	const session: PaymentSession = {
		instance,
		invoice,
		cancelled: false,
		failed: false,
	};
	active = session;
	phase = "opening";
	showNotice(
		context === "popup"
			? "Payment window open. Complete or cancel the payment in Harbor Pay."
			: "",
	);
	logEvent(
		`Payment opened · ${invoice.id} · ${context === "iframe" ? "modal iframe" : "popup"}`,
	);
	instance.event.on("close", () => {
		if (!invoice.receipt) session.cancelled = true;
	});
	instance.event.on("destroy", () => {
		if (active !== session) return;
		active = null;
		phase = session.failed ? "failed" : "closed";
		workspace.inert = false;
		dialog.close();
		logEvent(`Payment window closed · ${invoice.id}`);
		recordWindowStep("closed");
		if (!invoice.receipt && !session.failed)
			showNotice("Payment cancelled. The invoice is still awaiting payment.");
		render();
		(
			(document.body.classList.contains("is-technical")
				? element("#technical-heading")
				: document.querySelector<HTMLButtonElement>("#take-payment")) ??
			element("#invoice-title")
		).focus();
	});
	render();
	const mount = element(
		context === "iframe" ? "#payment-mount" : "#popup-mount",
	);
	mount.replaceChildren();
	if (context === "iframe") {
		workspace.inert = true;
		dialog.showModal();
	}
	try {
		recordWindowStep("opened");
		await instance.render(mount, context);
	} catch (error) {
		if (session.cancelled || invoice.receipt) return;
		session.failed = true;
		phase = "failed";
		await instance.close();
		if (active === session) active = null;
		workspace.inert = false;
		dialog.close();
		logEvent(
			`Payment could not open · ${error instanceof Error ? error.message : "connection failed"}`,
		);
		showNotice(
			context === "popup"
				? "Harbor Pay could not open. Allow popups or choose Modal iframe, then try again."
				: "Harbor Pay could not connect. Check the playground host is running, then try again.",
		);
		render();
	}
}

element("#close-payment").addEventListener("click", () => void cancelPayment());
dialog.addEventListener("cancel", (event) => {
	event.preventDefault();
	void cancelPayment();
});
element("#reset-demo").addEventListener("click", () => {
	void (async () => {
		resetting = true;
		render();
		await cancelPayment();
		invoices = seedInvoices();
		selected = invoices[0];
		eventCount = 0;
		events.replaceChildren();
		logEvent("Demo reset · all sample invoices restored");
		mode.value = "iframe";
		outcome.value = "success";
		phase = "idle";
		resetTechnicalView();
		showNotice("");
		resetting = false;
		render();
	})();
});

element("#origin-description").textContent =
	`Clinic: ${location.origin} · Provider: ${new URL(providerUrl).origin}`;
/** Restores focus after a region changes and reveals it when the layout stacks. */
function focusRegion(selector: string, stackedWidth: number): void {
	const heading = element(selector);
	heading.focus({ preventScroll: true });
	if (matchMedia(`(max-width: ${stackedWidth}px)`).matches)
		heading.scrollIntoView({ block: "start" });
}

/** Changes presentation only; active instances, invoices and callback history survive. */
function setView(technical: boolean): void {
	document.body.classList.toggle("is-technical", technical);
	element("#technical-panel").hidden = !technical;
	element("#technical-view").setAttribute("aria-pressed", String(technical));
	element("#experience-view").setAttribute("aria-pressed", String(!technical));
	if (technical) void loadTechnicalSources();
	if (technical && matchMedia("(max-width: 1250px)").matches)
		focusRegion("#technical-heading", 1250);
}
const invoicePickerQuery = matchMedia("(min-width: 651px)");
const syncInvoicePicker = () => {
	element<HTMLDetailsElement>("#invoice-picker").open =
		invoicePickerQuery.matches;
};
invoicePickerQuery.addEventListener("change", syncInvoicePicker);
syncInvoicePicker();
element("#technical-pay").addEventListener("click", () => void openPayment());
element("#technical-view").addEventListener("click", () => setView(true));
element("#experience-view").addEventListener("click", () => setView(false));
element("#explain-technical").addEventListener("click", () => setView(true));
element("#back-to-invoice").addEventListener("click", () => {
	setView(false);
	focusRegion("#invoice-title", 1250);
});
mode.addEventListener("change", refreshTechnical);
outcome.addEventListener("change", refreshTechnical);
render();
