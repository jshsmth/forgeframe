/**
 * Harbor Pay's host application, embedded by Pip Veterinary through ForgeFrame.
 *
 * @remarks
 * Form values and the simulated processor stay in this window. Callback results
 * are application data, not direct DOM access into the consumer. Initialization
 * validates the shared schema and consumer origin before any props are used.
 *
 * @packageDocumentation
 */
import { getHostProps, type HostProps, initHost } from "forgeframe";
import {
	formatMoney,
	type PaymentProps,
	type PaymentResult,
	paymentProps,
} from "../payment/contract";
import {
	approvedPaymentResult,
	assertPaymentAcknowledged,
	normalizeDemoCardNumber,
	type ReceiptEvidence,
	shouldDeclineAttempt,
} from "../payment/simulation";
import { requireValue } from "../require-value";
import "./payment.css";

const app = requireValue(document.querySelector<HTMLElement>("#payment-app"));
const consumerOrigin = new URL(
	import.meta.env.VITE_CONSUMER_URL || `${location.protocol}//localhost:5173`,
).origin;

function field<T extends HTMLElement>(selector: string): T {
	return requireValue(app.querySelector<T>(selector));
}

/**
 * Reads provider-local receipt observations for the simulated processor.
 *
 * @remarks
 * The display-only ID uses randomness available on HTTP demo origins as well as
 * HTTPS. It is neither a production payment identifier nor an authentication token.
 */
function collectReceiptEvidence(digits: string): ReceiptEvidence {
	return {
		transactionId: `HP-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, "0").toUpperCase()}`,
		paidAt: new Date().toISOString(),
		lastFour: digits.slice(-4),
	};
}

/**
 * Mounts the provider-owned form and binds its simulated payment lifecycle.
 *
 * @remarks
 * `HostProps` turns callback signatures into remote promise-returning functions.
 * Awaiting `onResult` ensures the merchant has recorded the attempt before this
 * host closes. The first valid attempt can decline; retry then approves. Card
 * fields never enter that callback, apart from the receipt's last four digits.
 */
function renderForm(props: HostProps<PaymentProps>): void {
	app.innerHTML = `<div class="payment-context"><header class="provider-header"><span class="provider-mark" aria-hidden="true">H</span><span>Harbor Pay</span><span class="provider-demo">Demo</span></header><section class="payment-summary"><h1>Pay Pip Veterinary</h1><p>Invoice <span id="payment-invoice"></span></p><strong id="payment-total"></strong><span class="payment-currency">AUD · One-off payment</span><span class="simulation-note">Simulation · No money moves</span></section></div><div class="demo-card-help"><p>Fill the form in one click. No real card is needed.</p><button type="button" id="use-demo-details" class="provider-text-button">Use demo details</button></div><form id="payment-form"><label for="cardholder">Name on card</label><input id="cardholder" name="cardholder" autocomplete="off" maxlength="80" required><label for="card-number">Card number</label><input id="card-number" name="card-number" inputmode="numeric" autocomplete="off" placeholder="4242 4242 4242 4242" maxlength="19" pattern="[0-9 ]{16,19}" required><div class="card-fields"><div><label for="card-expiry">Expiry</label><input id="card-expiry" name="card-expiry" placeholder="MM / YY" inputmode="numeric" autocomplete="off" maxlength="7" pattern="(0[1-9]|1[0-2]) ?/ ?[0-9]{2}" required></div><div><label for="card-cvc">Security code</label><input id="card-cvc" name="card-cvc" type="password" inputmode="numeric" autocomplete="off" placeholder="CVC" maxlength="4" pattern="[0-9]{3,4}" required></div></div><p id="payment-feedback" class="payment-feedback" role="status" tabindex="-1" hidden></p><div class="provider-actions"><button id="submit-payment" type="submit" class="provider-primary"></button><button id="cancel-provider-payment" type="button" class="provider-cancel">Cancel payment</button></div><p class="payment-footnote">Demo only. No charge is made and card inputs are not sent to Pip Veterinary.</p></form>`;
	field("#payment-invoice").textContent = props.invoiceId;
	field("#payment-total").textContent = formatMoney(props.amountCents);
	field<HTMLInputElement>("#cardholder").value = props.customer;
	const amount = formatMoney(props.amountCents);
	const form = field<HTMLFormElement>("#payment-form");
	const submit = field<HTMLButtonElement>("#submit-payment");
	const feedback = field("#payment-feedback");
	const demoDetails = field<HTMLButtonElement>("#use-demo-details");
	const cancel = field<HTMLButtonElement>("#cancel-provider-payment");
	const cardNumber = field<HTMLInputElement>("#card-number");
	let attempt = 0;
	let submitting = false;
	let cancelled = false;
	let approved = false;
	submit.textContent = `Pay ${amount}`;

	const close = async () => {
		cancelled = true;
		try {
			await props.close();
		} catch {
			feedback.textContent =
				"The clinic connection has ended. Close this window to return to the invoice.";
			feedback.hidden = false;
		}
	};
	cancel.addEventListener("click", () => void close());
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") void close();
	});
	demoDetails.addEventListener("click", () => {
		field<HTMLInputElement>("#cardholder").value = props.customer;
		cardNumber.value = "4242 4242 4242 4242";
		cardNumber.setCustomValidity("");
		field<HTMLInputElement>("#card-expiry").value = "12 / 30";
		field<HTMLInputElement>("#card-cvc").value = "123";
		submit.focus();
	});
	cardNumber.addEventListener("input", () => cardNumber.setCustomValidity(""));

	function showFeedback(message: string): void {
		feedback.textContent = message;
		feedback.hidden = false;
		feedback.focus();
	}

	function beginProcessing(): void {
		submitting = true;
		submit.disabled = demoDetails.disabled = true;
		for (const input of form.querySelectorAll<HTMLInputElement>("input"))
			input.readOnly = true;
		submit.textContent = "Processing demo payment…";
		feedback.hidden = true;
	}

	function finishProcessing(): void {
		submitting = false;
		submit.disabled = demoDetails.disabled = approved || cancelled;
		for (const input of form.querySelectorAll<HTMLInputElement>("input"))
			input.readOnly = approved;
		submit.textContent = approved
			? "Payment recorded"
			: `${attempt ? "Retry payment" : "Pay"} ${amount}`;
	}

	/** Confirms the submitted invoice's decline before presenting the retry guidance. */
	async function reportDecline(): Promise<void> {
		const result: PaymentResult = {
			status: "declined",
			invoiceId: props.invoiceId,
		};
		const acknowledgement = await props.onResult(result);
		assertPaymentAcknowledged(acknowledgement, result.invoiceId, "declined");
		showFeedback(
			"The demo payment was declined. No payment was taken. Try again to simulate an approval.",
		);
	}

	/** Requires a recorded acknowledgement for the submitted invoice before approval and close. */
	async function reportApproval(digits: string): Promise<void> {
		const result = approvedPaymentResult(props, collectReceiptEvidence(digits));
		const acknowledgement = await props.onResult(result);
		assertPaymentAcknowledged(
			acknowledgement,
			result.receipt.invoiceId,
			"recorded",
		);
		approved = true;
		await props.close();
	}

	/** Sequences the simulation; timing and cancellation remain in this window. */
	async function processPayment(digits: string): Promise<void> {
		beginProcessing();
		try {
			await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
			if (cancelled) return;
			attempt++;
			if (shouldDeclineAttempt(props.outcome, attempt)) await reportDecline();
			else await reportApproval(digits);
		} catch {
			showFeedback(
				approved
					? "Payment recorded. Close this window to return to the invoice."
					: "The clinic could not confirm this payment. Close the window and try again from the invoice.",
			);
		} finally {
			finishProcessing();
		}
	}

	function validateCardForm(): string | null {
		const digits = normalizeDemoCardNumber(cardNumber.value);
		cardNumber.setCustomValidity(
			digits === null
				? "Enter a 16-digit demo card number, or use demo details."
				: "",
		);
		return form.reportValidity() ? digits : null;
	}

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		if (submitting || approved || cancelled) return;
		const digits = validateCardForm();
		if (digits !== null) void processPayment(digits);
	});
}

/**
 * Initializes the trusted host channel before reading props or calling the consumer.
 *
 * @remarks
 * `initHost` returns null outside a ForgeFrame window; standalone visits receive
 * a link back to the demo. A rejected readiness promise shows connection recovery
 * guidance. `VITE_CONSUMER_URL` sets the explicit consumer-origin allowlist.
 * After readiness, built-in show/focus controls reveal the loading iframe before
 * the demo-fill shortcut receives focus without scrolling away from the amount.
 */
async function start(): Promise<void> {
	try {
		const host = initHost<PaymentProps>(paymentProps, [consumerOrigin]);
		if (!host) {
			app.replaceChildren();
			const heading = document.createElement("h1");
			heading.textContent = "Harbor Pay demo";
			const message = document.createElement("p");
			message.textContent =
				"Open a sample invoice in Pip Veterinary to start a simulated payment.";
			const link = document.createElement("a");
			link.href = `${consumerOrigin}/company`;
			link.textContent = "Open company demo";
			app.append(heading, message, link);
			return;
		}
		await host.ready;
		const props = requireValue(getHostProps<PaymentProps>());
		renderForm(props);
		await props.onReady();
		await props.show();
		await props.focus();
		field<HTMLButtonElement>("#use-demo-details").focus({
			preventScroll: true,
		});
	} catch {
		app.textContent =
			"Harbor Pay could not connect to the clinic. Close this window and try again from the invoice.";
	}
}

void start();
